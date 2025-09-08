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
    
    // Create a simple test image (100x100 pixel red square)
    // In a real implementation, this would render the actual Fabric.js scene
    const timestamp = Date.now();
    const imagePath = `${user_id}/generated-${template_id}-${timestamp}.png`;
    
    // Create a more visible 100x100 red square PNG
    const width = 100;
    const height = 100;
    
    // PNG file structure for a 100x100 red image
    const createPNG = (width: number, height: number, r: number, g: number, b: number) => {
      const pixelData = [];
      for (let y = 0; y < height; y++) {
        pixelData.push(0); // Filter type for each row
        for (let x = 0; x < width; x++) {
          pixelData.push(r, g, b); // RGB values
        }
      }
      
      // Simple PNG creation (this is a basic implementation)
      const data = new Uint8Array(pixelData);
      const compressed = new Uint8Array([
        0x78, 0x9C, // zlib header
        0x01, // final block, uncompressed
        ...new Uint8Array(new Uint32Array([data.length]).buffer).reverse(), // length (little endian)
        ...new Uint8Array(new Uint32Array([~data.length]).buffer).reverse(), // ~length (little endian)
        ...data
      ]);
      
      const crc32 = (data: Uint8Array) => {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
          crc ^= data[i];
          for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
          }
        }
        return (~crc >>> 0);
      };
      
      const ihdrData = new Uint8Array([
        ...new Uint8Array(new Uint32Array([width]).buffer).reverse(),
        ...new Uint8Array(new Uint32Array([height]).buffer).reverse(),
        8, 2, 0, 0, 0 // bit depth, color type, compression, filter, interlace
      ]);
      
      const idatChunk = new Uint8Array([73, 68, 65, 84, ...compressed]);
      
      return new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        ...ihdrData,
        ...new Uint8Array(new Uint32Array([crc32(new Uint8Array([0x49, 0x48, 0x44, 0x52, ...ihdrData]))]).buffer).reverse(),
        ...new Uint8Array(new Uint32Array([compressed.length]).buffer).reverse(), // IDAT length
        ...idatChunk,
        ...new Uint8Array(new Uint32Array([crc32(idatChunk)]).buffer).reverse(),
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // IEND CRC
      ]);
    };
    
    // Create a bright red test image
    const mockPngContent = createPNG(width, height, 255, 0, 0);
    
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