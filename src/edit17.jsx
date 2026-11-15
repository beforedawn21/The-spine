// ============================================================================
//  EDITING, EVERYWHERE (batch 17) - change what was made without starting over.
//   - Tap to change: tap any part of a site, tool or prototype, say what to
//     change, and only that part changes.
//   - Change one part: for games and worlds, describe the part to change.
//   - Style: the colours it uses as swatches you can change, and type pairings.
//   - Tweak: the numbers that drive a game, tool or world (speed, gravity,
//     lives, sizes...) as sliders - changed instantly, no rebuild.
//   - Tone: for writing - more formal, more casual, shorter, longer, simpler.
//   - Undo / redo every change, and compare before and after side by side.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { FONTS } from "./invite16.js";

// ── reading the code ─────────────────────────────────────────────────────────
const TWEAKABLE = /(speed|gravity|jump|size|count|lives|life|time|timer|level|diff|spawn|rate|enem|health|hp|damage|radius|width|height|power|score|max|min|delay|duration|friction|bounce|accel|force|zoom|scale|volume|density|amount|number|steps|rows|cols|columns|grid)/i;
export function findTweaks(code) {
  const out = []; const re = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*[;,\n]/g; let m;
  while ((m = re.exec(String(code || ""))) && out.length < 14) {
    const name = m[2], v = Number(m[3]); if (!isFinite(v)) continue;
    if (!(/^[A-Z][A-Z0-9_]*$/.test(name) && name.length > 1) && !TWEAKABLE.test(name)) continue;
    if (out.some((t) => t.name === name)) continue;
    const isInt = !/\./.test(m[3]); const span = Math.max(isInt ? 10 : 1, Math.abs(v) * 3);
    out.push({ name, value: v, min: v < 0 ? -span : 0, max: v < 0 ? 0 : span, step: isInt ? 1 : Math.max(0.01, +(span / 100).toPrecision(1)), at: m.index });
  }
  return out;
}
export function setTweak(code, name, value) {
  const re = new RegExp("\\b(const|let|var)(\\s+" + name.replace(/\$/g, "\\$") + "\\s*=\\s*)(-?\\d+(?:\\.\\d+)?)");
  return String(code).replace(re, (all, k, mid) => k + mid + String(+Number(value).toPrecision(6)));
}
const norm = (h) => { h = h.toLowerCase(); return h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h; };
export function findColors(code) {
  const counts = {}; for (const m of String(code || "").matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) { const k = norm(m[0]); counts[k] = (counts[k] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
}
export function swapColor(code, from, to) {
  const f = norm(from); const short = f[1] === f[2] && f[3] === f[4] && f[5] === f[6] ? "#" + f[1] + f[3] + f[5] : null;
  let s = String(code).replace(new RegExp(f, "gi"), to); if (short) s = s.replace(new RegExp(short + "(?![0-9a-fA-F])", "gi"), to); return s;
}
export function withFonts(code, key) {
  const f = FONTS[key]; if (!f) return code; const href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(f.display) + ":wght@" + f.w + "&family=" + encodeURIComponent(f.body) + ":wght@400;600&display=swap";
  const tag = '<link rel="stylesheet" href="' + href + '" data-spine-fonts><style data-spine-fonts>body,button,input,textarea,select{font-family:\'' + f.body + '\',system-ui,sans-serif}h1,h2,h3,h4,.title,.headline{font-family:\'' + f.display + '\',serif}</style>';
  let s = String(code).replace(/<link[^>]*data-spine-fonts[^>]*>/gi, "").replace(/<style data-spine-fonts>[\s\S]*?<\/style>/gi, "");
  return /<\/head>/i.test(s) ? s.replace(/<\/head>/i, tag + "</head>") : /<body[^>]*>/i.test(s) ? s.replace(/<body([^>]*)>/i, (m) => tag + m) : tag + s;
}
// a tap in the preview picks one element and tells The Spine which
export const PICKER = `<script data-spine-picker>(function(){var last=null;function path(el){var p=[];while(el&&el.nodeType===1&&el.tagName!=='BODY'&&el.tagName!=='HTML'){var t=el.tagName.toLowerCase();if(el.id){p.unshift(t+'#'+el.id);break;}var i=1,s=el;while((s=s.previousElementSibling))if(s.tagName===el.tagName)i++;p.unshift(t+':nth-of-type('+i+')');el=el.parentElement;}return p.join(' > ');}
document.addEventListener('click',function(e){var el=e.target;if(!el||el===document.body)return;e.preventDefault();e.stopPropagation();if(last)last.style.outline=last.__o||'';last=el;el.__o=el.style.outline;el.style.outline='3px solid #E8C060';el.style.outlineOffset='2px';
parent.postMessage({__spinePick:true,path:path(el),html:el.outerHTML.slice(0,1800),text:(el.innerText||'').slice(0,300)},'*');},true);})();<\/script>`;
export function withPicker(doc) { return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, PICKER + "</body>") : doc + PICKER; }

export const PART_SYS = "You are editing something the person already has and likes. Change ONLY what they ask, in the part they point to. Keep everything else exactly as it is - same structure, same names, same design. Return the COMPLETE updated code in ONE fenced code block with the same language as the original, and nothing else.";
export const TONE_SYS = "Rewrite the piece in the way asked. Keep the meaning, the facts, the names and the format (keep any HTML or markdown structure). Return only the rewritten piece.";

// ── the bar under a result ───────────────────────────────────────────────────
export function EditBar({ kind, code, setCode, buildDoc, askAI, canUndo, canRedo, onUndo, onRedo, prevCode }) {
  const [tab, setTab] = useState(""); const [pick, setPick] = useState(null); const [ask, setAsk] = useState(""); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const frameRef = useRef(null);
  const dom = kind === "web" || kind === "tool" || kind === "proto";
  const tweaks = useMemo(() => findTweaks(code), [code]); const colors = useMemo(() => findColors(code), [code]);
  const pickDoc = useMemo(() => (tab === "tap" && dom ? withPicker(buildDoc(code)) : ""), [tab, code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab !== "tap") return undefined; const on = (e) => { const d = e.data || {}; if (!d.__spinePick || !frameRef.current || e.source !== frameRef.current.contentWindow) return; setPick({ path: d.path, html: d.html, text: d.text }); }; window.addEventListener("message", on); return () => window.removeEventListener("message", on); }, [tab]);
  const aiChange = async (instruction, part) => {
    setBusy(part ? "Changing just that part..." : "Making the change..."); setMsg("");
    const user = "THE CURRENT CODE:\n" + String(code).slice(0, 90000) + "\n\n" + (part ? "THE PART THEY TAPPED (CSS path: " + part.path + "):\n" + part.html + "\n\n" : "") + "THE CHANGE: " + instruction;
    const r = await askAI(PART_SYS, user, 8000);
    const m = String(r || "").match(/```[a-zA-Z]*\s*\n([\s\S]*?)(```|$)/); const next = m ? m[1].trim() : "";
    setBusy("");
    if (!next || next.length < String(code).replace(/```[a-z]*\n?|```/g, "").length * 0.4) { setMsg("That change didn't come back whole - nothing was changed. Try saying it another way."); return; }
    const fence = (String(code).match(/^```([a-zA-Z]*)/) || [])[1];
    setCode(fence != null ? "```" + fence + "\n" + next + "\n```" : next, part ? "Changed: " + (part.text || part.path).slice(0, 40) : "Changed: " + instruction.slice(0, 40));
    setAsk(""); setPick(null); setMsg("Done - Undo puts it back.");
  };
  const tone = async (how) => { setBusy("Rewriting..."); const r = await askAI(TONE_SYS, "MAKE IT " + how.toUpperCase() + ":\n\n" + code, 4000); setBusy(""); if (r && r.trim().length > 20) { setCode(r.trim(), "Tone: " + how); setMsg("Done - Undo puts it back."); } else setMsg("Couldn't rewrite it just now."); };
  const T = (k, l) => <button className={tab === k ? "on" : ""} onClick={() => { setTab(tab === k ? "" : k); setMsg(""); setPick(null); }}>{l}</button>;
  return (
    <div className="ed17">
      <div className="ed17-tabs">
        {dom && T("tap", "☝ Tap to change")}
        {!dom && kind !== "text" && T("part", "✎ Change one part")}
        {(dom || kind === "game" || kind === "world") && colors.length > 0 && T("style", "🎨 Style")}
        {tweaks.length > 0 && T("tweak", "⚙ Tweak")}
        {kind === "text" && T("tone", "🎚 Tone")}
        {prevCode && T("compare", "↔ Compare")}
        <span className="ed17-sp" />
        <button disabled={!canUndo} onClick={onUndo} aria-label="Undo">{"↶"} Undo</button>
        <button disabled={!canRedo} onClick={onRedo} aria-label="Redo">{"↷"} Redo</button>
      </div>
      {tab === "tap" && <div className="ed17-panel">
        <div className="ed17-hint">{pick ? "Picked: " + (pick.text ? "“" + pick.text.slice(0, 60) + "”" : pick.path) : "Tap the part you want to change."}</div>
        <iframe ref={frameRef} title="Tap to change" className="ed17-frame" sandbox="allow-scripts" srcDoc={pickDoc} />
        {pick && <div className="ed17-ask"><input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What should change about it?" /><button className="pri" disabled={!ask.trim() || !!busy} onClick={() => aiChange(ask, pick)}>{busy || "Change it"}</button></div>}
      </div>}
      {tab === "part" && <div className="ed17-panel"><div className="ed17-ask"><input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={kind === "game" ? "e.g. make the enemies slower, the hero blue, add a pause button" : "e.g. make the sky sunset orange, add three trees by the lake"} /><button className="pri" disabled={!ask.trim() || !!busy} onClick={() => aiChange(ask, null)}>{busy || "Change it"}</button></div></div>}
      {tab === "style" && <div className="ed17-panel">
        <div className="ed17-lbl">Colours it uses - tap to change</div>
        <div className="ed17-row">{colors.map((c) => <label key={c} className="ed17-col"><input type="color" value={c} onChange={(e) => setCode(swapColor(code, c, e.target.value), "Colour " + c + " → " + e.target.value)} /><span>{c}</span></label>)}</div>
        {dom && <><div className="ed17-lbl">Type</div><div className="ed17-row">{Object.entries(FONTS).map(([k, f]) => <button key={k} onClick={() => setCode(withFonts(code, k), "Type: " + f.display)}>{f.display}</button>)}</div></>}
      </div>}
      {tab === "tweak" && <div className="ed17-panel">{tweaks.map((t) => <label key={t.name} className="ed17-tw"><span>{t.name.replace(/_/g, " ").toLowerCase()}</span><input type="range" min={t.min} max={t.max} step={t.step} value={t.value} onChange={(e) => setCode(setTweak(code, t.name, e.target.value), "Tweak " + t.name, true)} /><b>{t.value}</b></label>)}<div className="ed17-hint">Changes apply straight away - press Play again to try it.</div></div>}
      {tab === "tone" && <div className="ed17-panel"><div className="ed17-row">{["more formal", "more casual", "warmer", "shorter", "longer", "simpler", "more persuasive", "funnier"].map((h) => <button key={h} disabled={!!busy} onClick={() => tone(h)}>{h[0].toUpperCase() + h.slice(1)}</button>)}</div>{busy && <div className="ed17-hint">{busy}</div>}</div>}
      {tab === "compare" && prevCode && <div className="ed17-panel"><div className="ed17-cmp"><figure><figcaption>Before</figcaption><iframe title="Before" sandbox="allow-scripts" srcDoc={kind === "text" ? prevCode : buildDoc(prevCode)} /></figure><figure><figcaption>Now</figcaption><iframe title="Now" sandbox="allow-scripts" srcDoc={kind === "text" ? code : buildDoc(code)} /></figure></div></div>}
      {msg && <div className="ed17-hint">{msg}</div>}
    </div>
  );
}
export const EDIT17_CSS = `.ed17{margin-top:12px;border:1px solid var(--stone,#ddd);border-radius:14px;padding:8px;background:var(--panel,#fff)}
.ed17-tabs{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ed17-tabs button,.ed17-row button{border:1px solid var(--stone,#ddd);background:var(--stone-l,#f6f3ee);color:inherit;border-radius:10px;padding:7px 10px;font:inherit;font-size:13px}.ed17-tabs button.on{outline:2px solid #E8C060}.ed17-tabs button:disabled{opacity:.45}.ed17-sp{flex:1}
.ed17-panel{margin-top:8px}.ed17-frame{width:100%;height:56vh;border:1px solid var(--stone,#ddd);border-radius:10px;background:#fff}
.ed17-ask{display:flex;gap:6px;margin-top:8px}.ed17-ask input{flex:1;min-width:0;padding:10px;border-radius:10px;border:1px solid var(--stone,#ddd);font:inherit;font-size:15px;background:var(--stone-l,#f6f3ee);color:inherit}.ed17-ask button{border:none;border-radius:10px;padding:0 14px;background:#E8C060;color:#1a1405;font:inherit;font-weight:700}
.ed17-hint{font-size:12px;opacity:.75;margin:6px 2px}.ed17-lbl{font-size:12px;opacity:.7;margin:8px 0 4px}.ed17-row{display:flex;flex-wrap:wrap;gap:6px}
.ed17-col{display:flex;flex-direction:column;align-items:center;font-size:10px;gap:2px}.ed17-col input{width:42px;height:34px;border:none;padding:0;background:none}
.ed17-tw{display:grid;grid-template-columns:110px 1fr 54px;gap:8px;align-items:center;font-size:13px;margin:6px 0}.ed17-tw input{width:100%}.ed17-tw b{text-align:right;font-variant-numeric:tabular-nums}
.ed17-cmp{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ed17-cmp figure{margin:0}.ed17-cmp figcaption{font-size:12px;opacity:.7;margin-bottom:4px}.ed17-cmp iframe{width:100%;height:44vh;border:1px solid var(--stone,#ddd);border-radius:10px;background:#fff}
@media (max-width:600px){.ed17-cmp{grid-template-columns:1fr}}`;
