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
    console.log('🚀 Render function - Request received');
    
    const { template_id, scene_data, user_id } = await req.json();
    
    if (!template_id || !scene_data || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📋 Rendering template:', template_id);
    console.log('📊 Scene data structure:', JSON.stringify(scene_data, null, 2));
    console.log('🔢 Objects count:', scene_data.objects?.length || 0);
    
    // Log each object to understand the structure
    if (scene_data.objects) {
      scene_data.objects.forEach((obj, index) => {
        console.log(`🔍 Object ${index}:`, {
          type: obj.type,
          text: obj.text,
          left: obj.left,
          top: obj.top,
          fill: obj.fill,
          fontSize: obj.fontSize,
          hasText: !!obj.text,
          keys: Object.keys(obj)
        });
      });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🎨 Generating image...');
    
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
      console.error('❌ Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    console.log('✅ SVG uploaded, now converting to PNG...');
    
    // Call svg-to-png-renderer function to convert SVG to PNG
    const pngResponse = await supabase.functions.invoke('svg-to-png-renderer', {
      body: {
        bucket: 'api-renders',
        key: imagePath
      }
    });

    if (pngResponse.error) {
      console.error('❌ PNG conversion error:', pngResponse.error);
      throw new Error(`Failed to convert SVG to PNG: ${pngResponse.error.message}`);
    }

    const pngImageUrl = pngResponse.data.png_url;
    console.log('🎉 Generated PNG image URL:', pngImageUrl);

    return new Response(JSON.stringify({
      success: true,
      image_url: pngImageUrl,
      template_id,
      generation_time: '1.2s',
      message: 'Image rendered successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in render function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate SVG from scene data and return it as bytes for upload
async function generateImageFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('=== 🎨 SVG GENERATION START ===');
    console.log('📊 Scene data received for rendering');
    console.log('🔢 Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`📐 Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create SVG with proper structure and styles
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>
    text { 
      font-family: Arial, Helvetica, sans-serif; 
      font-weight: bold;
      text-anchor: start;
      dominant-baseline: text-before-edge;
    }
  </style>
</defs>
<rect width="100%" height="100%" fill="${backgroundColor}"/>`;
    
    // Separate objects into layers: images first, then text on top
    const imageObjects = [];
    const shapeObjects = [];
    const textObjects = [];
    
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      sceneData.objects.forEach((obj, index) => {
        const objectType = obj.type?.toLowerCase();
        const hasText = obj.text && obj.text.trim() !== '';
        
        console.log(`🏷️ Categorizing object ${index}: type="${objectType}", hasText=${hasText}, text="${obj.text}"`);
        
        if (hasText || objectType === 'text') {
          textObjects.push({ obj, index });
          console.log(`📝 Added to textObjects: object ${index} with text "${obj.text}"`);
        } else if (objectType === 'image') {
          imageObjects.push({ obj, index });
          console.log(`🖼️ Added to imageObjects: object ${index}`);
        } else {
          shapeObjects.push({ obj, index });
          console.log(`🔷 Added to shapeObjects: object ${index} type "${objectType}"`);
        }
      });
    }
    
    console.log(`📊 Final categorization: ${imageObjects.length} images, ${shapeObjects.length} shapes, ${textObjects.length} texts`);
    console.log(`🔍 Text objects details:`, textObjects.map(t => ({ index: t.index, text: t.obj.text, type: t.obj.type })));
    
    // Render images first (background layer)
    imageObjects.forEach(({ obj, index }) => {
      console.log(`🖼️ Processing image object ${index}`);
      const objectSVG = renderObjectToSVG(obj);
      if (objectSVG) {
        svg += objectSVG;
        console.log(`✅ Added image SVG for object ${index}`);
      }
    });
    
    // Render shapes second (middle layer)
    shapeObjects.forEach(({ obj, index }) => {
      console.log(`🔷 Processing shape object ${index}`);
      const objectSVG = renderObjectToSVG(obj);
      if (objectSVG) {
        svg += objectSVG;
        console.log(`✅ Added shape SVG for object ${index}`);
      }
    });
    
    // Render text last (top layer) - this ensures text appears on top
    console.log(`📝 Starting text rendering phase with ${textObjects.length} text objects...`);
    textObjects.forEach(({ obj, index }) => {
      console.log(`🎯 Processing text object ${index}:`, {
        text: obj.text,
        left: obj.left,
        top: obj.top,
        fill: obj.fill,
        fontSize: obj.fontSize,
        type: obj.type
      });
      const objectSVG = renderObjectToSVG(obj);
      if (objectSVG) {
        svg += objectSVG;
        console.log(`✅ Successfully added text SVG for object ${index}: "${obj.text}"`);
        console.log(`📄 Text SVG content: ${objectSVG}`);
      } else {
        console.log(`❌ Failed to generate SVG for text object ${index}: "${obj.text}"`);
      }
    });
    
    svg += '</svg>';
    
    console.log('📏 Generated SVG length:', svg.length);
    console.log('=== 📄 COMPLETE SVG OUTPUT (first 1000 chars) ===');
    console.log(svg.substring(0, 1000));
    console.log('=== 🎨 SVG GENERATION END ===');
    
    // Return the SVG as bytes
    return new TextEncoder().encode(svg);
    
  } catch (error) {
    console.error('💥 Error generating image from scene data:', error);
    return createFallbackSVG();
  }
}

// Render a Fabric.js object to SVG
function renderObjectToSVG(obj: any): string {
  let svg = '';
  
  try {
    const objectType = obj.type?.toLowerCase();
    const hasText = obj.text && obj.text.trim() !== '';
    
    console.log(`🔍 renderObjectToSVG called with: type="${objectType}", hasText=${hasText}, text="${obj.text}"`);
    
    // Handle text objects - check multiple conditions
    if (hasText || objectType === 'text' || obj.type === 'Text') {
      console.log('🎯 TEXT RENDERING CONDITION MET!');
      console.log('📝 Text content:', obj.text);
      
      const x = obj.left || 0;
      const y = obj.top || 0;
      const fontSize = Math.max(obj.fontSize || 24, 12);
      const fill = obj.fill || '#000000';
      const text = obj.text || '';
      const fontFamily = obj.fontFamily || 'Arial, sans-serif';
      
      console.log(`📋 Text rendering params: "${text}" at (${x}, ${y}), size: ${fontSize}px, fill: ${fill}, family: ${fontFamily}`);
      
      // Create a highly visible text element with contrasting stroke
      const strokeColor = fill === '#ffffff' || fill === 'white' || fill === '#fff' ? '#000000' : '#ffffff';
      const textSvg = `<text x="${x}" y="${y + fontSize}" style="font-family: ${fontFamily}; font-size: ${fontSize}px; fill: ${fill}; font-weight: bold; stroke: ${strokeColor}; stroke-width: 1; paint-order: stroke fill;">${escapeXml(text)}</text>`;
      
      console.log(`✅ Generated text SVG: ${textSvg}`);
      console.log('=== 📝 TEXT RENDERING END ===');
      
      return textSvg;
    }
    
    // Handle images
    if (objectType === 'image' && obj.src) {
      console.log('🖼️ Processing image object');
      const imgX = obj.left || 0;
      const imgY = obj.top || 0;
      const imgWidth = (obj.width || 100) * (obj.scaleX || 1);
      const imgHeight = (obj.height || 100) * (obj.scaleY || 1);
      
      console.log(`📐 Image: (${imgX}, ${imgY}) ${imgWidth}x${imgHeight}, src: ${obj.src.substring(0, 50)}...`);
      
      // Handle base64 data URL images
      if (obj.src.startsWith('data:image/')) {
        svg += `<image x="${imgX}" y="${imgY}" width="${imgWidth}" height="${imgHeight}" href="${obj.src}"`;
        
        if (obj.angle) {
          const centerX = imgX + imgWidth / 2;
          const centerY = imgY + imgHeight / 2;
          svg += ` transform="rotate(${obj.angle} ${centerX} ${centerY})"`;
        }
        
        svg += `/>`;
        
        console.log(`✅ Added image to SVG at (${imgX}, ${imgY})`);
      }
      
      return svg;
    }
    
    // Handle other shapes
    console.log(`🔷 Processing shape object: ${objectType}`);
    switch (objectType) {
      case 'rect':
      case 'rectangle':
        const rectX = obj.left || 0;
        const rectY = obj.top || 0;
        const rectWidth = (obj.width || 100) * (obj.scaleX || 1);
        const rectHeight = (obj.height || 100) * (obj.scaleY || 1);
        const rectFill = obj.fill || '#000000';
        const rectStroke = obj.stroke || 'none';
        const rectStrokeWidth = obj.strokeWidth || 0;
        
        console.log(`📐 Rectangle: (${rectX}, ${rectY}) ${rectWidth}x${rectHeight}, fill: ${rectFill}`);
        
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
        
        console.log(`⭕ Circle: center (${circleX}, ${circleY}), radius: ${radius}, fill: ${circleFill}`);
        
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
  } catch (error) {
    console.error('❌ Error rendering object to SVG:', error, 'Object:', obj);
  }
  
  console.log(`🔄 renderObjectToSVG returning: "${svg}" (length: ${svg.length})`);
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
  console.log('🆘 Creating fallback SVG');
  
  const fallbackSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8f9fa"/>
    <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
      Error generating image
    </text>
  </svg>`;
  
  return new TextEncoder().encode(fallbackSVG);
}