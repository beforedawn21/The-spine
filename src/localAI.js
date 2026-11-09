// ════════════════════════════════════════════════════════════════════════════
//  THE SPINE · ON-DEVICE TOOLS (batch 14)
//  Everything here runs on the person's own phone: free, private, no key, and it
//  keeps working offline once loaded. The heavy files are copied from npm at build
//  time into /ai/ (see copy-engines.mjs) - nothing large is ever uploaded by hand.
//    speech -> text   Moonshine tiny (English, MIT)
//    page   -> text   Tesseract (Apache-2.0), English
//    hum    -> notes  Basic Pitch by Spotify (Apache-2.0)
// ════════════════════════════════════════════════════════════════════════════

const AI = "/ai/";

// ── audio helpers ──
async function bytesOf(src) {
  if (src instanceof ArrayBuffer) return src;
  if (src instanceof Blob) return await src.arrayBuffer();
  const r = await fetch(src); if (!r.ok) throw new Error("Couldn't open that recording.");
  return await r.arrayBuffer();
}
// Decode anything the browser can play (voice note, mp3, a video's sound) and resample it to
// one channel at the rate a model expects.
export async function decodeMono(src, rate) {
  const buf = await bytesOf(src);
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  let dec; try { dec = await ac.decodeAudioData(buf.slice(0)); } finally { try { ac.close(); } catch (e) {} }
  const len = Math.max(1, Math.ceil(dec.duration * rate));
  const off = new OfflineAudioContext(1, len, rate); const s = off.createBufferSource();
  s.buffer = dec; s.connect(off.destination); s.start();
  return await off.startRendering();
}

// Where people are talking: 30 ms frames, a threshold that adapts to the recording, short gaps
// bridged, and long stretches split at their quietest point so every piece stays short.
export function speechSegments(x, rate, opts) {
  const o = Object.assign({ frame: 0.03, minSpeech: 0.25, bridge: 0.35, maxLen: 12, pad: 0.12 }, opts || {});
  const fl = Math.max(1, Math.round(o.frame * rate)), n = Math.floor(x.length / fl); if (!n) return [];
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * fl, k = j + fl; j < k; j++) s += x[j] * x[j]; e[i] = Math.sqrt(s / fl); }
  const sorted = Array.from(e).sort((a, b) => a - b); const floor = sorted[Math.floor(n * 0.15)] || 0, peak = sorted[Math.floor(n * 0.98)] || 0;
  const thr = Math.max(0.006, floor + (peak - floor) * 0.12);
  let segs = []; let st = -1;
  for (let i = 0; i <= n; i++) { const on = i < n && e[i] > thr; if (on && st < 0) st = i; if (!on && st >= 0) { segs.push([st, i]); st = -1; } }
  const br = Math.round(o.bridge / o.frame); const merged = [];
  for (const s of segs) { const l = merged[merged.length - 1]; if (l && s[0] - l[1] <= br) l[1] = s[1]; else merged.push(s.slice()); }
  const out = []; const maxF = Math.round(o.maxLen / o.frame);
  const split = (a, b) => {
    if (b - a <= maxF) { out.push([a, b]); return; }
    let lo = a + Math.round(maxF * 0.5), best = lo; for (let i = lo; i < a + maxF; i++) if (e[i] < e[best]) best = i;
    out.push([a, best]); split(best, b);
  };
  for (const s of merged) if ((s[1] - s[0]) * o.frame >= o.minSpeech) split(s[0], s[1]);
  return out.map(([a, b]) => ({ start: Math.max(0, a * o.frame - o.pad), end: Math.min(x.length / rate, b * o.frame + o.pad) }));
}

// ── speech -> text (Moonshine) ──
let msModel = null;
export async function speechModel() {
  if (msModel && msModel.isLoaded()) return msModel;
  const M = await import("@moonshine-ai/moonshine-js");
  M.Settings.BASE_ASSET_PATH.MOONSHINE = location.origin + AI + "moonshine/";
  M.Settings.BASE_ASSET_PATH.ONNX_RUNTIME = location.origin + AI + "ort/";
  if (!msModel) msModel = new M.MoonshineModel("model/tiny", "quantized");
  await msModel.loadModel(); return msModel;
}
// Returns { text, segments:[{start,end,text}], onDevice:true }. English only.
export async function transcribeOnDevice(src, onProgress) {
  const say = (t, f) => { try { onProgress && onProgress(t, f); } catch (e) {} };
  say("Getting the on-phone listener ready (first time only)...", 0.02);
  const model = await speechModel();
  say("Listening to the recording...", 0.1);
  const audio = (await decodeMono(src, 16000)).getChannelData(0);
  const segs = speechSegments(audio, 16000);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]; const piece = audio.slice(Math.floor(s.start * 16000), Math.ceil(s.end * 16000));
    let t = ""; try { t = String(await model.generate(piece) || "").replace(/\s+/g, " ").trim(); } catch (e) { t = ""; }
    if (t) out.push({ start: +s.start.toFixed(2), end: +s.end.toFixed(2), text: t });
    say("Writing it down... " + (i + 1) + " of " + segs.length, 0.1 + 0.9 * (i + 1) / Math.max(1, segs.length));
  }
  return { text: out.map((s) => s.text).join(" "), segments: out, onDevice: true };
}

// ── photo of a page -> text (Tesseract) ──
let ocrWorker = null;
export async function readPage(src, onProgress) {
  const T = await import("tesseract.js");
  if (!ocrWorker) {
    ocrWorker = await T.createWorker("eng", 1, {
      workerPath: AI + "tesseract/worker.min.js", corePath: AI + "tesseract/", langPath: AI + "tesseract/lang", gzip: true,
      logger: (m) => { try { onProgress && m && m.status && onProgress(m.status, m.progress || 0); } catch (e) {} },
    });
  }
  const r = await ocrWorker.recognize(src);
  const text = String(r && r.data && r.data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, confidence: Math.round(r && r.data && r.data.confidence || 0) };
}
export async function closeReader() { try { if (ocrWorker) await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }

// ── hum -> notes (Basic Pitch) ──
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// A hum is one voice: where notes overlap keep the louder, drop blips, merge repeats.
export function cleanMelody(notes) {
  const ns = notes.filter((n) => n.durationSeconds >= 0.09).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const out = [];
  for (const n of ns) {
    const l = out[out.length - 1];
    if (l && n.startTimeSeconds < l.startTimeSeconds + l.durationSeconds - 0.04) { if ((n.amplitude || 0) > (l.amplitude || 0)) out[out.length - 1] = n; continue; }
    if (l && l.pitchMidi === n.pitchMidi && n.startTimeSeconds - (l.startTimeSeconds + l.durationSeconds) < 0.06) { l.durationSeconds = n.startTimeSeconds + n.durationSeconds - l.startTimeSeconds; continue; }
    out.push(Object.assign({}, n));
  }
  return out.map((n) => ({ midi: n.pitchMidi, name: noteName(n.pitchMidi), start: +n.startTimeSeconds.toFixed(3), dur: +n.durationSeconds.toFixed(3), vel: Math.max(0.2, Math.min(1, n.amplitude || 0.7)) }));
}
let bpModel = null;
export async function humToNotes(src, onProgress) {
  const BP = await import("@spotify/basic-pitch");
  const buf = await decodeMono(src, 22050);
  if (!bpModel) bpModel = new BP.BasicPitch(AI + "basic-pitch/model.json");
  const frames = [], onsets = [], contours = [];
  await bpModel.evaluateModel(buf, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, (p) => { try { onProgress && onProgress(p); } catch (e) {} });
  const raw = BP.noteFramesToTime(BP.addPitchBendsToNoteEvents(contours, BP.outputToNotesPoly(frames, onsets, 0.3, 0.3, 6)));
  return cleanMelody(raw);
}

// A standard MIDI file (type 0, one track) any music app opens.
export function notesToMidi(notes, bpm) {
  const tpq = 480, tempo = Math.round(60000000 / (bpm || 120)), sec2tick = (s) => Math.round(s * (bpm || 120) / 60 * tpq);
  const ev = [];
  for (const n of notes) { const on = sec2tick(n.start), off = sec2tick(n.start + n.dur); const v = Math.round(30 + 97 * (n.vel || 0.7)); ev.push([on, 1, n.midi, v]); ev.push([Math.max(on + 1, off), 0, n.midi, 0]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const vlq = (v) => { const b = [v & 0x7f]; v >>= 7; while (v) { b.unshift((v & 0x7f) | 0x80); v >>= 7; } return b; };
  const trk = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xc0, 0];
  let t = 0; for (const [tk, on, m, v] of ev) { trk.push(...vlq(tk - t), on ? 0x90 : 0x80, m & 127, v & 127); t = tk; }
  trk.push(0, 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (tpq >> 8) & 255, tpq & 255];
  const tl = trk.length, tHead = [0x4d, 0x54, 0x72, 0x6b, (tl >>> 24) & 255, (tl >> 16) & 255, (tl >> 8) & 255, tl & 255];
  return new Uint8Array([...head, ...tHead, ...trk]);
}
// Play notes back with a soft built-in synth so she hears what was caught.
export function playNotes(notes) {
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); const t0 = ac.currentTime + 0.05;
  for (const n of notes) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = 440 * Math.pow(2, (n.midi - 69) / 12);
    const a = t0 + n.start, b = a + Math.max(0.08, n.dur); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.25 * (n.vel || 0.7), a + 0.02); g.gain.setTargetAtTime(0, b - 0.03, 0.04);
    o.connect(g).connect(ac.destination); o.start(a); o.stop(b + 0.2);
  }
  const end = notes.length ? notes[notes.length - 1].start + notes[notes.length - 1].dur : 0; setTimeout(() => { try { ac.close(); } catch (e) {} }, (end + 1) * 1000);
  return ac;
}

// ── iPhone haptics ──
// iPhones ignore navigator.vibrate. Safari (17.4+) does play the system tap when a switch-style
// checkbox is toggled, so a hidden one is toggled through its label. Android keeps vibrate.
let hapEl = null;
export function tap(pattern) {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios && navigator.vibrate) { navigator.vibrate(pattern || 12); return "vibrate"; }
    if (!hapEl) {
      const id = "__spineTap"; const inp = document.createElement("input"); inp.type = "checkbox"; inp.id = id; inp.setAttribute("switch", "");
      const lab = document.createElement("label"); lab.htmlFor = id;
      const box = document.createElement("div"); box.setAttribute("aria-hidden", "true"); box.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      box.appendChild(inp); box.appendChild(lab); box.addEventListener("click", (e) => e.stopPropagation()); document.body.appendChild(box); hapEl = lab;
    }
    const n = Array.isArray(pattern) ? Math.min(3, Math.ceil(pattern.length / 2)) : 1;
    for (let i = 0; i < n; i++) setTimeout(() => { try { hapEl.click(); } catch (e) {} }, i * 90);
    return "switch";
  } catch (e) { return "none"; }
}

// ── print-ready documents (Paged.js) ──
// A real book layout in the browser: a title page, a contents page with page numbers, the title
// at the top of every page and "page 3 of 9" at the bottom. Then the phone's own Print / Save as
// PDF sheet opens. No service, no key.
export function bookHtml(title, bodyHtml, opts) {
  const o = Object.assign({ date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), autoPrint: true }, opts || {});
  const esc = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + esc(title) + "</title><style>"
    + "@page{size:A4;margin:22mm 18mm 20mm;@top-center{content:string(doctitle);font:10px Georgia,serif;color:#888}@bottom-center{content:'Page ' counter(page) ' of ' counter(pages);font:10px -apple-system,system-ui,sans-serif;color:#888}}"
    + "@page:first{@top-center{content:none}@bottom-center{content:none}}"
    + "body{font:11.5pt/1.6 Georgia,'Times New Roman',serif;color:#1a1a1a}h1,h2,h3{font-family:-apple-system,system-ui,sans-serif;line-height:1.25;break-after:avoid}"
    + "h2{font-size:16pt;margin:1.4em 0 .4em}h3{font-size:13pt;margin:1.1em 0 .3em}p,li{orphans:3;widows:3}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px}img{max-width:100%}"
    + ".cover{height:230mm;display:flex;flex-direction:column;justify-content:center;break-after:page}.cover h1{font-size:30pt;margin:0 0 10px;string-set:doctitle content(text)}.cover .d{color:#777;font:12pt -apple-system,system-ui,sans-serif}"
    + ".toc{break-after:page}.toc h2{margin-top:0}.toc ol{list-style:none;padding:0}.toc li{display:flex;gap:6px;margin:5px 0}.toc li.l3{padding-left:16px;font-size:.95em}.toc a{color:inherit;text-decoration:none;flex:1;display:flex}"
    + ".toc a::after{content:target-counter(attr(href),page);margin-left:auto;padding-left:8px}.toc a .dots{flex:1;border-bottom:1px dotted #bbb;margin:0 6px 4px}"
    + "</style><script>(function(){document.addEventListener('DOMContentLoaded',function(){var hs=document.querySelectorAll('main h2, main h3'),ol=document.getElementById('tocl');"
    + "if(!hs.length){var t=document.querySelector('.toc');if(t)t.remove();return;}hs.forEach(function(h,i){h.id=h.id||('s'+(i+1));var li=document.createElement('li');li.className=h.tagName==='H3'?'l3':'l2';"
    + "var a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;var d=document.createElement('span');d.className='dots';a.appendChild(d);li.appendChild(a);ol.appendChild(li);});});"
    + "window.PagedConfig={auto:true,after:function(f){window.__pagedPages=document.querySelectorAll('.pagedjs_page').length;window.__pagedDone=true;" + (o.autoPrint ? "setTimeout(function(){try{window.print();}catch(e){}},400);" : "") + "}};})();</script>"
    // the layout engine is written into the page itself (fetched by The Spine first), so the book window
    // never has to load anything on its own; without it, the book still prints - just without page numbers
    + (o.engine ? "<script>" + String(o.engine).replace(/<\/script/gi, "<\\/script") + "</script>"
      : (o.autoPrint ? "<script>window.addEventListener('load',function(){window.__pagedDone=true;setTimeout(function(){try{window.print();}catch(e){}},400);});</script>" : ""))
    + "</head><body>"
    + "<section class='cover'><h1>" + esc(title) + "</h1><div class='d'>" + esc(o.date) + "</div></section>"
    + "<nav class='toc'><h2>Contents</h2><ol id='tocl'></ol></nav><main>" + String(bodyHtml || "") + "</main></body></html>";
}
let pagedCode = null;
const pagedEngine = () => (pagedCode = pagedCode || fetch(location.origin + "/ai/paged.polyfill.min.js").then((r) => (r.ok ? r.text() : "")).catch(() => "").then((t) => { if (!t) pagedCode = null; return t; }));
export function printBook(title, bodyHtml, opts) {
  // the window opens straight away (phones only allow it on the tap itself), then the book is written in
  const w = window.open("", "_blank"); if (!w) return null;
  try { w.document.open(); w.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>Preparing your book</title></head><body style='font:16px -apple-system,system-ui,sans-serif;padding:40px 24px;color:#555'>Laying out your book...</body></html>"); w.document.close(); } catch (e) {}
  pagedEngine().then((engine) => { try { if (w.closed) return; w.document.open(); w.document.write(bookHtml(title, bodyHtml, Object.assign({}, opts, { engine }))); w.document.close(); } catch (e) {} });
  return w;
}
