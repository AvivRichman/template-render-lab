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
          // Use systematic name if available, otherwise generate one
          const systematicName = obj.systematicName || 
            (obj.text !== undefined ? `text_${index + 1}` : 
             obj.fill !== undefined || obj.stroke !== undefined ? `shape_${index + 1}` :
             obj.src ? `image_${index + 1}` : `element_${index + 1}`);
          
          // Handle fabric.js text objects
          if (obj.text !== undefined) {
            elements.push({
              id: obj.id || systematicName,
              type: 'text',
              content: obj.text || '',
              editable_key: systematicName,
              properties: {
                fontSize: obj.fontSize,
                fontFamily: obj.fontFamily,
                fill: obj.fill,
                left: obj.left,
                top: obj.top,
                angle: obj.angle,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY
              }
            });
          } 
          // Handle fabric.js shape objects
          else if (obj.fill || obj.stroke) {
            const shapeType = obj.rx !== undefined ? 'rect' : 
                             obj.radius !== undefined ? 'circle' : 
                             obj.x1 !== undefined ? 'line' : 'shape';
            
            elements.push({
              id: obj.id || systematicName,
              type: 'shape',
              shape_type: shapeType,
              editable_key: systematicName,
              properties: {
                fill: obj.fill,
                stroke: obj.stroke,
                left: obj.left,
                top: obj.top,
                width: obj.width,
                height: obj.height,
                radius: obj.radius,
                angle: obj.angle,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY,
                rx: obj.rx,
                ry: obj.ry
              }
            });
          }
          // Handle image objects
          else if (obj.src) {
            elements.push({
              id: obj.id || systematicName,
              type: 'image',
              content: obj.src.substring(0, 50) + '...',
              editable_key: systematicName,
              properties: {
                left: obj.left,
                top: obj.top,
                width: obj.width,
                height: obj.height,
                angle: obj.angle,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY,
                cropX: obj.cropX,
                cropY: obj.cropY
              }
            });
          }
          // Handle other objects
          else {
            elements.push({
              id: obj.id || systematicName,
              type: 'unknown',
              editable_key: systematicName,
              properties: {
                left: obj.left,
                top: obj.top,
                angle: obj.angle,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY
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