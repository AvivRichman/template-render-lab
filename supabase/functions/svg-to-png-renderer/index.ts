import { createClient } from "npm:@supabase/supabase-js@2.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
console.info("svg-to-png-renderer function initialized");

let resvgModule = null;
let wasmInitialized = false;

async function ensureWasmInit() {
  if (wasmInitialized) return;
  try {
    // Import the resvg-wasm module
    resvgModule = await import("npm:@resvg/resvg-wasm@2.3.0");
    console.log("Module imported, available exports:", Object.keys(resvgModule));
    
    // Try different initialization methods
    if (typeof resvgModule.initWasm === "function") {
      console.log("Using initWasm method");
      await resvgModule.initWasm();
    } else if (typeof resvgModule.default === "function") {
      console.log("Using default function");
      await resvgModule.default();
    } else if (typeof resvgModule.init === "function") {
      console.log("Using init function");
      await resvgModule.init();
    } else {
      // Fallback: the module might be self-initializing
      console.log("No explicit init function found, assuming auto-initialization");
    }
    wasmInitialized = true;
    console.log("WASM initialization completed successfully");
  } catch (error) {
    console.error("WASM initialization failed:", error);
    throw new Error(`Failed to initialize resvg-wasm: ${error.message}`);
  }
}

async function fetchSvg(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return new TextDecoder().decode(arrayBuffer);
}

async function uploadPng(bucket, path, pngBytes, contentType = "image/png") {
  const { data, error } = await supabase.storage.from(bucket).upload(path, pngBytes, {
    contentType,
    upsert: true
  });
  if (error) throw error;
  return data;
}

async function svgToPng(svg, width, height) {
  await ensureWasmInit();
  
  try {
    console.log("Available in resvgModule:", Object.keys(resvgModule));
    
    // Try different ways to access the Resvg class
    let Resvg = resvgModule.Resvg || resvgModule.default?.Resvg || resvgModule.default;
    
    if (!Resvg) {
      console.error("Available properties:", Object.keys(resvgModule));
      throw new Error("Resvg class not found in module");
    }
    
    console.log("Creating Resvg instance with SVG length:", svg.length);
    
    const options = {};
    if (width || height) {
      options.fitTo = {
        mode: "width",
        value: width || 800
      };
    }
    
    const resvg = new Resvg(svg, options);
    console.log("Resvg instance created, rendering...");
    
    const pngData = resvg.render();
    console.log("Rendering complete, getting PNG bytes...");
    
    const png = pngData.asPng();
    console.log("PNG conversion successful, size:", png.length, "bytes");
    
    return png;
  } catch (error) {
    console.error("Error in svgToPng:", error);
    throw new Error(`SVG to PNG conversion failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    let bucket = params.get("bucket");
    let key = params.get("key");
    let widthParam = params.get("width");
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      bucket = bucket ?? body.bucket;
      key = key ?? body.key;
      widthParam = widthParam ?? (body.width !== undefined ? String(body.width) : null);
    }
    if (!bucket) bucket = "api-renders";
    if (!key) return new Response(JSON.stringify({
      error: "Missing 'key' (path to svg in bucket)"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
    const width = widthParam ? parseInt(widthParam, 10) : undefined;
    const svg = await fetchSvg(bucket, key);
    const pngBytes = await svgToPng(svg, width);
    const pngPath = key.replace(/\.svg$/i, "") + ".png";
    await uploadPng(bucket, pngPath, pngBytes);
    
    // Get public URL for the PNG
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(pngPath);

    const resBody = {
      bucket,
      svg_path: key,
      png_path: pngPath,
      png_url: urlData.publicUrl
    };
    return new Response(JSON.stringify(resBody), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Error converting svg to png:", err);
    return new Response(JSON.stringify({
      error: String(err)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});