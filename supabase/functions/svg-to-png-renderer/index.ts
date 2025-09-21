import { createClient } from "npm:@supabase/supabase-js@2.28.0";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
console.info("svg-to-png-renderer function initialized");

let resvgModule: any = null;
let wasmInitialized = false;
let fontsLoaded = false;

const FONT_DEFINITIONS = [
  {
    source: "https://unpkg.com/@fontsource/dejavu-sans/files/dejavu-sans-latin-400-normal.ttf",
    families: ["DejaVu Sans", "Arial"],
    weight: 400,
    style: "normal" as const,
  },
];

const fontByteCache = new Map<string, Uint8Array>();

async function loadFontBytes(source: string): Promise<Uint8Array> {
  if (fontByteCache.has(source)) {
    return fontByteCache.get(source)!;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch font from ${source}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  fontByteCache.set(source, bytes);
  return bytes;
}

async function ensureWasmInit() {
  if (wasmInitialized) return;
  try {
    // Import the resvg-wasm module
    resvgModule = await import("npm:@resvg/resvg-wasm@2.6.2");
    console.log("Module imported successfully");
    
    // Initialize WASM with the correct method
    await resvgModule.initWasm(
      fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
    );
    
    wasmInitialized = true;
    console.log("WASM initialization completed successfully");
  } catch (error) {
    console.error("WASM initialization failed:", error);
    throw new Error(`Failed to initialize resvg-wasm: ${error.message}`);
  }
}

async function ensureFontsLoaded() {
  if (fontsLoaded) {
    return;
  }

  if (!wasmInitialized) {
    await ensureWasmInit();
  }

  try {
    for (const font of FONT_DEFINITIONS) {
      const data = await loadFontBytes(font.source);
      for (const family of font.families) {
        await resvgModule.loadFont(data, {
          family,
          weight: font.weight,
          style: font.style,
        });
        console.log(`Loaded font family "${family}" from ${font.source}`);
      }
    }
    fontsLoaded = true;
  } catch (error) {
    console.error("Failed to load fonts for resvg:", error);
    throw new Error(`Failed to load fonts: ${error.message}`);
  }
}

async function fetchSvg(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return new TextDecoder().decode(arrayBuffer);
}

async function uploadImage(bucket, path, bytes, contentType) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true
  });
  if (error) throw error;
  return data;
}

async function svgToPng(svg, width, height) {
  await ensureWasmInit();
  await ensureFontsLoaded();

  try {
    console.log("Creating Resvg instance with SVG length:", svg.length);
    
    const options = {};
    if (width || height) {
      options.fitTo = {
        mode: "width",
        value: width || 800
      };
    }
    
    // Use the resvg module directly (it should be globally available after initWasm)
    const resvgJS = new resvgModule.Resvg(svg, options);
    console.log("Resvg instance created, rendering...");
    
    const pngData = resvgJS.render();
    console.log("Rendering complete, getting PNG bytes...");
    
    const pngBuffer = pngData.asPng();
    console.log("PNG conversion successful, size:", pngBuffer.length, "bytes");

    return pngBuffer;
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
    await uploadImage(bucket, pngPath, pngBytes, "image/png");

    let jpegPath: string | null = pngPath.replace(/\.png$/i, ".jpg");
    let jpegUrl: string | null = null;

    try {
      const image = await Image.decode(pngBytes);
      const jpegBytes = await image.encodeJPEG(90);
      if (!jpegPath) {
        throw new Error("JPEG path is undefined");
      }
      await uploadImage(bucket, jpegPath, jpegBytes, "image/jpeg");

      if (jpegPath) {
        const { data: jpegUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(jpegPath);
        jpegUrl = jpegUrlData.publicUrl;
      }
    } catch (jpegError) {
      console.error("JPEG conversion failed:", jpegError);
      jpegPath = null;
    }

    // Get public URL for the PNG
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(pngPath);

    const resBody = {
      bucket,
      svg_path: key,
      png_path: pngPath,
      png_url: urlData.publicUrl,
      jpeg_path: jpegPath,
      jpeg_url: jpegUrl
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