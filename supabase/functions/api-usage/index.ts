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
    console.log('API Usage - Request received');
    
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

    // Get current month's usage
    const currentMonth = new Date();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    
    const { data: apiUsage, error: usageError } = await supabase
      .from('api_usage')
      .select('*')
      .eq('user_id', user.id)
      .gte('called_at', firstDayOfMonth.toISOString());

    if (usageError) {
      console.error('Usage error:', usageError);
      return new Response(JSON.stringify({ error: 'Failed to fetch usage data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Count usage by endpoint
    const usageByEndpoint = apiUsage?.reduce((acc: any, usage: any) => {
      acc[usage.endpoint] = (acc[usage.endpoint] || 0) + 1;
      return acc;
    }, {}) || {};

    const totalCalls = apiUsage?.length || 0;
    const limit = 70; // Free plan limit

    // Get next reset date (first day of next month)
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

    console.log(`User has made ${totalCalls} API calls this month`);

    // Log this API usage call
    await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        endpoint: '/api-usage'
      });

    return new Response(JSON.stringify({
      success: true,
      usage: {
        current_month: {
          total_calls: totalCalls,
          limit: limit,
          remaining: Math.max(0, limit - totalCalls),
          by_endpoint: usageByEndpoint
        },
        reset_date: nextMonth.toISOString().split('T')[0],
        plan: 'free'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in api-usage function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});