// ============================================================================
//  LEG PLUS (batch 13) - one upgrade for every leg, built on what is already
//  here. Everything takes the app's own helpers as props, so nothing in Core
//  or the server changes shape.
// ============================================================================
import React, { useEffect, useRef, useState } from "react";

const css = `
.lp-card{margin-top:12px;border:1px solid var(--stone,#3a3a3a);border-radius:12px;padding:12px;background:rgba(255,255,255,.03)}
.lp-card h4{margin:0 0 6px;font:700 10px Manrope,sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.75}
.lp-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
.lp-btn{min-height:40px;border-radius:10px;border:1px solid var(--stone,#555);background:transparent;color:inherit;font:700 12px Manrope,sans-serif;padding:0 12px;cursor:pointer}
.lp-btn.pri{background:#B8935A;color:#12100e;border:none}.lp-btn:disabled{opacity:.5}
.lp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}.lp-grid img{width:100%;border-radius:10px;display:block}
.lp-note{font-size:12px;opacity:.75;margin-top:6px;line-height:1.5}.lp-err{font-size:12px;color:#e8a0a0;margin-top:6px}
.lp-voice{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:60;background:#14161c;color:#fff;border:1px solid #B8935A;border-radius:18px;padding:12px 16px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.4);font:600 13px Manrope,sans-serif}
.lp-dot{width:12px;height:12px;border-radius:50%;background:#7ed4a8}.lp-dot.listen{animation:lpp 1s infinite}.lp-dot.think{background:#e8c98a}.lp-dot.speak{background:#8fb8e8;animation:lpp .6s infinite}
@keyframes lpp{50%{transform:scale(1.5);opacity:.6}}@media (prefers-reduced-motion:reduce){.lp-dot{animation:none!important}}
.lp-tl{list-style:none;margin:6px 0 0;padding:0}.lp-tl li{display:grid;grid-template-columns:58px 1fr auto;gap:8px;padding:6px 0;border-top:1px solid var(--stone,#333);font-size:12.5px}
.lp-tl .t{opacity:.6;font-family:'JetBrains Mono',monospace;font-size:11px}.lp-tl .s{font-size:11px;font-weight:700}.lp-tl .s.done{color:#7ed4a8}.lp-tl .s.skipped{opacity:.6}.lp-tl .s.failed{color:#e8a0a0}
.lp-photo{position:relative;margin-top:8px;touch-action:none}.lp-photo img{width:100%;display:block;border-radius:10px}.lp-photo svg{position:absolute;inset:0;width:100%;height:100%}
.lp-talk.on{border-color:#B8935A!important;color:#B8935A!important;box-shadow:0 0 0 3px rgba(184,147,90,.25)}
.lp-sugg{border-top:1px solid var(--stone,#333);padding:8px 0;font-size:13px}.lp-sugg del{color:#e8a0a0}.lp-sugg ins{color:#7ed4a8;text-decoration:none}`;
export const LEGPLUS_CSS = css;

const dataUrlOf = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
const fetchBytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const saveFile = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
const tstr = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, "0"); return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + x; };

// ════════════════════════════════════════════════════════════════════════════
//  CORE · HANDS-FREE CONVERSATION. Listens, asks Core, reads the answer
//  aloud, listens again - until "stop". Core itself is untouched: this only
//  presses its button and reads what comes back.
// ════════════════════════════════════════════════════════════════════════════
export function VoiceTalk({ ask, busyRef, answerRef, speak, transcribe, onClose }) {
  const [phase, setPhase] = useState("listen"); const [heard, setHeard] = useState(""); const live = useRef(true); const recRef = useRef(null);
  useEffect(() => { live.current = true; loop(); return () => { live.current = false; try { recRef.current && recRef.current.stop(); } catch (e) {} try { speechSynthesis.cancel(); } catch (e) {} }; /* eslint-disable-next-line */ }, []);
  const listenOnce = () => new Promise((res) => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (R) { try { const r = new R(); recRef.current = r; r.lang = navigator.language || "en-US"; r.interimResults = false; let got = null;
      r.onresult = (e) => { try { got = e.results[0][0].transcript; } catch (x) {} }; r.onerror = () => res(null); r.onend = () => res(got); r.start(); return; } catch (e) {} }
    // no speech recognition (some phones): record a few seconds and have the server write it down
    (async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); const mr = new MediaRecorder(st); const ch = []; mr.ondataavailable = (e) => ch.push(e.data);
      mr.onstop = async () => { st.getTracks().forEach((t) => t.stop()); const d = await dataUrlOf(new Blob(ch, { type: mr.mimeType || "audio/webm" })); const t = d && transcribe ? await transcribe(d) : null; res(t && t.text ? t.text : null); };
      recRef.current = mr; mr.start(); setTimeout(() => { try { mr.stop(); } catch (e) {} }, 6000); } catch (e) { res(null); } })();
  });
  async function loop() {
    let misses = 0;
    while (live.current) {
      setPhase("listen"); const said = await listenOnce(); if (!live.current) break;
      if (!said || !said.trim()) { if (++misses >= 3) break; continue; } misses = 0; setHeard(said);
      if (/^\s*(stop|goodbye|that's all|thank you,? that's all)\s*[.!]?\s*$/i.test(said)) break;
      setPhase("think"); const before = answerRef.current; ask(said);
      const t0 = Date.now(); await new Promise((r) => setTimeout(r, 400));
      while (live.current && (busyRef.current || answerRef.current === before) && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 300));
      if (!live.current) break; setPhase("speak"); await speak(String(answerRef.current || "").replace(/```[\s\S]*?```/g, " ").slice(0, 1500));
    }
    if (live.current) onClose && onClose();
  }
  return (<div className="lp-voice" role="status" aria-live="polite"><span className={"lp-dot " + phase} /><span>{phase === "listen" ? "Listening..." : phase === "think" ? "Thinking..." : "Speaking..."}{heard ? <span style={{ display: "block", fontWeight: 400, opacity: .7, fontSize: 11 }}>"{heard.slice(0, 60)}"</span> : null}</span>
    <button className="lp-btn" onClick={() => { live.current = false; onClose && onClose(); }}>Stop</button></div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  IMAGE · A MATCHING SET, and REMOVE A PLAIN BACKGROUND on the phone.
// ════════════════════════════════════════════════════════════════════════════
export async function removePlainBackground(src, tolerance = 38) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
  // the background is whatever colour the edges share; flood in from every edge pixel that matches it
  const edge = []; for (let i = 0; i < W; i++) { edge.push([i, 0], [i, H - 1]); } for (let j = 0; j < H; j++) { edge.push([0, j], [W - 1, j]); }
  let r = 0, g = 0, b = 0; edge.forEach(([i, j]) => { const k = (j * W + i) * 4; r += p[k]; g += p[k + 1]; b += p[k + 2]; }); r /= edge.length; g /= edge.length; b /= edge.length;
  const near = (k) => Math.abs(p[k] - r) + Math.abs(p[k + 1] - g) + Math.abs(p[k + 2] - b) < tolerance * 3;
  const seen = new Uint8Array(W * H), q = []; edge.forEach(([i, j]) => { const n = j * W + i; if (!seen[n] && near(n * 4)) { seen[n] = 1; q.push(n); } });
  let removed = 0; while (q.length) { const n = q.pop(); p[n * 4 + 3] = 0; removed++; const i = n % W, j = (n / W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, bb]) => { const ii = i + a, jj = j + bb; if (ii < 0 || jj < 0 || ii >= W || jj >= H) return; const m = jj * W + ii; if (seen[m]) return; seen[m] = 1; if (near(m * 4)) q.push(m); }); }
  // soften the cut edge by one pixel
  for (let n = 0; n < W * H; n++) { if (p[n * 4 + 3] === 0) continue; const i = n % W, j = (n / W) | 0; let t = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, bb]) => { const ii = i + a, jj = j + bb; if (ii >= 0 && jj >= 0 && ii < W && jj < H && p[(jj * W + ii) * 4 + 3] === 0) t++; }); if (t) p[n * 4 + 3] = 255 - t * 50; }
  x.putImageData(d, 0, 0); return { src: c.toDataURL("image/png"), removed: removed / (W * H) };
}
export function MatchingSet({ prompt, makeVariants, pullImage, onPick }) {
  const [busy, setBusy] = useState(false); const [items, setItems] = useState([]); const [err, setErr] = useState("");
  const go = async (n) => { setBusy(true); setErr(""); setItems([]);
    try { const v = await makeVariants(prompt, n); if (!v || !v.length) { setErr("Couldn't plan the set just now."); setBusy(false); return; }
      for (const vp of v.slice(0, n)) { const s = await pullImage(vp); setItems((a) => [...a, { prompt: vp, src: s || null }]); } } catch (e) { setErr("The set stopped part-way."); }
    setBusy(false); };
  return (<div className="lp-card lp-set"><h4>Matching set</h4><div className="lp-note">Same style, same character, same light - a series for a story, a shop or a post.</div>
    <div className="lp-row"><button className="lp-btn pri" disabled={busy || !prompt} onClick={() => go(4)}>{busy ? "Making the set..." : "Make a set of 4"}</button><button className="lp-btn" disabled={busy || !prompt} onClick={() => go(6)}>Set of 6</button></div>
    {err && <div className="lp-err">{err}</div>}
    {items.length > 0 && <div className="lp-grid">{items.map((it, i) => (<div key={i}>{it.src ? <img src={it.src} alt={it.prompt.slice(0, 80)} onClick={() => onPick && onPick(it.src)} /> : <div className="lp-note">Couldn't make this one.</div>}</div>))}</div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  VIDEO · SUBTITLES, A MUSIC BED, and THE SAME CHARACTER IN THE NEXT CLIP.
// ════════════════════════════════════════════════════════════════════════════
export function evenSegments(text, seconds) {
  const parts = String(text || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g) || []; const lines = [];
  parts.forEach((pt) => { const w = pt.trim().split(" "); for (let i = 0; i < w.length; i += 8) lines.push(w.slice(i, i + 8).join(" ")); });
  const total = lines.reduce((s, l) => s + l.length, 0) || 1; let t = 0; return lines.filter(Boolean).map((l) => { const d = Math.max(1, seconds * l.length / total); const s = { start: t, end: t + d, text: l }; t += d; return s; });
}
export const toSRT = (segs) => segs.map((s, i) => (i + 1) + "\n" + tstr(s.start).replace(".", ",") + " --> " + tstr(s.end).replace(".", ",") + "\n" + s.text + "\n").join("\n");
export const toVTT = (segs) => "WEBVTT\n\n" + segs.map((s) => tstr(s.start) + " --> " + tstr(s.end) + "\n" + s.text + "\n").join("\n");
export function VideoPlus({ src, loadFfmpeg, transcribe, audioUrl, onResult, keepFrame }) {
  const [busy, setBusy] = useState(""); const [segs, setSegs] = useState(null); const [out, setOut] = useState(null); const [err, setErr] = useState(""); const [vol, setVol] = useState(0.35);
  const [priv, setPriv] = useState(() => { try { return localStorage.getItem("spine.subs.private") === "1"; } catch (e) { return false; } });
  const ff = async () => { const f = await loadFfmpeg((m) => setBusy(String(m || "").slice(0, 60))); if (!f) throw new Error("The video engine didn't load."); return f; };
  const subtitles = async () => { setErr(""); setBusy("Listening to the video...");
    try { const f = await ff(); await f.writeFile("in.mp4", await fetchBytes(src)); await f.exec(["-i", "in.mp4", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "a.mp3"]);
      const a = await f.readFile("a.mp3"); const durOut = []; const d = await dataUrlOf(new Blob([a], { type: "audio/mpeg" }));
      setBusy(priv ? "Listening on this phone (private)..." : "Listening to the video..."); const t = await transcribe(d, true, priv, (m) => setBusy(String(m || "").slice(0, 60))); if (!t || !t.text) { setErr("No speech found to subtitle."); setBusy(""); return; }
      const v = document.createElement("video"); v.src = src; await new Promise((r) => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 4000); }); durOut.push(v.duration || 10);
      const sg = (t.segments && t.segments.length) ? t.segments : evenSegments(t.text, durOut[0]); setSegs(sg);
      setBusy("Adding the subtitle track..."); await f.writeFile("s.srt", new TextEncoder().encode(toSRT(sg)));
      await f.exec(["-i", "in.mp4", "-i", "s.srt", "-map", "0", "-map", "1", "-c", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "out.mp4"]);
      const o = await f.readFile("out.mp4"); const url = URL.createObjectURL(new Blob([o], { type: "video/mp4" })); setOut({ url, kind: "subtitles" }); onResult && onResult(url);
    } catch (e) { setErr(String(e && e.message || e).slice(0, 140)); } setBusy(""); };
  const music = async (url) => { setErr(""); setBusy("Laying the music under the video...");
    try { const f = await ff(); await f.writeFile("in.mp4", await fetchBytes(src)); await f.writeFile("m.audio", await fetchBytes(url));
      await f.exec(["-i", "in.mp4", "-stream_loop", "-1", "-i", "m.audio", "-filter_complex", "[1:a]volume=" + vol + "[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", "mix.mp4"]).catch(() => {});
      let o = null; try { o = await f.readFile("mix.mp4"); } catch (e) {}
      if (!o || o.length < 1000) { await f.exec(["-i", "in.mp4", "-stream_loop", "-1", "-i", "m.audio", "-map", "0:v", "-map", "1:a", "-filter:a", "volume=" + vol, "-c:v", "copy", "-c:a", "aac", "-shortest", "mix2.mp4"]); o = await f.readFile("mix2.mp4"); }
      const u = URL.createObjectURL(new Blob([o], { type: "video/mp4" })); setOut({ url: u, kind: "music" }); onResult && onResult(u);
    } catch (e) { setErr(String(e && e.message || e).slice(0, 140)); } setBusy(""); };
  const pickMusic = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "audio/*"; i.onchange = () => { const f = i.files && i.files[0]; if (f) music(URL.createObjectURL(f)); }; i.click(); };
  const keep = async () => { try { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.src = src; v.muted = true; await new Promise((r) => { v.onloadeddata = r; setTimeout(r, 5000); });
      v.currentTime = Math.max(0, (v.duration || 1) - 0.1); await new Promise((r) => { v.onseeked = r; setTimeout(r, 3000); }); const c = document.createElement("canvas"); c.width = v.videoWidth || 640; c.height = v.videoHeight || 360; c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      keepFrame && keepFrame(c.toDataURL("image/jpeg", 0.88)); setOut({ kind: "kept" }); } catch (e) { setErr("Couldn't take the frame."); } };
  return (<div className="lp-card lp-video"><h4>Finish the video</h4>
    <div className="lp-row"><button className="lp-btn pri" disabled={!!busy} onClick={subtitles}>Add subtitles</button>
    <label className="lp-note" style={{ display: "flex", gap: 6, alignItems: "center" }} data-lp="privsubs"><input type="checkbox" checked={priv} onChange={(e) => { setPriv(e.target.checked); try { localStorage.setItem("spine.subs.private", e.target.checked ? "1" : "0"); } catch (_) {} }} /> Private: write the words on this phone (English, free - nothing is uploaded)</label>
      <button className="lp-btn" disabled={!!busy || !audioUrl} onClick={() => music(audioUrl)}>Add my latest music</button><button className="lp-btn" disabled={!!busy} onClick={pickMusic}>Add music from a file</button>
      <button className="lp-btn" disabled={!!busy} onClick={keep}>Keep this character for the next clip</button></div>
    <label className="lp-note" style={{ display: "flex", gap: 8, alignItems: "center" }}>Music volume <input type="range" min="0.05" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
    {busy && <div className="lp-note">{busy}</div>}{err && <div className="lp-err">{err}</div>}
    {out && out.kind === "kept" && <div className="lp-note">Kept. The next video you make starts from this frame, so the same character carries on.</div>}
    {out && out.url && <div style={{ marginTop: 8 }}><video src={out.url} controls playsInline style={{ width: "100%", borderRadius: 10 }}>{segs && <track kind="subtitles" default srcLang="en" label="Subtitles" src={"data:text/vtt;charset=utf-8," + encodeURIComponent(toVTT(segs))} />}</video>
      <div className="lp-row"><a className="lp-btn" href={out.url} download="spine-video.mp4">Save the video</a>{segs && <button className="lp-btn" onClick={() => saveFile(new Blob([toSRT(segs)], { type: "text/plain" }), "subtitles.srt")}>Save subtitles (.srt)</button>}</div></div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  MOVIE · A WATCHABLE ROUGH CUT: a picture and a spoken line for each shot,
//  slowly pushed in, cut together with the music on the phone.
// ════════════════════════════════════════════════════════════════════════════
export function shotsOf(plan) { return String(plan || "").split("\n").map((l) => l.trim()).filter((l) => /^SHOT\b[^:\n]{0,24}:/i.test(l)).map((l) => l.replace(/^SHOT[^:]{0,24}:\s*/i, "").trim()).filter(Boolean).slice(0, 8); }
export function RoughCut({ plan, title, pullImage, pullVoice, loadFfmpeg, musicUrl }) {
  const [busy, setBusy] = useState(""); const [url, setUrl] = useState(null); const [err, setErr] = useState(""); const [lane, setLane] = useState("");
  const go = async () => { setErr(""); setUrl(null); setLane(""); const shots = shotsOf(plan); if (!shots.length) { setErr("The plan has no SHOT lines to cut."); return; }
    try {
      // 1. a picture and a spoken line for every shot (made once, used by whichever lane cuts)
      const got = [];
      for (let i = 0; i < shots.length; i++) { setBusy("Shot " + (i + 1) + " of " + shots.length + ": picture and voice...");
        const img = await pullImage("Cinematic film still, 16:9, no text: " + shots[i]); const v = await pullVoice(shots[i].slice(0, 300));
        if (img) got.push({ img, voice: v && v.audioUrl ? v.audioUrl : null }); }
      if (!got.length) throw new Error("No shots could be made.");
      // 2. FAST LANE (batch 14): the phone's own video encoder - smooth moves, cross-fades, a title
      try { const FC = await import("./fastCut.js");
        if (await FC.canFastCut()) { const r = await FC.fastCut({ shots: got, title, musicUrl, onProgress: (m) => setBusy(String(m || "").slice(0, 60)) });
          setUrl(URL.createObjectURL(r.blob)); setLane("fast"); setBusy(""); return; } } catch (e) { /* falls back to FFmpeg below */ }
      // 3. FFmpeg lane - works on every phone, slower
      const f = await loadFfmpeg((m) => setBusy(String(m || "").slice(0, 60))); if (!f) throw new Error("The video engine didn't load.");
      const parts = [];
      for (let i = 0; i < got.length; i++) { setBusy("Cutting shot " + (i + 1) + " of " + got.length + "...");
        const img = got[i].img, va = got[i].voice;
        await f.writeFile("i" + i + ".img", await fetchBytes(img)); let dur = 3.5;
        if (va) { await f.writeFile("v" + i + ".mp3", await fetchBytes(va)); const a = new Audio(va); await new Promise((r) => { a.onloadedmetadata = r; a.onerror = r; setTimeout(r, 4000); }); dur = Math.max(2.5, Math.min(12, (a.duration || 3) + 0.6)); }
        const fr = Math.round(dur * 25);
        const args = ["-loop", "1", "-i", "i" + i + ".img"].concat(va ? ["-i", "v" + i + ".mp3"] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]).concat(["-t", dur.toFixed(2), "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0012,1.12)':d=" + fr + ":s=1280x720:fps=25,format=yuv420p", "-af", "apad", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-ar", "44100", "-ac", "2", "p" + i + ".mp4"]);
        await f.exec(args); parts.push("p" + i + ".mp4"); }
      if (!parts.length) throw new Error("No shots could be made.");
      setBusy("Cutting it together..."); await f.writeFile("list.txt", new TextEncoder().encode(parts.map((p) => "file '" + p + "'").join("\n")));
      await f.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "cut.mp4"]); let final = "cut.mp4";
      if (musicUrl) { try { await f.writeFile("music.audio", await fetchBytes(musicUrl)); await f.exec(["-i", "cut.mp4", "-stream_loop", "-1", "-i", "music.audio", "-filter_complex", "[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", "final.mp4"]); final = "final.mp4"; } catch (e) {} }
      const o = await f.readFile(final); setUrl(URL.createObjectURL(new Blob([o], { type: "video/mp4" }))); setLane("ffmpeg");
    } catch (e) { setErr(String(e && e.message || e).slice(0, 140)); } setBusy(""); };
  return (<div className="lp-card lp-rough"><h4>Rough cut</h4><div className="lp-note">A picture and a spoken line for every shot, cut together{musicUrl ? " over your latest music" : ""}. Uses one picture and one voice line per shot from your allowance.</div>
    <div className="lp-row"><button className="lp-btn pri" disabled={!!busy} onClick={go}>{busy ? "Cutting..." : "Make a watchable rough cut"}</button></div>
    {busy && <div className="lp-note">{busy}</div>}{err && <div className="lp-err">{err}</div>}
    {url && <div style={{ marginTop: 8 }} data-lane={lane}><video src={url} controls playsInline style={{ width: "100%", borderRadius: 10 }} />{lane === "fast" && <div className="lp-note">Cut on your phone\u2019s own video engine - smooth moves and cross-fades.</div>}<div className="lp-row"><a className="lp-btn" href={url} download={(title || "rough-cut").replace(/[^\w\- ]/g, "") + ".mp4"}>Save the rough cut</a></div></div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  MUSIC · A MUSIC VIDEO made on the phone: the song drives the picture,
//  recorded with the song itself. Free.
// ════════════════════════════════════════════════════════════════════════════
export function MusicVideo({ audioUrl, title }) {
  const [busy, setBusy] = useState(false); const [url, setUrl] = useState(null); const [err, setErr] = useState(""); const [pct, setPct] = useState(0); const cv = useRef(null);
  const go = async (maxSec = 30) => { setErr(""); setUrl(null); setBusy(true);
    try { const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); const buf = await ac.decodeAudioData((await fetchBytes(audioUrl)).buffer);
      const c = cv.current; c.width = 720; c.height = 1280; const g = c.getContext("2d"); const src = ac.createBufferSource(); src.buffer = buf; const an = ac.createAnalyser(); an.fftSize = 256; const dest = ac.createMediaStreamDestination();
      src.connect(an); an.connect(dest); const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const ch = []; rec.ondataavailable = (e) => e.data && e.data.size && ch.push(e.data);
      const dur = Math.min(buf.duration, maxSec); const bins = new Uint8Array(an.frequencyBinCount); const t0 = ac.currentTime; let stop = false;
      const draw = () => { if (stop) return; an.getByteFrequencyData(bins); const t = ac.currentTime - t0; setPct(Math.min(100, Math.round(100 * t / dur)));
        const bass = bins.slice(0, 8).reduce((s, v) => s + v, 0) / 8 / 255; g.fillStyle = "rgba(10,10,18,0.35)"; g.fillRect(0, 0, 720, 1280);
        const hue = (t * 20) % 360; for (let i = 0; i < 64; i++) { const v = bins[i] / 255, a = i / 64 * Math.PI * 2 + t * 0.3, r = 180 + bass * 120 + v * 220; g.strokeStyle = "hsla(" + ((hue + i * 3) % 360) + ",80%," + (45 + v * 30) + "%,0.9)"; g.lineWidth = 6; g.beginPath(); g.moveTo(360 + Math.cos(a) * 160, 600 + Math.sin(a) * 160); g.lineTo(360 + Math.cos(a) * r, 600 + Math.sin(a) * r); g.stroke(); }
        g.fillStyle = "#fff"; g.font = "600 46px Georgia, serif"; g.textAlign = "center"; g.fillText(String(title || "").slice(0, 26), 360, 1060); g.font = "500 22px sans-serif"; g.fillStyle = "rgba(255,255,255,.6)"; g.fillText("Made on The Spine", 360, 1110);
        requestAnimationFrame(draw); };
      rec.start(250); src.start(); draw(); await new Promise((r) => setTimeout(r, dur * 1000)); stop = true; try { src.stop(); } catch (e) {} rec.stop(); await new Promise((r) => { rec.onstop = r; });
      setUrl(URL.createObjectURL(new Blob(ch, { type: type.split(";")[0] || "video/webm" }))); ac.close();
    } catch (e) { setErr("Couldn't make the video here: " + String(e && e.message || e).slice(0, 100)); } setBusy(false); };
  return (<div className="lp-card lp-mv"><h4>Music video</h4><div className="lp-note">Pictures that move with the beat, recorded with the song - free, made on your phone.</div>
    <canvas ref={cv} style={{ width: 120, height: 213, borderRadius: 8, background: "#0a0a12", display: busy || url ? "block" : "none", marginTop: 6 }} />
    <div className="lp-row"><button className="lp-btn pri" disabled={busy || !audioUrl} onClick={() => go(30)}>{busy ? "Recording " + pct + "%" : "Make a 30-second music video"}</button><button className="lp-btn" disabled={busy || !audioUrl} onClick={() => go(240)}>Whole song</button></div>
    {err && <div className="lp-err">{err}</div>}{url && <div style={{ marginTop: 8 }}><video src={url} controls playsInline style={{ width: "60%", borderRadius: 10 }} /><div className="lp-row"><a className="lp-btn" href={url} download="music-video">Save the music video</a></div></div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  VOICE · YOUR OWN VOICE (with consent) and A WHOLE VIDEO DUBBED IN TIME.
// ════════════════════════════════════════════════════════════════════════════
export function myVoiceId() { try { return localStorage.getItem("spine.myVoice") || ""; } catch (e) { return ""; } }
export function OwnVoice({ onMade }) {
  const [rec, setRec] = useState(null); const [secs, setSecs] = useState(0); const [ok, setOk] = useState(false); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [have, setHave] = useState(myVoiceId());
  const LINE = "This is my own voice, and I agree to The Spine using it to speak for me.";
  const start = async () => { setMsg(""); try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); const mr = new MediaRecorder(st); const ch = []; mr.ondataavailable = (e) => ch.push(e.data);
      mr.onstop = async () => { st.getTracks().forEach((t) => t.stop()); clearInterval(mr._iv); const d = await dataUrlOf(new Blob(ch, { type: mr.mimeType || "audio/webm" })); setRec(d); };
      mr.start(); mr._iv = setInterval(() => setSecs((s) => s + 1), 1000); setSecs(0); setRec(mr); } catch (e) { setMsg("The microphone isn't available."); } };
  const stop = () => { try { rec && rec.stop && rec.stop(); } catch (e) {} };
  const make = async () => { if (typeof rec !== "string") return; setBusy(true); setMsg("");
    try { const r = await fetch("/api/dub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clone", audio: rec, consent: true, statement: LINE, name: "My voice" }) }); const j = await r.json();
      if (j && j.voiceId) { localStorage.setItem("spine.myVoice", j.voiceId); setHave(j.voiceId); onMade && onMade(j.voiceId); setMsg("Your voice is ready. Turn it on below to use it everywhere The Spine speaks for you."); }
      else setMsg((j && (j.error || (j.notConnected && "The voice engine isn't connected yet."))) || "Couldn't make the voice just now."); } catch (e) { setMsg("Couldn't make the voice just now."); } setBusy(false); };
  const recording = rec && typeof rec !== "string";
  return (<div className="lp-card lp-own"><h4>Your own voice</h4><div className="lp-note">Only your own voice, only with your consent. Read this out, then anything you like for at least 30 seconds:<br /><b>"{LINE}"</b></div>
    <label className="lp-note" style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> This is my own voice and I consent to it being used to speak for me.</label>
    <div className="lp-row">{!recording ? <button className="lp-btn" disabled={!ok || busy} onClick={start}>{typeof rec === "string" ? "Record again" : "Record"}</button> : <button className="lp-btn pri" onClick={stop}>Stop ({secs}s)</button>}
      <button className="lp-btn pri" disabled={!ok || typeof rec !== "string" || busy} onClick={make}>{busy ? "Making your voice..." : "Make my voice"}</button>
      {have && <button className="lp-btn" onClick={() => { localStorage.removeItem("spine.myVoice"); setHave(""); setMsg("Your voice is switched off on this phone."); }}>Stop using my voice</button>}</div>
    {msg && <div className="lp-note">{msg}</div>}</div>);
}
export function DubVideo({ loadFfmpeg, transcribe, translateLines, pullVoice, langs }) {
  const [src, setSrc] = useState(null); const [lang, setLang] = useState((langs && langs[0]) || "Spanish"); const [busy, setBusy] = useState(""); const [url, setUrl] = useState(null); const [err, setErr] = useState("");
  const pick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "video/*"; i.onchange = () => { const f = i.files && i.files[0]; if (f) { setSrc(URL.createObjectURL(f)); setUrl(null); } }; i.click(); };
  const go = async () => { setErr(""); try { const f = await loadFfmpeg((m) => setBusy(String(m || "").slice(0, 60))); if (!f) throw new Error("The video engine didn't load.");
      setBusy("Listening to the video..."); await f.writeFile("in.mp4", await fetchBytes(src)); await f.exec(["-i", "in.mp4", "-vn", "-ac", "1", "-ar", "16000", "a.mp3"]);
      const t = await transcribe(await dataUrlOf(new Blob([await f.readFile("a.mp3")], { type: "audio/mpeg" })), true); if (!t || !t.text) throw new Error("No speech found to dub.");
      const v = document.createElement("video"); v.src = src; await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 4000); });
      const segs = (t.segments && t.segments.length ? t.segments : evenSegments(t.text, v.duration || 10)).slice(0, 40);
      setBusy("Translating " + segs.length + " lines into " + lang + "..."); const tr = await translateLines(segs.map((s) => s.text), lang); if (!tr || tr.length !== segs.length) throw new Error("The translation came back incomplete.");
      const ins = [], filt = []; for (let i = 0; i < segs.length; i++) { setBusy("Voicing line " + (i + 1) + " of " + segs.length + "..."); const vv = await pullVoice(tr[i]); if (!vv || !vv.audioUrl) continue;
        await f.writeFile("d" + i + ".mp3", await fetchBytes(vv.audioUrl)); ins.push("-i", "d" + i + ".mp3"); const k = ins.length / 2; filt.push("[" + k + ":a]adelay=" + Math.round(segs[i].start * 1000) + "|" + Math.round(segs[i].start * 1000) + "[d" + k + "]"); }
      if (!filt.length) throw new Error("No voice lines could be made.");
      setBusy("Putting the new voice in place..."); const n = filt.length; const mix = filt.join(";") + ";" + Array.from({ length: n }, (_, j) => "[d" + (j + 1) + "]").join("") + "amix=inputs=" + n + ":duration=longest:normalize=0[voice];[0:a]volume=0.12[bed];[bed][voice]amix=inputs=2:duration=first[a]";
      await f.exec(["-i", "in.mp4"].concat(ins).concat(["-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "dub.mp4"]));
      setUrl(URL.createObjectURL(new Blob([await f.readFile("dub.mp4")], { type: "video/mp4" }))); } catch (e) { setErr(String(e && e.message || e).slice(0, 140)); } setBusy(""); };
  return (<div className="lp-card lp-dub"><h4>Dub a whole video</h4><div className="lp-note">Every line translated and spoken at the moment it was said, with the original kept quietly underneath.</div>
    <div className="lp-row"><button className="lp-btn" onClick={pick}>{src ? "Choose another video" : "Choose a video"}</button>
      <select className="lp-btn" value={lang} onChange={(e) => setLang(e.target.value)}>{(langs || ["Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean", "Chinese", "Hindi", "Arabic"]).map((l) => <option key={l}>{l}</option>)}</select>
      <button className="lp-btn pri" disabled={!src || !!busy} onClick={go}>{busy ? "Dubbing..." : "Dub it"}</button></div>
    {busy && <div className="lp-note">{busy}</div>}{err && <div className="lp-err">{err}</div>}
    {url && <div style={{ marginTop: 8 }}><video src={url} controls playsInline style={{ width: "100%", borderRadius: 10 }} /><div className="lp-row"><a className="lp-btn" href={url} download="dubbed.mp4">Save the dubbed video</a></div></div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  DOCS · SUGGESTED EDITS you accept or reject, and TEMPLATES.
// ════════════════════════════════════════════════════════════════════════════
export const DOC_TEMPLATES = [
  ["Letter", "Write a formal letter. Sender address, date, recipient, subject line, greeting, three clear paragraphs, sign-off. Leave [brackets] for anything I must fill in."],
  ["CV / résumé", "Write a one-page CV: name and contact, a three-line profile, experience with achievements as numbers, skills, education. Leave [brackets] for my details."],
  ["Cover letter", "Write a cover letter for [job] at [company]: why them, two achievements that fit, a confident close. Under 300 words."],
  ["Report", "Write a short report with: summary, background, findings with a table, recommendations, next steps."],
  ["Essay", "Write an essay with a clear thesis, three argued sections with evidence, a counter-argument and a conclusion."],
  ["Meeting notes", "Write meeting notes: date, attendees, agenda, decisions, action items as a table (owner, task, due)."],
  ["Invoice", "Write an invoice: my business, client, invoice number and date, a table of items with quantity, price and total, tax, total due, payment details."],
  ["Lesson plan", "Write a lesson plan: objective, materials, a timed sequence (starter, teaching, activity, plenary), differentiation, assessment."],
  ["Business plan", "Write a one-page business plan: problem, solution, customers, how it makes money, competitors, costs, first 90 days."],
  ["Newsletter", "Write a newsletter: headline, a warm intro, three short stories with headings, one call to action, sign-off."]];
export function applySuggestion(html, s) { const i = html.indexOf(s.find); if (i < 0) return html; return html.slice(0, i) + s.replace + html.slice(i + s.find.length); }
export function SuggestEdits({ getText, getHtml, setHtml, suggest }) {
  const [busy, setBusy] = useState(false); const [list, setList] = useState(null); const [msg, setMsg] = useState("");
  const go = async () => { setBusy(true); setMsg(""); const r = await suggest(getText()); const ok = (r || []).filter((s) => s && s.find && typeof s.replace === "string" && getHtml().indexOf(s.find) >= 0).slice(0, 12); setList(ok); if (!ok.length) setMsg("No changes to suggest - it reads well."); setBusy(false); };
  const accept = (s, i) => { setHtml(applySuggestion(getHtml(), s)); setList((l) => l.filter((_, j) => j !== i)); };
  return (<div className="lp-card lp-sugg-box"><h4>Suggested edits</h4><div className="lp-row"><button className="lp-btn pri" disabled={busy} onClick={go}>{busy ? "Reading..." : "Suggest edits"}</button>
    {list && list.length > 1 && <button className="lp-btn" onClick={() => { let h = getHtml(); list.forEach((s) => { h = applySuggestion(h, s); }); setHtml(h); setList([]); }}>Accept all</button>}</div>
    {msg && <div className="lp-note">{msg}</div>}
    {(list || []).map((s, i) => (<div className="lp-sugg" key={i}><del>{s.find}</del> <ins>{s.replace}</ins><div className="lp-note">{s.why}</div>
      <div className="lp-row"><button className="lp-btn pri" onClick={() => accept(s, i)}>Accept</button><button className="lp-btn" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Reject</button></div></div>))}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  BLUEPRINT · MEASURE FROM A PHOTO. Tap the ends of something of known size
//  (a bank card, A4 paper, a coin), then tap anything else to measure it.
// ════════════════════════════════════════════════════════════════════════════
export const REFS = [["Bank card (long side)", 85.6], ["A4 paper (short side)", 210], ["US letter (short side)", 215.9], ["US quarter", 24.26], ["1 euro coin", 23.25], ["UK £1 coin", 23.43]];
export function PhotoMeasure({ onUse }) {
  const [src, setSrc] = useState(null); const [ref, setRef] = useState(0); const [pts, setPts] = useState([]); const [list, setList] = useState([]); const [name, setName] = useState(""); const box = useRef(null);
  const pick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.setAttribute("capture", "environment"); i.onchange = () => { const f = i.files && i.files[0]; if (f) { setSrc(URL.createObjectURL(f)); setPts([]); setList([]); } }; i.click(); };
  const scale = pts.length >= 2 ? REFS[ref][1] / Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0;
  // points are kept in the photo's own pixels, so a slanted or upright measurement is as true as a level one
  const [nat, setNat] = useState([1000, 1000]);
  const tap = (e) => { const r = box.current.getBoundingClientRect(); const p = [(e.clientX - r.left) / r.width * nat[0], (e.clientY - r.top) / r.height * nat[1]]; setPts((a) => a.length >= 4 ? [a[0], a[1], p] : [...a, p]); };
  const mm = pts.length === 4 ? Math.hypot(pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]) * scale : null;
  useEffect(() => { if (mm != null) { setList((l) => [...l, { name: name || ("Measurement " + (l.length + 1)), mm }]); setName(""); } /* eslint-disable-next-line */ }, [mm != null && pts[3] && pts[3][0]]);
  const hint = !src ? "" : pts.length < 2 ? "Tap both ends of the " + REFS[ref][0].toLowerCase() + "." : pts.length === 2 ? "Now tap the two ends of what you want to measure." : pts.length === 4 ? "Measured. Tap two more points to measure something else." : "Tap the other end.";
  return (<div className="lp-card lp-measure"><h4>Measure from a photo</h4>
    <div className="lp-row"><button className="lp-btn" onClick={pick}>{src ? "Another photo" : "Take or choose a photo"}</button>
      <select className="lp-btn" value={ref} onChange={(e) => { setRef(Number(e.target.value)); setPts([]); }}>{REFS.map((r, i) => <option key={i} value={i}>{r[0]} = {r[1]} mm</option>)}</select>
      <input className="lp-btn" placeholder="Name it (e.g. shelf depth)" value={name} onChange={(e) => setName(e.target.value)} /></div>
    {hint && <div className="lp-note">{hint}</div>}
    {src && <div className="lp-photo" ref={box} onClick={tap}><img src={src} alt="Photo to measure" onLoad={(e) => setNat([e.target.naturalWidth || 1000, e.target.naturalHeight || 1000])} />
      <svg viewBox={"0 0 " + nat[0] + " " + nat[1]} preserveAspectRatio="none">{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(4, nat[0] / 110)} fill={i < 2 ? "#e8c98a" : "#7ed4a8"} />)}
        {pts.length >= 2 && <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke="#e8c98a" strokeWidth={Math.max(2, nat[0] / 250)} />}{pts.length >= 4 && <line x1={pts[2][0]} y1={pts[2][1]} x2={pts[3][0]} y2={pts[3][1]} stroke="#7ed4a8" strokeWidth={Math.max(2, nat[0] / 250)} />}</svg></div>}
    {list.length > 0 && <div className="lp-note">{list.map((m, i) => <div key={i}><b>{m.name}</b>: {m.mm.toFixed(1)} mm ({(m.mm / 25.4).toFixed(2)} in)</div>)}<div className="lp-note">Accurate when the reference sits flat at the same distance as the thing you measure.</div>
      <div className="lp-row"><button className="lp-btn pri" onClick={() => onUse && onUse(list.map((m) => m.name + ": " + m.mm.toFixed(1) + " mm").join("; "))}>Use these sizes in the design</button></div></div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  AGENT · CHECK WITH ME FIRST, and A TIMELINE of what it did.
// ════════════════════════════════════════════════════════════════════════════
export function ApprovalCard({ steps, onDecide }) {
  const [on, setOn] = useState(steps.map(() => true));
  return (<div className="lp-card lp-approve"><h4>Check before it acts</h4><div className="lp-note">The agent wants to do these things. Untick anything you don't want.</div>
    {steps.map((s, i) => (<label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "8px 0", fontSize: 13 }}><input type="checkbox" checked={on[i]} onChange={(e) => setOn((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} />
      <span><b>{{ lookup: "Look up", image: "Make a picture", tool: "Build a tool", voice: "Speak", notify: "Send to my phone" }[s.kind] || s.kind}</b> - {s.label}{s.cost ? <span className="lp-note"> ({s.cost})</span> : null}</span></label>))}
    <div className="lp-row"><button className="lp-btn pri" onClick={() => onDecide(steps.filter((_, i) => on[i]))}>Go ahead ({on.filter(Boolean).length})</button><button className="lp-btn" onClick={() => onDecide([])}>Don't do any</button></div></div>);
}
export function Timeline({ items }) {
  if (!items || !items.length) return null;
  return (<div className="lp-card lp-timeline"><h4>What it did</h4><ol className="lp-tl">{items.map((it, i) => (<li key={i}><span className="t">{new Date(it.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
    <span>{{ lookup: "Looked up", image: "Made a picture", tool: "Built a tool", voice: "Spoke", plan: "Planned", notify: "Sent to my phone" }[it.kind] || it.kind}: {String(it.label || "").slice(0, 90)}</span><span className={"s " + (it.status || "done")}>{it.status || "done"}</span></li>))}</ol></div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  TOOL · ITS OWN APP ON THE HOME SCREEN.
// ════════════════════════════════════════════════════════════════════════════
export function homeScreenUrl(id, packed) { try { const u = new URL(location.href); u.search = "?app=" + encodeURIComponent(id); u.hash = packed ? "c=" + packed : ""; return u.toString(); } catch (e) { return "?app=" + id; } }
// The tool itself rides in the link (after #, so it never reaches a server). On an iPhone a
// home-screen app has its own storage, separate from Safari - without this it would open empty.
const b64u = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (t) => { const s = atob(String(t).replace(/-/g, "+").replace(/_/g, "/")); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
export async function packApp(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  try { if (window.CompressionStream) { const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")); return "z" + b64u(new Uint8Array(await new Response(cs).arrayBuffer())); } } catch (e) {}
  return "j" + b64u(raw);
}
export async function unpackApp(t) {
  try { const kind = String(t || "")[0], body = unb64u(String(t).slice(1)); let bytes = body;
    if (kind === "z") { const ds = new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw")); bytes = new Uint8Array(await new Response(ds).arrayBuffer()); }
    return JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { return null; }
}
export function HomeScreenCard({ id, name, code, kind }) {
  const [shown, setShown] = useState(false); const [url, setUrl] = useState(homeScreenUrl(id)); const ios = /iPhone|iPad/.test(navigator.userAgent);
  useEffect(() => { let on = true; if (code) packApp({ id, name, kind: kind || "tool", code }).then((p) => { if (on) setUrl(homeScreenUrl(id, p)); }); return () => { on = false; }; }, [id, name, code, kind]);
  return (<div className="lp-card lp-home"><h4>Its own app</h4><div className="lp-row"><button className="lp-btn pri" onClick={() => { setShown(true); try { window.open(url, "_blank", "noopener"); } catch (e) {} }}>Put {String(name || "this tool").slice(0, 24)} on my home screen</button></div>
    {shown && <div className="lp-note">It opened on its own page. {ios ? "Tap Share, then Add to Home Screen." : "Open the browser menu and choose Install app or Add to Home screen."} It then opens straight into {name || "the tool"}, full screen, like any app.</div>}</div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  ASSISTANT · ITS OWN MEMORY AND A VOICE.
// ════════════════════════════════════════════════════════════════════════════
export function withMemory(assistant) {
  const mem = (assistant && Array.isArray(assistant.memory) ? assistant.memory : []).slice(-30);
  if (!mem.length) return assistant; return { ...assistant, instruction: String(assistant.instruction || "") + "\n\nTHINGS YOU REMEMBER ABOUT THE PERSON (use them naturally, never list them):\n- " + mem.join("\n- ") };
}
export function rememberFrom(text) { const m = String(text || "").match(/\b(?:please\s+)?remember(?:\s+that)?\s+(.{3,200}?)[.!]?\s*$/i); return m ? m[1].trim() : null; }
export function AssistantMemory({ assistant, onChange }) {
  const [txt, setTxt] = useState(""); const mem = (assistant && assistant.memory) || [];
  return (<div className="lp-card lp-amem"><h4>{(assistant && assistant.name) || "Assistant"} remembers</h4>
    {mem.length ? mem.map((m, i) => (<div key={i} className="lp-row" style={{ marginTop: 4 }}><span style={{ flex: 1, fontSize: 13 }}>{m}</span><button className="lp-btn" onClick={() => onChange({ ...assistant, memory: mem.filter((_, j) => j !== i) })}>Forget</button></div>)) : <div className="lp-note">Nothing yet. Say "remember that..." while talking to it, or add something here.</div>}
    <div className="lp-row"><input className="lp-btn" style={{ flex: 1 }} placeholder="Something it should remember" value={txt} onChange={(e) => setTxt(e.target.value)} /><button className="lp-btn pri" disabled={!txt.trim()} onClick={() => { onChange({ ...assistant, memory: [...mem, txt.trim()].slice(-30) }); setTxt(""); }}>Remember</button></div>
    <div className="lp-row"><span className="lp-note" style={{ marginTop: 0 }}>Voice:</span>{[["off", "Off"], ["phone", "Phone voice"], ["studio", "Studio voice"], ["mine", "My voice"]].map(([k, l]) => (<button key={k} className={"lp-btn" + ((assistant.voice || "off") === k ? " pri" : "")} disabled={k === "mine" && !myVoiceId()} onClick={() => onChange({ ...assistant, voice: k })}>{l}</button>))}</div></div>);
}

// ════════════════════════════════════════════════════════════════════════════
//  WEBSITE · TAP TO EDIT, and FORMS THAT COLLECT REPLIES.
//  Tap-to-edit runs inside the preview: words become editable where they sit,
//  a tapped picture can be swapped for one from the phone, and "Save edits"
//  takes the page back out clean. Replies go through FormSubmit - free, no key,
//  no account - straight to the owner's email, and it works on any host.
// ════════════════════════════════════════════════════════════════════════════
export const SITE_EDIT_SCRIPT = `<style id="__spineEditCss">[data-sedit]{outline:1px dashed rgba(184,147,90,.7);outline-offset:2px;cursor:text}[data-sedit]:focus{outline:2px solid #B8935A;background:rgba(184,147,90,.08)}img[data-simg]{outline:2px dashed #7ec4d4;cursor:pointer}#__spineEditTip{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;background:#14161c;color:#fff;font:600 12px system-ui;padding:7px 12px;border-radius:999px;pointer-events:none;opacity:.92}</style>
<script id="__spineEdit">(function(){
var SEL="h1,h2,h3,h4,h5,h6,p,li,a,button,span,td,th,figcaption,blockquote,label,small,strong,em,dt,dd,summary";
function mark(){ document.querySelectorAll(SEL).forEach(function(n){ if(n.closest("script,style,svg")||n.id==="__spineEditTip") return; var own=false; n.childNodes.forEach(function(c){ if(c.nodeType===3&&c.textContent.trim()) own=true; }); if(own&&!n.querySelector("[data-sedit]")){ n.setAttribute("contenteditable","true"); n.setAttribute("data-sedit","1"); } });
  document.querySelectorAll("img").forEach(function(i){ i.setAttribute("data-simg","1"); }); }
function tip(){ var t=document.createElement("div"); t.id="__spineEditTip"; t.textContent="Tap any words to change them. Tap a picture to swap it."; document.body.appendChild(t); setTimeout(function(){ t.remove(); },4000); }
document.addEventListener("click",function(e){ var a=e.target.closest&&e.target.closest("a,button,form,input[type=submit]"); if(a) e.preventDefault();
  var im=e.target.closest&&e.target.closest("img[data-simg]"); if(!im) return; var f=document.createElement("input"); f.type="file"; f.accept="image/*";
  f.onchange=function(){ var file=f.files&&f.files[0]; if(!file) return; var r=new FileReader(); r.onload=function(){ var g=new Image(); g.onload=function(){ var s=Math.min(1,1400/Math.max(g.width,g.height)); var c=document.createElement("canvas"); c.width=Math.round(g.width*s); c.height=Math.round(g.height*s); c.getContext("2d").drawImage(g,0,0,c.width,c.height); im.src=c.toDataURL("image/jpeg",0.85); im.removeAttribute("srcset"); }; g.src=r.result; }; r.readAsDataURL(file); }; f.click(); },true);
document.addEventListener("submit",function(e){ e.preventDefault(); },true);
window.addEventListener("message",function(e){ var d=e.data||{}; if(!d.__spineEditGet) return;
  var root=document.documentElement.cloneNode(true);
  root.querySelectorAll("[data-sedit]").forEach(function(n){ n.removeAttribute("contenteditable"); n.removeAttribute("data-sedit"); });
  root.querySelectorAll("[data-simg]").forEach(function(n){ n.removeAttribute("data-simg"); });
  ["#__spineEdit","#__spineEditCss","#__spineEditTip"].forEach(function(s){ var x=root.querySelector(s); if(x) x.remove(); });
  parent.postMessage({__spineEditHtml:"<!DOCTYPE html>\\n"+root.outerHTML,id:d.id},"*"); });
if(document.readyState!=="loading"){ mark(); tip(); } else document.addEventListener("DOMContentLoaded",function(){ mark(); tip(); });
})();<\/script>`;
export function withEditing(html) { const h = String(html || ""); return /<\/body>/i.test(h) ? h.replace(/<\/body>/i, SITE_EDIT_SCRIPT + "</body>") : h + SITE_EDIT_SCRIPT; }

// Every <form> in the page sends its replies to the owner. Fields with no name get one from
// their label or placeholder, because a field without a name is silently dropped.
export function wireForms(html, to, subject) {
  const dest = String(to || "").trim(); if (!dest) return { html, forms: 0 };
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html"); const forms = doc.querySelectorAll("form"); let n = 0;
  forms.forEach((f) => { n++; f.setAttribute("action", "https://formsubmit.co/" + encodeURIComponent(dest)); f.setAttribute("method", "POST"); f.removeAttribute("onsubmit");
    const hid = (k, v) => { let x = f.querySelector('input[name="' + k + '"]'); if (!x) { x = doc.createElement("input"); x.type = "hidden"; x.name = k; f.insertBefore(x, f.firstChild); } x.value = v; };
    hid("_subject", (subject || "New reply from your website").slice(0, 120)); hid("_template", "table");
    let i = 0; f.querySelectorAll("input,textarea,select").forEach((el) => { if (el.name || el.type === "submit" || el.type === "button" || el.type === "hidden") return; i++;
      const lab = (el.id && doc.querySelector('label[for="' + el.id + '"]')) || el.closest("label"); const base = (lab && lab.textContent) || el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.type || "field";
      el.setAttribute("name", (String(base).trim().replace(/\s+/g, " ").slice(0, 40) || "field") + (i > 1 && !lab && !el.getAttribute("placeholder") ? " " + i : "")); }); });
  // the page's own script may cancel the send (a pretend "thanks"); the real send goes first
  if (n) { const s = doc.createElement("script"); s.textContent = "document.addEventListener('submit',function(e){var f=e.target;if(f&&/formsubmit\\.co/.test(f.action)){e.stopImmediatePropagation();}},true);"; doc.head.appendChild(s); }
  return { html: "<!DOCTYPE html>\n" + doc.documentElement.outerHTML, forms: n };
}
export function SiteTools({ html, onSave, frameRef, editing, setEditing, defaultTo }) {
  const [to, setTo] = useState(() => { try { return localStorage.getItem("spine.site.replyTo") || defaultTo || ""; } catch (e) { return defaultTo || ""; } }); const [msg, setMsg] = useState("");
  const hasForm = /<form[\s>]/i.test(String(html || ""));
  const save = () => { const f = frameRef && frameRef.current; if (!f || !f.contentWindow) { setMsg("Open the preview first."); return; } const id = Math.random().toString(36).slice(2);
    const on = (e) => { if (e.source !== f.contentWindow || !e.data || e.data.id !== id || !e.data.__spineEditHtml) return; window.removeEventListener("message", on); onSave(e.data.__spineEditHtml); setEditing(false); setMsg("Saved. Your changes are in the site now."); };
    window.addEventListener("message", on); f.contentWindow.postMessage({ __spineEditGet: true, id }, "*"); setTimeout(() => window.removeEventListener("message", on), 5000); };
  const wire = () => { const r = wireForms(html, to); if (!r.forms) { setMsg("This page has no form yet. Ask Refine to add a contact form, then come back."); return; } try { localStorage.setItem("spine.site.replyTo", to.trim()); } catch (e) {} onSave(r.html); setMsg("Done - " + r.forms + " form" + (r.forms > 1 ? "s" : "") + " now send replies to " + to.trim() + ". The first reply brings a one-time email from FormSubmit to confirm; click it once and every reply after lands straight in your inbox."); };
  return (<div className="lp-card lp-site"><h4>Edit and collect replies</h4>
    <div className="lp-row">{!editing ? <button className="lp-btn pri" onClick={() => { setMsg(""); setEditing(true); }}>Tap to edit the page</button> : <><button className="lp-btn pri" onClick={save}>Save edits</button><button className="lp-btn" onClick={() => setEditing(false)}>Cancel</button></>}</div>
    {editing && <div className="lp-note">Tap any words in the preview to change them; tap a picture to swap it for one of yours.</div>}
    <div className="lp-row"><input className="lp-btn" style={{ flex: 1, minWidth: 180 }} type="email" placeholder="Where should replies go? (your email)" value={to} onChange={(e) => setTo(e.target.value)} />
      <button className="lp-btn" disabled={!/\S+@\S+\.\S+|^[a-f0-9]{16,}$/i.test(to.trim())} onClick={wire}>{hasForm ? "Send form replies here" : "Wire up forms"}</button></div>
    <div className="lp-note">Free through FormSubmit - no account or key. Your email sits in the page's code; after the first reply FormSubmit gives you a private code you can paste here instead.</div>
    {msg && <div className="lp-note">{msg}</div>}</div>);
}
