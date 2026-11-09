// ════════════════════════════════════════════════════════════════════════════
//  THE SPINE · BATCH 14 PANELS
//  Scan a page (Core + Text), Hum a tune (Music), phone alerts through ntfy (Agent + tools).
//  The work itself happens on the phone (see localAI.js) except ntfy, which is a free public
//  relay: no account, no key.
// ════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { readPage, humToNotes, notesToMidi, playNotes } from "./localAI.js";

export const LP14_CSS = `
.lp14{margin-top:12px;border:1px solid var(--stone,#2a2f3a);border-radius:14px;padding:12px;background:var(--panel,#151922)}
.lp14 h4{margin:0 0 6px;font:700 12px 'Manrope',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2,#9aa3b2)}
.lp14 .lp14-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
.lp14 button{min-height:40px;border-radius:10px;border:1px solid var(--stone,#2a2f3a);background:none;color:var(--ink,#e8e6e1);font:600 13px 'Manrope',sans-serif;padding:0 12px;cursor:pointer}
.lp14 button.lp14-pri{background:#B8935A;border-color:#B8935A;color:#14110c}
.lp14 button:disabled{opacity:.5}
.lp14 .lp14-note{font-size:12.5px;color:var(--ink2,#9aa3b2);margin-top:6px;line-height:1.45}
.lp14 textarea{width:100%;min-height:120px;margin-top:8px;border-radius:10px;border:1px solid var(--stone,#2a2f3a);background:rgba(0,0,0,.2);color:var(--ink,#e8e6e1);font:14px/1.5 'Manrope',sans-serif;padding:8px;box-sizing:border-box}
.lp14 img.lp14-pv{max-width:100%;max-height:220px;border-radius:10px;margin-top:8px;display:block}
.lp14 .lp14-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:8px;overflow:hidden}.lp14 .lp14-bar i{display:block;height:100%;background:#B8935A;transition:width .2s}
.lp14 .lp14-notes{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.lp14 .lp14-notes span{font:600 12px 'JetBrains Mono',monospace;padding:3px 6px;border-radius:6px;background:rgba(184,147,90,.15);color:#e8c98a}
.lp14 input[type=text]{min-height:40px;border-radius:10px;border:1px solid var(--stone,#2a2f3a);background:rgba(0,0,0,.2);color:var(--ink,#e8e6e1);font:14px 'Manrope',sans-serif;padding:0 10px;flex:1;min-width:150px}
`;

const dataUrlOf = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.onerror = () => r(null); f.readAsDataURL(blob); });

// ── SCAN A PAGE ── a photo of a letter, a receipt, a page of notes -> the words, on the phone.
export function ScanPage({ onUse, useLabel }) {
  const [img, setImg] = useState(null); const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0); const [msg, setMsg] = useState(""); const [text, setText] = useState("");
  const fileRef = useRef(null);
  const pick = async (f) => { if (!f) return; setText(""); setMsg(""); setImg(await dataUrlOf(f)); };
  const read = async () => {
    if (!img) return; setBusy(true); setProg(0); setMsg("Getting the reader ready (first time only)...");
    try { const r = await readPage(img, (st, p) => { setProg(p || 0); if (/recogniz/i.test(st)) setMsg("Reading the page..."); });
      setText(r.text); setMsg(r.text ? "Read on this phone - nothing was uploaded. " + (r.confidence < 60 ? "Some words were hard to make out; check them." : "") : "No words found. Try a flatter, brighter photo.");
    } catch (e) { setMsg("The reader couldn't start: " + String(e && e.message || e).slice(0, 80)); }
    setBusy(false); setProg(1);
  };
  return (<div className="lp14 lp-scan"><h4>Scan a page</h4>
    <div className="lp14-note">Take a photo of a letter, receipt or notes. The words are read on your phone - free and private.</div>
    <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => pick(e.target.files && e.target.files[0])} />
    <div className="lp14-row"><button onClick={() => fileRef.current && fileRef.current.click()}>Take or choose a photo</button>{img && <button className="lp14-pri" disabled={busy} onClick={read}>{busy ? "Reading..." : "Read the words"}</button>}</div>
    {img && <img className="lp14-pv" src={img} alt="Page to read" />}
    {busy && <div className="lp14-bar"><i style={{ width: Math.round(prog * 100) + "%" }} /></div>}
    {msg && <div className="lp14-note">{msg}</div>}
    {text && <><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Words read from the page" />
      <div className="lp14-row"><button className="lp14-pri" onClick={() => onUse && onUse(text)}>{useLabel || "Use these words"}</button><button onClick={() => { try { navigator.clipboard.writeText(text); setMsg("Copied."); } catch (e) {} }}>Copy</button></div></>}
  </div>);
}

// ── HUM A TUNE ── sing or hum up to 20 seconds; it becomes notes, a MIDI file, and the melody for a song.
export function HumTune({ onUse }) {
  const [rec, setRec] = useState(null); const [secs, setSecs] = useState(0); const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0);
  const [notes, setNotes] = useState(null); const [msg, setMsg] = useState(""); const [bpm, setBpm] = useState(100); const timer = useRef(null); const fileRef = useRef(null);
  useEffect(() => () => { clearInterval(timer.current); try { rec && rec.stream && rec.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} }, [rec]);
  const analyse = async (blob) => {
    setBusy(true); setProg(0); setMsg("Listening for the notes (on your phone)..."); setNotes(null);
    try { const ns = await humToNotes(blob, (p) => setProg(p || 0));
      if (!ns.length) { setMsg("No clear notes heard. Hum a little louder, one note at a time."); }
      else { setNotes(ns); const gaps = ns.slice(1).map((n, i) => n.start - ns[i].start).filter((g) => g > 0.15 && g < 1.5).sort((a, b) => a - b);
        if (gaps.length) setBpm(Math.max(60, Math.min(160, Math.round(60 / gaps[Math.floor(gaps.length / 2)])))); setMsg(ns.length + " notes caught."); }
    } catch (e) { setMsg("Couldn't read the tune: " + String(e && e.message || e).slice(0, 90)); }
    setBusy(false);
  };
  const start = async () => {
    setMsg(""); try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const mt = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
      const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined); const ch = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) ch.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(timer.current); setRec(null); analyse(new Blob(ch, { type: mr.mimeType || "audio/webm" })); };
      mr.stream = stream; mr.start(250); setRec(mr); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => { if (s >= 19) { try { mr.stop(); } catch (e) {} } return s + 1; }), 1000);
    } catch (e) { setMsg("The microphone isn't available. You can choose a recording instead."); }
  };
  const midi = () => { const b = new Blob([notesToMidi(notes, bpm)], { type: "audio/midi" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "my-tune.mid"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const asText = () => notes.map((n) => n.name + (n.dur >= 0.5 ? " (long)" : "")).join(" ");
  return (<div className="lp14 lp-hum"><h4>Hum a tune</h4>
    <div className="lp14-note">Hum or sing a melody - it turns into notes you can hear, save as MIDI, and use as the tune for a song. Worked out on your phone.</div>
    <input ref={fileRef} type="file" accept="audio/*,video/*" style={{ display: "none" }} onChange={(e) => e.target.files && e.target.files[0] && analyse(e.target.files[0])} />
    <div className="lp14-row">{!rec ? <button className="lp14-pri" disabled={busy} onClick={start}>Start humming</button> : <button className="lp14-pri" onClick={() => { try { rec.stop(); } catch (e) {} }}>Stop ({secs}s)</button>}
      <button disabled={busy || !!rec} onClick={() => fileRef.current && fileRef.current.click()}>Choose a recording</button></div>
    {busy && <div className="lp14-bar"><i style={{ width: Math.round(prog * 100) + "%" }} /></div>}
    {msg && <div className="lp14-note">{msg}</div>}
    {notes && notes.length > 0 && <>
      <div className="lp14-notes">{notes.slice(0, 64).map((n, i) => <span key={i}>{n.name}</span>)}</div>
      <div className="lp14-row"><button onClick={() => playNotes(notes)}>Play it back</button><button onClick={midi}>Save MIDI</button>
        {onUse && <button className="lp14-pri" onClick={() => onUse("Use this melody (from my humming, about " + bpm + " bpm): " + asText(), notes, bpm)}>Use as the song's melody</button>}</div>
    </>}
  </div>);
}

// ── PHONE ALERTS (ntfy) ── a private topic name is the "address". The free ntfy app on her phone
// subscribes to it; anything sent to it pops up as a notification. No account, no key.
export function newTopic() { const a = new Uint8Array(9); crypto.getRandomValues(a); return "spine-" + Array.from(a, (b) => (b % 36).toString(36)).join(""); }
export function loadTopic() { try { return localStorage.getItem("spine.ntfy") || ""; } catch (e) { return ""; } }
export async function sendAlert(topic, title, message, url, at) {
  const t = String(topic || "").trim(); if (!/^[A-Za-z0-9_-]{6,64}$/.test(t)) return { ok: false, error: "No alert address set." };
  try {
    const h = { Title: String(title || "The Spine").replace(/[^\x20-\x7E]/g, "").slice(0, 120) || "The Spine", Tags: "sparkles" };
    if (url && /^https:\/\//.test(url)) h.Click = url;
    if (at && at > Date.now() + 60000) h.At = String(Math.round(Math.min(at, Date.now() + 3 * 86400000 - 60000) / 1000));
    const r = await fetch("https://ntfy.sh/" + encodeURIComponent(t), { method: "POST", headers: h, body: String(message || "").slice(0, 3800) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: "Couldn't reach the alert service." }; }
}
export function AlertsCard({ topic, setTopic }) {
  const [msg, setMsg] = useState("");
  const save = (t) => { setTopic(t); try { localStorage.setItem("spine.ntfy", t); } catch (e) {} };
  return (<div className="lp14 lp-alerts"><h4>Alerts on my phone</h4>
    {!topic ? <><div className="lp14-note">Get a notification when an agent finishes or a tool wants your attention. Free - uses the ntfy app, no account.</div>
      <div className="lp14-row"><button className="lp14-pri" onClick={() => save(newTopic())}>Turn on phone alerts</button></div></>
      : <><div className="lp14-note">1. Install the free <b>ntfy</b> app. 2. Tap <b>+</b> and subscribe to <b style={{ userSelect: "all" }}>{topic}</b>. That name is your private address - don't share it.</div>
        <div className="lp14-row"><button onClick={async () => { const r = await sendAlert(topic, "The Spine", "Alerts are working."); setMsg(r.ok ? "Test sent - check your phone." : (r.error || "Couldn't send.")); }}>Send a test</button>
          <button onClick={() => { save(""); setMsg("Alerts turned off."); }}>Turn off</button></div></>}
    {msg && <div className="lp14-note">{msg}</div>}
  </div>);
}
