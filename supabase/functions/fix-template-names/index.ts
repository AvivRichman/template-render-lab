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
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { template_id } = await req.json();

    // Get the template
    const { data: template, error: fetchError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', template_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update systematicNames in scene_data
    const sceneData = template.scene_data;
    if (sceneData.objects) {
      sceneData.objects = sceneData.objects.map((obj: any, index: number) => {
        // Assign systematicNames based on type and order
        if (!obj.systematicName) {
          if (obj.type === 'Text' || obj.type === 'Textbox') {
            // For this specific template, start text numbering at 2
            const textIndex = sceneData.objects
              .slice(0, index)
              .filter((o: any) => o.type === 'Text' || o.type === 'Textbox')
              .length;
            obj.systematicName = `text_${textIndex + 2}`;
          } else if (obj.type === 'Rect' || obj.type === 'Circle' || obj.type === 'Line') {
            const shapeIndex = sceneData.objects
              .slice(0, index)
              .filter((o: any) => o.type === 'Rect' || o.type === 'Circle' || o.type === 'Line')
              .length;
            obj.systematicName = `shape_${shapeIndex + 1}`;
          }
        }
        return obj;
      });
    }

    // Update the template
    const { error: updateError } = await supabase
      .from('templates')
      .update({ scene_data: sceneData })
      .eq('id', template_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update template' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Template systematic names updated',
      scene_data: sceneData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
