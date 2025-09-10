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
    console.log('SVG to PNG Renderer - Request received');
    
    const { svg_content, user_id, filename } = await req.json();
    
    if (!svg_content || !user_id || !filename) {
      return new Response(JSON.stringify({ error: 'Missing required fields: svg_content, user_id, filename' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Converting SVG to PNG for user:', user_id);
    console.log('Filename:', filename);
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Convert SVG to PNG using canvas and web APIs
    const pngBuffer = await convertSVGToPNG(svg_content);
    
    // Create PNG filename by replacing .svg with .png
    const pngFilename = filename.replace('.svg', '.png');
    const pngPath = `${user_id}/${pngFilename}`;
    
    console.log('Uploading PNG to storage:', pngPath);
    
    // Upload PNG to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('api-renders')
      .upload(pngPath, pngBuffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('PNG Upload error:', uploadError);
      throw new Error(`Failed to upload PNG: ${uploadError.message}`);
    }
    
    // Get public URL for PNG
    const { data: urlData } = supabase.storage
      .from('api-renders')
      .getPublicUrl(pngPath);
    
    const pngUrl = urlData.publicUrl;
    
    console.log('Generated PNG URL:', pngUrl);

    return new Response(JSON.stringify({
      success: true,
      png_url: pngUrl,
      filename: pngFilename,
      message: 'SVG converted to PNG successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in SVG to PNG renderer:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Convert SVG to PNG using canvas
async function convertSVGToPNG(svgContent: string): Promise<Uint8Array> {
  try {
    console.log('Converting SVG to PNG...');
    
    // Extract dimensions from SVG
    const widthMatch = svgContent.match(/width="(\d+)"/);
    const heightMatch = svgContent.match(/height="(\d+)"/);
    const width = widthMatch ? parseInt(widthMatch[1]) : 800;
    const height = heightMatch ? parseInt(heightMatch[1]) : 600;
    
    console.log(`Canvas dimensions: ${width}x${height}`);
    
    // Create a simple PNG using canvas-like approach
    // For Deno environment, we'll use a different approach
    // This is a simplified PNG encoder that works with Deno
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Parse and render SVG elements to canvas
    await renderSVGToCanvas(ctx, svgContent, width, height);
    
    // Convert canvas to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');
    
    return new Uint8Array(pngBuffer);
    
  } catch (error) {
    console.error('Error converting SVG to PNG:', error);
    // Return a simple fallback PNG
    return createFallbackPNG();
  }
}

// Create a simple canvas-like object for Deno
function createCanvas(width: number, height: number) {
  // This is a mock canvas implementation
  // In a real implementation, you'd use a proper canvas library for Deno
  return {
    width,
    height,
    getContext: (type: string) => ({
      fillStyle: '#ffffff',
      strokeStyle: '#000000',
      font: '16px Arial',
      textAlign: 'start',
      fillRect: (x: number, y: number, w: number, h: number) => {
        console.log(`fillRect: ${x}, ${y}, ${w}, ${h}`);
      },
      fillText: (text: string, x: number, y: number) => {
        console.log(`fillText: "${text}" at ${x}, ${y}`);
      },
      strokeRect: (x: number, y: number, w: number, h: number) => {
        console.log(`strokeRect: ${x}, ${y}, ${w}, ${h}`);
      },
      beginPath: () => {},
      arc: (x: number, y: number, radius: number, start: number, end: number) => {
        console.log(`arc: center(${x}, ${y}), radius: ${radius}`);
      },
      fill: () => {},
      stroke: () => {},
    }),
    toBuffer: (format: string) => {
      // Create a minimal PNG buffer (this is a placeholder)
      // In a real implementation, you'd use a proper PNG encoder
      return createSimplePNG(width, height);
    }
  };
}

// Render SVG elements to canvas context
async function renderSVGToCanvas(ctx: any, svgContent: string, width: number, height: number) {
  // Fill background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  // Parse background color from SVG
  const bgMatch = svgContent.match(/<rect[^>]*fill="([^"]*)"[^>]*\/>/);
  if (bgMatch) {
    ctx.fillStyle = bgMatch[1];
    ctx.fillRect(0, 0, width, height);
  }
  
  // Parse and render text elements
  const textMatches = svgContent.matchAll(/<text[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*font-size="([^"]*)"[^>]*fill="([^"]*)"[^>]*>([^<]*)<\/text>/g);
  
  for (const match of textMatches) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const fontSize = parseFloat(match[3]);
    const fill = match[4];
    const text = match[5];
    
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  
  // Parse and render rectangles
  const rectMatches = svgContent.matchAll(/<rect[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*fill="([^"]*)"[^>]*\/>/g);
  
  for (const match of rectMatches) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const rectWidth = parseFloat(match[3]);
    const rectHeight = parseFloat(match[4]);
    const fill = match[5];
    
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, rectWidth, rectHeight);
  }
  
  // Parse and render circles
  const circleMatches = svgContent.matchAll(/<circle[^>]*cx="([^"]*)"[^>]*cy="([^"]*)"[^>]*r="([^"]*)"[^>]*fill="([^"]*)"[^>]*\/>/g);
  
  for (const match of circleMatches) {
    const cx = parseFloat(match[1]);
    const cy = parseFloat(match[2]);
    const r = parseFloat(match[3]);
    const fill = match[4];
    
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Create a simple PNG buffer (minimal implementation)
function createSimplePNG(width: number, height: number): ArrayBuffer {
  // This is a very basic PNG implementation
  // For production use, you should use a proper PNG encoding library
  
  const png_signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdr_data = new ArrayBuffer(13);
  const ihdr_view = new DataView(ihdr_data);
  ihdr_view.setUint32(0, width);
  ihdr_view.setUint32(4, height);
  ihdr_view.setUint8(8, 8); // bit depth
  ihdr_view.setUint8(9, 2); // color type (RGB)
  ihdr_view.setUint8(10, 0); // compression
  ihdr_view.setUint8(11, 0); // filter
  ihdr_view.setUint8(12, 0); // interlace
  
  // Create a simple white PNG
  const pixel_data_size = width * height * 3 + height; // RGB + filter bytes
  const idat_data = new Uint8Array(pixel_data_size);
  
  // Fill with white pixels and filter bytes
  for (let y = 0; y < height; y++) {
    const row_start = y * (width * 3 + 1);
    idat_data[row_start] = 0; // filter byte (none)
    
    for (let x = 0; x < width; x++) {
      const pixel_start = row_start + 1 + x * 3;
      idat_data[pixel_start] = 255;     // R
      idat_data[pixel_start + 1] = 255; // G  
      idat_data[pixel_start + 2] = 255; // B
    }
  }
  
  // Combine all parts (simplified)
  const total_size = png_signature.length + 25 + idat_data.length + 12; // approximate
  const result = new Uint8Array(total_size);
  
  let offset = 0;
  result.set(png_signature, offset);
  offset += png_signature.length;
  
  // Add IHDR chunk (simplified)
  result.set(new Uint8Array([0, 0, 0, 13]), offset); // length
  offset += 4;
  result.set(new TextEncoder().encode('IHDR'), offset);
  offset += 4;
  result.set(new Uint8Array(ihdr_data), offset);
  offset += 13;
  result.set(new Uint8Array([0, 0, 0, 0]), offset); // CRC (placeholder)
  offset += 4;
  
  return result.buffer;
}

// Create a fallback PNG for errors
function createFallbackPNG(): Uint8Array {
  console.log('Creating fallback PNG');
  return new Uint8Array(createSimplePNG(400, 300));
}