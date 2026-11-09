// ════════════════════════════════════════════════════════════════════════════
//  THE SPINE · FAST CUT (batch 14)
//  Builds a finished film on the phone using its own hardware video encoder
//  (WebCodecs, through Mediabunny - MPL-2.0). Many times faster than the
//  FFmpeg route and smoother: every shot glides (slow push-in and drift),
//  shots cross-fade, the title fades up at the start, voices land on their
//  shots and the music runs underneath. If this phone can't do it, the caller
//  falls back to the FFmpeg route, which still works everywhere.
// ════════════════════════════════════════════════════════════════════════════
const W = 1280, H = 720, FPS = 30, XF = 0.5;

async function bytes(src) { const r = await fetch(src); if (!r.ok) throw new Error("A picture or sound wouldn't load."); return await r.arrayBuffer(); }
async function bitmap(src) { return await createImageBitmap(new Blob([await bytes(src)])); }

export async function canFastCut() {
  try {
    try { if (localStorage.getItem("spine.fastcut") === "off") return false; } catch (e) {}
    if (!window.VideoEncoder || !window.AudioEncoder || !window.OffscreenCanvas && !document.createElement) return false;
    const M = await import("mediabunny");
    if (!(await M.canEncodeVideo("avc", { width: W, height: H }))) return false;
    if (!(await M.canEncodeAudio("aac"))) { const A = await import("@mediabunny/aac-encoder"); A.registerAacEncoder(); }
    return await M.canEncodeAudio("aac");
  } catch (e) { return false; }
}

// shots: [{ img: url, voice: url|null }], returns { blob, seconds }
export async function fastCut({ shots, title, musicUrl, onProgress }) {
  const say = (m, f) => { try { onProgress && onProgress(m, f); } catch (e) {} };
  const M = await import("mediabunny");
  if (!(await M.canEncodeAudio("aac"))) { const A = await import("@mediabunny/aac-encoder"); A.registerAacEncoder(); }
  // 1. load everything and time the shots to their voices
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  const items = [];
  try {
    for (let i = 0; i < shots.length; i++) {
      say("Preparing shot " + (i + 1) + " of " + shots.length + "...", 0.05 + 0.25 * i / shots.length);
      let bm = null; try { bm = await bitmap(shots[i].img); } catch (e) { continue; }
      let voice = null; if (shots[i].voice) { try { voice = await ac.decodeAudioData(await bytes(shots[i].voice)); } catch (e) { voice = null; } }
      const dur = Math.max(2.5, Math.min(12, (voice ? voice.duration : 3) + 0.9));
      items.push({ bm, voice, dur });
    }
    if (!items.length) throw new Error("No shots could be made.");
    let music = null; if (musicUrl) { try { music = await ac.decodeAudioData(await bytes(musicUrl)); } catch (e) { music = null; } }
    // shots overlap by the cross-fade, so the film is a little shorter than the sum
    let t = 0; items.forEach((it, i) => { it.start = t; t += it.dur - (i < items.length - 1 ? XF : 0); }); const total = t;
    // 2. the sound: every voice on its shot, music under everything
    say("Mixing the sound...", 0.32);
    const rate = 44100, off = new OfflineAudioContext(2, Math.ceil(total * rate), rate);
    if (music) { const s = off.createBufferSource(); s.buffer = music; s.loop = true; const g = off.createGain(); g.gain.value = 0.22; g.gain.setValueAtTime(0.22, Math.max(0, total - 1.2)); g.gain.linearRampToValueAtTime(0, total); s.connect(g).connect(off.destination); s.start(0); }
    items.forEach((it) => { if (!it.voice) return; const s = off.createBufferSource(); s.buffer = it.voice; s.connect(off.destination); s.start(it.start + 0.35); });
    const mix = await off.startRendering();
    // 3. the picture, frame by frame, straight into the hardware encoder
    const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
    const g = cv.getContext("2d");
    const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: "in-memory" }), target: new M.BufferTarget() });
    const vsrc = new M.CanvasSource(cv, { codec: "avc", bitrate: M.QUALITY_HIGH, keyFrameInterval: 2 });
    const asrc = new M.AudioBufferSource({ codec: "aac", bitrate: M.QUALITY_MEDIUM });
    output.addVideoTrack(vsrc, { frameRate: FPS }); output.addAudioTrack(asrc);
    await output.start();
    const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
    const draw = (it, i, local, alpha) => {
      const p = local / it.dur, z = 1.0 + 0.12 * ease(p), dir = i % 2 ? -1 : 1;
      const s = Math.max(W / it.bm.width, H / it.bm.height) * z, w = it.bm.width * s, h = it.bm.height * s;
      const dx = (W - w) / 2 + dir * (w - W) * 0.35 * (ease(p) - 0.5), dy = (H - h) / 2 + (h - H) * 0.2 * (0.5 - ease(p));
      g.globalAlpha = alpha; g.drawImage(it.bm, dx, dy, w, h); g.globalAlpha = 1;
    };
    const frames = Math.ceil(total * FPS);
    for (let f = 0; f < frames; f++) {
      const time = f / FPS; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      for (let i = 0; i < items.length; i++) { const it = items[i]; const local = time - it.start; if (local < 0 || local > it.dur) continue;
        const fadeIn = i === 0 ? Math.min(1, local / 0.6) : Math.min(1, local / XF); draw(it, i, local, fadeIn); }
      if (title && time < 3) { const a = time < 0.4 ? time / 0.4 : time > 2.4 ? Math.max(0, (3 - time) / 0.6) : 1;
        g.globalAlpha = a; const grad = g.createLinearGradient(0, H * 0.55, 0, H); grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,.65)"); g.fillStyle = grad; g.fillRect(0, H * 0.55, W, H * 0.45);
        g.fillStyle = "#fff"; g.font = "600 54px Georgia, serif"; g.textAlign = "center"; g.fillText(String(title).slice(0, 48), W / 2, H - 92); g.globalAlpha = 1; }
      if (time > total - 0.6) { g.fillStyle = "rgba(0,0,0," + Math.min(1, (time - (total - 0.6)) / 0.6) + ")"; g.fillRect(0, 0, W, H); }
      await vsrc.add(time, 1 / FPS);
      if (f % 15 === 0) say("Rendering the film... " + Math.round(100 * f / frames) + "%", 0.35 + 0.6 * f / frames);
    }
    await asrc.add(mix);
    vsrc.close(); asrc.close(); await output.finalize();
    items.forEach((it) => { try { it.bm.close(); } catch (e) {} });
    say("Done", 1);
    return { blob: new Blob([output.target.buffer], { type: "video/mp4" }), seconds: total };
  } finally { try { ac.close(); } catch (e) {} }
}
