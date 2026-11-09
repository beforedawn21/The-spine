// ═══════════════════════════════════════════════════════════════════════════════════════════
//  SPINE STUDIO - make beats, play parts, record, mix and export, on the phone.
//  Everything runs on the phone's own audio engine (Web Audio): no samples to download, no
//  server, no key, no cost. Drums and instruments are synthesised; recordings come from the mic
//  or any audio file (or a song The Spine made).
//    Beat:    8 drum sounds x 16 steps x up to 4 bars, 3 kits, accents, 10 groove presets, swing
//    Music:   bass, keys and lead parts on a note grid locked to a key and scale (6 sounds),
//             plus a chord track with 8 progressions
//    Record:  count-in, record over the beat, takes, import a file, nudge timing
//    Mix:     volume, pan, mute, solo, filter, reverb and echo per channel; master glue + meter
//    Export:  full mix as WAV, every channel as its own stem, or hand it to the sound editor
//    AI:      "describe a beat" writes the drums, bass and chords for you (optional)
//    Projects are saved on the phone (recordings too), with undo/redo.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React from "react";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);
export const DRUMS = [
  ["kick", "Kick"], ["snare", "Snare"], ["clap", "Clap"], ["hat", "Hi-hat"], ["open", "Open hat"], ["tom", "Tom"], ["rim", "Rim"], ["perc", "Shaker"],
];
const KITS = { studio: "Studio", "808": "808", lofi: "Lo-fi" };
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9], "minor pentatonic": [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10] };
const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SOUNDS = { bass: "Bass", "808": "808 bass", keys: "Keys", pad: "Pad", lead: "Lead", pluck: "Pluck", bell: "Bell" };
const PROGS = {
  "Pop (I-V-vi-IV)": [0, 4, 5, 3], "Sad (vi-IV-I-V)": [5, 3, 0, 4], "Soul (ii-V-I-I)": [1, 4, 0, 0], "Minor (i-VI-III-VII)": [0, 5, 2, 6],
  "Trap (i-i-VI-VII)": [0, 0, 5, 6], "Gospel (I-IV-vi-V)": [0, 3, 5, 4], "Lo-fi (ii-V-iii-vi)": [1, 4, 2, 5], "One chord": [0, 0, 0, 0],
};
const P = (s) => s.split("").map((c) => (c === "X" ? 2 : c === "x" ? 1 : 0));
export const GROOVES = {
  "Hip-hop": { bpm: 90, swing: 18, kick: "X.....x...X.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", clap: "............X..." },
  "Boom bap": { bpm: 88, swing: 30, kick: "X......X..X.....", snare: "....X.......X...", hat: "x.xxx.x.x.xxx.x.", rim: "..........x....." },
  "Trap": { bpm: 140, swing: 0, kick: "X......X..X.....", snare: "........X.......", hat: "xxxxxxxxxxxXxxxx", open: "..............x.", clap: "........X......." },
  "House": { bpm: 124, swing: 8, kick: "X...X...X...X...", clap: "....X.......X...", hat: "..x...x...x...x.", open: "..x...x...x...x.", perc: "x.xxx.xxx.xxx.xx" },
  "Afrobeats": { bpm: 104, swing: 12, kick: "X..x..X...X..x..", rim: "..x..x....x..x..", hat: "x.xxx.xxx.xxx.xx", clap: "....X.......X...", perc: "x..x..x.x..x..x." },
  "Dembow": { bpm: 96, swing: 0, kick: "X...X...X...X...", snare: "...x..x....x..x.", hat: "x.x.x.x.x.x.x.x." },
  "Rock": { bpm: 112, swing: 0, kick: "X.....X.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", tom: ".............xxx" },
  "Lo-fi": { bpm: 78, swing: 40, kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.xx", rim: ".......x........" },
  "Drill": { bpm: 142, swing: 0, kick: "X.........X.....", snare: "......X.......X.", hat: "x..x..x.x..x..x.", perc: "...x.......x...." },
  "Reggae": { bpm: 76, swing: 10, kick: "........X.......", snare: "........X.......", hat: "..x...x...x...x.", rim: "....x.......x..." },
};
const TRACK_DEF = { bass: { base: 36, rows: 8, len: 2 }, "808": { base: 36, rows: 8, len: 4 }, keys: { base: 60, rows: 14, len: 2 }, pad: { base: 60, rows: 14, len: 4 }, lead: { base: 72, rows: 14, len: 1 }, pluck: { base: 72, rows: 14, len: 1 }, bell: { base: 72, rows: 14, len: 2 } };
const MIX0 = (vol) => ({ vol: vol == null ? 0.8 : vol, pan: 0, mute: false, solo: false, cut: 1, rev: 0.12, dly: 0 });
export function newProject() {
  const drums = {}; DRUMS.forEach(([k]) => (drums[k] = new Array(16).fill(0)));
  const p = {
    id: uid(), name: "My beat", bpm: 90, swing: 18, bars: 1, key: "A", scale: "minor", kit: "studio", master: 0.85, glue: true,
    drums, drumVol: Object.fromEntries(DRUMS.map(([k]) => [k, 1])),
    parts: [{ id: "bass", name: "Bass", sound: "bass", notes: [] }, { id: "keys", name: "Keys", sound: "keys", notes: [] }, { id: "lead", name: "Lead", sound: "lead", notes: [] }],
    chords: { on: false, prog: [0, 5, 2, 6], sound: "pad", rhythm: "hold" },
    recs: [], mix: { drums: MIX0(0.9), bass: MIX0(0.8), keys: MIX0(0.6), lead: MIX0(0.55), chords: MIX0(0.45) }, nudge: 0,
  };
  applyGroove(p, "Hip-hop");
  return p;
}
function applyGroove(p, name) {
  const g = GROOVES[name]; if (!g) return p;
  p.bpm = g.bpm; p.swing = g.swing;
  DRUMS.forEach(([k]) => { const bar = g[k] ? P(g[k]) : new Array(16).fill(0); p.drums[k] = Array.from({ length: 16 * p.bars }, (_, i) => bar[i % 16]); });
  return p;
}
const midiOf = (p, part, deg) => { const sc = SCALES[p.scale] || SCALES.minor; const n = sc.length; const oct = Math.floor(deg / n); return TRACK_DEF[part.sound].base + KEYS.indexOf(p.key) + sc[((deg % n) + n) % n] + 12 * oct; };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const noteName = (m) => KEYS[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ── sound makers (work on a live or an offline audio context) ───────────────────────────────
function noise(ctx) {
  if (ctx.__noise) return ctx.__noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ctx.__noise = b; return b;
}
function env(ctx, g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noiseHit(ctx, dest, t, filt, freq, q, peak, dec) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx); const f = ctx.createBiquadFilter(); f.type = filt; f.frequency.value = freq; f.Q.value = q || 0.7;
  const g = ctx.createGain(); env(ctx, g, t, peak, 0.002, dec); s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dec + 0.05);
}
export function drum(ctx, dest, kind, t, vel, kit) {
  const v = vel === 2 ? 1 : 0.62, lo = kit === "lofi", k8 = kit === "808";
  if (kind === "kick") {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(k8 ? 120 : 160, t); o.frequency.exponentialRampToValueAtTime(k8 ? 38 : 48, t + (k8 ? 0.18 : 0.11));
    env(ctx, g, t, 1.1 * v, 0.003, k8 ? 0.9 : lo ? 0.32 : 0.45); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 1);
    if (!lo) { const c = ctx.createOscillator(), cg = ctx.createGain(); c.type = "square"; c.frequency.value = 1800; env(ctx, cg, t, 0.08 * v, 0.001, 0.008); c.connect(cg); cg.connect(dest); c.start(t); c.stop(t + 0.03); }
  } else if (kind === "snare") {
    noiseHit(ctx, dest, t, "highpass", lo ? 1400 : 1000, 0.7, 0.55 * v, lo ? 0.14 : 0.2);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(k8 ? 230 : 190, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    env(ctx, g, t, 0.5 * v, 0.002, 0.11); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
  } else if (kind === "clap") {
    for (let i = 0; i < 3; i++) noiseHit(ctx, dest, t + i * 0.011, "bandpass", 1300, 1.2, 0.5 * v, 0.03);
    noiseHit(ctx, dest, t + 0.033, "bandpass", 1200, 0.9, 0.45 * v, lo ? 0.12 : 0.2);
  } else if (kind === "hat") noiseHit(ctx, dest, t, "highpass", lo ? 6000 : 7500, 0.8, 0.28 * v, k8 ? 0.04 : 0.05);
  else if (kind === "open") noiseHit(ctx, dest, t, "highpass", 7000, 0.8, 0.25 * v, 0.32);
  else if (kind === "tom") {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
    env(ctx, g, t, 0.75 * v, 0.003, 0.32); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
  } else if (kind === "rim") {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = "square"; o.frequency.value = 820; f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 4;
    env(ctx, g, t, 0.45 * v, 0.001, 0.045); o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.08);
  } else if (kind === "perc") noiseHit(ctx, dest, t, "bandpass", 5200, 1.5, 0.22 * v, 0.07);
}
export function synth(ctx, dest, sound, t, midi, dur, vel) {
  const f = hz(midi), v = (vel || 1) * 0.5, out = ctx.createGain(), end = t + dur;
  out.connect(dest);
  const osc = (type, freq, det, g0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (det) o.detune.value = det; const g = ctx.createGain(); g.gain.value = g0; o.connect(g); o.start(t); o.stop(end + 1.6); return g; };
  const adsr = (a, d, s, r) => { out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(v, t + a); out.gain.setTargetAtTime(v * s, t + a, d / 3); out.gain.setTargetAtTime(0.0001, end, r / 3); };
  if (sound === "bass") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
    osc("sawtooth", f, 0, 0.6).connect(lp); osc("sine", f / 2, 0, 0.7).connect(out); lp.connect(out); adsr(0.005, 0.2, 0.7, 0.08);
  } else if (sound === "808") {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const ws = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(2.2 * x); } ws.curve = c;
    o.connect(ws); ws.connect(out); o.start(t); o.stop(end + 1.2); adsr(0.004, 0.6, 0.6, 0.3);
  } else if (sound === "keys") {
    osc("triangle", f, 0, 0.6).connect(out); osc("sine", f * 2, 4, 0.18).connect(out); osc("sine", f, -5, 0.3).connect(out); adsr(0.006, 0.6, 0.35, 0.35);
  } else if (sound === "pad") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 0.6;
    [-9, 0, 8].forEach((d) => osc("sawtooth", f, d, 0.22).connect(lp)); lp.connect(out); adsr(0.35, 0.8, 0.8, 0.9);
  } else if (sound === "lead") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; osc("square", f, 0, 0.32).connect(lp); osc("sawtooth", f, 7, 0.25).connect(lp); lp.connect(out); adsr(0.01, 0.2, 0.6, 0.12);
  } else if (sound === "pluck") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3; lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(350, t + 0.3);
    osc("sawtooth", f, 0, 0.5).connect(lp); lp.connect(out); adsr(0.002, 0.25, 0.0001, 0.1);
  } else if (sound === "bell") {
    const m = ctx.createOscillator(), mg = ctx.createGain(), c = ctx.createOscillator(); m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(f * 0.2, t + 1);
    c.frequency.value = f; m.connect(mg); mg.connect(c.frequency); c.connect(out); m.start(t); c.start(t); m.stop(end + 1.6); c.stop(end + 1.6); adsr(0.002, 1.2, 0.2, 1.2);
  }
}
function impulse(ctx, sec) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  return b;
}
// ── the mixer graph ──────────────────────────────────────────────────────────────────────────
export function channelsOf(p) { return ["drums", ...p.parts.map((x) => x.id), "chords", ...p.recs.map((r) => r.id)]; }
export function buildGraph(ctx, p, only) {
  const master = ctx.createGain(); master.gain.value = p.master;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = p.glue ? -16 : 0; comp.ratio.value = p.glue ? 3 : 1; comp.attack.value = 0.01; comp.release.value = 0.2;
  const an = ctx.createAnalyser ? ctx.createAnalyser() : null;
  master.connect(comp); comp.connect(ctx.destination); if (an) { an.fftSize = 512; comp.connect(an); }
  const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 2.2); const revOut = ctx.createGain(); revOut.gain.value = 0.9; rev.connect(revOut); revOut.connect(master);
  const dly = ctx.createDelay(2); dly.delayTime.value = (60 / p.bpm) * 0.75; const fb = ctx.createGain(); fb.gain.value = 0.38; const dlyOut = ctx.createGain(); dlyOut.gain.value = 0.7;
  dly.connect(fb); fb.connect(dly); dly.connect(dlyOut); dlyOut.connect(master);
  const anySolo = Object.values(p.mix).some((m) => m && m.solo);
  const ch = {};
  for (const id of channelsOf(p)) {
    const m = p.mix[id] || MIX0();
    const inp = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, vol = ctx.createGain(), rs = ctx.createGain(), ds = ctx.createGain();
    lp.type = "lowpass"; lp.frequency.value = 200 * Math.pow(100, m.cut); lp.Q.value = 0.7;
    const audible = only ? only === id : (!m.mute && (!anySolo || m.solo));
    vol.gain.value = audible ? m.vol : 0; rs.gain.value = m.rev; ds.gain.value = m.dly;
    inp.connect(lp); if (pan) { pan.pan.value = m.pan; lp.connect(pan); pan.connect(vol); } else lp.connect(vol);
    vol.connect(master); vol.connect(rs); rs.connect(rev); vol.connect(ds); ds.connect(dly);
    ch[id] = { inp, lp, pan, vol, rs, ds };
  }
  return { ch, master, comp, an, dly };
}
export function updateGraph(g, p, ctx) {
  if (!g) return; const now = ctx.currentTime, anySolo = Object.values(p.mix).some((m) => m && m.solo);
  g.master.gain.setTargetAtTime(p.master, now, 0.02); g.dly.delayTime.setTargetAtTime((60 / p.bpm) * 0.75, now, 0.05);
  g.comp.threshold.setTargetAtTime(p.glue ? -16 : 0, now, 0.02); g.comp.ratio.setTargetAtTime(p.glue ? 3 : 1, now, 0.02);
  for (const id of Object.keys(g.ch)) {
    const m = p.mix[id] || MIX0(), c = g.ch[id], audible = !m.mute && (!anySolo || m.solo);
    c.vol.gain.setTargetAtTime(audible ? m.vol : 0, now, 0.02); c.rs.gain.setTargetAtTime(m.rev, now, 0.02); c.ds.gain.setTargetAtTime(m.dly, now, 0.02);
    c.lp.frequency.setTargetAtTime(200 * Math.pow(100, m.cut), now, 0.02); if (c.pan) c.pan.pan.setTargetAtTime(m.pan, now, 0.02);
  }
}
// One sixteenth step, everywhere it is needed: live playback and the export both call this.
export function scheduleStep(ctx, g, p, step, t) {
  const total = 16 * p.bars, s = step % total, sd = 60 / p.bpm / 4;
  const tt = t + (s % 2 === 1 ? sd * (p.swing / 100) * 0.66 : 0);
  if (g.ch.drums) DRUMS.forEach(([k]) => { const v = (p.drums[k] || [])[s]; if (v) { const dg = ctx.createGain(); dg.gain.value = p.drumVol[k] == null ? 1 : p.drumVol[k]; dg.connect(g.ch.drums.inp); drum(ctx, dg, k, tt, v, p.kit); } });
  for (const part of p.parts) { const c = g.ch[part.id]; if (!c) continue; for (const n of part.notes) if (n.step === s) synth(ctx, c.inp, part.sound, tt, midiOf(p, part, n.deg), Math.max(0.05, n.len * sd * 0.95), 1); }
  if (p.chords.on && g.ch.chords && (p.chords.rhythm === "hold" ? s % 16 === 0 : p.chords.rhythm === "pulse" ? s % 4 === 0 : s % 2 === 0 && [0, 3, 6, 10, 12].includes(s % 16))) {
    const bar = Math.floor(s / 16), root = p.chords.prog[bar % p.chords.prog.length] || 0, fake = { sound: p.chords.sound };
    const len = p.chords.rhythm === "hold" ? 16 * sd * 0.98 : p.chords.rhythm === "pulse" ? 3 * sd : 1.5 * sd;
    [0, 2, 4].forEach((d) => synth(ctx, g.ch.chords.inp, p.chords.sound, tt, midiOf(p, fake, root + d) - 12, len, 0.7));
  }
}
export async function renderMix(p, buffers, opts) {
  const o = opts || {}, loops = o.loops || 4, sd = 60 / p.bpm / 4, loopLen = sd * 16 * p.bars;
  let recEnd = 0; for (const r of p.recs) { const b = buffers[r.id]; if (b) recEnd = Math.max(recEnd, (r.offset || 0) + b.duration); }
  const len = Math.max(loops * loopLen, recEnd) + 2.5, sr = 44100;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new OAC(2, Math.ceil(len * sr), sr);
  const g = buildGraph(ctx, p, o.only);
  const steps = Math.ceil(Math.max(loops * loopLen, o.beatUnderRecs ? recEnd : 0) / sd);
  for (let i = 0; i < steps; i++) scheduleStep(ctx, g, p, i, 0.05 + i * sd);
  for (const r of p.recs) { const b = buffers[r.id]; if (!b || !g.ch[r.id]) continue; const s = ctx.createBufferSource(); s.buffer = b; const gg = ctx.createGain(); gg.gain.value = r.gain == null ? 1 : r.gain; s.connect(gg); gg.connect(g.ch[r.id].inp); const off = (r.offset || 0) + (p.nudge || 0) / 1000; if (off < 0) s.start(0.05, Math.min(-off, b.duration - 0.01)); else s.start(0.05 + off); }
  const out = await ctx.startRendering();
  // trim the silent tail
  const d0 = out.getChannelData(0), d1 = out.getChannelData(1); let end = d0.length - 1; while (end > sr && Math.abs(d0[end]) < 0.0008 && Math.abs(d1[end]) < 0.0008) end--;
  const n = Math.min(d0.length, end + Math.floor(sr * 0.2)), tr = new OAC(2, n, sr).createBuffer(2, n, sr);
  tr.getChannelData(0).set(d0.subarray(0, n)); tr.getChannelData(1).set(d1.subarray(0, n));
  return tr;
}
export function wav(buf) {
  const nCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length, dv = new DataView(new ArrayBuffer(44 + len * nCh * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + len * nCh * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * nCh * 2, true); dv.setUint16(32, nCh * 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, len * nCh * 2, true);
  const ch = []; for (let c = 0; c < nCh; c++) ch.push(buf.getChannelData(c)); let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) { const s = clamp(ch[c][i], -1, 1); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([dv], { type: "audio/wav" });
}
// ── keeping projects (and their recordings) on the phone ────────────────────────────────────
const LS = "spine.studio.projects";
const listProjects = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { return []; } };
const saveProjectLS = (p) => { try { const all = listProjects().filter((x) => x.id !== p.id); all.unshift({ id: p.id, name: p.name, at: Date.now(), json: JSON.stringify(p) }); localStorage.setItem(LS, JSON.stringify(all.slice(0, 20))); } catch (e) {} };
function idb() { return new Promise((ok, no) => { try { const r = indexedDB.open("spine-studio", 1); r.onupgradeneeded = () => r.result.createObjectStore("takes"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }); }
async function putTake(id, blob) { try { const db = await idb(); await new Promise((ok) => { const tx = db.transaction("takes", "readwrite"); tx.objectStore("takes").put(blob, id); tx.oncomplete = ok; tx.onerror = ok; }); } catch (e) {} }
async function getTake(id) { try { const db = await idb(); return await new Promise((ok) => { const r = db.transaction("takes").objectStore("takes").get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } }
function download(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 300); }
async function shareOrDownload(url, name) { try { const b = await (await fetch(url)).blob(); const f = new File([b], name, { type: b.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e && e.name === "AbortError") return; } download(url, name); }

const AI_SYS = "You write drum patterns and parts for a 16-step sequencer. Return ONLY JSON: {\"bpm\":number,\"swing\":0-60,\"key\":\"C|C#|D|...|B\",\"scale\":\"major|minor|dorian|pentatonic|minor pentatonic|blues\",\"drums\":{\"kick\":\"16 chars\",\"snare\":\"...\",\"clap\":\"...\",\"hat\":\"...\",\"open\":\"...\",\"tom\":\"...\",\"rim\":\"...\",\"perc\":\"...\"},\"bass\":[{\"step\":0-15,\"deg\":0-7,\"len\":1-8}],\"chords\":[four scale degrees 0-6] }. In drum strings X = accent, x = hit, . = rest; exactly 16 characters each; leave unused drums as all dots. Make it genuinely musical for the requested style.";

export function SpineStudio({ onClose, onSave, ask, importUrl, importName }) {
  const [p, setP] = React.useState(() => { try { const l = listProjects()[0]; if (l) return JSON.parse(l.json); } catch (e) {} return newProject(); });
  const hist = React.useRef({ list: [], i: -1 });
  const [tab, setTab] = React.useState("beat");
  const [bar, setBar] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [step, setStep] = React.useState(-1);
  const [partId, setPartId] = React.useState("bass");
  const [buffers, setBuffers] = React.useState({});
  const [rec, setRec] = React.useState(null);              // {phase:'count'|'rec', start}
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [loops, setLoops] = React.useState(4);
  const [aiText, setAiText] = React.useState("");
  const [level, setLevel] = React.useState(0);
  const [metro, setMetro] = React.useState(true);
  const ctxRef = React.useRef(null), gRef = React.useRef(null), pRef = React.useRef(p), timerRef = React.useRef(null), rafRef = React.useRef(0), queueRef = React.useRef([]), recRef = React.useRef(null), srcRef = React.useRef([]);
  pRef.current = p;
  React.useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; stop(); try { ctxRef.current && ctxRef.current.close(); } catch (e) {} }; }, []); // eslint-disable-line
  // keep it saved
  React.useEffect(() => { const t = setTimeout(() => saveProjectLS(p), 600); return () => clearTimeout(t); }, [p]);
  // bring recordings of the opened project back from the phone
  React.useEffect(() => { (async () => { const ctx = ensureCtx(); const out = {}; for (const r of p.recs) { if (buffers[r.id]) continue; const b = await getTake(r.id); if (b) { try { out[r.id] = await ctx.decodeAudioData(await b.arrayBuffer()); } catch (e) {} } } if (Object.keys(out).length) setBuffers((o) => ({ ...o, ...out })); })(); }, [p.id]); // eslint-disable-line
  // something The Spine made, handed over to be built on
  React.useEffect(() => { if (importUrl) importAudio(importUrl, importName || "Imported song"); }, [importUrl]); // eslint-disable-line
  React.useEffect(() => { if (gRef.current && ctxRef.current) updateGraph(gRef.current, p, ctxRef.current); }, [p]);

  function ensureCtx() { if (!ctxRef.current) { const AC = window.AudioContext || window.webkitAudioContext; ctxRef.current = new AC({ latencyHint: "interactive" }); } return ctxRef.current; }
  const change = (fn, push) => setP((o) => { const n = JSON.parse(JSON.stringify(o)); fn(n); if (push !== false) { const h = hist.current; h.list = h.list.slice(0, h.i + 1); h.list.push(JSON.stringify(o)); if (h.list.length > 80) h.list.shift(); h.i = h.list.length - 1; h.redo = []; } return n; });
  const undo = () => { const h = hist.current; if (h.i < 0) return; const cur = JSON.stringify(pRef.current); const prev = h.list[h.i]; h.list[h.i] = cur; h.i--; setP(JSON.parse(prev)); h.redo = (h.redo || []).concat([cur]); };
  const redo = () => { const h = hist.current; if (!h.redo || !h.redo.length) return; const nx = h.redo.pop(); h.list = h.list.slice(0, h.i + 1); h.list.push(JSON.stringify(pRef.current)); h.i++; setP(JSON.parse(nx)); };

  // ── live playback: a look-ahead scheduler so edits are heard on the next step ──
  function start(fromRecord) {
    const ctx = ensureCtx(); if (ctx.state === "suspended") ctx.resume();
    stop(true);
    gRef.current = buildGraph(ctx, pRef.current);
    let next = ctx.currentTime + 0.08, i = 0; const t0 = next; queueRef.current = [];
    // recordings play once, from the top
    srcRef.current = [];
    for (const r of pRef.current.recs) { const b = buffers[r.id]; if (!b) continue; const s = ctx.createBufferSource(); s.buffer = b; const gg = ctx.createGain(); gg.gain.value = r.gain == null ? 1 : r.gain; s.connect(gg); gg.connect(gRef.current.ch[r.id].inp); const off = (r.offset || 0) + (pRef.current.nudge || 0) / 1000; if (off < 0) s.start(t0, Math.min(-off, b.duration - 0.01)); else s.start(t0 + off); srcRef.current.push(s); }
    const tick = () => {
      const q = pRef.current, sd = 60 / q.bpm / 4;
      while (next < ctx.currentTime + 0.12) {
        scheduleStep(ctx, gRef.current, q, i, next);
        if (fromRecord && metro && i % 4 === 0) click(ctx, next, i % 16 === 0);
        queueRef.current.push([i % (16 * q.bars), next]); next += sd; i++;
      }
    };
    tick(); timerRef.current = setInterval(tick, 25);
    const draw = () => { const now = ctx.currentTime; const q = queueRef.current; while (q.length > 1 && q[1][1] <= now) q.shift(); if (q.length && q[0][1] <= now) setStep(q[0][0]);
      if (gRef.current && gRef.current.an && performance.now() - (draw.last || 0) > 66) { draw.last = performance.now(); const a = new Uint8Array(gRef.current.an.fftSize); gRef.current.an.getByteTimeDomainData(a); let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x - 128)); setLevel(Math.round((pk / 128) * 20) / 20); }
      rafRef.current = requestAnimationFrame(draw); };
    rafRef.current = requestAnimationFrame(draw);
    setPlaying(true);
    return t0;
  }
  function stop(keep) {
    clearInterval(timerRef.current); cancelAnimationFrame(rafRef.current);
    for (const s of srcRef.current) { try { s.stop(); } catch (e) {} } srcRef.current = [];
    if (gRef.current) { try { gRef.current.master.gain.setTargetAtTime(0, ctxRef.current.currentTime, 0.01); } catch (e) {} const g = gRef.current; setTimeout(() => { try { g.comp.disconnect(); } catch (e) {} }, 120); gRef.current = null; }
    if (!keep) { setPlaying(false); setStep(-1); setLevel(0); }
  }
  function click(ctx, t, down) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = down ? 1600 : 1000; env(ctx, g, t, 0.25, 0.001, 0.03); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.05); }

  // ── recording ──
  async function record() {
    if (rec) return finishRecord();
    setMsg("");
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); } catch (e) { setMsg("The microphone wasn't allowed. Turn it on for this site in your phone's settings."); return; }
    const ctx = ensureCtx(); if (ctx.state === "suspended") await ctx.resume();
    const sd = 60 / pRef.current.bpm / 4, countIn = sd * 16;
    for (let k = 0; k < 4; k++) click(ctx, ctx.currentTime + 0.05 + k * sd * 4, k === 0);
    setRec({ phase: "count" });
    const chunks = []; const mr = new MediaRecorder(stream); mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recRef.current = { mr, stream, chunks };
    setTimeout(() => { mr.start(); start(true); setRec({ phase: "rec", at: Date.now() }); }, (countIn + 0.05) * 1000);
  }
  async function finishRecord() {
    const r = recRef.current; if (!r) return; stop(); setRec(null);
    await new Promise((ok) => { r.mr.onstop = ok; try { r.mr.stop(); } catch (e) { ok(); } });
    r.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || "audio/webm" });
    const c = ensureCtx(); await addTake(blob, "Take " + (pRef.current.recs.length + 1), -(0.08 + (c.outputLatency || c.baseLatency || 0.04) + 0.01));
    recRef.current = null;
  }
  async function addTake(blob, name, offset) {
    try {
      const ctx = ensureCtx(); const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const id = "rec_" + uid(); await putTake(id, blob);
      setBuffers((o) => ({ ...o, [id]: buf }));
      change((n) => { n.recs.push({ id, name, offset: offset || 0, gain: 1 }); n.mix[id] = MIX0(0.9); });
      setMsg(name + " added (" + buf.duration.toFixed(1) + "s).");
    } catch (e) { setMsg("That sound couldn't be opened."); }
  }
  async function importAudio(url, name) { setBusy("Bringing it in..."); try { const b = await (await fetch(url)).blob(); await addTake(b, name, 0); } catch (e) { setMsg("Couldn't bring that in."); } setBusy(""); }

  // ── AI: describe a beat ──
  async function aiBeat() {
    if (!ask || !aiText.trim()) return; setBusy("Writing your beat...");
    try {
      const r = await ask(AI_SYS, "Style: " + aiText.trim());
      const s = String((r && r.text) || ""); const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
      change((n) => {
        if (j.bpm) n.bpm = clamp(Math.round(j.bpm), 50, 190); if (j.swing != null) n.swing = clamp(Math.round(j.swing), 0, 60);
        if (KEYS.includes(j.key)) n.key = j.key; if (SCALES[j.scale]) n.scale = j.scale;
        DRUMS.forEach(([k]) => { const pat = j.drums && typeof j.drums[k] === "string" ? P(j.drums[k].padEnd(16, ".").slice(0, 16)) : new Array(16).fill(0); n.drums[k] = Array.from({ length: 16 * n.bars }, (_, i) => pat[i % 16]); });
        const bass = n.parts.find((x) => x.id === "bass"); if (bass && Array.isArray(j.bass)) bass.notes = j.bass.slice(0, 32).map((x) => ({ step: clamp(x.step | 0, 0, 15), deg: clamp(x.deg | 0, 0, 7), len: clamp(x.len | 0 || 1, 1, 8) }));
        if (Array.isArray(j.chords) && j.chords.length) { n.chords.prog = j.chords.slice(0, 4).map((d) => clamp(d | 0, 0, 6)); n.chords.on = true; }
      });
      setMsg("Done - press play. Every step can still be changed by hand.");
    } catch (e) { setMsg("That didn't come out right - try describing it differently."); }
    setBusy("");
  }
  // ── export ──
  async function exportMix(only, name) { setBusy("Mixing down..."); try { const b = await renderMix(pRef.current, buffers, { loops, only, beatUnderRecs: true }); const url = URL.createObjectURL(wav(b)); setBusy(""); return { url, name: (name || pRef.current.name || "beat").replace(/[^\w -]/g, "").slice(0, 40) + ".wav", secs: b.duration }; } catch (e) { setBusy(""); setMsg("The mix couldn't be made on this phone."); return null; } }

  const view = Array.from({ length: 16 }, (_, i) => bar * 16 + i);
  const part = p.parts.find((x) => x.id === partId) || p.parts[0];
  const rows = TRACK_DEF[part.sound].rows;
  const TABS = [["beat", "Beat"], ["music", "Music"], ["record", "Record"], ["mix", "Mix"], ["export", "Export"], ["projects", "Projects"]];
  const Bars = () => p.bars > 1 ? <div className="st-bars">{Array.from({ length: p.bars }, (_, b) => <button key={b} className={"st-chip" + (bar === b ? " on" : "")} onClick={() => setBar(b)}>Bar {b + 1}</button>)}<button className="st-chip" onClick={() => change((n) => { DRUMS.forEach(([k]) => { for (let i = 16; i < 16 * n.bars; i++) n.drums[k][i] = n.drums[k][i % 16]; }); n.parts.forEach((pt) => { pt.notes = pt.notes.filter((x) => x.step < 16); const c = [...pt.notes]; for (let b = 1; b < n.bars; b++) c.forEach((x) => pt.notes.push({ ...x, step: x.step + 16 * b })); }); })}>Copy bar 1 to all</button></div> : null;
  return (
    <div className="st" role="dialog" aria-label="Spine Studio">
      <div className="st-head">
        <button className="st-ic" onClick={() => { stop(); onClose && onClose(); }} aria-label="Close the studio">{"✕"}</button>
        <input className="st-name" value={p.name} onChange={(e) => change((n) => { n.name = e.target.value.slice(0, 40); }, false)} aria-label="Project name" />
        <button className="st-ic" onClick={undo} aria-label="Undo">{"↶"}</button><button className="st-ic" onClick={redo} aria-label="Redo">{"↷"}</button>
      </div>
      <div className="st-transport">
        <button className={"st-play" + (playing ? " on" : "")} onClick={() => (playing ? stop() : start(false))} aria-label={playing ? "Stop" : "Play"}>{playing ? "■" : "▶"}</button>
        <button className={"st-rec" + (rec ? " on" : "")} onClick={record} aria-label={rec ? "Stop recording" : "Record"}>{rec ? (rec.phase === "count" ? "1-2-3-4" : "■ Rec") : "●"}</button>
        <label className="st-num">BPM<input type="number" min="50" max="190" value={p.bpm} onChange={(e) => change((n) => { n.bpm = clamp(+e.target.value || 90, 50, 190); }, false)} /></label>
        <label className="st-num">Swing<input type="range" min="0" max="60" value={p.swing} onChange={(e) => change((n) => { n.swing = +e.target.value; }, false)} /></label>
        <div className="st-meter"><i style={{ width: Math.min(100, level * 140) + "%", background: level > 0.85 ? "#ff453a" : "#34c759" }} /></div>
      </div>
      <div className="st-tabs">{TABS.map(([k, l]) => <button key={k} className={"st-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}</div>
      {(busy || msg) && <div className="st-msg">{busy ? <><span className="st-spin" />{busy}</> : msg}</div>}
      <div className="st-body">
        {tab === "beat" && (<>
          <div className="st-row wrap">
            <span className="st-lbl">Groove</span>{Object.keys(GROOVES).map((g) => <button key={g} className="st-chip" onClick={() => change((n) => applyGroove(n, g))}>{g}</button>)}
          </div>
          <div className="st-row wrap">
            <span className="st-lbl">Kit</span>{Object.entries(KITS).map(([k, l]) => <button key={k} className={"st-chip" + (p.kit === k ? " on" : "")} onClick={() => change((n) => { n.kit = k; })}>{l}</button>)}
            <span className="st-lbl">Length</span>{[1, 2, 4].map((b) => <button key={b} className={"st-chip" + (p.bars === b ? " on" : "")} onClick={() => { change((n) => { DRUMS.forEach(([k]) => { n.drums[k] = Array.from({ length: 16 * b }, (_, i) => n.drums[k][i % (16 * n.bars)] || 0); }); n.parts.forEach((pt) => { pt.notes = pt.notes.filter((x) => x.step < 16 * b); }); n.bars = b; }); setBar(0); }}>{b} bar{b > 1 ? "s" : ""}</button>)}
            <button className="st-chip" onClick={() => change((n) => { DRUMS.forEach(([k]) => (n.drums[k] = new Array(16 * n.bars).fill(0))); })}>Clear</button>
          </div>
          <Bars />
          <div className="st-grid-wrap">
            <div className="st-grid">
              {DRUMS.map(([k, l]) => (
                <div key={k} className="st-grow">
                  <button className="st-rowname" onClick={() => { const ctx = ensureCtx(); ctx.resume && ctx.resume(); drum(ctx, ctx.destination, k, ctx.currentTime + 0.01, 2, p.kit); }}>{l}</button>
                  {view.map((i) => { const v = (p.drums[k] || [])[i] || 0; return <button key={i} className={"st-cell" + (v ? (v === 2 ? " acc" : " on") : "") + (i % 4 === 0 ? " beat" : "") + (step === i ? " now" : "")} onClick={() => change((n) => { n.drums[k][i] = ((n.drums[k][i] || 0) + 1) % 3; })} aria-label={l + " step " + (i + 1)} />; })}
                  <input className="st-rowvol" type="range" min="0" max="1.5" step="0.05" value={p.drumVol[k] == null ? 1 : p.drumVol[k]} onChange={(e) => change((n) => { n.drumVol[k] = +e.target.value; }, false)} aria-label={l + " volume"} />
                </div>
              ))}
            </div>
          </div>
          <div className="st-hint">Tap a square once for a hit, twice for a loud one, three times to clear. Tap a name to hear it.</div>
          {ask && (<div className="st-ai"><input placeholder="Describe a beat - 'Afrobeats, sunny, 104 bpm'" value={aiText} onChange={(e) => setAiText(e.target.value)} /><button className="st-btn gold" disabled={!aiText.trim() || !!busy} onClick={aiBeat}>Make it</button></div>)}
        </>)}
        {tab === "music" && (<>
          <div className="st-row wrap">
            <span className="st-lbl">Key</span><select value={p.key} onChange={(e) => change((n) => { n.key = e.target.value; })}>{KEYS.map((k) => <option key={k}>{k}</option>)}</select>
            <select value={p.scale} onChange={(e) => change((n) => { n.scale = e.target.value; })}>{Object.keys(SCALES).map((k) => <option key={k}>{k}</option>)}</select>
          </div>
          <div className="st-row wrap">{p.parts.map((x) => <button key={x.id} className={"st-chip" + (partId === x.id ? " on" : "")} onClick={() => setPartId(x.id)}>{x.name}</button>)}<button className={"st-chip" + (partId === "chords" ? " on" : "")} onClick={() => setPartId("chords")}>Chords</button></div>
          {partId === "chords" ? (<>
            <div className="st-row wrap"><button className={"st-chip" + (p.chords.on ? " on" : "")} onClick={() => change((n) => { n.chords.on = !n.chords.on; })}>{p.chords.on ? "Chords on" : "Chords off"}</button>
              {["hold", "pulse", "stabs"].map((r) => <button key={r} className={"st-chip" + (p.chords.rhythm === r ? " on" : "")} onClick={() => change((n) => { n.chords.rhythm = r; n.chords.on = true; })}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>
            <div className="st-row wrap"><span className="st-lbl">Sound</span>{["pad", "keys", "pluck", "bell"].map((s) => <button key={s} className={"st-chip" + (p.chords.sound === s ? " on" : "")} onClick={() => change((n) => { n.chords.sound = s; n.chords.on = true; })}>{SOUNDS[s]}</button>)}</div>
            <div className="st-row wrap"><span className="st-lbl">Progression</span>{Object.entries(PROGS).map(([nm, pr]) => <button key={nm} className={"st-chip" + (JSON.stringify(p.chords.prog) === JSON.stringify(pr) ? " on" : "")} onClick={() => change((n) => { n.chords.prog = pr; n.chords.on = true; })}>{nm}</button>)}</div>
            <div className="st-hint">One chord per bar, looping. Turn Length up to 4 bars to hear the whole progression.</div>
          </>) : (<>
            <div className="st-row wrap"><span className="st-lbl">Sound</span>{Object.entries(SOUNDS).map(([s, l]) => <button key={s} className={"st-chip" + (part.sound === s ? " on" : "")} onClick={() => change((n) => { const x = n.parts.find((y) => y.id === part.id); x.sound = s; x.notes = x.notes.filter((q) => q.deg < TRACK_DEF[s].rows); })}>{l}</button>)}</div>
            <div className="st-row wrap"><span className="st-lbl">Note length</span>{[1, 2, 4, 8].map((L) => <button key={L} className={"st-chip" + ((part.len || TRACK_DEF[part.sound].len) === L ? " on" : "")} onClick={() => change((n) => { n.parts.find((y) => y.id === part.id).len = L; }, false)}>{L === 1 ? "short" : L === 8 ? "long" : L}</button>)}<button className="st-chip" onClick={() => change((n) => { n.parts.find((y) => y.id === part.id).notes = []; })}>Clear</button></div>
            <Bars />
            <div className="st-grid-wrap"><div className="st-grid notes">
              {Array.from({ length: rows }, (_, r) => rows - 1 - r).map((deg) => { const m = midiOf(p, part, deg); return (
                <div key={deg} className="st-grow">
                  <button className={"st-rowname" + (deg % (SCALES[p.scale] || []).length === 0 ? " root" : "")} onClick={() => { const ctx = ensureCtx(); ctx.resume && ctx.resume(); synth(ctx, ctx.destination, part.sound, ctx.currentTime + 0.01, m, 0.4, 1); }}>{noteName(m)}</button>
                  {view.map((i) => { const has = part.notes.find((x) => x.step === i && x.deg === deg); const held = !has && part.notes.find((x) => x.deg === deg && i > x.step && i < x.step + x.len);
                    return <button key={i} className={"st-cell" + (has ? " on" : held ? " held" : "") + (i % 4 === 0 ? " beat" : "") + (step === i ? " now" : "")} onClick={() => change((n) => { const x = n.parts.find((y) => y.id === part.id); const k = x.notes.findIndex((q) => q.step === i && q.deg === deg); if (k >= 0) x.notes.splice(k, 1); else x.notes.push({ step: i, deg, len: x.len || TRACK_DEF[x.sound].len }); })} aria-label={noteName(m) + " step " + (i + 1)} />; })}
                </div>); })}
            </div></div>
            <div className="st-hint">Every row is a note in {p.key} {p.scale}, so whatever you tap fits. Tap a note name to hear it.</div>
          </>)}
        </>)}
        {tab === "record" && (<>
          <div className="st-row wrap"><button className={"st-btn " + (rec ? "red" : "gold")} onClick={record}>{rec ? (rec.phase === "count" ? "Get ready - 1, 2, 3, 4..." : "■ Stop recording") : "● Record over the beat"}</button>
            <button className={"st-chip" + (metro ? " on" : "")} onClick={() => setMetro((m) => !m)}>Click track</button>
            <label className="st-btn">Bring in a sound file<input type="file" accept="audio/*,video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) addTake(f, f.name.replace(/\.[^.]+$/, "").slice(0, 30), 0); e.target.value = ""; }} /></label></div>
          <div className="st-hint">Use headphones so the beat doesn't leak into the mic. You get a one-bar count-in, then the beat plays while you sing, rap or play.</div>
          <label className="st-num wide">Timing nudge {p.nudge || 0} ms<input type="range" min="-300" max="300" step="5" value={p.nudge || 0} onChange={(e) => change((n) => { n.nudge = +e.target.value; }, false)} /></label>
          {p.recs.map((r) => (
            <div key={r.id} className="st-take">
              <input value={r.name} onChange={(e) => change((n) => { n.recs.find((x) => x.id === r.id).name = e.target.value.slice(0, 30); }, false)} aria-label="Take name" />
              <span className="st-hint">{buffers[r.id] ? buffers[r.id].duration.toFixed(1) + "s" : "loading..."}</span>
              <label className="st-num">Start at<input type="number" step="0.05" value={r.offset || 0} onChange={(e) => change((n) => { n.recs.find((x) => x.id === r.id).offset = +e.target.value || 0; }, false)} /></label>
              <button className="st-chip danger" onClick={() => change((n) => { n.recs = n.recs.filter((x) => x.id !== r.id); delete n.mix[r.id]; })}>Delete</button>
            </div>
          ))}
          {!p.recs.length && <div className="st-hint">No takes yet.</div>}
        </>)}
        {tab === "mix" && (<>
          {channelsOf(p).map((id) => { const m = p.mix[id] || MIX0(); const nm = id === "drums" ? "Drums" : id === "chords" ? "Chords" : (p.parts.find((x) => x.id === id) || p.recs.find((x) => x.id === id) || { name: id }).name;
            const set = (k, v) => change((n) => { n.mix[id] = { ...(n.mix[id] || MIX0()), [k]: v }; }, false);
            return (
              <div key={id} className="st-ch">
                <div className="st-ch-top"><b>{nm}</b><button className={"st-ms" + (m.mute ? " on" : "")} onClick={() => set("mute", !m.mute)}>M</button><button className={"st-ms solo" + (m.solo ? " on" : "")} onClick={() => set("solo", !m.solo)}>S</button></div>
                <div className="st-ch-row">
                  <label>Volume<input type="range" min="0" max="1.5" step="0.01" value={m.vol} onChange={(e) => set("vol", +e.target.value)} /></label>
                  <label>Left/right<input type="range" min="-1" max="1" step="0.05" value={m.pan} onChange={(e) => set("pan", +e.target.value)} /></label>
                  <label>Brightness<input type="range" min="0" max="1" step="0.01" value={m.cut} onChange={(e) => set("cut", +e.target.value)} /></label>
                  <label>Reverb<input type="range" min="0" max="1" step="0.01" value={m.rev} onChange={(e) => set("rev", +e.target.value)} /></label>
                  <label>Echo<input type="range" min="0" max="0.8" step="0.01" value={m.dly} onChange={(e) => set("dly", +e.target.value)} /></label>
                </div>
              </div>); })}
          <div className="st-ch master"><div className="st-ch-top"><b>Master</b><button className={"st-ms" + (p.glue ? " on" : "")} onClick={() => change((n) => { n.glue = !n.glue; }, false)} title="Glue compressor">Glue</button></div>
            <div className="st-ch-row"><label>Volume<input type="range" min="0" max="1.2" step="0.01" value={p.master} onChange={(e) => change((n) => { n.master = +e.target.value; }, false)} /></label></div></div>
        </>)}
        {tab === "export" && (<>
          <div className="st-row wrap"><span className="st-lbl">Beat repeats</span>{[1, 2, 4, 8, 16].map((l) => <button key={l} className={"st-chip" + (loops === l ? " on" : "")} onClick={() => setLoops(l)}>{l}{"×"}</button>)}</div>
          <div className="st-hint">About {Math.round(loops * 16 * p.bars * (60 / p.bpm / 4))} seconds of beat{p.recs.length ? ", and it runs on under your takes until they end" : ""}.</div>
          <div className="st-row wrap">
            <button className="st-btn gold" disabled={!!busy} onClick={async () => { const r = await exportMix(); if (r) download(r.url, r.name); }}>{"⬇"} Download the mix (WAV)</button>
            <button className="st-btn" disabled={!!busy} onClick={async () => { const r = await exportMix(); if (r) shareOrDownload(r.url, r.name); }}>{"↗"} Share</button>
            {onSave && <button className="st-btn" disabled={!!busy} onClick={async () => { const r = await exportMix(); if (r) { onSave(r.url, p.name); setMsg("Sent - it's in your Music results now."); } }}>Use it in The Spine</button>}
          </div>
          <div className="st-lbl" style={{ marginTop: 12 }}>Stems - each part on its own</div>
          <div className="st-row wrap">{channelsOf(p).map((id) => { const nm = id === "drums" ? "Drums" : id === "chords" ? "Chords" : (p.parts.find((x) => x.id === id) || p.recs.find((x) => x.id === id) || { name: id }).name; return <button key={id} className="st-chip" disabled={!!busy} onClick={async () => { const r = await exportMix(id, p.name + " - " + nm); if (r) download(r.url, r.name); }}>{"⬇"} {nm}</button>; })}</div>
        </>)}
        {tab === "projects" && (<>
          <div className="st-row wrap"><button className="st-btn gold" onClick={() => { stop(); saveProjectLS(p); const n = newProject(); n.name = "New beat"; saveProjectLS(n); hist.current = { list: [], i: -1 }; setP(n); setBar(0); setTab("beat"); }}>+ New project</button>
            <button className="st-btn" onClick={() => { saveProjectLS({ ...p, id: uid(), name: p.name + " (copy)" }); setMsg("Copy saved."); }}>Save a copy</button></div>
          {listProjects().map((x) => (
            <div key={x.id} className="st-take">
              <b style={{ flex: 1 }}>{x.name}</b><span className="st-hint">{new Date(x.at).toLocaleDateString()}</span>
              <button className="st-chip" onClick={() => { stop(); try { const n = JSON.parse(x.json); hist.current = { list: [], i: -1 }; setP(n); setBar(0); setTab("beat"); } catch (e) {} }}>Open</button>
              <button className="st-chip danger" onClick={() => { try { localStorage.setItem(LS, JSON.stringify(listProjects().filter((y) => y.id !== x.id))); setMsg("Deleted."); } catch (e) {} }}>Delete</button>
            </div>
          ))}
          <div className="st-hint">Projects and recordings stay on this phone. Export a mix to keep it anywhere.</div>
        </>)}
      </div>
    </div>
  );
}

export const STUDIO_MIX_CSS = `
.st{position:fixed;inset:0;z-index:2147482000;background:#0d0e12;color:#eef0f4;display:flex;flex-direction:column;font-family:Manrope,system-ui,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}
.st-head{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #22252c;}
.st-ic{background:#1b1e24;border:1px solid #2b2f37;color:#eef0f4;border-radius:10px;min-width:38px;height:38px;font-size:16px;cursor:pointer;}
.st-name{flex:1;min-width:0;background:none;border:none;color:#fff;font:700 17px Manrope,system-ui,sans-serif;outline:none;}
.st-transport{display:flex;gap:10px;align-items:center;padding:10px 12px;flex-wrap:wrap;}
.st-play,.st-rec{width:54px;height:54px;border-radius:50%;border:none;font-size:20px;cursor:pointer;background:#c9a227;color:#15120a;flex:0 0 auto;}
.st-play.on{background:#eef0f4;color:#111}.st-rec{background:#2a1416;color:#ff453a;border:2px solid #ff453a;font-size:13px;font-weight:800;width:auto;min-width:54px;padding:0 10px;border-radius:28px;}.st-rec.on{background:#ff453a;color:#fff;animation:stpulse 1s infinite;}
@keyframes stpulse{50%{opacity:.7}}
.st-num{display:flex;flex-direction:column;font-size:11px;color:#9aa1ad;gap:2px;}.st-num.wide{margin:10px 0;}
.st-num input[type=number]{width:62px;background:#15171c;border:1px solid #2b2f37;color:#fff;border-radius:8px;padding:6px;font:600 15px Manrope,system-ui,sans-serif;}
.st-num input[type=range]{width:110px;accent-color:#c9a227;}.st-num.wide input{width:100%;}
.st-meter{flex:1;min-width:60px;height:8px;background:#1b1e24;border-radius:4px;overflow:hidden;}.st-meter i{display:block;height:100%;transition:width .06s;}
.st-tabs{display:flex;gap:4px;padding:0 10px 8px;overflow-x:auto;scrollbar-width:none;}.st-tabs::-webkit-scrollbar{display:none}
.st-tab{flex:0 0 auto;background:none;border:none;color:#a9afba;border-radius:999px;padding:8px 13px;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;}.st-tab.on{background:#eef0f4;color:#111;}
.st-msg{padding:6px 14px;font-size:13px;color:#e3c766;display:flex;gap:8px;align-items:center;}
.st-spin{width:13px;height:13px;border:2px solid #e3c766;border-right-color:transparent;border-radius:50%;animation:stspin .8s linear infinite;display:inline-block;}@keyframes stspin{to{transform:rotate(360deg)}}
.st-body{flex:1;overflow-y:auto;padding:4px 12px 30px;-webkit-overflow-scrolling:touch;}
.st-row{display:flex;gap:6px;align-items:center;margin:8px 0;}.st-row.wrap{flex-wrap:wrap;}
.st-lbl{font:700 11px Manrope,system-ui,sans-serif;color:#9aa1ad;text-transform:uppercase;letter-spacing:.06em;margin-right:2px;}
.st-chip{background:#1b1e24;border:1px solid #2b2f37;color:#e3e6ec;border-radius:999px;padding:7px 11px;font:600 12.5px Manrope,system-ui,sans-serif;cursor:pointer;}
.st-chip.on{background:#eef0f4;color:#111;border-color:#eef0f4}.st-chip.danger{color:#ff8a80;border-color:#5a2a2a}.st-chip:disabled,.st-btn:disabled{opacity:.45}
.st-btn{background:#1b1e24;border:1px solid #2b2f37;color:#eef0f4;border-radius:10px;padding:10px 13px;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;display:inline-block;}
.st-btn.gold{background:#c9a227;color:#15120a;border-color:#c9a227}.st-btn.red{background:#ff453a;color:#fff;border-color:#ff453a}
.st-body select{background:#15171c;color:#fff;border:1px solid #2b2f37;border-radius:8px;padding:7px;font:600 13px Manrope,system-ui,sans-serif;}
.st-bars{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;}
.st-grid-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:6px -12px;padding:0 12px;}
.st-grid{display:flex;flex-direction:column;gap:4px;min-width:max-content;}
.st-grow{display:flex;gap:3px;align-items:center;}
.st-rowname{position:sticky;left:0;z-index:2;width:64px;flex:0 0 64px;height:30px;background:#15171c;border:1px solid #2b2f37;color:#c3c8d1;border-radius:7px;font:600 11px Manrope,system-ui,sans-serif;cursor:pointer;text-align:left;padding:0 6px;}
.st-rowname.root{color:#e3c766;}
.st-cell{width:30px;height:30px;flex:0 0 30px;border-radius:6px;border:1px solid #2b2f37;background:#191b21;cursor:pointer;padding:0;}
.st-cell.beat{background:#22252d;}.st-cell.beat:nth-child(4n+2){margin-left:4px;}
.st-cell.on{background:#c9a227;border-color:#c9a227}.st-cell.acc{background:#ff9f0a;border-color:#ffd60a;box-shadow:0 0 0 2px rgba(255,214,10,.35) inset}
.st-cell.held{background:rgba(201,162,39,.35);border-color:rgba(201,162,39,.5)}.st-cell.now{outline:2px solid #fff;outline-offset:-2px;}
.st-grid.notes .st-cell{height:26px}.st-grid.notes .st-rowname{height:26px}
.st-rowvol{width:70px;accent-color:#c9a227;margin-left:6px;}
.st-hint{font-size:12px;color:#9aa1ad;line-height:1.45;margin:6px 0;}
.st-ai{display:flex;gap:8px;margin-top:12px;}.st-ai input{flex:1;min-width:0;background:#15171c;border:1px solid #2b2f37;color:#fff;border-radius:10px;padding:10px 11px;font:500 14px Manrope,system-ui,sans-serif;}
.st-take{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 10px;border:1px solid #23262d;border-radius:10px;margin:6px 0;}
.st-take input{background:#15171c;border:1px solid #2b2f37;color:#fff;border-radius:8px;padding:7px 8px;font:600 13px Manrope,system-ui,sans-serif;min-width:0;flex:1 1 120px;}
.st-take .st-num input{width:70px;flex:none;}
.st-ch{border:1px solid #23262d;border-radius:12px;padding:10px;margin:8px 0;}.st-ch.master{border-color:#c9a227;}
.st-ch-top{display:flex;gap:8px;align-items:center;margin-bottom:6px;}.st-ch-top b{flex:1;font-size:14px;}
.st-ms{min-width:34px;height:30px;border-radius:8px;border:1px solid #2b2f37;background:#1b1e24;color:#c3c8d1;font:800 12px Manrope,system-ui,sans-serif;cursor:pointer;padding:0 8px;}
.st-ms.on{background:#ff453a;color:#fff;border-color:#ff453a}.st-ms.solo.on{background:#ffd60a;color:#111;border-color:#ffd60a}
.st-ch-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px 12px;}
.st-ch-row label{display:flex;flex-direction:column;font-size:11px;color:#9aa1ad;}.st-ch-row input{accent-color:#c9a227;width:100%;}
`;
