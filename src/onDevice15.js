// ════════════════════════════════════════════════════════════════════════════
//  THE SPINE · MORE ON-PHONE HELPERS (batch 15)
//  All free, no key, private: each one runs on the person's phone.
//    picture safety  NSFWJS (MIT)                       /ai/nsfw      before a picture goes on the Market
//    cut-out        MediaPipe Selfie Segmentation       /ai/selfie    lift a person (or a close-up subject) out of a photo
//    hands           MediaPipe Hands (Apache-2.0)        /ai/hands     play or steer with a hand
//    meaning         all-MiniLM-L6-v2 (Apache-2.0)        /ai/minilm    find things by what they mean
//    natural voice   Kokoro-82M (Apache-2.0)             jsDelivr      a human-sounding voice, offline after once
//  Everything is fetched only the first time it is used, then kept on the phone.
// ════════════════════════════════════════════════════════════════════════════
import { track } from "./usageTracker.js";

const AI = "/ai/";
const scripts = {};
function script(src) {
  if (!scripts[src]) scripts[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error("Couldn't load " + src)); }; document.head.appendChild(s); });
  return scripts[src];
}
const img = (src) => new Promise((res, rej) => { if (src && src.tagName) return res(src); const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't open that picture.")); i.src = src; });
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(buf) { return hex(await crypto.subtle.digest("SHA-256", buf)); }

// ── 1. PICTURE SAFETY ────────────────────────────────────────────────────────
let nsfwP = null;
async function nsfwModel() {
  if (!nsfwP) nsfwP = (async () => { await script(AI + "nsfw/nsfwjs.min.js"); return await window.nsfwjs.load(AI + "nsfw/mobilenet_v2/", { size: 224 }); })().catch((e) => { nsfwP = null; throw e; });
  return nsfwP;
}
// {ok:true|false|null, adult, racy}  null = couldn't check (another site's picture, or the model didn't load)
export async function checkPicture(src) {
  try {
    const [m, i] = await Promise.all([nsfwModel(), img(src)]);
    const c = document.createElement("canvas"); const k = Math.min(1, 512 / Math.max(i.naturalWidth || i.width, i.naturalHeight || i.height));
    c.width = Math.max(1, Math.round((i.naturalWidth || i.width) * k)); c.height = Math.max(1, Math.round((i.naturalHeight || i.height) * k)); c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
    c.getContext("2d").getImageData(0, 0, 1, 1);                         // throws now if the picture is from a site that doesn't allow reading it
    const p = {}; (await m.classify(c)).forEach((r) => (p[r.className] = r.probability));
    const adult = (p.Porn || 0) + (p.Hentai || 0), racy = p.Sexy || 0;
    return { ok: !(adult >= 0.6), adult, racy, scores: p };
  } catch (e) { return { ok: null, error: e.message }; }
}
// the pictures inside something about to be published: pasted-in pictures first, then linked ones
export function picturesIn(text) {
  const s = String(text || ""); const out = [];
  (s.match(/data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]{200,}/g) || []).forEach((u) => out.push(u));
  (s.match(/<img[^>]+src=["'](https:\/\/[^"']+)["']/gi) || []).forEach((t) => { const m = /src=["']([^"']+)/i.exec(t); if (m) out.push(m[1]); });
  return Array.from(new Set(out)).slice(0, 8);
}
// Before the Market: {blocked, checked, skipped, reason}. If nothing can be checked it is not blocked -
// the report button and the owner's review still stand behind it.
export async function marketPictureCheck(text) {
  const pics = picturesIn(text); let checked = 0, skipped = 0;
  for (const p of pics) {
    const r = await checkPicture(p);
    if (r.ok === null) { skipped++; continue; }
    checked++;
    if (r.ok === false) { track("Safety · Market picture stopped"); return { blocked: true, checked, skipped, reason: "One of the pictures in it looks like adult content, so it can't go on the Market. Swap that picture and try again." }; }
  }
  if (checked) track("Safety · Market pictures checked");
  return { blocked: false, checked, skipped };
}

// ── 2. PERSON CUT-OUT ────────────────────────────────────────────────────────
let segP = null;
async function segmenter() {
  if (!segP) segP = (async () => {
    await script(AI + "selfie/selfie_segmentation.js");
    const S = new window.SelfieSegmentation({ locateFile: (f) => AI + "selfie/" + f });
    S.setOptions({ modelSelection: 0, selfieMode: false });
    await S.initialize(); return S;
  })().catch((e) => { segP = null; throw e; });
  return segP;
}
// A see-through PNG with only the person (people) kept - it also lifts out a single close-up subject, like a
// cup on a table; it finds nothing in a wide scene. {src, kept} - kept is the share of the picture kept.
export async function cutoutPerson(src) {
  const [S, i] = await Promise.all([segmenter(), img(src)]);
  const W = i.naturalWidth || i.width, H = i.naturalHeight || i.height;
  const mask = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("The cut-out took too long.")), 30000); S.onResults((r) => { clearTimeout(t); res(r.segmentationMask); }); S.send({ image: i }).catch(rej); });
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.drawImage(mask, 0, 0, W, H);
  const m = x.getImageData(0, 0, W, H).data;                             // the person is where the mask is bright
  x.clearRect(0, 0, W, H); x.drawImage(i, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H); let kept = 0;
  for (let k = 0; k < W * H; k++) { const a = Math.max(m[k * 4], m[k * 4 + 3] < 255 ? m[k * 4 + 3] : 0); const v = a < 60 ? 0 : a > 200 ? 255 : Math.round((a - 60) * 255 / 140); d.data[k * 4 + 3] = v; if (v > 128) kept++; }
  x.putImageData(d, 0, 0); track("AI · Person cut out");
  return { src: c.toDataURL("image/png"), kept: kept / (W * H) };
}

// ── 3. HANDS ─────────────────────────────────────────────────────────────────
// Which gesture 21 hand points make. x,y are where the index finger points (0..1, mirrored like a selfie).
export function classifyHand(lm) {
  if (!lm || lm.length < 21) return null;
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const size = d(0, 9) || 1e-6;
  const up = (tip, pip) => d(tip, 0) > d(pip, 0) * 1.12;                  // a finger is out when its tip is further from the wrist than its middle joint
  const f = { index: up(8, 6), middle: up(12, 10), ring: up(16, 14), pinky: up(20, 18) };
  const thumb = d(4, 17) > d(3, 17) * 1.05;
  // a pinch is thumb and index tips touching with the index reaching out - in a fist they touch too, but curled into the palm
  const pinch = d(4, 8) / size < 0.35 && d(8, 0) > d(5, 0) * 1.15;
  const n = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
  let g = "open";
  if (pinch && !f.middle) g = "pinch";
  else if (n === 0 && !thumb) g = "fist";
  else if (n === 0 && thumb) g = (lm[4].y < lm[0].y - size * 0.4) ? "thumbs-up" : "fist";
  else if (f.index && !f.middle && !f.ring && !f.pinky) g = "point";
  else if (f.index && f.middle && !f.ring && !f.pinky) g = "peace";
  else if (n >= 4) g = "open";
  else g = "other";
  return { gesture: g, x: 1 - lm[8].x, y: lm[8].y, pinch: Math.max(0, Math.min(1, 1 - d(4, 8) / size / 0.8)) };
}
let handsP = null;
async function handsModel() {
  if (!handsP) handsP = (async () => {
    await script(AI + "hands/hands.js");
    const Hn = new window.Hands({ locateFile: (f) => AI + "hands/" + f });
    Hn.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
    await Hn.initialize(); return Hn;
  })().catch((e) => { handsP = null; throw e; });
  return handsP;
}
// Watch the front camera and call onHand({gesture,x,y,pinch}) about 15 times a second.
// Returns {stop, video}. The camera is switched off by stop() and whenever the page is hidden.
export async function startHands(onHand, opts) {
  const o = Object.assign({ fps: 15, video: null }, opts || {});
  const Hn = await handsModel();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
  const v = o.video || document.createElement("video"); v.playsInline = true; v.muted = true; v.srcObject = stream; await v.play().catch(() => {});
  let on = true, last = "", busy = false;
  Hn.onResults((r) => { const lm = r.multiHandLandmarks && r.multiHandLandmarks[0]; const h = lm ? classifyHand(lm) : { gesture: "none" }; if (h.gesture !== last || h.gesture !== "none") { last = h.gesture; try { onHand(h); } catch (e) {} } });
  const tick = async () => { if (!on) return; if (!busy && v.readyState >= 2) { busy = true; try { await Hn.send({ image: v }); } catch (e) {} busy = false; } setTimeout(tick, 1000 / o.fps); };
  tick(); track("AI · Hands used");
  const stop = () => { if (!on) return; on = false; try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { v.srcObject = null; } catch (e) {} document.removeEventListener("visibilitychange", vis); };
  const vis = () => { if (document.visibilityState === "hidden") stop(); };
  document.addEventListener("visibilitychange", vis);
  return { stop, video: v };
}

// ── 4. MEANING ───────────────────────────────────────────────────────────────
let lmP = null;
export async function meaningModel(onProgress) {
  if (!lmP) lmP = (async () => {
    const say = (t) => { try { onProgress && onProgress(t); } catch (e) {} };
    say("Getting the meaning finder ready (first time only, about 50 MB)...");
    const get = async (f) => { const r = await fetch(AI + "minilm/" + f); if (!r.ok) throw new Error("The meaning finder isn't on this site yet."); return new Uint8Array(await r.arrayBuffer()); };
    const [, w, t, c, wasm] = await Promise.all([script(AI + "minilm/engine.js"), get("model.fp16.safetensors"), get("tokenizer.json"), get("config.json"), get("engine_bg.wasm")]);
    const E = window.SpineMiniLM; E.__initialize(wasm);
    return new E.Embedder(w, t, c, 256);
  })().catch((e) => { lmP = null; throw e; });
  return lmP;
}
export async function embed(texts) { const m = await meaningModel(); const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || " ").slice(0, 2000)); return m.embed(list).map((v) => Float32Array.from(v)); }
export function cosine(a, b) { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na * nb) || 1); }
// Rank anything by how close it is in meaning to the question: [{item, score}], best first.
export async function rankByMeaning(query, items, textOf, opts) {
  const o = Object.assign({ min: 0.25, top: 10 }, opts || {}); const list = (items || []).slice(0, 400); if (!list.length) return [];
  const vs = await embed([query, ...list.map((x) => (textOf ? textOf(x) : String(x)))]); const q = vs[0];
  track("AI · Search by meaning");
  return list.map((item, i) => ({ item, score: cosine(q, vs[i + 1]) })).filter((r) => r.score >= o.min).sort((a, b) => b.score - a.score).slice(0, o.top);
}

// ── 5. NATURAL VOICE (Kokoro-82M) ────────────────────────────────────────────
// The model is 92 MB, so it is not on this site: it comes once from jsDelivr's free copy of the npm
// packages below, every file's fingerprint is checked, and it is kept on the phone (works offline after).
export const VOICE_CDN = "https://cdn.jsdelivr.net/npm/";
const KOKORO = { pkg: "kokoro-q8-shards@1.0.0", parts: 6, sha: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478" };
const DICT = { path: "@met4citizen/headtts@1.3.0/dictionaries/en-us.txt", sha: "5edf7f0e8e8c49fdf5fa1d27481980d9a83edf2c9a89de5898a1a88eb215cd2e" };
export const VOICES = {
  af_heart: { name: "Heart", who: "American woman, warm", sha: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b" },
  af_bella: { name: "Bella", who: "American woman, bright", sha: "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b" },
  af_nicole: { name: "Nicole", who: "American woman, soft", sha: "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a" },
  am_michael: { name: "Michael", who: "American man, calm", sha: "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1" },
  am_fenrir: { name: "Fenrir", who: "American man, deep", sha: "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43" },
  bf_emma: { name: "Emma", who: "British woman", sha: "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73" },
  bm_george: { name: "George", who: "British man", sha: "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc" },
};
// Kokoro's phoneme -> id table (from the model's own config.json, Apache-2.0, hexgrad/Kokoro-82M).
const VOCAB = { ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6, "—": 9, "…": 10, '"': 11, "(": 12, ")": 13, "“": 14, "”": 15, " ": 16, "̃": 17, "ʣ": 18, "ʥ": 19, "ʦ": 20, "ʨ": 21, "ᵝ": 22, "ꭧ": 23, A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39, Y: 41, "ᵊ": 42, a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61, t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, "ɑ": 69, "ɐ": 70, "ɒ": 71, "æ": 72, "β": 75, "ɔ": 76, "ɕ": 77, "ç": 78, "ɖ": 80, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85, "ɛ": 86, "ɜ": 87, "ɟ": 90, "ɡ": 92, "ɥ": 99, "ɨ": 101, "ɪ": 102, "ʝ": 103, "ɯ": 110, "ɰ": 111, "ŋ": 112, "ɳ": 113, "ɲ": 114, "ɴ": 115, "ø": 116, "ɸ": 118, "θ": 119, "œ": 120, "ɹ": 123, "ɾ": 125, "ɻ": 126, "ʁ": 128, "ɽ": 129, "ʂ": 130, "ʃ": 131, "ʈ": 132, "ʧ": 133, "ʊ": 135, "ʋ": 136, "ʌ": 138, "ɣ": 139, "ɤ": 140, "χ": 142, "ʎ": 143, "ʒ": 147, "ʔ": 148, "ˈ": 156, "ˌ": 157, "ː": 158, "ʰ": 162, "ʲ": 164, "↓": 169, "→": 171, "↗": 172, "↘": 173, "ᵻ": 177 };
const MODEL_CACHE = "spine-models-v1";
async function kept(url, sha, onBytes) {
  // the phone's kept copy first; otherwise fetch, check the fingerprint, keep it
  let c = null; try { c = await caches.open(MODEL_CACHE); const m = await c.match(url); if (m) return await m.arrayBuffer(); } catch (e) { c = null; }
  const r = await fetch(url); if (!r.ok) throw new Error("Couldn't download the voice (" + r.status + ").");
  const b = await r.arrayBuffer(); try { onBytes && onBytes(b.byteLength); } catch (e) {}
  if (sha && (await sha256(b)) !== sha) throw new Error("The voice download didn't match its fingerprint, so it wasn't used.");
  try { c && (await c.put(url, new Response(b))); } catch (e) {}
  return b;
}
export async function voiceDownloaded() { try { const c = await caches.open(MODEL_CACHE); return !!(await c.match(VOICE_CDN + KOKORO.pkg + "/kokoro-q8.part" + (KOKORO.parts - 1) + ".bin")); } catch (e) { return false; } }
let kkP = null; const voiceData = {};
export async function naturalVoice(onProgress) {
  if (!kkP) kkP = (async () => {
    const base = (typeof window !== "undefined" && window.__spineVoiceCdn) || VOICE_CDN;
    let got = 0; const say = (t, f) => { try { onProgress && onProgress(t, f); } catch (e) {} };
    say("Downloading the natural voice (first time only, about 95 MB)...", 0);
    const parts = [];
    for (let i = 0; i < KOKORO.parts; i++) { parts.push(await kept(base + KOKORO.pkg + "/kokoro-q8.part" + i + ".bin", null, (n) => { got += n; say("Downloading the natural voice... " + Math.round(got / 1048576) + " MB of 92", got / 96400000); })); }
    const joined = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0)); let o = 0; parts.forEach((p) => { joined.set(new Uint8Array(p), o); o += p.byteLength; });
    say("Checking the download...", 0.96);
    if ((await sha256(joined.buffer)) !== KOKORO.sha) { try { const c = await caches.open(MODEL_CACHE); for (let i = 0; i < KOKORO.parts; i++) await c.delete(base + KOKORO.pkg + "/kokoro-q8.part" + i + ".bin"); } catch (e) {} throw new Error("The voice download didn't match its fingerprint, so it wasn't used."); }
    const dict = await kept(base + DICT.path, DICT.sha);
    const [{ Language }, ort] = await Promise.all([import("./vendor/headtts/language-en-us.mjs"), import(/* @vite-ignore */ location.origin + AI + "ort/ort.min.mjs")]);
    const O = ort.default && ort.default.InferenceSession ? ort.default : ort;
    O.env.wasm.wasmPaths = location.origin + AI + "ort/";
    O.env.wasm.numThreads = (self.crossOriginIsolated && navigator.hardwareConcurrency > 2) ? 2 : 1;
    const lang = new Language({}); await lang.loadDictionary(new Response(dict));
    say("Waking the voice up...", 0.98);
    const session = await O.InferenceSession.create(joined, { executionProviders: ["wasm"] });
    return { O, lang, session, base };
  })().catch((e) => { kkP = null; throw e; });
  return kkP;
}
function sentences(text) {
  const t = String(text || "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim(); const out = []; let cur = "";
  for (const s of t.split(/(?<=[.!?…])\s+/)) { if ((cur + " " + s).length > 220 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s; }
  if (cur) out.push(cur); return out.flatMap((s) => s.length > 300 ? s.match(/.{1,280}(\s|$)/g) : [s]);
}
// Speak text in a natural voice: returns {url (WAV), seconds}. Long text is made one sentence at a time.
export async function speakNatural(text, voice, opts) {
  const o = Object.assign({ speed: 1, onPart: null }, opts || {});
  const K = await naturalVoice(o.onProgress); const v = VOICES[voice] ? voice : "af_heart";
  if (!voiceData[v]) voiceData[v] = new Float32Array(await kept(K.base + "kokoro-js@1.2.1/voices/" + v + ".bin", VOICES[v].sha));
  const style = voiceData[v]; const chunks = [];
  for (const s of sentences(text).slice(0, 40)) {
    const { phonemes } = K.lang.generate(s); const ids = [0]; for (const ch of phonemes.join("")) { const id = VOCAB[ch]; if (id !== undefined) ids.push(id); } if (ids.length > 509) ids.length = 509; ids.push(0);
    const n = Math.min(ids.length - 2, style.length / 256 - 1);
    const out = await K.session.run({ input_ids: new K.O.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), style: new K.O.Tensor("float32", style.slice(n * 256, n * 256 + 256), [1, 256]), speed: new K.O.Tensor("float32", new Float32Array([o.speed]), [1]) });
    const w = out[K.session.outputNames[0]].data; chunks.push(w); try { o.onPart && o.onPart(chunks.length); } catch (e) {}
    chunks.push(new Float32Array(Math.round(24000 * 0.18)));             // a breath between sentences
  }
  const total = chunks.reduce((a, c) => a + c.length, 0); track("AI · Natural voice spoke");
  return { url: URL.createObjectURL(wav(chunks, total, 24000)), seconds: total / 24000 };
}
function wav(chunks, n, rate) {
  const b = new ArrayBuffer(44 + n * 2), d = new DataView(b); const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); d.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, rate, true); d.setUint32(28, rate * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, "data"); d.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) d.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))), true);
  return new Blob([b], { type: "audio/wav" });
}

// The person's choice, kept on this phone: {on, voice}
const VKEY = "spine.voice15";
export function naturalVoiceSetting() { try { const v = JSON.parse(localStorage.getItem(VKEY) || "{}") || {}; return { on: !!v.on, voice: VOICES[v.voice] ? v.voice : "af_heart" }; } catch (e) { return { on: false, voice: "af_heart" }; } }
export function setNaturalVoice(v) { try { localStorage.setItem(VKEY, JSON.stringify({ ...naturalVoiceSetting(), ...v })); } catch (e) {} }
export const naturalVoicePick = () => naturalVoiceSetting().voice;

// ── 6. THE BROWSER'S OWN AI (Chrome's built-in Gemini Nano, when the phone/computer has it) ──
// Free and on the device. Most iPhones don't have it yet, so everything here says plainly when
// it isn't there and the caller carries on another way.
export async function browserAIStatus() {
  const g = typeof window !== "undefined" ? window : {}; const out = {};
  for (const [k, api] of [["prompt", g.LanguageModel], ["summarize", g.Summarizer], ["translate", g.Translator], ["detect", g.LanguageDetector]]) {
    try { out[k] = api && api.availability ? String(await Promise.race([k === "translate" ? api.availability({ sourceLanguage: "en", targetLanguage: "es" }) : api.availability(), new Promise((r) => setTimeout(() => r("unavailable"), 3000))])) : "unavailable"; } catch (e) { out[k] = "unavailable"; }
  }
  return out;
}
const within = (p, ms, v) => Promise.race([p, new Promise((r) => setTimeout(() => r(v), ms))]);
export async function browserAI(task, text, opts) {
  const o = opts || {}; const g = window; const t = String(text || "").slice(0, 8000);
  const real = (r) => (typeof r === "string" && /^Model not available/i.test(r) ? null : r);   // test browsers carry a stand-in that only echoes
  const api = { summarize: g.Summarizer, translate: g.Translator, detect: g.LanguageDetector, prompt: g.LanguageModel }[task];
  try { const av = api && api.availability ? await within(task === "translate" ? api.availability({ sourceLanguage: o.from || "en", targetLanguage: o.to || "es" }) : api.availability(), 4000, "unavailable") : "unavailable"; if (String(av) === "unavailable") return { error: "This browser doesn't have built-in AI (it's in recent Chrome on computers and some Android phones)." }; } catch (e) { return { error: "This browser doesn't have built-in AI (it's in recent Chrome on computers and some Android phones)." }; }
  try {
    if (task === "summarize" && g.Summarizer) { const s = await g.Summarizer.create({ type: "key-points", format: "plain-text", length: "short" }); const r = real(await s.summarize(t)); if (r === null) throw new Error("stand-in"); track("AI · Browser AI used"); return { text: r }; }
    if (task === "translate" && g.Translator) { const s = await g.Translator.create({ sourceLanguage: o.from || "en", targetLanguage: o.to || "es" }); const r = real(await s.translate(t)); if (r === null) throw new Error("stand-in"); track("AI · Browser AI used"); return { text: r }; }
    if (task === "detect" && g.LanguageDetector) { const s = await g.LanguageDetector.create(); const r = await s.detect(t); return { language: r && r[0] ? r[0].detectedLanguage : null }; }
    if (task === "prompt" && g.LanguageModel) { const s = await g.LanguageModel.create(); const r = real(await s.prompt(t)); if (r === null) throw new Error("stand-in"); track("AI · Browser AI used"); return { text: r }; }
  } catch (e) { return { error: e && e.message === "stand-in" ? "This browser doesn't have built-in AI (it's in recent Chrome on computers and some Android phones)." : "This browser's built-in AI couldn't run that just now." }; }
  return { error: "This browser doesn't have built-in AI (it's in recent Chrome on computers and some Android phones)." };
}

// ── 7. RHYMES ON THE PHONE ───────────────────────────────────────────────────
// From the CMU Pronouncing Dictionary (BSD) - the same fingerprint-checked file the natural voice
// uses (about 3 MB, downloaded once). Two words rhyme when they sound the same from their last
// stressed vowel to the end. Replaces Datamuse, whose terms allow non-commercial use only.
let rhymeP = null;
async function rhymeIndex() {
  if (!rhymeP) rhymeP = (async () => {
    const base = (typeof window !== "undefined" && window.__spineVoiceCdn) || VOICE_CDN;
    const txt = new TextDecoder().decode(await kept(base + DICT.path, DICT.sha));
    const tail = {}, byWord = {}; const V = /[aeiouæɑɐɒɔəɚɛɜɪʊʌᵻIOAWYQ]/;
    for (const line of txt.split("\n")) {
      if (!line || line.startsWith(";;;")) continue; const t = line.indexOf("\t"); if (t < 1) continue;
      const w = line.slice(0, t).toLowerCase(); if (!/^[a-z']+$/.test(w)) continue; const ph = line.slice(t + 1).trim();
      let i = ph.lastIndexOf("ˈ"); if (i < 0) { for (let j = ph.length - 1; j >= 0; j--) if (V.test(ph[j])) { i = j; break; } } if (i < 0) continue;
      const k = ph.slice(i).replace(/[ˈˌ]/g, ""); byWord[w] = k; (tail[k] = tail[k] || []).push(w);
    }
    return { tail, byWord };
  })().catch((e) => { rhymeP = null; throw e; });
  return rhymeP;
}
export async function rhymes(word, max) {
  const w = String(word || "").toLowerCase().trim().replace(/[^a-z']/g, ""); if (!w) return [];
  const { tail, byWord } = await rhymeIndex(); const k = byWord[w]; if (!k) return [];
  track("AI · Rhymes");
  return (tail[k] || []).filter((x) => x !== w && !x.includes("'")).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, max || 40);
}

// ── 8. AVATARS, MADE ON THE PHONE (DiceBear, MIT; only styles that allow business use) ──
// DiceBear's hosted service is for non-commercial use, so the same avatars are drawn here instead.
// Every style below is CC0 or free for commercial use - none need a credit line.
const AV = {
  lorelei: () => import("@dicebear/lorelei"), notionists: () => import("@dicebear/notionists"), "open-peeps": () => import("@dicebear/open-peeps"),
  "pixel-art": () => import("@dicebear/pixel-art"), thumbs: () => import("@dicebear/thumbs"), shapes: () => import("@dicebear/shapes"),
  initials: () => import("@dicebear/initials"), bottts: () => import("@dicebear/bottts"),
};
export const AVATAR_STYLES = Object.keys(AV);
export async function avatar(seed, style, opts) {
  const k = AV[style] ? style : "thumbs";
  const [{ createAvatar }, st] = await Promise.all([import("@dicebear/core"), AV[k]()]);
  const a = createAvatar(st, { seed: String(seed || "spine").slice(0, 80), size: Math.min(512, Math.max(32, Number(opts && opts.size) || 128)) });
  return a.toDataUri();
}
