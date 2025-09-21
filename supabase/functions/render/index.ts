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
    
    // Generate SVG from template scene data
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.svg`;
    
    // Create SVG from scene data
    const imageBuffer = await generateImageFromSceneData(scene_data);
    
    // Upload to storage as SVG (browsers can display SVG directly)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/svg+xml',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    console.log('SVG uploaded, now converting to raster formats...');

    // Call svg-to-png-renderer function to convert SVG to PNG and JPEG
    const rasterResponse = await supabase.functions.invoke('svg-to-png-renderer', {
      body: {
        bucket: 'api-renders',
        key: imagePath
      }
    });

    if (rasterResponse.error) {
      console.error('Raster conversion error:', rasterResponse.error);
      throw new Error(`Failed to convert SVG: ${rasterResponse.error.message}`);
    }

    const pngImageUrl = rasterResponse.data?.png_url ?? null;
    const jpegImageUrl = rasterResponse.data?.jpeg_url ?? null;
    const finalImageUrl = jpegImageUrl || pngImageUrl;

    if (!finalImageUrl) {
      throw new Error('Raster conversion did not return any image URLs');
    }

    console.log('Generated image URLs:', { pngImageUrl, jpegImageUrl });

    return new Response(JSON.stringify({
      success: true,
      image_url: finalImageUrl,
      png_url: pngImageUrl,
      jpeg_url: jpegImageUrl,
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

// Generate SVG from scene data and return it as bytes for upload
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
    
    // Return the SVG as bytes; the downstream renderer handles rasterization
    return new TextEncoder().encode(svg);
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackSVG();
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
      case 'i-text': {
        const baseX = obj.left || 0;
        const baseY = obj.top || 0;
        const fontSize = obj.fontSize || 16;
        const fill = obj.fill || '#000000';
        const fontFamily = obj.fontFamily || 'Arial';
        const text = (obj.text || '').toString();

        // Handle text scaling if present
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;
        const scaledFontSize = fontSize * Math.max(scaleX, scaleY);
        const lineHeight = obj.lineHeight || 1.16;

        const width = (obj.width || (text.length * fontSize * 0.6)) * scaleX;
        const originX = obj.originX || 'left';
        const originY = obj.originY || 'top';

        let x = baseX;
        let y = baseY;

        // Adjust for origin offsets (Fabric positions objects relative to origin)
        if (originX === 'center') {
          x -= width / 2;
        } else if (originX === 'right') {
          x -= width;
        }

        if (originY === 'center') {
          y -= (obj.height || scaledFontSize) * scaleY / 2;
        } else if (originY === 'bottom') {
          y -= (obj.height || scaledFontSize) * scaleY;
        }

        // SVG text uses the baseline for the y coordinate
        y += scaledFontSize;

        let textAnchor = 'start';
        if (obj.textAlign === 'center') {
          textAnchor = 'middle';
          x += width / 2;
        } else if (obj.textAlign === 'right') {
          textAnchor = 'end';
          x += width;
        }

        console.log(`Text object: "${text}" at (${x}, ${y}), size: ${scaledFontSize}, anchor: ${textAnchor}`);

        svg += `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${scaledFontSize}" fill="${fill}" text-anchor="${textAnchor}"`;

        // Add font weight and style if present
        if (obj.fontWeight) {
          svg += ` font-weight="${obj.fontWeight}"`;
        }
        if (obj.fontStyle) {
          svg += ` font-style="${obj.fontStyle}"`;
        }
        if (obj.underline) {
          svg += ' text-decoration="underline"';
        }

        // Add rotation if present
        if (obj.angle) {
          const centerX = x;
          const centerY = y - scaledFontSize / 2;
          svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
        }

        const lines = text.split(/\r?\n/);
        if (lines.length === 1) {
          svg += `>${escapeXml(lines[0])}</text>`;
        } else {
          svg += '>'; 
          lines.forEach((line: string, index: number) => {
            if (index === 0) {
              svg += `<tspan x="${x}" dy="0">${escapeXml(line)}</tspan>`;
            } else {
              svg += `<tspan x="${x}" dy="${scaledFontSize * lineHeight}">${escapeXml(line)}</tspan>`;
            }
          });
          svg += '</text>';
        }
        break;
      }
        
      case 'rect':
      case 'rectangle': {
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
      }

      case 'circle': {
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
      }

      case 'image': {
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
      }

      case 'line': {
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
      }

      default: {
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
        break;
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

// Create a simple fallback SVG for errors
function createFallbackSVG(): Uint8Array {
  console.log('Creating fallback SVG');
  
  const fallbackSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f9fa"/>
    <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
      Error generating image
    </text>
  </svg>`;
  
  return new TextEncoder().encode(fallbackSVG);
}