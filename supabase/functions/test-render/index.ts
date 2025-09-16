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
    console.log('Test Render - Starting test');
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the template data directly from database
    const { data: template, error } = await supabase
      .from('templates')
      .select('scene_data')
      .eq('name', 'test')
      .single();

    if (error || !template) {
      throw new Error('Template not found');
    }

    console.log('Found template, calling render function with scene_data');
    console.log('Scene data objects:', template.scene_data.objects?.length);

    // Call render function directly with the database scene_data
    const renderResponse = await supabase.functions.invoke('render', {
      body: {
        template_id: 'test-template',
        scene_data: template.scene_data,
        user_id: 'test-user'
      }
    });

    if (renderResponse.error) {
      console.error('Render error:', renderResponse.error);
      throw new Error(renderResponse.error.message);
    }

    console.log('Render successful, image URL:', renderResponse.data.image_url);

    return new Response(JSON.stringify({
      success: true,
      image_url: renderResponse.data.image_url,
      message: 'Test render completed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Test render error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});