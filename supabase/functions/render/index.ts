import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenderRequest {
  templateId: string;
  output?: {
    format?: 'png' | 'jpg' | 'webp';
    width?: number;
    height?: number;
    background?: string;
  };
  mutations?: Array<{
    selector: { id?: string; name?: string };
    text?: {
      value?: string;
      fontFamily?: string;
      fontSize?: number;
      color?: string;
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
    };
    position?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    shape?: {
      type?: 'rectangle' | 'circle' | 'line';
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
    };
  }>;
  // Direct text parameters (text1, text2, etc.)
  [key: string]: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check quota (70 calls per month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const { count, error: quotaError } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('endpoint', 'render')
      .gte('called_at', startOfMonth.toISOString());

    if (quotaError) {
      console.error('Quota check error:', quotaError);
      return new Response(JSON.stringify({ error: 'Failed to check quota' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((count || 0) >= 70) {
      return new Response(JSON.stringify({ 
        error: 'Monthly quota exceeded',
        quota: { used: count, limit: 70 }
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RenderRequest = await req.json();

    // Validate request
    if (!body.templateId) {
      return new Response(JSON.stringify({ error: 'Missing required field: templateId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Set default output settings
    const output = body.output || {};
    const maxDimension = 2048;
    const width = Math.min(Math.max(output.width || 800, 100), maxDimension);
    const height = Math.min(Math.max(output.height || 600, 100), maxDimension);

    // Fetch template owned by user
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', body.templateId)
      .eq('user_id', user.id)
      .single();

    if (templateError || !template) {
      return new Response(JSON.stringify({ error: 'Template not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apply mutations to scene data
    const sceneData = JSON.parse(JSON.stringify(template.scene_data));
    let hasChanges = false;

    // Check for direct text parameters (text1, text2, etc.)
    const textParams: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith('text') && /^text\d+$/.test(key) && typeof value === 'string') {
        textParams[key] = value;
        hasChanges = true;
      }
    }

    // Apply direct text parameter changes
    if (Object.keys(textParams).length > 0) {
      const objects = sceneData.objects || [];
      
      // Get all text-like objects (check multiple conditions)
      const textObjects = objects.filter(obj => 
        obj.type === 'text' || 
        obj.type === 'textbox' || 
        obj.type === 'i-text' ||
        obj.text !== undefined ||
        obj.value !== undefined ||
        (obj.type === undefined && (obj.text || obj.value))
      );
      
      console.log('Found text objects for modification:', textObjects.length);
      
      // Assign sequential names to all text objects (text1, text2, text3, etc.)
      textObjects.forEach((obj, index) => {
        obj.name = `text${index + 1}`;
      });
      
      // Apply text parameter changes
      for (const obj of textObjects) {
        if (textParams[obj.name]) {
          // Update text content (handle multiple possible properties)
          if (obj.text !== undefined) obj.text = textParams[obj.name];
          if (obj.value !== undefined) obj.value = textParams[obj.name];
          if (obj.content !== undefined) obj.content = textParams[obj.name];
          
          console.log(`Updated ${obj.name} with value: ${textParams[obj.name]}`);
        }
      }
    }
    
    // Apply traditional mutations if provided
    if (body.mutations && body.mutations.length > 0) {
      hasChanges = true;
      
      for (const mutation of body.mutations) {
        const objects = sceneData.objects || [];
        
        for (const obj of objects) {
          // Check if this object matches the selector
          const matchesId = mutation.selector.id && obj.id === mutation.selector.id;
          const matchesName = mutation.selector.name && obj.name === mutation.selector.name;
          
          if (matchesId || matchesName) {
            // Apply text mutations
            if (mutation.text && obj.type === 'text') {
              if (mutation.text.value !== undefined) obj.text = mutation.text.value;
              if (mutation.text.fontSize !== undefined) obj.fontSize = Math.min(Math.max(mutation.text.fontSize, 8), 200);
              if (mutation.text.color !== undefined) obj.fill = mutation.text.color;
              if (mutation.text.fontFamily !== undefined) obj.fontFamily = mutation.text.fontFamily;
              if (mutation.text.align !== undefined) obj.textAlign = mutation.text.align;
              if (mutation.text.bold !== undefined) obj.fontWeight = mutation.text.bold ? 'bold' : 'normal';
              if (mutation.text.italic !== undefined) obj.fontStyle = mutation.text.italic ? 'italic' : 'normal';
              if (mutation.text.underline !== undefined) obj.underline = mutation.text.underline;
            }
            
            // Apply position mutations
            if (mutation.position) {
              if (mutation.position.x !== undefined) obj.left = Math.max(0, mutation.position.x);
              if (mutation.position.y !== undefined) obj.top = Math.max(0, mutation.position.y);
              if (mutation.position.width !== undefined) obj.width = Math.max(1, mutation.position.width);
              if (mutation.position.height !== undefined) obj.height = Math.max(1, mutation.position.height);
            }
            
            // Apply shape mutations
            if (mutation.shape && (obj.type === 'rect' || obj.type === 'circle')) {
              if (mutation.shape.fill !== undefined) obj.fill = mutation.shape.fill;
              if (mutation.shape.stroke !== undefined) obj.stroke = mutation.shape.stroke;
              if (mutation.shape.strokeWidth !== undefined) obj.strokeWidth = Math.max(0, mutation.shape.strokeWidth);
              if (mutation.shape.radius !== undefined && obj.type === 'circle') obj.radius = Math.max(1, mutation.shape.radius);
            }
          }
        }
      }
    }

    // Return the direct edited image URL if no changes are requested
    if (!hasChanges) {
      if (template.edited_image_url) {
        return new Response(JSON.stringify({
          status: 'ok',
          imageUrl: template.edited_image_url,
          renderId: `direct_${crypto.randomUUID()}`,
          message: 'Returning stored edited image'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Generate render ID for changes
    const renderId = `edit_${crypto.randomUUID()}`;
    
    // Generate PNG image with all elements (like Editor page)
    const newImageUrl = await generatePNGImage(sceneData, template.original_image_url, renderId, supabase);
    
    // Store the updated scene data and new image URL
    await supabase
      .from('templates')
      .update({ 
        scene_data: sceneData,
        edited_image_url: newImageUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.templateId)
      .eq('user_id', user.id);

    let finalImageUrl = newImageUrl;

    // Record API usage
    await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        endpoint: 'render',
        called_at: new Date().toISOString()
      });

    return new Response(JSON.stringify({
      status: 'ok',
      imageUrl: finalImageUrl,
      renderId: renderId,
      message: 'Returning edited template image'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in render function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generatePNGImage(sceneData: any, originalImageUrl: string | null, renderId: string, supabase: any): Promise<string> {
  try {
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    // Create HTML with canvas and fabric objects (similar to Editor page)
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; }
          canvas { border: none; }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/6.7.1/fabric.min.js"></script>
      </head>
      <body>
        <canvas id="canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
        <script>
          const canvas = new fabric.Canvas('canvas', {
            width: ${canvasWidth},
            height: ${canvasHeight},
            backgroundColor: 'white'
          });
          
          // Load scene data
          const sceneData = ${JSON.stringify(sceneData)};
          
          // Load background image if exists
          ${originalImageUrl ? `
          fabric.Image.fromURL('${originalImageUrl}', function(img) {
            img.set({
              left: 0,
              top: 0,
              scaleX: ${canvasWidth} / img.width,
              scaleY: ${canvasHeight} / img.height,
              selectable: false,
              evented: false
            });
            canvas.add(img);
            canvas.sendToBack(img);
            
            // Load all other objects
            canvas.loadFromJSON(sceneData, function() {
              canvas.renderAll();
              // Convert to PNG data URL
              const dataURL = canvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: 1
              });
              window.imageData = dataURL;
            });
          });
          ` : `
          // Load all objects without background
          canvas.loadFromJSON(sceneData, function() {
            canvas.renderAll();
            const dataURL = canvas.toDataURL({
              format: 'png',
              quality: 1,
              multiplier: 1
            });
            window.imageData = dataURL;
          });
          `}
        </script>
      </body>
      </html>
    `;

    // Try multiple screenshot services to convert HTML to PNG
    const screenshotServices = [
      'https://api.screenshotone.com/take',
      'https://api.urlbox.io/v1/render/sync',
      'https://htmlcsstoimage.com/demo_run'
    ];

    let pngBuffer = null;
    
    for (const service of screenshotServices) {
      try {
        console.log(`Trying PNG conversion service: ${service}`);
        
        let response;
        if (service.includes('screenshotone.com')) {
          response = await fetch(service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `data:text/html;base64,${btoa(htmlContent)}`,
              viewport_width: canvasWidth,
              viewport_height: canvasHeight,
              device_scale_factor: 1,
              format: 'png',
              full_page: false,
              delay: 2
            })
          });
        } else if (service.includes('urlbox.io')) {
          response = await fetch(service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              html: htmlContent,
              width: canvasWidth,
              height: canvasHeight,
              format: 'png',
              delay: 2000
            })
          });
        } else if (service.includes('htmlcsstoimage.com')) {
          response = await fetch(service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              html: htmlContent,
              css: '',
              viewport_width: canvasWidth,
              viewport_height: canvasHeight,
              device_scale_factor: 1
            })
          });
        }

        if (response && response.ok) {
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 0) {
            pngBuffer = new Uint8Array(buffer);
            console.log(`Successfully generated PNG using ${service}`);
            break;
          }
        }
        console.log(`Service ${service} failed or returned empty response`);
      } catch (error) {
        console.log(`Service ${service} error:`, error.message);
      }
    }

    // If all external services fail, create a simple canvas-based fallback
    if (!pngBuffer) {
      console.log('All external services failed, creating fallback PNG');
      
      // Create a simple PNG using manual canvas rendering (server-side simulation)
      const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');
      
      // Fill background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      // Draw background image if available
      if (originalImageUrl) {
        try {
          const imageResponse = await fetch(originalImageUrl);
          const imageBuffer = await imageResponse.arrayBuffer();
          const imageBlob = new Blob([imageBuffer]);
          const bitmap = await createImageBitmap(imageBlob);
          ctx.drawImage(bitmap, 0, 0, canvasWidth, canvasHeight);
        } catch (error) {
          console.log('Failed to load background image:', error.message);
        }
      }
      
      // Draw fabric objects
      const objects = sceneData.objects || [];
      for (const obj of objects) {
        if (obj.type === 'text' || obj.type === 'textbox' || obj.type === 'i-text') {
          const text = obj.text || obj.value || obj.content || 'Text';
          const x = obj.left || 0;
          const y = (obj.top || 0) + (obj.fontSize || 24);
          
          ctx.font = `${obj.fontWeight || 'normal'} ${obj.fontStyle || 'normal'} ${obj.fontSize || 24}px ${obj.fontFamily || 'Arial'}`;
          ctx.fillStyle = obj.fill || '#000000';
          ctx.textAlign = obj.textAlign || 'left';
          
          if (obj.underline) {
            ctx.fillText(obj.text, x, y);
            const textWidth = ctx.measureText(text).width;
            ctx.strokeStyle = obj.fill || '#000000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + 2);
            ctx.lineTo(x + textWidth, y + 2);
            ctx.stroke();
          } else {
            ctx.fillText(text, x, y);
          }
        } else if (obj.type === 'rect') {
          ctx.fillStyle = obj.fill || '#000000';
          ctx.fillRect(obj.left || 0, obj.top || 0, obj.width || 100, obj.height || 100);
          
          if (obj.stroke && obj.strokeWidth > 0) {
            ctx.strokeStyle = obj.stroke;
            ctx.lineWidth = obj.strokeWidth;
            ctx.strokeRect(obj.left || 0, obj.top || 0, obj.width || 100, obj.height || 100);
          }
        } else if (obj.type === 'circle') {
          const centerX = (obj.left || 0) + (obj.radius || 50);
          const centerY = (obj.top || 0) + (obj.radius || 50);
          const radius = obj.radius || 50;
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.fillStyle = obj.fill || '#000000';
          ctx.fill();
          
          if (obj.stroke && obj.strokeWidth > 0) {
            ctx.strokeStyle = obj.stroke;
            ctx.lineWidth = obj.strokeWidth;
            ctx.stroke();
          }
        }
      }
      
      // Convert canvas to PNG
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      pngBuffer = new Uint8Array(await blob.arrayBuffer());
    }

    // Upload PNG to Supabase storage
    const fileName = `${renderId}.png`;
    const { data, error } = await supabase.storage
      .from('api-renders')
      .upload(fileName, pngBuffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      console.error('Storage upload error:', error);
      throw new Error('Failed to upload image');
    }
    
    // Return public URL
    const { data: { publicUrl } } = supabase.storage
      .from('api-renders')
      .getPublicUrl(fileName);
    
    return publicUrl;
    
  } catch (error) {
    console.error('Error generating PNG image:', error);
    throw error;
  }
}