// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MATHS THAT LOOKS LIKE MATHS (batch 16): KaTeX (MIT) turns \( x^2 \), \[ ... \] and $$ ... $$ in
//  Core answers, slides and documents into proper formulas. It loads only when an answer has maths,
//  and the style sheet and fonts are served from The Spine itself (/ai/katex/), so it works offline.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";

let K = null, loading = null; const waiters = new Set();
export function katexReady() { return !!K; }
export function loadKatex() {
  if (K) return Promise.resolve(K);
  if (!loading) loading = (async () => {
    try { if (typeof document !== "undefined" && !document.querySelector("link[data-katex]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/ai/katex/katex.min.css"; l.setAttribute("data-katex", "1"); document.head.appendChild(l); } } catch (e) { /* styles are a nicety */ }
    const m = await import("katex"); K = m.default || m; waiters.forEach((f) => { try { f(); } catch (e) {} }); waiters.clear(); return K;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}
// $...$ only counts as maths when it looks like maths (so "$5 and $10" stays money)
const INLINE = /\\\((.+?)\\\)|\$(?!\s)([^$\n]*?[\\^_{}=][^$\n]*?)(?<!\s)\$/g;
const BLOCK = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
export function hasMath(s) { s = String(s || ""); INLINE.lastIndex = 0; BLOCK.lastIndex = 0; return BLOCK.test(s) || INLINE.test(s); }
export function texToHtml(tex, display) {
  if (!K) return null;
  try { return K.renderToString(String(tex), { displayMode: !!display, throwOnError: false, trust: false, strict: "ignore", maxSize: 50, maxExpand: 500, output: "htmlAndMathml" }); } catch (e) { return null; }
}
// For HTML strings (documents, print): replace maths in already-escaped HTML. Without KaTeX yet, the
// formula is kept as plain text in a span that is filled in once it loads.
const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
export function mathHtml(html) {
  const s = String(html || ""); if (!hasMath(unesc(s))) return s;
  const one = (tex, display) => { const t = unesc(tex); const h = texToHtml(t, display); return h ? (display ? "<div class=\"m16 m16d\">" + h + "</div>" : "<span class=\"m16\">" + h + "</span>") : "<span class=\"m16 m16raw\">" + tex + "</span>"; };
  return s.replace(BLOCK, (m, a, b) => one(a != null ? a : b, true)).replace(INLINE, (m, a, b) => one(a != null ? a : b, false));
}
// re-render a component once KaTeX arrives
export function useMath(text) {
  const [, setN] = useState(0);
  useEffect(() => { if (!K && hasMath(text)) { const f = () => setN((n) => n + 1); waiters.add(f); loadKatex().catch(() => {}); return () => waiters.delete(f); } }, [text]);
  return !!K;
}
// Split a line into text and formulas for React renderers (Core answers, slide bullets).
export function splitMath(s) {
  const out = []; const str = String(s || ""); const re = new RegExp(BLOCK.source + "|" + INLINE.source, "g"); let last = 0, m;
  while ((m = re.exec(str))) { if (m.index > last) out.push({ t: str.slice(last, m.index) }); const block = m[1] != null || m[2] != null; out.push({ tex: m[1] ?? m[2] ?? m[3] ?? m[4], display: block }); last = m.index + m[0].length; }
  if (last < str.length) out.push({ t: str.slice(last) });
  return out;
}
export function MathTex({ tex, display }) {
  useMath("\\(" + tex + "\\)");
  const h = texToHtml(tex, display);
  if (!h) return <code className="m16raw">{tex}</code>;
  return display ? <div className="m16 m16d" dangerouslySetInnerHTML={{ __html: h }} /> : <span className="m16" dangerouslySetInnerHTML={{ __html: h }} />;
}
export function MathText({ text }) {
  if (!hasMath(text)) return <>{text}</>;
  return <>{splitMath(text).map((p, i) => (p.tex != null ? <MathTex key={i} tex={p.tex} display={p.display} /> : <React.Fragment key={i}>{p.t}</React.Fragment>))}</>;
}
export const MATH16_CSS = `.m16d{margin:10px 0;overflow-x:auto;overflow-y:hidden;}.m16raw{font-family:ui-monospace,Menlo,monospace;}`;
