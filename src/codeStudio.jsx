// ============================================================================
//  THE CODE STUDIO
//  Everything a person needs to make real software on a phone, around what the Website / App and
//  Tool legs build:
//    - live preview at phone, tablet or desktop size, beside or instead of the code
//    - the code itself, editable, with line numbers and search
//    - a console that catches every error and log from the running app
//    - "Fix it": the errors go to the builder, which returns a corrected version
//    - "Change it": ask for any change in words; tap an element first to point at it
//    - every version kept: undo, redo, compare, restore
//    - download the file, copy it, or share it
//  Nothing here needs a key; the builder is the same reasoning centre the legs already use.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";

const DEVICES = [{ k: "phone", w: 390, label: "Phone" }, { k: "tablet", w: 820, label: "Tablet" }, { k: "desktop", w: 1280, label: "Desktop" }];

// Injected into the preview only: reports console output and errors, and lets the person tap an
// element to point at it. It talks to the studio by postMessage and touches nothing else.
const PROBE = "<script>(function(){var P=function(t,m){try{parent.postMessage({__studio:{type:t,msg:String(m).slice(0,600)}},'*');}catch(e){}};"
  + "['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){try{P(k,[].slice.call(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(e){return String(a);}}).join(' '));}catch(e){}return o&&o.apply(console,arguments);};});"
  + "window.addEventListener('error',function(e){P('error',(e.message||'Error')+(e.lineno?' (line '+e.lineno+')':''));});"
  + "window.addEventListener('unhandledrejection',function(e){P('error','Unhandled: '+(e.reason&&e.reason.message||e.reason));});"
  + "var pick=false,last=null;window.addEventListener('message',function(e){if(e.data&&e.data.__studioPick!=null){pick=!!e.data.__studioPick;if(!pick&&last){last.style.outline=last.__o||'';last=null;}}});"
  + "document.addEventListener('click',function(e){if(!pick)return;e.preventDefault();e.stopPropagation();var el=e.target;if(last)last.style.outline=last.__o||'';last=el;el.__o=el.style.outline;el.style.outline='3px solid #E8C060';"
  + "var path=[];var n=el;while(n&&n.nodeType===1&&path.length<5){var s=n.tagName.toLowerCase();if(n.id)s+='#'+n.id;else if(n.className&&typeof n.className==='string')s+='.'+n.className.trim().split(/\\s+/).slice(0,2).join('.');path.unshift(s);n=n.parentElement;}"
  + "try{parent.postMessage({__studioPicked:{path:path.join(' > '),html:el.outerHTML.slice(0,1200),text:(el.innerText||'').slice(0,200)}},'*');}catch(x){}},true);"
  + "})();<\/script>";

export function extractCode(text) {
  const s = String(text || "");
  const m = s.match(/```(?:html|HTML)?\s*\n([\s\S]*?)(?:```|$)/);
  const body = m ? m[1] : s;
  return body.trim();
}
function lineDiff(a, b) {
  const A = String(a || "").split("\n"), B = String(b || "").split("\n");
  const set = new Map(); A.forEach((l) => set.set(l, (set.get(l) || 0) + 1));
  let same = 0; B.forEach((l) => { const c = set.get(l); if (c) { same++; set.set(l, c - 1); } });
  return { added: B.length - same, removed: A.length - same };
}

export function CodeStudio({ kind, title, initial, brief, buildDoc, ask, onSave, onClose }) {
  const [versions, setVersions] = useState(() => [{ code: extractCode(initial), label: "Original", at: Date.now() }]);
  const [cur, setCur] = useState(0);
  const [draft, setDraft] = useState(() => extractCode(initial));
  const [view, setView] = useState("preview");
  const [dev, setDev] = useState("phone");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState("");
  const [req, setReq] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(null);
  const [find, setFind] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [note, setNote] = useState("");
  const frame = useRef(null); const wrap = useRef(null);
  const [wrapW, setWrapW] = useState(360);
  const code = versions[cur].code;
  const errors = logs.filter((l) => l.type === "error");
  useEffect(() => { setDraft(code); }, [code]);
  const doc = useMemo(() => {
    const d = buildDoc(code);
    return /<head[^>]*>/i.test(d) ? d.replace(/<head[^>]*>/i, (h) => h + PROBE) : PROBE + d;
  }, [code, runKey, buildDoc]);
  useEffect(() => {
    const h = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data || {};
      if (d.__studio) setLogs((L) => [...L.slice(-199), { ...d.__studio, at: Date.now() }]);
      if (d.__studioPicked) { setPicked(d.__studioPicked); setPicking(false); try { frame.current.contentWindow.postMessage({ __studioPick: false }, "*"); } catch (x) {} setView("preview"); }
    };
    window.addEventListener("message", h); return () => window.removeEventListener("message", h);
  }, []);
  useEffect(() => { setLogs([]); }, [code, runKey]);
  useEffect(() => { const ro = new ResizeObserver(() => wrap.current && setWrapW(wrap.current.clientWidth)); if (wrap.current) ro.observe(wrap.current); return () => ro.disconnect(); }, [view]);
  const push = (c, label) => { const nv = [...versions.slice(0, cur + 1), { code: c, label, at: Date.now() }]; setVersions(nv); setCur(nv.length - 1); };
  const rules = "\n\nRULES FOR THIS EDIT: return the COMPLETE updated file as ONE ```html block - never a fragment, never '...rest unchanged'. Keep everything that already works. Change only what is asked. No explanation outside the block.";
  const change = async (what, label) => {
    if (busy) return; setBusy(label); setNote("");
    const target = picked ? "\n\nTHE PART THEY POINTED AT (" + picked.path + "):\n" + picked.html : "";
    const r = await ask(brief + rules, "Here is the current file:\n```html\n" + code + "\n```\n\nWHAT TO DO: " + what + target);
    const nc = r && r.live !== false ? extractCode(r.text) : "";
    if (nc && nc.length > 40) { const df = lineDiff(code, nc); push(nc, label); setPicked(null); setReq(""); setNote(label + ": " + df.added + " lines added, " + df.removed + " removed."); setView("preview"); }
    else setNote("That change didn't come back - try saying it another way.");
    setBusy("");
  };
  const fix = () => change("It has these errors when it runs. Find the cause of each and fix them properly:\n" + errors.slice(-8).map((e) => "- " + e.msg).join("\n"), "Fixed " + errors.length + " error" + (errors.length === 1 ? "" : "s"));
  const D = DEVICES.find((x) => x.k === dev) || DEVICES[0];
  const scale = Math.min(1, (wrapW - 2) / D.w);
  const download = () => { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([code], { type: "text/html" })); a.download = (String(title || kind || "app").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 40) || "app") + ".html"; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); } catch (e) {} };
  const share = async () => { try { const f = new File([code], "app.html", { type: "text/html" }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: title || "My app" }); else { await navigator.clipboard.writeText(code); setNote("Copied the code."); } } catch (e) {} };
  const lines = draft.split("\n");
  const hits = find ? lines.map((l, i) => (l.toLowerCase().includes(find.toLowerCase()) ? i + 1 : 0)).filter(Boolean) : [];
  return (
    <div className="cs">
      <div className="cs-bar">
        <button onClick={onClose} aria-label="Close">{"✕"}</button>
        <b>{title || "Code Studio"}</b>
        <button disabled={cur === 0} onClick={() => setCur(cur - 1)} aria-label="Undo" title="Undo">{"↶"}</button>
        <button disabled={cur >= versions.length - 1} onClick={() => setCur(cur + 1)} aria-label="Redo" title="Redo">{"↷"}</button>
        <button className="cs-save" onClick={() => { onSave(code); onClose(); }}>Use this</button>
      </div>
      <div className="cs-tabs">
        {["preview", "code", "console", "versions"].map((v) => <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
          {v === "preview" ? "Preview" : v === "code" ? "Code" : v === "console" ? "Console" + (errors.length ? " • " + errors.length : "") : "Versions (" + versions.length + ")"}</button>)}
      </div>
      {view === "preview" && <div className="cs-devs">{DEVICES.map((d) => <button key={d.k} className={dev === d.k ? "on" : ""} onClick={() => setDev(d.k)}>{d.label}</button>)}
        <button onClick={() => setRunKey(runKey + 1)}>{"↻"} Run again</button>
        <button className={picking ? "on" : ""} onClick={() => { const n = !picking; setPicking(n); try { frame.current.contentWindow.postMessage({ __studioPick: n }, "*"); } catch (e) {} }}>{picking ? "Tap something..." : "☝ Point at"}</button></div>}
      <div className="cs-main" ref={wrap}>
        <div className="cs-stage" style={{ display: view === "preview" ? "block" : "none", height: Math.round(((wrap.current && wrap.current.clientHeight) || 520) - 4) }}>
          <iframe key={runKey} ref={frame} title="Live preview" className="cs-frame" srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-downloads" allow="camera; microphone; geolocation; clipboard-write; autoplay; fullscreen"
            style={{ width: D.w, height: Math.round(((wrap.current && wrap.current.clientHeight) || 520) / scale) - 8, transform: "scale(" + scale + ")" }} />
        </div>
        {view === "code" && <div className="cs-code">
          <div className="cs-find"><input placeholder="Find in code" value={find} onChange={(e) => setFind(e.target.value)} />{find && <span>{hits.length} match{hits.length === 1 ? "" : "es"}{hits.length ? " - line " + hits.slice(0, 6).join(", ") : ""}</span>}</div>
          <div className="cs-ed"><pre className="cs-ln" aria-hidden="true">{lines.map((_, i) => (i + 1) + "\n").join("")}</pre>
            <textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" value={draft} onChange={(e) => setDraft(e.target.value)} /></div>
          {draft !== code && <div className="cs-row"><button className="cs-btn" onClick={() => { push(draft, "Your edit"); setView("preview"); }}>Run my edit</button><button className="cs-btn ghost" onClick={() => setDraft(code)}>Discard</button></div>}
        </div>}
        {view === "console" && <div className="cs-con">
          {!logs.length && <div className="cs-dim">Nothing logged yet. Errors and console messages from the running app appear here.</div>}
          {logs.map((l, i) => <div key={i} className={"cs-log " + l.type}><i>{l.type}</i>{l.msg}</div>)}
          {errors.length > 0 && <button className="cs-btn" disabled={!!busy} onClick={fix}>{busy && busy.startsWith("Fixed") ? "Fixing..." : "Fix " + errors.length + " error" + (errors.length === 1 ? "" : "s")}</button>}
        </div>}
        {view === "versions" && <div className="cs-con">
          {versions.map((v, i) => { const df = i ? lineDiff(versions[i - 1].code, v.code) : null; return (
            <button key={i} className={"cs-ver" + (i === cur ? " on" : "")} onClick={() => { setCur(i); setView("preview"); }}>
              <b>{i + 1}. {v.label}</b><span>{new Date(v.at).toLocaleTimeString()}{df ? " · +" + df.added + " / -" + df.removed + " lines" : ""} · {v.code.split("\n").length} lines</span></button>); })}
        </div>}
      </div>
      {note && <div className="cs-note">{note}</div>}
      {errors.length > 0 && view === "preview" && <button className="cs-err" disabled={!!busy} onClick={fix}>{"⚠"} {errors.length} error{errors.length === 1 ? "" : "s"} while running - {busy ? "fixing..." : "tap to fix"}</button>}
      {picked && <div className="cs-picked"><span>Pointing at: <b>{picked.path}</b>{picked.text ? " “" + picked.text.slice(0, 50) + "”" : ""}</span><button onClick={() => setPicked(null)}>{"✕"}</button></div>}
      <div className="cs-ask">
        <input placeholder={picked ? "What should change about this part?" : "Ask for a change - e.g. add dark mode, save to the cloud"} value={req} onChange={(e) => setReq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && req.trim()) change(req.trim(), req.trim().slice(0, 40)); }} />
        <button disabled={!req.trim() || !!busy} onClick={() => change(req.trim(), req.trim().slice(0, 40))}>{busy ? "…" : "Change"}</button>
      </div>
      <div className="cs-quick">
        {["Make it look premium", "Make it work offline", "Save data in the cloud (Spine.db)", "Add sign-in-aware features", "Make it faster", "Make it accessible"].map((q) =>
          <button key={q} disabled={!!busy} onClick={() => change(q === "Save data in the cloud (Spine.db)" ? "Keep the app's data in Spine.db so it is shared and saved for everyone who opens it (call Spine.app with a unique name first)" : q === "Add sign-in-aware features" ? "Use Spine.me() to greet the signed-in person and personalise what they see" : q, q)}>{q}</button>)}
        <button onClick={download}>{"↓"} Download</button><button onClick={share}>Share file</button>
      </div>
    </div>
  );
}

export const STUDIO_CSS = `
.cs{position:fixed;inset:0;z-index:9300;background:var(--bg);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);}
.cs-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--stone);}
.cs-bar b{flex:1;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cs-bar button{min-width:38px;height:36px;border-radius:9px;border:1px solid var(--stone);background:var(--panel);color:var(--ink);font:inherit;font-size:15px;cursor:pointer;}
.cs-bar button:disabled{opacity:.35;}.cs-bar .cs-save{background:var(--gold);color:#1a1405;border:none;font-weight:700;font-size:13px;padding:0 12px;}
.cs-tabs,.cs-devs{display:flex;gap:4px;padding:6px 10px;overflow-x:auto;}
.cs-tabs button,.cs-devs button{flex:none;padding:7px 11px;border-radius:999px;border:1px solid var(--stone);background:none;color:var(--ink2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;}
.cs-tabs button.on,.cs-devs button.on{border-color:var(--gold);color:var(--gold);background:var(--gold-s);}
.cs-main{flex:1;min-height:0;position:relative;overflow:hidden;margin:0 10px;border:1px solid var(--stone);border-radius:12px;background:#fff;}
.cs-stage{position:relative;overflow:hidden;width:100%;}
.cs-frame{border:0;transform-origin:0 0;background:#fff;display:block;}
.cs-code,.cs-con{position:absolute;inset:0;background:var(--panel);overflow:auto;display:flex;flex-direction:column;}
.cs-find{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--stone);font-size:12px;color:var(--ink3);}
.cs-find input{flex:1;padding:7px 9px;border-radius:8px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:13px;}
.cs-ed{flex:1;display:flex;min-height:300px;}
.cs-ln{margin:0;padding:10px 6px;text-align:right;color:var(--ink3);font:12px/1.55 'JetBrains Mono',monospace;user-select:none;background:var(--stone-l);min-width:38px;}
.cs-ed textarea{flex:1;border:0;resize:none;padding:10px;background:transparent;color:var(--ink);font:12px/1.55 'JetBrains Mono',monospace;white-space:pre;overflow:auto;outline:none;tab-size:2;}
.cs-row{display:flex;gap:8px;padding:8px;}
.cs-btn{padding:10px 14px;border-radius:10px;border:none;background:var(--gold);color:#1a1405;font:inherit;font-weight:700;cursor:pointer;margin:8px;}
.cs-btn.ghost{background:none;border:1px solid var(--stone-m);color:var(--ink);}
.cs-dim{padding:14px;color:var(--ink3);font-size:13px;}
.cs-log{padding:7px 10px;border-bottom:1px solid var(--stone);font:12px/1.45 'JetBrains Mono',monospace;color:var(--ink2);word-break:break-word;}
.cs-log i{font-style:normal;color:var(--ink3);margin-right:8px;text-transform:uppercase;font-size:10px;}
.cs-log.error{color:var(--err);background:var(--err-s);}.cs-log.warn{color:var(--gold);}
.cs-ver{display:flex;flex-direction:column;gap:2px;text-align:left;background:none;border:none;border-bottom:1px solid var(--stone);padding:10px 12px;color:var(--ink);font:inherit;cursor:pointer;}
.cs-ver.on{background:var(--gold-s);}.cs-ver span{font-size:11.5px;color:var(--ink3);}
.cs-note{margin:6px 10px 0;font-size:12.5px;color:var(--live);}
.cs-err{margin:6px 10px 0;padding:9px;border-radius:10px;border:1px solid var(--err);background:var(--err-s);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;}
.cs-picked{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 10px 0;padding:7px 10px;border-radius:10px;background:var(--gold-s);border:1px solid var(--gold-l);font-size:12.5px;color:var(--ink2);}
.cs-picked button{background:none;border:none;color:var(--ink2);font-size:15px;}
.cs-ask{display:flex;gap:8px;padding:8px 10px 4px;}
.cs-ask input{flex:1;padding:11px 12px;border-radius:12px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:15px;}
.cs-ask button{padding:0 16px;border-radius:12px;border:none;background:var(--gold);color:#1a1405;font:inherit;font-weight:700;}
.cs-quick{display:flex;gap:6px;overflow-x:auto;padding:4px 10px 10px;}
.cs-quick button{flex:none;padding:7px 11px;border-radius:999px;border:1px solid var(--stone);background:var(--panel);color:var(--ink2);font:inherit;font-size:12px;cursor:pointer;}
`;
