// ═══════════════════════════════════════════════════════════════════════════════════════════
//  A NATURAL VOICE ON THE PHONE (batch 15). "Read" used the phone's built-in voice. Kokoro-82M
//  (Apache-2.0) sounds like a person and runs on the phone itself: downloaded once (about 95 MB, best
//  on Wi-Fi), checked, kept - then free, private and working with no signal.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { VOICES, naturalVoice, voiceDownloaded, speakNatural, naturalVoiceSetting, setNaturalVoice } from "./onDevice15.js";

let current = null;
// Read text aloud in the natural voice. Returns false when it isn't set up (the caller uses the phone's voice).
export async function playNatural(text) {
  const s = naturalVoiceSetting(); if (!s.on) return false;
  if (current) { try { current.pause(); } catch (e) {} current = null; return true; }   // a second tap stops it
  if (!(await voiceDownloaded())) return false;
  try { const r = await speakNatural(text, s.voice); const a = new Audio(r.url); current = a; a.onended = () => { if (current === a) current = null; }; await a.play(); return true; }
  catch (e) { current = null; return false; }
}

export function NaturalVoiceCard({ onClose }) {
  const [s, setS] = useState(naturalVoiceSetting()); const [have, setHave] = useState(null); const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [pct, setPct] = useState(0);
  const audio = useRef(null);
  useEffect(() => { voiceDownloaded().then(setHave); }, []);
  const save = (v) => { setNaturalVoice(v); setS(naturalVoiceSetting()); };
  const download = async () => {
    setErr(""); setBusy("Starting...");
    try { await naturalVoice((t, f) => { setBusy(t); if (typeof f === "number") setPct(f); }); setHave(true); save({ on: true }); setBusy(""); }
    catch (e) { setBusy(""); setErr((e && e.message) || "The download stopped. Try again on Wi-Fi."); }
  };
  const test = async (v) => {
    setErr(""); setBusy("Getting " + VOICES[v].name + " ready...");
    try { const r = await speakNatural("Hi, I'm " + VOICES[v].name + ". This is how I sound reading your answers.", v); setBusy(""); if (audio.current) audio.current.pause(); audio.current = new Audio(r.url); audio.current.play().catch(() => {}); }
    catch (e) { setBusy(""); setErr("That voice couldn't play just now."); }
  };
  return (
    <div className="v15">
      <div className="v15-h"><b>Natural voice</b>{onClose && <button className="v15-x" onClick={onClose} aria-label="Close">×</button>}</div>
      <p className="v15-p">"Read" can use a voice that sounds like a person instead of the phone's robot voice. It's made on your phone - free, private, and it works with no signal.</p>
      {have === false && !busy && <><p className="v15-p">It's a one-time download of about 95 MB, so Wi-Fi is best.</p><button className="v15-btn pri" onClick={download}>Download the natural voice</button></>}
      {busy && <div className="v15-busy" role="status">{busy}{pct > 0 && pct < 1 && <div className="v15-bar"><i style={{ width: Math.round(pct * 100) + "%" }} /></div>}</div>}
      {have && (<>
        <label className="v15-row"><input type="checkbox" checked={s.on} onChange={(e) => save({ on: e.target.checked })} /> Use it when I tap Read</label>
        <div className="v15-voices">{Object.entries(VOICES).map(([k, v]) => (
          <div key={k} className={"v15-v" + (s.voice === k ? " on" : "")}>
            <button className="v15-pick" onClick={() => save({ voice: k })} aria-pressed={s.voice === k}><b>{v.name}</b><small>{v.who}</small></button>
            <button className="v15-btn" onClick={() => test(k)} disabled={!!busy} aria-label={"Hear " + v.name}>▶</button>
          </div>))}
        </div>
      </>)}
      {err && <div className="v15-err">{err}</div>}
      <p className="v15-small">Voice: Kokoro-82M by hexgrad (Apache-2.0). Words to sounds: CMU Pronouncing Dictionary (BSD) via HeadTTS (MIT).</p>
    </div>
  );
}

export const VOICE15_CSS = `
.v15{background:var(--panel);border:1px solid var(--stone);border-radius:14px;padding:14px 16px;color:var(--ink);max-width:460px;}
.v15-h{display:flex;justify-content:space-between;align-items:center;font-size:16px;margin-bottom:6px;}
.v15-x{background:none;border:none;font-size:22px;color:var(--ink3);cursor:pointer;line-height:1;}
.v15-p{font-size:13px;color:var(--ink2);line-height:1.55;margin:6px 0;}.v15-small{font-size:10.5px;color:var(--ink3);margin-top:10px;}
.v15-btn{background:var(--panel);border:1px solid var(--stone);border-radius:10px;padding:8px 12px;font:600 13px Manrope,system-ui,sans-serif;color:var(--ink);cursor:pointer;}
.v15-btn.pri{background:var(--ink);color:var(--bg);border-color:var(--ink);}
.v15-busy{font-size:13px;color:var(--ink2);margin:8px 0;}.v15-bar{height:8px;border-radius:4px;background:var(--stone-l,rgba(0,0,0,.08));overflow:hidden;margin-top:6px;}.v15-bar i{display:block;height:100%;background:var(--gold);}
.v15-row{display:flex;gap:8px;align-items:center;font-size:14px;margin:10px 0;}
.v15-voices{display:grid;gap:6px;}.v15-v{display:flex;gap:6px;align-items:stretch;}
.v15-pick{flex:1;text-align:left;background:var(--panel);border:1px solid var(--stone);border-radius:10px;padding:8px 10px;cursor:pointer;color:var(--ink);font:500 13px Manrope,system-ui,sans-serif;}
.v15-pick small{display:block;color:var(--ink3);font-size:11px;}.v15-v.on .v15-pick{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset;}
.v15-err{color:var(--err);font-size:13px;margin-top:8px;}
.hands15{position:fixed;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);z-index:9000;display:flex;align-items:center;gap:8px;background:rgba(18,19,26,.88);color:#fff;border-radius:14px;padding:6px 8px;font:600 12px Manrope,system-ui,sans-serif;}
.hands15 video{width:64px;height:48px;border-radius:9px;object-fit:cover;transform:scaleX(-1);background:#000;}
.hands15 button{background:#fff;color:#12131a;border:none;border-radius:9px;padding:6px 10px;font:700 12px Manrope,system-ui,sans-serif;cursor:pointer;}
`;
