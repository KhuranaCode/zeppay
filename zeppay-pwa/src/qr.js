import jsQR from 'jsqr';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// Two decoders: jsQR is fast; zxing-cpp (wasm, bundled and precached so it works offline)
// handles styled dots, centre logos, glare and perspective, which jsQR misses.
let zx = null;
const loadZx = () => zx || (zx = import('zxing-wasm/reader').then((m) => {
  m.setZXingModuleOverrides({ locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) });
  return m;
}));

export async function decodeImageData(d, { deep = true } = {}) {
  const j = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
  if (j && j.data) return j.data;
  if (!deep) return null;
  try {
    const m = await loadZx();
    const r = await m.readBarcodes(d, { formats: ['QRCode'], tryHarder: true, tryInvert: true, tryRotate: true, tryDownscale: true, maxNumberOfSymbols: 1 });
    const hit = r.find((x) => x.isValid && x.text);
    return hit ? hit.text : null;
  } catch { return null; }
}
