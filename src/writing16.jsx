// ═══════════════════════════════════════════════════════════════════════════════════════════
//  "CHECK MY WRITING" (batch 16): grammar and spelling worked out on the phone by Harper - nothing
//  is sent anywhere. Shows each problem in plain words with one-tap fixes, or "Fix all".
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { checkWriting, applyFix, applyAll } from "./tools16.js";

export function WritingCheck({ text, onApply, onClose }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(""); const [cur, setCur] = useState(String(text || ""));
  const run = async (t) => { setList(null); setErr(""); try { setList(await checkWriting(t)); } catch (e) { setErr("The writing checker couldn't load (it's a one-time 20 MB download) - try again with signal."); } };
  useEffect(() => { run(cur); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fix = (p, r) => { const n = applyFix(cur, p, r); setCur(n); onApply && onApply(n, p, r); run(n); };
  const all = () => { const n = applyAll(cur, list || []); setCur(n); onApply && onApply(n, null, null); run(n); };
  return (
    <div className="wc16" data-writingcheck>
      <div className="wc16-h"><b>Check my writing</b>{onClose && <button onClick={onClose} aria-label="Close">×</button>}</div>
      {!list && !err && <div className="wc16-dim">Reading it through... (the first time loads the checker onto this phone)</div>}
      {err && <div className="wc16-dim">{err}</div>}
      {list && !list.length && <div className="wc16-dim" data-clean>No spelling or grammar problems found.</div>}
      {list && list.length > 0 && <div className="wc16-dim">{list.length} thing{list.length === 1 ? "" : "s"} to look at{list.some((p) => p.suggestions.length) ? " - tap a fix, or " : ""}{list.some((p) => p.suggestions.length) && <button className="wc16-all" onClick={all}>Fix all</button>}</div>}
      {list && list.map((p, i) => (
        <div key={i + ":" + p.start} className="wc16-p">
          <div><span className="wc16-k">{p.kind}</span> <s>{p.found}</s> - {p.message}</div>
          {p.suggestions.length > 0 && <div className="wc16-s">{p.suggestions.map((r, j) => <button key={j} onClick={() => fix(p, r)}>{r === "" ? "(remove it)" : r}</button>)}</div>}
        </div>
      ))}
    </div>
  );
}
export const WRITING16_CSS = `
.wc16{background:var(--panel);border:1px solid var(--stone);border-radius:14px;padding:12px 14px;margin:10px 0;color:var(--ink);font:14px/1.45 Manrope,system-ui,sans-serif;max-height:50vh;overflow:auto;}
.wc16-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}.wc16-h button{background:none;border:none;font-size:20px;color:var(--ink2);cursor:pointer;}
.wc16-dim{color:var(--ink3);font-size:13px;margin:4px 0 8px;}.wc16-p{padding:8px 0;border-top:1px solid var(--stone);}
.wc16-k{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gold);}
.wc16-p s{color:var(--err);}.wc16-s{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.wc16-s button,.wc16-all{padding:5px 10px;border-radius:999px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;}
.wc-link{background:none;border:none;color:var(--ink3);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;padding:4px 0;}
`;
