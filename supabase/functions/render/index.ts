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

// Generate image from scene data using HTML5 Canvas (server-side rendering)
async function generateImageFromSceneData(sceneData: any, width: number, height: number, supabase: any, renderId: string, template: any): Promise<string> {
  try {
    // Create HTML content that will render the canvas with all elements
    const objects = sceneData.objects || [];
    
    // Create a more comprehensive HTML page that renders the canvas properly
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; padding: 20px; background: white; }
        canvas { border: 1px solid #ccc; background: white; }
    </style>
</head>
<body>
    <canvas id="canvas" width="${width}" height="${height}"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set background
        ctx.fillStyle = '${sceneData.background || '#ffffff'}';
        ctx.fillRect(0, 0, ${width}, ${height});
        
        // Function to load and draw image
        function drawImage(src, obj) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const left = obj.left || 0;
                    const top = obj.top || 0;
                    const scaleX = obj.scaleX || 1;
                    const scaleY = obj.scaleY || 1;
                    
                    ctx.save();
                    ctx.translate(left + (img.width * scaleX) / 2, top + (img.height * scaleY) / 2);
                    if (obj.angle) ctx.rotate(obj.angle * Math.PI / 180);
                    ctx.scale(scaleX, scaleY);
                    ctx.drawImage(img, -img.width/2, -img.height/2);
                    ctx.restore();
                    resolve();
                };
                img.onerror = () => resolve(); // Continue even if image fails to load
                img.src = src;
            });
        }
        
        // Draw all objects
        async function render() {`;

    // First pass: collect all images that need to be loaded
    const imagePromises = [];
    for (const obj of objects) {
      if (obj.type === 'image' && obj.src) {
        htmlContent += `
            await drawImage('${obj.src}', ${JSON.stringify(obj)});`;
      }
    }
    
    // If template has an uploaded image, draw it first as background
    if (template.uploaded_image_url) {
      htmlContent += `
            // Draw uploaded background image
            await drawImage('${template.uploaded_image_url}', {
                left: 0, top: 0, scaleX: 1, scaleY: 1
            });`;
    }

    // Second pass: draw other elements (text, shapes)
    for (const obj of objects) {
      const objType = obj.type?.toLowerCase();
      
      if (objType === 'text' || objType === 'textbox' || objType === 'i-text' || obj.text !== undefined || obj.value !== undefined) {
        const text = (obj.text || obj.value || obj.content || '').replace(/'/g, "\\'");
        const fontSize = obj.fontSize || 16;
        const fill = obj.fill || '#000000';
        const left = obj.left || 0;
        const top = obj.top || 0;
        const fontFamily = obj.fontFamily || 'Arial';
        const fontWeight = obj.fontWeight || 'normal';
        const fontStyle = obj.fontStyle || 'normal';
        const textAlign = obj.textAlign || 'left';
        
        htmlContent += `
            // Draw text: ${text.substring(0, 20)}...
            ctx.font = '${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}';
            ctx.fillStyle = '${fill}';
            ctx.textAlign = '${textAlign}';
            ctx.fillText('${text}', ${left}, ${top + fontSize});`;
            
      } else if (objType === 'rect') {
        const fill = obj.fill || '#000000';
        const left = obj.left || 0;
        const top = obj.top || 0;
        const objWidth = obj.width || 100;
        const objHeight = obj.height || 100;
        const stroke = obj.stroke;
        const strokeWidth = obj.strokeWidth || 0;
        
        htmlContent += `
            // Draw rectangle
            ctx.fillStyle = '${fill}';
            ctx.fillRect(${left}, ${top}, ${objWidth}, ${objHeight});`;
            
        if (stroke && strokeWidth > 0) {
          htmlContent += `
            ctx.strokeStyle = '${stroke}';
            ctx.lineWidth = ${strokeWidth};
            ctx.strokeRect(${left}, ${top}, ${objWidth}, ${objHeight});`;
        }
        
      } else if (objType === 'circle') {
        const fill = obj.fill || '#000000';
        const left = obj.left || 0;
        const top = obj.top || 0;
        const radius = obj.radius || 50;
        const stroke = obj.stroke;
        const strokeWidth = obj.strokeWidth || 0;
        
        htmlContent += `
            // Draw circle
            ctx.beginPath();
            ctx.arc(${left + radius}, ${top + radius}, ${radius}, 0, 2 * Math.PI);
            ctx.fillStyle = '${fill}';
            ctx.fill();`;
            
        if (stroke && strokeWidth > 0) {
          htmlContent += `
            ctx.strokeStyle = '${stroke}';
            ctx.lineWidth = ${strokeWidth};
            ctx.stroke();`;
        }
      }
    }

    htmlContent += `
        }
        
        // Start rendering
        render().then(() => {
            // Convert canvas to blob and send as response
            canvas.toBlob((blob) => {
                console.log('Canvas rendered successfully');
            }, 'image/png', 1);
        });
    </script>
</body>
</html>`;

    console.log('Generated HTML content for rendering');
    
    // For now, we'll create a simple canvas representation and save as PNG
    // This is a placeholder implementation - in production, you'd use a proper headless browser
    const simpleCanvas = await createSimpleCanvasImage(objects, width, height, template);
    
    // Upload to Supabase storage
    const fileName = `${renderId}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(fileName, simpleCanvas, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
    
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

// Simple canvas image creation using SVG (converted to PNG-like format)
async function createSimpleCanvasImage(objects: any[], width: number, height: number, template: any): Promise<Uint8Array> {
  // Create an enhanced SVG that includes the background image
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <style>
        text { font-family: Arial, sans-serif; }
      </style>
    </defs>`;
  
  // Add white background
  svgContent += `<rect width="100%" height="100%" fill="#ffffff"/>`;
  
  // Add uploaded background image if exists
  if (template.uploaded_image_url) {
    // For SVG, we include the image as a reference
    svgContent += `<image href="${template.uploaded_image_url}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  
  // Add all other objects
  for (const obj of objects) {
    const objType = obj.type?.toLowerCase();
    
    if (objType === 'text' || objType === 'textbox' || objType === 'i-text' || obj.text !== undefined || obj.value !== undefined) {
      const text = obj.text || obj.value || obj.content || '';
      const fontSize = obj.fontSize || 16;
      const fill = obj.fill || '#000000';
      const left = obj.left || 0;
      const top = (obj.top || 0) + fontSize;
      const fontFamily = obj.fontFamily || 'Arial';
      const fontWeight = obj.fontWeight || 'normal';
      const fontStyle = obj.fontStyle || 'normal';
      
      // Escape HTML entities in text
      const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      svgContent += `<text x="${left}" y="${top}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}" font-style="${fontStyle}">${escapedText}</text>`;
    } else if (objType === 'rect') {
      const fill = obj.fill || '#000000';
      const left = obj.left || 0;
      const top = obj.top || 0;
      const objWidth = obj.width || 100;
      const objHeight = obj.height || 100;
      const stroke = obj.stroke || 'none';
      const strokeWidth = obj.strokeWidth || 0;
      
      svgContent += `<rect x="${left}" y="${top}" width="${objWidth}" height="${objHeight}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    } else if (objType === 'circle') {
      const fill = obj.fill || '#000000';
      const left = obj.left || 0;
      const top = obj.top || 0;
      const radius = obj.radius || 50;
      const stroke = obj.stroke || 'none';
      const strokeWidth = obj.strokeWidth || 0;
      
      svgContent += `<circle cx="${left + radius}" cy="${top + radius}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    } else if (obj.type === 'image' && obj.src) {
      // Include fabric images in the SVG
      const left = obj.left || 0;
      const top = obj.top || 0;
      const objWidth = (obj.width || 100) * (obj.scaleX || 1);
      const objHeight = (obj.height || 100) * (obj.scaleY || 1);
      
      svgContent += `<image href="${obj.src}" x="${left}" y="${top}" width="${objWidth}" height="${objHeight}"/>`;
    }
  }
  
  svgContent += '</svg>';
  
  // Return SVG as Uint8Array (this will be saved as .png but contains SVG data)
  // In a full implementation, you'd convert SVG to actual PNG using a proper library
  return new TextEncoder().encode(svgContent);
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
      
      // Get all text-like objects (check multiple conditions, case-insensitive)
      const textObjects = objects.filter(obj => {
        const objType = obj.type?.toLowerCase();
        return objType === 'text' || 
               objType === 'textbox' || 
               objType === 'i-text' ||
               obj.text !== undefined ||
               obj.value !== undefined ||
               (obj.type === undefined && (obj.text || obj.value));
      });
      
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
    
    // Generate a new image with the updated scene data using HTML5 Canvas
    const newImageUrl = await generateImageFromSceneData(sceneData, width, height, supabase, renderId, template);
    
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