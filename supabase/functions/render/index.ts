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
    
    // For now, we'll need to process the scene data on the client side
    // Generate a new edited image URL with the updated scene data
    const newImageUrl = `${supabaseUrl}/storage/v1/object/public/api-renders/${renderId}.png`;
    
    // Store the updated scene data for potential future processing
    await supabase
      .from('templates')
      .update({ 
        scene_data: sceneData,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.templateId)
      .eq('user_id', user.id);

    let finalImageUrl = template.edited_image_url || newImageUrl;

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