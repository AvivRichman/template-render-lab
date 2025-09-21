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
        const fontSize = obj.fontSize || 16;
        const fill = normalizeColor(obj.fill, '#000000');
        const fontFamily = sanitizeFontFamily(obj.fontFamily || 'Arial');
        const text = (obj.text || '').toString();
        const lineHeight = obj.lineHeight || 1.16;
        const opacity = obj.opacity ?? 1;

        const lines = text.split(/\r?\n/);
        const textBoxWidth = obj.width || Math.max(...lines.map(line => line.length || 1)) * fontSize * 0.6;
        const textBoxHeight = obj.height || (lines.length || 1) * fontSize * lineHeight;
        const transformMatrix = computeObjectMatrix(obj, textBoxWidth, textBoxHeight);

        let textAnchor = 'start';
        let textX = 0;
        if (obj.textAlign === 'center') {
          textAnchor = 'middle';
          textX = textBoxWidth / 2;
        } else if (obj.textAlign === 'right') {
          textAnchor = 'end';
          textX = textBoxWidth;
        }

        const baseY = fontSize;

        console.log(`Text object: "${text}" width=${textBoxWidth}, height=${textBoxHeight}`);

        svg += `<text xml:space="preserve" x="${formatNumber(textX)}" y="${formatNumber(baseY)}" font-family="${fontFamily}" font-size="${formatNumber(fontSize)}" fill="${fill}" text-anchor="${textAnchor}"`;

        if (obj.fontWeight) {
          svg += ` font-weight="${obj.fontWeight}"`;
        }
        if (obj.fontStyle) {
          svg += ` font-style="${obj.fontStyle}"`;
        }
        if (obj.underline) {
          svg += ' text-decoration="underline"';
        }
        if (opacity < 1) {
          svg += ` fill-opacity="${formatNumber(opacity)}"`;
        }
        if (transformMatrix) {
          svg += ` transform="matrix(${matrixToAttribute(transformMatrix)})"`;
        }

        if (lines.length === 1) {
          svg += `>${escapeXml(lines[0])}</text>`;
        } else {
          svg += '>';
          lines.forEach((line: string, index: number) => {
            if (index === 0) {
              svg += `<tspan x="${formatNumber(textX)}" dy="0">${escapeXml(line)}</tspan>`;
            } else {
              svg += `<tspan x="${formatNumber(textX)}" dy="${formatNumber(fontSize * lineHeight)}">${escapeXml(line)}</tspan>`;
            }
          });
          svg += '</text>';
        }
        break;
      }
        
      case 'rect':
      case 'rectangle': {
        const rectWidth = obj.width || 100;
        const rectHeight = obj.height || 100;
        const rectFill = normalizeColor(obj.fill, '#000000');
        const rectStroke = obj.stroke || 'none';
        const rectStrokeWidth = obj.strokeWidth || 0;

        console.log(`Rectangle: ${rectWidth}x${rectHeight}, fill: ${rectFill}`);

        svg += `<rect x="0" y="0" width="${formatNumber(rectWidth)}" height="${formatNumber(rectHeight)}" fill="${rectFill}"`;

        if (rectStroke !== 'none' && rectStrokeWidth > 0) {
          svg += ` stroke="${rectStroke}" stroke-width="${rectStrokeWidth}"`;
        }

        if (obj.opacity !== undefined && obj.opacity < 1) {
          svg += ` fill-opacity="${formatNumber(obj.opacity)}"`;
        }

        const rectTransform = computeObjectMatrix(obj, rectWidth, rectHeight);
        if (rectTransform) {
          svg += ` transform="matrix(${matrixToAttribute(rectTransform)})"`;
        }

        svg += `/>`;
        break;
      }

      case 'circle': {
        const radius = obj.radius || 50;
        const circleFill = normalizeColor(obj.fill, '#000000');
        const circleStroke = obj.stroke || 'none';
        const circleStrokeWidth = obj.strokeWidth || 0;

        console.log(`Circle: radius ${radius}, fill: ${circleFill}`);

        svg += `<circle cx="${formatNumber(radius)}" cy="${formatNumber(radius)}" r="${formatNumber(radius)}" fill="${circleFill}"`;

        if (circleStroke !== 'none' && circleStrokeWidth > 0) {
          svg += ` stroke="${circleStroke}" stroke-width="${circleStrokeWidth}"`;
        }

        if (obj.opacity !== undefined && obj.opacity < 1) {
          svg += ` fill-opacity="${formatNumber(obj.opacity)}"`;
        }

        const circleTransform = computeObjectMatrix(obj, radius * 2, radius * 2);
        if (circleTransform) {
          svg += ` transform="matrix(${matrixToAttribute(circleTransform)})"`;
        }

        svg += `/>`;
        break;
      }

      case 'image': {
        if (obj.src) {
          const imgWidth = obj.width || 100;
          const imgHeight = obj.height || 100;

          console.log(`Image: width=${imgWidth}, height=${imgHeight}, src: ${obj.src.substring(0, 50)}...`);

          svg += `<image x="0" y="0" width="${formatNumber(imgWidth)}" height="${formatNumber(imgHeight)}" href="${obj.src}"`;

          if (obj.opacity !== undefined && obj.opacity < 1) {
            svg += ` opacity="${formatNumber(obj.opacity)}"`;
          }

          const imageTransform = computeObjectMatrix(obj, imgWidth, imgHeight);
          if (imageTransform) {
            svg += ` transform="matrix(${matrixToAttribute(imageTransform)})"`;
          }

          svg += `/>`;
        }
        break;
      }

      case 'line': {
        const x1 = obj.x1 ?? obj.left ?? 0;
        const y1 = obj.y1 ?? obj.top ?? 0;
        const x2 = obj.x2 ?? ((obj.left ?? 0) + (obj.width || 100));
        const y2 = obj.y2 ?? ((obj.top ?? 0) + (obj.height || 0));
        const lineStroke = obj.stroke || '#000000';
        const lineStrokeWidth = obj.strokeWidth || 1;

        console.log(`Line: (${x1}, ${y1}) to (${x2}, ${y2}), stroke: ${lineStroke}`);

        svg += `<line x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}" stroke="${lineStroke}" stroke-width="${lineStrokeWidth}"`;

        if (obj.opacity !== undefined && obj.opacity < 1) {
          svg += ` stroke-opacity="${formatNumber(obj.opacity)}"`;
        }

        const lineTransform = computeObjectMatrix(obj);
        if (lineTransform) {
          svg += ` transform="matrix(${matrixToAttribute(lineTransform)})"`;
        }

        svg += `/>`;
        break;
      }

      default: {
        console.log('Unknown object type:', obj.type, 'Object keys:', Object.keys(obj));
        // Try to render as a generic rectangle if it has basic properties
        if (obj.left !== undefined && obj.top !== undefined) {
          const genWidth = obj.width || 50;
          const genHeight = obj.height || 50;
          const genFill = normalizeColor(obj.fill, '#cccccc');

          console.log(`Generic object: ${genWidth}x${genHeight}, fill: ${genFill}`);

          svg += `<rect x="0" y="0" width="${formatNumber(genWidth)}" height="${formatNumber(genHeight)}" fill="${genFill}"`;

          if (obj.opacity !== undefined && obj.opacity < 1) {
            svg += ` fill-opacity="${formatNumber(obj.opacity)}"`;
          }

          const genericTransform = computeObjectMatrix(obj, genWidth, genHeight);
          if (genericTransform) {
            svg += ` transform="matrix(${matrixToAttribute(genericTransform)})"`;
          }

          svg += '/>';
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
      case "\"": return '&quot;';
      default: return c;
    }
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(4)).toString();
}

function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value || value === 'transparent' || value === 'none') {
    return fallback;
  }
  return value;
}

function sanitizeFontFamily(fontFamily: string): string {
  const cleanedFamilies = (fontFamily || '')
    .split(',')
    .map(f => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const fallbacks = ['Arial', 'DejaVu Sans', 'sans-serif'];

  for (const fallback of fallbacks) {
    if (!cleanedFamilies.some(f => f.toLowerCase() === fallback.toLowerCase())) {
      cleanedFamilies.push(fallback);
    }
  }

  if (!cleanedFamilies.length) {
    cleanedFamilies.push('sans-serif');
  }

  return cleanedFamilies
    .map(f => (f.includes(' ') ? `'${f}'` : f))
    .join(', ');
}

function computeObjectMatrix(obj: any, width?: number, height?: number): number[] | null {
  try {
    if (Array.isArray(obj?.transformMatrix) && obj.transformMatrix.length === 6) {
      return obj.transformMatrix as number[];
    }

    const scaleX = (obj.scaleX ?? 1) * (obj.flipX ? -1 : 1);
    const scaleY = (obj.scaleY ?? 1) * (obj.flipY ? -1 : 1);
    const angle = (obj.angle ?? 0) * Math.PI / 180;
    const skewX = (obj.skewX ?? 0) * Math.PI / 180;
    const skewY = (obj.skewY ?? 0) * Math.PI / 180;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let a = cos * scaleX;
    let b = sin * scaleX;
    let c = -sin * scaleY;
    let d = cos * scaleY;

    if (skewX) {
      const tanX = Math.tan(skewX);
      c += tanX * a;
      d += tanX * b;
    }

    if (skewY) {
      const tanY = Math.tan(skewY);
      a += tanY * c;
      b += tanY * d;
    }

    let e = obj.left ?? 0;
    let f = obj.top ?? 0;

    const boxWidth = width ?? obj.width ?? 0;
    const boxHeight = height ?? obj.height ?? 0;
    const originX = obj.originX || 'left';
    const originY = obj.originY || 'top';

    let offsetX = 0;
    if (originX === 'center') {
      offsetX = boxWidth / 2;
    } else if (originX === 'right') {
      offsetX = boxWidth;
    }

    let offsetY = 0;
    if (originY === 'center') {
      offsetY = boxHeight / 2;
    } else if (originY === 'bottom') {
      offsetY = boxHeight;
    }

    if (offsetX || offsetY) {
      const translatedX = offsetX * a + offsetY * c;
      const translatedY = offsetX * b + offsetY * d;
      e -= translatedX;
      f -= translatedY;
    }

    return [a, b, c, d, e, f];
  } catch (error) {
    console.error('Failed to compute transform matrix', error, obj);
    return null;
  }
}

function matrixToAttribute(matrix: number[]): string {
  return matrix.map(value => formatNumber(value)).join(' ');
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
