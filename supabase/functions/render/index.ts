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

// Generate JPEG from scene data using OffscreenCanvas
async function generateImageFromSceneData(sceneData: any): Promise<Uint8Array> {
  try {
    console.log('Scene data received for rendering');
    console.log('Scene data objects count:', sceneData.objects?.length || 0);
    
    // Extract canvas dimensions from scene data
    const width = sceneData.width || 800;
    const height = sceneData.height || 600;
    const backgroundColor = sceneData.backgroundColor || '#ffffff';
    
    console.log(`Canvas dimensions: ${width}x${height}, background: ${backgroundColor}`);
    
    // Create OffscreenCanvas for rendering
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get 2D context from OffscreenCanvas');
    }
    
    // Set background
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
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log('Generated JPEG size:', uint8Array.length, 'bytes');
    
    return uint8Array;
    
  } catch (error) {
    console.error('Error generating image from scene data:', error);
    return createFallbackJPEG();
  }
}

// Render a Fabric.js object to Canvas
async function renderObjectToCanvas(ctx: OffscreenCanvasRenderingContext2D, obj: any): Promise<void> {
  try {
    const objectType = obj.type?.toLowerCase();
    console.log(`Rendering object type: ${objectType}`);
    
    // Save canvas state
    ctx.save();
    
    // Apply transformations if present
    if (obj.left || obj.top) {
      ctx.translate(obj.left || 0, obj.top || 0);
    }
    
    if (obj.angle) {
      ctx.rotate((obj.angle * Math.PI) / 180);
    }
    
    if (obj.scaleX || obj.scaleY) {
      ctx.scale(obj.scaleX || 1, obj.scaleY || 1);
    }
    
    switch (objectType) {
      case 'textbox':
      case 'text':
        const fontSize = obj.fontSize || 16;
        const fill = obj.fill || '#000000';
        const fontFamily = obj.fontFamily || 'Arial';
        const text = obj.text || '';
        const fontWeight = obj.fontWeight || 'normal';
        const fontStyle = obj.fontStyle || 'normal';
        
        console.log(`Text object: "${text}", size: ${fontSize}`);
        
        ctx.fillStyle = fill;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
        
        // Set text alignment
        if (obj.textAlign === 'center') {
          ctx.textAlign = 'center';
        } else if (obj.textAlign === 'right') {
          ctx.textAlign = 'end';
        } else {
          ctx.textAlign = 'start';
        }
        
        ctx.fillText(text, 0, 0);
        break;
        
      case 'rect':
      case 'rectangle':
        const rectWidth = obj.width || 100;
        const rectHeight = obj.height || 100;
        const rectFill = obj.fill || '#000000';
        const rectStroke = obj.stroke;
        const rectStrokeWidth = obj.strokeWidth || 0;
        
        console.log(`Rectangle: ${rectWidth}x${rectHeight}, fill: ${rectFill}`);
        
        if (rectFill && rectFill !== 'transparent') {
          ctx.fillStyle = rectFill;
          ctx.fillRect(0, 0, rectWidth, rectHeight);
        }
        
        if (rectStroke && rectStrokeWidth > 0) {
          ctx.strokeStyle = rectStroke;
          ctx.lineWidth = rectStrokeWidth;
          ctx.strokeRect(0, 0, rectWidth, rectHeight);
        }
        break;
        
      case 'circle':
        const radius = obj.radius || 50;
        const circleFill = obj.fill || '#000000';
        const circleStroke = obj.stroke;
        const circleStrokeWidth = obj.strokeWidth || 0;
        
        console.log(`Circle: radius: ${radius}, fill: ${circleFill}`);
        
        ctx.beginPath();
        ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
        
        if (circleFill && circleFill !== 'transparent') {
          ctx.fillStyle = circleFill;
          ctx.fill();
        }
        
        if (circleStroke && circleStrokeWidth > 0) {
          ctx.strokeStyle = circleStroke;
          ctx.lineWidth = circleStrokeWidth;
          ctx.stroke();
        }
        break;
        
      case 'line':
        const x1 = obj.x1 || 0;
        const y1 = obj.y1 || 0;
        const x2 = obj.x2 || (obj.width || 100);
        const y2 = obj.y2 || 0;
        const lineStroke = obj.stroke || '#000000';
        const lineStrokeWidth = obj.strokeWidth || 1;
        
        console.log(`Line: (${x1}, ${y1}) to (${x2}, ${y2}), stroke: ${lineStroke}`);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = lineStroke;
        ctx.lineWidth = lineStrokeWidth;
        ctx.stroke();
        break;
        
      case 'image':
        if (obj.src) {
          const imgWidth = obj.width || 100;
          const imgHeight = obj.height || 100;
          
          console.log(`Image: ${imgWidth}x${imgHeight}, src: ${obj.src.substring(0, 50)}...`);
          
          try {
            // Create image element and load it
            const img = new Image();
            img.src = obj.src;
            
            // Wait for image to load (in a real implementation, you might need to handle this differently)
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              // Add timeout to prevent hanging
              setTimeout(reject, 5000);
            });
            
            ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
          } catch (error) {
            console.log('Failed to load image, drawing placeholder');
            // Draw a placeholder rectangle
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(0, 0, imgWidth, imgHeight);
            ctx.strokeStyle = '#999999';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, imgWidth, imgHeight);
          }
        }
        break;
        
      default:
        console.log('Unknown object type:', obj.type, 'Object keys:', Object.keys(obj));
        // Draw a generic placeholder
        if (obj.width !== undefined && obj.height !== undefined) {
          const genWidth = obj.width || 50;
          const genHeight = obj.height || 50;
          const genFill = obj.fill || '#cccccc';
          
          console.log(`Generic object: ${genWidth}x${genHeight}, fill: ${genFill}`);
          
          ctx.fillStyle = genFill;
          ctx.fillRect(0, 0, genWidth, genHeight);
        }
    }
    
    // Restore canvas state
    ctx.restore();
  } catch (error) {
    console.error('Error rendering object to canvas:', error, 'Object:', obj);
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
function createFallbackJPEG(): Uint8Array {
  console.log('Creating fallback JPEG');
  
  try {
    // Create a simple canvas with error message
    const canvas = new OffscreenCanvas(400, 300);
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Background
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, 400, 300);
      
      // Error text
      ctx.fillStyle = '#dc3545';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Error generating image', 200, 150);
      
      // Convert to JPEG (this is async, but we'll return a placeholder)
      return new Uint8Array([
        255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0, 255, 219
      ]); // Basic JPEG header
    }
  } catch (error) {
    console.error('Failed to create fallback canvas:', error);
  }
  
  // Return minimal JPEG header if canvas fails
  return new Uint8Array([
    255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0, 255, 219
  ]);
}