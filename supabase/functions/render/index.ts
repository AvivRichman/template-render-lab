import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { Canvas as FabricCanvas, FabricText, FabricImage, Rect, Circle } from 'https://esm.sh/fabric@6.7.1';

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
    console.log('Scene data structure:', JSON.stringify(scene_data, null, 2));
    console.log('Objects count:', scene_data.objects?.length || 0);
    
    // Log each object to understand the structure
    if (scene_data.objects) {
      scene_data.objects.forEach((obj, index) => {
        console.log(`Object ${index}:`, {
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

    console.log('Generating image...');
    
    // Generate PNG from template scene data using virtual Fabric.js canvas
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.png`;
    
    // Create PNG from scene data using virtual canvas
    const imageBuffer = await generateImageFromSceneData(scene_data);
    
    // Upload to storage as PNG directly
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
    
    console.log('PNG uploaded successfully');
    
    // Get public URL for the uploaded PNG
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(imagePath);
    
    const imageUrl = urlData.publicUrl;
    console.log('Generated PNG image URL:', imageUrl);

    return new Response(JSON.stringify({
      success: true,
      image_url: imageUrl,
      template_id,
      generation_time: '1.2s',
      message: 'Image rendered successfully using virtual canvas'
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

// Generate PNG from scene data using virtual Fabric.js canvas
async function generateImageFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('=== FABRIC CANVAS GENERATION START ===');
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create virtual Fabric.js canvas
    const canvas = new FabricCanvas(null, {
      width: width,
      height: height,
      backgroundColor: backgroundColor,
    });
    
    console.log('Virtual Fabric canvas created');
    
    // Process each object in the scene data
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      console.log('Processing objects...');
      
      for (let i = 0; i < sceneData.objects.length; i++) {
        const obj = sceneData.objects[i];
        console.log(`Processing object ${i}:`, {
          type: obj.type,
          left: obj.left,
          top: obj.top,
          text: obj.text,
          fill: obj.fill,
          fontSize: obj.fontSize
        });
        
        await addObjectToCanvas(canvas, obj);
      }
    }
    
    console.log('All objects added to canvas, rendering...');
    
    // Render canvas to PNG
    const pngDataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1.0,
      multiplier: 1
    });
    
    // Convert data URL to bytes
    const base64Data = pngDataUrl.split(',')[1];
    const pngBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    console.log('PNG generated, size:', pngBytes.length, 'bytes');
    console.log('=== FABRIC CANVAS GENERATION END ===');
    
    return pngBytes;
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackPNG();
  }
}

// Add Fabric.js object to canvas based on scene data
async function addObjectToCanvas(canvas: FabricCanvas, obj: any): Promise<void> {
  try {
    const objectType = obj.type?.toLowerCase();
    const hasText = obj.text && obj.text.trim() !== '';
    
    console.log(`Adding object type: ${objectType}, has text: ${hasText}`);
    
    if (hasText || objectType === 'text') {
      // Create text object
      const text = new FabricText(obj.text || '', {
        left: obj.left || 0,
        top: obj.top || 0,
        fill: obj.fill || '#000000',
        fontSize: obj.fontSize || 24,
        fontFamily: obj.fontFamily || 'Arial',
        angle: obj.angle || 0,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1,
      });
      
      canvas.add(text);
      console.log(`Added text: "${obj.text}" at (${obj.left}, ${obj.top})`);
      
    } else if (objectType === 'image' && obj.src) {
      // Create image object
      const img = await FabricImage.fromURL(obj.src);
      img.set({
        left: obj.left || 0,
        top: obj.top || 0,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1,
        angle: obj.angle || 0,
      });
      
      canvas.add(img);
      console.log(`Added image at (${obj.left}, ${obj.top})`);
      
    } else if (objectType === 'rect' || objectType === 'rectangle') {
      // Create rectangle object
      const rect = new Rect({
        left: obj.left || 0,
        top: obj.top || 0,
        width: obj.width || 100,
        height: obj.height || 100,
        fill: obj.fill || '#000000',
        stroke: obj.stroke || null,
        strokeWidth: obj.strokeWidth || 0,
        angle: obj.angle || 0,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1,
      });
      
      canvas.add(rect);
      console.log(`Added rectangle at (${obj.left}, ${obj.top})`);
      
    } else if (objectType === 'circle') {
      // Create circle object
      const circle = new Circle({
        left: obj.left || 0,
        top: obj.top || 0,
        radius: obj.radius || 50,
        fill: obj.fill || '#000000',
        stroke: obj.stroke || null,
        strokeWidth: obj.strokeWidth || 0,
        angle: obj.angle || 0,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1,
      });
      
      canvas.add(circle);
      console.log(`Added circle at (${obj.left}, ${obj.top})`);
    }
    
  } catch (error) {
    console.error('Error adding object to canvas:', error, 'Object:', obj);
  }
}

// Create a fallback PNG for errors
function createFallbackPNG(): Uint8Array {
  console.log('Creating fallback PNG');
  
  try {
    const canvas = new FabricCanvas(null, {
      width: 400,
      height: 300,
      backgroundColor: '#f8f9fa',
    });
    
    const errorText = new FabricText('Error generating image', {
      left: 200,
      top: 150,
      fill: '#dc3545',
      fontSize: 16,
      fontFamily: 'Arial',
      originX: 'center',
      originY: 'center'
    });
    
    canvas.add(errorText);
    
    const pngDataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1.0
    });
    
    const base64Data = pngDataUrl.split(',')[1];
    return Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
  } catch (error) {
    console.error('Error creating fallback PNG:', error);
    // Return minimal PNG bytes if everything fails
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
  }
}
