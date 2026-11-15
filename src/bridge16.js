// ============================================================================
//  BRIDGE 16 - the phone-side abilities every leg can now reach.
//  Real instruments, sheet music, the grammar checker, real maths, tidy code,
//  reading Word files, the website checker, changing a song's key, reading
//  text in a photo, turning speech into words, humming into notes, and
//  invitation replies. Each runs here on The Spine's page and hands the leg
//  back only the result.
// ============================================================================
import { INSTRUMENTS, loadInstrument, playNote, playDrum } from "./instruments16.js";
import { notesToAbc } from "./music16.jsx";
import { shiftPitch } from "./music16.jsx";
import { loadKatex, texToHtml } from "./math16.jsx";
import { checkWriting, readDocx, tidyCode, checkSite } from "./tools16.js";
import { readPage, transcribeOnDevice, humToNotes } from "./localAI.js";
import { upscale } from "./gfx17.js";

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
export function toMidi(n) {
  if (typeof n === "number" && isFinite(n)) return Math.max(0, Math.min(127, Math.round(n)));
  const m = String(n || "").trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/); if (!m) return null;
  let name = m[1].toUpperCase() + m[2]; name = SHARP[name] || name; const i = NAMES.indexOf(name); if (i < 0) return null;
  return i + 12 * (Number(m[3]) + 1);
}
let AC = null;
function ctx() { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; AC = new C(); } try { AC.resume(); } catch (e) {} return AC; }
function synth(c, t, midi, dur, vel) {
  const o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 * (vel || 0.8), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, dur));
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
function wavFrom(buf) {
  const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate; const out = new ArrayBuffer(44 + n * ch * 2); const d = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); d.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, ch, true); d.setUint32(24, rate, true); d.setUint32(28, rate * ch * 2, true); d.setUint16(32, ch * 2, true); d.setUint16(34, 16, true); w(36, "data"); d.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) d.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), true);
  return out;
}
const asSrc = (v) => { if (!v) return null; if (typeof v === "string") return v; try { return URL.createObjectURL(v instanceof Blob ? v : new Blob([v])); } catch (e) { return null; } };

// Returns true when the message was one of these kinds (and it has been answered).
export function handleBridge16(kind, p, reply, env) {
  p = p || {}; const e = env || {};
  const safe = (fn) => { (async () => { try { reply(await fn()); } catch (err) { reply({ error: String((err && err.message) || "That didn't work.").slice(0, 200) }); } })(); return true; };
  switch (kind) {
    case "instruments": reply(Object.keys(INSTRUMENTS).concat(["drums"])); return true;
    case "play": return safe(async () => {
      const notes = (Array.isArray(p.notes) ? p.notes : []).slice(0, 2000); const name = INSTRUMENTS[p.instrument] || p.instrument === "drums" ? String(p.instrument) : "piano";
      const c = ctx(); try { await Promise.race([loadInstrument(name), new Promise((z) => setTimeout(z, 6000))]); } catch (err) {}
      const spb = p.bpm ? 60 / Number(p.bpm) : 1; const t0 = c.currentTime + 0.08; let end = 0;
      for (const n of notes) {
        const at = t0 + (Number(n.at ?? n.time ?? 0) || 0) * spb, dur = Math.max(0.05, (Number(n.dur ?? n.duration ?? 0.5) || 0.5) * spb), vel = Number(n.vel ?? n.velocity ?? 0.8) || 0.8;
        end = Math.max(end, at + dur);
        if (name === "drums") { if (!playDrum(c, c.destination, String(n.drum || n.note || "kick"), at, vel)) synth(c, at, 40, 0.1, vel); continue; }
        const m = toMidi(n.note ?? n.midi ?? n); if (m == null) continue;
        if (!playNote(c, c.destination, name, at, m, dur, vel)) synth(c, at, m, dur, vel);
      }
      return { ok: true, seconds: Math.max(0, end - c.currentTime) };
    });
    case "sheet": return safe(async () => {
      let abc = p.abc ? String(p.abc).slice(0, 20000) : "";
      if (!abc) { const notes = (Array.isArray(p.notes) ? p.notes : []).map((n) => ({ midi: toMidi(n.note ?? n.midi ?? n), start: Number(n.at ?? n.start ?? 0) || 0, dur: Number(n.dur ?? 0.5) || 0.5 })).filter((n) => n.midi != null); abc = notesToAbc(notes, Number(p.bpm) || 100, String(p.title || "")); }
      const A = await import("abcjs"); const box = document.createElement("div"); box.style.cssText = "position:absolute;left:-9999px;width:740px"; document.body.appendChild(box);
      try { A.renderAbc(box, abc, { responsive: "resize", add_classes: true }); const svg = box.querySelector("svg"); return { abc, svg: svg ? svg.outerHTML : "" }; } finally { box.remove(); }
    });
    case "grammar": return safe(async () => checkWriting(String(p.text || "").slice(0, 50000)));
    case "math": return safe(async () => { await loadKatex(); const h = texToHtml(String(p.tex || "").slice(0, 4000), !!p.display) || ""; const m = h.match(/<math[\s\S]*<\/math>/); return { mathml: m ? m[0] : "", html: h }; });
    case "tidy": return safe(async () => { const r = await tidyCode(String(p.code || "").slice(0, 300000), String(p.kind || "")); return typeof r === "string" ? { code: r } : r; });
    case "readfile": return safe(async () => {
      const name = String(p.name || "").toLowerCase(); const data = p.data;
      if (/\.docx$/.test(name) || (data && data.byteLength && !/\.(txt|md|csv|json|html?)$/.test(name))) { const buf = data instanceof ArrayBuffer ? data : await new Response(data).arrayBuffer(); const r = await readDocx(buf); return typeof r === "string" ? { text: r } : r; }
      const text = typeof data === "string" ? data : await new Response(data).text(); return { text: text.slice(0, 400000) };
    });
    case "checksite": return safe(async () => checkSite(String(p.html || "").slice(0, 400000)));
    case "pitch": return safe(async () => {
      if (!p.audio) return { error: "Send the recording to change its key." };
      const c = ctx(); const raw = p.audio instanceof ArrayBuffer ? p.audio : await new Response(p.audio).arrayBuffer();
      const buf = await c.decodeAudioData(raw.slice(0)); const out = await shiftPitch(buf, Math.max(-12, Math.min(12, Number(p.semitones) || 0)));
      return { wav: wavFrom(out), seconds: out.duration };
    });
    case "ocr": return safe(async () => { const r = await readPage(asSrc(p.src)); return typeof r === "string" ? { text: r } : r; });
    case "transcribe": return safe(async () => { const r = await transcribeOnDevice(asSrc(p.src)); return typeof r === "string" ? { text: r } : r; });
    case "hum": return safe(async () => { const r = await humToNotes(asSrc(p.src)); return Array.isArray(r) ? { notes: r } : r; });
    case "upscale": return safe(async () => ({ src: await upscale(String(p.src || ""), p.scale === 4 ? 4 : 2) }));
    case "rsvp": return safe(async () => {
      const id = String(e.appId || p.invite || ""); if (!id || !e.inviteReply) return { error: "This invitation can't take replies here - send your answer to the host." };
      const r = await e.inviteReply(id, p); if (r && r.error) return { error: r.error === "missing" ? "Replies aren't switched on yet." : r.error };
      return r && r.data === "ok" ? { ok: true } : { error: (r && r.data) || "Not sent." };
    });
    default: return false;
  }
}

// What the legs are told (added to their briefs).
export const BRIDGE16_WORDS = "\n\nMORE THE SPINE CAN DO ON THE PHONE (all free, all wrapped in try/catch): "
  + "Spine.play([{note:'C4',at:0,dur:0.5},{note:'E4',at:0.5,dur:0.5}],{instrument:'piano',bpm:100}) plays real recorded instruments - Spine.instruments() lists them (piano, guitar, eguitar, ebass, strings, cello, flute, trumpet, marimba, epiano, drums - for drums use {drum:'kick'|'snare'|'hat'|'clap'|'tom'|'open'|'rim'|'perc',at}); "
  + "Spine.sheet(notesOrAbc,{title,bpm}) returns {svg,abc} - real sheet music to show; "
  + "Spine.grammar(text) checks spelling and grammar privately and returns the problems with suggested fixes; "
  + "Spine.math('\\\\frac{a}{b}',true) returns {mathml,html} for real maths display (insert the mathml); "
  + "Spine.tidy(code,'js'|'css'|'html'|'json') returns {code} neatly formatted; "
  + "Spine.readFile(arrayBuffer,'name.docx') returns {text} from a Word file or a text file; "
  + "Spine.checkSite(html) returns a list of problems in a web page (broken markup, accessibility) in plain words; "
  + "Spine.pitch(arrayBufferOfAudio,semitones) returns {wav} - the same recording in a different key, same speed; "
  + "Spine.ocr(imageDataUrl) returns {text} read from a photo of a page; "
  + "Spine.transcribe(audioBlobOrUrl) returns {text} - speech to words, on the phone; "
  + "Spine.humToNotes(audioBlobOrUrl) returns {notes} from someone humming; "
  + "Spine.rsvp({name,answer:'yes'|'no'|'maybe',guests,note}) records a reply to an invitation for its host; "
  + "Spine.upscale(imageDataUrl, 2|4) returns {src} - the same picture sharper and bigger, made on the phone. "
  + "DEVICES (the person taps Connect on The Spine's own sheet first; on iPhone these resolve to {error} with a plain reason - always handle it): "
  + "Spine.heart(function(bpm){}) streams heart rate from a Bluetooth strap (workout games, calm tools); Spine.controller(function(r){ r.reportId, r.data }) streams a USB/HID controller or button box; "
  + "Spine.printReceipt([{text,align:'center',bold,big},'plain line'],{via:'usb'|'bluetooth'}) prints on a receipt or label printer (tickets, orders, name badges, table numbers); "
  + "Spine.recordScreen(seconds) resolves to {video:ArrayBuffer,type} (computers); Spine.pickColor() resolves to {color:'#rrggbb'} from anywhere on screen (computers).";
