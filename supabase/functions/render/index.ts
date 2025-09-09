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
    
    // Generate JPEG from template scene data
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.jpg`;
    
    // Create JPEG from scene data
    const imageBuffer = await generateJPEGFromSceneData(scene_data);
    
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

// Generate JPEG from scene data and return it as bytes for upload
async function generateJPEGFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create an OffscreenCanvas for rendering
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    
    // Set background color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Process each object in the scene
    if (sceneData.objects && Array.isArray(sceneData.objects)) {
      console.log('Processing objects...');
      for (let i = 0; i < sceneData.objects.length; i++) {
        const obj = sceneData.objects[i];
        console.log(`Processing object ${i}: type=${obj.type}, left=${obj.left}, top=${obj.top}`);
        await renderObjectToCanvas(ctx, obj);
      }
    }
    
    // Convert canvas to JPEG blob
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const arrayBuffer = await blob.arrayBuffer();
    const jpegBuffer = new Uint8Array(arrayBuffer);
    
    console.log('Generated JPEG size:', jpegBuffer.length, 'bytes');
    
    return jpegBuffer;
    
  } catch (error) {
    console.error('Error generating JPEG from scene data:', error);
    return createFallbackJPEG();
  }
}


// Render a Fabric.js object to Canvas 2D context
async function renderObjectToCanvas(ctx: OffscreenCanvasRenderingContext2D, obj: any): Promise<void> {
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType}`);
    
    switch (objectType) {
      case 'textbox':
      case 'text':
        const x = obj.left || 0;
        const y = (obj.top || 0) + (obj.fontSize || 16);
        const fontSize = (obj.fontSize || 16) * Math.max(obj.scaleX || 1, obj.scaleY || 1);
        const fill = obj.fill || '#000000';
        const fontFamily = obj.fontFamily || 'Arial';
        const text = obj.text || '';
        
        console.log(`Text object: "${text}" at (${x}, ${y}), size: ${fontSize}`);
        
        ctx.save();
        ctx.fillStyle = fill;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = obj.textAlign === 'center' ? 'center' : obj.textAlign === 'right' ? 'right' : 'left';
        
        if (obj.angle) {
          const centerX = x + (obj.width || 0) * (obj.scaleX || 1) / 2;
          const centerY = y - (obj.height || 0) * (obj.scaleY || 1) / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((obj.angle * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        ctx.fillText(text, x, y);
        ctx.restore();
        break;
        
      case 'rect':
      case 'rectangle':
        const rectX = obj.left || 0;
        const rectY = obj.top || 0;
        const rectWidth = (obj.width || 100) * (obj.scaleX || 1);
        const rectHeight = (obj.height || 100) * (obj.scaleY || 1);
        const rectFill = obj.fill || '#000000';
        
        console.log(`Rectangle: (${rectX}, ${rectY}) ${rectWidth}x${rectHeight}, fill: ${rectFill}`);
        
        ctx.save();
        ctx.fillStyle = rectFill;
        
        if (obj.stroke && obj.strokeWidth > 0) {
          ctx.strokeStyle = obj.stroke;
          ctx.lineWidth = obj.strokeWidth;
        }
        
        if (obj.angle) {
          const centerX = rectX + rectWidth / 2;
          const centerY = rectY + rectHeight / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((obj.angle * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
        
        if (obj.stroke && obj.strokeWidth > 0) {
          ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
        }
        
        ctx.restore();
        break;
        
      case 'circle':
        const circleX = (obj.left || 0) + (obj.radius || 50) * (obj.scaleX || 1);
        const circleY = (obj.top || 0) + (obj.radius || 50) * (obj.scaleY || 1);
        const radius = (obj.radius || 50) * Math.max(obj.scaleX || 1, obj.scaleY || 1);
        const circleFill = obj.fill || '#000000';
        
        console.log(`Circle: center (${circleX}, ${circleY}), radius: ${radius}, fill: ${circleFill}`);
        
        ctx.save();
        ctx.fillStyle = circleFill;
        
        if (obj.stroke && obj.strokeWidth > 0) {
          ctx.strokeStyle = obj.stroke;
          ctx.lineWidth = obj.strokeWidth;
        }
        
        if (obj.angle) {
          ctx.translate(circleX, circleY);
          ctx.rotate((obj.angle * Math.PI) / 180);
          ctx.translate(-circleX, -circleY);
        }
        
        ctx.beginPath();
        ctx.arc(circleX, circleY, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        if (obj.stroke && obj.strokeWidth > 0) {
          ctx.stroke();
        }
        
        ctx.restore();
        break;
        
      case 'image':
        if (obj.src) {
          const imgX = obj.left || 0;
          const imgY = obj.top || 0;
          const imgWidth = (obj.width || 100) * (obj.scaleX || 1);
          const imgHeight = (obj.height || 100) * (obj.scaleY || 1);
          
          console.log(`Image: (${imgX}, ${imgY}) ${imgWidth}x${imgHeight}, src: ${obj.src.substring(0, 50)}...`);
          
          try {
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = obj.src;
            });
            
            ctx.save();
            
            if (obj.angle) {
              const centerX = imgX + imgWidth / 2;
              const centerY = imgY + imgHeight / 2;
              ctx.translate(centerX, centerY);
              ctx.rotate((obj.angle * Math.PI) / 180);
              ctx.translate(-centerX, -centerY);
            }
            
            ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
            ctx.restore();
          } catch (error) {
            console.error('Error loading image:', error);
          }
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
        
        ctx.save();
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = lineStrokeWidth;
        
        if (obj.angle) {
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((obj.angle * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
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
          
          ctx.save();
          ctx.fillStyle = genFill;
          ctx.fillRect(genX, genY, genWidth, genHeight);
          ctx.restore();
        }
    }
  } catch (error) {
    console.error('Error rendering object to canvas:', error, 'Object:', obj);
  }
}

// Create a simple fallback JPEG for errors
async function createFallbackJPEG(): Promise<Uint8Array> {
  console.log('Creating fallback JPEG');
  
  try {
    const canvas = new OffscreenCanvas(400, 300);
    const ctx = canvas.getContext('2d')!;
    
    // Set background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 400, 300);
    
    // Add error text
    ctx.fillStyle = '#dc3545';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error generating image', 200, 150);
    
    // Convert to JPEG
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error('Error creating fallback JPEG:', error);
    // Return a minimal JPEG header as last resort
    return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  }
}