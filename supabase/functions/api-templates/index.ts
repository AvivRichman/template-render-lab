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

    // Get user's templates
    const { data: templates, error: templatesError } = await supabase
      .from('templates')
      .select('id, name, created_at, updated_at, scene_data')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (templatesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch templates' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract text elements from each template for API docs
    const templatesWithElements = templates?.map(template => {
      const textElements: any[] = []
      
      if (template.scene_data?.objects) {
        template.scene_data.objects.forEach((obj: any) => {
          if (obj.type === 'i-text' || obj.type === 'text') {
            textElements.push({
              id: obj.id || `text_${textElements.length + 1}`,
              text: obj.text,
              type: obj.type
            })
          }
        })
      }

      return {
        id: template.id,
        name: template.name,
        created_at: template.created_at,
        updated_at: template.updated_at,
        text_elements: textElements
      }
    }) || []

    return new Response(
      JSON.stringify({
        success: true,
        templates: templatesWithElements,
        total: templatesWithElements.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('API Templates Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})