import React, { useEffect, useRef, useState } from 'react';
import { restoreSaves, requestSave } from '../utils/saveManager';
import { decompressBrotliData } from '../utils/brotli';
import { Maximize2, RotateCcw, Volume2, VolumeX, ShieldAlert } from 'lucide-react';

interface GameCanvasProps {
  onGameLoaded?: () => void;
}

const KEY_MAP: Record<string, number> = {
  Escape: 0x1b,
  Space: 0x20,
  Enter: 0x0d,
  Backspace: 0x08,
  Tab: 0x09,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  KeyW: 0x57,
  KeyA: 0x41,
  KeyS: 0x53,
  KeyD: 0x44,
  KeyQ: 0x51,
  KeyE: 0x45,
  KeyR: 0x52,
  KeyF: 0x46,
  KeyP: 0x50,
};

const SCAN_MAP: Record<string, number> = {
  Escape: 0x01,
  Space: 0x39,
  Enter: 0x1c,
  Backspace: 0x0e,
  Tab: 0x0f,
  ArrowLeft: 0x4b,
  ArrowUp: 0x48,
  ArrowRight: 0x4d,
  ArrowDown: 0x50,
  KeyW: 0x11,
  KeyA: 0x1e,
  KeyS: 0x1f,
  KeyD: 0x20,
  KeyQ: 0x10,
  KeyE: 0x12,
  KeyR: 0x13,
  KeyF: 0x21,
  KeyP: 0x19,
};

async function safeFetchAsset(url: string) {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    return new Response(new ArrayBuffer(0), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }
  return res;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ onGameLoaded }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loadingText, setLoadingText] = useState('LOADING GAME...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    let saveInterval: any = null;
    let isMounted = true;

    // Safely wrap window.fetch using Object.defineProperty to intercept WASM/Data HTML SPA fallbacks
    const originalFetch = window.fetch;
    try {
      const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        const res = await originalFetch(input, init);
        const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        const contentType = res.headers.get('content-type') || '';
        console.log(`[Fetch Debug] Request: ${urlStr}, Content-Type: ${contentType}, Status: ${res.status}`);

        if (urlStr.endsWith('.wasm') || urlStr.endsWith('.data') || urlStr.includes('gd_web.')) {
          if (contentType.includes('text/html')) {
            console.error(`[Fetch Blocked] Blocked HTML fallback for: ${urlStr}`);
            return new Response(new ArrayBuffer(0), {
              status: 404,
              statusText: 'Not Found',
              headers: { 'Content-Type': 'application/octet-stream' },
            });
          }
        }
        return res;
      };

      Object.defineProperty(window, 'fetch', {
        value: customFetch,
        writable: true,
        configurable: true,
      });

      // Also intercept XMLHttpRequest to prevent HTML fallbacks
      const OriginalXHR = window.XMLHttpRequest;
      (window as any).XMLHttpRequest = class extends OriginalXHR {
        open(method: string, url: string, ...args: any[]) {
          if (url.endsWith('.wasm') || url.endsWith('.data') || url.includes('gd_web.')) {
            this.addEventListener('readystatechange', () => {
              if (this.readyState === 2 && this.getResponseHeader('Content-Type')?.includes('text/html')) {
                console.warn(`HTML fallback detected for XHR: ${url}`);
              }
            });
          }
          (super.open as any)(method, url, ...args);
        }
      };
      // Force ArrayBuffer instantiation to bypass streaming MIME type issues
      if (typeof WebAssembly !== 'undefined' && WebAssembly.instantiateStreaming) {
        WebAssembly.instantiateStreaming = async (source, importObject) => {
          const response = await (source as Promise<Response>);
          const buffer = await response.arrayBuffer();
          return WebAssembly.instantiate(buffer, importObject);
        };
      }
    } catch (e) { console.error('Failed to intercept network requests', e); }

    function pushInput(code: number, p1: number, p2: number) {
      if ((window as any).Module && (window as any).Module.gdInputQueue) {
        (window as any).Module.gdInputQueue.push([code | 0, p1 | 0, p2 | 0]);
      }
    }

    function ackFocus() {
      pushInput(6, 1, 0);
      pushInput(7, 0, 0);
      pushInput(28, 1, 0);
    }
    (window as any).__gdAckFocus = ackFocus;

    function startupError(err: any) {
      console.error('Geometry Dash startup notice:', err);
      if (isMounted) {
        const msg = typeof err === 'string' ? err : err?.message || 'Failed to initialize WebAssembly engine';
        if (
          !msg.includes('UnexpectedEof') &&
          !msg.includes('Brotli decompress failed') &&
          !msg.includes("doesn't parse at byte 0")
        ) {
          setErrorMsg(msg);
        }
      }
    }

    async function initGame() {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;

      (window as any).__gdInputReady = false;
      (window as any).__gdGameLoaded = false;
      (window as any).__gdSaveReady = false;

      (window as any).Module = {
        canvas: canvas,
        gdInputQueue: [],
        gdCursorPos: [0, 0],
        gdKeyState: new Uint8Array(256),
        locateFile: (p: string) => {
          console.log('Module locateFile requested:', p);
          return p;
        },
        print: () => {},
        printErr: (e: any) => console.error(e),
        onAbort: (e: any) => startupError(e),
        onRuntimeInitialized: async function () {
          try {
            (window as any).__gdInputReady = true;

            if ((window as any).Module._gd_init) {
              (window as any).Module._gd_init(0);
            }

            try {
              if ((window as any).Module.FS) {
                (window as any).Module.FS.mkdir('/Resources');
                (window as any).Module.FS.mkdir('/Resources/bin');
                (window as any).Module.FS.mkdir('/Resources/icons');
                (window as any).Module.FS.mkdir('/Resources/levels');
                (window as any).Module.FS.mkdir('/Resources/sfx');
                (window as any).Module.FS.mkdir('/Resources/songs');
              }
            } catch (_) {}

            await restoreSaves();

            if ((window as any).Module._gd_autosave_set) {
              (window as any).Module._gd_autosave_set(1);
            }

            (window as any).__gdGameLoaded = true;
            (window as any).__gdSaveReady = true;

            if ((window as any).__gdAckFocus) {
              (window as any).__gdAckFocus();
            }

            if (isMounted) {
              setIsLoaded(true);
              if (onGameLoaded) onGameLoaded();
            }

            saveInterval = setInterval(requestSave, 10000);

            const boot = (window as any).Module._gd_boot();
            if (boot && boot.catch) {
              boot.catch(startupError);
            }

            const checkReady = () => {
              if ((window as any).Module._gd_is_ready && (window as any).Module._gd_is_ready() > 0) {
                if (canvasRef.current) {
                  canvasRef.current.focus({ preventScroll: true });
                }
              } else {
                requestAnimationFrame(checkReady);
              }
            };
            requestAnimationFrame(checkReady);
          } catch (err) {
            startupError(err);
          }
        },
      };

      try {
        if (isMounted) {
          setLoadingText('LOADING BROTLI LICENSE & SCRIPTS...');
          setLoadingProgress(20);
        }

        // 1. BROTLI-LICENSE.txt is plain text
        const licenseRes = await safeFetchAsset('/BROTLI-LICENSE.txt');
        const licenseBuf = await licenseRes.arrayBuffer();

        // 2. Fetch gd_web.js.br
        if (isMounted) {
          setLoadingText('LOADING GAME ENGINE SCRIPT...');
          setLoadingProgress(50);
        }

        const jsRes = await safeFetchAsset('/gd_web.js.br');
        if (!jsRes.ok) throw new Error(`Failed to fetch gd_web.js.br: ${jsRes.status}`);
        const jsBytes = new Uint8Array(await jsRes.arrayBuffer());

        let jsText = '';
        const textDecoder = new TextDecoder();
        const candidateText = textDecoder.decode(jsBytes);

        // Check if browser's native network layer automatically decompressed Content-Encoding: br
        if (candidateText.includes('ENVIRONMENT_IS_WEB') || candidateText.includes('var Module')) {
          jsText = candidateText;
        } else {
          // Manually decompress if browser returned raw Brotli bytes
          const decompressed = await decompressBrotliData(jsBytes);
          jsText = textDecoder.decode(decompressed);
        }

        // 3. Check data parts availability
        if (isMounted) {
          setLoadingText('LOADING GAME ASSETS...');
          setLoadingProgress(80);
        }

        const validPartChunks: Uint8Array[] = [];
        let totalDataBytes = 0;

        for (let i = 1; i <= 13; i++) {
          try {
            const partUrl = `/gd_web.data.br.part${i}`;
            const res = await safeFetchAsset(partUrl);
            const contentType = res.headers.get('content-type') || '';

            if (res.ok && !contentType.includes('text/html')) {
              const buf = new Uint8Array(await res.arrayBuffer());
              if (buf.length > 0 && !(buf[0] === 60 && buf[1] === 33)) {
                validPartChunks.push(buf);
                totalDataBytes += buf.length;
              }
            }
          } catch (_) {
            // Ignore missing parts
          }
        }

        let dataPackageBuffer: any = new ArrayBuffer(0);

        if (validPartChunks.length === 13) {
          const combinedData = new Uint8Array(totalDataBytes);
          let offset = 0;
          for (const chunk of validPartChunks) {
            combinedData.set(chunk, offset);
            offset += chunk.length;
          }

          try {
            if (isMounted) setLoadingText('DECOMPRESSING DATA PACKAGE...');
            const decompressedData = await decompressBrotliData(combinedData);
            dataPackageBuffer = decompressedData.buffer;
          } catch (e) {
            console.warn('Brotli decompress skipped:', e);
          }
        }

        if (isMounted) {
          setLoadingProgress(100);
          setLoadingText('STARTING GEOMETRY DASH...');
        }

        (window as any).Module.BROTLI_LICENSE = licenseBuf;
        (window as any).Module.getPreloadedPackage = () => dataPackageBuffer;

        // Execute game engine script ONCE to avoid duplicate variable declarations (ExitStatus)
        if (!document.getElementById('gd-game-engine-script')) {
          const scriptEl = document.createElement('script');
          scriptEl.id = 'gd-game-engine-script';
          scriptEl.textContent = jsText;
          document.body.appendChild(scriptEl);
        }
      } catch (err: any) {
        startupError(err);
      }
    }

    initGame();

    // Global keyboard listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(window as any).__gdGameLoaded) return;
      const vk = KEY_MAP[e.code] || e.keyCode || 0;
      if (!vk) return;

      if ((window as any).Module && (window as any).Module.gdKeyState) {
        (window as any).Module.gdKeyState[vk & 0xff] = 1;
      }

      const scanCode = SCAN_MAP[e.code] || 0;
      const param = 1 | (scanCode << 16);
      pushInput(0x100, vk, param);

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!(window as any).__gdGameLoaded) return;
      const vk = KEY_MAP[e.code] || e.keyCode || 0;
      if (!vk) return;

      if ((window as any).Module && (window as any).Module.gdKeyState) {
        (window as any).Module.gdKeyState[vk & 0xff] = 0;
      }

      const scanCode = SCAN_MAP[e.code] || 0;
      let param = 1 | (scanCode << 16);
      param |= -0x40000000;
      pushInput(0x101, vk, param);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      isMounted = false;
      try {
        Object.defineProperty(window, 'fetch', {
          value: originalFetch,
          writable: true,
          configurable: true,
        });
      } catch (_) {}
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (saveInterval) clearInterval(saveInterval);
    };
  }, []);

  // Mouse canvas input handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!(window as any).__gdInputReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1919, Math.round(((e.clientX - rect.left) * 1920) / rect.width)));
    const y = Math.max(0, Math.min(1079, Math.round(((e.clientY - rect.top) * 1080) / rect.height)));

    (window as any).Module.gdCursorPos = [x, y];
    const packedPos = (x & 0xffff) | ((y & 0xffff) << 16);

    const btnCode = e.button === 2 ? 0x204 : e.button === 1 ? 0x207 : 0x201;
    const btnParam = e.button === 2 ? 2 : e.button === 1 ? 0x10 : 1;

    try {
      (window as any).Module.gdInputQueue.push([btnCode, btnParam, packedPos]);
    } catch (_) {}
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!(window as any).__gdInputReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1919, Math.round(((e.clientX - rect.left) * 1920) / rect.width)));
    const y = Math.max(0, Math.min(1079, Math.round(((e.clientY - rect.top) * 1080) / rect.height)));

    const packedPos = (x & 0xffff) | ((y & 0xffff) << 16);
    const releaseCode = e.button === 2 ? 0x205 : e.button === 1 ? 0x208 : 0x202;

    try {
      (window as any).Module.gdInputQueue.push([releaseCode, 0, packedPos]);
      (window as any).Module.gdInputQueue.push([0x200, 0, packedPos]);
    } catch (_) {}
  };

  const toggleFullscreen = () => {
    if (!canvasRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvasRef.current.requestFullscreen();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {!isLoaded && !errorMsg && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md p-6">
          <div className="relative flex flex-col items-center space-y-6 max-w-lg w-full text-center">
            <img src="/ref/logo.png" alt="Geometry Dash Logo" className="w-80 max-w-[80vw] object-contain animate-float" />

            <div className="text-xl md:text-2xl font-black font-pixel gd-gradient-text tracking-widest animate-pulse">
              {loadingText}
            </div>

            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-cyan-500/40 shadow-[0_0_20px_rgba(0,195,255,0.4)]">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-green-400 to-yellow-400 rounded-full transition-all duration-200"
                style={{ width: `${Math.max(5, loadingProgress)}%` }}
              />
            </div>

            <p className="text-xs text-slate-400">Geometry Dash WebAssembly Engine • Click or press Space to jump</p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <div className="p-6 bg-red-950/60 border border-red-500/50 rounded-2xl flex flex-col items-center space-y-4 max-w-md shadow-2xl">
            <ShieldAlert className="w-14 h-14 text-red-500 animate-pulse" />
            <h2 className="text-xl font-bold text-red-400">Startup Error</h2>
            <p className="text-sm text-slate-300">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition shadow-lg flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload Game</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Canvas Controls HUD */}
      {isLoaded && (
        <div className="absolute top-4 right-4 z-40 flex items-center space-x-2 bg-slate-900/80 backdrop-blur border border-slate-700/50 p-1.5 rounded-xl shadow-xl">
          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
          >
            <Maximize2 className="w-5 h-5 text-yellow-400" />
          </button>
        </div>
      )}

      {/* WebGL / Emscripten Canvas */}
      <canvas
        id="canvas"
        ref={canvasRef}
        width={1920}
        height={1080}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        tabIndex={0}
        className="w-full h-full object-contain outline-none touch-none cursor-pointer"
      />
    </div>
  );
};
