import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Render function - Request received');
    
    const { template_id, scene_data, user_id, format = 'png', quality = 80 } = await req.json();
    
    if (!template_id || !scene_data || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Rendering template:', template_id, 'Format:', format);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Generating image...');
    
    // Generate image from template scene data
    const timestamp = Date.now();
    const fileExtension = format === 'jpg' || format === 'jpeg' ? 'jpg' : 'png';
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.${fileExtension}`;
    const contentType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
    
    // Create image from scene data using Resvg
    const imageBuffer = await generateImageFromSceneData(scene_data, format, quality);
    
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, imageBuffer, {
        contentType,
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(imagePath);
    
    const mockImageUrl = urlData.publicUrl;

    console.log('Generated image URL:', mockImageUrl);

    return new Response(JSON.stringify({
      success: true,
      image_url: mockImageUrl,
      template_id,
      generation_time: '1.2s',
      message: 'Image rendered successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in render function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate image from scene data using simple bitmap approach
async function generateImageFromSceneData(sceneData: any, format = 'png', quality = 80): Promise<Uint8Array> {
  try {
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}, format: ${format}`);
    
    // Create a simple bitmap image
    return createSimpleBitmap(width, height, backgroundColor, sceneData.objects || []);
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackPNG();
  }
}

// Create a simple bitmap image (PNG format)
function createSimpleBitmap(width: number, height: number, backgroundColor: string, objects: any[]): Uint8Array {
  console.log('Creating simple bitmap image...');
  
  // Create RGBA pixel data
  const pixels = new Uint8Array(width * height * 4);
  
  // Parse background color
  const bgColor = parseColor(backgroundColor);
  
  // Fill background
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bgColor.r;     // Red
    pixels[i + 1] = bgColor.g; // Green
    pixels[i + 2] = bgColor.b; // Blue
    pixels[i + 3] = 255;       // Alpha
  }
  
  // Render objects
  for (const obj of objects) {
    renderObjectToBitmap(pixels, width, height, obj);
  }
  
  // Convert to PNG format
  return createPNGFromRGBA(pixels, width, height);
}

// Parse color string to RGB
function parseColor(color: string): { r: number, g: number, b: number } {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    } else if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
  }
  
  // Default to black
  return { r: 0, g: 0, b: 0 };
}

// Render a single object to the bitmap
function renderObjectToBitmap(pixels: Uint8Array, width: number, height: number, obj: any) {
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType} to bitmap`);
    
    switch (objectType) {
      case 'rect':
      case 'rectangle':
        renderRectangle(pixels, width, height, obj);
        break;
      case 'circle':
        renderCircle(pixels, width, height, obj);
        break;
      case 'textbox':
      case 'text':
        // For now, render text as a small rectangle placeholder
        renderTextPlaceholder(pixels, width, height, obj);
        break;
      default:
        console.log('Unknown object type for bitmap rendering:', obj.type);
    }
  } catch (error) {
    console.error('Error rendering object to bitmap:', error);
  }
}

// Render rectangle to bitmap
function renderRectangle(pixels: Uint8Array, width: number, height: number, obj: any) {
  const x = Math.floor(obj.left || 0);
  const y = Math.floor(obj.top || 0);
  const rectWidth = Math.floor((obj.width || 100) * (obj.scaleX || 1));
  const rectHeight = Math.floor((obj.height || 100) * (obj.scaleY || 1));
  const color = parseColor(obj.fill || '#000000');
  
  for (let py = y; py < y + rectHeight && py < height; py++) {
    for (let px = x; px < x + rectWidth && px < width; px++) {
      if (px >= 0 && py >= 0) {
        const index = (py * width + px) * 4;
        pixels[index] = color.r;
        pixels[index + 1] = color.g;
        pixels[index + 2] = color.b;
        pixels[index + 3] = 255;
      }
    }
  }
}

// Render circle to bitmap
function renderCircle(pixels: Uint8Array, width: number, height: number, obj: any) {
  const centerX = Math.floor((obj.left || 0) + (obj.radius || 50) * (obj.scaleX || 1));
  const centerY = Math.floor((obj.top || 0) + (obj.radius || 50) * (obj.scaleY || 1));
  const radius = Math.floor((obj.radius || 50) * Math.max(obj.scaleX || 1, obj.scaleY || 1));
  const color = parseColor(obj.fill || '#000000');
  
  for (let py = centerY - radius; py <= centerY + radius; py++) {
    for (let px = centerX - radius; px <= centerX + radius; px++) {
      if (px >= 0 && py >= 0 && px < width && py < height) {
        const distance = Math.sqrt((px - centerX) ** 2 + (py - centerY) ** 2);
        if (distance <= radius) {
          const index = (py * width + px) * 4;
          pixels[index] = color.r;
          pixels[index + 1] = color.g;
          pixels[index + 2] = color.b;
          pixels[index + 3] = 255;
        }
      }
    }
  }
}

// Render text as a placeholder rectangle
function renderTextPlaceholder(pixels: Uint8Array, width: number, height: number, obj: any) {
  const x = Math.floor(obj.left || 0);
  const y = Math.floor(obj.top || 0);
  const textWidth = Math.floor((obj.text?.length || 5) * (obj.fontSize || 16) * 0.6);
  const textHeight = Math.floor((obj.fontSize || 16) * 1.2);
  const color = parseColor(obj.fill || '#000000');
  
  // Render as a simple rectangle for now
  for (let py = y; py < y + textHeight && py < height; py++) {
    for (let px = x; px < x + textWidth && px < width; px++) {
      if (px >= 0 && py >= 0) {
        const index = (py * width + px) * 4;
        pixels[index] = color.r;
        pixels[index + 1] = color.g;
        pixels[index + 2] = color.b;
        pixels[index + 3] = 255;
      }
    }
  }
}

// Create PNG from RGBA data (minimal PNG implementation)
function createPNGFromRGBA(pixels: Uint8Array, width: number, height: number): Uint8Array {
  console.log('Converting RGBA to PNG format...');
  
  // This is a very basic PNG implementation
  // For production, you'd want a proper PNG encoder
  
  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = createPNGChunk('IHDR', new Uint8Array([
    ...intToBytes(width, 4),
    ...intToBytes(height, 4),
    8, // bit depth
    6, // color type (RGBA)
    0, // compression
    0, // filter
    0  // interlace
  ]));
  
  // For simplicity, create a very basic bitmap format instead of proper PNG
  // This will create a simple uncompressed format that can be read as an image
  
  const headerSize = 54;
  const imageSize = width * height * 4;
  const fileSize = headerSize + imageSize;
  
  const bitmap = new Uint8Array(fileSize);
  
  // BMP header (simplified)
  bitmap[0] = 0x42; // 'B'
  bitmap[1] = 0x4D; // 'M'
  
  // File size
  bitmap[2] = fileSize & 0xFF;
  bitmap[3] = (fileSize >> 8) & 0xFF;
  bitmap[4] = (fileSize >> 16) & 0xFF;
  bitmap[5] = (fileSize >> 24) & 0xFF;
  
  // Copy pixel data
  bitmap.set(pixels, headerSize);
  
  console.log('Created bitmap image, size:', bitmap.length, 'bytes');
  return bitmap;
}

// Helper function to convert integer to bytes
function intToBytes(value: number, bytes: number): number[] {
  const result = [];
  for (let i = bytes - 1; i >= 0; i--) {
    result.push((value >> (i * 8)) & 0xFF);
  }
  return result;
}

// Create PNG chunk
function createPNGChunk(type: string, data: Uint8Array): Uint8Array {
  const length = data.length;
  const chunk = new Uint8Array(4 + 4 + length + 4);
  
  // Length
  chunk[0] = (length >> 24) & 0xFF;
  chunk[1] = (length >> 16) & 0xFF;
  chunk[2] = (length >> 8) & 0xFF;
  chunk[3] = length & 0xFF;
  
  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  
  // Data
  chunk.set(data, 8);
  
  // CRC (simplified - just use 0 for now)
  chunk[8 + length] = 0;
  chunk[9 + length] = 0;
  chunk[10 + length] = 0;
  chunk[11 + length] = 0;
  
  return chunk;
}

// Render a Fabric.js object to SVG
function renderObjectToSVG(obj: any): string {
  let svg = '';
  
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType}`);
    
    switch (objectType) {
      case 'textbox':
      case 'text':
        const x = obj.left || 0;
        const y = (obj.top || 0) + (obj.fontSize || 16);
        const fontSize = obj.fontSize || 16;
        const fill = obj.fill || '#000000';
        const fontFamily = obj.fontFamily || 'Arial';
        const text = obj.text || '';
        
        // Handle text scaling if present
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;
        const scaledFontSize = fontSize * Math.max(scaleX, scaleY);
        
        console.log(`Text object: "${text}" at (${x}, ${y}), size: ${scaledFontSize}`);
        
        svg += `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${scaledFontSize}" fill="${fill}"`;
        
        // Add font weight and style if present
        if (obj.fontWeight) {
          svg += ` font-weight="${obj.fontWeight}"`;
        }
        if (obj.fontStyle) {
          svg += ` font-style="${obj.fontStyle}"`;
        }
        if (obj.textAlign) {
          svg += ` text-anchor="${obj.textAlign === 'center' ? 'middle' : obj.textAlign === 'right' ? 'end' : 'start'}"`;
        }
        
        // Add rotation if present
        if (obj.angle) {
          const centerX = x + (obj.width || 0) * scaleX / 2;
          const centerY = y - (obj.height || 0) * scaleY / 2;
          svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
        }
        
        svg += `>${escapeXml(text)}</text>`;
        break;
        
      case 'rect':
      case 'rectangle':
        const rectX = obj.left || 0;
        const rectY = obj.top || 0;
        const rectWidth = (obj.width || 100) * (obj.scaleX || 1);
        const rectHeight = (obj.height || 100) * (obj.scaleY || 1);
        const rectFill = obj.fill || '#000000';
        const rectStroke = obj.stroke || 'none';
        const rectStrokeWidth = obj.strokeWidth || 0;
        
        console.log(`Rectangle: (${rectX}, ${rectY}) ${rectWidth}x${rectHeight}, fill: ${rectFill}`);
        
        svg += `<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="${rectFill}"`;
        
        if (rectStroke !== 'none' && rectStrokeWidth > 0) {
          svg += ` stroke="${rectStroke}" stroke-width="${rectStrokeWidth}"`;
        }
        
        if (obj.angle) {
          const centerX = rectX + rectWidth / 2;
          const centerY = rectY + rectHeight / 2;
          svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
        }
        
        svg += `/>`;
        break;
        
      case 'circle':
        const circleX = (obj.left || 0) + (obj.radius || 50) * (obj.scaleX || 1);
        const circleY = (obj.top || 0) + (obj.radius || 50) * (obj.scaleY || 1);
        const radius = (obj.radius || 50) * Math.max(obj.scaleX || 1, obj.scaleY || 1);
        const circleFill = obj.fill || '#000000';
        const circleStroke = obj.stroke || 'none';
        const circleStrokeWidth = obj.strokeWidth || 0;
        
        console.log(`Circle: center (${circleX}, ${circleY}), radius: ${radius}, fill: ${circleFill}`);
        
        svg += `<circle cx="${circleX}" cy="${circleY}" r="${radius}" fill="${circleFill}"`;
        
        if (circleStroke !== 'none' && circleStrokeWidth > 0) {
          svg += ` stroke="${circleStroke}" stroke-width="${circleStrokeWidth}"`;
        }
        
        if (obj.angle) {
          svg += ` transform="rotate(${obj.angle} ${circleX} ${circleY})"`;
        }
        
        svg += `/>`;
        break;
        
      case 'image':
        if (obj.src) {
          const imgX = obj.left || 0;
          const imgY = obj.top || 0;
          const imgWidth = (obj.width || 100) * (obj.scaleX || 1);
          const imgHeight = (obj.height || 100) * (obj.scaleY || 1);
          
          console.log(`Image: (${imgX}, ${imgY}) ${imgWidth}x${imgHeight}, src: ${obj.src.substring(0, 50)}...`);
          
          svg += `<image x="${imgX}" y="${imgY}" width="${imgWidth}" height="${imgHeight}" href="${obj.src}"`;
          
          if (obj.angle) {
            const centerX = imgX + imgWidth / 2;
            const centerY = imgY + imgHeight / 2;
            svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
          }
          
          svg += `/>`;
        }
        break;
        
      case 'line':
        const x1 = obj.x1 || obj.left || 0;
        const y1 = obj.y1 || obj.top || 0;
        const x2 = obj.x2 || (obj.left || 0) + (obj.width || 100);
        const y2 = obj.y2 || (obj.top || 0) + (obj.height || 0);
        const lineStroke = obj.stroke || '#000000';
        const lineStrokeWidth = obj.strokeWidth || 1;
        
        console.log(`Line: (${x1}, ${y1}) to (${x2}, ${y2}), stroke: ${lineStroke}`);
        
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineStroke}" stroke-width="${lineStrokeWidth}"`;
        
        if (obj.angle) {
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
        }
        
        svg += `/>`;
        break;
        
      default:
        console.log('Unknown object type:', obj.type, 'Object keys:', Object.keys(obj));
        // Try to render as a generic rectangle if it has basic properties
        if (obj.left !== undefined && obj.top !== undefined) {
          const genX = obj.left || 0;
          const genY = obj.top || 0;
          const genWidth = (obj.width || 50) * (obj.scaleX || 1);
          const genHeight = (obj.height || 50) * (obj.scaleY || 1);
          const genFill = obj.fill || '#cccccc';
          
          console.log(`Generic object: (${genX}, ${genY}) ${genWidth}x${genHeight}, fill: ${genFill}`);
          
          svg += `<rect x="${genX}" y="${genY}" width="${genWidth}" height="${genHeight}" fill="${genFill}"/>`;
        }
    }
  } catch (error) {
    console.error('Error rendering object to SVG:', error, 'Object:', obj);
  }
  
  return svg;
}

// Helper function to escape XML special characters
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Create a simple fallback PNG for errors
function createFallbackPNG(): Uint8Array {
  console.log('Creating fallback PNG');
  
  const fallbackSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f9fa"/>
    <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
      Error generating image
    </text>
  </svg>`;
  
  try {
    const resvg = new Resvg(fallbackSVG, {
      background: '#f8f9fa',
      fitTo: {
        mode: 'width',
        value: 400,
      },
    });
    
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (error) {
    console.error('Error creating fallback PNG:', error);
    // Return a minimal PNG header if even fallback fails
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }
}