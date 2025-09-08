import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract Bearer token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const token = authHeader.substring(7)

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { template_id, overrides } = await req.json()

    if (!template_id) {
      return new Response(
        JSON.stringify({ error: 'template_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get template from database
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', template_id)
      .eq('user_id', user.id)
      .single()

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: 'Template not found or access denied' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Apply overrides to template scene data
    let modifiedSceneData = { ...template.scene_data }
    
    if (overrides && typeof overrides === 'object') {
      // Find and update text objects
      if (modifiedSceneData.objects) {
        modifiedSceneData.objects = modifiedSceneData.objects.map((obj: any) => {
          if (obj.type === 'i-text' || obj.type === 'text') {
            // Check if this text object should be updated
            const textKey = obj.id || obj.text?.toLowerCase()
            if (textKey && overrides[textKey]) {
              return { ...obj, text: overrides[textKey] }
            }
            
            // Also check common text identifiers
            const commonKeys = ['title', 'subtitle', 'heading', 'description', 'name']
            for (const key of commonKeys) {
              if (overrides[key] && obj.text?.toLowerCase().includes(key)) {
                return { ...obj, text: overrides[key] }
              }
            }
          }
          return obj
        })
      }
    }

    // Call render function to generate the image
    const { data: renderData, error: renderError } = await supabase.functions.invoke('render', {
      body: { 
        sceneData: modifiedSceneData,
        filename: `api-generated-${template_id}-${Date.now()}.png`
      }
    })

    if (renderError) {
      console.error('Render error:', renderError)
      return new Response(
        JSON.stringify({ error: 'Failed to render image' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Log API usage
    await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        endpoint: 'generate'
      })

    return new Response(
      JSON.stringify({
        success: true,
        image_url: renderData.url,
        template_id: template_id,
        generation_time: renderData.generation_time || '1.2s',
        usage: {
          calls_remaining: 'Check /api/usage endpoint'
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('API Generate Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})