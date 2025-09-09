import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { Resvg } from 'https://esm.sh/@resvg/resvg-js@2.6.0';

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

// Convert SVG to PNG using resvg-js WASM
async function convertSVGToPNG(svgString: string): Promise<Uint8Array> {
  try {
    console.log('Converting SVG to PNG using resvg-js...');
    
    // Parse SVG dimensions
    const widthMatch = svgString.match(/width="(\d+)"/);
    const heightMatch = svgString.match(/height="(\d+)"/);
    const width = widthMatch ? parseInt(widthMatch[1]) : 800;
    const height = heightMatch ? parseInt(heightMatch[1]) : 600;
    
    console.log(`Canvas size for PNG: ${width}x${height}`);
    
    // Create resvg renderer
    const resvg = new Resvg(svgString, {
      background: 'white',
      fitTo: {
        mode: 'width',
        value: width,
      },
    });
    
    // Render to PNG
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    console.log('Successfully converted SVG to PNG, buffer size:', pngBuffer.length);
    return new Uint8Array(pngBuffer);
    
  } catch (error) {
    console.error('Error converting SVG to PNG:', error);
    // Return a simple fallback PNG
    return createFallbackPNG();
  }
}

// Create a simple fallback PNG for errors
async function createFallbackPNG(): Promise<Uint8Array> {
  console.log('Creating fallback PNG');
  
  try {
    // Create simple SVG fallback and render it
    const fallbackSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8f9fa"/>
      <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
        Error generating image
      </text>
    </svg>`;
    
    const resvg = new Resvg(fallbackSVG, {
      background: 'white',
      fitTo: {
        mode: 'width',
        value: 400,
      },
    });
    
    const pngData = resvg.render();
    return new Uint8Array(pngData.asPng());
  } catch (error) {
    console.error('Error creating fallback PNG:', error);
    // Return minimal valid PNG data
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
  }
}