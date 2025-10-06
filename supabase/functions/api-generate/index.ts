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

    // Apply overrides to template scene data (temporarily for this render only)
    let modifiedSceneData = { ...template.scene_data };
    
    if (overrides && typeof overrides === 'object') {
      // First, ensure all objects have systematic names (for backward compatibility)
      if (modifiedSceneData.objects) {
        let textCounter = 0;
        let shapeCounter = 0;
        
        modifiedSceneData.objects = modifiedSceneData.objects.map((obj: any) => {
          // If object doesn't have a systematicName, assign one based on type
          if (!obj.systematicName) {
            if (obj.type === 'Text' || obj.type === 'Textbox') {
              textCounter++;
              obj.systematicName = `text_${textCounter}`;
              console.log(`Auto-assigned systematicName: ${obj.systematicName} to text object`);
            } else if (obj.type === 'Rect' || obj.type === 'Circle' || obj.type === 'Line') {
              shapeCounter++;
              obj.systematicName = `shape_${shapeCounter}`;
              console.log(`Auto-assigned systematicName: ${obj.systematicName} to shape object`);
            }
          }
          return obj;
        });
        
        // Now apply overrides to fabric objects using systematic names
        modifiedSceneData.objects = modifiedSceneData.objects.map((obj: any) => {
          const systematicName = obj.systematicName;
          
          if (systematicName && overrides[systematicName] !== undefined) {
            console.log(`Applying override to ${systematicName}:`, overrides[systematicName]);
            
            // For text objects, handle both simple string and object overrides
            if (obj.text !== undefined) {
              const override = overrides[systematicName];
              
              // If override is an object with text properties
              if (typeof override === 'object' && override !== null) {
                const updatedObj = { ...obj };
                
                // Update text content
                if (override.text !== undefined) {
                  updatedObj.text = override.text;
                  console.log(`Updated text to: ${override.text}`);
                }
                
                // Update text properties
                if (override.fontSize !== undefined) {
                  updatedObj.fontSize = override.fontSize;
                  console.log(`Updated fontSize to: ${override.fontSize}`);
                }
                if (override.fontFamily !== undefined) {
                  updatedObj.fontFamily = override.fontFamily;
                  console.log(`Updated fontFamily to: ${override.fontFamily}`);
                }
                if (override.fill !== undefined) {
                  updatedObj.fill = override.fill;
                  console.log(`Updated fill to: ${override.fill}`);
                }
                if (override.fontWeight !== undefined) {
                  updatedObj.fontWeight = override.fontWeight;
                }
                if (override.fontStyle !== undefined) {
                  updatedObj.fontStyle = override.fontStyle;
                }
                if (override.underline !== undefined) {
                  updatedObj.underline = override.underline;
                }
                if (override.textAlign !== undefined) {
                  updatedObj.textAlign = override.textAlign;
                }
                
                return updatedObj;
              } 
              // If override is a simple string (backward compatibility)
              else if (typeof override === 'string') {
                console.log(`Updated text (string) to: ${override}`);
                return { ...obj, text: override };
              }
            }
            
            // For shapes, update the fill color
            if (obj.fill !== undefined && typeof overrides[systematicName] === 'string') {
              console.log(`Updated shape fill to: ${overrides[systematicName]}`);
              return { ...obj, fill: overrides[systematicName] };
            }
          }
          
          return obj;
        });
      }
    }

    console.log('Overrides applied, calling render function with modified scene_data');
    console.log('Modified scene_data preview:', JSON.stringify(modifiedSceneData).substring(0, 1000));

    // Update the template with the modified scene_data
    const { error: updateError } = await supabase
      .from('templates')
      .update({ 
        scene_data: modifiedSceneData,
        updated_at: new Date().toISOString()
      })
      .eq('id', template_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating template:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update template' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Template scene_data updated in database');

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