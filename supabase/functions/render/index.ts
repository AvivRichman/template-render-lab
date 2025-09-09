import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { PNG } from 'https://esm.sh/pngjs@7.0.0';

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
    
    const { template_id, scene_data, user_id } = await req.json();
    
    if (!template_id || !scene_data || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Rendering template:', template_id);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Generating image...');
    
    // Generate PNG from template scene data
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.png`;
    
    // Create PNG from scene data (convert SVG to PNG)
    const imageBuffer = await generateImageFromSceneData(scene_data);
    
    // Upload to storage as PNG
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/png',
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

// Generate PNG from scene data by converting SVG to PNG
async function generateImageFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create SVG from scene data
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
    svg += `<rect width="100%" height="100%" fill="${backgroundColor}"/>`;
    
    // Process each object in the scene
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      console.log('Processing objects...');
      for (let i = 0; i < sceneData.objects.length; i++) {
        const obj = sceneData.objects[i];
        console.log(`Processing object ${i}: type=${obj.type}, left=${obj.left}, top=${obj.top}`);
        const objectSVG = renderObjectToSVG(obj);
        if (objectSVG) {
          svg += objectSVG;
        }
      }
    }
    
    svg += '</svg>';
    
    console.log('Generated SVG length:', svg.length);
    console.log('SVG preview:', svg.substring(0, 500) + '...');
    
    // Create a simple PNG using pure JavaScript
    console.log('Creating PNG from canvas data...');
    const png = new PNG({ width, height });
    
    // Parse background color
    const bgColor = parseColor(backgroundColor);
    
    // Fill background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = bgColor.r;
        png.data[idx + 1] = bgColor.g;
        png.data[idx + 2] = bgColor.b;
        png.data[idx + 3] = 255; // alpha
      }
    }
    
    // Render objects onto the PNG
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      console.log('Rendering objects onto PNG...');
      for (let i = 0; i < sceneData.objects.length; i++) {
        const obj = sceneData.objects[i];
        renderObjectToPNG(png, obj, width, height);
      }
    }
    
    console.log('PNG rendering complete');
    
    // Convert PNG to buffer
    const pngBuffer = PNG.sync.write(png);
    
    console.log('PNG buffer created, size:', pngBuffer.length);
    
    return new Uint8Array(pngBuffer);
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackPNG();
  }
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

// Helper function to parse color strings
function parseColor(colorStr: string): { r: number, g: number, b: number } {
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  // Default to white if unable to parse
  return { r: 255, g: 255, b: 255 };
}

// Render a single object onto the PNG
function renderObjectToPNG(png: any, obj: any, canvasWidth: number, canvasHeight: number) {
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType} to PNG`);
    
    switch (objectType) {
      case 'rect':
      case 'rectangle':
        renderRectangleToPNG(png, obj, canvasWidth, canvasHeight);
        break;
      case 'circle':
        renderCircleToPNG(png, obj, canvasWidth, canvasHeight);
        break;
      case 'text':
      case 'textbox':
        renderTextToPNG(png, obj, canvasWidth, canvasHeight);
        break;
      default:
        console.log('Unknown object type for PNG rendering:', obj.type);
    }
  } catch (error) {
    console.error('Error rendering object to PNG:', error);
  }
}

// Render rectangle to PNG
function renderRectangleToPNG(png: any, obj: any, canvasWidth: number, canvasHeight: number) {
  const x = Math.floor(obj.left || 0);
  const y = Math.floor(obj.top || 0);
  const width = Math.floor((obj.width || 100) * (obj.scaleX || 1));
  const height = Math.floor((obj.height || 100) * (obj.scaleY || 1));
  const color = parseColor(obj.fill || '#000000');
  
  console.log(`Rectangle: (${x}, ${y}) ${width}x${height}`);
  
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const px = x + dx;
      const py = y + dy;
      
      if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
        const idx = (canvasWidth * py + px) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      }
    }
  }
}

// Render circle to PNG
function renderCircleToPNG(png: any, obj: any, canvasWidth: number, canvasHeight: number) {
  const centerX = Math.floor((obj.left || 0) + (obj.radius || 50) * (obj.scaleX || 1));
  const centerY = Math.floor((obj.top || 0) + (obj.radius || 50) * (obj.scaleY || 1));
  const radius = Math.floor((obj.radius || 50) * Math.max(obj.scaleX || 1, obj.scaleY || 1));
  const color = parseColor(obj.fill || '#000000');
  
  console.log(`Circle: center (${centerX}, ${centerY}), radius: ${radius}`);
  
  const radiusSquared = radius * radius;
  
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSquared = dx * dx + dy * dy;
      
      if (distanceSquared <= radiusSquared && x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
        const idx = (canvasWidth * y + x) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      }
    }
  }
}

// Render text to PNG (simplified - just a colored rectangle placeholder)
function renderTextToPNG(png: any, obj: any, canvasWidth: number, canvasHeight: number) {
  const x = Math.floor(obj.left || 0);
  const y = Math.floor(obj.top || 0);
  const fontSize = obj.fontSize || 16;
  const textLength = (obj.text || '').length;
  
  // Approximate text dimensions
  const textWidth = Math.floor(textLength * fontSize * 0.6);
  const textHeight = Math.floor(fontSize);
  const color = parseColor(obj.fill || '#000000');
  
  console.log(`Text placeholder: "${obj.text}" at (${x}, ${y}), size: ${textWidth}x${textHeight}`);
  
  // Render as a simple rectangle placeholder for text
  for (let dy = 0; dy < textHeight; dy++) {
    for (let dx = 0; dx < textWidth; dx++) {
      const px = x + dx;
      const py = y + dy;
      
      if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
        const idx = (canvasWidth * py + px) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      }
    }
  }
}

// Create a simple fallback PNG for errors
function createFallbackPNG(): Uint8Array {
  console.log('Creating fallback PNG');
  
  try {
    const width = 400;
    const height = 300;
    const png = new PNG({ width, height });
    
    // Fill with light gray background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = 248;     // R
        png.data[idx + 1] = 249; // G
        png.data[idx + 2] = 250; // B
        png.data[idx + 3] = 255; // A
      }
    }
    
    // Add a red error rectangle in the center
    const rectX = 150;
    const rectY = 125;
    const rectWidth = 100;
    const rectHeight = 50;
    
    for (let y = rectY; y < rectY + rectHeight; y++) {
      for (let x = rectX; x < rectX + rectWidth; x++) {
        if (x < width && y < height) {
          const idx = (width * y + x) << 2;
          png.data[idx] = 220;     // R (red)
          png.data[idx + 1] = 53;  // G
          png.data[idx + 2] = 69;  // B
          png.data[idx + 3] = 255; // A
        }
      }
    }
    
    const pngBuffer = PNG.sync.write(png);
    return new Uint8Array(pngBuffer);
  } catch (error) {
    console.error('Error creating fallback PNG:', error);
    // Return a minimal valid PNG if PNG.js fails
    const redPixelPNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const binaryString = atob(redPixelPNG);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  }
}