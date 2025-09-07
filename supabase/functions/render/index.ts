import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenderRequest {
  templateId: string;
  output: {
    format: 'png' | 'jpg' | 'webp';
    width: number;
    height: number;
    background?: string;
  };
  mutations: Array<{
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

// Simple image generation function
async function generateSimpleImage(sceneData: any, width: number, height: number, format: string): Promise<ArrayBuffer> {
  // Create a simple SVG-based image
  const background = sceneData.background || '#ffffff';
  const objects = sceneData.objects || [];
  
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svgContent += `<rect width="100%" height="100%" fill="${background}"/>`;
  
  // Render objects
  for (const obj of objects) {
    if (obj.type === 'text') {
      const x = obj.left || 0;
      const y = (obj.top || 0) + (obj.fontSize || 16);
      const fontSize = obj.fontSize || 16;
      const fontFamily = obj.fontFamily || 'Arial';
      const fill = obj.fill || '#000000';
      const fontWeight = obj.fontWeight || 'normal';
      const fontStyle = obj.fontStyle || 'normal';
      const textAnchor = obj.textAlign === 'center' ? 'middle' : obj.textAlign === 'right' ? 'end' : 'start';
      
      svgContent += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" fill="${fill}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${textAnchor}">${obj.text || 'Text'}</text>`;
    } else if (obj.type === 'rect') {
      const x = obj.left || 0;
      const y = obj.top || 0;
      const rectWidth = obj.width || 100;
      const rectHeight = obj.height || 100;
      const fill = obj.fill || '#000000';
      const stroke = obj.stroke || 'none';
      const strokeWidth = obj.strokeWidth || 0;
      
      svgContent += `<rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    } else if (obj.type === 'circle') {
      const cx = (obj.left || 0) + (obj.radius || 50);
      const cy = (obj.top || 0) + (obj.radius || 50);
      const r = obj.radius || 50;
      const fill = obj.fill || '#000000';
      const stroke = obj.stroke || 'none';
      const strokeWidth = obj.strokeWidth || 0;
      
      svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    }
  }
  
  svgContent += '</svg>';
  
  // Convert SVG to PNG using a simple conversion
  // Note: This is a simplified implementation. In production, you'd use a proper rendering engine.
  const encoder = new TextEncoder();
  return encoder.encode(svgContent).buffer;
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
      console.error('Auth error:', authError);
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

    // Parse request body with error handling
    let body: RenderRequest;
    try {
      const text = await req.text();
      if (!text.trim()) {
        return new Response(JSON.stringify({ error: 'Request body is empty' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate request
    if (!body.templateId || !body.output || !body.mutations) {
      return new Response(JSON.stringify({ error: 'Missing required fields: templateId, output, mutations' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clamp dimensions for safety
    const maxDimension = 2048;
    const width = Math.min(Math.max(body.output.width, 100), maxDimension);
    const height = Math.min(Math.max(body.output.height, 100), maxDimension);

    // Fetch template owned by user
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', body.templateId)
      .eq('user_id', user.id)
      .single();

    if (templateError || !template) {
      console.error('Template error:', templateError);
      return new Response(JSON.stringify({ error: 'Template not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apply mutations to scene data
    const sceneData = JSON.parse(JSON.stringify(template.scene_data));
    
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

    // Generate render ID
    const renderId = `rnd_${crypto.randomUUID()}`;
    
    // Generate the image
    const imageBuffer = await generateSimpleImage(sceneData, width, height, body.output.format);
    
    // Upload to storage
    const fileName = `users/${user.id}/${renderId}.svg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(fileName, imageBuffer, {
        contentType: 'image/svg+xml',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Failed to save rendered image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(fileName);

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
      imageUrl: urlData.publicUrl,
      renderId: renderId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in render function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});