let isBrotliInitialized = false;
let brotliInitPromise: Promise<void> | null = null;
let brotliDecompressFn: ((data: Uint8Array) => Uint8Array) | null = null;

export async function ensureBrotliReady(): Promise<void> {
  if (isBrotliInitialized) return;
  if (brotliInitPromise) return brotliInitPromise;

  brotliInitPromise = (async () => {
    try {
      const decoderScriptPath = '/brotli-decoder.js';
      // Use dynamic URL string variable so TypeScript compiler doesn't attempt module resolution
      const module: any = await import(/* @vite-ignore */ decoderScriptPath);
      const initBrotli = module.default;
      brotliDecompressFn = module.decompress;

      const res = await fetch('/brotli-decoder.wasm', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Failed to load brotli-decoder.wasm: ${res.status}`);
      const wasmBuffer = await res.arrayBuffer();
      await initBrotli(wasmBuffer);
      isBrotliInitialized = true;
    } catch (err) {
      brotliInitPromise = null;
      throw err;
    }
  })();

  return brotliInitPromise;
}

export async function decompressBrotliData(buffer: Uint8Array): Promise<Uint8Array> {
  await ensureBrotliReady();
  if (!brotliDecompressFn) throw new Error('Brotli decompress function unavailable');
  return brotliDecompressFn(buffer);
}
