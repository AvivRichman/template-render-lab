import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenderRequest {
  templateId: string;
  text1?: string;
  text2?: string;
  text3?: string;
  text4?: string;
  text5?: string;
  text6?: string;
  text7?: string;
  text8?: string;
  text9?: string;
  text10?: string;
  // Legacy format support
  output?: {
    format: 'png' | 'jpg' | 'webp';
    width: number;
    height: number;
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

    // Check if any text updates are provided
    const textUpdates: { [key: string]: string } = {};
    for (let i = 1; i <= 10; i++) {
      const textKey = `text${i}` as keyof RenderRequest;
      if (body[textKey] && typeof body[textKey] === 'string') {
        textUpdates[`text${i}`] = body[textKey] as string;
      }
    }

    // Return the original edited image if no updates are provided
    if (Object.keys(textUpdates).length === 0 && (!body.mutations || body.mutations.length === 0)) {
      if (template.edited_image_url) {
        return new Response(JSON.stringify({
          status: 'ok',
          imageUrl: template.edited_image_url,
          renderId: `direct_${crypto.randomUUID()}`,
          message: 'Returning stored edited image (no changes requested)'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Parse and prepare scene data
    const sceneData = JSON.parse(JSON.stringify(template.scene_data));
    console.info('Found text objects for modification:', sceneData.objects?.filter((obj: any) => obj.type === 'text').length || 0);

    // Assign sequential names to text objects and apply updates
    let textIndex = 1;
    for (const obj of sceneData.objects || []) {
      if (obj.type === 'text') {
        const textKey = `text${textIndex}`;
        
        // Update text value if provided
        if (textUpdates[textKey]) {
          obj.text = textUpdates[textKey];
          console.info(`Updated ${textKey} with value:`, textUpdates[textKey]);
        }
        
        textIndex++;
      }
    }

    // Apply legacy mutations if provided
    if (body.mutations && body.mutations.length > 0) {
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

    // Generate SVG from scene data
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">`;
    svgContent += `<rect width="800" height="600" fill="white"/>`;
    
    for (const obj of sceneData.objects || []) {
      if (obj.type === 'text') {
        const x = obj.left || 0;
        const y = (obj.top || 0) + (obj.fontSize || 20);
        const fontSize = obj.fontSize || 20;
        const fill = obj.fill || '#000000';
        const fontFamily = obj.fontFamily || 'Arial';
        const fontWeight = obj.fontWeight || 'normal';
        const fontStyle = obj.fontStyle || 'normal';
        const textDecoration = obj.underline ? 'underline' : 'none';
        
        svgContent += `<text x="${x}" y="${y}" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}">${obj.text || ''}</text>`;
      }
    }
    svgContent += `</svg>`;

    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    console.info(`Generated image blob: type=${svgBlob.type}, size=${svgBlob.size}, extension=svg`);

    // Try to convert SVG to PNG using external services
    const pngServices = [
      'https://htmlcsstoimage.com/demo_run',
      'https://api.screenshotone.com/take', 
      'https://api.urlbox.io/v1/render/sync'
    ];

    let pngBlob: Blob | null = null;

    for (const serviceUrl of pngServices) {
      try {
        console.info(`Trying PNG conversion service: ${serviceUrl}`);
        
        const response = await fetch(serviceUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            html: `<html><body style="margin:0;padding:0;">${svgContent}</body></html>`,
            css: '',
            width: 800,
            height: 600,
            format: 'png'
          })
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 0) {
            pngBlob = new Blob([buffer], { type: 'image/png' });
            console.info(`Successfully converted to PNG using ${serviceUrl}: ${pngBlob.size} bytes`);
            break;
          }
        }
        console.info(`Service ${serviceUrl} failed or returned empty response`);
      } catch (error) {
        console.info(`Service ${serviceUrl} failed:`, error);
      }
    }

    // Fallback: Create a simple PNG if all services fail
    if (!pngBlob) {
      console.info('All external services failed, creating fallback PNG');
      const canvas = new OffscreenCanvas(800, 600);
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 800, 600);
        
        // Add text elements
        for (const obj of sceneData.objects || []) {
          if (obj.type === 'text') {
            const x = obj.left || 0;
            const y = obj.top || 0;
            const fontSize = obj.fontSize || 20;
            const fill = obj.fill || '#000000';
            const fontFamily = obj.fontFamily || 'Arial';
            const fontWeight = obj.fontWeight || 'normal';
            
            ctx.fillStyle = fill;
            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
            ctx.fillText(obj.text || '', x, y + fontSize);
          }
        }
        
        pngBlob = await canvas.convertToBlob({ type: 'image/png' });
        console.info(`Generated PNG blob: type=${pngBlob.type}, size=${pngBlob.size}`);
      }
    }

    // Upload the rendered image to Supabase storage
    const renderId = crypto.randomUUID();
    const imagePath = `api-renders/${user.id}/${renderId}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(imagePath, pngBlob || svgBlob, {
        contentType: pngBlob ? 'image/png' : 'image/svg+xml',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Failed to upload rendered image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageUrl = `${supabaseUrl}/storage/v1/object/public/exports/${imagePath}`;

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
      imageUrl: imageUrl,
      renderId: renderId,
      format: pngBlob ? 'png' : 'svg',
      message: `Successfully rendered ${pngBlob ? 'PNG' : 'SVG'} image with ${Object.keys(textUpdates).length} text updates`
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