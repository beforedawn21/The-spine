// ============================================================================
//  THE SCREENING ROOM (batch 16) - every film can be WATCHED, free.
//
//  The Movie leg wrote the script, drew the poster and the cast, and could
//  film real clips only when a paid video engine was switched on - so most
//  people got a production they could read but never watch. This turns the
//  script itself into a film that plays: a painted still for every scene
//  (free painter), slow camera moves across each one, cross-fades, the
//  dialogue spoken (the phone's natural voice when it is downloaded, or the
//  phone's own voice), subtitles, a score made on the phone, a title card
//  and end credits. Any real clips that were filmed take their scene's place.
//  It can be saved as a video file to keep or send.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { voiceDownloaded, speakNatural } from "./onDevice15.js";
import { castVideo } from "./devices17.js";

// ── reading the script ────────────────────────────────────────────────────────
const HEAD = /^(LOGLINE|TONE|THE FIVE BEATS|CHARACTERS|SCENE BREAKDOWN|OPENING SCENE|POSTER|CAST|READ|SHOT(?: \d)?|EPISODE|BIBLE-[A-Z]+|TITLE)\s*:?/i;
export function readFilm(text) {
  const t = String(text || "").replace(/\r/g, "");
  const line = (label) => { const m = t.match(new RegExp("^\\**" + label + "\\**\\s*:[ \\t]*(.+)$", "im")); return m ? m[1].replace(/\*+/g, "").trim() : ""; };
  const section = (label) => {
    const re = new RegExp("^[#*\\s]*" + label + "[*:\\s]*$|^[#*\\s]*" + label + "\\s*:", "im"); const m = t.match(re); if (!m) return "";
    const rest = t.slice(m.index + m[0].length); const lines = rest.split("\n"); const out = [];
    for (const l of lines) { const c = l.replace(/^[#*\s]+/, ""); if (out.length && HEAD.test(c) && !new RegExp("^" + label, "i").test(c)) break; out.push(l); }
    return out.join("\n").trim();
  };
  const title = (t.match(/^#\s*(.+)$/m) || [])[1] || line("TITLE") || "";
  const logline = line("LOGLINE");
  const tone = line("TONE");
  const shots = [line("SHOT"), line("SHOT 2"), line("SHOT 3")].filter((x) => x && x.length > 8);
  const scenes = section("SCENE BREAKDOWN").split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").replace(/\*+/g, "").trim()).filter((l) => l.length > 12).slice(0, 10);
  // dialogue from the opening scene: "NAME: words" or a NAME line followed by the words
  const open = section("OPENING SCENE").split("\n"); const lines = []; let who = "";
  for (let i = 0; i < open.length; i++) {
    const l = open[i].replace(/\*+/g, "").trim(); if (!l) { who = ""; continue; }
    const a = l.match(/^([A-Z][A-Z .'-]{1,24})(?:\s*\([^)]*\))?\s*:\s*(.+)$/);
    if (a && !/^(INT|EXT)\b/.test(a[1])) { lines.push({ who: titleCase(a[1]), say: a[2] }); who = ""; continue; }
    if (/^[A-Z][A-Z .'-]{1,24}(\s*\([^)]*\))?$/.test(l) && !/^(INT|EXT|CUT|FADE|THE END)\b/.test(l)) { who = titleCase(l.replace(/\(.*\)/, "").trim()); continue; }
    if (who && !/^\(/.test(l)) { lines.push({ who, say: l }); who = ""; }
  }
  const cast = (line("CAST") || "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const read = line("READ");
  return { title: title.replace(/\*+/g, "").trim(), logline, tone, shots, scenes, lines: lines.slice(0, 14), cast, read };
}
function titleCase(s) { return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

// The running order: a title card, the opening shot with its dialogue, then each scene.
export function filmPlan(film, opts) {
  const o = opts || {}; const look = (film.tone ? film.tone.split(/[.;]/)[0] + ". " : "") + "Cinematic film still, 16:9 widescreen, anamorphic, dramatic lighting, no text, no captions, no watermark.";
  const plan = [{ kind: "title", text: film.title || o.title || "Your film", sub: film.logline, img: o.poster || null, prompt: o.poster ? null : (film.shots[0] || film.logline || o.title) + ". " + look, secs: 5.5 }];
  const first = film.shots[0] || film.scenes[0] || film.logline;
  const talk = film.lines.slice(0, 8);
  plan.push({ kind: "shot", prompt: first + ". " + look, clip: (o.clips || [])[0] || null, text: "", secs: 5 });
  // dialogue over the opening scene: two lines per picture, the picture changing as the scene goes on
  for (let i = 0; i < talk.length; i += 2) {
    plan.push({ kind: "talk", prompt: (film.shots[1 + (i >> 2)] || first) + ". " + look, clip: i === 0 ? null : ((o.clips || [])[1 + (i >> 2)] || null), say: talk.slice(i, i + 2), secs: 0 });
  }
  film.scenes.slice(talk.length ? 1 : 0, 9).forEach((sc, k) => plan.push({ kind: "scene", prompt: sc + ". " + look, text: sc, clip: (o.clips || [])[k + 2] || null, secs: 0 }));
  plan.push({ kind: "end", text: "The End", credits: [(film.title || o.title || "Your film")].concat(film.cast.map((c) => c.split(/[,.-]/)[0])).concat(["Made on The Spine"]), secs: 6 });
  return plan;
}

// ── a score made on the phone: slow chords that suit the tone ─────────────────
function makeScore(ac, dest, tone) {
  const dark = /dark|tense|horror|noir|grim|thriller|cold|bleak|haunt|dread|menac/i.test(tone || "");
  const roots = dark ? [57, 53, 48, 52] : [48, 55, 57, 53]; // A min F C E  or  C G A F
  const minor = dark ? [true, false, false, false] : [false, false, true, false];
  const out = ac.createGain(); out.gain.value = 0.0; out.connect(dest);
  out.gain.setTargetAtTime(0.16, ac.currentTime + 0.2, 1.5);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.connect(out);
  let stop = false; let bar = 0; const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const play = () => {
    if (stop) return; const now = ac.currentTime; const r = roots[bar % 4]; const notes = [r, r + (minor[bar % 4] ? 3 : 4), r + 7, r + 12];
    notes.forEach((m, i) => {
      const os = ac.createOscillator(); os.type = i === 0 ? "sine" : "triangle"; os.frequency.value = f(m - (i === 0 ? 12 : 0));
      const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.18, now + 1.6); g.gain.linearRampToValueAtTime(0.0001, now + 4.4);
      os.connect(g); g.connect(lp); os.start(now); os.stop(now + 4.6);
    });
    // a soft high note now and then
    if (bar % 2 === 1) { const os = ac.createOscillator(); os.type = "sine"; os.frequency.value = f(r + 24 + (minor[bar % 4] ? 3 : 4)); const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.06, now + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, now + 3); os.connect(g); g.connect(out); os.start(now); os.stop(now + 3.1); }
    bar++; setTimeout(play, 4000);
  };
  play();
  return { duck: (v) => { try { out.gain.setTargetAtTime(v, ac.currentTime, 0.3); } catch (e) {} }, end: () => { stop = true; try { out.gain.setTargetAtTime(0, ac.currentTime, 0.8); } catch (e) {} } };
}

const VOICE_ORDER = ["am_michael", "af_heart", "bm_george", "af_bella", "am_fenrir", "bf_emma", "af_nicole"];

export function ScreeningRoom({ script, title, poster, clips, pullImage, onClose, gate }) {
  const film = readFilm(script);
  const plan = useRef(null); if (!plan.current) plan.current = filmPlan(film, { title, poster, clips });
  const [stage, setStage] = useState("prep"); // prep | ready | playing | done
  const [note, setNote] = useState("Getting the film ready...");
  const [pics, setPics] = useState({});
  const [saving, setSaving] = useState(null);
  const [savedUrl, setSavedUrl] = useState(null);
  const cv = useRef(null), stopRef = useRef(false), acRef = useRef(null);

  // paint every scene before the lights go down (each picture is free)
  useEffect(() => {
    let dead = false;
    (async () => {
      if (gate) { const stop = await gate("screening", 1); if (stop) { setNote(stop); return; } }
      const p = plan.current; const need = p.map((s, i) => [s, i]).filter(([s]) => (s.prompt && !s.img && !s.clip));
      let done = 0; const byPrompt = {};
      for (const [s, i] of need) {
        if (dead) return;
        setNote("Painting scene " + (++done) + " of " + need.length + "...");
        let src = byPrompt[s.prompt] || null; if (!src) { try { src = await pullImage(s.prompt, false); } catch (e) {} if (src) byPrompt[s.prompt] = src; }
        if (src) { s.img = src; setPics((x) => ({ ...x, [i]: src })); }
      }
      // anything that would not paint borrows the poster or the nearest picture
      const any = p.find((s) => s.img) || {}; p.forEach((s) => { if (!s.img && !s.clip && s.kind !== "end") s.img = any.img || poster || null; });
      if (!dead) { setStage("ready"); setNote(""); }
    })();
    return () => { dead = true; stopRef.current = true; try { acRef.current && acRef.current.close(); } catch (e) {} };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function play(record) {
    stopRef.current = false; setStage("playing"); setSavedUrl(null);
    const c = cv.current; const ctx = c.getContext("2d"); const W = c.width = 1280, H = c.height = 720;
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); acRef.current = ac;
    const mix = ac.createGain(); mix.connect(ac.destination);
    const recDest = record && ac.createMediaStreamDestination ? ac.createMediaStreamDestination() : null; if (recDest) mix.connect(recDest);
    const score = makeScore(ac, mix, film.tone);
    const useNatural = await voiceDownloaded().catch(() => false);
    let rec = null, chunks = [];
    if (record && c.captureStream && window.MediaRecorder) {
      const stream = c.captureStream(30); if (recDest) recDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "";
      try { rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5000000 } : undefined); rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); }; rec.start(500); } catch (e) { rec = null; }
    }
    const imgs = {}; const load = (src) => imgs[src] || (imgs[src] = new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
    const vids = {}; const loadVid = (src) => vids[src] || (vids[src] = new Promise((res) => { const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.crossOrigin = "anonymous"; v.src = src; v.oncanplay = () => res(v); v.onerror = () => res(null); setTimeout(() => res(null), 8000); }));
    let prev = null; const voiceFor = {}; let vn = 0;

    // speaking: natural voice (heard in the saved film too) or the phone's own voice
    const speak = async (who, words) => {
      if (useNatural) {
        try {
          const v = who ? (voiceFor[who] || (voiceFor[who] = VOICE_ORDER[vn++ % VOICE_ORDER.length])) : "af_heart";
          const r = await speakNatural(words, v); const buf = await ac.decodeAudioData(await (await fetch(r.url)).arrayBuffer());
          const src = ac.createBufferSource(); src.buffer = buf; src.connect(mix); score.duck(0.05); src.start();
          await new Promise((z) => { src.onended = z; setTimeout(z, buf.duration * 1000 + 400); }); score.duck(0.16); return;
        } catch (e) {}
      }
      await new Promise((z) => { try { const u = new SpeechSynthesisUtterance(words); u.rate = 0.98; u.onend = z; u.onerror = z; score.duck(0.05); speechSynthesis.speak(u); setTimeout(z, 1200 + words.length * 75); } catch (e) { setTimeout(z, 1500 + words.length * 60); } });
      score.duck(0.16);
    };

    const draw = (pic, t, dur, seed, caption, fade, prevPic) => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const paint = (p, a, k) => {
        if (!p) return; ctx.globalAlpha = a;
        const pw = p.videoWidth || p.naturalWidth || W, ph = p.videoHeight || p.naturalHeight || H;
        const z = 1.08 + 0.12 * (k), dir = seed % 4; const s = Math.max(W / pw, H / ph) * z; const dw = pw * s, dh = ph * s;
        const ox = (dir === 0 ? -1 : dir === 1 ? 1 : 0) * (dw - W) * 0.5 * (k - 0.5), oy = (dir === 2 ? -1 : dir === 3 ? 1 : 0) * (dh - H) * 0.5 * (k - 0.5);
        ctx.drawImage(p, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh); ctx.globalAlpha = 1;
      };
      if (prevPic && fade < 1) paint(prevPic, 1, 1);
      paint(pic, Math.min(1, fade), Math.min(1, t / Math.max(1, dur)));
      // the look: vignette, letterbox, a little grain
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, H - 54, W, 54);
      for (let i = 0; i < 260; i++) { ctx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.04) + ")"; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      if (caption) {
        ctx.font = "600 34px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        wrap(ctx, caption, W - 220).slice(-3).forEach((l, i, a) => { const y = H - 82 - (a.length - 1 - i) * 42; ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(l, W / 2, y); ctx.fillStyle = "#fff"; ctx.fillText(l, W / 2, y); });
      }
    };
    const titleCard = (s, k) => {
      ctx.fillStyle = "rgba(0,0,0," + (0.35 + 0.25 * (1 - k)) + ")"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#f3e2b0"; ctx.font = "400 76px 'Instrument Serif', Georgia, serif"; ctx.globalAlpha = Math.min(1, k * 2);
      wrap(ctx, s.text, W - 200).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 10 + i * 80));
      if (s.sub) { ctx.font = "italic 28px Georgia, serif"; ctx.fillStyle = "#ddd"; wrap(ctx, s.sub, W - 300).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 90 + i * 36)); }
      ctx.globalAlpha = 1;
    };
    const run = (secs, frame) => new Promise((res) => { const t0 = performance.now(); const step = () => { if (stopRef.current) return res(); const t = (performance.now() - t0) / 1000; frame(t); if (t >= secs) return res(); requestAnimationFrame(step); }; step(); });

    const p = plan.current;
    for (let i = 0; i < p.length && !stopRef.current; i++) {
      const s = p[i]; let pic = null;
      if (s.clip) { const v = await loadVid(s.clip); if (v) { pic = v; try { v.currentTime = 0; await v.play(); } catch (e) {} } }
      if (!pic && s.img) pic = await load(s.img);
      if (s.kind === "title") { await run(s.secs, (t) => { draw(pic, t, s.secs, i, "", Math.min(1, t / 1.2), null); titleCard(s, Math.min(1, t / s.secs)); }); prev = pic; continue; }
      if (s.kind === "end") {
        score.end();
        await run(s.secs, (t) => { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center"; ctx.fillStyle = "#f3e2b0"; ctx.font = "400 64px 'Instrument Serif', Georgia, serif"; ctx.globalAlpha = Math.min(1, t); ctx.fillText(s.text, W / 2, H / 2 - 60); ctx.font = "24px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#bbb"; s.credits.slice(0, 6).forEach((c, k) => ctx.fillText(c, W / 2, H / 2 + 10 + k * 34 - t * 10)); ctx.globalAlpha = 1; });
        break;
      }
      if (s.kind === "talk") {
        let started = performance.now(); let spoken = false; let caption = "";
        const total = () => (performance.now() - started) / 1000;
        const speaking = (async () => { for (const ln of s.say) { if (stopRef.current) break; caption = (ln.who ? ln.who + ": " : "") + ln.say; await speak(ln.who, ln.say); } spoken = true; })();
        await new Promise((res) => { const step = () => { if (stopRef.current) return res(); draw(pic, total(), Math.max(6, s.say.length * 4), i, caption, Math.min(1, total() / 0.9), prev); if (spoken && total() > 2) return res(); requestAnimationFrame(step); }; step(); });
        await speaking; prev = pic; continue;
      }
      // a shot or a scene: narrate the scene line (not the opening shot - it plays silent, like a film)
      const words = s.kind === "scene" ? s.text : "";
      let caption = words; let narr = words ? speak(null, words) : null; let done = !narr; if (narr) narr.then(() => { done = true; });
      const minSecs = s.secs || 4.5; const t0 = performance.now();
      await new Promise((res) => { const step = () => { if (stopRef.current) return res(); const t = (performance.now() - t0) / 1000; draw(pic, t, Math.max(minSecs, 7), i, caption, Math.min(1, t / 0.9), prev); if (t >= minSecs && done) return res(); requestAnimationFrame(step); }; step(); });
      prev = pic;
    }
    try { speechSynthesis.cancel(); } catch (e) {}
    score.end();
    if (rec) {
      setSaving("Finishing your film file...");
      await new Promise((z) => { rec.onstop = z; try { rec.stop(); } catch (e) { z(); } });
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      setSavedUrl(URL.createObjectURL(blob)); setSaving(null);
    }
    setTimeout(() => { try { ac.close(); } catch (e) {} }, 1500);
    if (!stopRef.current) setStage("done");
  }

  const stop = () => { stopRef.current = true; try { speechSynthesis.cancel(); } catch (e) {} setStage("ready"); };
  const ext = savedUrl && /mp4/.test(savedUrl) ? "mp4" : "mp4";
  const name = (film.title || title || "film").replace(/[^\w -]/g, "").slice(0, 40) || "film";
  return (
    <div className="scr16" role="dialog" aria-label="Screening room">
      <div className="scr16-top"><b>{film.title || title || "Your film"}</b><button onClick={() => { stop(); onClose && onClose(); }} aria-label="Close">{"✕"}</button></div>
      <div className="scr16-screen"><canvas ref={cv} width="1280" height="720" />
        {stage === "prep" && <div className="scr16-over"><div className="scr16-spin" /> {note}<div className="scr16-thumbs">{Object.values(pics).slice(0, 8).map((s, i) => <img key={i} src={s} alt="" />)}</div></div>}
        {(stage === "ready" || stage === "done") && <div className="scr16-over"><button className="scr16-play" onClick={() => play(false)}>{"▶"} {stage === "done" ? "Watch again" : "Watch the film"}</button></div>}
      </div>
      <div className="scr16-bar">
        {stage === "playing" && <button onClick={stop}>{"■"} Stop</button>}
        {stage !== "playing" && stage !== "prep" && <button onClick={() => play(true)}>{"⬇"} Make a video file of it</button>}
        {saving && <span>{saving}</span>}
        {savedUrl && <a className="scr16-save" href={savedUrl} download={name + "." + ext}>Save your film</a>}
        {savedUrl && <button onClick={async () => { const v = document.getElementById("scr16-file"); const m = await castVideo(v); if (m) setSaving(m); }}>{"\uD83D\uDCFA"} Play on TV</button>}
        {savedUrl && <video id="scr16-file" src={savedUrl} playsInline style={{ display: "none" }} />}
        {savedUrl && navigator.share && <button onClick={async () => { try { const b = await (await fetch(savedUrl)).blob(); const f = new File([b], name + "." + ext, { type: b.type }); await navigator.share({ files: [f], title: name }); } catch (e) {} }}>Send it</button>}
      </div>
      <p className="scr16-note">{plan.current.length} scenes - the pictures are painted free, the score is made on your phone{film.lines.length ? ", and the lines are spoken" : ""}. Real filmed clips take a scene's place when you film them.</p>
    </div>
  );
}
function wrap(ctx, text, max) { const words = String(text || "").split(/\s+/); const out = []; let l = ""; for (const w of words) { const t = l ? l + " " + w : w; if (ctx.measureText(t).width > max && l) { out.push(l); l = w; } else l = t; } if (l) out.push(l); return out; }

export const SCREENING_CSS = `.scr16{position:fixed;inset:0;z-index:9000;background:#050505;display:flex;flex-direction:column;color:#eee;padding-top:env(safe-area-inset-top);}
.scr16-top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:16px}.scr16-top button{background:none;border:none;color:#eee;font-size:22px}
.scr16-screen{position:relative;flex:1;display:flex;align-items:center;justify-content:center;min-height:0}.scr16-screen canvas{width:100%;max-height:100%;aspect-ratio:16/9;background:#000;object-fit:contain}
.scr16-over{position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;font-size:15px;color:#ddd;text-align:center;padding:20px}
.scr16-play{font-size:20px;padding:14px 26px;border-radius:40px;border:none;background:#E8C060;color:#1a1405;font-weight:700}
.scr16-spin{width:28px;height:28px;border-radius:50%;border:3px solid #444;border-top-color:#E8C060;animation:scr16s 1s linear infinite}@keyframes scr16s{to{transform:rotate(360deg)}}
.scr16-thumbs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:520px}.scr16-thumbs img{width:76px;height:43px;object-fit:cover;border-radius:4px;opacity:.85}
.scr16-bar{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 14px calc(10px + env(safe-area-inset-bottom))}.scr16-bar button,.scr16-save{padding:10px 16px;border-radius:12px;border:1px solid #333;background:#151515;color:#eee;font:inherit;text-decoration:none}
.scr16-note{font-size:12px;color:#888;text-align:center;margin:0 14px 10px}`;
