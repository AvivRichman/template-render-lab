import { createClient } from "npm:@supabase/supabase-js@2.28.0";

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

console.info("svg-to-png-renderer function initialized");

let resvgModule = null;
let wasmInitialized = false;

async function ensureWasmInit() {
  if (wasmInitialized) return;
  
  try {
    // Try different initialization approaches for resvg-wasm
    resvgModule = await import("npm:@resvg/resvg-wasm@2.3.0");
    
    console.log("Module keys:", Object.keys(resvgModule));
    console.log("Module default type:", typeof resvgModule.default);
    console.log("Module init type:", typeof resvgModule.init);
    console.log("Module initWasm type:", typeof resvgModule.initWasm);
    
    // Method 1: Check if module has initWasm function
    if (typeof resvgModule.initWasm === "function") {
      console.log("Using initWasm method");
      await resvgModule.initWasm();
    }
    // Method 2: Check if module has init function
    else if (typeof resvgModule.init === "function") {
      console.log("Using init method");
      await resvgModule.init();
    }
    // Method 3: Check if the default export is an init function
    else if (typeof resvgModule.default === "function") {
      console.log("Using default method");
      await resvgModule.default();
    }
    // Method 4: Try with manual WASM fetch
    else {
      console.log("Trying manual WASM fetch");
      const wasmUrl = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.3.0/index_bg.wasm";
      const resp = await fetch(wasmUrl);
      if (!resp.ok) throw new Error(`Failed to fetch WASM binary: ${resp.status}`);
      
      const wasmArrayBuffer = await resp.arrayBuffer();
      
      if (typeof resvgModule.init === "function") {
        await resvgModule.init(wasmArrayBuffer);
      } else if (typeof resvgModule.default === "function") {
        await resvgModule.default(wasmArrayBuffer);
      } else {
        // Try to find any init-like function in the module
        const initFunctions = Object.keys(resvgModule).filter(key => 
          key.toLowerCase().includes('init') && typeof resvgModule[key] === 'function'
        );
        
        console.log("Found init functions:", initFunctions);
        
        if (initFunctions.length > 0) {
          await resvgModule[initFunctions[0]](wasmArrayBuffer);
        } else {
          // Last resort: the module might auto-initialize
          console.warn("No init function found, hoping module auto-initializes");
        }
      }
    }
    
    wasmInitialized = true;
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
  
  const Resvg = resvgModule.Resvg;
  if (!Resvg) throw new Error("Resvg class not available on module");
  
  const resvg = new Resvg(svg, {
    fitTo: width || height ? {
      mode: "width",
      value: width ?? 0
    } : undefined
  });
  
  const pngData = resvg.render();
  const png = pngData.asPng();
  
  return png;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
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
    
    if (!key) {
      return new Response(JSON.stringify({
        error: "Missing 'key' (path to svg in bucket)"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    
    const width = widthParam ? parseInt(widthParam, 10) : undefined;
    
    const svg = await fetchSvg(bucket, key);
    const pngBytes = await svgToPng(svg, width);
    
    const pngPath = key.replace(/\.svg$/i, "") + ".png";
    await uploadPng(bucket, pngPath, pngBytes);
    
    // Get public URL for PNG
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
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
    
  } catch (err) {
    console.error("Error converting svg to png:", err);
    return new Response(JSON.stringify({
      error: String(err)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
});