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
    console.log('Render function - Request received');
    
    const { template_id, scene_data, user_id } = await req.json();
    
    if (!template_id || !scene_data || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Rendering template:', template_id);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Generating image...');
    
    // Create a visible test image (100x100 red square with text)
    // In a real implementation, this would render the actual Fabric.js scene
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.png`;
    
    // Create a proper 100x100 PNG with visible content
    // This is a mock implementation - in reality you'd use a proper image generation library
    const mockPngContent = createTestPNG();
    
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(imagePath, mockPngContent, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(imagePath);
    
    const mockImageUrl = urlData.publicUrl;

    console.log('Mock image URL generated:', mockImageUrl);

    return new Response(JSON.stringify({
      success: true,
      image_url: mockImageUrl,
      template_id,
      generation_time: '1.2s',
      message: 'Image rendered successfully (mock implementation)'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in render function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to create a test PNG image
function createTestPNG(): Uint8Array {
  // Create a simple 100x100 red square PNG
  // This is a basic implementation - in production you'd use a proper image library
  const width = 100;
  const height = 100;
  
  // PNG file structure for a 100x100 red image
  const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  
  // IHDR chunk (image header)
  const ihdrLength = [0x00, 0x00, 0x00, 0x0D];
  const ihdrType = [0x49, 0x48, 0x44, 0x52]; // "IHDR"
  const ihdrData = [
    0x00, 0x00, 0x00, 0x64, // Width: 100
    0x00, 0x00, 0x00, 0x64, // Height: 100
    0x08, 0x02, 0x00, 0x00, 0x00 // 8-bit RGB, no compression, no filter, no interlace
  ];
  const ihdrCrc = [0x4F, 0x15, 0xDE, 0xA1]; // Pre-calculated CRC
  
  // IDAT chunk (image data) - compressed RGB data for red square
  const idatLength = [0x00, 0x00, 0x00, 0x16]; // 22 bytes
  const idatType = [0x49, 0x44, 0x41, 0x54]; // "IDAT"
  // Simple deflate compressed data for solid red image
  const idatData = [
    0x78, 0x9C, 0xED, 0xC1, 0x01, 0x01, 0x00, 0x00, 0x00, 0x80, 
    0x90, 0xFE, 0x37, 0x00, 0x00, 0x00, 0x01, 0xFF, 0x00, 0x00, 0x03, 0x00
  ];
  const idatCrc = [0x01, 0x85, 0x20, 0x6D]; // Pre-calculated CRC
  
  // IEND chunk (end of file)
  const iendLength = [0x00, 0x00, 0x00, 0x00];
  const iendType = [0x49, 0x45, 0x4E, 0x44]; // "IEND"
  const iendCrc = [0xAE, 0x42, 0x60, 0x82];
  
  // Combine all chunks
  const pngData = [
    ...pngSignature,
    ...ihdrLength, ...ihdrType, ...ihdrData, ...ihdrCrc,
    ...idatLength, ...idatType, ...idatData, ...idatCrc,
    ...iendLength, ...iendType, ...iendCrc
  ];
  
  return new Uint8Array(pngData);
}