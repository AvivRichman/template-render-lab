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
    console.log('API Templates - Request received');
    
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

    // Get user's templates
    const { data: templates, error: templatesError } = await supabase
      .from('templates')
      .select('id, name, created_at, updated_at, scene_data, thumbnail_url')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (templatesError) {
      console.error('Templates error:', templatesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch templates' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract editable elements from each template
    const templatesWithElements = templates?.map(template => {
      const elements: any[] = [];
      
      if (template.scene_data?.objects) {
        template.scene_data.objects.forEach((obj: any, index: number) => {
          if (obj.type === 'text' || obj.type === 'i-text') {
            elements.push({
              id: obj.id || `text_${index}`,
              type: 'text',
              content: obj.text || '',
              editable_key: obj.text?.toLowerCase().replace(/\s+/g, '_') || `text_${index}`,
              properties: {
                fontSize: obj.fontSize,
                fontFamily: obj.fontFamily,
                fill: obj.fill,
                left: obj.left,
                top: obj.top
              }
            });
          } else if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'line') {
            elements.push({
              id: obj.id || `shape_${index}`,
              type: 'shape',
              shape_type: obj.type,
              editable_key: `${obj.type}_${index}`,
              properties: {
                fill: obj.fill,
                stroke: obj.stroke,
                left: obj.left,
                top: obj.top,
                width: obj.width,
                height: obj.height,
                radius: obj.radius
              }
            });
          }
        });
      }

      return {
        id: template.id,
        name: template.name,
        created_at: template.created_at,
        updated_at: template.updated_at,
        thumbnail_url: template.thumbnail_url,
        elements
      };
    }) || [];

    console.log(`Found ${templatesWithElements.length} templates`);

    // Log API usage
    await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        endpoint: '/api-templates'
      });

    return new Response(JSON.stringify({
      success: true,
      templates: templatesWithElements,
      total: templatesWithElements.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in api-templates function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});