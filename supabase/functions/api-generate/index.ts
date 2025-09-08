import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    console.log('API Generate - Request received');
    
    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Parse request body
    const { template_id, overrides } = await req.json();
    
    if (!template_id) {
      return new Response(JSON.stringify({ error: 'template_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Template ID:', template_id, 'Overrides:', overrides);

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', template_id)
      .eq('user_id', user.id)
      .single();

    if (templateError || !template) {
      console.error('Template error:', templateError);
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Template found:', template.name);

    // Log API usage
    await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        endpoint: '/api-generate'
      });

    // Apply overrides to template scene data
    let modifiedSceneData = { ...template.scene_data };
    
    if (overrides && typeof overrides === 'object') {
      // Apply text overrides to fabric objects
      if (modifiedSceneData.objects) {
        modifiedSceneData.objects = modifiedSceneData.objects.map((obj: any) => {
          if (obj.type === 'text' || obj.type === 'i-text') {
            // Check if there's an override for this text object
            const textKey = obj.text?.toLowerCase().replace(/\s+/g, '_');
            if (textKey && overrides[textKey]) {
              return { ...obj, text: overrides[textKey] };
            }
            
            // Also check for generic overrides like title, subtitle, etc.
            for (const [key, value] of Object.entries(overrides)) {
              if (obj.text?.toLowerCase().includes(key.toLowerCase())) {
                return { ...obj, text: value };
              }
            }
          }
          
          // Apply style overrides if provided
          if (overrides.styles && overrides.styles[obj.id]) {
            return { ...obj, ...overrides.styles[obj.id] };
          }
          
          return obj;
        });
      }
    }

    console.log('Scene data modified, calling render function');

    // Call the render function to generate image
    const renderResponse = await supabase.functions.invoke('render', {
      body: {
        template_id,
        scene_data: modifiedSceneData,
        user_id: user.id
      }
    });

    if (renderResponse.error) {
      console.error('Render error:', renderResponse.error);
      return new Response(JSON.stringify({ error: 'Failed to generate image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Image generated successfully');

    return new Response(JSON.stringify({
      success: true,
      image_url: renderResponse.data.image_url,
      template_id,
      generation_time: renderResponse.data.generation_time || '1.2s',
      message: 'Image generated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in api-generate function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});