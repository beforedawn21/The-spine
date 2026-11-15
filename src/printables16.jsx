// ============================================================================
//  PRINTABLES (batch 17) - small things made from what The Spine already does,
//  ready to print: mazes, word searches, crosswords, jigsaws, dot-to-dots,
//  cross-stitch and knitting charts, brick mosaics, sticker sheets, greeting
//  cards, posters, flashcards, worksheets, event pieces that match an
//  invitation, trading cards, a print-and-play board game, and papercraft.
//  Each comes out as print-ready pages (Letter or A4), with an answer key
//  where there is an answer. Print, or save and print from the phone.
// ============================================================================
import { useState } from "react";
import { load, pixels, sheet, header, kmeans, nearest, colorName, printPages, sharePages } from "./coloring16.jsx";
import { SHELLS, FONTS } from "./invite16.js";

export const PRINT_KINDS = [
  { key: "maze", name: "Maze", d: "Start to finish, three sizes", needs: "theme" },
  { key: "wordsearch", name: "Word search", d: "Hidden words on any topic", needs: "topic" },
  { key: "crossword", name: "Crossword", d: "Clues and a numbered grid", needs: "topic" },
  { key: "dots", name: "Dot-to-dot", d: "Join the numbers, see the picture", needs: "subject" },
  { key: "jigsaw", name: "Jigsaw", d: "Any picture cut into pieces", needs: "subject" },
  { key: "stitch", name: "Cross-stitch chart", d: "Symbols, colours and stitch counts", needs: "subject" },
  { key: "knit", name: "Knitting chart", d: "Colourwork grid from a picture", needs: "subject" },
  { key: "mosaic", name: "Brick mosaic", d: "Build the picture in bricks, with a parts list", needs: "subject" },
  { key: "stickers", name: "Sticker sheet", d: "Twelve stickers with cut lines", needs: "subject" },
  { key: "card", name: "Greeting card", d: "Folds in half, message inside", needs: "occasion" },
  { key: "poster", name: "Poster", d: "Wall art at print size", needs: "subject" },
  { key: "flash", name: "Flashcards", d: "Question front, answer back", needs: "topic" },
  { key: "worksheet", name: "Worksheet", d: "Maths practice or handwriting, with answers", needs: "topic" },
  { key: "event", name: "Event pieces", d: "Menu, place cards, thank-you cards in a look", needs: "event" },
  { key: "trading", name: "Trading cards", d: "Nine characters with stats", needs: "theme" },
  { key: "boardgame", name: "Print-and-play game", d: "Board, cards and rules", needs: "theme" },
  { key: "papercraft", name: "Papercraft", d: "Fold-up cube and pyramid with your pictures", needs: "subject" },
];
const LV = { easy: 0, medium: 1, hard: 2 };
function rng(seed) { let s = (seed || 12345) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const page = (paper) => sheet(paper);
const done = (S) => S.c.toDataURL("image/png");
function wrapText(x, text, maxW) { const out = []; let line = ""; for (const w of String(text || "").split(/\s+/)) { const t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
function dashed(x, a, b, c, d) { x.save(); x.setLineDash([10, 8]); x.strokeStyle = "#999"; x.lineWidth = 2; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); x.restore(); }

// ── MAZE (depth-first carve; answer by breadth-first search) ──
export function maze(o) {
  const [cols, rows] = [[12, 16], [18, 24], [26, 34]][LV[o.level] ?? 1]; const R = rng(o.seed);
  const walls = Array.from({ length: rows * cols }, () => [1, 1, 1, 1]); // top right bottom left
  const seen = new Uint8Array(rows * cols); const st = [0]; seen[0] = 1;
  while (st.length) { const c = st[st.length - 1], x = c % cols, y = (c / cols) | 0; const nb = []; if (y > 0 && !seen[c - cols]) nb.push([c - cols, 0, 2]); if (x < cols - 1 && !seen[c + 1]) nb.push([c + 1, 1, 3]); if (y < rows - 1 && !seen[c + cols]) nb.push([c + cols, 2, 0]); if (x > 0 && !seen[c - 1]) nb.push([c - 1, 3, 1]);
    if (!nb.length) { st.pop(); continue; } const [n, a, b] = nb[Math.floor(R() * nb.length)]; walls[c][a] = 0; walls[n][b] = 0; seen[n] = 1; st.push(n); }
  const prev = new Int32Array(rows * cols).fill(-1); const q = [0]; prev[0] = 0; while (q.length) { const c = q.shift(), x = c % cols; const moves = [[0, -cols], [1, 1], [2, cols], [3, -1]]; for (const [w, d] of moves) { const n = c + d; if (!walls[c][w] && n >= 0 && n < rows * cols && prev[n] < 0 && !(w === 1 && x === cols - 1) && !(w === 3 && x === 0)) { prev[n] = c; q.push(n); } } }
  const path = []; for (let c = rows * cols - 1; c !== 0; c = prev[c]) path.push(c); path.push(0);
  const draw = (ans) => { const S = page(o.paper); header(S.x, S.W, o.title || "Maze", ans ? "Answer key" : "Find the way from START to FINISH"); const box = [110, 280, S.W - 220, S.H - 420]; const cs = Math.min(box[2] / cols, box[3] / rows); const ox = (S.W - cs * cols) / 2, oy = box[1] + 30;
    if (ans) { S.x.strokeStyle = "#e0453a"; S.x.lineWidth = Math.max(4, cs * 0.25); S.x.beginPath(); path.forEach((c, i) => { const px = ox + (c % cols + 0.5) * cs, py = oy + (((c / cols) | 0) + 0.5) * cs; i ? S.x.lineTo(px, py) : S.x.moveTo(px, py); }); S.x.stroke(); }
    S.x.strokeStyle = "#111"; S.x.lineWidth = Math.max(3, cs * 0.09); S.x.lineCap = "round"; S.x.beginPath();
    for (let c = 0; c < rows * cols; c++) { const X = ox + (c % cols) * cs, Y = oy + ((c / cols) | 0) * cs; const w = walls[c]; if (w[0] && c !== 0) { S.x.moveTo(X, Y); S.x.lineTo(X + cs, Y); } if (w[1]) { S.x.moveTo(X + cs, Y); S.x.lineTo(X + cs, Y + cs); } if (w[2] && c !== rows * cols - 1) { S.x.moveTo(X, Y + cs); S.x.lineTo(X + cs, Y + cs); } if (w[3]) { S.x.moveTo(X, Y); S.x.lineTo(X, Y + cs); } }
    S.x.stroke(); S.x.fillStyle = "#111"; S.x.font = "bold 30px Georgia, serif"; S.x.textAlign = "left"; S.x.fillText("START", ox, oy - 12); S.x.textAlign = "right"; S.x.fillText("FINISH", ox + cs * cols, oy + cs * rows + 40); return done(S); };
  return [{ name: "Maze", url: draw(false) }, { name: "Answer key", url: draw(true) }];
}

// ── WORD SEARCH ──
export function wordSearch(o) {
  const n = [12, 15, 18][LV[o.level] ?? 1]; const R = rng(o.seed);
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]].slice(0, [2, 4, 8][LV[o.level] ?? 1]);
  const words = (o.words || []).map((w) => String(w).toUpperCase().replace(/[^A-Z]/g, "")).filter((w) => w.length >= 3 && w.length <= n).slice(0, 18);
  const g = Array.from({ length: n * n }, () => ""); const placed = [];
  for (const w of words.sort((a, b) => b.length - a.length)) { for (let t = 0; t < 300; t++) { const [dx, dy] = dirs[Math.floor(R() * dirs.length)]; const x0 = Math.floor(R() * n), y0 = Math.floor(R() * n); const x1 = x0 + dx * (w.length - 1), y1 = y0 + dy * (w.length - 1); if (x1 < 0 || x1 >= n || y1 < 0 || y1 >= n) continue; let ok = true; for (let i = 0; i < w.length; i++) { const c = g[(y0 + dy * i) * n + x0 + dx * i]; if (c && c !== w[i]) { ok = false; break; } } if (!ok) continue; for (let i = 0; i < w.length; i++) g[(y0 + dy * i) * n + x0 + dx * i] = w[i]; placed.push({ w, x0, y0, dx, dy }); break; } }
  const L = "ABCDEFGHIJKLMNOPRSTUVWY"; const full = g.map((c) => c || L[Math.floor(R() * L.length)]);
  const draw = (ans) => { const S = page(o.paper); header(S.x, S.W, o.title || "Word search", ans ? "Answer key" : "Find every word in the list"); const cs = Math.min((S.W - 240) / n, (S.H - 900) / n); const ox = (S.W - cs * n) / 2, oy = 290;
    if (ans) { S.x.strokeStyle = "rgba(232,192,96,.75)"; S.x.lineCap = "round"; S.x.lineWidth = cs * 0.75; for (const p of placed) { S.x.beginPath(); S.x.moveTo(ox + (p.x0 + 0.5) * cs, oy + (p.y0 + 0.5) * cs); S.x.lineTo(ox + (p.x0 + p.dx * (p.w.length - 1) + 0.5) * cs, oy + (p.y0 + p.dy * (p.w.length - 1) + 0.5) * cs); S.x.stroke(); } }
    S.x.fillStyle = "#111"; S.x.textAlign = "center"; S.x.textBaseline = "middle"; S.x.font = "bold " + Math.floor(cs * 0.55) + "px Arial"; full.forEach((c, i) => S.x.fillText(c, ox + (i % n + 0.5) * cs, oy + (((i / n) | 0) + 0.5) * cs)); S.x.strokeStyle = "#111"; S.x.lineWidth = 3; S.x.strokeRect(ox - 10, oy - 10, cs * n + 20, cs * n + 20);
    S.x.textBaseline = "alphabetic"; S.x.textAlign = "left"; S.x.font = "34px Georgia, serif"; const lw = (S.W - 220) / 3; placed.map((p) => p.w).sort().forEach((w, i) => S.x.fillText("\u25A1 " + w, 110 + (i % 3) * lw, oy + cs * n + 90 + Math.floor(i / 3) * 52)); return done(S); };
  return [{ name: "Word search", url: draw(false) }, { name: "Answer key", url: draw(true) }];
}

// ── CROSSWORD (greedy fit of the words through shared letters) ──
export function crossword(o) {
  const items = (o.clues || []).map((c) => ({ w: String(c.word || "").toUpperCase().replace(/[^A-Z]/g, ""), clue: String(c.clue || "") })).filter((c) => c.w.length >= 3 && c.w.length <= 13).slice(0, 16).sort((a, b) => b.w.length - a.w.length);
  const cells = new Map(); const key = (x, y) => x + "," + y; const placed = [];
  const fits = (w, x, y, dx, dy) => { let cross = 0; for (let i = -1; i <= w.length; i++) { const cx = x + dx * i, cy = y + dy * i; const c = cells.get(key(cx, cy)); if (i === -1 || i === w.length) { if (c) return -1; continue; } if (c) { if (c !== w[i]) return -1; cross++; } else { if (cells.get(key(cx + dy, cy + dx)) || cells.get(key(cx - dy, cy - dx))) return -1; } } return cross; };
  const put = (it, x, y, dx, dy) => { for (let i = 0; i < it.w.length; i++) cells.set(key(x + dx * i, y + dy * i), it.w[i]); placed.push({ ...it, x, y, dx, dy }); };
  if (items.length) put(items[0], 0, 0, 1, 0);
  for (const it of items.slice(1)) { let best = null; for (const p of placed) for (let i = 0; i < p.w.length; i++) for (let j = 0; j < it.w.length; j++) { if (p.w[i] !== it.w[j]) continue; const dx = p.dx ? 0 : 1, dy = p.dx ? 1 : 0; const x = p.x + p.dx * i - dx * j, y = p.y + p.dy * i - dy * j; const f = fits(it.w, x, y, dx, dy); if (f > 0 && (!best || f > best.f)) best = { x, y, dx, dy, f }; } if (best) put(it, best.x, best.y, best.dx, best.dy); }
  const xs = [...cells.keys()].map((k) => +k.split(",")[0]), ys = [...cells.keys()].map((k) => +k.split(",")[1]); const mx = Math.min(...xs), my = Math.min(...ys), W = Math.max(...xs) - mx + 1, Hh = Math.max(...ys) - my + 1;
  const starts = {}; let num = 0; [...placed].sort((a, b) => (a.y - b.y) || (a.x - b.x)).forEach((p) => { const k = key(p.x, p.y); if (!starts[k]) starts[k] = ++num; p.n = starts[k]; });
  const draw = (ans) => { const S = page(o.paper); header(S.x, S.W, o.title || "Crossword", ans ? "Answer key" : ""); const cs = Math.min((S.W - 220) / W, 1100 / Hh, 70); const ox = (S.W - cs * W) / 2, oy = 270;
    for (const [k, ch] of cells) { const [x, y] = k.split(",").map(Number); const X = ox + (x - mx) * cs, Y = oy + (y - my) * cs; S.x.fillStyle = "#fff"; S.x.fillRect(X, Y, cs, cs); S.x.strokeStyle = "#111"; S.x.lineWidth = 2; S.x.strokeRect(X, Y, cs, cs); if (starts[k]) { S.x.fillStyle = "#111"; S.x.font = Math.floor(cs * 0.28) + "px Arial"; S.x.textAlign = "left"; S.x.fillText(String(starts[k]), X + 3, Y + cs * 0.3); } if (ans) { S.x.font = "bold " + Math.floor(cs * 0.55) + "px Arial"; S.x.textAlign = "center"; S.x.fillText(ch, X + cs / 2, Y + cs * 0.72); } }
    let y = oy + cs * Hh + 70; S.x.textAlign = "left"; for (const [lab, dir] of [["Across", 1], ["Down", 0]]) { S.x.font = "bold 34px Georgia, serif"; S.x.fillStyle = "#111"; S.x.fillText(lab, 110, y); y += 44; S.x.font = "28px Georgia, serif"; for (const p of placed.filter((p) => p.dx === dir).sort((a, b) => a.n - b.n)) { for (const l of wrapText(S.x, p.n + ". " + p.clue + " (" + p.w.length + ")", S.W - 220)) { S.x.fillText(l, 110, y); y += 36; } } y += 20; }
    return done(S); };
  return [{ name: "Crossword", url: draw(false) }, { name: "Answer key", url: draw(true) }];
}

// ── JIGSAW (classic tabs) ──
export async function jigsaw(src, o) {
  const im = await load(src); const [cols, rows] = [[4, 5], [6, 8], [9, 12]][LV[o.level] ?? 1]; const R = rng(o.seed);
  const S = page(o.paper); header(S.x, S.W, o.title || "Jigsaw", "Print on card, cut along the lines"); const box = [100, 260, S.W - 200, S.H - 360]; const sc = Math.min(box[2] / im.naturalWidth, box[3] / im.naturalHeight); const w = im.naturalWidth * sc, h = im.naturalHeight * sc; const ox = (S.W - w) / 2, oy = box[1];
  S.x.drawImage(im, ox, oy, w, h); const pw = w / cols, ph = h / rows; S.x.strokeStyle = "rgba(255,255,255,.95)"; S.x.lineWidth = 3;
  const edge = (x0, y0, x1, y1, flip) => { const dx = x1 - x0, dy = y1 - y0, nx = -dy * flip, ny = dx * flip; S.x.moveTo(x0, y0); S.x.lineTo(x0 + dx * 0.36, y0 + dy * 0.36); S.x.bezierCurveTo(x0 + dx * 0.3 + nx * 0.25, y0 + dy * 0.3 + ny * 0.25, x0 + dx * 0.7 + nx * 0.25, y0 + dy * 0.7 + ny * 0.25, x0 + dx * 0.64, y0 + dy * 0.64); S.x.lineTo(x1, y1); };
  S.x.beginPath(); for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) edge(ox + c * pw, oy + r * ph, ox + (c + 1) * pw, oy + r * ph, R() < 0.5 ? 1 : -1);
  for (let c = 1; c < cols; c++) for (let r = 0; r < rows; r++) edge(ox + c * pw, oy + r * ph, ox + c * pw, oy + (r + 1) * ph, R() < 0.5 ? 1 : -1); S.x.stroke(); S.x.strokeStyle = "#111"; S.x.strokeRect(ox, oy, w, h);
  return [{ name: "Jigsaw (" + cols * rows + " pieces)", url: done(S) }];
}

// ── DOT-TO-DOT (outline of a silhouette, simplified, numbered) ──
export async function dots(src, o) {
  const im = await load(src); const P = pixels(im, 360); const { w, h, d } = P; const ink = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) ink[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11 < 128 ? 1 : 0;
  // biggest blob
  const lab = new Int32Array(w * h).fill(-1); let best = -1, bestN = 0; const st = []; for (let i = 0; i < w * h; i++) { if (!ink[i] || lab[i] >= 0) continue; let n = 0; lab[i] = i; st.push(i); while (st.length) { const p = st.pop(); n++; const x = p % w; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < w * h && ink[q] && lab[q] < 0) { lab[q] = i; st.push(q); } } if (n > bestN) { bestN = n; best = i; } }
  if (best < 0) throw new Error("no shape");
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === best;
  // Moore boundary trace
  let sx = 0, sy = 0; outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { sx = x; sy = y; break outer; }
  // Moore-neighbour boundary trace (clockwise), with the backtrack point carried along
  const N8 = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]; const pts = [[sx, sy]]; let px = sx, py = sy, bx = sx - 1, by = sy;
  for (let k = 0; k < w * h; k++) {
    let at = 0; for (let q = 0; q < 8; q++) if (px + N8[q][0] === bx && py + N8[q][1] === by) { at = q; break; }
    let moved = false; for (let i2 = 1; i2 <= 8; i2++) { const jj = (at + i2) % 8; const nx = px + N8[jj][0], ny = py + N8[jj][1]; if (on(nx, ny)) { const pb = (jj + 7) % 8; bx = px + N8[pb][0]; by = py + N8[pb][1]; px = nx; py = ny; moved = true; break; } }
    if (!moved || (px === sx && py === sy)) break; pts.push([px, py]);
  }
  // simplify to the wanted count, evenly along the outline
  const want = [24, 50, 90][LV[o.level] ?? 1]; const step = Math.max(1, Math.floor(pts.length / want)); const sel = pts.filter((_, i) => i % step === 0).slice(0, want);
  const draw = (ans) => { const S = page(o.paper); header(S.x, S.W, o.title || "Dot-to-dot", ans ? "Answer key" : "Join the dots from 1 to " + sel.length); const sc = Math.min((S.W - 260) / w, (S.H - 420) / h); const ox = (S.W - w * sc) / 2, oy = 280;
    if (ans) { S.x.strokeStyle = "#333"; S.x.lineWidth = 3; S.x.beginPath(); sel.forEach(([x, y], i) => (i ? S.x.lineTo(ox + x * sc, oy + y * sc) : S.x.moveTo(ox + x * sc, oy + y * sc))); S.x.closePath(); S.x.stroke(); }
    S.x.font = "24px Arial"; S.x.textAlign = "left"; sel.forEach(([x, y], i) => { S.x.fillStyle = "#111"; S.x.beginPath(); S.x.arc(ox + x * sc, oy + y * sc, 6, 0, 6.29); S.x.fill(); S.x.fillText(String(i + 1), ox + x * sc + 9, oy + y * sc - 8); }); return done(S); };
  return [{ name: "Dot-to-dot", url: draw(false) }, { name: "Answer key", url: draw(true) }];
}

// ── CROSS-STITCH / KNITTING CHART and BRICK MOSAIC (grids from a picture) ──
const SYMBOLS = "\u25CF\u25B2\u25A0\u2605\u2665\u25C6\u271A\u2715\u25CB\u25B3\u25A1\u2606\u2661\u25C7\u2726\u2600".split("");
const BRICKS = [["White", [244, 244, 244]], ["Black", [27, 42, 52]], ["Red", [180, 0, 0]], ["Yellow", [250, 200, 10]], ["Blue", [0, 85, 191]], ["Green", [35, 120, 65]], ["Orange", [214, 121, 35]], ["Light grey", [160, 165, 169]], ["Dark grey", [99, 95, 98]], ["Tan", [222, 198, 156]], ["Brown", [88, 57, 39]], ["Pink", [252, 151, 172]], ["Lime", [187, 233, 11]], ["Light blue", [120, 191, 234]], ["Purple", [129, 0, 123]], ["Dark red", [114, 14, 15]]];
export async function gridChart(src, o, kind) {
  const im = await load(src); const lv = LV[o.level] ?? 1; const cols = kind === "mosaic" ? [32, 48, 64][lv] : [40, 60, 80][lv]; const ratio = kind === "knit" ? 0.8 : 1;
  const P = pixels(im, 400); const rows = Math.round(cols * (P.h / P.w) / ratio); const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let R = 0, G = 0, B = 0, n = 0; for (let y = Math.floor(r * P.h / rows); y < Math.floor((r + 1) * P.h / rows); y++) for (let x = Math.floor(c * P.w / cols); x < Math.floor((c + 1) * P.w / cols); x++) { const i = (y * P.w + x) * 4; R += P.d[i]; G += P.d[i + 1]; B += P.d[i + 2]; n++; } cells.push(n ? [R / n, G / n, B / n] : [255, 255, 255]); }
  let pal; if (kind === "mosaic") pal = BRICKS.map((b) => b[1]); else { const flat = new Uint8ClampedArray(cells.length * 4); cells.forEach((cc, i) => { flat[i * 4] = cc[0]; flat[i * 4 + 1] = cc[1]; flat[i * 4 + 2] = cc[2]; }); pal = kmeans(flat, cells.length, [8, 12, 16][lv], 3); }
  const idx = cells.map((cc) => nearest(pal, cc[0], cc[1], cc[2])); const count = pal.map((_, k) => idx.filter((v) => v === k).length); const used = pal.map((_, k) => k).filter((k) => count[k]);
  const S = page(o.paper); header(S.x, S.W, o.title || (kind === "mosaic" ? "Brick mosaic" : kind === "knit" ? "Knitting chart" : "Cross-stitch chart"), cols + " \u00D7 " + rows + (kind === "mosaic" ? " studs" : " stitches"));
  const keyRows = Math.ceil(used.length / 3); const avail = S.H - 360 - keyRows * 64; const cw = Math.min((S.W - 200) / cols, avail / (rows * ratio)), chh = cw * ratio; const ox = (S.W - cw * cols) / 2, oy = 260;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const k = idx[r * cols + c]; const X = ox + c * cw, Y = oy + r * chh; const col = pal[k];
    if (kind === "mosaic") { S.x.fillStyle = "rgb(" + col.join(",") + ")"; S.x.fillRect(X, Y, cw, chh); S.x.beginPath(); S.x.arc(X + cw / 2, Y + chh / 2, cw * 0.32, 0, 6.29); S.x.strokeStyle = "rgba(0,0,0,.25)"; S.x.lineWidth = 1; S.x.stroke(); }
    else { S.x.fillStyle = "rgba(" + col.join(",") + ",0.45)"; S.x.fillRect(X, Y, cw, chh); S.x.fillStyle = "#111"; S.x.font = Math.floor(cw * 0.7) + "px Arial"; S.x.textAlign = "center"; S.x.textBaseline = "middle"; S.x.fillText(SYMBOLS[used.indexOf(k) % SYMBOLS.length], X + cw / 2, Y + chh / 2 + 1); } }
  S.x.textBaseline = "alphabetic"; S.x.strokeStyle = "#555"; S.x.lineWidth = 1; for (let c = 0; c <= cols; c++) { S.x.lineWidth = c % 10 === 0 ? 2.5 : 0.6; S.x.beginPath(); S.x.moveTo(ox + c * cw, oy); S.x.lineTo(ox + c * cw, oy + rows * chh); S.x.stroke(); } for (let r = 0; r <= rows; r++) { S.x.lineWidth = r % 10 === 0 ? 2.5 : 0.6; S.x.beginPath(); S.x.moveTo(ox, oy + r * chh); S.x.lineTo(ox + cols * cw, oy + r * chh); S.x.stroke(); }
  let y = oy + rows * chh + 60; S.x.fillStyle = "#111"; S.x.font = "bold 32px Georgia, serif"; S.x.textAlign = "left"; S.x.fillText(kind === "mosaic" ? "Parts list" : "Colour key", 100, y); y += 20; const lw = (S.W - 200) / 3;
  used.forEach((k, i) => { const X = 100 + (i % 3) * lw, Y = y + Math.floor(i / 3) * 60; S.x.fillStyle = "rgb(" + pal[k].join(",") + ")"; S.x.fillRect(X, Y, 44, 44); S.x.strokeStyle = "#111"; S.x.strokeRect(X, Y, 44, 44); S.x.fillStyle = "#111"; S.x.font = "26px Arial"; const nm = kind === "mosaic" ? BRICKS[k][0] : colorName(pal[k]); S.x.fillText((kind === "mosaic" ? "" : SYMBOLS[i % SYMBOLS.length] + "  ") + nm + " \u00D7 " + count[k], X + 56, Y + 32); });
  return [{ name: kind === "mosaic" ? "Brick mosaic" : kind === "knit" ? "Knitting chart" : "Cross-stitch chart", url: done(S) }];
}

// ── STICKERS, POSTER, GREETING CARD, PAPERCRAFT ──
export async function stickerSheet(srcs, o) {
  const S = page(o.paper); header(S.x, S.W, o.title || "Stickers", "Print on sticker paper, cut along the dashed lines"); const cols = 3, rows = 4, cw = (S.W - 200) / cols, ch = (S.H - 360) / rows;
  for (let i = 0; i < cols * rows; i++) { const src = srcs[i % srcs.length]; const im = await load(src); const X = 100 + (i % cols) * cw, Y = 260 + Math.floor(i / cols) * ch; const r = Math.min(cw, ch) * 0.42; S.x.save(); S.x.beginPath(); S.x.arc(X + cw / 2, Y + ch / 2, r, 0, 6.29); S.x.clip(); const sc = Math.max((2 * r) / im.naturalWidth, (2 * r) / im.naturalHeight); S.x.drawImage(im, X + cw / 2 - im.naturalWidth * sc / 2, Y + ch / 2 - im.naturalHeight * sc / 2, im.naturalWidth * sc, im.naturalHeight * sc); S.x.restore(); S.x.save(); S.x.setLineDash([10, 8]); S.x.strokeStyle = "#999"; S.x.lineWidth = 2; S.x.beginPath(); S.x.arc(X + cw / 2, Y + ch / 2, r + 8, 0, 6.29); S.x.stroke(); S.x.restore(); }
  return [{ name: "Sticker sheet", url: done(S) }];
}
export async function poster(src, o) {
  const im = await load(src); const S = page(o.paper); const m = 70; const sc = Math.min((S.W - 2 * m) / im.naturalWidth, (S.H - 2 * m - 260) / im.naturalHeight); const w = im.naturalWidth * sc, h = im.naturalHeight * sc;
  S.x.drawImage(im, (S.W - w) / 2, m, w, h); S.x.fillStyle = "#111"; S.x.textAlign = "center"; S.x.font = "bold 92px Georgia, serif"; S.x.fillText(String(o.title || "").slice(0, 26), S.W / 2, m + h + 130); if (o.caption) { S.x.font = "italic 40px Georgia, serif"; S.x.fillStyle = "#444"; S.x.fillText(String(o.caption).slice(0, 60), S.W / 2, m + h + 195); }
  return [{ name: "Poster", url: done(S) }];
}
export async function greetingCard(src, o) {
  // Letter / A4 turned sideways, folded in half: page 1 is the outside (back | front), page 2 the inside
  const [W, H] = o.paper === "a4" ? [2339, 1654] : [2200, 1700]; const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); return { c, x }; };
  const im = await load(src); const A = mk(); const half = W / 2; const sc = Math.min((half - 160) / im.naturalWidth, (H - 420) / im.naturalHeight); const w = im.naturalWidth * sc, h = im.naturalHeight * sc;
  A.x.drawImage(im, half + (half - w) / 2, 110, w, h); A.x.fillStyle = "#222"; A.x.textAlign = "center"; A.x.font = "bold 76px Georgia, serif"; A.x.fillText(String(o.title || "").slice(0, 24), half + half / 2, 110 + h + 120);
  A.x.font = "24px Georgia, serif"; A.x.fillStyle = "#999"; A.x.fillText("Made on The Spine", half / 2, H - 120); dashed(A.x, half, 30, half, H - 30);
  const B = mk(); B.x.fillStyle = "#222"; B.x.textAlign = "center"; B.x.font = "48px Georgia, serif"; const lines = wrapText(B.x, o.message || "", half - 240); lines.slice(0, 12).forEach((l, i) => B.x.fillText(l, half + half / 2, H / 2 - lines.length * 32 + i * 64)); dashed(B.x, half, 30, half, H - 30);
  return [{ name: "Card - outside (print first)", url: A.c.toDataURL("image/png"), landscape: true }, { name: "Card - inside (print on the back)", url: B.c.toDataURL("image/png"), landscape: true }];
}
export async function papercraft(srcs, o) {
  const S = page(o.paper); header(S.x, S.W, o.title || "Photo cube", "Cut out, fold on the dotted lines, glue the tabs"); const s = Math.min(330, (S.W - 200) / 4); const ox = (S.W - 4 * s) / 2, oy = 330;
  const faces = [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]; for (let i = 0; i < 6; i++) { const [fx, fy] = faces[i]; const im = await load(srcs[i % srcs.length]); const X = ox + fx * s, Y = oy + fy * s; const sc = Math.max(s / im.naturalWidth, s / im.naturalHeight); S.x.save(); S.x.beginPath(); S.x.rect(X, Y, s, s); S.x.clip(); S.x.drawImage(im, X + s / 2 - im.naturalWidth * sc / 2, Y + s / 2 - im.naturalHeight * sc / 2, im.naturalWidth * sc, im.naturalHeight * sc); S.x.restore(); S.x.strokeStyle = "#111"; S.x.lineWidth = 2; S.x.strokeRect(X, Y, s, s); }
  const tab = (x, y, w, h) => { S.x.fillStyle = "#eee"; S.x.fillRect(x, y, w, h); S.x.strokeStyle = "#999"; S.x.strokeRect(x, y, w, h); }; tab(ox + s, oy - 40, s, 40); tab(ox - 40, oy + s, 40, s); tab(ox + 4 * s, oy + s, 40, s); tab(ox + s, oy + 3 * s, s, 40); tab(ox + 2 * s, oy + 2 * s, s, 40); tab(ox + 3 * s, oy + 2 * s, s, 40);
  return [{ name: "Photo cube", url: done(S) }];
}

// ── FLASHCARDS, WORKSHEETS ──
export function flashcards(cards, o) {
  const per = 8; const pages = []; for (let p = 0; p < cards.length; p += per) { const set = cards.slice(p, p + per); for (const back of [false, true]) { const S = page(o.paper); const cw = (S.W - 160) / 2, ch = (S.H - 160) / 4; set.forEach((c, i) => { const col = back ? 1 - (i % 2) : i % 2; const X = 80 + col * cw, Y = 80 + Math.floor(i / 2) * ch; S.x.strokeStyle = "#bbb"; S.x.setLineDash([10, 8]); S.x.strokeRect(X, Y, cw, ch); S.x.setLineDash([]); S.x.fillStyle = "#111"; S.x.textAlign = "center"; S.x.font = (back ? "" : "bold ") + "36px Georgia, serif"; const ls = wrapText(S.x, back ? c.a : c.q, cw - 80); ls.slice(0, 6).forEach((l, k) => S.x.fillText(l, X + cw / 2, Y + ch / 2 - (ls.length - 1) * 22 + k * 44)); }); pages.push({ name: (back ? "Backs" : "Fronts") + " " + (p / per + 1), url: done(S) }); } }
  return pages;
}
export function worksheet(o) {
  const t = String(o.topic || "").toLowerCase(); const R = rng(o.seed); const lv = LV[o.level] ?? 1;
  if (/hand ?writing|letters|alphabet|trace|tracing|name/.test(t)) {
    const words = (String(o.topic || "").match(/["“](.+?)["”]/) || [])[1] || (o.words && o.words.length ? o.words.join(" ") : "Aa Bb Cc Dd Ee");
    const S = page(o.paper); header(S.x, S.W, o.title || "Handwriting practice", "Trace the grey letters, then write your own"); let y = 330;
    for (let r = 0; r < 9; r++) { S.x.strokeStyle = "#9bb"; S.x.lineWidth = 2; for (const off of [0, 60, 120]) { S.x.setLineDash(off === 60 ? [12, 10] : []); S.x.beginPath(); S.x.moveTo(110, y + off); S.x.lineTo(S.W - 110, y + off); S.x.stroke(); } S.x.setLineDash([]); if (r % 2 === 0) { S.x.fillStyle = "#c8c8c8"; S.x.font = "112px 'Comic Sans MS', 'Chalkboard SE', Arial"; S.x.textAlign = "left"; S.x.fillText(words.slice(0, 18), 120, y + 112); } y += 200; }
    return [{ name: "Handwriting", url: done(S) }];
  }
  const op = /divi/.test(t) ? "\u00F7" : /multi|times/.test(t) ? "\u00D7" : /subtr|minus|take away/.test(t) ? "\u2212" : /mix/.test(t) ? "mix" : "+";
  const max = [10, 50, 200][lv]; const probs = []; for (let i = 0; i < 24; i++) { const o2 = op === "mix" ? ["+", "\u2212", "\u00D7"][i % 3] : op; let a = 1 + Math.floor(R() * max), b = 1 + Math.floor(R() * (o2 === "\u00D7" ? [5, 12, 25][lv] : max)); if (o2 === "\u2212" && b > a) [a, b] = [b, a]; if (o2 === "\u00F7") { b = 1 + Math.floor(R() * [5, 10, 12][lv]); a = b * (1 + Math.floor(R() * [5, 10, 20][lv])); } const ans = o2 === "+" ? a + b : o2 === "\u2212" ? a - b : o2 === "\u00D7" ? a * b : a / b; probs.push([a, o2, b, ans]); }
  const draw = (key) => { const S = page(o.paper); header(S.x, S.W, o.title || "Maths practice", key ? "Answer key" : ""); S.x.fillStyle = "#111"; S.x.font = "48px Arial"; S.x.textAlign = "right"; probs.forEach(([a, o2, b, ans], i) => { const X = 330 + (i % 3) * 470, Y = 360 + Math.floor(i / 3) * 210; S.x.fillText(String(a), X, Y); S.x.fillText(o2 + " " + b, X, Y + 60); S.x.fillRect(X - 190, Y + 80, 190, 4); if (key) { S.x.fillStyle = "#c0392b"; S.x.fillText(String(ans), X, Y + 145); S.x.fillStyle = "#111"; } }); return done(S); };
  return [{ name: "Worksheet", url: draw(false) }, { name: "Answer key", url: draw(true) }];
}

// ── EVENT PIECES (match an invitation's look) and TRADING CARDS and PRINT-AND-PLAY ──
async function fontsFor(shell) { const f = FONTS[shell.fonts] || FONTS.classic; try { const id = "pf16-" + shell.fonts; if (!document.getElementById(id)) { const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(f.display) + "&family=" + encodeURIComponent(f.body) + "&display=swap"; document.head.appendChild(l); } await Promise.race([Promise.all([document.fonts.load("60px '" + f.display + "'"), document.fonts.load("30px '" + f.body + "'")]), new Promise((z) => setTimeout(z, 2500))]); } catch (e) {} return f; }
export async function eventPieces(o) {
  const shell = SHELLS.find((s) => s.key === o.look) || SHELLS[0]; const f = await fontsFor(shell); const v = shell.vars; const pages = [];
  const frame = (S) => { S.x.fillStyle = v.paper; S.x.fillRect(0, 0, S.W, S.H); S.x.strokeStyle = v.accent; S.x.lineWidth = 6; S.x.strokeRect(60, 60, S.W - 120, S.H - 120); S.x.lineWidth = 2; S.x.strokeRect(80, 80, S.W - 160, S.H - 160); };
  // menu
  { const S = page(o.paper); frame(S); S.x.fillStyle = v.ink; S.x.textAlign = "center"; S.x.font = "84px '" + f.display + "', serif"; S.x.fillText(String(o.title || "Menu").slice(0, 28), S.W / 2, 260); S.x.font = "36px '" + f.body + "', serif"; S.x.fillStyle = v.accent; S.x.fillText("\u2022 MENU \u2022", S.W / 2, 330); S.x.fillStyle = v.ink; let y = 450; for (const it of (o.menu || []).slice(0, 12)) { S.x.font = "44px '" + f.display + "', serif"; S.x.fillText(it.name || it, S.W / 2, y); if (it.note) { S.x.font = "28px '" + f.body + "', serif"; S.x.fillText(it.note, S.W / 2, y + 42); } y += it.note ? 130 : 90; } pages.push({ name: "Menu", url: done(S) }); }
  // place cards (8 per page, fold on the middle line)
  const names = (o.names || []).slice(0, 48); for (let p = 0; p < Math.max(1, names.length); p += 8) { const S = page(o.paper); const cw = (S.W - 160) / 2, ch = (S.H - 160) / 4; for (let i = 0; i < 8; i++) { const nm = names[p + i]; if (!nm && names.length) break; const X = 80 + (i % 2) * cw, Y = 80 + Math.floor(i / 2) * ch; S.x.fillStyle = v.paper; S.x.fillRect(X, Y, cw, ch); S.x.strokeStyle = "#bbb"; S.x.setLineDash([10, 8]); S.x.strokeRect(X, Y, cw, ch); S.x.beginPath(); S.x.moveTo(X, Y + ch / 2); S.x.lineTo(X + cw, Y + ch / 2); S.x.stroke(); S.x.setLineDash([]); S.x.fillStyle = v.ink; S.x.textAlign = "center"; S.x.font = "56px '" + f.display + "', serif"; S.x.fillText(nm || "Guest name", X + cw / 2, Y + ch * 0.78); S.x.strokeStyle = v.accent; S.x.beginPath(); S.x.moveTo(X + cw * 0.35, Y + ch * 0.86); S.x.lineTo(X + cw * 0.65, Y + ch * 0.86); S.x.stroke(); } pages.push({ name: "Place cards", url: done(S) }); }
  // thank-you cards (4 per page)
  { const S = page(o.paper); const cw = (S.W - 160) / 2, ch = (S.H - 160) / 2; for (let i = 0; i < 4; i++) { const X = 80 + (i % 2) * cw, Y = 80 + Math.floor(i / 2) * ch; S.x.fillStyle = v.paper; S.x.fillRect(X, Y, cw, ch); S.x.strokeStyle = v.accent; S.x.lineWidth = 3; S.x.strokeRect(X + 20, Y + 20, cw - 40, ch - 40); S.x.fillStyle = v.ink; S.x.textAlign = "center"; S.x.font = "70px '" + f.display + "', serif"; S.x.fillText("Thank you", X + cw / 2, Y + ch / 2); S.x.font = "28px '" + f.body + "', serif"; S.x.fillText(String(o.title || "").slice(0, 34), X + cw / 2, Y + ch / 2 + 60); } pages.push({ name: "Thank-you cards", url: done(S) }); }
  return pages;
}
export async function tradingCards(chars, srcs, o) {
  const S = page(o.paper); const cw = (S.W - 120) / 3, ch = (S.H - 120) / 3;
  for (let i = 0; i < 9; i++) { const c = chars[i % chars.length] || {}; const X = 60 + (i % 3) * cw, Y = 60 + Math.floor(i / 3) * ch; S.x.fillStyle = "#1b1b24"; S.x.fillRect(X + 8, Y + 8, cw - 16, ch - 16); S.x.strokeStyle = "#E8C060"; S.x.lineWidth = 6; S.x.strokeRect(X + 14, Y + 14, cw - 28, ch - 28);
    const src = srcs[i % srcs.length]; if (src) { const im = await load(src); const iw = cw - 60, ih = ch * 0.5; const sc = Math.max(iw / im.naturalWidth, ih / im.naturalHeight); S.x.save(); S.x.beginPath(); S.x.rect(X + 30, Y + 80, iw, ih); S.x.clip(); S.x.drawImage(im, X + 30 + iw / 2 - im.naturalWidth * sc / 2, Y + 80 + ih / 2 - im.naturalHeight * sc / 2, im.naturalWidth * sc, im.naturalHeight * sc); S.x.restore(); }
    S.x.fillStyle = "#fff"; S.x.textAlign = "left"; S.x.font = "bold 34px Georgia, serif"; S.x.fillText(String(c.name || "Hero").slice(0, 18), X + 30, Y + 62); S.x.font = "24px Arial"; const st = c.stats || {}; Object.entries(st).slice(0, 3).forEach(([k, val], j) => S.x.fillText(k.toUpperCase() + " " + val, X + 30 + j * ((cw - 60) / 3), Y + 80 + ch * 0.5 + 40)); S.x.font = "22px Georgia, serif"; wrapText(S.x, c.ability || "", cw - 60).slice(0, 4).forEach((l, j) => S.x.fillText(l, X + 30, Y + 80 + ch * 0.5 + 80 + j * 28)); }
  return [{ name: "Trading cards", url: done(S) }];
}
export function boardGame(g, o) {
  const N = Math.max(20, Math.min(60, (g.spaces || []).length || 40)); const S = page(o.paper); header(S.x, S.W, g.name || "Board game", "For " + (g.players || "2-4") + " players"); const cols = 8, rows = Math.ceil(N / cols); const cs = Math.min((S.W - 200) / cols, (S.H - 420) / rows); const ox = (S.W - cs * cols) / 2, oy = 300;
  for (let i = 0; i < N; i++) { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; const X = ox + c * cs, Y = oy + (rows - 1 - r) * cs; const sp = (g.spaces || [])[i] || ""; S.x.fillStyle = sp ? "#fff4d6" : "#fff"; S.x.fillRect(X, Y, cs, cs); S.x.strokeStyle = "#111"; S.x.lineWidth = 2; S.x.strokeRect(X, Y, cs, cs); S.x.fillStyle = "#111"; S.x.font = "bold 26px Arial"; S.x.textAlign = "left"; S.x.fillText(i === 0 ? "START" : i === N - 1 ? "END" : String(i + 1), X + 8, Y + 30); S.x.font = "18px Arial"; wrapText(S.x, sp, cs - 16).slice(0, 4).forEach((l, k) => S.x.fillText(l, X + 8, Y + 58 + k * 22)); }
  const R2 = page(o.paper); header(R2.x, R2.W, (g.name || "Board game") + " - rules", ""); R2.x.fillStyle = "#111"; R2.x.font = "30px Georgia, serif"; R2.x.textAlign = "left"; let y = 300; for (const para of String(g.rules || "").split(/\n+/)) { for (const l of wrapText(R2.x, para, R2.W - 220)) { R2.x.fillText(l, 110, y); y += 40; } y += 16; }
  const C = page(o.paper); const cw = (C.W - 160) / 3, ch = (C.H - 160) / 4; (g.cards || []).slice(0, 12).forEach((t, i) => { const X = 80 + (i % 3) * cw, Y = 80 + Math.floor(i / 3) * ch; C.x.setLineDash([10, 8]); C.x.strokeStyle = "#bbb"; C.x.strokeRect(X, Y, cw, ch); C.x.setLineDash([]); C.x.fillStyle = "#111"; C.x.textAlign = "center"; C.x.font = "28px Georgia, serif"; const ls = wrapText(C.x, t, cw - 50); ls.slice(0, 6).forEach((l, k) => C.x.fillText(l, X + cw / 2, Y + ch / 2 - (ls.length - 1) * 18 + k * 36)); });
  return [{ name: "Board", url: done(S) }, { name: "Rules", url: done(R2) }, { name: "Cards", url: done(C) }];
}

// ── what the AI writes for the word-based ones ──
export const PRINT_AI = {
  wordsearch: (t) => ["Return ONLY a JSON array of 14 single words (letters only, 3-12 letters, no spaces) about the topic. No commentary.", "Topic: " + t],
  crossword: (t) => ["Return ONLY JSON: an array of 12 objects {\"word\":\"ONEWORD\",\"clue\":\"a short clue\"} about the topic. Words: letters only, 3-11 letters, no spaces. Clues fit the level of a curious adult unless the topic says kids.", "Topic: " + t],
  flash: (t) => ["Return ONLY JSON: an array of 16 objects {\"q\":\"question or term\",\"a\":\"short answer\"} for studying the topic. Keep each under 140 characters and correct.", "Topic: " + t],
  trading: (t) => ["Return ONLY JSON: an array of 9 ORIGINAL characters for trading cards {\"name\":\"\",\"look\":\"what they look like, for an illustrator\",\"stats\":{\"power\":1-10,\"speed\":1-10,\"wits\":1-10},\"ability\":\"one sentence\"}. Never use characters from existing franchises.", "Theme: " + t],
  boardgame: (t) => ["Design an ORIGINAL simple print-and-play race board game. Return ONLY JSON {\"name\":\"\",\"players\":\"2-4\",\"rules\":\"setup, how to move (one six-sided die), what special spaces and cards do, how to win - in short paragraphs separated by \\n\",\"spaces\":[40 strings: mostly \"\" for plain spaces, about 12 short special-space texts like \"Go forward 2\" or \"Draw a card\"],\"cards\":[12 short card texts]}.", "Theme: " + t],
  event: (t) => ["Return ONLY JSON {\"title\":\"the event title for the cards\",\"menu\":[{\"name\":\"dish\",\"note\":\"short description\"} x6],\"names\":[]} for this event. Put any guest names the person gave into names.", "Event: " + t],
};
export function readJson(text) { try { const m = String(text || "").match(/[[{][\s\S]*[\]}]/); return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } }

export const PRINT_PROMPT = {
  dots: (s) => "solid black silhouette of " + s + ", one simple shape, side view, pure white background, no details inside, no ground",
  jigsaw: (s) => "a richly detailed colourful illustration of " + s + ", full frame",
  stitch: (s) => "simple flat illustration of " + s + ", bold shapes, few colours, plain white background, centred",
  knit: (s) => "simple flat illustration of " + s + ", bold shapes, few colours, plain light background, centred",
  mosaic: (s) => "simple bold flat illustration of " + s + ", high contrast, few colours, plain background, centred",
  stickers: (s) => "cute die-cut sticker of " + s + ", thick white border, flat colours, plain background",
  poster: (s) => "stunning poster art of " + s + ", dramatic composition, rich colour",
  card: (s) => "a beautiful greeting card illustration for " + s + ", soft, elegant, no text",
  papercraft: (s) => "square illustration of " + s + ", bright, centred",
  trading: (s) => "trading card character art: " + s + ", dynamic pose, vivid background",
};

export function PrintStudio({ initial, pullImage, askAI, onClose, gate }) {
  const [kind, setKind] = useState((initial && initial.kind) || "maze"); const [text, setText] = useState((initial && initial.subject) || "");
  const [level, setLevel] = useState("medium"); const [paper, setPaper] = useState(/en-US|en-CA|es-MX/.test(navigator.language || "") ? "letter" : "a4"); const [look, setLook] = useState("wedding");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(""); const [pages, setPages] = useState([]); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const K = PRINT_KINDS.find((k) => k.key === kind) || PRINT_KINDS[0];
  const ai = async (k) => { const [sys, u] = PRINT_AI[k](text); const r = await askAI(sys, u); const j = readJson(r); if (!j) throw new Error("The words couldn't be written just now - try again."); return j; };
  const pic = async (p) => { const s = await pullImage(p, false); if (!s) throw new Error("The picture couldn't be painted just now - try again in a moment."); return s; };
  const go = async () => {
    setErr(""); setMsg(""); setPages([]); const o = { level, paper, title: text.slice(0, 40), seed: Math.floor(Math.random() * 1e9) };
    if (gate) { const stop = await gate("printable", 1); if (stop) { setErr(stop); return; } }
    try {
      let out = [];
      if (kind === "maze") { setBusy("Carving the maze..."); out = maze(o); }
      else if (kind === "wordsearch") { setBusy("Choosing the words..."); const words = /,/.test(text) ? text.split(",").map((s) => s.trim()) : await ai("wordsearch"); setBusy("Hiding them..."); out = wordSearch({ ...o, words, title: /,/.test(text) ? "Word search" : o.title }); }
      else if (kind === "crossword") { setBusy("Writing the clues..."); out = crossword({ ...o, clues: await ai("crossword") }); }
      else if (kind === "flash") { setBusy("Writing the cards..."); out = flashcards(await ai("flash"), o); }
      else if (kind === "worksheet") { setBusy("Making the sheet..."); out = worksheet({ ...o, topic: text }); }
      else if (kind === "event") { setBusy("Laying out your pieces..."); const j = await ai("event"); out = await eventPieces({ ...o, look, title: j.title || text, menu: j.menu || [], names: (j.names || []).concat(text.split(/[,;\n]/).filter((s) => /^[A-Z][a-z]+ ?[A-Z]?[a-z]*$/.test(s.trim())).map((s) => s.trim())) }); }
      else if (kind === "boardgame") { setBusy("Designing the game..."); out = boardGame(await ai("boardgame"), o); }
      else if (kind === "trading") { setBusy("Inventing the characters..."); const chars = (await ai("trading")).slice(0, 9); const srcs = []; for (let i = 0; i < Math.min(3, chars.length); i++) { setBusy("Painting character " + (i + 1) + " of 3..."); srcs.push(await pic(PRINT_PROMPT.trading(chars[i].look || chars[i].name))); } out = await tradingCards(chars.map((c, i) => c), chars.map((_, i) => srcs[i % srcs.length]), o); }
      else if (kind === "stickers" || kind === "papercraft") { const srcs = []; const n = kind === "stickers" ? 4 : 3; for (let i = 0; i < n; i++) { setBusy("Painting picture " + (i + 1) + " of " + n + "..."); srcs.push(await pic(PRINT_PROMPT[kind](text + (i ? ", variation " + (i + 1) : "")))); } setBusy("Laying out..."); out = kind === "stickers" ? await stickerSheet(srcs, o) : await papercraft(srcs, o); }
      else { setBusy("Painting the picture..."); const src = await pic(PRINT_PROMPT[kind](text)); setBusy("Making the page...");
        if (kind === "dots") out = await dots(src, o); else if (kind === "jigsaw") out = await jigsaw(src, o); else if (kind === "poster") out = await poster(src, { ...o, caption: message }); else if (kind === "card") out = await greetingCard(src, { ...o, message: message || "Thinking of you." }); else out = await gridChart(src, o, kind); }
      setPages(out);
    } catch (e) { setErr(String((e && e.message) || "That couldn't be made just now.")); }
    setBusy("");
  };
  const urls = pages.map((p) => p.url); const keyless = pages.filter((p) => !/Answer/.test(p.name)).map((p) => p.url);
  return (
    <div className="col16" role="dialog" aria-label="Printables">
      <div className="col16-top"><b>{"\uD83D\uDDA8"} Make something to print</b><button onClick={onClose} aria-label="Close">{"\u2715"}</button></div>
      <div className="col16-body">
        <div className="pr17-kinds">{PRINT_KINDS.map((k) => <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => { setKind(k.key); setPages([]); }}><b>{k.name}</b><span>{k.d}</span></button>)}</div>
        {kind !== "maze" && <input className="col16-in" value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder={K.needs === "topic" ? (kind === "worksheet" ? "e.g. multiplication, or handwriting \"Maya\"" : kind === "wordsearch" ? "a topic, or your own words separated by commas" : "a topic, e.g. the solar system") : K.needs === "event" ? "the event, and guest names separated by commas" : K.needs === "occasion" ? "who it's for and the occasion" : "what should it be?"} />}
        {kind === "maze" && <input className="col16-in" value={text} onChange={(e) => setText(e.target.value.slice(0, 60))} placeholder="a title (optional)" />}
        {(kind === "card" || kind === "poster") && <textarea className="col16-in" style={{ marginTop: 8 }} rows={2} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 400))} placeholder={kind === "card" ? "the message inside" : "a caption (optional)"} />}
        {kind === "event" && <div className="col16-row"><span>Look</span>{SHELLS.map((s) => <button key={s.key} className={look === s.key ? "on" : ""} onClick={() => setLook(s.key)}>{s.emoji} {s.name}</button>)}</div>}
        {["maze", "wordsearch", "dots", "jigsaw", "stitch", "knit", "mosaic", "worksheet"].includes(kind) && <div className="col16-row"><span>Level</span>{["easy", "medium", "hard"].map((l) => <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l[0].toUpperCase() + l.slice(1)}</button>)}</div>}
        <div className="col16-row"><span>Paper</span>{[["letter", "Letter"], ["a4", "A4"]].map(([k, l]) => <button key={k} className={paper === k ? "on" : ""} onClick={() => setPaper(k)}>{l}</button>)}</div>
        <button className="col16-go" disabled={!!busy || (kind !== "maze" && kind !== "worksheet" && !text.trim())} onClick={go}>{busy || "Make it"}</button>
        {err && <div className="col16-err">{err}</div>}
        {pages.length > 0 && <>
          <div className="col16-pages">{pages.map((p, i) => <figure key={i}><img src={p.url} alt={p.name} /><figcaption>{p.name}</figcaption></figure>)}</div>
          <div className="col16-row">
            <button className="pri" onClick={() => printPages(keyless.length ? keyless : urls)}>{"\uD83D\uDDA8"} Print</button>
            {keyless.length < urls.length && <button onClick={() => printPages(urls)}>Print with answer keys</button>}
            <button onClick={async () => { const r = await sharePages(urls, (text || kind).replace(/[^\w -]/g, "").slice(0, 30)); setMsg(r === "shared" ? "Sent." : r === "saved" ? "Saved - open it and print from there." : ""); }}>{"\u2B07"} Save or send</button>
          </div>
          <div className="col16-hint">{kind === "card" ? "Print the outside, turn the paper over and print the inside on the back, then fold in half. " : kind === "flash" ? "Print fronts, then backs on the other side of the same sheet. " : ""}Print goes to any printer your phone can reach (AirPrint on iPhone).</div>
          {msg && <div className="col16-hint">{msg}</div>}
        </>}
      </div>
    </div>
  );
}
export const PRINT_CSS = `.pr17-kinds{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:4px 0 12px}.pr17-kinds button{text-align:left;border:1px solid var(--stone,#ddd);background:var(--panel,#fff);border-radius:12px;padding:9px;font:inherit;color:inherit}.pr17-kinds button.on{outline:2px solid #E8C060}.pr17-kinds b{display:block;font-size:13px}.pr17-kinds span{display:block;font-size:11px;opacity:.7;margin-top:2px}`;

export const PRINT_RE = /\b(maze|mazes|word ?search|crossword|dot[\s-]*to[\s-]*dot|connect the dots|jigsaw|cross[\s-]*stitch|knitting chart|brick mosaic|lego mosaic|sticker sheet|stickers to print|greeting card|birthday card to print|poster to print|printable poster|flash ?cards|worksheet|place cards|menu cards?|thank[\s-]*you cards|trading cards|print[\s-]*and[\s-]*play|papercraft|photo cube)\b/i;
export function printIntent(q) {
  const t = String(q || ""); const m = t.match(PRINT_RE); if (!m) return null; if (/^(what|why|how|who|where|when)\b/i.test(t)) return null;
  const w = m[0].toLowerCase(); const kind = /maze/.test(w) ? "maze" : /word ?search/.test(w) ? "wordsearch" : /crossword/.test(w) ? "crossword" : /dot|connect/.test(w) ? "dots" : /jigsaw/.test(w) ? "jigsaw" : /stitch/.test(w) ? "stitch" : /knit/.test(w) ? "knit" : /mosaic/.test(w) ? "mosaic" : /sticker/.test(w) ? "stickers" : /card/.test(w) && /greeting|birthday/.test(w) ? "card" : /poster/.test(w) ? "poster" : /flash/.test(w) ? "flash" : /worksheet/.test(w) ? "worksheet" : /place|menu|thank/.test(w) ? "event" : /trading/.test(w) ? "trading" : /play/.test(w) ? "boardgame" : "papercraft";
  let subject = t.replace(new RegExp(PRINT_RE.source, "gi"), " ").replace(/\s+/g, " ").trim();
  for (let k = 0; k < 4; k++) subject = subject.replace(/^(please\s+)?(make|create|draw|give me|design|print|i (want|need)|can you make)\s+(me\s+|us\s+)?/i, "").replace(/^(a|an|the|some|my)\s+/i, "").replace(/^(page|pages|sheet|sheets|set)\b\s*/i, "").replace(/^(of|with|for|about|on)\s+/i, "").trim();
  return { kind: "print", print: { kind, subject: subject.slice(0, 200) } };
}
