// ============================================================================
//  SHARPER PICTURES ON THE PHONE (batch 17): ESRGAN upscaling (UpscalerJS, MIT;
//  models copied from npm into /ai/upscale). Twice the size, finer detail, no
//  server and no key. Large pictures are done in tiles so a phone copes.
// ============================================================================
let upP = {};
async function upscaler(scale) {
  const k = scale === 4 ? 4 : 2; if (upP[k]) return upP[k];
  upP[k] = (async () => {
    const [{ default: Upscaler }, def] = await Promise.all([import("upscaler"), k === 4 ? import("@upscalerjs/esrgan-slim/4x") : import("@upscalerjs/esrgan-slim/2x")]);
    const model = { ...(def.default || def), path: "/ai/upscale/x" + k + "/model.json" };
    return new Upscaler({ model });
  })();
  return upP[k];
}
// src: a data URL or image URL. Returns a PNG data URL k times bigger.
export async function upscale(src, scale, onProgress) {
  const up = await upscaler(scale);
  const img = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  // keep the input to at most ~1024 on the long side, so 2x stays printable and phones don't run out of memory
  let input = img; const max = scale === 4 ? 512 : 1024;
  if (Math.max(img.naturalWidth, img.naturalHeight) > max) { const s = max / Math.max(img.naturalWidth, img.naturalHeight); const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); input = c; }
  return await up.upscale(input, { output: "base64", patchSize: 128, padding: 4, progress: (p) => { try { onProgress && onProgress(p); } catch (e) {} } });
}
