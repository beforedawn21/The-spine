// ============================================================================
//  COLORING PAGES (batch 16) - made from the pictures The Spine already paints.
//   - Free coloring: clean black outlines on white, color it however you like.
//   - Color by number: outlined shapes with a number in each, and a color key
//     (1 = red, 2 = blue...) so it comes out the way it was meant to.
//   - Mystery grid: a grid of numbered squares - color each number by the key
//     and a hidden picture appears.
//  Every page prints (any printer the phone can reach - AirPrint on iPhone),
//  saves as a picture, or goes in a whole coloring book. The numbered ones come
//  with an answer key page.
// ============================================================================
import { useState } from "react";

const NAMED = [["Red", [220, 40, 40]], ["Dark red", [140, 20, 30]], ["Orange", [245, 140, 30]], ["Peach", [250, 200, 160]], ["Yellow", [250, 220, 50]], ["Light green", [150, 210, 90]], ["Green", [40, 150, 60]], ["Dark green", [20, 80, 40]], ["Teal", [30, 150, 150]], ["Sky blue", [120, 190, 240]], ["Blue", [40, 90, 210]], ["Navy", [25, 35, 90]], ["Purple", [130, 60, 170]], ["Lavender", [190, 160, 230]], ["Pink", [245, 140, 180]], ["Brown", [120, 75, 40]], ["Tan", [210, 180, 140]], ["Gray", [140, 140, 140]], ["Light gray", [205, 205, 205]], ["Black", [25, 25, 25]], ["White", [250, 250, 250]]];
export function colorName(c) { let best = NAMED[0], d = 1e9; for (const n of NAMED) { const e = (n[1][0] - c[0]) ** 2 * 0.3 + (n[1][1] - c[1]) ** 2 * 0.59 + (n[1][2] - c[2]) ** 2 * 0.11; if (e < d) { d = e; best = n; } } return best[0]; }

export const KINDS = [
  { key: "free", name: "Free coloring", d: "Clean outlines - color it any way you like" },
  { key: "number", name: "Color by number", d: "Numbered shapes and a color key" },
  { key: "grid", name: "Mystery grid", d: "Color the numbered squares - a hidden picture appears" },
];
export const LEVELS = { easy: { k: 6, grid: [16, 20], min: 0.004, label: "Easy" }, medium: { k: 9, grid: [24, 30], min: 0.0018, label: "Medium" }, hard: { k: 12, grid: [32, 40], min: 0.0009, label: "Hard" } };

export function promptFor(kind, subject, age) {
  const who = age === "adult" ? "detailed, for adults" : age === "toddler" ? "very simple big shapes, for a toddler" : "for children";
  if (kind === "free") return "Coloring book page of " + subject + ", black and white line art, thick clean even outlines, no shading, no gray, no fill, pure white background, " + who + ", centred, whole subject in frame";
  return "Flat vector illustration of " + subject + ", bold simple shapes, a few flat solid colors, no gradients, no texture, no outlines, plain white background, " + who + ", centred, whole subject in frame";
}

export function load(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
export function pixels(im, w) { const h = Math.round(w * im.naturalHeight / im.naturalWidth); const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); return { w, h, d: x.getImageData(0, 0, w, h).data }; }

// k-means colours (k-means++ start), on a sample
export function kmeans(data, n, k, seed) {
  let s = seed || 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pts = []; const step = Math.max(1, Math.floor(n / 6000)); for (let i = 0; i < n; i += step) pts.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  const cs = [pts[Math.floor(rnd() * pts.length)]];
  while (cs.length < k) { const ds = pts.map((p) => Math.min(...cs.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2))); const tot = ds.reduce((a, b) => a + b, 0) || 1; let r = rnd() * tot, i = 0; while (i < ds.length - 1 && (r -= ds[i]) > 0) i++; cs.push(pts[i].slice()); }
  for (let it = 0; it < 10; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let b = 0, bd = 1e12; for (let j = 0; j < cs.length; j++) { const c = cs[j]; const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; b = j; } } const t = sum[b]; t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; t[3]++; }
    sum.forEach((t, j) => { if (t[3]) cs[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  return cs.map((c) => c.map(Math.round));
}
export const nearest = (cs, r, g, b) => { let best = 0, bd = 1e12; for (let j = 0; j < cs.length; j++) { const c = cs[j]; const dd = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } } return best; };

// label map -> tidy regions (speckles merged into their neighbours)
export function regions(lab, w, h, minArea) {
  // two passes of a 3x3 majority filter
  for (let pass = 0; pass < 2; pass++) { const out = lab.slice(); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const cnt = {}; let best = lab[y * w + x], bc = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = lab[(y + dy) * w + x + dx]; const c = (cnt[v] = (cnt[v] || 0) + 1); if (c > bc) { bc = c; best = v; } } out[y * w + x] = best; } lab.set(out); }
  const comp = new Int32Array(w * h).fill(-1); const comps = []; const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (comp[i] >= 0) continue; const id = comps.length, col = lab[i]; let area = 0; comp[i] = id; stack.push(i); const pix = [];
    while (stack.length) { const p = stack.pop(); area++; pix.push(p); const x = p % w, y = (p / w) | 0; const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]; for (const q of nb) if (q >= 0 && comp[q] < 0 && lab[q] === col) { comp[q] = id; stack.push(q); } }
    comps.push({ col, area, pix });
  }
  // merge small regions into the neighbour they touch most
  for (const c of comps) {
    if (c.area >= minArea) continue; const touch = {};
    for (const p of c.pix) { const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && lab[q] !== c.col) touch[lab[q]] = (touch[lab[q]] || 0) + 1; }
    const k = Object.keys(touch).sort((a, b) => touch[b] - touch[a])[0]; if (k != null) for (const p of c.pix) lab[p] = Number(k);
  }
  return lab;
}

// distance to the nearest edge (for placing each number where it fits best)
function distance(edge, w, h) {
  const D = new Float32Array(w * h); for (let i = 0; i < w * h; i++) D[i] = edge[i] ? 0 : 1e6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x > 0) D[i] = Math.min(D[i], D[i - 1] + 1); if (y > 0) D[i] = Math.min(D[i], D[i - w] + 1); if (x > 0 && y > 0) D[i] = Math.min(D[i], D[i - w - 1] + 1.414); if (x < w - 1 && y > 0) D[i] = Math.min(D[i], D[i - w + 1] + 1.414); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (x < w - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (y < h - 1) D[i] = Math.min(D[i], D[i + w] + 1); if (x < w - 1 && y < h - 1) D[i] = Math.min(D[i], D[i + w + 1] + 1.414); if (x > 0 && y < h - 1) D[i] = Math.min(D[i], D[i + w - 1] + 1.414); }
  return D;
}

// ── the page itself: Letter or A4 at print resolution ──
export const PAPER = { letter: [1700, 2200], a4: [1654, 2339] };
export function sheet(paper) { const [W, H] = PAPER[paper] || PAPER.letter; const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); return { c, x, W, H }; }
export function header(x, W, title, sub) { x.fillStyle = "#111"; x.textAlign = "center"; x.font = "bold 64px Georgia, serif"; x.fillText(title.slice(0, 42), W / 2, 120); if (sub) { x.font = "32px Georgia, serif"; x.fillStyle = "#555"; x.fillText(sub, W / 2, 170); } x.textAlign = "left"; x.font = "28px Georgia, serif"; x.fillStyle = "#777"; x.fillText("Name: ______________________", 90, 225); }
export function keyBlock(x, W, H, palette, top) {
  x.fillStyle = "#111"; x.font = "bold 34px Georgia, serif"; x.textAlign = "left"; x.fillText("Color key", 90, top);
  const cols = palette.length > 8 ? 4 : 3, cw = (W - 180) / cols;
  palette.forEach((c, i) => { const cx = 90 + (i % cols) * cw, cy = top + 30 + Math.floor(i / cols) * 70; x.fillStyle = "rgb(" + c.join(",") + ")"; x.fillRect(cx, cy, 52, 52); x.strokeStyle = "#111"; x.lineWidth = 2; x.strokeRect(cx, cy, 52, 52); x.fillStyle = "#111"; x.font = "bold 32px Georgia, serif"; x.fillText(String(i + 1), cx + 66, cy + 38); x.font = "28px Georgia, serif"; x.fillText(colorName(c), cx + 66 + (i + 1 > 9 ? 44 : 26), cy + 38); });
}

export async function makePages(src, o) {
  const kind = o.kind || "free", lv = LEVELS[o.level] || LEVELS.medium, paper = o.paper || "letter", title = o.title || "Color me";
  const im = await load(src); const pages = [];
  if (kind === "free") {
    const P = pixels(im, 1400); const { w, h, d } = P; const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const g = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; const v = g < 170 ? 0 : 255; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
    const art = document.createElement("canvas"); art.width = w; art.height = h; art.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
    const S = sheet(paper); header(S.x, S.W, title, "");
    const box = [90, 270, S.W - 180, S.H - 380]; const sc = Math.min(box[2] / w, box[3] / h); S.x.drawImage(art, box[0] + (box[2] - w * sc) / 2, box[1] + (box[3] - h * sc) / 2, w * sc, h * sc);
    pages.push({ name: "Coloring page", url: S.c.toDataURL("image/png") }); return pages;
  }
  if (kind === "grid") {
    const [gc, gr] = lv.grid; const P = pixels(im, 240); const cw = P.w / gc, ch = P.h / (P.h / P.w * gc) ; const rows = Math.max(8, Math.round(gc * P.h / P.w)); const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < gc; c++) { let R = 0, G = 0, B = 0, n = 0; for (let y = Math.floor(r * P.h / rows); y < Math.floor((r + 1) * P.h / rows); y++) for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) { const i = (y * P.w + x) * 4; R += P.d[i]; G += P.d[i + 1]; B += P.d[i + 2]; n++; } cells.push(n ? [R / n, G / n, B / n] : [255, 255, 255]); }
    void ch; void gr;
    const flat = new Uint8ClampedArray(cells.length * 4); cells.forEach((c, i) => { flat[i * 4] = c[0]; flat[i * 4 + 1] = c[1]; flat[i * 4 + 2] = c[2]; });
    const pal = kmeans(flat, cells.length, Math.min(lv.k, 10), 11); const idx = cells.map((c) => nearest(pal, c[0], c[1], c[2]));
    const draw = (answer) => {
      const S = sheet(paper); header(S.x, S.W, title, answer ? "Answer key" : "Color each square by its number - a picture will appear");
      const keyH = 60 + Math.ceil(pal.length / (pal.length > 8 ? 4 : 3)) * 70; const box = [90, 270, S.W - 180, S.H - 330 - keyH]; const cs = Math.min(box[2] / gc, box[3] / rows); const ox = box[0] + (box[2] - cs * gc) / 2, oy = box[1];
      for (let r = 0; r < rows; r++) for (let c = 0; c < gc; c++) { const k = idx[r * gc + c]; const X = ox + c * cs, Y = oy + r * cs; if (answer) { S.x.fillStyle = "rgb(" + pal[k].join(",") + ")"; S.x.fillRect(X, Y, cs, cs); } S.x.strokeStyle = "#999"; S.x.lineWidth = 1.2; S.x.strokeRect(X, Y, cs, cs); if (!answer) { S.x.fillStyle = "#333"; S.x.font = Math.max(12, Math.floor(cs * 0.5)) + "px Arial"; S.x.textAlign = "center"; S.x.textBaseline = "middle"; S.x.fillText(String(k + 1), X + cs / 2, Y + cs / 2 + 1); } }
      S.x.textBaseline = "alphabetic"; keyBlock(S.x, S.W, S.H, pal, oy + rows * cs + 70); return S.c.toDataURL("image/png");
    };
    pages.push({ name: "Mystery grid", url: draw(false) }, { name: "Answer key", url: draw(true) }); return pages;
  }
  // color by number
  const P = pixels(im, 640); const { w, h, d } = P; const n = w * h;
  const pal = kmeans(d, n, lv.k, 5); const lab = new Uint8Array(n); for (let i = 0; i < n; i++) lab[i] = nearest(pal, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  regions(lab, w, h, Math.max(12, Math.round(n * lv.min)));
  // keep only colours still in use, renumbered
  const used = [...new Set(lab)].sort((a, b) => a - b); const remap = {}; used.forEach((u, i) => { remap[u] = i; }); for (let i = 0; i < n; i++) lab[i] = remap[lab[i]]; const P2 = used.map((u) => pal[u]);
  const edge = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if ((x < w - 1 && lab[i] !== lab[i + 1]) || (y < h - 1 && lab[i] !== lab[i + w])) edge[i] = 1; }
  const D = distance(edge, w, h);
  // one label per connected region, where it has the most room
  const seen = new Uint8Array(n); const labels = []; const st = [];
  for (let i = 0; i < n; i++) { if (seen[i] || edge[i]) continue; let best = i, bd = -1, area = 0; seen[i] = 1; st.push(i); while (st.length) { const p = st.pop(); area++; if (D[p] > bd) { bd = D[p]; best = p; } const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !seen[q] && !edge[q] && lab[q] === lab[p]) { seen[q] = 1; st.push(q); } } if (area > 18 && bd >= 3) labels.push({ x: best % w, y: (best / w) | 0, k: lab[best], r: bd }); }
  const draw = (answer) => {
    const S = sheet(paper); header(S.x, S.W, title, answer ? "Answer key" : "Color each shape by its number");
    const keyH = 60 + Math.ceil(P2.length / (P2.length > 8 ? 4 : 3)) * 70; const box = [90, 260, S.W - 180, S.H - 320 - keyH]; const sc = Math.min(box[2] / w, box[3] / h); const ox = box[0] + (box[2] - w * sc) / 2, oy = box[1];
    if (answer) { const c = document.createElement("canvas"); c.width = w; c.height = h; const id = new ImageData(w, h); for (let i = 0; i < n; i++) { const col = P2[lab[i]]; id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2]; id.data[i * 4 + 3] = 255; } c.getContext("2d").putImageData(id, 0, 0); S.x.imageSmoothingEnabled = false; S.x.drawImage(c, ox, oy, w * sc, h * sc); }
    S.x.fillStyle = "#222"; for (let i = 0; i < n; i++) if (edge[i]) { const x = i % w, y = (i / w) | 0; S.x.fillRect(ox + x * sc, oy + y * sc, Math.max(1.6, sc * 0.9), Math.max(1.6, sc * 0.9)); }
    if (!answer) { S.x.textAlign = "center"; S.x.textBaseline = "middle"; S.x.fillStyle = "#333"; for (const L of labels) { const fs = Math.max(14, Math.min(40, L.r * sc * 0.9)); S.x.font = fs + "px Arial"; S.x.fillText(String(L.k + 1), ox + L.x * sc, oy + L.y * sc); } S.x.textBaseline = "alphabetic"; }
    keyBlock(S.x, S.W, S.H, P2, oy + h * sc + 70); return S.c.toDataURL("image/png");
  };
  pages.push({ name: "Color by number", url: draw(false) }, { name: "Answer key", url: draw(true) });
  return pages;
}

// ── printing: only the pages, one per sheet, through the phone's own print (AirPrint) ──
export function printPages(urls) {
  const box = document.createElement("div"); box.id = "print16";
  box.innerHTML = urls.map((u) => '<img src="' + u + '" alt="">').join("");
  const st = document.createElement("style"); st.id = "print16-css";
  st.textContent = "@media print{@page{margin:0}body>*:not(#print16){display:none!important}#print16{display:block!important}#print16 img{width:100%;height:auto;display:block;page-break-after:always;break-after:page}}#print16{display:none}";
  document.head.appendChild(st); document.body.appendChild(box);
  const done = () => { try { box.remove(); st.remove(); } catch (e) {} };
  const imgs = [...box.querySelectorAll("img")]; Promise.all(imgs.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => { setTimeout(() => { try { window.print(); } catch (e) {} setTimeout(done, 1500); }, 60); });
}
export async function sharePages(urls, name) {
  try {
    const files = await Promise.all(urls.map(async (u, i) => { const b = await (await fetch(u)).blob(); return new File([b], (name || "coloring") + "-" + (i + 1) + ".png", { type: "image/png" }); }));
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: name || "Coloring pages" }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return ""; }
  urls.forEach((u, i) => { const a = document.createElement("a"); a.href = u; a.download = (name || "coloring") + "-" + (i + 1) + ".png"; a.click(); });
  return "saved";
}

export function ColoringStudio({ initial, pullImage, onClose, gate }) {
  const [subject, setSubject] = useState((initial && initial.subject) || "");
  const [kind, setKind] = useState((initial && initial.kind) || "number");
  const [level, setLevel] = useState("medium"); const [age, setAge] = useState("child"); const [paper, setPaper] = useState(/en-US|en-CA|es-MX/.test(navigator.language || "") ? "letter" : "a4");
  const [count, setCount] = useState(1); const [busy, setBusy] = useState(""); const [pages, setPages] = useState([]); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const go = async () => {
    if (!subject.trim()) return; setErr(""); setMsg(""); setPages([]); const all = [];
    if (gate) { const stop = await gate("coloring", count); if (stop) { setErr(stop); return; } }
    const themes = count > 1 ? Array.from({ length: count }, (_, i) => subject + (i ? " - a different scene, page " + (i + 1) : "")) : [subject];
    for (let i = 0; i < themes.length; i++) {
      setBusy((count > 1 ? "Page " + (i + 1) + " of " + count + ": " : "") + "painting the picture...");
      let src = null; try { src = await pullImage(promptFor(kind, themes[i], age), false); } catch (e) {}
      if (!src) { setErr("The picture couldn't be painted just now - try again in a moment."); break; }
      setBusy((count > 1 ? "Page " + (i + 1) + " of " + count + ": " : "") + (kind === "free" ? "cleaning the outlines..." : "finding the shapes and numbering them..."));
      try { const ps = await makePages(src, { kind, level, paper, title: count > 1 ? subject + " - " + (i + 1) : subject }); all.push(...ps); setPages(all.slice()); } catch (e) { setErr("That picture couldn't be turned into a page - try another subject."); }
    }
    setBusy("");
  };
  const urls = pages.map((p) => p.url); const name = (subject || "coloring").replace(/[^\w -]/g, "").slice(0, 30);
  return (
    <div className="col16" role="dialog" aria-label="Coloring pages">
      <div className="col16-top"><b>{"🖍"} Coloring pages</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <div className="col16-body">
        <input className="col16-in" value={subject} onChange={(e) => setSubject(e.target.value.slice(0, 160))} placeholder="What should it be? e.g. a unicorn in a meadow" />
        <div className="col16-kinds">{KINDS.map((k) => <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}><b>{k.name}</b><span>{k.d}</span></button>)}</div>
        <div className="col16-row"><span>For</span>{[["toddler", "Little ones"], ["child", "Kids"], ["adult", "Adults"]].map(([k, l]) => <button key={k} className={age === k ? "on" : ""} onClick={() => setAge(k)}>{l}</button>)}</div>
        {kind !== "free" && <div className="col16-row"><span>Level</span>{Object.entries(LEVELS).map(([k, l]) => <button key={k} className={level === k ? "on" : ""} onClick={() => setLevel(k)}>{l.label}</button>)}</div>}
        <div className="col16-row"><span>Paper</span>{[["letter", "Letter"], ["a4", "A4"]].map(([k, l]) => <button key={k} className={paper === k ? "on" : ""} onClick={() => setPaper(k)}>{l}</button>)}<span style={{ marginLeft: 10 }}>Pages</span>{[1, 4, 8].map((n) => <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n === 1 ? "One" : n + " (a book)"}</button>)}</div>
        <button className="col16-go" disabled={!!busy || !subject.trim()} onClick={go}>{busy ? busy : "Make it"}</button>
        {err && <div className="col16-err">{err}</div>}
        {pages.length > 0 && <>
          <div className="col16-pages">{pages.map((p, i) => <figure key={i}><img src={p.url} alt={p.name} /><figcaption>{p.name}</figcaption></figure>)}</div>
          <div className="col16-row">
            <button className="pri" onClick={() => printPages(urls.filter((u, i) => !/Answer/.test(pages[i].name)))}>{"🖨"} Print</button>
            {pages.some((p) => /Answer/.test(p.name)) && <button onClick={() => printPages(urls)}>Print with answer keys</button>}
            <button onClick={async () => { const r = await sharePages(urls, name); setMsg(r === "shared" ? "Sent." : r === "saved" ? "Saved to your downloads - open them and print from there." : ""); }}>{"⬇"} Save or send</button>
          </div>
          <div className="col16-hint">Print sends it to any printer your phone can see (AirPrint on iPhone, Mopria / your printer's app on Android). Or Save, then print from Photos or Files.</div>
          {msg && <div className="col16-hint">{msg}</div>}
        </>}
      </div>
    </div>
  );
}

export const COLORING_CSS = `.col16{position:fixed;inset:0;z-index:8800;background:var(--bg,#faf7f2);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}
.col16-top{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;font-size:17px}.col16-top button{background:none;border:none;font-size:22px;color:inherit}
.col16-body{flex:1;overflow:auto;padding:4px 16px calc(24px + env(safe-area-inset-bottom));max-width:820px;width:100%;margin:0 auto;box-sizing:border-box}
.col16-in{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;border:1px solid var(--stone,#ddd);font:inherit;font-size:16px;background:var(--panel,#fff);color:inherit}
.col16-kinds{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.col16-kinds button{text-align:left;border:1px solid var(--stone,#ddd);background:var(--panel,#fff);border-radius:12px;padding:10px;font:inherit;color:inherit}.col16-kinds button.on{outline:2px solid #E8C060}.col16-kinds b{display:block;font-size:14px}.col16-kinds span{display:block;font-size:12px;opacity:.7;margin-top:3px}
.col16-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;font-size:13px}.col16-row>span{opacity:.7;margin-right:2px}.col16-row button{border:1px solid var(--stone,#ddd);background:var(--stone-l,#f6f3ee);border-radius:10px;padding:8px 11px;font:inherit;font-size:13px;color:inherit}.col16-row button.on{outline:2px solid #E8C060}.col16-row button.pri{background:#E8C060;border-color:#E8C060;color:#1a1405;font-weight:700}
.col16-go{width:100%;margin-top:8px;padding:14px;border-radius:14px;border:none;background:#E8C060;color:#1a1405;font:inherit;font-weight:800;font-size:16px}.col16-go:disabled{opacity:.7}
.col16-err{color:#b3261e;margin-top:8px;font-size:14px}.col16-hint{font-size:12px;opacity:.7;margin-top:6px}
.col16-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0}.col16-pages figure{margin:0;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12);overflow:hidden}.col16-pages img{width:100%;display:block}.col16-pages figcaption{font-size:12px;padding:6px;text-align:center;color:#333}
@media (max-width:520px){.col16-kinds{grid-template-columns:1fr}}`;
