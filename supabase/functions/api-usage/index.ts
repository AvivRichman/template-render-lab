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

    // Get current month's usage
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: usageData, error: usageError } = await supabase
      .from('api_usage')
      .select('called_at, endpoint')
      .eq('user_id', user.id)
      .gte('called_at', startOfMonth.toISOString())
      .lte('called_at', endOfMonth.toISOString())

    if (usageError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch usage data' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const totalCalls = usageData?.length || 0
    const limit = 70 // Free plan limit

    // Calculate next reset date (first day of next month)
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    return new Response(
      JSON.stringify({
        success: true,
        usage: {
          current: totalCalls,
          limit: limit,
          remaining: Math.max(0, limit - totalCalls),
          reset_date: nextReset.toISOString(),
          calls_by_endpoint: usageData?.reduce((acc: any, call) => {
            acc[call.endpoint] = (acc[call.endpoint] || 0) + 1
            return acc
          }, {}) || {}
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('API Usage Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})