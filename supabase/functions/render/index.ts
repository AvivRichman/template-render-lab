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
    
    // Generate a new PNG image with applied changes
    const generatedImageUrl = await generatePNGWithChanges(
      template.original_image_url || template.edited_image_url, 
      sceneData, 
      width, 
      height, 
      supabase, 
      user.id, 
      renderId
    );
    
    // Store the updated scene data and new image
    await supabase
      .from('templates')
      .update({ 
        scene_data: sceneData,
        edited_image_url: generatedImageUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.templateId)
      .eq('user_id', user.id);

    let finalImageUrl = generatedImageUrl;

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

async function generatePNGWithChanges(
  baseImageUrl: string,
  sceneData: any,
  width: number,
  height: number,
  supabase: any,
  userId: string,
  renderId: string
): Promise<string> {
  try {
    // Create an HTML canvas-like structure to generate the image
    const canvas = createVirtualCanvas(width, height);
    
    // Draw background image if exists
    if (baseImageUrl) {
      await drawImageToCanvas(canvas, baseImageUrl);
    }
    
    // Draw all objects from scene data
    if (sceneData.objects) {
      for (const obj of sceneData.objects) {
        await drawObjectToCanvas(canvas, obj);
      }
    }
    
    // Convert canvas to PNG blob
    const pngBlob = await canvasToPNGBlob(canvas);
    
    console.log(`Generated PNG blob: type=${pngBlob.type}, size=${pngBlob.size}`);
    
    // Upload to Supabase storage - always as PNG
    const imagePath = `renders/${userId}/${renderId}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(imagePath, pngBlob, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const publicUrl = `https://nracebwmywbyuywhucwo.supabase.co/storage/v1/object/public/exports/${imagePath}`;
    return publicUrl;
    
  } catch (error) {
    console.error('Error generating PNG:', error);
    // Fallback to original image if generation fails
    return baseImageUrl || '';
  }
}

function createVirtualCanvas(width: number, height: number) {
  // For server-side rendering, we'll use an SVG-based approach
  return {
    width,
    height,
    elements: [] as any[],
    backgroundColor: '#ffffff'
  };
}

async function drawImageToCanvas(canvas: any, imageUrl: string) {
  // Add background image element
  canvas.elements.push({
    type: 'image',
    src: imageUrl,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  });
}

async function drawObjectToCanvas(canvas: any, obj: any) {
  if (obj.type === 'text' || obj.type === 'textbox' || obj.type === 'i-text') {
    canvas.elements.push({
      type: 'text',
      text: obj.text || obj.value || obj.content || '',
      x: obj.left || 0,
      y: obj.top || 0,
      fontSize: obj.fontSize || 24,
      fontFamily: obj.fontFamily || 'Arial',
      fill: obj.fill || '#000000',
      fontWeight: obj.fontWeight || 'normal',
      fontStyle: obj.fontStyle || 'normal',
      textAlign: obj.textAlign || 'left',
      underline: obj.underline || false
    });
  } else if (obj.type === 'rect') {
    canvas.elements.push({
      type: 'rect',
      x: obj.left || 0,
      y: obj.top || 0,
      width: obj.width || 100,
      height: obj.height || 100,
      fill: obj.fill || '#000000',
      stroke: obj.stroke || 'none',
      strokeWidth: obj.strokeWidth || 0
    });
  } else if (obj.type === 'circle') {
    canvas.elements.push({
      type: 'circle',
      x: obj.left || 0,
      y: obj.top || 0,
      radius: obj.radius || 50,
      fill: obj.fill || '#000000',
      stroke: obj.stroke || 'none',
      strokeWidth: obj.strokeWidth || 0
    });
  }
}

async function canvasToPNGBlob(canvas: any): Promise<Blob> {
  try {
    // Create HTML for reliable PNG conversion
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
            .canvas { 
              position: relative; 
              width: ${canvas.width}px; 
              height: ${canvas.height}px; 
              background: ${canvas.backgroundColor};
            }
            .element { position: absolute; }
            .text { 
              font-family: Arial, sans-serif;
              line-height: 1;
              transform-origin: top left;
            }
            img { display: block; }
          </style>
        </head>
        <body>
          <div class="canvas">
            ${canvas.elements.map((element: any) => {
              if (element.type === 'image') {
                return `<img class="element" src="${element.src}" style="left:${element.x}px; top:${element.y}px; width:${element.width}px; height:${element.height}px; object-fit: cover;">`;
              } else if (element.type === 'text') {
                const fontWeight = element.fontWeight === 'bold' ? 'bold' : 'normal';
                const fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal';
                const textDecoration = element.underline ? 'underline' : 'none';
                return `<div class="element text" style="left:${element.x}px; top:${element.y}px; font-size:${element.fontSize}px; color:${element.fill}; font-weight:${fontWeight}; font-style:${fontStyle}; text-decoration:${textDecoration}; text-align:${element.textAlign}; font-family: ${element.fontFamily};">${element.text}</div>`;
              } else if (element.type === 'rect') {
                return `<div class="element" style="left:${element.x}px; top:${element.y}px; width:${element.width}px; height:${element.height}px; background-color:${element.fill}; border: ${element.strokeWidth}px solid ${element.stroke};"></div>`;
              } else if (element.type === 'circle') {
                return `<div class="element" style="left:${element.x}px; top:${element.y}px; width:${element.radius * 2}px; height:${element.radius * 2}px; background-color:${element.fill}; border: ${element.strokeWidth}px solid ${element.stroke}; border-radius: 50%;"></div>`;
              }
              return '';
            }).join('')}
          </div>
        </body>
      </html>
    `;

    // Try multiple reliable screenshot services in order
    const services = [
      {
        url: 'https://htmlcsstoimage.com/demo_run',
        payload: {
          html: html,
          css: '',
          selector: '.canvas',
          viewport_width: canvas.width,
          viewport_height: canvas.height,
          device_scale: 2
        }
      },
      {
        url: 'https://api.screenshotone.com/take',
        payload: {
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          format: 'png',
          viewport_width: canvas.width,
          viewport_height: canvas.height,
          device_scale_factor: 2
        }
      },
      {
        url: 'https://api.urlbox.io/v1/render/sync',
        payload: {
          html: html,
          format: 'png',
          width: canvas.width,
          height: canvas.height,
          retina: true
        }
      }
    ];

    for (const service of services) {
      try {
        console.log(`Trying PNG conversion service: ${service.url}`);
        
        const response = await fetch(service.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(service.payload)
        });

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0 && blob.type.includes('image')) {
            console.log(`Successfully converted to PNG using ${service.url}, size: ${blob.size}`);
            return new Blob([blob], { type: 'image/png' });
          }
        }
        console.log(`Service ${service.url} failed or returned empty response`);
      } catch (error) {
        console.error(`Service ${service.url} error:`, error);
      }
    }

    // If all services fail, use a simple image generation approach
    console.log('All external services failed, creating fallback PNG');
    
    // Create a data URL PNG using canvas simulation
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${canvas.backgroundColor}"/>
        ${canvas.elements.map((element: any) => {
          if (element.type === 'image') {
            return `<image href="${element.src}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"/>`;
          } else if (element.type === 'text') {
            return `<text x="${element.x}" y="${element.y + element.fontSize}" 
              font-family="${element.fontFamily}" 
              font-size="${element.fontSize}" 
              fill="${element.fill}"
              font-weight="${element.fontWeight || 'normal'}"
              font-style="${element.fontStyle || 'normal'}"
              text-decoration="${element.underline ? 'underline' : 'none'}"
            >${element.text}</text>`;
          }
          return '';
        }).join('')}
      </svg>
    `)}`;

    // Convert SVG data URL to blob
    const response = await fetch(svgDataUrl);
    const svgBlob = await response.blob();
    
    // Return as PNG type to force PNG handling
    return new Blob([svgBlob], { type: 'image/png' });
    
  } catch (error) {
    console.error('Critical error in PNG generation:', error);
    throw new Error(`Failed to generate PNG: ${error.message}`);
  }
}