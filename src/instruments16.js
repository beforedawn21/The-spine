// ═══════════════════════════════════════════════════════════════════════════════════════════
//  REAL INSTRUMENTS FOR THE STUDIO (batch 16). Recorded notes played by smplr (MIT):
//   · grand piano - Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0; credited in the Studio)
//   · guitars, bass, strings, flute, trumpet, marimba, electric piano and a real drum kit -
//     the FluidR3 General MIDI set by Frank Wen (MIT)
//  All served from The Spine itself (/ai/instruments/, copied from npm by copy-engines.mjs), every
//  third note recorded and the rest tuned from the nearest one. Downloaded once per instrument, kept
//  by the phone. If they can't load (offline, first time), the Studio's own synth plays instead.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const span = (lo, hi) => { const out = []; for (let m = lo; m <= hi; m++) if ([0, 3, 6, 9].includes(m % 12)) out.push(noteName(m)); return out; };
export const INSTRUMENTS = {
  piano: { label: "Grand piano", base: 60, notes: span(21, 108) },
  guitar: { label: "Nylon guitar", base: 52, notes: span(40, 84) },
  eguitar: { label: "Electric guitar", base: 52, notes: span(40, 84) },
  ebass: { label: "Bass guitar", base: 36, notes: span(28, 67) },
  strings: { label: "Strings", base: 60, notes: span(36, 96) },
  cello: { label: "Cello", base: 48, notes: span(36, 76) },
  flute: { label: "Flute", base: 72, notes: span(60, 96) },
  trumpet: { label: "Trumpet", base: 64, notes: span(52, 84) },
  marimba: { label: "Marimba", base: 72, notes: span(48, 96) },
  epiano: { label: "Electric piano", base: 60, notes: span(36, 96) },
};
// the General MIDI drum kit: The Spine's drum names -> the recorded note
export const KIT_NOTES = { kick: "C2", snare: "D2", clap: "Eb2", hat: "Gb2", open: "Bb2", tom: "A2", rim: "Db2", perc: "Bb4" };
export const CREDITS = "Piano: Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0). Other instruments and the real drum kit: FluidR3 by Frank Wen (MIT).";
const BASE = "/ai/instruments/";
const bufs = {}; const loading = {};
const toMidi = (n) => { const m = String(n).match(/^([A-G]b?)(-?\d)$/); return m ? NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1) : null; };
export function isLoaded(name) { return !!bufs[name]; }
// fetch the recordings once (the phone keeps them) and check they are there; the samplers read them from there
export function loadInstrument(name) {
  if (bufs[name]) return Promise.resolve(bufs[name]);
  if (loading[name]) return loading[name];
  const files = name === "drums" ? Object.values(KIT_NOTES) : (INSTRUMENTS[name] || {}).notes;
  if (!files) return Promise.reject(new Error("no such instrument"));
  loading[name] = (async () => {
    const have = [];
    await Promise.all(files.map(async (n) => { try { const r = await fetch(BASE + name + "/" + n + ".mp3"); if (r.ok) { await r.arrayBuffer(); have.push(n); } } catch (e) { /* a missing note is tuned from its neighbour */ } }));
    if (have.length < Math.min(3, files.length)) throw new Error("not enough of " + name + " loaded");
    bufs[name] = have.map((n) => ({ n, m: toMidi(n) })).filter((x) => x.m != null).sort((a, b) => a.m - b.m); return bufs[name];
  })().catch((e) => { delete loading[name]; throw e; });
  return loading[name];
}
// a smplr preset: each recorded note covers the keys around it (tuned up or down from its own pitch)
function presetFor(name) {
  const L = bufs[name]; const origin = typeof location !== "undefined" ? location.origin : "";
  const regions = name === "drums" ? L.map((x) => ({ sample: x.n, pitch: x.m, keyRange: [x.m, x.m] }))
    : L.map((x, i) => ({ sample: x.n, pitch: x.m, keyRange: [i ? Math.ceil((L[i - 1].m + x.m) / 2) : 0, i < L.length - 1 ? Math.ceil((x.m + L[i + 1].m) / 2) - 1 : 127] }));
  return { samples: { baseUrl: origin + BASE + name + "/", formats: ["mp3"] }, groups: [{ regions }] };
}
// one smplr Sampler per output node and instrument. A Sampler needs a moment to get ready: notes asked
// for before then wait for it (live play), and a mix-down calls prepareSamplers() first.
const samplers = new WeakMap();
let SM = null; let smLoading = null;
export function loadSmplr() { if (SM) return Promise.resolve(SM); if (!smLoading) smLoading = import("smplr").then((m) => { SM = m; return m; }); return smLoading; }
function samplerFor(ctx, dest, name) {
  if (!SM || !bufs[name]) return null;
  let m = samplers.get(dest); if (!m) { m = {}; samplers.set(dest, m); }
  if (!m[name]) { const s = SM.Sampler(ctx, { destination: dest, preset: presetFor(name), decayTime: name === "piano" ? 0.6 : 0.25 }); const w = { s, ready: false }; (s.ready || s.load).then(() => { w.ready = true; }); m[name] = w; }
  return m[name];
}
function startWhenReady(ctx, w, ev) {
  if (w.ready) { w.s.start(ev); return; }
  (w.s.ready || w.s.load).then(() => { w.ready = true; w.s.start(Object.assign({}, ev, { time: Math.max(ev.time || 0, ctx.currentTime) })); });
}
// play one note; returns false when the recordings aren't ready (the caller then uses its synth)
export function playNote(ctx, dest, name, t, midi, dur, vel) {
  const w = samplerFor(ctx, dest, name); if (!w) return false;
  startWhenReady(ctx, w, { note: midi, time: t, duration: Math.max(0.05, dur), velocity: Math.round(Math.max(1, Math.min(127, (vel || 1) * 100))) });
  return true;
}
export function playDrum(ctx, dest, kind, t, vel) {
  const w = samplerFor(ctx, dest, "drums"); const n = KIT_NOTES[kind]; if (!w || !n) return false;
  startWhenReady(ctx, w, { note: toMidi(n), time: t, velocity: vel === 2 ? 120 : 80 });
  return true;
}
// make (and wait for) the samplers a project needs on these outputs, before an offline mix-down
export async function prepareSamplers(ctx, list) {
  await loadSmplr(); const ws = [];
  for (const [dest, name] of list) { if (!bufs[name]) continue; const w = samplerFor(ctx, dest, name); if (w) ws.push(w); }
  await Promise.all(ws.map((w) => (w.s.ready || w.s.load).then(() => { w.ready = true; })));
}
export async function preloadProject(p) { // everything a project uses, before playing or rendering
  const need = new Set((p.parts || []).map((x) => x.sound).filter((s) => INSTRUMENTS[s]));
  if (p.chords && INSTRUMENTS[p.chords.sound]) need.add(p.chords.sound);
  if (p.kit === "real") need.add("drums");
  if (!need.size) return true;
  try { await loadSmplr(); await Promise.all([...need].map(loadInstrument)); return true; } catch (e) { return false; }
}
