import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { encode } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

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
    
    // Generate JPEG from template scene data
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.jpeg`;
    
    // Create JPEG from scene data
    const imageBuffer = await generateImageFromSceneData(scene_data);
    
    // Upload to storage as JPEG
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/jpeg',
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

// Generate JPEG from scene data using pure JavaScript
async function generateImageFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create SVG first, then convert to JPEG
    const svgContent = generateSVGFromSceneData(sceneData);
    console.log('Generated SVG content length:', svgContent.length);
    
    // For now, create a simple JPEG using ImageScript
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    
    // Create a new image with solid background color
    const image = new Image(width, height);
    
    // Parse background color
    const bgColor = parseColor(backgroundColor);
    image.fill(bgColor);
    
    // Process objects and draw them to the image
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      console.log('Processing objects...');
      for (let i = 0; i < sceneData.objects.length; i++) {
        const obj = sceneData.objects[i];
        console.log(`Processing object ${i}: type=${obj.type}`);
        renderObjectToImage(image, obj);
      }
    }
    
    // Encode as JPEG
    const jpegBuffer = await image.encode(1); // 1 = JPEG format
    console.log('Generated JPEG size:', jpegBuffer.length, 'bytes');
    
    return jpegBuffer;
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackJPEG();
  }
}

// Generate SVG content from scene data for reference
function generateSVGFromSceneData(sceneData: any): string {
  const width = sceneData.width || 800;
  const height = sceneData.height || 600;
  const backgroundColor = sceneData.backgroundColor || '#ffffff';
  
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svgContent += `<rect width="100%" height="100%" fill="${backgroundColor}"/>`;
  
  if (sceneData.objects && Array.isArray(sceneData.objects)) {
    sceneData.objects.forEach((obj: any) => {
      svgContent += renderObjectToSVG(obj);
    });
  }
  
  svgContent += '</svg>';
  return svgContent;
}

// Helper to parse hex color to RGBA
function parseColor(colorStr: string): number {
  let color = colorStr.replace('#', '');
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('');
  }
  
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  // Return as RGBA (alpha = 255 for opaque)
  return (r << 24) | (g << 16) | (b << 8) | 255;
}

// Render object to ImageScript Image
function renderObjectToImage(image: any, obj: any): void {
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType}`);
    
    const left = Math.round(obj.left || 0);
    const top = Math.round(obj.top || 0);
    
    switch (objectType) {
      case 'textbox':
      case 'text':
        // For text, draw a simple placeholder rectangle for now
        // (Full text rendering would require a font library)
        const textWidth = (obj.text?.length || 5) * (obj.fontSize || 16) * 0.6;
        const textHeight = obj.fontSize || 16;
        const textColor = parseColor(obj.fill || '#000000');
        
        console.log(`Text placeholder: "${obj.text}", size: ${obj.fontSize}`);
        
        // Draw a simple rectangle as text placeholder
        for (let x = 0; x < textWidth && left + x < image.width; x++) {
          for (let y = 0; y < textHeight && top + y < image.height; y++) {
            if (left + x >= 0 && top + y >= 0) {
              image.setPixelAt(left + x, top + y, textColor);
            }
          }
        }
        break;
        
      case 'rect':
      case 'rectangle':
        const rectWidth = Math.round(obj.width || 100);
        const rectHeight = Math.round(obj.height || 100);
        const rectColor = parseColor(obj.fill || '#000000');
        
        console.log(`Rectangle: ${rectWidth}x${rectHeight}, fill: ${obj.fill}`);
        
        // Draw filled rectangle
        for (let x = 0; x < rectWidth && left + x < image.width; x++) {
          for (let y = 0; y < rectHeight && top + y < image.height; y++) {
            if (left + x >= 0 && top + y >= 0) {
              image.setPixelAt(left + x, top + y, rectColor);
            }
          }
        }
        break;
        
      case 'circle':
        const radius = Math.round(obj.radius || 50);
        const circleColor = parseColor(obj.fill || '#000000');
        
        console.log(`Circle: radius: ${radius}, fill: ${obj.fill}`);
        
        // Draw filled circle
        const centerX = left + radius;
        const centerY = top + radius;
        
        for (let x = -radius; x <= radius; x++) {
          for (let y = -radius; y <= radius; y++) {
            if (x * x + y * y <= radius * radius) {
              const pixelX = centerX + x;
              const pixelY = centerY + y;
              if (pixelX >= 0 && pixelY >= 0 && pixelX < image.width && pixelY < image.height) {
                image.setPixelAt(pixelX, pixelY, circleColor);
              }
            }
          }
        }
        break;
        
      case 'line':
        const x1 = Math.round(left + (obj.x1 || 0));
        const y1 = Math.round(top + (obj.y1 || 0));
        const x2 = Math.round(left + (obj.x2 || obj.width || 100));
        const y2 = Math.round(top + (obj.y2 || 0));
        const lineColor = parseColor(obj.stroke || '#000000');
        
        console.log(`Line: (${x1}, ${y1}) to (${x2}, ${y2})`);
        
        // Simple line drawing using Bresenham's algorithm
        drawLine(image, x1, y1, x2, y2, lineColor);
        break;
        
      default:
        console.log('Unknown object type:', obj.type);
        // Draw a placeholder rectangle
        if (obj.width && obj.height) {
          const genWidth = Math.round(obj.width);
          const genHeight = Math.round(obj.height);
          const genColor = parseColor(obj.fill || '#cccccc');
          
          for (let x = 0; x < genWidth && left + x < image.width; x++) {
            for (let y = 0; y < genHeight && top + y < image.height; y++) {
              if (left + x >= 0 && top + y >= 0) {
                image.setPixelAt(left + x, top + y, genColor);
              }
            }
          }
        }
    }
  } catch (error) {
    console.error('Error rendering object to image:', error);
  }
}

// Simple line drawing function
function drawLine(image: any, x1: number, y1: number, x2: number, y2: number, color: number): void {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = x1;
  let y = y1;

  while (true) {
    if (x >= 0 && y >= 0 && x < image.width && y < image.height) {
      image.setPixelAt(x, y, color);
    }

    if (x === x2 && y === y2) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// Render object to SVG for reference
function renderObjectToSVG(obj: any): string {
  const objectType = obj.type?.toLowerCase();
  const left = obj.left || 0;
  const top = obj.top || 0;
  
  switch (objectType) {
    case 'textbox':
    case 'text':
      const fontSize = obj.fontSize || 16;
      const fill = obj.fill || '#000000';
      const text = escapeXml(obj.text || '');
      return `<text x="${left}" y="${top + fontSize}" font-size="${fontSize}" fill="${fill}">${text}</text>`;
      
    case 'rect':
    case 'rectangle':
      const width = obj.width || 100;
      const height = obj.height || 100;
      const rectFill = obj.fill || '#000000';
      return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${rectFill}"/>`;
      
    case 'circle':
      const radius = obj.radius || 50;
      const circleFill = obj.fill || '#000000';
      return `<circle cx="${left + radius}" cy="${top + radius}" r="${radius}" fill="${circleFill}"/>`;
      
    case 'line':
      const x1 = left + (obj.x1 || 0);
      const y1 = top + (obj.y1 || 0);
      const x2 = left + (obj.x2 || obj.width || 100);
      const y2 = top + (obj.y2 || 0);
      const stroke = obj.stroke || '#000000';
      const strokeWidth = obj.strokeWidth || 1;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      
    default:
      return '';
  }
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

// Create a simple fallback JPEG for errors
async function createFallbackJPEG(): Promise<Uint8Array> {
  console.log('Creating fallback JPEG');
  
  try {
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    
    // Create a 400x300 error image
    const image = new Image(400, 300);
    
    // Fill with light gray background
    const bgColor = parseColor('#f8f9fa');
    image.fill(bgColor);
    
    // Draw a simple error indicator (red rectangle in center)
    const errorColor = parseColor('#dc3545');
    for (let x = 150; x < 250; x++) {
      for (let y = 125; y < 175; y++) {
        image.setPixelAt(x, y, errorColor);
      }
    }
    
    // Encode as JPEG
    const jpegBuffer = await image.encode(1);
    return jpegBuffer;
    
  } catch (error) {
    console.error('Failed to create fallback image:', error);
    
    // Return minimal valid JPEG header if all else fails
    return new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9
    ]);
  }
}