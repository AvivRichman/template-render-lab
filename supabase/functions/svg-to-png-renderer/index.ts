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
  // Fetch the WASM binary
  const wasmUrl = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.3.0/index_bg.wasm";
  const resp = await fetch(wasmUrl);
  if (!resp.ok) throw new Error(`Failed to fetch WASM binary: ${resp.status}`);
  const wasmArrayBuffer = await resp.arrayBuffer();
  // Dynamically import the module AFTER fetching the wasm binary so we control initialization
  // This avoids the module trying to resolve a relative 'index_bg.wasm' URL at import time
  resvgModule = await import("npm:@resvg/resvg-wasm@2.3.0");
  // Some versions export an `init` named export, some default-export a function — handle both
  if (typeof resvgModule.init === "function") {
    await resvgModule.init(wasmArrayBuffer);
  } else if (typeof resvgModule.default === "function") {
    await resvgModule.default(wasmArrayBuffer);
  } else {
    throw new Error("resvg-wasm module does not expose an init function");
  }
  wasmInitialized = true;
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