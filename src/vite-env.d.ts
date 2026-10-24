/// <reference types="vite/client" />

declare module '/brotli-decoder.js' {
  const initBrotli: (wasmModule?: ArrayBuffer | Response | string) => Promise<any>;
  export const decompress: (buffer: Uint8Array) => Uint8Array;
  export const compress: (buffer: Uint8Array, level?: number) => Uint8Array;
  export default initBrotli;
}
