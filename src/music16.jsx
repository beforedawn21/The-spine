// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - music on paper and in a new key:
//  · SHEET MUSIC: hummed notes become real sheet music (abcjs, MIT) you can read, play and print.
//  · CHANGE KEY, SAME SPEED: SoundTouchJS (LGPL-2.1, used unmodified as its own module) shifts a
//    recording up or down in pitch without speeding it up or slowing it down.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { playNotes } from "./localAI.js";
import { loadInstrument, loadSmplr, playNote } from "./instruments16.js";

import { copyAndSay } from "./copy17.js";
const LET = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
export function midiToAbc(m) {
  const pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1; let s = LET[pc];
  if (oct >= 5) { s = s.replace(/[A-G]/, (c) => c.toLowerCase()) + "'".repeat(oct - 5); } else s = s + ",".repeat(Math.max(0, 4 - oct));
  return s;
}
const lenStr = (u) => (u === 1 ? "" : String(u));
// notes [{midi,start,dur}] -> ABC notation in eighth notes, with rests and bar lines (4/4)
export function notesToAbc(notes, bpm, title) {
  const e8 = 60 / (bpm || 100) / 2; let pos = 0; const toks = []; let barUsed = 0;
  const put = (tok, u) => { // split across bar lines (8 eighths a bar), tying notes that cross
    let left = u; while (left > 0) { const room = 8 - barUsed; const take = Math.min(room, left); toks.push(tok.replace("%", lenStr(take)) + (tok[0] !== "z" && left - take > 0 ? "-" : "")); barUsed += take; left -= take; if (barUsed >= 8) { toks.push("|"); barUsed = 0; } }
  };
  const t0 = notes.length ? notes[0].start : 0;
  for (const n of notes) {
    const at = Math.round((n.start - t0) / e8); if (at > pos) { put("z%", at - pos); pos = at; }
    const u = Math.max(1, Math.min(16, Math.round(n.dur / e8))); put(midiToAbc(n.midi) + "%", u); pos += u;
  }
  if (barUsed > 0) put("z%", 8 - barUsed);
  return "X:1\nT:" + String(title || "My tune").replace(/[\n\r]/g, " ").slice(0, 60) + "\nM:4/4\nL:1/8\nQ:1/4=" + Math.round(bpm || 100) + "\nK:C\n" + toks.join(" ").replace(/\|\s*$/, "|]") + "\n";
}
export function SheetMusic({ notes, bpm, title }) {
  const ref = useRef(null); const [err, setErr] = useState(""); const abc = notesToAbc(notes || [], bpm, title);
  useEffect(() => { let live = true; import("abcjs").then((m) => { const A = m.default || m; if (live && ref.current) A.renderAbc(ref.current, abc, { responsive: "resize", add_classes: true, paddingtop: 0, paddingbottom: 0 }); }).catch(() => setErr("The sheet music couldn't be drawn here.")); return () => { live = false; }; }, [abc]);
  const play = async () => { // the grand piano when it's ready, the phone's own tone otherwise
    try { await loadSmplr(); await loadInstrument("piano"); const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); const t0 = ac.currentTime + 0.1; const s = notes[0] ? notes[0].start : 0;
      notes.forEach((n) => playNote(ac, ac.destination, "piano", t0 + n.start - s, n.midi, Math.max(0.15, n.dur), n.vel || 0.7)); } catch (e) { playNotes(notes); } };
  const print = () => { const svg = ref.current && ref.current.innerHTML; if (!svg) return; const w = window.open("", "_blank"); if (!w) return;
    w.document.write("<!doctype html><title>" + String(title || "My tune").replace(/</g, "&lt;") + "</title><style>body{margin:32px;font-family:Georgia,serif}svg{width:100%;height:auto}</style>" + svg + "<p style='font-size:11px;color:#777'>Made with The Spine</p>"); w.document.close(); setTimeout(() => { try { w.print(); } catch (e) {} }, 400); };
  return (<div className="sm16" data-sheet>
    <div ref={ref} className="sm16-paper" />
    {err && <div className="lp14-note">{err}</div>}
    <div className="lp14-row"><button onClick={play}>Play the sheet</button><button onClick={print}>Print or save PDF</button>
      <button onClick={() => { copyAndSay(abc); }}>Copy as ABC</button></div>
  </div>);
}

// ── change key without changing speed ──
export async function shiftPitch(buffer, semitones, onProgress) {
  const st = Number(semitones) || 0; if (!st) return buffer;
  const m = await import("soundtouchjs"); const { SoundTouch, SimpleFilter, WebAudioBufferSource } = m;
  const touch = new SoundTouch(); touch.pitchSemitones = st; touch.tempo = 1;
  // a little silence on the end lets the last of the sound come out of the shifter, then it's trimmed back
  const ch = buffer.numberOfChannels > 1 ? 2 : 1, total = buffer.length, pad = Math.round(buffer.sampleRate * 0.5);
  const OAC0 = window.OfflineAudioContext || window.webkitOfflineAudioContext; const padded = new OAC0(ch, total + pad, buffer.sampleRate).createBuffer(ch, total + pad, buffer.sampleRate);
  for (let c = 0; c < ch; c++) padded.getChannelData(c).set(buffer.getChannelData(c));
  const src = new WebAudioBufferSource(padded); const filter = new SimpleFilter(src, touch);
  const outL = new Float32Array(total + pad + 8192), outR = new Float32Array(total + pad + 8192);
  const chunk = 8192, tmp = new Float32Array(chunk * 2); let got = 0, n;
  while ((n = filter.extract(tmp, chunk)) > 0 && got < outL.length) {
    for (let i = 0; i < n && got + i < outL.length; i++) { outL[got + i] = tmp[i * 2]; outR[got + i] = tmp[i * 2 + 1]; }
    got += n; if (onProgress && got % (chunk * 16) < chunk) { onProgress(Math.min(1, got / total)); await new Promise((r) => setTimeout(r, 0)); }
  }
  const len = total; const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const out = new OAC(ch, len, buffer.sampleRate).createBuffer(ch, len, buffer.sampleRate);
  out.getChannelData(0).set(outL.subarray(0, len)); if (ch > 1) out.getChannelData(1).set(outR.subarray(0, len));
  return out;
}
export const MUSIC16_CSS = `.sm16{margin:8px 0;}.sm16-paper{background:#fff;border-radius:10px;padding:6px;color:#111;overflow-x:auto;}`;
