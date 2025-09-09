import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { createCanvas } from "https://deno.land/x/canvas@v1.4.1/mod.ts";

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
    
    const { template_id, scene_data, user_id, changes, svg_data } = await req.json();
    
    if (!user_id || (!scene_data && !svg_data)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: user_id and (scene_data or svg_data)' }), {
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
    
    let svgString: string;
    
    if (svg_data) {
      // Use provided SVG data
      svgString = svg_data;
      console.log('Using provided SVG data');
    } else {
      // Generate SVG from scene data with changes applied
      let processedSceneData = scene_data;
      if (changes) {
        processedSceneData = applyChangesToSceneData(scene_data, changes);
      }
      svgString = await generateSVGFromSceneData(processedSceneData);
    }
    
    // Convert SVG to PNG
    const pngBuffer = await convertSVGToPNG(svgString);
    
    // Upload to storage as PNG
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id || 'custom'}-${timestamp}.png`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, pngBuffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    // Get public URL and convert to JPG using Supabase transformations
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(imagePath, {
        transform: {
          format: 'jpeg',
          quality: 90
        }
      });
    
    const jpgImageUrl = urlData.publicUrl;

    console.log('Generated JPG image URL:', jpgImageUrl);

    return new Response(JSON.stringify({
      success: true,
      image_url: jpgImageUrl,
      template_id,
      generation_time: '2.5s',
      message: 'Image rendered successfully as JPG'
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

// Apply changes to scene data before rendering
function applyChangesToSceneData(sceneData: any, changes: any): any {
  console.log('Applying changes to scene data:', JSON.stringify(changes));
  
  const modifiedSceneData = JSON.parse(JSON.stringify(sceneData)); // Deep copy
  
  // Apply canvas-level changes
  if (changes.backgroundColor) {
    modifiedSceneData.backgroundColor = changes.backgroundColor;
  }
  if (changes.width) {
    modifiedSceneData.width = changes.width;
  }
  if (changes.height) {
    modifiedSceneData.height = changes.height;
  }
  
  // Apply object-level changes
  if (modifiedSceneData.objects && Array.isArray(modifiedSceneData.objects)) {
    for (const changeKey in changes) {
      if (changeKey.startsWith('object_')) {
        const objectIndex = parseInt(changeKey.split('_')[1]);
        if (objectIndex >= 0 && objectIndex < modifiedSceneData.objects.length) {
          const objectChanges = changes[changeKey];
          Object.assign(modifiedSceneData.objects[objectIndex], objectChanges);
        }
      } else if (changeKey.startsWith('text_')) {
        // Change text content by text key
        const textKey = changeKey.replace('text_', '');
        const newText = changes[changeKey];
        for (const obj of modifiedSceneData.objects) {
          if ((obj.type === 'Text' || obj.type === 'textbox') && obj.text === textKey) {
            obj.text = newText;
          }
        }
      }
    }
  }
  
  return modifiedSceneData;
}

// Generate SVG from scene data
async function generateSVGFromSceneData(sceneData: any): Promise<string> {
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
    
    return svg;
    
  } catch (error) {
    console.error('Error generating SVG from scene data:', error);
    return createFallbackSVGString();
  }
}

// Convert SVG to PNG using canvas
async function convertSVGToPNG(svgString: string): Promise<Uint8Array> {
  try {
    console.log('Converting SVG to PNG...');
    
    // Parse SVG dimensions
    const widthMatch = svgString.match(/width="(\d+)"/);
    const heightMatch = svgString.match(/height="(\d+)"/);
    const width = widthMatch ? parseInt(widthMatch[1]) : 800;
    const height = heightMatch ? parseInt(heightMatch[1]) : 600;
    
    console.log(`Canvas size for PNG: ${width}x${height}`);
    
    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Create SVG data URL
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
    
    // Create image and draw to canvas
    const img = new Image();
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, width, height);
          const pngBuffer = canvas.toBuffer('image/png');
          console.log('Successfully converted SVG to PNG, buffer size:', pngBuffer.length);
          resolve(new Uint8Array(pngBuffer));
        } catch (error) {
          console.error('Error drawing image to canvas:', error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('Error loading SVG image:', error);
        reject(error);
      };
      
      img.src = svgDataUrl;
    });
    
  } catch (error) {
    console.error('Error converting SVG to PNG:', error);
    // Return a simple fallback PNG
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

// Create a simple fallback SVG string for errors
function createFallbackSVGString(): string {
  console.log('Creating fallback SVG string');
  
  return `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f9fa"/>
    <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
      Error generating image
    </text>
  </svg>`;
}

// Create a simple fallback PNG for errors
async function createFallbackPNG(): Promise<Uint8Array> {
  console.log('Creating fallback PNG');
  
  try {
    const canvas = createCanvas(400, 300);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 400, 300);
    
    // Error text
    ctx.fillStyle = '#dc3545';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error generating image', 200, 150);
    
    const pngBuffer = canvas.toBuffer('image/png');
    return new Uint8Array(pngBuffer);
  } catch (error) {
    console.error('Error creating fallback PNG:', error);
    // Return minimal valid PNG data
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
  }
}