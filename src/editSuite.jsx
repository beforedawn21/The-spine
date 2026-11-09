// ═══════════════════════════════════════════════════════════════════════════════════════════
//  THE EDIT SUITE - pictures, sound and video, edited on the phone.
//  The old editors had a handful of sliders each. These are full studios:
//    Picture: crop & straighten, 17 adjustments, 21 looks, text, stickers, drawing & shapes,
//             frames, "describe a change" AI edits, before/after, undo/redo, export & share.
//    Sound:   waveform trim, fades, volume, normalise, speed, reverse, 3-band EQ, filters,
//             reverb, echo, punch, pan, mono, loop, silence trim, 12 presets, undo/redo.
//    Video:   trim, speed, reverse, rotate/flip, reshape, colour & looks, fades, text on top,
//             volume/mute, size, MP4 / GIF / audio-only export, save a frame.
//  Everything except "describe a change" runs on the phone - no server, no key, no cost.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React from "react";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const uid = () => Math.random().toString(36).slice(2, 9);
function download(url, name) { try { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { try { document.body.removeChild(a); } catch (e) {} }, 300); } catch (e) {} }
async function shareFile(url, name, type) {
  try {
    const b = await (await fetch(url)).blob();
    const f = new File([b], name, { type: type || b.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return true; }
  } catch (e) { if (e && e.name === "AbortError") return true; }
  download(url, name); return false;
}
function useHistory(initial) {
  const [h, setH] = React.useState({ list: [initial], i: 0 });
  const cur = h.list[h.i];
  const push = React.useCallback((v) => setH((o) => { const list = o.list.slice(0, o.i + 1); if (JSON.stringify(list[list.length - 1]) === JSON.stringify(v)) return o; list.push(v); while (list.length > 60) list.shift(); return { list, i: list.length - 1 }; }), []);
  const undo = () => setH((o) => ({ ...o, i: Math.max(0, o.i - 1) }));
  const redo = () => setH((o) => ({ ...o, i: Math.min(o.list.length - 1, o.i + 1) }));
  const reset = (v) => setH({ list: [v], i: 0 });
  return { cur, push, undo, redo, reset, canUndo: h.i > 0, canRedo: h.i < h.list.length - 1 };
}
// A slider that edits live and records one undo step when the finger lifts.
function Slide({ label, value, min, max, step, onChange, onCommit, fmt, zero }) {
  return (
    <label className="es-sl">
      <span className="es-sl-top"><span>{label}</span><b onDoubleClick={() => { onChange(zero == null ? 0 : zero); onCommit && onCommit(); }}>{fmt ? fmt(value) : value}</b></span>
      <input type="range" min={min} max={max} step={step || 1} value={value}
        onChange={(e) => onChange(+e.target.value)} onPointerUp={() => onCommit && onCommit()} onTouchEnd={() => onCommit && onCommit()} onKeyUp={() => onCommit && onCommit()} />
    </label>
  );
}
function Tabs({ tabs, value, onChange }) {
  return (
    <div className="es-tabs" role="tablist">
      {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={"es-tab" + (value === k ? " on" : "")} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
function Sheet({ title, onClose, children, actions }) {
  React.useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  return (
    <div className="es-sheet" role="dialog" aria-label={title}>
      <div className="es-head">
        <button className="es-x" onClick={onClose} aria-label="Close without saving">{"✕"}</button>
        <span className="es-title">{title}</span>
        <span className="es-acts">{actions}</span>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  PICTURE
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ADJ0 = { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0, fade: 0, gray: 0, sepia: 0, sharpen: 0, blur: 0, vignette: 0, grain: 0 };
const ADJ_UI = [
  ["exposure", "Exposure", -100, 100], ["brightness", "Brightness", -100, 100], ["contrast", "Contrast", -100, 100],
  ["highlights", "Highlights", -100, 100], ["shadows", "Shadows", -100, 100], ["warmth", "Warmth", -100, 100],
  ["tint", "Tint", -100, 100], ["saturation", "Saturation", -100, 100], ["vibrance", "Vibrance", -100, 100],
  ["hue", "Hue", -180, 180], ["fade", "Fade", 0, 100], ["gray", "Black & white", 0, 100], ["sepia", "Sepia", 0, 100],
  ["sharpen", "Sharpen", 0, 100], ["blur", "Blur", 0, 100], ["vignette", "Vignette", 0, 100], ["grain", "Grain", 0, 100],
];
export const LOOKS = [
  ["Original", {}], ["Vivid", { saturation: 35, contrast: 15, vibrance: 25 }], ["Pop", { saturation: 55, contrast: 25 }],
  ["Warm", { warmth: 35, saturation: 8 }], ["Cool", { warmth: -35, brightness: 4 }], ["Golden", { warmth: 45, tint: 8, exposure: 8, saturation: 12 }],
  ["Sunset", { warmth: 50, tint: 18, contrast: 12, vignette: 25 }], ["Arctic", { warmth: -45, brightness: 10, saturation: -15 }],
  ["Noir", { gray: 100, contrast: 40, vignette: 40 }], ["Mono", { gray: 100 }], ["Silver", { gray: 100, brightness: 10, fade: 20 }],
  ["Sepia", { sepia: 90 }], ["Vintage", { sepia: 40, fade: 30, warmth: 15, vignette: 30, grain: 20 }],
  ["Film", { fade: 22, contrast: 10, grain: 25, tint: -6, warmth: 6 }], ["Matte", { fade: 40, contrast: -10 }],
  ["Drama", { contrast: 40, shadows: -20, highlights: -25, vignette: 35, saturation: -10 }], ["Pastel", { saturation: -30, brightness: 15, fade: 25 }],
  ["Teal & orange", { warmth: 18, tint: -14, contrast: 18, saturation: 20, hue: -6 }], ["Cyber", { warmth: -40, tint: 25, saturation: 35, contrast: 22 }],
  ["Lomo", { vignette: 60, contrast: 30, saturation: 30 }], ["Dream", { blur: 8, brightness: 12, fade: 20, warmth: 10 }],
];
const STICKERS = "⭐🔥❤️😂😍😎🥳👍👏🙌💯✨🎉🎈🎁🎂🌹🌸🌻🍀🌈☀️🌙⚡❄️💧🌊🌴🏔️🏠🚗✈️🚀🎵🎤🎬📸💡💬👀👑💎💰✅❌❗❓👉👈👆👇🐾🐶🐱🦄🍕☕".match(/(\p{Extended_Pictographic}️?)/gu) || [];
const FONTS = [
  ["Sans", "700 {s}px Manrope, Inter, system-ui, sans-serif"], ["Serif", "700 {s}px Georgia, 'Times New Roman', serif"],
  ["Poster", "900 {s}px Impact, 'Arial Black', Haettenschweiler, sans-serif"], ["Mono", "700 {s}px 'SF Mono', Menlo, Consolas, monospace"],
  ["Hand", "700 {s}px 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive"], ["Rounded", "800 {s}px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif"],
  ["Elegant", "italic 400 {s}px 'Didot', 'Bodoni 72', Georgia, serif"], ["Light", "300 {s}px 'Helvetica Neue', system-ui, sans-serif"],
];
const SWATCH = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff2d55", "#a2845e"];
const AI_IDEAS = [
  ["Remove background", "Remove the background completely and place the subject on a clean plain white background. Keep the subject exactly the same."],
  ["Blur background", "Keep the subject sharp and exactly the same, and make the background softly blurred like a portrait photo."],
  ["Make it night", "Make it night time with natural moonlight and glowing lights. Keep everything else the same."],
  ["Add snow", "Add gently falling snow and a light covering of snow. Keep everything else the same."],
  ["Golden hour", "Relight the scene with warm golden-hour sunlight. Keep everything else the same."],
  ["Watercolour", "Turn this into a soft watercolour painting, same composition."],
  ["Oil painting", "Turn this into a rich oil painting, same composition."],
  ["Pencil sketch", "Turn this into a detailed pencil sketch, same composition."],
  ["Anime", "Redraw this in a clean anime illustration style, same composition."],
  ["3D cartoon", "Redraw this as a polished 3D animated film still, same composition."],
  ["Comic book", "Redraw this as a bold comic book panel with ink lines, same composition."],
  ["Pixel art", "Redraw this as detailed pixel art, same composition."],
  ["Studio headshot", "Make this a professional studio headshot with soft flattering light and a neutral backdrop. Keep the person's face exactly the same."],
  ["Remove people", "Remove the people in the background and fill naturally. Keep the main subject the same."],
  ["Fix the lighting", "Fix the lighting and colours so it looks like a well-exposed professional photo. Keep everything else the same."],
  ["Restore old photo", "Restore this photo: remove scratches, dust and noise, sharpen and improve colour. Keep it faithful."],
];

function loadImg(src) {
  return new Promise((ok, no) => {
    const im = new Image();
    if (!/^data:|^blob:/.test(src)) im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = async () => {
      // A picture from another site without permission headers cannot be edited on a canvas.
      // Fetching it as bytes sometimes works where the <img> route does not.
      try { const b = await (await fetch(src, { mode: "cors" })).blob(); const u = URL.createObjectURL(b); const im2 = new Image(); im2.onload = () => ok(im2); im2.onerror = () => no(new Error("load")); im2.src = u; }
      catch (e) { no(new Error("load")); }
    };
    im.src = src;
  });
}
function geom(img, st, maxSide) {
  const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
  const sc = Math.min(1, maxSide / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * sc)), h = Math.max(1, Math.round(nh * sc));
  const swap = st.rot % 180 !== 0;
  const W = swap ? h : w, H = swap ? w : h;
  const cv = mk(W, H), c = cv.getContext("2d");
  c.imageSmoothingQuality = "high";
  c.translate(W / 2, H / 2);
  const a = (st.straighten || 0) * Math.PI / 180;
  c.rotate(st.rot * Math.PI / 180 + a);
  const z = st.straighten ? Math.cos(Math.abs(a)) + Math.sin(Math.abs(a)) * Math.max(W / H, H / W) : 1;
  c.scale((st.flipH ? -1 : 1) * z, (st.flipV ? -1 : 1) * z);
  c.drawImage(img, -w / 2, -h / 2, w, h);
  return cv;
}
function effAdj(st) {
  const look = (LOOKS.find((l) => l[0] === st.look) || LOOKS[0])[1], k = (st.lookAmt == null ? 100 : st.lookAmt) / 100;
  const o = {};
  for (const key of Object.keys(ADJ0)) o[key] = (st.adj[key] || 0) + (look[key] || 0) * k;
  return o;
}
function softBlur(cv, amt) {
  if (amt <= 0) return cv;
  const f = 1 + amt / 6, sw = mk(cv.width / f, cv.height / f), sc = sw.getContext("2d");
  sc.imageSmoothingQuality = "high"; sc.drawImage(cv, 0, 0, sw.width, sw.height);
  const out = mk(cv.width, cv.height), oc = out.getContext("2d"); oc.imageSmoothingQuality = "high"; oc.drawImage(sw, 0, 0, out.width, out.height);
  return out;
}
function adjustPixels(cv, A) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height;
  let id; try { id = c.getImageData(0, 0, W, H); } catch (e) { return false; }
  const d = id.data;
  const ex = Math.pow(2, A.exposure / 100), br = A.brightness * 1.2;
  const cc = clamp(A.contrast, -99, 99) * 2.55, cf = (259 * (cc + 255)) / (255 * (259 - cc));
  const sat = 1 + A.saturation / 100, vib = A.vibrance / 100;
  const hr = A.hue * Math.PI / 180, cosA = Math.cos(hr), sinA = Math.sin(hr);
  // hue rotation matrix (luminance-preserving)
  const m = A.hue ? [
    .213 + cosA * .787 - sinA * .213, .715 - cosA * .715 - sinA * .715, .072 - cosA * .072 + sinA * .928,
    .213 - cosA * .213 + sinA * .143, .715 + cosA * .285 + sinA * .140, .072 - cosA * .072 - sinA * .283,
    .213 - cosA * .213 - sinA * .787, .715 - cosA * .715 + sinA * .715, .072 + cosA * .928 + sinA * .072] : null;
  const fade = A.fade / 300, gray = A.gray / 100, sep = A.sepia / 100, vg = A.vignette / 100, gr = A.grain * 0.5;
  const hl = A.highlights * 0.6, sh = A.shadows * 0.6, wm = A.warmth * 0.35, tn = A.tint * 0.35;
  const cx = W / 2, cy = H / 2, maxd = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      let r = d[p], g = d[p + 1], b = d[p + 2];
      r *= ex; g *= ex; b *= ex;
      r += br; g += br; b += br;
      if (hl || sh) { const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255, wl = clamp(L, 0, 1); const dd = sh * (1 - wl) * (1 - wl) + hl * wl * wl; r += dd; g += dd; b += dd; }
      r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
      r += wm; b -= wm; g -= tn; r += tn * 0.3; b += tn * 0.3;
      if (m) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B; }
      if (sat !== 1 || vib) {
        const L = 0.299 * r + 0.587 * g + 0.114 * b;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const f = sat * (1 + vib * (1 - clamp((mx - mn) / 255, 0, 1)));
        r = L + (r - L) * f; g = L + (g - L) * f; b = L + (b - L) * f;
      }
      if (gray) { const L = 0.299 * r + 0.587 * g + 0.114 * b; r += (L - r) * gray; g += (L - g) * gray; b += (L - b) * gray; }
      if (sep) { const R = r, G = g, B = b; r += (Math.min(255, .393 * R + .769 * G + .189 * B) - R) * sep; g += (Math.min(255, .349 * R + .686 * G + .168 * B) - G) * sep; b += (Math.min(255, .272 * R + .534 * G + .131 * B) - B) * sep; }
      if (fade) { r = r * (1 - fade) + 150 * fade; g = g * (1 - fade) + 150 * fade; b = b * (1 - fade) + 150 * fade; }
      if (vg) { const dx = x - cx, dy = y - cy, t = Math.sqrt(dx * dx + dy * dy) / maxd; const v = 1 - vg * clamp((t - 0.35) / 0.65, 0, 1) ** 1.6; r *= v; g *= v; b *= v; }
      if (gr) { const n = (Math.random() - 0.5) * gr; r += n; g += n; b += n; }
      d[p] = r; d[p + 1] = g; d[p + 2] = b;
    }
  }
  if (A.sharpen > 0) {
    const s = A.sharpen / 100 * 0.9, src = new Uint8ClampedArray(d);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = 5 * src[p + ch] - src[p - 4 + ch] - src[p + 4 + ch] - src[p - W * 4 + ch] - src[p + W * 4 + ch];
        d[p + ch] = src[p + ch] + (v - src[p + ch]) * s;
      }
    }
  }
  c.putImageData(id, 0, 0);
  return true;
}
function autoEnhance(img) {
  // Reads the picture's real spread of light and colour and sets the sliders to correct it.
  const cv = geom(img, { rot: 0 }, 256), c = cv.getContext("2d");
  let d; try { d = c.getImageData(0, 0, cv.width, cv.height).data; } catch (e) { return null; }
  const hist = new Array(256).fill(0); let rs = 0, gs = 0, bs = 0, n = 0, satSum = 0;
  for (let p = 0; p < d.length; p += 4) { const L = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]); hist[L]++; rs += d[p]; gs += d[p + 1]; bs += d[p + 2]; n++; satSum += Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]); }
  const pct = (q) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= q * n) return i; } return 255; };
  const lo = pct(0.01), hi = pct(0.99), mid = pct(0.5);
  const rM = rs / n, gM = gs / n, bM = bs / n, sAvg = satSum / n;
  return {
    ...ADJ0,
    contrast: clamp(Math.round((200 - (hi - lo)) / 3), -10, 35),
    exposure: clamp(Math.round((128 - mid) / 2.2), -40, 45),
    shadows: lo > 30 ? -10 : clamp(Math.round((40 - lo) / 2), 0, 25),
    highlights: hi > 245 ? -15 : 0,
    warmth: clamp(Math.round((bM - rM) / 3), -25, 25),
    tint: clamp(Math.round((gM - (rM + bM) / 2) / 3), -20, 20),
    vibrance: sAvg < 60 ? 25 : 10, sharpen: 15,
  };
}
function drawLayers(c, W, H, layers, boxes) {
  for (const L of layers) {
    c.save();
    c.globalAlpha = L.opacity == null ? 1 : L.opacity;
    if (L.type === "stroke") {
      const pts = L.pts; if (!pts || pts.length < 1) { c.restore(); continue; }
      c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = L.color; c.lineWidth = L.w * W;
      if (L.tool === "neon") { c.shadowColor = L.color; c.shadowBlur = L.w * W * 2.2; c.strokeStyle = "#ffffff"; c.lineWidth = L.w * W * 0.55; }
      if (L.tool === "marker") c.globalAlpha *= 0.45;
      c.beginPath(); c.moveTo(pts[0][0] * W, pts[0][1] * H);
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; c.quadraticCurveTo(a[0] * W, a[1] * H, (a[0] + b[0]) / 2 * W, (a[1] + b[1]) / 2 * H); }
      if (pts.length === 1) c.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);
      c.stroke();
      if (L.tool === "neon") { c.shadowBlur = L.w * W; c.stroke(); }
    } else if (L.type === "shape") {
      const x1 = L.x1 * W, y1 = L.y1 * H, x2 = L.x2 * W, y2 = L.y2 * H, lw = L.w * W;
      c.strokeStyle = L.color; c.fillStyle = L.color; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round";
      if (L.shape === "rect") { L.fill ? c.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)) : c.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
      else if (L.shape === "circle") { c.beginPath(); c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2 || 1, Math.abs(y2 - y1) / 2 || 1, 0, 0, Math.PI * 2); L.fill ? c.fill() : c.stroke(); }
      else { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        if (L.shape === "arrow") { const ang = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(lw * 3.5, 14); c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)); c.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)); c.closePath(); c.fill(); } }
    } else if (L.type === "text" || L.type === "sticker") {
      const size = L.size * W, x = L.x * W, y = L.y * H;
      c.translate(x, y); c.rotate((L.rot || 0) * Math.PI / 180); if (L.flip) c.scale(-1, 1);
      const font = L.type === "sticker" ? (size + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif") : ((FONTS.find((f) => f[0] === L.font) || FONTS[0])[1].replace("{s}", String(size)));
      c.font = font; c.textAlign = L.align || "center"; c.textBaseline = "middle";
      const lines = String(L.text || "").split("\n");
      const lh = size * 1.18, widths = lines.map((t) => c.measureText(t).width), tw = Math.max(1, ...widths), th = lh * lines.length;
      const ox = (L.align === "left" ? 0 : L.align === "right" ? -tw : -tw / 2);
      if (L.bg) { c.fillStyle = L.bgColor || "rgba(0,0,0,.6)"; const pad = size * 0.28; const rr = size * 0.25; c.beginPath(); if (c.roundRect) c.roundRect(ox - pad, -th / 2 - pad * 0.6, tw + pad * 2, th + pad * 1.2, rr); else c.rect(ox - pad, -th / 2 - pad * 0.6, tw + pad * 2, th + pad * 1.2); c.fill(); }
      if (L.shadow) { c.shadowColor = "rgba(0,0,0,.55)"; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.06; }
      lines.forEach((t, i) => {
        const ty = -th / 2 + lh * (i + 0.5);
        if (L.outline && L.type === "text") { c.lineWidth = Math.max(2, size / 9); c.strokeStyle = L.outlineColor || "#000"; c.lineJoin = "round"; c.strokeText(t, 0, ty); }
        c.fillStyle = L.color || "#fff"; c.fillText(t, 0, ty);
      });
      if (boxes) { const pad = size * 0.3; boxes[L.id] = { x: (x + ox - pad) / W, y: (y - th / 2 - pad) / H, w: (tw + pad * 2) / W, h: (th + pad * 2) / H }; }
    }
    c.restore();
  }
}
function applyFrame(cv, fr) {
  if (!fr || fr.kind === "none") return cv;
  const W = cv.width, H = cv.height, s = Math.round((fr.size || 4) / 100 * Math.min(W, H));
  if (fr.kind === "border") { const o = mk(W + s * 2, H + s * 2), c = o.getContext("2d"); c.fillStyle = fr.color; c.fillRect(0, 0, o.width, o.height); c.drawImage(cv, s, s); return o; }
  if (fr.kind === "polaroid") { const o = mk(W + s * 2, H + s * 2 + Math.round(Math.min(W, H) * 0.16)), c = o.getContext("2d"); c.fillStyle = fr.color; c.fillRect(0, 0, o.width, o.height); c.drawImage(cv, s, s);
    if (fr.caption) { c.fillStyle = "#222"; c.font = "400 " + Math.round(Math.min(W, H) * 0.06) + "px 'Bradley Hand','Segoe Print','Comic Sans MS',cursive"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(fr.caption, o.width / 2, H + s + (o.height - H - s) / 2); }
    return o; }
  if (fr.kind === "rounded" || fr.kind === "circle") {
    const o = mk(W, H), c = o.getContext("2d"); c.beginPath();
    if (fr.kind === "circle") { const r = Math.min(W, H) / 2; c.arc(W / 2, H / 2, r, 0, Math.PI * 2); }
    else { const r = Math.max(4, s * 2.5); if (c.roundRect) c.roundRect(0, 0, W, H, r); else c.rect(0, 0, W, H); }
    c.clip(); c.drawImage(cv, 0, 0);
    if (fr.kind === "circle") { const r = Math.min(W, H) / 2, sq = mk(r * 2, r * 2); sq.getContext("2d").drawImage(o, (W - r * 2) / 2, (H - r * 2) / 2, r * 2, r * 2, 0, 0, r * 2, r * 2); return sq; }
    return o;
  }
  if (fr.kind === "film") { const o = mk(W, H + s * 4), c = o.getContext("2d"); c.fillStyle = "#111"; c.fillRect(0, 0, o.width, o.height); c.drawImage(cv, 0, s * 2); c.fillStyle = "#eee"; const hw = s * 1.1; for (let x = s; x < W - hw; x += hw * 2) { c.fillRect(x, s * 0.5, hw, s); c.fillRect(x, H + s * 2.5, hw, s); } return o; }
  return cv;
}
const ST0 = () => ({ rot: 0, straighten: 0, flipH: false, flipV: false, crop: null, aspect: "free", adj: { ...ADJ0 }, look: "Original", lookAmt: 100, layers: [], frame: { kind: "none", size: 4, color: "#ffffff", caption: "" } });

export function ImageStudio({ src, onSave, onClose, title }) {
  const [base, setBase] = React.useState(src);          // the picture underneath every edit (AI edits replace it)
  const [img, setImg] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [err, setErr] = React.useState("");
  const hist = useHistory({ base: src, st: ST0() });
  const [st, setSt] = React.useState(ST0());
  const [tab, setTab] = React.useState("adjust");
  const [sel, setSel] = React.useState(null);             // selected layer id
  const [drawTool, setDrawTool] = React.useState("pen");
  const [pen, setPen] = React.useState({ color: "#ff3b30", w: 0.012, opacity: 1, fill: false });
  const [comparing, setComparing] = React.useState(false);
  const [aiText, setAiText] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiMsg, setAiMsg] = React.useState("");
  const [exp, setExp] = React.useState({ fmt: "image/png", q: 0.92, max: 4096 });
  const [busy, setBusy] = React.useState("");
  const cvRef = React.useRef(null), stageRef = React.useRef(null), boxesRef = React.useRef({}), dragRef = React.useRef(null), rafRef = React.useRef(0);

  React.useEffect(() => { let live = true; setErr(""); loadImg(base).then((im) => { if (live) { setImg(im); setOrig((o) => o || im); } }).catch(() => live && setErr("This picture can't be edited here - the site it came from doesn't allow it. Save it to your phone and upload it instead.")); return () => { live = false; }; }, [base]);
  // undo / redo restore both the picture and the settings
  React.useEffect(() => { const c = hist.cur; if (!c) return; if (c.base !== base) setBase(c.base); setSt(c.st); }, [hist.cur]);
  const commit = (next) => hist.push({ base, st: next || st });
  const set = (patch, now) => setSt((o) => { const n = { ...o, ...patch }; if (now) hist.push({ base, st: n }); return n; });
  const setAdj = (k, v) => setSt((o) => ({ ...o, adj: { ...o.adj, [k]: v } }));
  const updLayer = (id, patch, now) => setSt((o) => { const n = { ...o, layers: o.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }; if (now) hist.push({ base, st: n }); return n; });
  const selL = st.layers.find((l) => l.id === sel) || null;

  // ── render: geometry -> crop -> colour -> layers -> frame
  const PREV = 900;
  function renderTo(maxSide, opts) {
    const o = opts || {};
    const g = geom(o.original ? orig : img, o.original ? { rot: 0 } : st, maxSide);
    if (o.geomOnly) return g;
    const cr = (!o.original && st.crop) || { x: 0, y: 0, w: 1, h: 1 };
    let cv = mk(g.width * cr.w, g.height * cr.h);
    cv.getContext("2d").drawImage(g, cr.x * g.width, cr.y * g.height, cr.w * g.width, cr.h * g.height, 0, 0, cv.width, cv.height);
    if (o.original) return cv;
    const A = effAdj(st);
    if (A.blur > 0) cv = softBlur(cv, A.blur);
    if (Object.keys(A).some((k) => k !== "blur" && A[k])) { if (!adjustPixels(cv, A)) setErr("Colour changes can't be applied to this picture (the site it came from blocks it)."); }
    const c = cv.getContext("2d"); boxesRef.current = {};
    drawLayers(c, cv.width, cv.height, st.layers, boxesRef.current);
    if (o.noFrame) return cv;
    return applyFrame(cv, st.frame);
  }
  React.useEffect(() => {
    if (!img || !cvRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const out = cvRef.current; if (!out) return;
      let r;
      if (comparing && orig) r = renderTo(PREV, { original: true });
      else if (tab === "crop") r = renderTo(PREV, { geomOnly: true });
      else r = renderTo(PREV, { noFrame: tab === "text" || tab === "draw" || tab === "stickers" });
      out.width = r.width; out.height = r.height; out.getContext("2d").drawImage(r, 0, 0);
      if (sel && (tab === "text" || tab === "stickers") && boxesRef.current[sel]) {
        const b = boxesRef.current[sel], c = out.getContext("2d"); c.save(); c.setLineDash([8, 6]); c.lineWidth = 2; c.strokeStyle = "#0a84ff"; c.strokeRect(b.x * out.width, b.y * out.height, b.w * out.width, b.h * out.height); c.restore();
      }
    });
  }, [img, st, tab, comparing, sel]);

  // ── pointer: move layers, draw, crop
  const norm = (e) => { const r = cvRef.current.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  function down(e) {
    if (!img) return; const [x, y] = norm(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {}
    if (tab === "draw") {
      const id = uid();
      if (drawTool === "pen" || drawTool === "marker" || drawTool === "neon") setSt((o) => ({ ...o, layers: [...o.layers, { id, type: "stroke", tool: drawTool, color: pen.color, w: drawTool === "marker" ? pen.w * 2.4 : pen.w, opacity: pen.opacity, pts: [[x, y]] }] }));
      else setSt((o) => ({ ...o, layers: [...o.layers, { id, type: "shape", shape: drawTool, color: pen.color, w: pen.w, opacity: pen.opacity, fill: pen.fill, x1: x, y1: y, x2: x, y2: y }] }));
      dragRef.current = { mode: "draw", id }; return;
    }
    if (tab === "text" || tab === "stickers") {
      const hit = [...st.layers].reverse().find((l) => (l.type === "text" || l.type === "sticker") && boxesRef.current[l.id] && x >= boxesRef.current[l.id].x && x <= boxesRef.current[l.id].x + boxesRef.current[l.id].w && y >= boxesRef.current[l.id].y && y <= boxesRef.current[l.id].y + boxesRef.current[l.id].h);
      if (hit) { setSel(hit.id); dragRef.current = { mode: "move", id: hit.id, dx: x - hit.x, dy: y - hit.y }; }
      else if (selL) { updLayer(selL.id, { x, y }); dragRef.current = { mode: "move", id: selL.id, dx: 0, dy: 0 }; }
    }
  }
  function move(e) {
    const d = dragRef.current; if (!d) return; const [x, y] = norm(e);
    if (d.mode === "draw") setSt((o) => ({ ...o, layers: o.layers.map((l) => l.id !== d.id ? l : l.type === "stroke" ? { ...l, pts: [...l.pts, [x, y]] } : { ...l, x2: x, y2: y }) }));
    else if (d.mode === "move") updLayer(d.id, { x: clamp(x - d.dx, 0, 1), y: clamp(y - d.dy, 0, 1) });
  }
  function up() { if (dragRef.current) { dragRef.current = null; setSt((o) => { hist.push({ base, st: o }); return o; }); } }

  // ── crop box
  function aspectRect(a) {
    if (!img) return null; if (a === "free") return { x: 0, y: 0, w: 1, h: 1 };
    const g = geom(img, st, 400), gw = g.width, gh = g.height;
    const R = a === "original" ? (img.naturalWidth / img.naturalHeight) : (() => { const [p, q] = a.split(":").map(Number); return p / q; })();
    let w = gw, h = w / R; if (h > gh) { h = gh; w = h * R; }
    return { x: (gw - w) / 2 / gw, y: (gh - h) / 2 / gh, w: w / gw, h: h / gh };
  }
  function cropDown(e, handle) {
    e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {}
    const r = cvRef.current.getBoundingClientRect();
    dragRef.current = { mode: "crop", handle, sx: e.clientX, sy: e.clientY, rw: r.width, rh: r.height, c0: { ...(st.crop || { x: 0, y: 0, w: 1, h: 1 }) } };
  }
  function cropMove(e) {
    const d = dragRef.current; if (!d || d.mode !== "crop") return;
    const dx = (e.clientX - d.sx) / d.rw, dy = (e.clientY - d.sy) / d.rh; let { x, y, w, h } = d.c0; const MIN = 0.06;
    const lockR = st.aspect !== "free" ? (d.c0.w * d.rw) / (d.c0.h * d.rh) : 0;
    if (d.handle === "move") { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
    else {
      if (d.handle.includes("l")) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (d.handle.includes("r")) w = clamp(w + dx, MIN, 1 - x);
      if (d.handle.includes("t")) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (d.handle.includes("b")) h = clamp(h + dy, MIN, 1 - y);
      if (lockR) { const nh = (w * d.rw) / lockR / d.rh; if (y + nh <= 1) { if (d.handle.includes("t")) y = y + h - nh; h = nh; } else { h = 1 - y; w = (h * d.rh * lockR) / d.rw; } }
    }
    setSt((o) => ({ ...o, crop: { x, y, w, h } }));
  }

  // ── AI: describe a change
  async function aiEdit(prompt) {
    const p = String(prompt || "").trim(); if (!p || !img) return;
    setAiBusy(true); setAiMsg("Changing your picture - this takes about half a minute...");
    try {
      const cv = renderTo(1024); const url = cv.toDataURL("image/jpeg", 0.9);
      const R = cv.width / cv.height, size = R > 1.2 ? "1536x1024" : R < 0.83 ? "1024x1536" : "1024x1024";
      const r = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: p, editImage: url, size }) });
      const j = await r.json().catch(() => ({}));
      const out = j.b64 ? "data:" + (j.mime || "image/png") + ";base64," + j.b64 : j.url || null;
      if (!out) { setAiMsg(j.notConnected ? "Picture changes need the image engine switched on by the owner." : (j.error || "That didn't work just now - try again.")); setAiBusy(false); return; }
      const fresh = ST0(); setBase(out); setSt(fresh); hist.push({ base: out, st: fresh }); setAiMsg("Done. Tap Undo to go back, or hold Before to compare."); setAiText("");
    } catch (e) { setAiMsg("Couldn't reach the image engine. Your edits are safe."); }
    setAiBusy(false);
  }
  // ── save / export
  function finalUrl(type, q, max) { const cv = renderTo(max || exp.max); let u = cv.toDataURL(type || exp.fmt, q || exp.q); if (!u.startsWith("data:" + (type || exp.fmt))) u = cv.toDataURL("image/png"); return u; }
  const ext = (t) => (t === "image/jpeg" ? "jpg" : t === "image/webp" ? "webp" : "png");
  function save() { setBusy("Saving..."); setTimeout(() => { try { onSave && onSave(finalUrl()); } catch (e) { setErr("Couldn't export this picture."); } setBusy(""); }, 20); }

  const addText = () => { const id = uid(); const L = { id, type: "text", text: "Your text", font: "Sans", size: 0.08, color: "#ffffff", x: 0.5, y: 0.5, rot: 0, opacity: 1, align: "center", outline: true, outlineColor: "#000000", shadow: false, bg: false, bgColor: "rgba(0,0,0,0.6)" }; setSt((o) => { const n = { ...o, layers: [...o.layers, L] }; hist.push({ base, st: n }); return n; }); setSel(id); };
  const addSticker = (em) => { const id = uid(); const L = { id, type: "sticker", text: em, size: 0.16, x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4, rot: 0, opacity: 1 }; setSt((o) => { const n = { ...o, layers: [...o.layers, L] }; hist.push({ base, st: n }); return n; }); setSel(id); };
  const delLayer = (id) => setSt((o) => { const n = { ...o, layers: o.layers.filter((l) => l.id !== id) }; hist.push({ base, st: n }); return n; });
  const dupLayer = (L) => { const id = uid(); setSt((o) => { const n = { ...o, layers: [...o.layers, { ...L, id, x: clamp(L.x + 0.05, 0, 1), y: clamp(L.y + 0.05, 0, 1) }] }; hist.push({ base, st: n }); return n; }); setSel(id); };
  const layerOrder = (L, dir) => setSt((o) => { const a = [...o.layers], i = a.findIndex((l) => l.id === L.id), j = clamp(i + dir, 0, a.length - 1); a.splice(j, 0, a.splice(i, 1)[0]); const n = { ...o, layers: a }; hist.push({ base, st: n }); return n; });

  const cr = st.crop || { x: 0, y: 0, w: 1, h: 1 };
  const strokes = st.layers.filter((l) => l.type === "stroke" || l.type === "shape");
  const TABS = [["crop", "Crop"], ["adjust", "Adjust"], ["looks", "Looks"], ["text", "Text"], ["draw", "Draw"], ["stickers", "Stickers"], ["frame", "Frame"], ["ai", "AI magic"], ["export", "Export"]];

  return (
    <Sheet title={title || "Edit picture"} onClose={onClose} actions={<>
      <button className="es-ic" onClick={hist.undo} disabled={!hist.canUndo} aria-label="Undo">{"↶"}</button>
      <button className="es-ic" onClick={hist.redo} disabled={!hist.canRedo} aria-label="Redo">{"↷"}</button>
      <button className="es-save" onClick={save} disabled={!img || !!busy}>{busy || "Save"}</button>
    </>}>
      <div className="es-stage" ref={stageRef}>
        {!img && !err && <div className="es-load">Loading picture...</div>}
        {err && <div className="es-err">{err}</div>}
        {img && (
          <div className="es-canwrap" onPointerMove={(e) => { if (dragRef.current && dragRef.current.mode === "crop") cropMove(e); else move(e); }} onPointerUp={up} onPointerCancel={up}>
            <canvas ref={cvRef} className={"es-canvas" + (tab === "draw" ? " drawing" : "")} onPointerDown={down} style={{ touchAction: tab === "draw" || tab === "text" || tab === "stickers" ? "none" : "auto" }} />
            {tab === "crop" && !comparing && (
              <div className="es-crop" style={{ left: cr.x * 100 + "%", top: cr.y * 100 + "%", width: cr.w * 100 + "%", height: cr.h * 100 + "%" }} onPointerDown={(e) => cropDown(e, "move")}>
                <i className="g1" /><i className="g2" /><i className="g3" /><i className="g4" />
                {["tl", "tr", "bl", "br", "t", "b", "l", "r"].map((h) => <span key={h} className={"es-h " + h} onPointerDown={(e) => cropDown(e, h)} />)}
              </div>
            )}
          </div>
        )}
      </div>
      {img && (
        <div className="es-compare">
          <button className="es-chip" onPointerDown={() => setComparing(true)} onPointerUp={() => setComparing(false)} onPointerLeave={() => setComparing(false)} onTouchEnd={() => setComparing(false)}>Hold for before</button>
          <button className="es-chip" onClick={() => { const n = { ...ST0() }; setSt(n); hist.push({ base, st: n }); setSel(null); }}>Reset all</button>
        </div>
      )}
      <Tabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); if (t === "crop" && dragRef.current) dragRef.current = null; }} />
      <div className="es-panel">
        {tab === "crop" && (<>
          <div className="es-row wrap">
            {[["free", "Free"], ["original", "Original"], ["1:1", "Square"], ["4:5", "4:5"], ["3:4", "3:4"], ["9:16", "Story 9:16"], ["16:9", "Wide 16:9"], ["3:2", "3:2"], ["2:3", "2:3"], ["21:9", "Cinema"]].map(([a, l]) => (
              <button key={a} className={"es-chip" + (st.aspect === a ? " on" : "")} onClick={() => set({ aspect: a, crop: aspectRect(a) }, true)}>{l}</button>
            ))}
          </div>
          <div className="es-row">
            <button className="es-btn" onClick={() => set({ rot: (st.rot + 270) % 360, crop: null, aspect: "free" }, true)}>{"↺"} Left</button>
            <button className="es-btn" onClick={() => set({ rot: (st.rot + 90) % 360, crop: null, aspect: "free" }, true)}>{"↻"} Right</button>
            <button className={"es-btn" + (st.flipH ? " on" : "")} onClick={() => set({ flipH: !st.flipH }, true)}>{"↔"} Mirror</button>
            <button className={"es-btn" + (st.flipV ? " on" : "")} onClick={() => set({ flipV: !st.flipV }, true)}>{"↕"} Flip</button>
          </div>
          <Slide label="Straighten" value={st.straighten} min={-45} max={45} step={0.5} fmt={(v) => v + "°"} onChange={(v) => setSt((o) => ({ ...o, straighten: v }))} onCommit={() => commit()} />
          <div className="es-hint">Drag the box or its edges. Tap a shape above to lock it.</div>
        </>)}
        {tab === "adjust" && (<>
          <div className="es-row">
            <button className="es-btn gold" onClick={() => { const a = autoEnhance(img); if (a) set({ adj: a }, true); }}>{"✨"} Auto enhance</button>
            <button className="es-btn" onClick={() => set({ adj: { ...ADJ0 } }, true)}>Reset adjustments</button>
          </div>
          {ADJ_UI.map(([k, l, a, b]) => <Slide key={k} label={l} value={st.adj[k]} min={a} max={b} onChange={(v) => setAdj(k, v)} onCommit={() => commit()} />)}
        </>)}
        {tab === "looks" && (<>
          <div className="es-looks">
            {LOOKS.map(([n]) => <button key={n} className={"es-look" + (st.look === n ? " on" : "")} onClick={() => set({ look: n }, true)}><LookThumb img={img} look={n} />{n}</button>)}
          </div>
          {st.look !== "Original" && <Slide label="Strength" value={st.lookAmt} min={0} max={150} fmt={(v) => v + "%"} onChange={(v) => setSt((o) => ({ ...o, lookAmt: v }))} onCommit={() => commit()} zero={100} />}
        </>)}
        {tab === "text" && (<>
          <div className="es-row"><button className="es-btn gold" onClick={addText}>+ Add text</button>{st.layers.filter((l) => l.type === "text").length > 0 && <span className="es-hint">Tap text on the picture to pick it, drag to move.</span>}</div>
          {selL && selL.type === "text" && (<>
            <textarea className="es-in" rows={2} value={selL.text} onChange={(e) => updLayer(selL.id, { text: e.target.value })} onBlur={() => commit()} />
            <div className="es-row wrap">{FONTS.map(([f]) => <button key={f} className={"es-chip" + (selL.font === f ? " on" : "")} onClick={() => updLayer(selL.id, { font: f }, true)}>{f}</button>)}</div>
            <Colors value={selL.color} onPick={(c) => updLayer(selL.id, { color: c }, true)} />
            <Slide label="Size" value={Math.round(selL.size * 1000)} min={20} max={300} onChange={(v) => updLayer(selL.id, { size: v / 1000 })} onCommit={() => commit()} />
            <Slide label="Turn" value={selL.rot || 0} min={-180} max={180} fmt={(v) => v + "°"} onChange={(v) => updLayer(selL.id, { rot: v })} onCommit={() => commit()} />
            <Slide label="Opacity" value={Math.round((selL.opacity == null ? 1 : selL.opacity) * 100)} min={10} max={100} fmt={(v) => v + "%"} onChange={(v) => updLayer(selL.id, { opacity: v / 100 })} onCommit={() => commit()} zero={100} />
            <div className="es-row wrap">
              {[["outline", "Outline"], ["shadow", "Shadow"], ["bg", "Box"]].map(([k, l]) => <button key={k} className={"es-chip" + (selL[k] ? " on" : "")} onClick={() => updLayer(selL.id, { [k]: !selL[k] }, true)}>{l}</button>)}
              {["left", "center", "right"].map((a) => <button key={a} className={"es-chip" + ((selL.align || "center") === a ? " on" : "")} onClick={() => updLayer(selL.id, { align: a }, true)}>{a === "left" ? "←" : a === "right" ? "→" : "↔"}</button>)}
            </div>
            {selL.bg && <Colors label="Box colour" value={selL.bgColor} onPick={(c) => updLayer(selL.id, { bgColor: c }, true)} />}
            {selL.outline && <Colors label="Outline colour" value={selL.outlineColor} onPick={(c) => updLayer(selL.id, { outlineColor: c }, true)} />}
            <LayerActions L={selL} onDup={dupLayer} onDel={(id) => { delLayer(id); setSel(null); }} onOrder={layerOrder} />
          </>)}
        </>)}
        {tab === "draw" && (<>
          <div className="es-row wrap">
            {[["pen", "✏️ Pen"], ["marker", "🖍 Marker"], ["neon", "✨ Neon"], ["line", "╱ Line"], ["arrow", "↗ Arrow"], ["rect", "▭ Box"], ["circle", "◯ Circle"]].map(([k, l]) => (
              <button key={k} className={"es-chip" + (drawTool === k ? " on" : "")} onClick={() => setDrawTool(k)}>{l}</button>
            ))}
          </div>
          <Colors value={pen.color} onPick={(c) => setPen((p) => ({ ...p, color: c }))} />
          <Slide label="Thickness" value={Math.round(pen.w * 1000)} min={2} max={80} onChange={(v) => setPen((p) => ({ ...p, w: v / 1000 }))} />
          <Slide label="Opacity" value={Math.round(pen.opacity * 100)} min={10} max={100} fmt={(v) => v + "%"} onChange={(v) => setPen((p) => ({ ...p, opacity: v / 100 }))} />
          {(drawTool === "rect" || drawTool === "circle") && <div className="es-row"><button className={"es-chip" + (pen.fill ? " on" : "")} onClick={() => setPen((p) => ({ ...p, fill: !p.fill }))}>Filled</button></div>}
          <div className="es-row">
            <button className="es-btn" disabled={!strokes.length} onClick={() => setSt((o) => { const a = [...o.layers]; for (let k = a.length - 1; k >= 0; k--) { if (a[k].type === "stroke" || a[k].type === "shape") { a.splice(k, 1); break; } } const n = { ...o, layers: a }; hist.push({ base, st: n }); return n; })}>Remove last</button>
            <button className="es-btn" disabled={!strokes.length} onClick={() => set({ layers: st.layers.filter((l) => l.type !== "stroke" && l.type !== "shape") }, true)}>Clear drawing</button>
          </div>
          <div className="es-hint">Draw straight onto the picture with your finger.</div>
        </>)}
        {tab === "stickers" && (<>
          <div className="es-stickers">{STICKERS.map((s, i) => <button key={i} className="es-stk" onClick={() => addSticker(s)}>{s}</button>)}</div>
          {selL && selL.type === "sticker" && (<>
            <Slide label="Size" value={Math.round(selL.size * 1000)} min={30} max={600} onChange={(v) => updLayer(selL.id, { size: v / 1000 })} onCommit={() => commit()} />
            <Slide label="Turn" value={selL.rot || 0} min={-180} max={180} fmt={(v) => v + "°"} onChange={(v) => updLayer(selL.id, { rot: v })} onCommit={() => commit()} />
            <Slide label="Opacity" value={Math.round((selL.opacity == null ? 1 : selL.opacity) * 100)} min={10} max={100} fmt={(v) => v + "%"} onChange={(v) => updLayer(selL.id, { opacity: v / 100 })} onCommit={() => commit()} zero={100} />
            <div className="es-row"><button className={"es-chip" + (selL.flip ? " on" : "")} onClick={() => updLayer(selL.id, { flip: !selL.flip }, true)}>Mirror</button><button className={"es-chip" + (selL.shadow ? " on" : "")} onClick={() => updLayer(selL.id, { shadow: !selL.shadow }, true)}>Shadow</button></div>
            <LayerActions L={selL} onDup={dupLayer} onDel={(id) => { delLayer(id); setSel(null); }} onOrder={layerOrder} />
          </>)}
          {!selL && <div className="es-hint">Tap a sticker to add it, then drag it into place.</div>}
        </>)}
        {tab === "frame" && (<>
          <div className="es-row wrap">
            {[["none", "None"], ["border", "Border"], ["polaroid", "Polaroid"], ["rounded", "Rounded"], ["circle", "Circle"], ["film", "Film strip"]].map(([k, l]) => (
              <button key={k} className={"es-chip" + (st.frame.kind === k ? " on" : "")} onClick={() => set({ frame: { ...st.frame, kind: k, color: k === "polaroid" ? "#fbfaf7" : st.frame.color } }, true)}>{l}</button>
            ))}
          </div>
          {(st.frame.kind === "border" || st.frame.kind === "polaroid" || st.frame.kind === "rounded" || st.frame.kind === "film") && <Slide label="Size" value={st.frame.size} min={1} max={20} onChange={(v) => setSt((o) => ({ ...o, frame: { ...o.frame, size: v } }))} onCommit={() => commit()} />}
          {(st.frame.kind === "border" || st.frame.kind === "polaroid") && <Colors value={st.frame.color} onPick={(c) => set({ frame: { ...st.frame, color: c } }, true)} />}
          {st.frame.kind === "polaroid" && <input className="es-in" placeholder="Write a caption (optional)" value={st.frame.caption || ""} onChange={(e) => setSt((o) => ({ ...o, frame: { ...o.frame, caption: e.target.value.slice(0, 40) } }))} onBlur={() => commit()} />}
          <div className="es-hint">The frame shows in every tab except Text, Draw and Stickers.</div>
        </>)}
        {tab === "ai" && (<>
          <div className="es-row wrap">{AI_IDEAS.map(([l, p]) => <button key={l} className="es-chip" disabled={aiBusy} onClick={() => aiEdit(p)}>{l}</button>)}</div>
          <textarea className="es-in" rows={2} placeholder="Or describe any change - 'put a party hat on the dog', 'make the sky purple'" value={aiText} onChange={(e) => setAiText(e.target.value)} />
          <button className="es-btn gold wide" disabled={aiBusy || !aiText.trim()} onClick={() => aiEdit(aiText)}>{aiBusy ? "Working on it..." : "Make the change"}</button>
          {aiMsg && <div className="es-hint">{aiMsg}</div>}
          <div className="es-hint">AI changes use one picture from your allowance. Everything in the other tabs is free.</div>
        </>)}
        {tab === "export" && (<>
          <div className="es-row wrap">{[["image/png", "PNG (best)"], ["image/jpeg", "JPEG (small)"], ["image/webp", "WebP"]].map(([k, l]) => <button key={k} className={"es-chip" + (exp.fmt === k ? " on" : "")} onClick={() => setExp((o) => ({ ...o, fmt: k }))}>{l}</button>)}</div>
          {exp.fmt !== "image/png" && <Slide label="Quality" value={Math.round(exp.q * 100)} min={40} max={100} fmt={(v) => v + "%"} onChange={(v) => setExp((o) => ({ ...o, q: v / 100 }))} />}
          <div className="es-row wrap">{[[4096, "Full size"], [2048, "2048"], [1080, "1080 (social)"], [720, "720"], [512, "512 (icon)"]].map(([k, l]) => <button key={k} className={"es-chip" + (exp.max === k ? " on" : "")} onClick={() => setExp((o) => ({ ...o, max: k }))}>{l}</button>)}</div>
          <div className="es-row">
            <button className="es-btn" onClick={() => download(finalUrl(), "spine-picture." + ext(exp.fmt))}>{"⬇"} Download</button>
            <button className="es-btn" onClick={() => shareFile(finalUrl(), "spine-picture." + ext(exp.fmt), exp.fmt)}>{"↗"} Share</button>
            <button className="es-btn gold" onClick={save}>Use it</button>
          </div>
        </>)}
      </div>
    </Sheet>
  );
}
function LookThumb({ img, look }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!img || !ref.current) return;
    const g = geom(img, { rot: 0 }, 96);
    const st = { adj: { ...ADJ0 }, look, lookAmt: 100 }; const A = effAdj(st);
    let cv = g; if (A.blur) cv = softBlur(cv, A.blur / 4);
    adjustPixels(cv, { ...A, grain: 0 });
    const c = ref.current; c.width = cv.width; c.height = cv.height; c.getContext("2d").drawImage(cv, 0, 0);
  }, [img, look]);
  return <canvas ref={ref} className="es-thumb" />;
}
function Colors({ value, onPick, label }) {
  return (
    <div className="es-colors">{label && <span className="es-hint">{label}</span>}
      {SWATCH.map((c) => <button key={c} className={"es-sw" + (value === c ? " on" : "")} style={{ background: c }} onClick={() => onPick(c)} aria-label={"Colour " + c} />)}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#ffffff"} onChange={(e) => onPick(e.target.value)} aria-label="Any colour" />
    </div>
  );
}
function LayerActions({ L, onDup, onDel, onOrder }) {
  return (
    <div className="es-row wrap">
      <button className="es-chip" onClick={() => onDup(L)}>Duplicate</button>
      <button className="es-chip" onClick={() => onOrder(L, 1)}>Bring forward</button>
      <button className="es-chip" onClick={() => onOrder(L, -1)}>Send back</button>
      <button className="es-chip danger" onClick={() => onDel(L.id)}>Delete</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  SOUND
// ─────────────────────────────────────────────────────────────────────────────────────────────
const AP0 = { start: 0, end: 0, fadeIn: 0, fadeOut: 0, gain: 0, normalize: false, speed: 1, reverse: false, bass: 0, mid: 0, treble: 0, lowcut: 0, highcut: 0, reverb: 0, room: 2, echo: 0, echoTime: 0.3, echoFeedback: 0.35, punch: false, pan: 0, mono: false, loops: 1 };
const AUDIO_PRESETS = [
  ["Clear voice", { lowcut: 90, mid: 3, treble: 4, punch: true, normalize: true }],
  ["Podcast", { lowcut: 80, bass: 2, mid: 2, treble: 3, punch: true, normalize: true }],
  ["Radio", { lowcut: 300, highcut: 4000, mid: 6, punch: true, normalize: true }],
  ["Telephone", { lowcut: 500, highcut: 3000, mid: 8, mono: true }],
  ["Bass boost", { bass: 9, punch: true }],
  ["Lo-fi", { highcut: 5000, bass: 3, treble: -6, reverb: 15 }],
  ["Big room", { reverb: 45, room: 3.5 }],
  ["Stadium", { reverb: 60, room: 5, echo: 20, echoTime: 0.45 }],
  ["Echo", { echo: 45, echoTime: 0.35, echoFeedback: 0.45 }],
  ["Underwater", { highcut: 700, bass: 6, reverb: 30 }],
  ["Chipmunk", { speed: 1.5 }], ["Slow & deep", { speed: 0.75 }],
];
function encodeWav(buf) {
  const nCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * nCh * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + len * nCh * 2, true); w(8, "WAVE"); w(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, nCh, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * nCh * 2, true); out.setUint16(32, nCh * 2, true);
  out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, len * nCh * 2, true);
  const chans = []; for (let c = 0; c < nCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); out.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([out], { type: "audio/wav" });
}
function impulse(ctx, seconds) {
  const sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * seconds)), b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return b;
}
export async function renderAudio(src, P) {
  const sr = src.sampleRate, nCh = Math.min(2, src.numberOfChannels);
  const s0 = Math.floor(P.start * sr), s1 = Math.max(s0 + 1, Math.floor((P.end || src.duration) * sr)), seg = s1 - s0, loops = clamp(P.loops || 1, 1, 8);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  // 1) cut, reverse, loop
  const pre = new OAC(nCh, seg * loops, sr).createBuffer(nCh, seg * loops, sr);
  for (let c = 0; c < nCh; c++) {
    const from = src.getChannelData(Math.min(c, src.numberOfChannels - 1)).subarray(s0, s1), to = pre.getChannelData(c);
    for (let k = 0; k < loops; k++) { if (P.reverse) { for (let i = 0; i < seg; i++) to[k * seg + i] = from[seg - 1 - i]; } else to.set(from, k * seg); }
  }
  const speed = clamp(P.speed || 1, 0.25, 3), tail = (P.reverb > 0 ? P.room : 0) + (P.echo > 0 ? P.echoTime * 6 : 0);
  const outLen = Math.ceil((seg * loops) / speed + tail * sr);
  const off = new OAC(nCh, outLen, sr);
  const node = off.createBufferSource(); node.buffer = pre; node.playbackRate.value = speed;
  const t = (seg * loops) / speed / sr;
  // 2) fades and volume
  const g = off.createGain(); const vol = Math.pow(10, (P.gain || 0) / 20);
  g.gain.setValueAtTime(P.fadeIn > 0 ? 0 : vol, 0);
  if (P.fadeIn > 0) g.gain.linearRampToValueAtTime(vol, Math.min(P.fadeIn, t));
  if (P.fadeOut > 0) { g.gain.setValueAtTime(vol, Math.max(0, t - P.fadeOut)); g.gain.linearRampToValueAtTime(0, t); }
  let last = node; node.connect(g); last = g;
  // 3) tone
  const chain = (n) => { last.connect(n); last = n; };
  if (P.lowcut > 0) { const f = off.createBiquadFilter(); f.type = "highpass"; f.frequency.value = P.lowcut; chain(f); }
  if (P.highcut > 0) { const f = off.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = P.highcut; chain(f); }
  if (P.bass) { const f = off.createBiquadFilter(); f.type = "lowshelf"; f.frequency.value = 200; f.gain.value = P.bass; chain(f); }
  if (P.mid) { const f = off.createBiquadFilter(); f.type = "peaking"; f.frequency.value = 1200; f.Q.value = 0.9; f.gain.value = P.mid; chain(f); }
  if (P.treble) { const f = off.createBiquadFilter(); f.type = "highshelf"; f.frequency.value = 4000; f.gain.value = P.treble; chain(f); }
  if (P.punch) { const k = off.createDynamicsCompressor(); k.threshold.value = -24; k.knee.value = 20; k.ratio.value = 4; k.attack.value = 0.005; k.release.value = 0.2; chain(k); }
  if (P.pan && off.createStereoPanner) { const p = off.createStereoPanner(); p.pan.value = clamp(P.pan, -1, 1); chain(p); }
  // 4) space: dry + reverb + echo
  const mix = off.createGain(); last.connect(mix);
  if (P.reverb > 0) { const cv = off.createConvolver(); cv.buffer = impulse(off, P.room || 2); const wg = off.createGain(); wg.gain.value = P.reverb / 100 * 0.9; last.connect(cv); cv.connect(wg); wg.connect(mix); }
  if (P.echo > 0) { const dl = off.createDelay(5); dl.delayTime.value = P.echoTime; const fb = off.createGain(); fb.gain.value = clamp(P.echoFeedback, 0, 0.85); const wg = off.createGain(); wg.gain.value = P.echo / 100; last.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wg); wg.connect(mix); }
  mix.connect(off.destination);
  node.start(0);
  const out = await off.startRendering();
  // 5) after: mono, normalise, trim the silent tail the effects left behind
  if (P.mono && out.numberOfChannels > 1) { const a = out.getChannelData(0), b = out.getChannelData(1); for (let i = 0; i < a.length; i++) { const m = (a[i] + b[i]) / 2; a[i] = m; b[i] = m; } }
  if (P.normalize) { let pk = 0; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); } if (pk > 0.0001) { const k = 0.89 / pk; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } } }
  return out;
}
function silenceBounds(buf, thr) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, th = thr || 0.02; let a = 0, b = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < th) a++;
  while (b > a && Math.abs(d[b]) < th) b--;
  return [Math.max(0, a / sr - 0.05), Math.min(buf.duration, b / sr + 0.08)];
}
export function AudioStudio({ src, onSave, onClose, title }) {
  const [buf, setBuf] = React.useState(null);
  const [err, setErr] = React.useState("");
  const hist = useHistory(AP0);
  const [P, setP] = React.useState(AP0);
  const [tab, setTab] = React.useState("trim");
  const [busy, setBusy] = React.useState("");
  const [playing, setPlaying] = React.useState(false);
  const wfRef = React.useRef(null), ctxRef = React.useRef(null), nodeRef = React.useRef(null), dragRef = React.useRef(null), peaksRef = React.useRef(null);
  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
        const ab = await (await fetch(src)).arrayBuffer();
        const b = await new Promise((ok, no) => { const p = ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); });
        try { ctx.close(); } catch (e) {}
        if (!live) return;
        setBuf(b); const p0 = { ...AP0, end: b.duration }; setP(p0); hist.reset(p0);
      } catch (e) { if (live) setErr("Couldn't open this sound for editing."); }
    })();
    return () => { live = false; stop(); };
  }, [src]);
  React.useEffect(() => { if (hist.cur && buf) setP(hist.cur); }, [hist.cur]);
  const commit = (n) => hist.push(n || P);
  const set = (patch, now) => setP((o) => { const n = { ...o, ...patch }; if (now) hist.push(n); return n; });
  // waveform
  React.useEffect(() => {
    if (!buf || !wfRef.current) return;
    const cv = wfRef.current, W = cv.clientWidth * (window.devicePixelRatio || 1), H = 120 * (window.devicePixelRatio || 1);
    cv.width = W; cv.height = H;
    if (!peaksRef.current || peaksRef.current.w !== W) {
      const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / W)), pk = new Float32Array(W);
      for (let x = 0; x < W; x++) { let m = 0; for (let i = x * step, e = Math.min(d.length, i + step); i < e; i += 4) m = Math.max(m, Math.abs(d[i])); pk[x] = m; }
      peaksRef.current = { w: W, pk };
    }
    const c = cv.getContext("2d"), pk = peaksRef.current.pk, dur = buf.duration, sx = (P.start / dur) * W, ex = ((P.end || dur) / dur) * W;
    c.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x++) { const inSel = x >= sx && x <= ex; c.fillStyle = inSel ? "#c9a227" : "rgba(140,140,140,.45)"; const h = Math.max(1, pk[x] * H * 0.95); c.fillRect(x, (H - h) / 2, 1, h); }
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(0, 0, sx, H); c.fillRect(ex, 0, W - ex, H);
    c.fillStyle = "#0a84ff"; c.fillRect(sx - 2, 0, 4, H); c.fillRect(ex - 2, 0, 4, H);
  }, [buf, P.start, P.end]);
  function wfPos(e) { const r = wfRef.current.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * buf.duration; }
  function wfDown(e) { if (!buf) return; const t = wfPos(e); const which = Math.abs(t - P.start) < Math.abs(t - P.end) ? "start" : "end"; dragRef.current = which; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {} wfMove(e); }
  function wfMove(e) { const w = dragRef.current; if (!w) return; const t = wfPos(e); setP((o) => (w === "start" ? { ...o, start: Math.min(t, o.end - 0.1) } : { ...o, end: Math.max(t, o.start + 0.1) })); }
  function wfUp() { if (dragRef.current) { dragRef.current = null; setP((o) => { hist.push(o); return o; }); } }
  function stop() { try { nodeRef.current && nodeRef.current.stop(); } catch (e) {} nodeRef.current = null; setPlaying(false); }
  async function preview(raw) {
    if (!buf) return; stop(); setBusy("Preparing...");
    try {
      const out = raw ? buf : await renderAudio(buf, P);
      const AC = window.AudioContext || window.webkitAudioContext; if (!ctxRef.current) ctxRef.current = new AC(); const ctx = ctxRef.current; if (ctx.state === "suspended") await ctx.resume();
      const n = ctx.createBufferSource(); n.buffer = out; n.connect(ctx.destination); n.onended = () => setPlaying(false);
      if (raw) n.start(0, P.start, Math.max(0.1, P.end - P.start)); else n.start(0);
      nodeRef.current = n; setPlaying(true);
    } catch (e) { setErr("Couldn't play this back."); }
    setBusy("");
  }
  async function result() { const out = await renderAudio(buf, P); return URL.createObjectURL(encodeWav(out)); }
  async function save() { setBusy("Rendering..."); try { const u = await result(); onSave && onSave(u); } catch (e) { setErr("Couldn't render this sound."); } setBusy(""); }
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") + "." + Math.floor((s % 1) * 10);
  const dur = buf ? buf.duration : 0, outLen = buf ? ((P.end - P.start) * (P.loops || 1)) / (P.speed || 1) : 0;
  const TABS = [["trim", "Trim"], ["volume", "Volume"], ["tone", "Tone"], ["effects", "Effects"], ["speed", "Speed"], ["presets", "Presets"], ["export", "Export"]];
  return (
    <Sheet title={title || "Edit sound"} onClose={() => { stop(); onClose && onClose(); }} actions={<>
      <button className="es-ic" onClick={hist.undo} disabled={!hist.canUndo} aria-label="Undo">{"↶"}</button>
      <button className="es-ic" onClick={hist.redo} disabled={!hist.canRedo} aria-label="Redo">{"↷"}</button>
      <button className="es-save" onClick={save} disabled={!buf || !!busy}>{busy || "Save"}</button>
    </>}>
      {err && <div className="es-err">{err}</div>}
      {!buf && !err && <div className="es-load">Opening sound...</div>}
      {buf && (<>
        <div className="es-wave"><canvas ref={wfRef} onPointerDown={wfDown} onPointerMove={wfMove} onPointerUp={wfUp} onPointerCancel={wfUp} style={{ touchAction: "none" }} /></div>
        <div className="es-row center">
          <span className="es-time">{fmt(P.start)} {"→"} {fmt(P.end)}</span>
          <span className="es-hint">result {fmt(outLen)}</span>
        </div>
        <div className="es-row center">
          {!playing ? <button className="es-btn gold" onClick={() => preview(false)} disabled={!!busy}>{"▶"} Play edit</button> : <button className="es-btn gold" onClick={stop}>{"■"} Stop</button>}
          <button className="es-btn" onClick={() => preview(true)} disabled={!!busy || playing}>Play original</button>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="es-panel">
          {tab === "trim" && (<>
            <Slide label="Start" value={+P.start.toFixed(2)} min={0} max={+dur.toFixed(2)} step={0.01} fmt={fmt} onChange={(v) => setP((o) => ({ ...o, start: Math.min(v, o.end - 0.1) }))} onCommit={() => commit()} />
            <Slide label="End" value={+P.end.toFixed(2)} min={0} max={+dur.toFixed(2)} step={0.01} fmt={fmt} onChange={(v) => setP((o) => ({ ...o, end: Math.max(v, o.start + 0.1) }))} onCommit={() => commit()} />
            <Slide label="Fade in" value={P.fadeIn} min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} onChange={(v) => setP((o) => ({ ...o, fadeIn: v }))} onCommit={() => commit()} />
            <Slide label="Fade out" value={P.fadeOut} min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} onChange={(v) => setP((o) => ({ ...o, fadeOut: v }))} onCommit={() => commit()} />
            <div className="es-row wrap">
              <button className="es-chip" onClick={() => { const [a, b] = silenceBounds(buf); set({ start: a, end: b }, true); }}>Trim silence</button>
              <button className="es-chip" onClick={() => set({ start: 0, end: dur }, true)}>Whole thing</button>
              <button className="es-chip" onClick={() => set({ end: Math.min(dur, P.start + 15) }, true)}>15s clip</button>
              <button className="es-chip" onClick={() => set({ end: Math.min(dur, P.start + 30) }, true)}>30s clip</button>
              <button className="es-chip" onClick={() => set({ end: Math.min(dur, P.start + 60) }, true)}>60s clip</button>
            </div>
            <div className="es-hint">Drag the blue lines on the wave to choose the part you keep.</div>
          </>)}
          {tab === "volume" && (<>
            <Slide label="Volume" value={P.gain} min={-24} max={12} step={0.5} fmt={(v) => (v > 0 ? "+" : "") + v + " dB"} onChange={(v) => setP((o) => ({ ...o, gain: v }))} onCommit={() => commit()} />
            <Slide label="Left / right" value={P.pan} min={-1} max={1} step={0.05} fmt={(v) => (v === 0 ? "centre" : v < 0 ? "L " + Math.round(-v * 100) : "R " + Math.round(v * 100))} onChange={(v) => setP((o) => ({ ...o, pan: v }))} onCommit={() => commit()} />
            <div className="es-row wrap">
              <button className={"es-chip" + (P.normalize ? " on" : "")} onClick={() => set({ normalize: !P.normalize }, true)}>Make it loud & even</button>
              <button className={"es-chip" + (P.punch ? " on" : "")} onClick={() => set({ punch: !P.punch }, true)}>Punch (compressor)</button>
              <button className={"es-chip" + (P.mono ? " on" : "")} onClick={() => set({ mono: !P.mono }, true)}>Mono</button>
            </div>
          </>)}
          {tab === "tone" && (<>
            <Slide label="Bass" value={P.bass} min={-12} max={12} step={0.5} fmt={(v) => (v > 0 ? "+" : "") + v + " dB"} onChange={(v) => setP((o) => ({ ...o, bass: v }))} onCommit={() => commit()} />
            <Slide label="Middle" value={P.mid} min={-12} max={12} step={0.5} fmt={(v) => (v > 0 ? "+" : "") + v + " dB"} onChange={(v) => setP((o) => ({ ...o, mid: v }))} onCommit={() => commit()} />
            <Slide label="Treble" value={P.treble} min={-12} max={12} step={0.5} fmt={(v) => (v > 0 ? "+" : "") + v + " dB"} onChange={(v) => setP((o) => ({ ...o, treble: v }))} onCommit={() => commit()} />
            <Slide label="Cut rumble below" value={P.lowcut} min={0} max={800} step={10} fmt={(v) => (v ? v + " Hz" : "off")} onChange={(v) => setP((o) => ({ ...o, lowcut: v }))} onCommit={() => commit()} />
            <Slide label="Cut hiss above" value={P.highcut} min={0} max={16000} step={100} fmt={(v) => (v ? (v / 1000).toFixed(1) + " kHz" : "off")} onChange={(v) => setP((o) => ({ ...o, highcut: v }))} onCommit={() => commit()} />
          </>)}
          {tab === "effects" && (<>
            <Slide label="Reverb" value={P.reverb} min={0} max={100} fmt={(v) => v + "%"} onChange={(v) => setP((o) => ({ ...o, reverb: v }))} onCommit={() => commit()} />
            {P.reverb > 0 && <Slide label="Room size" value={P.room} min={0.3} max={6} step={0.1} fmt={(v) => v.toFixed(1) + "s"} onChange={(v) => setP((o) => ({ ...o, room: v }))} onCommit={() => commit()} zero={2} />}
            <Slide label="Echo" value={P.echo} min={0} max={100} fmt={(v) => v + "%"} onChange={(v) => setP((o) => ({ ...o, echo: v }))} onCommit={() => commit()} />
            {P.echo > 0 && <Slide label="Echo time" value={P.echoTime} min={0.05} max={1.5} step={0.01} fmt={(v) => Math.round(v * 1000) + " ms"} onChange={(v) => setP((o) => ({ ...o, echoTime: v }))} onCommit={() => commit()} zero={0.3} />}
            {P.echo > 0 && <Slide label="Echo repeats" value={P.echoFeedback} min={0} max={0.85} step={0.01} fmt={(v) => Math.round(v * 100) + "%"} onChange={(v) => setP((o) => ({ ...o, echoFeedback: v }))} onCommit={() => commit()} zero={0.35} />}
            <div className="es-row wrap"><button className={"es-chip" + (P.reverse ? " on" : "")} onClick={() => set({ reverse: !P.reverse }, true)}>Play backwards</button></div>
          </>)}
          {tab === "speed" && (<>
            <Slide label="Speed (pitch follows)" value={P.speed} min={0.5} max={2} step={0.05} fmt={(v) => v.toFixed(2) + "×"} onChange={(v) => setP((o) => ({ ...o, speed: v }))} onCommit={() => commit()} zero={1} />
            <div className="es-row wrap">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => <button key={s} className={"es-chip" + (P.speed === s ? " on" : "")} onClick={() => set({ speed: s }, true)}>{s}{"×"}</button>)}</div>
            <Slide label="Repeat" value={P.loops} min={1} max={8} fmt={(v) => (v === 1 ? "once" : v + " times")} onChange={(v) => setP((o) => ({ ...o, loops: v }))} onCommit={() => commit()} zero={1} />
          </>)}
          {tab === "presets" && (<>
            <div className="es-row wrap">{AUDIO_PRESETS.map(([n, p]) => <button key={n} className="es-chip" onClick={() => set({ ...AP0, start: P.start, end: P.end, fadeIn: P.fadeIn, fadeOut: P.fadeOut, ...p }, true)}>{n}</button>)}</div>
            <button className="es-btn" onClick={() => set({ ...AP0, start: P.start, end: P.end }, true)}>Clear effects</button>
          </>)}
          {tab === "export" && (<>
            <div className="es-row">
              <button className="es-btn" disabled={!!busy} onClick={async () => { setBusy("Rendering..."); try { download(await result(), "spine-sound.wav"); } catch (e) {} setBusy(""); }}>{"⬇"} Download WAV</button>
              <button className="es-btn" disabled={!!busy} onClick={async () => { setBusy("Rendering..."); try { await shareFile(await result(), "spine-sound.wav", "audio/wav"); } catch (e) {} setBusy(""); }}>{"↗"} Share</button>
              <button className="es-btn gold" disabled={!!busy} onClick={save}>Use it</button>
            </div>
            <div className="es-hint">WAV is full quality and plays everywhere.</div>
          </>)}
        </div>
      </>)}
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  VIDEO  (FFmpeg on the phone - the same engine the film joiner already loads)
// ─────────────────────────────────────────────────────────────────────────────────────────────
const VP0 = { start: 0, end: 0, speed: 1, reverse: false, rot: 0, flipH: false, flipV: false, shape: "original", bright: 0, contrast: 0, sat: 0, look: "none", fadeIn: 0, fadeOut: 0, volume: 100, mute: false, text: "", textPos: "bottom", textColor: "#ffffff", textSize: 7, textBox: true, size: "original" };
const VLOOKS = [["none", "None", ""], ["bw", "Black & white", "hue=s=0"], ["sepia", "Sepia", "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"], ["warm", "Warm", "colorbalance=rs=.12:gs=.02:bs=-.12"], ["cool", "Cool", "colorbalance=rs=-.12:bs=.12"], ["vivid", "Vivid", "eq=saturation=1.45:contrast=1.08"], ["fade", "Faded", "eq=contrast=0.85:brightness=0.05:saturation=0.8"], ["noir", "Noir", "hue=s=0,eq=contrast=1.35"]];
const VCSS = { none: "", bw: "grayscale(1)", sepia: "sepia(.9)", warm: "sepia(.25) saturate(1.2)", cool: "hue-rotate(-12deg) saturate(.95)", vivid: "saturate(1.45) contrast(1.08)", fade: "contrast(.85) brightness(1.05) saturate(.8)", noir: "grayscale(1) contrast(1.35)" };
function textOverlayPng(V, w, h) {
  const cv = mk(w, h), c = cv.getContext("2d"), size = Math.round(h * V.textSize / 100);
  c.font = "800 " + size + "px Manrope, Inter, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  const lines = String(V.text).split("\n").slice(0, 4), lh = size * 1.2, tw = Math.max(...lines.map((t) => c.measureText(t).width)), th = lh * lines.length;
  const cy = V.textPos === "top" ? h * 0.1 + th / 2 : V.textPos === "middle" ? h / 2 : h * 0.9 - th / 2;
  if (V.textBox) { c.fillStyle = "rgba(0,0,0,.55)"; const p = size * 0.35; c.fillRect(w / 2 - tw / 2 - p, cy - th / 2 - p * 0.6, tw + p * 2, th + p * 1.2); }
  lines.forEach((t, i) => { const y = cy - th / 2 + lh * (i + 0.5); c.lineWidth = Math.max(2, size / 9); c.strokeStyle = "rgba(0,0,0,.8)"; if (!V.textBox) c.strokeText(t, w / 2, y); c.fillStyle = V.textColor; c.fillText(t, w / 2, y); });
  return cv;
}
export function VideoStudio({ src, onSave, onClose, loadFfmpeg, title }) {
  const vref = React.useRef(null);
  const [meta, setMeta] = React.useState(null);           // {dur, w, h}
  const hist = useHistory(VP0);
  const [V, setV] = React.useState(VP0);
  const [tab, setTab] = React.useState("trim");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [out, setOut] = React.useState(null);              // {url, name, type}
  const [fmtOut, setFmtOut] = React.useState("mp4");
  React.useEffect(() => { if (hist.cur && meta) setV(hist.cur); }, [hist.cur]);
  const commit = (n) => hist.push(n || V);
  const set = (patch, now) => setV((o) => { const n = { ...o, ...patch }; if (now) hist.push(n); return n; });
  function onMeta() { const v = vref.current; if (!v) return; const m = { dur: v.duration || 0, w: v.videoWidth, h: v.videoHeight }; setMeta(m); const v0 = { ...VP0, end: m.dur }; setV(v0); hist.reset(v0); }
  // keep the preview inside the chosen part
  React.useEffect(() => {
    const v = vref.current; if (!v) return;
    const tick = () => { if (v.currentTime < V.start - 0.05 || v.currentTime > V.end) { v.currentTime = V.start; } };
    v.addEventListener("timeupdate", tick); return () => v.removeEventListener("timeupdate", tick);
  }, [V.start, V.end]);
  React.useEffect(() => { const v = vref.current; if (v) { try { v.playbackRate = V.speed; } catch (e) {} v.muted = V.mute; v.volume = clamp(V.volume / 100, 0, 1); } }, [V.speed, V.mute, V.volume]);
  const cssFilter = [VCSS[V.look] || "", V.bright ? "brightness(" + (1 + V.bright / 100) + ")" : "", V.contrast ? "contrast(" + (1 + V.contrast / 100) + ")" : "", V.sat ? "saturate(" + (1 + V.sat / 100) + ")" : ""].join(" ").trim();
  const cssTransform = "rotate(" + V.rot + "deg) scale(" + (V.flipH ? -1 : 1) + "," + (V.flipV ? -1 : 1) + ")";
  const SHAPES = { original: null, "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 };

  async function render(kind) {
    if (!loadFfmpeg) { setErr("The video engine isn't available here."); return null; }
    setErr(""); setBusy("Starting the video engine...");
    try {
      const ff = await loadFfmpeg((m) => setBusy(m));
      const logs = []; const onLog = ({ message }) => { logs.push(message); }; const onProg = ({ progress }) => { if (progress > 0 && progress <= 1) setBusy("Rendering " + Math.round(progress * 100) + "%..."); };
      try { ff.on("log", onLog); ff.on("progress", onProg); } catch (e) {}
      setBusy("Loading your clip...");
      const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
      await ff.writeFile("vin.mp4", bytes);
      try { await ff.exec(["-hide_banner", "-i", "vin.mp4"]); } catch (e) {}
      const hasAudio = logs.some((l) => /Stream #.*Audio:/.test(l));
      const D = Math.max(0.1, (V.end - V.start) / V.speed);
      const vf = [];
      if (V.speed !== 1) vf.push("setpts=PTS/" + V.speed);
      if (V.reverse) vf.push("reverse");
      if (V.rot === 90) vf.push("transpose=1"); else if (V.rot === 180) vf.push("hflip,vflip"); else if (V.rot === 270) vf.push("transpose=2");
      if (V.flipH) vf.push("hflip"); if (V.flipV) vf.push("vflip");
      const R = SHAPES[V.shape]; if (R) vf.push("crop='min(iw,ih*" + R.toFixed(4) + ")':'min(ih,iw/" + R.toFixed(4) + ")'");
      const sz = { original: 0, "1080": 1080, "720": 720, "480": 480 }[V.size]; if (sz) vf.push("scale=-2:'min(" + sz + ",ih)'");
      if (V.bright || V.contrast || V.sat) vf.push("eq=brightness=" + (V.bright / 200).toFixed(3) + ":contrast=" + (1 + V.contrast / 100).toFixed(3) + ":saturation=" + (1 + V.sat / 100).toFixed(3));
      const lk = VLOOKS.find((l) => l[0] === V.look); if (lk && lk[2]) vf.push(lk[2]);
      if (V.fadeIn > 0) vf.push("fade=t=in:st=0:d=" + V.fadeIn);
      if (V.fadeOut > 0) vf.push("fade=t=out:st=" + Math.max(0, D - V.fadeOut).toFixed(2) + ":d=" + V.fadeOut);
      vf.push("format=yuv420p");
      const af = [];
      if (V.speed !== 1) af.push("atempo=" + V.speed);
      if (V.reverse) af.push("areverse");
      if (V.volume !== 100) af.push("volume=" + (V.volume / 100).toFixed(2));
      if (V.fadeIn > 0) af.push("afade=t=in:st=0:d=" + V.fadeIn);
      if (V.fadeOut > 0) af.push("afade=t=out:st=" + Math.max(0, D - V.fadeOut).toFixed(2) + ":d=" + V.fadeOut);
      const args = ["-hide_banner", "-ss", V.start.toFixed(2), "-to", V.end.toFixed(2), "-i", "vin.mp4"];
      const useText = V.text.trim() && kind !== "audio";
      if (useText) {
        // Text is drawn on the phone (fonts and emoji just work) and laid over the picture.
        const ow = 1080, oh = Math.round(1080 / (R || ((V.rot % 180 ? meta.h / meta.w : meta.w / meta.h) || 16 / 9)));
        const png = textOverlayPng(V, ow, oh), b64 = png.toDataURL("image/png").split(",")[1];
        await ff.writeFile("txt.png", Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
        args.push("-i", "txt.png");
      }
      let outName, type;
      if (kind === "gif") {
        outName = "out.gif"; type = "image/gif";
        const chain = vf.filter((f) => f !== "format=yuv420p").concat(["fps=12", "scale=360:-2:flags=lanczos"]).join(",");
        args.push("-filter_complex", (useText ? "[0:v]" + chain + "[b];[1:v][b]scale2ref=w=main_w:h=main_h[o][b2];[b2][o]overlay=0:0," : "[0:v]" + chain + ",") + "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer", "-loop", "0", outName);
      } else if (kind === "audio") {
        if (!hasAudio) { setBusy(""); setErr("This clip has no sound to take out."); return null; }
        outName = "out.mp3"; type = "audio/mpeg";
        args.push("-vn"); if (af.length) args.push("-af", af.join(",")); args.push("-c:a", "libmp3lame", "-q:a", "3", outName);
      } else {
        outName = "out.mp4"; type = "video/mp4";
        if (useText) args.push("-filter_complex", "[0:v]" + vf.join(",") + "[b];[1:v][b]scale2ref=w=main_w:h=main_h[o][b2];[b2][o]overlay=0:0,format=yuv420p[v]", "-map", "[v]");
        else args.push("-vf", vf.join(","), "-map", "0:v:0");
        if (hasAudio && !V.mute) { args.push("-map", "0:a:0?"); if (af.length) args.push("-af", af.join(",")); args.push("-c:a", "aac", "-b:a", "160k"); } else args.push("-an");
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-movflags", "+faststart", outName);
      }
      setBusy("Rendering...");
      const code = await ff.exec(args);
      try { ff.off && ff.off("log", onLog); ff.off && ff.off("progress", onProg); } catch (e) {}
      let data; try { data = await ff.readFile(outName); } catch (e) { data = null; }
      try { await ff.deleteFile("vin.mp4"); await ff.deleteFile(outName); if (useText) await ff.deleteFile("txt.png"); } catch (e) {}
      if (!data || !data.length || (code && code !== 0 && !data.length)) { setBusy(""); setErr("That edit didn't render on this phone. Try a shorter part or a smaller size."); return null; }
      const url = URL.createObjectURL(new Blob([data.buffer || data], { type }));
      const res = { url, type, name: "spine-" + (kind === "gif" ? "clip.gif" : kind === "audio" ? "sound.mp3" : "video.mp4") };
      setOut(res); setBusy(""); return res;
    } catch (e) { setBusy(""); setErr("The video engine couldn't run here: " + String((e && e.message) || e).slice(0, 120)); return null; }
  }
  function grabFrame() {
    const v = vref.current; if (!v || !v.videoWidth) return;
    const cv = mk(v.videoWidth, v.videoHeight), c = cv.getContext("2d");
    try { c.filter = cssFilter || "none"; } catch (e) {}
    c.drawImage(v, 0, 0);
    try { download(cv.toDataURL("image/png"), "spine-frame.png"); } catch (e) { setErr("This video's frames can't be saved (the site it came from blocks it)."); }
  }
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") + "." + Math.floor((s % 1) * 10);
  const dur = meta ? meta.dur : 0;
  const TABS = [["trim", "Trim"], ["speed", "Speed"], ["shape", "Rotate & shape"], ["color", "Colour"], ["text", "Text"], ["sound", "Sound"], ["fades", "Fades"], ["export", "Export"]];
  return (
    <Sheet title={title || "Edit video"} onClose={onClose} actions={<>
      <button className="es-ic" onClick={hist.undo} disabled={!hist.canUndo} aria-label="Undo">{"↶"}</button>
      <button className="es-ic" onClick={hist.redo} disabled={!hist.canRedo} aria-label="Redo">{"↷"}</button>
      <button className="es-save" disabled={!meta || !!busy} onClick={async () => { const r = out && out.type === "video/mp4" ? out : await render("mp4"); if (r && onSave) onSave(r.url); }}>{busy ? "Working..." : "Save"}</button>
    </>}>
      <div className="es-stage video">
        <div className="es-vwrap" style={SHAPES[V.shape] ? { aspectRatio: String(SHAPES[V.shape]), width: "auto", maxWidth: "100%" } : undefined}>
          <video ref={vref} src={src} playsInline controls loop onLoadedMetadata={onMeta} style={{ filter: cssFilter || undefined, transform: cssTransform, objectFit: SHAPES[V.shape] ? "cover" : "contain" }} />
          {V.text.trim() && <div className={"es-vtext " + V.textPos} style={{ color: V.textColor, fontSize: "calc(" + V.textSize + " * 1cqh)", background: V.textBox ? "rgba(0,0,0,.55)" : "none" }}>{V.text}</div>}
        </div>
      </div>
      {busy && <div className="es-busy"><span className="es-spin" />{busy}</div>}
      {err && <div className="es-err">{err}</div>}
      {meta && <div className="es-row center"><span className="es-time">{fmt(V.start)} {"→"} {fmt(V.end)}</span><span className="es-hint">result {fmt((V.end - V.start) / V.speed)}</span></div>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="es-panel">
        {!meta && <div className="es-load">Opening video...</div>}
        {meta && tab === "trim" && (<>
          <Slide label="Start" value={+V.start.toFixed(2)} min={0} max={+dur.toFixed(2)} step={0.05} fmt={fmt} onChange={(v) => { setV((o) => ({ ...o, start: Math.min(v, o.end - 0.2) })); if (vref.current) vref.current.currentTime = v; }} onCommit={() => commit()} />
          <Slide label="End" value={+V.end.toFixed(2)} min={0} max={+dur.toFixed(2)} step={0.05} fmt={fmt} onChange={(v) => { setV((o) => ({ ...o, end: Math.max(v, o.start + 0.2) })); if (vref.current) vref.current.currentTime = Math.max(0, v - 0.3); }} onCommit={() => commit()} />
          <div className="es-row wrap">
            <button className="es-chip" onClick={() => { const t = vref.current ? vref.current.currentTime : 0; set({ start: Math.min(t, V.end - 0.2) }, true); }}>Start here</button>
            <button className="es-chip" onClick={() => { const t = vref.current ? vref.current.currentTime : dur; set({ end: Math.max(t, V.start + 0.2) }, true); }}>End here</button>
            <button className="es-chip" onClick={() => set({ start: 0, end: dur }, true)}>Whole clip</button>
            <button className="es-chip" onClick={grabFrame}>Save this frame</button>
          </div>
        </>)}
        {meta && tab === "speed" && (<>
          <div className="es-row wrap">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => <button key={s} className={"es-chip" + (V.speed === s ? " on" : "")} onClick={() => set({ speed: s }, true)}>{s === 0.5 ? "Slow-mo 0.5" : s}{"×"}</button>)}</div>
          <div className="es-row wrap"><button className={"es-chip" + (V.reverse ? " on" : "")} onClick={() => set({ reverse: !V.reverse }, true)}>Play backwards</button></div>
        </>)}
        {meta && tab === "shape" && (<>
          <div className="es-row">
            <button className="es-btn" onClick={() => set({ rot: (V.rot + 270) % 360 }, true)}>{"↺"} Left</button>
            <button className="es-btn" onClick={() => set({ rot: (V.rot + 90) % 360 }, true)}>{"↻"} Right</button>
            <button className={"es-btn" + (V.flipH ? " on" : "")} onClick={() => set({ flipH: !V.flipH }, true)}>{"↔"} Mirror</button>
            <button className={"es-btn" + (V.flipV ? " on" : "")} onClick={() => set({ flipV: !V.flipV }, true)}>{"↕"} Flip</button>
          </div>
          <div className="es-row wrap">{[["original", "Original"], ["9:16", "Story 9:16"], ["16:9", "Wide 16:9"], ["1:1", "Square"], ["4:5", "Feed 4:5"]].map(([k, l]) => <button key={k} className={"es-chip" + (V.shape === k ? " on" : "")} onClick={() => set({ shape: k }, true)}>{l}</button>)}</div>
          <div className="es-row wrap">{[["original", "Full size"], ["1080", "1080p"], ["720", "720p"], ["480", "480p (small)"]].map(([k, l]) => <button key={k} className={"es-chip" + (V.size === k ? " on" : "")} onClick={() => set({ size: k }, true)}>{l}</button>)}</div>
        </>)}
        {meta && tab === "color" && (<>
          <div className="es-row wrap">{VLOOKS.map(([k, l]) => <button key={k} className={"es-chip" + (V.look === k ? " on" : "")} onClick={() => set({ look: k }, true)}>{l}</button>)}</div>
          <Slide label="Brightness" value={V.bright} min={-60} max={60} onChange={(v) => setV((o) => ({ ...o, bright: v }))} onCommit={() => commit()} />
          <Slide label="Contrast" value={V.contrast} min={-60} max={80} onChange={(v) => setV((o) => ({ ...o, contrast: v }))} onCommit={() => commit()} />
          <Slide label="Saturation" value={V.sat} min={-100} max={100} onChange={(v) => setV((o) => ({ ...o, sat: v }))} onCommit={() => commit()} />
        </>)}
        {meta && tab === "text" && (<>
          <textarea className="es-in" rows={2} placeholder="Words on the video (a title, a caption)" value={V.text} onChange={(e) => setV((o) => ({ ...o, text: e.target.value.slice(0, 120) }))} onBlur={() => commit()} />
          <div className="es-row wrap">{["top", "middle", "bottom"].map((p) => <button key={p} className={"es-chip" + (V.textPos === p ? " on" : "")} onClick={() => set({ textPos: p }, true)}>{p[0].toUpperCase() + p.slice(1)}</button>)}<button className={"es-chip" + (V.textBox ? " on" : "")} onClick={() => set({ textBox: !V.textBox }, true)}>Box behind</button></div>
          <Colors value={V.textColor} onPick={(c) => set({ textColor: c }, true)} />
          <Slide label="Size" value={V.textSize} min={3} max={16} onChange={(v) => setV((o) => ({ ...o, textSize: v }))} onCommit={() => commit()} />
        </>)}
        {meta && tab === "sound" && (<>
          <div className="es-row wrap"><button className={"es-chip" + (V.mute ? " on" : "")} onClick={() => set({ mute: !V.mute }, true)}>{V.mute ? "Muted" : "Mute"}</button></div>
          {!V.mute && <Slide label="Volume" value={V.volume} min={0} max={300} fmt={(v) => v + "%"} onChange={(v) => setV((o) => ({ ...o, volume: v }))} onCommit={() => commit()} zero={100} />}
        </>)}
        {meta && tab === "fades" && (<>
          <Slide label="Fade in from black" value={V.fadeIn} min={0} max={5} step={0.1} fmt={(v) => v.toFixed(1) + "s"} onChange={(v) => setV((o) => ({ ...o, fadeIn: v }))} onCommit={() => commit()} />
          <Slide label="Fade out to black" value={V.fadeOut} min={0} max={5} step={0.1} fmt={(v) => v.toFixed(1) + "s"} onChange={(v) => setV((o) => ({ ...o, fadeOut: v }))} onCommit={() => commit()} />
        </>)}
        {meta && tab === "export" && (<>
          <div className="es-row wrap">{[["mp4", "Video (MP4)"], ["gif", "GIF (no sound)"], ["audio", "Sound only (MP3)"]].map(([k, l]) => <button key={k} className={"es-chip" + (fmtOut === k ? " on" : "")} onClick={() => setFmtOut(k)}>{l}</button>)}</div>
          <button className="es-btn gold wide" disabled={!!busy} onClick={() => render(fmtOut)}>{busy ? "Working..." : "Render " + (fmtOut === "gif" ? "GIF" : fmtOut === "audio" ? "MP3" : "MP4")}</button>
          {out && (<div className="es-out">
            {out.type.startsWith("video") ? <video src={out.url} controls playsInline /> : out.type.startsWith("audio") ? <audio src={out.url} controls /> : <img src={out.url} alt="Your GIF" />}
            <div className="es-row"><button className="es-btn" onClick={() => download(out.url, out.name)}>{"⬇"} Download</button><button className="es-btn" onClick={() => shareFile(out.url, out.name, out.type)}>{"↗"} Share</button>{out.type === "video/mp4" && onSave && <button className="es-btn gold" onClick={() => onSave(out.url)}>Use it</button>}</div>
          </div>)}
          <div className="es-hint">Rendering happens on your phone. The first time, the video engine downloads once (about 30 MB).</div>
        </>)}
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  ONE BUTTON FOR EVERYTHING EDITABLE
//  <EditThis kind="image|audio|video" src=... onSaved={url=>...} loadFfmpeg=... extra={url=>...}/>
//  Shows "Edit", opens the right studio full screen, and shows the edited version underneath
//  (with download, share and whatever the caller adds) unless the caller takes it over.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export function EditThis({ kind, src, onSaved, loadFfmpeg, extra, label, keepResult }) {
  const [open, setOpen] = React.useState(false);
  const [edited, setEdited] = React.useState(null);
  if (!src) return null;
  const done = (url) => { setOpen(false); if (onSaved) onSaved(url); if (!onSaved || keepResult) setEdited(url); };
  const L = label || (kind === "image" ? "✎ Edit picture" : kind === "audio" ? "✂ Edit sound" : "🎬 Edit video");
  const nm = kind === "image" ? "spine-picture.png" : kind === "audio" ? "spine-sound.wav" : "spine-video.mp4";
  return (
    <>
      <button className="imed-editbtn es-open" onClick={() => setOpen(true)}>{L}</button>
      {open && kind === "image" && <ImageStudio src={edited || src} onClose={() => setOpen(false)} onSave={done} />}
      {open && kind === "audio" && <AudioStudio src={edited || src} onClose={() => setOpen(false)} onSave={done} />}
      {open && kind === "video" && <VideoStudio src={edited || src} loadFfmpeg={loadFfmpeg} onClose={() => setOpen(false)} onSave={done} />}
      {edited && (
        <div className="es-result">
          <div className="es-hint" style={{ fontWeight: 600 }}>Edited version</div>
          {kind === "image" ? <img src={edited} alt="Edited" /> : kind === "audio" ? <audio src={edited} controls playsInline /> : <video src={edited} controls playsInline />}
          <div className="es-row"><button className="es-chip" onClick={() => download(edited, nm)}>{"⬇"} Download</button><button className="es-chip" onClick={() => shareFile(edited, nm)}>{"↗"} Share</button><button className="es-chip" onClick={() => setEdited(null)}>Remove</button></div>
          {extra && extra(edited)}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  SLIDES - every slide editable: words, order, look, and AI rewrites per slide
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const DECK_THEMES = {
  night: { name: "Night", bg: "linear-gradient(160deg,#111826,#0B1019)", fg: "#EAF1FB", accent: "#E8C060", sub: "#A9B8CC" },
  paper: { name: "Paper", bg: "#FBF8F2", fg: "#1B1A17", accent: "#B8860B", sub: "#6B655B" },
  ocean: { name: "Ocean", bg: "linear-gradient(160deg,#0A3D52,#062B3A)", fg: "#E6F6FA", accent: "#4FD1C5", sub: "#9CC7D3" },
  forest: { name: "Forest", bg: "linear-gradient(160deg,#16351F,#0F2418)", fg: "#EAF4EC", accent: "#9AD07F", sub: "#A8C2AE" },
  sunset: { name: "Sunset", bg: "linear-gradient(135deg,#3A0F2E,#B24A2B)", fg: "#FFF3E8", accent: "#FFD08A", sub: "#F2C7B5" },
  mono: { name: "Clean", bg: "#FFFFFF", fg: "#111111", accent: "#111111", sub: "#555555" },
  bold: { name: "Bold", bg: "#1300FF", fg: "#FFFFFF", accent: "#FFE600", sub: "#D6D2FF" },
  blush: { name: "Blush", bg: "#FCE8EC", fg: "#3A1A22", accent: "#D6336C", sub: "#8A5A66" },
  slate: { name: "Slate", bg: "linear-gradient(160deg,#2B2F36,#1C1F24)", fg: "#F1F3F5", accent: "#7CC4FF", sub: "#AEB6C0" },
};
export const DECK_FONTS = { serif: "'Instrument Serif',Georgia,serif", sans: "-apple-system,'Helvetica Neue',Arial,sans-serif", rounded: "ui-rounded,'Arial Rounded MT Bold',system-ui,sans-serif", mono: "'SF Mono',Menlo,monospace" };
export function deckStyle(deck) {
  const th = DECK_THEMES[(deck && deck.theme) || "night"] || DECK_THEMES.night, ac = (deck && deck.accent) || th.accent;
  const f = DECK_FONTS[(deck && deck.font) || "serif"] || DECK_FONTS.serif, sz = { s: 0.85, m: 1, l: 1.2 }[(deck && deck.size) || "m"] || 1;
  return { th, ac, f, sz, align: (deck && deck.align) || "left" };
}
const SLIDE_AI = [
  ["Shorter", "Make this slide shorter and tighter - fewer, shorter bullets."],
  ["Punchier", "Make this slide punchier and more memorable."],
  ["Simpler words", "Rewrite this slide in simple, everyday words."],
  ["Add an example", "Add one concrete, real example to this slide."],
  ["Add a big number", "Add a striking, accurate number or short quote as the 'big' line."],
  ["Speaker notes", "Write helpful 2-3 sentence speaker notes for this slide."],
  ["More detail", "Add more substance - up to 5 bullets, each specific."],
  ["Fix grammar", "Fix spelling and grammar only. Keep the meaning."],
];
function parseJsonObj(t) { try { const s = String(t || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}"); return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; } }
export function DeckEditor({ deck, onSave, onClose, ask }) {
  const hist = useHistory(deck);
  const [d, setD] = React.useState(deck);
  const [i, setI] = React.useState(0);
  const [tab, setTab] = React.useState("words");
  const [busy, setBusy] = React.useState("");
  const [newTopic, setNewTopic] = React.useState("");
  React.useEffect(() => { if (hist.cur) setD(hist.cur); }, [hist.cur]);
  const commit = (n) => hist.push(n || d);
  const setNow = (n) => { setD(n); hist.push(n); };
  const slides = d.slides || [];
  const cur = i === 0 ? null : slides[i - 1];
  const upd = (patch, now) => { const s2 = slides.map((s, k) => (k === i - 1 ? { ...s, ...patch } : s)); const n = { ...d, slides: s2 }; if (now) setNow(n); else setD(n); };
  const move = (dir) => { if (i === 0) return; const a = [...slides], j = clamp(i - 1 + dir, 0, a.length - 1); a.splice(j, 0, a.splice(i - 1, 1)[0]); setNow({ ...d, slides: a }); setI(j + 1); };
  const add = (after) => { const a = [...slides]; const at = Math.max(0, i); a.splice(at, 0, after || { title: "New slide", bullets: ["A point"], note: "", big: "" }); setNow({ ...d, slides: a.slice(0, 30) }); setI(at + 1); };
  const del = () => { if (i === 0 || slides.length <= 1) return; const a = slides.filter((_, k) => k !== i - 1); setNow({ ...d, slides: a }); setI(Math.min(i, a.length)); };
  async function aiSlide(instr) {
    if (!ask || !cur) return; setBusy(instr.split(" ")[0]);
    try {
      const r = await ask("You edit one presentation slide. Return ONLY JSON {\"title\":string,\"bullets\":[string],\"note\":string,\"big\":string}. At most 5 bullets of at most 14 words. Accurate facts only.", "Deck: " + d.title + "\nSlide now: " + JSON.stringify(cur) + "\n\nChange: " + instr);
      const j = parseJsonObj(r && r.text);
      if (j && j.title) upd({ title: String(j.title), bullets: (j.bullets || []).slice(0, 6).map(String), note: String(j.note || cur.note || ""), big: String(j.big || "") }, true);
    } catch (e) {}
    setBusy("");
  }
  async function aiNew() {
    if (!ask || !newTopic.trim()) return; setBusy("Adding");
    try {
      const r = await ask("You write one presentation slide. Return ONLY JSON {\"title\":string,\"bullets\":[string],\"note\":string,\"big\":string}. At most 5 bullets of at most 12 words. Accurate facts only.", "Deck: " + d.title + "\nNew slide about: " + newTopic.trim());
      const j = parseJsonObj(r && r.text);
      if (j && j.title) { add({ title: String(j.title), bullets: (j.bullets || []).slice(0, 6).map(String), note: String(j.note || ""), big: String(j.big || "") }); setNewTopic(""); }
    } catch (e) {}
    setBusy("");
  }
  const S = deckStyle(d);
  return (
    <Sheet title="Edit slides" onClose={onClose} actions={<>
      <button className="es-ic" onClick={hist.undo} disabled={!hist.canUndo} aria-label="Undo">{"↶"}</button>
      <button className="es-ic" onClick={hist.redo} disabled={!hist.canRedo} aria-label="Redo">{"↷"}</button>
      <button className="es-save" onClick={() => onSave && onSave(d)}>Save</button>
    </>}>
      <div className="es-strip">
        {[{ cover: true, title: d.title }, ...slides].map((s, k) => (
          <button key={k} className={"es-mini" + (k === i ? " on" : "")} onClick={() => setI(k)} style={{ background: S.th.bg, color: S.th.fg, fontFamily: S.f }}>
            <b style={{ color: S.ac }}>{k === 0 ? "Cover" : k}</b><span>{String(s.title || "").slice(0, 40)}</span>
          </button>
        ))}
        <button className="es-mini add" onClick={() => add()}>+ Slide</button>
      </div>
      <div className="es-preview-slide" style={{ background: S.th.bg, color: S.th.fg, fontFamily: S.f, textAlign: S.align }}>
        <h3 style={{ color: S.ac, fontSize: 20 * S.sz }}>{i === 0 ? d.title : cur && cur.title}</h3>
        {i === 0 ? <p style={{ color: S.th.sub }}>{d.subtitle}</p> : cur && <>{cur.big && <div style={{ color: S.ac, fontWeight: 700, fontSize: 22 * S.sz }}>{cur.big}</div>}<ul style={{ textAlign: "left" }}>{(cur.bullets || []).map((b, k) => <li key={k} style={{ fontSize: 13 * S.sz }}>{b}</li>)}</ul></>}
      </div>
      <Tabs tabs={[["words", "Words"], ["look", "Look"], ["ai", "AI help"], ["order", "Slides"]]} value={tab} onChange={setTab} />
      <div className="es-panel">
        {tab === "words" && (i === 0 ? (<>
          <label className="es-lbl">Title</label><input className="es-in" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} onBlur={() => commit()} />
          <label className="es-lbl">Subtitle</label><input className="es-in" value={d.subtitle || ""} onChange={(e) => setD({ ...d, subtitle: e.target.value })} onBlur={() => commit()} />
        </>) : cur && (<>
          <label className="es-lbl">Slide title</label><input className="es-in" value={cur.title} onChange={(e) => upd({ title: e.target.value })} onBlur={() => commit()} />
          <label className="es-lbl">Big line (a number or quote - optional)</label><input className="es-in" value={cur.big || ""} onChange={(e) => upd({ big: e.target.value })} onBlur={() => commit()} />
          <label className="es-lbl">Points - one per line</label><textarea className="es-in" rows={5} value={(cur.bullets || []).join("\n")} onChange={(e) => upd({ bullets: e.target.value.split("\n").slice(0, 8) })} onBlur={() => upd({ bullets: (cur.bullets || []).filter((b) => b.trim()) }, true)} />
          <label className="es-lbl">Speaker notes</label><textarea className="es-in" rows={3} value={cur.note || ""} onChange={(e) => upd({ note: e.target.value })} onBlur={() => commit()} />
        </>))}
        {tab === "look" && (<>
          <div className="es-themes">{Object.entries(DECK_THEMES).map(([k, t]) => <button key={k} className={"es-theme" + ((d.theme || "night") === k ? " on" : "")} style={{ background: t.bg, color: t.fg }} onClick={() => setNow({ ...d, theme: k, accent: null })}><b style={{ color: t.accent }}>Aa</b>{t.name}</button>)}</div>
          <Colors label="Highlight colour" value={S.ac} onPick={(c) => setNow({ ...d, accent: c })} />
          <div className="es-row wrap">{[["serif", "Serif"], ["sans", "Sans"], ["rounded", "Rounded"], ["mono", "Mono"]].map(([k, l]) => <button key={k} className={"es-chip" + ((d.font || "serif") === k ? " on" : "")} onClick={() => setNow({ ...d, font: k })}>{l}</button>)}</div>
          <div className="es-row wrap">{[["s", "Small text"], ["m", "Medium"], ["l", "Large text"]].map(([k, l]) => <button key={k} className={"es-chip" + ((d.size || "m") === k ? " on" : "")} onClick={() => setNow({ ...d, size: k })}>{l}</button>)}{[["left", "Left"], ["center", "Centred"]].map(([k, l]) => <button key={k} className={"es-chip" + ((d.align || "left") === k ? " on" : "")} onClick={() => setNow({ ...d, align: k })}>{l}</button>)}</div>
        </>)}
        {tab === "ai" && (<>
          {i === 0 ? <div className="es-hint">Pick a slide (not the cover) to rewrite it.</div> : <div className="es-row wrap">{SLIDE_AI.map(([l, p]) => <button key={l} className="es-chip" disabled={!!busy || !ask} onClick={() => aiSlide(p)}>{busy && p.startsWith(busy) ? "Working..." : l}</button>)}</div>}
          <label className="es-lbl">Add a new slide about...</label>
          <div className="es-row"><input className="es-in" value={newTopic} placeholder="e.g. the costs, the timeline, a case study" onChange={(e) => setNewTopic(e.target.value)} /><button className="es-btn gold" style={{ flex: "0 0 auto" }} disabled={!!busy || !newTopic.trim() || !ask} onClick={aiNew}>{busy === "Adding" ? "..." : "Add"}</button></div>
        </>)}
        {tab === "order" && (<>
          <div className="es-row wrap">
            <button className="es-chip" disabled={i <= 1} onClick={() => move(-1)}>{"←"} Move earlier</button>
            <button className="es-chip" disabled={i === 0 || i >= slides.length} onClick={() => move(1)}>Move later {"→"}</button>
            <button className="es-chip" disabled={i === 0} onClick={() => add({ ...cur })}>Duplicate</button>
            <button className="es-chip" onClick={() => add()}>Add blank slide</button>
            <button className="es-chip danger" disabled={i === 0 || slides.length <= 1} onClick={del}>Delete slide</button>
          </div>
          <div className="es-hint">{slides.length} slides plus the cover. Tap a slide above to pick it.</div>
        </>)}
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  DOCUMENTS AND PAGES - a real word processor on the phone
// ─────────────────────────────────────────────────────────────────────────────────────────────
export function cleanHtml(html) {
  try {
    const doc = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html");
    doc.querySelectorAll("script,style,iframe,object,embed,link,meta,form,input,button,textarea,select").forEach((n) => n.remove());
    doc.querySelectorAll("*").forEach((n) => { [...n.attributes].forEach((a) => { const nm = a.name.toLowerCase(); if (nm.startsWith("on") || ((nm === "href" || nm === "src") && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
    return doc.body.firstChild.innerHTML;
  } catch (e) { return ""; }
}
export function htmlToText(html) { try { const d = new DOMParser().parseFromString(html, "text/html"); d.querySelectorAll("li").forEach((li) => li.prepend("- ")); d.querySelectorAll("h1,h2,h3,h4,p,li,tr,div,br").forEach((n) => n.append("\n")); return (d.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim(); } catch (e) { return ""; } }
const DOC_AI = [
  ["Fix spelling & grammar", "Fix spelling, grammar and punctuation only. Keep the meaning, tone and formatting."],
  ["Shorter", "Make it shorter and tighter without losing anything important."],
  ["Longer", "Expand it with more useful detail and examples."],
  ["Simpler", "Rewrite in simple, clear, everyday language."],
  ["More formal", "Rewrite in a professional, formal tone."],
  ["Friendlier", "Rewrite in a warm, friendly tone."],
  ["More persuasive", "Rewrite to be more persuasive and confident."],
  ["Bullet points", "Turn it into clear bullet points."],
  ["Add a summary", "Add a short summary at the top."],
  ["Continue writing", "Continue writing naturally from where it ends, in the same style."],
];
const LANGS = ["Spanish", "French", "German", "Portuguese", "Italian", "Chinese", "Japanese", "Korean", "Arabic", "Hindi", "Russian", "Dutch", "Polish", "Turkish", "Vietnamese", "Indonesian", "Swahili", "Tagalog", "Yoruba", "English"];
export function PageEditor({ title, html, onSave, onClose, ask }) {
  const ref = React.useRef(null);
  const [t, setT] = React.useState(title || "");
  const [count, setCount] = React.useState({ w: 0, c: 0 });
  const [panel, setPanel] = React.useState("");
  const [find, setFind] = React.useState(""); const [repl, setRepl] = React.useState("");
  const [link, setLink] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [lang, setLang] = React.useState("Spanish");
  const savedSel = React.useRef(null);
  React.useEffect(() => { if (ref.current) { ref.current.innerHTML = cleanHtml(html); recount(); } }, []);
  function recount() { const tx = (ref.current && ref.current.innerText) || ""; setCount({ w: (tx.match(/\S+/g) || []).length, c: tx.length }); }
  const keepSel = () => { const s = window.getSelection(); if (s && s.rangeCount && ref.current && ref.current.contains(s.anchorNode)) savedSel.current = s.getRangeAt(0).cloneRange(); };
  const restoreSel = () => { const s = window.getSelection(); if (s && s.rangeCount && ref.current && ref.current.contains(s.anchorNode)) return; const r = savedSel.current; if (!r) return; s.removeAllRanges(); s.addRange(r); };
  React.useEffect(() => { const f = () => keepSel(); document.addEventListener("selectionchange", f); return () => document.removeEventListener("selectionchange", f); }, []);
  const cmd = (c, v) => { ref.current && ref.current.focus(); restoreSel(); try { document.execCommand("styleWithCSS", false, c === "hiliteColor" || c === "foreColor"); document.execCommand(c, false, v); } catch (e) {} keepSel(); recount(); };
  const block = (tag) => cmd("formatBlock", tag);
  function doReplace(all) {
    if (!find) return; const root = ref.current; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, hits = 0;
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    while ((n = walker.nextNode())) { if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = n.nodeValue.replace(all ? re : new RegExp(re.source, "i"), () => { hits++; return repl; }); if (!all && hits) break; } }
    setMsg(hits ? "Replaced " + hits + "." : "Not found."); recount();
  }
  async function ai(instr) {
    if (!ask) return; const s = window.getSelection(); restoreSel();
    const sel = s && s.rangeCount && ref.current.contains(s.anchorNode) && String(s).trim() ? s.getRangeAt(0) : null;
    const src = sel ? sel.cloneContents() : null; const box = document.createElement("div"); if (src) box.appendChild(src);
    const inHtml = sel ? box.innerHTML : ref.current.innerHTML;
    setBusy(instr.slice(0, 18)); setMsg(sel ? "Working on the part you selected..." : "Working on the whole document...");
    try {
      const r = await ask("You edit documents. Return ONLY clean HTML using p, h2, h3, ul, ol, li, b, i, u, blockquote, table, tr, th, td, a. No markdown, no code fences, no preamble.", "Instruction: " + instr + "\n\nHTML:\n" + inHtml.slice(0, 24000));
      let out = String((r && r.text) || "").replace(/^```(?:html)?\s*|\s*```$/g, "").trim();
      if (out) {
        out = cleanHtml(out); ref.current.focus();
        // through the editor's own history, so Undo really does bring the old words back
        if (sel) { const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(sel); } else document.execCommand("selectAll", false, null);
        if (!document.execCommand("insertHTML", false, out)) { if (sel) { sel.deleteContents(); sel.insertNode(document.createRange().createContextualFragment(out)); } else ref.current.innerHTML = out; }
        setMsg("Done. Use Undo (\u21B6) to go back."); recount();
      }
      else setMsg("No change came back - try again.");
    } catch (e) { setMsg("Couldn't reach the writer just now."); }
    setBusy("");
  }
  const result = () => { const h = cleanHtml(ref.current.innerHTML); return { title: t, html: h, text: htmlToText(h) }; };
  function exportWord() { const r = result(); const doc = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>" + r.title + "</title></head><body><h1>" + r.title + "</h1>" + r.html + "</body></html>"; download(URL.createObjectURL(new Blob(["﻿" + doc], { type: "application/msword" })), (r.title || "document").replace(/[^\w -]/g, "").slice(0, 50) + ".doc"); }
  function exportTxt() { const r = result(); download(URL.createObjectURL(new Blob([r.title + "\n\n" + r.text], { type: "text/plain" })), (r.title || "document").replace(/[^\w -]/g, "").slice(0, 50) + ".txt"); }
  const B = (lbl, on, aria) => <button className="es-tb" onMouseDown={(e) => e.preventDefault()} onClick={on} aria-label={aria || lbl}>{lbl}</button>;
  return (
    <Sheet title="Edit document" onClose={onClose} actions={<>
      <button className="es-ic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("undo")} aria-label="Undo">{"↶"}</button>
      <button className="es-ic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("redo")} aria-label="Redo">{"↷"}</button>
      <button className="es-save" onClick={() => onSave && onSave(result())}>Save</button>
    </>}>
      <div className="es-toolbar">
        {B("B", () => cmd("bold"), "Bold")}{B("I", () => cmd("italic"), "Italic")}{B("U", () => cmd("underline"), "Underline")}{B("S̶", () => cmd("strikeThrough"), "Strikethrough")}
        {B("H1", () => block("H2"), "Big heading")}{B("H2", () => block("H3"), "Small heading")}{B("¶", () => block("P"), "Normal text")}{B("❝", () => block("BLOCKQUOTE"), "Quote")}
        {B("•", () => cmd("insertUnorderedList"), "Bullet list")}{B("1.", () => cmd("insertOrderedList"), "Numbered list")}
        {B("⇤", () => cmd("justifyLeft"), "Align left")}{B("↔", () => cmd("justifyCenter"), "Centre")}{B("⇥", () => cmd("justifyRight"), "Align right")}
        {B("A↓", () => cmd("fontSize", 2), "Smaller text")}{B("A↑", () => cmd("fontSize", 5), "Bigger text")}
        {B("🎨", () => { keepSel(); setPanel(panel === "color" ? "" : "color"); }, "Text colour")}{B("🖍", () => { keepSel(); setPanel(panel === "hi" ? "" : "hi"); }, "Highlight")}
        {B("🔗", () => { keepSel(); setPanel(panel === "link" ? "" : "link"); }, "Link")}{B("―", () => cmd("insertHorizontalRule"), "Divider")}
        {B("▦", () => cmd("insertHTML", "<table><tr><th>Heading</th><th>Heading</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>"), "Table")}
        {B("☑", () => cmd("insertHTML", "<ul><li>☐ To do</li></ul>"), "Checklist")}
        {B("⌫", () => cmd("removeFormat"), "Clear formatting")}{B("🔍", () => setPanel(panel === "find" ? "" : "find"), "Find and replace")}
        {B("✨ AI", () => { keepSel(); setPanel(panel === "ai" ? "" : "ai"); }, "AI help")}{B("⬇", () => setPanel(panel === "export" ? "" : "export"), "Export")}
      </div>
      {panel && (
        <div className="es-subpanel">
          {panel === "color" && <Colors value="" onPick={(c) => { cmd("foreColor", c); }} />}
          {panel === "hi" && <Colors value="" onPick={(c) => { cmd("hiliteColor", c); }} />}
          {panel === "link" && <div className="es-row"><input className="es-in" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} /><button className="es-btn gold" style={{ flex: "0 0 auto" }} onClick={() => { if (/^https?:\/\//i.test(link)) { cmd("createLink", link); setLink(""); setPanel(""); } }}>Link</button><button className="es-btn" style={{ flex: "0 0 auto" }} onClick={() => cmd("unlink")}>Unlink</button></div>}
          {panel === "find" && (<><div className="es-row"><input className="es-in" placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} /><input className="es-in" placeholder="Replace with" value={repl} onChange={(e) => setRepl(e.target.value)} /></div><div className="es-row"><button className="es-btn" onClick={() => doReplace(false)}>Replace one</button><button className="es-btn gold" onClick={() => doReplace(true)}>Replace all</button></div></>)}
          {panel === "ai" && (<>
            <div className="es-hint">Select some words first to change just that part - or leave nothing selected to change the whole document.</div>
            <div className="es-row wrap">{DOC_AI.map(([l, p]) => <button key={l} className="es-chip" disabled={!!busy || !ask} onClick={() => ai(p)}>{l}</button>)}</div>
            <div className="es-row"><select className="es-in" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select><button className="es-btn gold" style={{ flex: "0 0 auto" }} disabled={!!busy || !ask} onClick={() => ai("Translate it into " + lang + ". Keep the formatting.")}>Translate</button></div>
          </>)}
          {panel === "export" && <div className="es-row wrap"><button className="es-chip" onClick={exportWord}>Word (.doc)</button><button className="es-chip" onClick={exportTxt}>Plain text</button><button className="es-chip" onClick={() => { try { navigator.clipboard.writeText(result().text); setMsg("Copied."); } catch (e) {} }}>Copy all text</button></div>}
        </div>
      )}
      {(busy || msg) && <div className="es-busy">{busy && <span className="es-spin" />}{msg}</div>}
      <div className="es-docwrap">
        <input className="es-doctitle" value={t} onChange={(e) => setT(e.target.value)} placeholder="Title" />
        <div ref={ref} className="es-doc" contentEditable suppressContentEditableWarning onInput={recount} onKeyUp={keepSel} onMouseUp={keepSel} onTouchEnd={keepSel} onBlur={keepSel} />
      </div>
      <div className="es-count">{count.w.toLocaleString()} words {"·"} {count.c.toLocaleString()} characters {"·"} {Math.max(1, Math.round(count.w / 230))} min read</div>
    </Sheet>
  );
}

export const EDIT_CSS = `
.es-sheet{position:fixed;inset:0;z-index:2147483000;background:#0c0d10;color:#eef0f4;display:flex;flex-direction:column;font-family:Manrope,system-ui,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);overflow:hidden;}
.es-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #22252c;flex:0 0 auto;}
.es-title{flex:1;font:600 15px/1.2 Manrope,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.es-acts{display:flex;gap:6px;align-items:center;}
.es-x,.es-ic{background:#1b1e24;border:1px solid #2b2f37;color:#eef0f4;border-radius:10px;min-width:38px;height:38px;font-size:17px;cursor:pointer;}
.es-ic:disabled{opacity:.35}
.es-save{background:#c9a227;color:#15120a;border:none;border-radius:10px;height:38px;padding:0 16px;font:700 14px Manrope,system-ui,sans-serif;cursor:pointer;}
.es-save:disabled{opacity:.5}
.es-stage{flex:1 1 auto;min-height:150px;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden;background:repeating-conic-gradient(#15171b 0 25%,#1a1c21 0 50%) 0 0/22px 22px;}
.es-stage.video{background:#000;}
.es-canwrap{position:relative;display:inline-block;max-width:100%;max-height:100%;line-height:0;}
.es-canvas{max-width:100%;max-height:calc(100dvh - 360px);min-height:60px;display:block;border-radius:4px;box-shadow:0 6px 30px rgba(0,0,0,.5);}
.es-canvas.drawing{cursor:crosshair}
.es-crop{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none;}
.es-crop i{position:absolute;background:rgba(255,255,255,.35);}
.es-crop .g1{left:33.33%;top:0;bottom:0;width:1px}.es-crop .g2{left:66.66%;top:0;bottom:0;width:1px}.es-crop .g3{top:33.33%;left:0;right:0;height:1px}.es-crop .g4{top:66.66%;left:0;right:0;height:1px}
.es-h{position:absolute;width:26px;height:26px;background:transparent;touch-action:none;}
.es-h.tl{left:-13px;top:-13px;border-left:4px solid #fff;border-top:4px solid #fff;cursor:nwse-resize}.es-h.tr{right:-13px;top:-13px;border-right:4px solid #fff;border-top:4px solid #fff;cursor:nesw-resize}
.es-h.bl{left:-13px;bottom:-13px;border-left:4px solid #fff;border-bottom:4px solid #fff;cursor:nesw-resize}.es-h.br{right:-13px;bottom:-13px;border-right:4px solid #fff;border-bottom:4px solid #fff;cursor:nwse-resize}
.es-h.t{left:50%;top:-13px;margin-left:-13px;border-top:4px solid #fff}.es-h.b{left:50%;bottom:-13px;margin-left:-13px;border-bottom:4px solid #fff}.es-h.l{top:50%;left:-13px;margin-top:-13px;border-left:4px solid #fff}.es-h.r{top:50%;right:-13px;margin-top:-13px;border-right:4px solid #fff}
.es-compare{display:flex;gap:8px;justify-content:center;padding:6px 10px 0;flex:0 0 auto;}
.es-tabs{display:flex;gap:4px;overflow-x:auto;padding:8px 10px;flex:0 0 auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.es-tabs::-webkit-scrollbar{display:none}
.es-tab{flex:0 0 auto;background:none;border:1px solid transparent;color:#a9afba;border-radius:999px;padding:8px 13px;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;}
.es-tab.on{background:#eef0f4;color:#111}
.es-panel{flex:0 0 auto;max-height:38dvh;overflow-y:auto;padding:4px 14px 18px;-webkit-overflow-scrolling:touch;}
.es-sl{display:block;margin:8px 0 10px;}
.es-sl-top{display:flex;justify-content:space-between;font:500 12.5px Manrope,system-ui,sans-serif;color:#c3c8d1;margin-bottom:4px;}
.es-sl-top b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer}
.es-sl input[type=range]{width:100%;accent-color:#c9a227;height:28px;}
.es-row{display:flex;gap:8px;align-items:center;margin:8px 0;}
.es-row.wrap{flex-wrap:wrap}.es-row.center{justify-content:center;flex-wrap:wrap}
.es-btn{background:#1b1e24;border:1px solid #2b2f37;color:#eef0f4;border-radius:10px;padding:10px 12px;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;flex:1 1 auto;}
.es-btn.on,.es-chip.on{background:#eef0f4;color:#111;border-color:#eef0f4}
.es-btn.gold{background:#c9a227;color:#15120a;border-color:#c9a227}
.es-btn.wide{width:100%;margin-top:6px}
.es-btn:disabled,.es-chip:disabled{opacity:.45}
.es-chip{background:#1b1e24;border:1px solid #2b2f37;color:#e3e6ec;border-radius:999px;padding:8px 12px;font:600 12.5px Manrope,system-ui,sans-serif;cursor:pointer;}
.es-chip.danger{color:#ff8a80;border-color:#5a2a2a}
.es-hint{font:400 12px/1.45 Manrope,system-ui,sans-serif;color:#9aa1ad;margin:6px 0;}
.es-in{width:100%;box-sizing:border-box;background:#15171c;border:1px solid #2b2f37;color:#fff;border-radius:10px;padding:10px 12px;font:500 15px Manrope,system-ui,sans-serif;margin:6px 0;resize:vertical;}
.es-colors{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin:8px 0;}
.es-sw{width:28px;height:28px;border-radius:50%;border:2px solid #2b2f37;cursor:pointer;padding:0;}
.es-sw.on{border-color:#fff;box-shadow:0 0 0 2px #c9a227}
.es-colors input[type=color]{width:32px;height:30px;border:none;background:none;padding:0;}
.es-looks{display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px;-webkit-overflow-scrolling:touch;}
.es-look{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:2px solid transparent;border-radius:10px;color:#c3c8d1;font:600 11px Manrope,system-ui,sans-serif;padding:3px;cursor:pointer;}
.es-look.on{border-color:#c9a227;color:#fff}
.es-thumb{width:64px;height:64px;object-fit:cover;border-radius:7px;display:block;}
.es-stickers{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:4px;}
.es-stk{font-size:27px;background:#15171c;border:1px solid #23262d;border-radius:10px;height:46px;cursor:pointer;}
.es-load,.es-err{padding:18px;text-align:center;font:500 14px/1.5 Manrope,system-ui,sans-serif;color:#c3c8d1;}
.es-err{color:#ffb4a8}
.es-wave{padding:12px 14px 0;}
.es-wave canvas{width:100%;height:120px;display:block;background:#15171c;border-radius:10px;cursor:ew-resize;}
.es-time{font:600 13px 'SF Mono',Menlo,monospace;color:#fff;}
.es-vwrap{position:relative;max-width:100%;max-height:calc(100dvh - 380px);overflow:hidden;container-type:size;display:flex;align-items:center;justify-content:center;width:100%;height:100%;}
.es-vwrap video{width:100%;height:100%;display:block;}
.es-vtext{position:absolute;left:50%;transform:translateX(-50%);padding:.25em .5em;font-weight:800;text-align:center;white-space:pre-wrap;max-width:92%;pointer-events:none;border-radius:4px;line-height:1.2;}
.es-vtext.top{top:6%}.es-vtext.middle{top:50%;transform:translate(-50%,-50%)}.es-vtext.bottom{bottom:8%}
.es-busy{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px;font:500 13px Manrope,system-ui,sans-serif;color:#e3c766;}
.es-spin{width:14px;height:14px;border:2px solid #e3c766;border-right-color:transparent;border-radius:50%;animation:esspin .8s linear infinite;display:inline-block;}
@keyframes esspin{to{transform:rotate(360deg)}}
.es-out{margin-top:10px;}
.es-out video,.es-out img,.es-out audio{width:100%;border-radius:10px;display:block;}
.es-strip{display:flex;gap:8px;overflow-x:auto;padding:10px 12px;flex:0 0 auto;-webkit-overflow-scrolling:touch;}
.es-mini{flex:0 0 auto;width:108px;height:64px;border-radius:9px;border:2px solid transparent;padding:6px 8px;text-align:left;display:flex;flex-direction:column;gap:3px;cursor:pointer;overflow:hidden;font-size:10.5px;line-height:1.25;}
.es-mini.on{border-color:#c9a227}.es-mini b{font-size:10px}.es-mini.add{background:#1b1e24;color:#e3e6ec;align-items:center;justify-content:center;font:700 13px Manrope,system-ui,sans-serif;}
.es-preview-slide{flex:1 1 auto;margin:4px 14px;border-radius:14px;padding:18px 18px;overflow:auto;min-height:120px;}
.es-preview-slide h3{margin:0 0 8px;font-weight:600;line-height:1.2}.es-preview-slide ul{margin:6px 0 0;padding-left:18px}.es-preview-slide li{margin:4px 0;line-height:1.4}
.es-lbl{display:block;font:600 11.5px Manrope,system-ui,sans-serif;color:#9aa1ad;margin:10px 0 0;text-transform:uppercase;letter-spacing:.06em;}
.es-themes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0;}
.es-theme{height:58px;border-radius:10px;border:2px solid transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 11px Manrope,system-ui,sans-serif;}
.es-theme b{font:700 18px Georgia,serif}.es-theme.on{border-color:#c9a227}
.es-toolbar{display:flex;gap:4px;overflow-x:auto;padding:8px 10px;border-bottom:1px solid #22252c;flex:0 0 auto;-webkit-overflow-scrolling:touch;}
.es-tb{flex:0 0 auto;min-width:38px;height:36px;background:#1b1e24;border:1px solid #2b2f37;color:#eef0f4;border-radius:8px;font:700 14px Manrope,system-ui,sans-serif;cursor:pointer;padding:0 8px;}
.es-subpanel{padding:4px 12px;border-bottom:1px solid #22252c;flex:0 0 auto;max-height:34dvh;overflow:auto;}
.es-docwrap{flex:1 1 auto;overflow:auto;background:#fbfaf7;-webkit-overflow-scrolling:touch;}
.es-doctitle{display:block;width:100%;box-sizing:border-box;border:none;background:none;font:400 30px/1.2 'Instrument Serif',Georgia,serif;color:#111;padding:20px 20px 4px;outline:none;}
.es-doc{min-height:60vh;padding:6px 20px 40px;color:#1b1a17;font:16px/1.6 Georgia,serif;outline:none;max-width:760px;margin:0 auto;}
.es-doc h2{font-size:22px;margin:22px 0 8px}.es-doc h3{font-size:18px;margin:18px 0 6px}.es-doc blockquote{border-left:3px solid #c9a227;margin:12px 0;padding:4px 14px;color:#555}
.es-doc table{border-collapse:collapse;width:100%;margin:12px 0}.es-doc td,.es-doc th{border:1px solid #ccc;padding:6px 8px;text-align:left;min-width:40px}
.es-doc a{color:#0a66c2}.es-doc hr{border:none;border-top:1px solid #ccc;margin:18px 0}
.es-count{flex:0 0 auto;padding:8px 14px;font:500 12px Manrope,system-ui,sans-serif;color:#9aa1ad;border-top:1px solid #22252c;}
.es-result{margin-top:12px;}
.es-result img,.es-result video,.es-result audio{width:100%;border-radius:10px;display:block;margin:6px 0;}
.es-result .es-chip{background:var(--panel,#fff);color:var(--ink,#111);border-color:var(--stone,#ddd);}
.es-result .es-hint{color:var(--ink3,#666);}
@media (min-width:900px){.es-panel{max-height:34vh}.es-canvas{max-height:calc(100vh - 340px)}}
`;
