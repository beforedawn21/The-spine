// ============================================================================
//  ANSWERS YOU CAN TOUCH
//  The Core can now answer with a live piece instead of a wall of text: a chart, a map, a
//  quiz, a calculator with sliders, a timeline, a checklist. It writes a small description in a
//  ```spine fence; this file draws it. Nothing here runs code the model wrote - a calculator's
//  formula goes through a tiny arithmetic reader that only knows numbers, the named sliders and
//  a handful of maths words, so a formula can never reach the page.
//  The map library is large, so it is fetched only the first time a map appears.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";

const PALETTE = ["#E8C060", "#7ED4A8", "#8FC0FF", "#FF9FB0", "#C0A8FF", "#FFBF8F", "#8FE8D0", "#E07A6A"];
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const CUR = /^[$£€¥₹₦₩₱]$/;
const withUnit = (txt, unit) => !unit ? txt : CUR.test(unit) ? unit + txt : txt + (/^[%°]/.test(unit) ? "" : " ") + unit;
const fmt = (n, d) => {
  if (!Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (d != null) return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "k";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// ── CHART ───────────────────────────────────────────────────────────────────
function ChartView({ spec }) {
  const kind = ["bar", "line", "pie", "area"].includes(spec.kind) ? spec.kind : "bar";
  const labels = (Array.isArray(spec.labels) ? spec.labels : []).slice(0, 40).map(String);
  const series = (Array.isArray(spec.series) ? spec.series : []).slice(0, 6).map((s, i) => ({
    name: String((s && s.name) || ""), color: PALETTE[i % PALETTE.length],
    values: (Array.isArray(s && s.values) ? s.values : []).slice(0, labels.length || 40).map(num),
  })).filter((s) => s.values.length);
  const [hover, setHover] = useState(null);
  if (!series.length) return null;
  const unit = spec.unit ? String(spec.unit).slice(0, 12) : "";
  if (kind === "pie") {
    const vals = series[0].values; const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2; const R = 80, C = 100;
    const arcs = vals.map((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = `M${C},${C} L${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} Z`;
      a0 = a1; return { p, i, v };
    });
    return (
      <div className="sw-chart sw-pie">
        <svg viewBox="0 0 200 200" role="img" aria-label={spec.title || "Pie chart"}>
          {arcs.map((x) => <path key={x.i} d={x.p} fill={PALETTE[x.i % PALETTE.length]} opacity={hover == null || hover === x.i ? 1 : 0.35}
            onPointerEnter={() => setHover(x.i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(x.i)} />)}
        </svg>
        <div className="sw-legend">{vals.map((v, i) => (
          <button key={i} className={"sw-key" + (hover === i ? " on" : "")} onClick={() => setHover(hover === i ? null : i)}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />{labels[i] || "Item " + (i + 1)} <b>{fmt(v)}{unit}</b> <span>{Math.round((Math.max(0, v) / total) * 100)}%</span>
          </button>))}
        </div>
      </div>
    );
  }
  const W = 340, H = 190, L = 40, B = 26, T = 10, Rr = 8;
  const all = series.flatMap((s) => s.values);
  let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi === lo) hi = lo + 1;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => L + (n <= 1 ? (W - L - Rr) / 2 : (i * (W - L - Rr)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const bw = Math.max(3, ((W - L - Rr) / Math.max(1, n)) * 0.8 / series.length);
  const bx = (i, si) => L + (i + 0.1) * ((W - L - Rr) / n) + si * bw;
  return (
    <div className="sw-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "Chart"} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, k) => <g key={k}><line x1={L} x2={W - Rr} y1={y(t)} y2={y(t)} className="sw-grid" /><text x={L - 5} y={y(t) + 3} className="sw-ax" textAnchor="end">{fmt(t)}</text></g>)}
        {series.map((s, si) => kind === "bar"
          ? s.values.map((v, i) => <rect key={si + "-" + i} x={bx(i, si)} y={Math.min(y(v), y(0))} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="2" fill={s.color}
              opacity={hover == null || hover === i ? 1 : 0.4} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />)
          : <g key={si}>
              {kind === "area" && <path d={`M${x(0)},${y(lo)} ` + s.values.map((v, i) => `L${x(i)},${y(v)}`).join(" ") + ` L${x(s.values.length - 1)},${y(lo)} Z`} fill={s.color} opacity="0.18" />}
              <polyline points={s.values.map((v, i) => x(i) + "," + y(v)).join(" ")} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 2.6} fill={s.color} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
            </g>)}
        {labels.map((l, i) => (n <= 8 || i % Math.ceil(n / 6) === 0) && <text key={i} x={kind === "bar" ? bx(i, 0) + (bw * series.length) / 2 : x(i)} y={H - 8} className="sw-ax" textAnchor="middle">{l.length > 9 ? l.slice(0, 8) + "…" : l}</text>)}
        {hover != null && kind !== "bar" && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="sw-cross" />}
      </svg>
      <div className="sw-readout">{hover != null
        ? <><b>{labels[hover] || "Point " + (hover + 1)}</b>{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name ? s.name + ": " : ""}{fmt(s.values[hover])}{unit}</span>)}</>
        : series.length > 1 ? series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>) : <span className="sw-hint">Tap the chart to read a value</span>}
      </div>
    </div>
  );
}

// ── MAP ─────────────────────────────────────────────────────────────────────
// MapLibre with OpenFreeMap tiles: no key, no limits, commercial use allowed, credit shown on the map.
let __maplib = null;
function loadMapLib() {
  if (!__maplib) __maplib = Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([m]) => m.default || m);
  return __maplib;
}
function MapView({ spec }) {
  const box = useRef(null); const [err, setErr] = useState("");
  const pts = useMemo(() => (Array.isArray(spec.points) ? spec.points : []).slice(0, 60).map((p) => ({ lat: num(p.lat), lon: num(p.lon), label: String(p.label || p.name || "").slice(0, 80) }))
    .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && (p.lat || p.lon)), [spec]);
  useEffect(() => {
    let map = null, dead = false;
    loadMapLib().then((ml) => {
      if (dead || !box.current) return;
      const c = Array.isArray(spec.center) && spec.center.length === 2 ? [num(spec.center[1]), num(spec.center[0])] : pts.length ? [pts[0].lon, pts[0].lat] : [0, 20];
      map = new ml.Map({ container: box.current, style: "https://tiles.openfreemap.org/styles/" + (spec.style === "light" ? "positron" : spec.style === "bright" ? "bright" : "liberty"),
        center: c, zoom: Number.isFinite(Number(spec.zoom)) ? Number(spec.zoom) : pts.length > 1 ? 3 : 11, pitch: spec.tilt ? 50 : 0, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      pts.forEach((p, i) => {
        const m = new ml.Marker({ color: PALETTE[i % PALETTE.length] }).setLngLat([p.lon, p.lat]);
        if (p.label) m.setPopup(new ml.Popup({ offset: 22, closeButton: false }).setText(p.label));
        m.addTo(map);
      });
      if (pts.length > 1 && !spec.zoom) {
        const b = new ml.LngLatBounds(); pts.forEach((p) => b.extend([p.lon, p.lat]));
        map.fitBounds(b, { padding: 40, maxZoom: 13, duration: 0 });
      }
      if (spec.route && pts.length > 1) map.on("load", () => {
        map.addSource("r", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: pts.map((p) => [p.lon, p.lat]) } } });
        map.addLayer({ id: "r", type: "line", source: "r", paint: { "line-color": "#E8C060", "line-width": 3 } });
      });
    }).catch(() => setErr("The map couldn't load right now."));
    return () => { dead = true; try { map && map.remove(); } catch (e) {} };
  }, [spec, pts]);
  return (
    <div className="sw-map">
      <div ref={box} className="sw-map-box" />
      {err && <div className="sw-hint">{err}</div>}
      {pts.length > 0 && <div className="sw-map-list">{pts.slice(0, 8).map((p, i) => (
        <a key={i} href={"https://www.openstreetmap.org/?mlat=" + p.lat + "&mlon=" + p.lon + "#map=15/" + p.lat + "/" + p.lon} target="_blank" rel="noreferrer">
          <i style={{ background: PALETTE[i % PALETTE.length] }} />{p.label || p.lat.toFixed(3) + ", " + p.lon.toFixed(3)}</a>))}</div>}
    </div>
  );
}

// ── QUIZ ────────────────────────────────────────────────────────────────────
function QuizView({ spec }) {
  const qs = (Array.isArray(spec.questions) ? spec.questions : []).slice(0, 15).map((q) => ({
    q: String(q.q || q.question || ""), options: (Array.isArray(q.options) ? q.options : []).slice(0, 6).map(String),
    answer: Number.isInteger(q.answer) ? q.answer : Math.max(0, (q.options || []).indexOf(q.answer)), why: String(q.why || q.explanation || ""),
  })).filter((q) => q.q && q.options.length >= 2);
  const [i, setI] = useState(0); const [pick, setPick] = useState(null); const [score, setScore] = useState(0); const [done, setDone] = useState(false);
  if (!qs.length) return null;
  if (done) return (
    <div className="sw-quiz"><div className="sw-q-score">{score} / {qs.length}</div>
      <div className="sw-hint">{score === qs.length ? "Perfect." : score >= qs.length / 2 ? "Nicely done." : "Have another go?"}</div>
      <button className="sw-btn" onClick={() => { setI(0); setPick(null); setScore(0); setDone(false); }}>Try again</button></div>);
  const q = qs[i];
  return (
    <div className="sw-quiz">
      <div className="sw-q-n">Question {i + 1} of {qs.length}</div>
      <div className="sw-q">{q.q}</div>
      {q.options.map((o, k) => (
        <button key={k} disabled={pick != null} className={"sw-opt" + (pick != null && k === q.answer ? " right" : "") + (pick === k && k !== q.answer ? " wrong" : "")}
          onClick={() => { setPick(k); if (k === q.answer) setScore(score + 1); }}>{o}</button>))}
      {pick != null && <div className="sw-why">{pick === q.answer ? "Right. " : "Not quite. "}{q.why}</div>}
      {pick != null && <button className="sw-btn" onClick={() => { if (i + 1 >= qs.length) setDone(true); else { setI(i + 1); setPick(null); } }}>{i + 1 >= qs.length ? "See score" : "Next"}</button>}
    </div>
  );
}

// ── CALCULATOR ──────────────────────────────────────────────────────────────
// A safe arithmetic reader: numbers, slider names, + - * / ^ %, brackets, and these words only.
const FN = { min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp };
export function evalFormula(src, vars) {
  const s = String(src || "").slice(0, 400); let p = 0;
  const ws = () => { while (p < s.length && /\s/.test(s[p])) p++; };
  const expr = () => { let v = term(); for (;;) { ws(); if (s[p] === "+") { p++; v += term(); } else if (s[p] === "-") { p++; v -= term(); } else return v; } };
  const term = () => { let v = power(); for (;;) { ws(); if (s[p] === "*") { p++; v *= power(); } else if (s[p] === "/") { p++; v /= power(); } else if (s[p] === "%") { p++; v %= power(); } else return v; } };
  const power = () => { const b = unary(); ws(); if (s[p] === "^") { p++; return Math.pow(b, power()); } return b; };
  const unary = () => { ws(); if (s[p] === "-") { p++; return -unary(); } if (s[p] === "+") { p++; return unary(); } return atom(); };
  const atom = () => {
    ws();
    if (s[p] === "(") { p++; const v = expr(); ws(); if (s[p] !== ")") throw new Error("bracket"); p++; return v; }
    const m = /^(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(p)); if (m) { p += m[0].length; return parseFloat(m[0]); }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(p));
    if (w) {
      p += w[0].length; const name = w[0]; ws();
      if (s[p] === "(" && FN[name]) { p++; const args = []; ws(); if (s[p] !== ")") { args.push(expr()); ws(); while (s[p] === ",") { p++; args.push(expr()); ws(); } } if (s[p] !== ")") throw new Error("bracket"); p++; return FN[name](...args); }
      if (name === "PI" || name === "pi") return Math.PI;
      if (Object.prototype.hasOwnProperty.call(vars, name)) return Number(vars[name]);
      throw new Error("unknown " + name);
    }
    throw new Error("unexpected");
  };
  const v = expr(); ws(); if (p < s.length) throw new Error("extra"); return v;
}
function CalcView({ spec }) {
  const inputs = (Array.isArray(spec.inputs) ? spec.inputs : []).slice(0, 8).map((x, i) => ({
    id: /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(x.id || "")) ? String(x.id) : "v" + i, label: String(x.label || x.id || ""),
    min: num(x.min), max: x.max != null ? num(x.max) : 100, step: x.step != null ? num(x.step) || 1 : 1, unit: String(x.unit || "").slice(0, 10), value: x.value != null ? num(x.value) : num(x.min),
  }));
  const outs = (Array.isArray(spec.outputs) ? spec.outputs : spec.formula ? [{ label: (spec.result && spec.result.label) || "Result", formula: spec.formula, unit: spec.result && spec.result.unit, decimals: spec.result && spec.result.decimals }] : []).slice(0, 4);
  const [vals, setVals] = useState(() => Object.fromEntries(inputs.map((x) => [x.id, x.value])));
  if (!inputs.length || !outs.length) return null;
  return (
    <div className="sw-calc">
      {inputs.map((x) => (
        <label key={x.id} className="sw-slider">
          <span>{x.label}<b>{withUnit(fmt(vals[x.id]), x.unit)}</b></span>
          <input type="range" min={x.min} max={x.max} step={x.step} value={vals[x.id]} onChange={(e) => setVals({ ...vals, [x.id]: Number(e.target.value) })} />
        </label>))}
      <div className="sw-results">{outs.map((o, k) => {
        let v; try { v = evalFormula(o.formula, vals); } catch (e) { v = NaN; }
        return <div key={k} className="sw-result"><span>{String(o.label || "Result")}</span><b>{Number.isFinite(v) ? withUnit(fmt(v, o.decimals != null ? Number(o.decimals) : undefined), String(o.unit || "").slice(0, 10)) : "–"}</b></div>;
      })}</div>
    </div>
  );
}

// ── TIMELINE + CHECKLIST ────────────────────────────────────────────────────
function TimelineView({ spec }) {
  const items = (Array.isArray(spec.items) ? spec.items : []).slice(0, 30);
  const [open, setOpen] = useState(null);
  if (!items.length) return null;
  return <div className="sw-tl">{items.map((it, i) => (
    <button key={i} className={"sw-tl-it" + (open === i ? " on" : "")} onClick={() => setOpen(open === i ? null : i)}>
      <span className="sw-tl-when">{String(it.when || it.date || it.year || "")}</span>
      <span className="sw-tl-what">{String(it.what || it.title || "")}</span>
      {open === i && it.detail && <span className="sw-tl-d">{String(it.detail)}</span>}
    </button>))}</div>;
}
function ChecklistView({ spec }) {
  const items = (Array.isArray(spec.items) ? spec.items : []).slice(0, 40).map((x) => String(typeof x === "string" ? x : x.text || ""));
  const [done, setDone] = useState({});
  if (!items.length) return null;
  const n = Object.values(done).filter(Boolean).length;
  return <div className="sw-check"><div className="sw-q-n">{n} of {items.length} done</div>{items.map((t, i) => (
    <label key={i} className={done[i] ? "on" : ""}><input type="checkbox" checked={!!done[i]} onChange={() => setDone({ ...done, [i]: !done[i] })} />{t}</label>))}</div>;
}

// ── THE DOOR ────────────────────────────────────────────────────────────────
// ── DIAGRAMS: real drawings inside an answer (flow, cycle, tree, venn, sequence) ─────────────
// Built from a small JSON description and laid out here, so the model never writes raw drawing
// code - nothing to inject, and a diagram always comes out tidy on a phone.
const DG = { fill: "var(--panel)", ink: "var(--ink)", line: "var(--ink3)", acc: "var(--gold)" };
function wrapWords(t, max) {
  const words = String(t == null ? "" : t).replace(/\s+/g, " ").trim().split(" "); const out = []; let cur = "";
  for (const w of words) { if (!cur) cur = w; else if ((cur + " " + w).length <= max) cur += " " + w; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  return out.slice(0, 4).map((l) => (l.length > max + 4 ? l.slice(0, max + 3) + "…" : l));
}
function Label({ x, y, lines, size, color, weight, anchor }) {
  const lh = size * 1.22, y0 = y - ((lines.length - 1) * lh) / 2;
  return <text x={x} y={y0} fontSize={size} fill={color || DG.ink} fontWeight={weight || 600} textAnchor={anchor || "middle"} dominantBaseline="middle" style={{ fontFamily: "Manrope,system-ui,sans-serif" }}>{lines.map((l, i) => <tspan key={i} x={x} y={y0 + i * lh}>{l}</tspan>)}</text>;
}
const Arrow = ({ id }) => <defs><marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={DG.line} /></marker></defs>;
function flowLayout(spec) {
  const nodes = (spec.nodes || []).slice(0, 30).map((n, i) => ({ id: String(n.id != null ? n.id : i), label: String(n.label || n.id || ""), shape: n.shape || "box" }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (spec.edges || []).slice(0, 60).map((e) => ({ from: String(e.from), to: String(e.to), label: e.label ? String(e.label) : "" })).filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  // layers by longest path, ignoring edges that would close a loop
  const out = {}; nodes.forEach((n) => (out[n.id] = [])); edges.forEach((e) => out[e.from].push(e));
  const state = {}, back = new Set();
  const dfs = (v) => { state[v] = 1; for (const e of out[v]) { if (state[e.to] === 1) back.add(e); else if (!state[e.to]) dfs(e.to); } state[v] = 2; };
  nodes.forEach((n) => { if (!state[n.id]) dfs(n.id); });
  const layer = {}; nodes.forEach((n) => (layer[n.id] = 0));
  for (let k = 0; k < nodes.length; k++) edges.forEach((e) => { if (!back.has(e) && layer[e.to] < layer[e.from] + 1) layer[e.to] = layer[e.from] + 1; });
  const rows = []; nodes.forEach((n) => { (rows[layer[n.id]] = rows[layer[n.id]] || []).push(n); });
  // one pass of ordering by the average position of parents, so lines cross less
  const pos = {}; rows.forEach((r, li) => { if (li > 0) r.sort((a, b) => { const avg = (n) => { const ps = edges.filter((e) => e.to === n.id && pos[e.from] != null).map((e) => pos[e.from]); return ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : 0; }; return avg(a) - avg(b); }); r.forEach((n, i) => (pos[n.id] = i - (r.length - 1) / 2)); });
  return { nodes, edges, rows, back };
}
function FlowDiagram({ spec, mid }) {
  const { edges, rows, back } = flowLayout(spec);
  const right = spec.direction === "right";
  const W = 150, H = 54, GX = 34, GY = 52;
  const maxRow = Math.max(1, ...rows.map((r) => (r ? r.length : 0)));
  const at = {};
  rows.forEach((r, li) => (r || []).forEach((n, i) => {
    const off = (maxRow - r.length) / 2;
    at[n.id] = right ? { x: 20 + li * (W + GY), y: 20 + (i + off) * (H + GX), n } : { x: 20 + (i + off) * (W + GX), y: 20 + li * (H + GY), n };
  }));
  const vw = right ? 40 + rows.length * (W + GY) - GY : 40 + maxRow * (W + GX) - GX, vh = right ? 40 + maxRow * (H + GX) - GX : 40 + rows.length * (H + GY) - GY;
  const c = (id) => ({ x: at[id].x + W / 2, y: at[id].y + H / 2 });
  return (
    <svg viewBox={"0 0 " + vw + " " + vh} role="img" aria-label={spec.title || "diagram"}>
      <Arrow id={mid} />
      {edges.map((e, i) => {
        const a = c(e.from), b = c(e.to); const loop = back.has(e);
        let x1, y1, x2, y2, d;
        if (right) { x1 = a.x + W / 2; y1 = a.y; x2 = b.x - W / 2; y2 = b.y; } else { x1 = a.x; y1 = a.y + H / 2; x2 = b.x; y2 = b.y - H / 2; }
        if (loop) { const bend = right ? 0 : -(W / 2 + 26); x1 = a.x + (right ? 0 : -W / 2); y1 = a.y + (right ? H / 2 : 0); x2 = b.x + (right ? 0 : -W / 2); y2 = b.y + (right ? H / 2 : 0); d = right ? `M${x1},${y1} C${x1},${y1 + 60} ${x2},${y2 + 60} ${x2},${y2 + 2}` : `M${x1},${y1} C${x1 + bend},${y1} ${x2 + bend},${y2} ${x2 - 2},${y2}`; }
        else d = right ? `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 2},${y2}` : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2 - 2}`;
        return <g key={i}><path d={d} fill="none" stroke={DG.line} strokeWidth="1.6" strokeDasharray={loop ? "5 4" : undefined} markerEnd={"url(#" + mid + ")"} />
          {e.label && (() => { const lx = loop ? (right ? (x1 + x2) / 2 : x1 - (W / 2 + 26) * 0.75) : (x1 + x2) / 2, ly = loop ? (right ? Math.max(y1, y2) + 46 : (y1 + y2) / 2) : (y1 + y2) / 2, t = e.label.slice(0, 22);
            return <g><rect x={lx - t.length * 3.4 - 5} y={ly - 9} width={t.length * 6.8 + 10} height="18" rx="9" fill="var(--bg,#fff)" /><Label x={lx} y={ly} lines={[t]} size={11} color={DG.line} weight={600} /></g>; })()}</g>;
      })}
      {Object.values(at).map(({ x, y, n }) => (
        <g key={n.id}>
          {n.shape === "diamond" ? <path d={`M${x + W / 2},${y - 6} L${x + W + 6},${y + H / 2} L${x + W / 2},${y + H + 6} L${x - 6},${y + H / 2} z`} fill={DG.fill} stroke={DG.acc} strokeWidth="1.8" />
            : <rect x={x} y={y} width={W} height={H} rx={n.shape === "round" ? H / 2 : 10} fill={DG.fill} stroke={n.shape === "round" ? DG.acc : DG.line} strokeWidth={n.shape === "round" ? 2 : 1.4} />}
          <Label x={x + W / 2} y={y + H / 2} lines={wrapWords(n.label, n.shape === "diamond" ? 14 : 19)} size={12.5} />
        </g>
      ))}
    </svg>
  );
}
function CycleDiagram({ spec, mid }) {
  const steps = (spec.steps || spec.items || []).slice(0, 10).map(String); const n = Math.max(2, steps.length);
  const R = 120 + n * 6, cx = R + 90, cy = R + 50, W = 130, H = 50;
  const pt = (i) => ({ x: cx + R * Math.sin((2 * Math.PI * i) / n), y: cy - R * Math.cos((2 * Math.PI * i) / n) });
  return (
    <svg viewBox={"0 0 " + (cx * 2) + " " + (cy * 2)} role="img" aria-label={spec.title || "cycle"}>
      <Arrow id={mid} />
      {spec.center && <Label x={cx} y={cy} lines={wrapWords(spec.center, 16)} size={14} color={DG.acc} weight={700} />}
      {steps.map((_, i) => { const a0 = (2 * Math.PI * (i + 0.28)) / n, a1 = (2 * Math.PI * (i + 0.72)) / n; const r = R; return <path key={"a" + i} d={`M${cx + r * Math.sin(a0)},${cy - r * Math.cos(a0)} A${r},${r} 0 0 1 ${cx + r * Math.sin(a1)},${cy - r * Math.cos(a1)}`} fill="none" stroke={DG.line} strokeWidth="1.8" markerEnd={"url(#" + mid + ")"} />; })}
      {steps.map((t, i) => { const p = pt(i); return <g key={i}><rect x={p.x - W / 2} y={p.y - H / 2} width={W} height={H} rx="12" fill={DG.fill} stroke={i === 0 ? DG.acc : DG.line} strokeWidth={i === 0 ? 2 : 1.4} /><Label x={p.x} y={p.y} lines={wrapWords((i + 1) + ". " + t, 17)} size={12} /></g>; })}
    </svg>
  );
}
function TreeDiagram({ spec, mid }) {
  const root = spec.root || (spec.label ? spec : null); if (!root) return null;
  let count = 0; const W = 128, H = 46, GX = 14, GY = 58;
  const build = (node, depth) => { if (count++ > 40 || depth > 5) return null; const kids = (node.children || []).map((c) => build(typeof c === "string" ? { label: c } : c, depth + 1)).filter(Boolean); return { label: String(node.label || ""), kids, depth }; };
  const t = build(root, 0); let leaf = 0; const all = [];
  const place = (n) => { if (!n.kids.length) { n.x = leaf++ * (W + GX); } else { n.kids.forEach(place); n.x = (n.kids[0].x + n.kids[n.kids.length - 1].x) / 2; } n.y = n.depth * (H + GY); all.push(n); };
  place(t);
  const vw = Math.max(W, leaf * (W + GX) - GX) + 20, vh = Math.max(...all.map((n) => n.y)) + H + 20;
  return (
    <svg viewBox={"0 0 " + vw + " " + vh} role="img" aria-label={spec.title || "tree"}>
      {all.map((n, i) => n.kids.map((k, j) => <path key={i + "-" + j} d={`M${n.x + 10 + W / 2},${n.y + 10 + H} C${n.x + 10 + W / 2},${n.y + 10 + H + GY / 2} ${k.x + 10 + W / 2},${k.y + 10 - GY / 2} ${k.x + 10 + W / 2},${k.y + 10}`} fill="none" stroke={DG.line} strokeWidth="1.5" />))}
      {all.map((n, i) => <g key={i}><rect x={n.x + 10} y={n.y + 10} width={W} height={H} rx="10" fill={DG.fill} stroke={n.depth === 0 ? DG.acc : DG.line} strokeWidth={n.depth === 0 ? 2 : 1.3} /><Label x={n.x + 10 + W / 2} y={n.y + 10 + H / 2} lines={wrapWords(n.label, 16)} size={12} weight={n.depth === 0 ? 700 : 600} /></g>)}
      <Arrow id={mid} />
    </svg>
  );
}
function VennDiagram({ spec }) {
  const sets = (spec.sets || []).slice(0, 3); if (sets.length < 2) return null;
  const cols = ["rgba(201,162,39,.28)", "rgba(10,132,255,.22)", "rgba(52,199,89,.22)"];
  const three = sets.length === 3, r = 110, C = three ? [[170, 140], [290, 140], [230, 240]] : [[160, 150], [290, 150]];
  const vw = three ? 460 : 450, vh = three ? 380 : 300;
  return (
    <svg viewBox={"0 0 " + vw + " " + vh} role="img" aria-label={spec.title || "venn"}>
      {sets.map((st, i) => <circle key={i} cx={C[i][0]} cy={C[i][1]} r={r} fill={cols[i]} stroke={DG.line} strokeWidth="1.2" />)}
      {sets.map((st, i) => { const lx = three ? C[i][0] + (i === 0 ? -55 : i === 1 ? 55 : 0) : C[i][0] + (i === 0 ? -45 : 45); const ly = three ? C[i][1] + (i === 2 ? 55 : -45) : C[i][1] - 30;
        return <g key={i}><Label x={lx} y={ly} lines={wrapWords(st.label || st.name || "", 14)} size={13} weight={800} />{(st.items || []).slice(0, 4).map((it, k) => <Label key={k} x={lx} y={ly + 26 + k * 17} lines={[String(it).slice(0, 18)]} size={11} weight={500} color="var(--ink2)" />)}</g>; })}
      {(spec.overlap || spec.both) && <Label x={three ? 230 : 225} y={three ? 175 : 150} lines={wrapWords(spec.overlap || spec.both, 12)} size={12} weight={700} color={DG.acc} />}
    </svg>
  );
}
function SequenceDiagram({ spec, mid }) {
  const actors = (spec.actors || []).slice(0, 6).map(String); const steps = (spec.steps || spec.messages || []).slice(0, 16);
  const COL = 140, top = 50, rowH = 46, vw = 30 + actors.length * COL, vh = top + 30 + steps.length * rowH + 20;
  const xOf = (a) => 15 + COL / 2 + Math.max(0, actors.indexOf(String(a))) * COL;
  return (
    <svg viewBox={"0 0 " + vw + " " + vh} role="img" aria-label={spec.title || "sequence"}>
      <Arrow id={mid} />
      {actors.map((a, i) => <g key={i}><rect x={15 + i * COL + 8} y="8" width={COL - 16} height="36" rx="9" fill={DG.fill} stroke={DG.acc} strokeWidth="1.6" /><Label x={15 + i * COL + COL / 2} y={26} lines={wrapWords(a, 15)} size={12} weight={700} /><line x1={15 + i * COL + COL / 2} y1={44} x2={15 + i * COL + COL / 2} y2={vh - 10} stroke={DG.line} strokeDasharray="4 4" /></g>)}
      {steps.map((m, i) => { const y = top + 24 + i * rowH, x1 = xOf(m.from), x2 = xOf(m.to); const self = x1 === x2;
        return <g key={i}>{self ? <path d={`M${x1},${y} h30 v16 h-28`} fill="none" stroke={DG.line} strokeWidth="1.5" markerEnd={"url(#" + mid + ")"} /> : <line x1={x1} y1={y} x2={x2 + (x2 > x1 ? -3 : 3)} y2={y} stroke={DG.line} strokeWidth="1.5" markerEnd={"url(#" + mid + ")"} />}
          <Label x={self ? x1 + 36 : (x1 + x2) / 2} y={y - 11} lines={[String(m.label || m.text || "").slice(0, 34)]} size={11} weight={600} anchor={self ? "start" : "middle"} /></g>; })}
    </svg>
  );
}
export function DiagramView({ spec }) {
  const ref = useRef(null); const mid = useRef("dg" + Math.random().toString(36).slice(2, 8)).current; const [big, setBig] = useState(false);
  const k = String(spec.kind || (spec.nodes ? "flow" : spec.root ? "tree" : spec.sets ? "venn" : spec.actors ? "sequence" : spec.steps ? "cycle" : "flow"));
  const body = k === "cycle" ? <CycleDiagram spec={spec} mid={mid} /> : k === "tree" || k === "hierarchy" || k === "mindmap" ? <TreeDiagram spec={spec} mid={mid} /> : k === "venn" ? <VennDiagram spec={spec} /> : k === "sequence" ? <SequenceDiagram spec={spec} mid={mid} /> : <FlowDiagram spec={spec} mid={mid} />;
  if (!body) return <div className="sw-hint">This diagram couldn't be drawn.</div>;
  const savePng = () => {
    try {
      const svg = ref.current.querySelector("svg"); const clone = svg.cloneNode(true); const cs = getComputedStyle(ref.current);
      const v = (n, f) => (cs.getPropertyValue(n) || "").trim() || f;
      let src = new XMLSerializer().serializeToString(clone).replace(/var\(--panel\)/g, v("--panel", "#fff")).replace(/var\(--ink3\)/g, v("--ink3", "#777")).replace(/var\(--ink2\)/g, v("--ink2", "#444")).replace(/var\(--ink\)/g, v("--ink", "#111")).replace(/var\(--gold\)/g, v("--gold", "#c9a227")).replace(/var\(--bg,#fff\)/g, v("--bg", "#fff"));
      if (!/xmlns=/.test(src)) src = src.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const vb = svg.viewBox.baseVal, scale = 2, img = new Image();
      img.onload = () => { const c = document.createElement("canvas"); c.width = vb.width * scale; c.height = vb.height * scale; const x = c.getContext("2d"); x.fillStyle = v("--bg", "#fff"); x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = (spec.title || "diagram").replace(/[^\w -]/g, "").slice(0, 40) + ".png"; document.body.appendChild(a); a.click(); a.remove(); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
    } catch (e) {}
  };
  return <div className="sw-diagram" ref={ref}>
    <div className="sw-dg-tap" onClick={() => setBig(true)} title="Tap to see it big">{body}</div>
    <div className="sw-dg-acts"><button className="sw-dg-save" onClick={() => setBig(true)}>See it big</button><button className="sw-dg-save" onClick={savePng}>Save as picture</button></div>
    {big && <div className="sw-dg-big" role="dialog" aria-label={spec.title || "diagram"}><div className="sw-dg-bar"><b>{String(spec.title || "Diagram").slice(0, 80)}</b><button onClick={() => setBig(false)}>{"\u2715"} Close</button></div><div className="sw-dg-scroll">{body}</div></div>}
  </div>;
}

export function SpineWidget({ code, closed }) {
  let spec = null;
  try { spec = JSON.parse(code); } catch (e) { spec = null; }
  if (!spec || typeof spec !== "object") return <div className="sw-card sw-wait">{closed ? "This piece couldn't be drawn." : "Drawing…"}</div>;
  const t = String(spec.type || "");
  const body = t === "chart" ? <ChartView spec={spec} /> : t === "map" ? <MapView spec={spec} /> : t === "quiz" ? <QuizView spec={spec} />
    : t === "calc" || t === "calculator" ? <CalcView spec={spec} /> : t === "timeline" ? <TimelineView spec={spec} /> : t === "checklist" ? <ChecklistView spec={spec} /> : t === "diagram" ? <DiagramView spec={spec} /> : null;
  if (!body) return <div className="sw-card sw-wait">This piece couldn't be drawn.</div>;
  return <div className="sw-card">{spec.title && <div className="sw-title">{String(spec.title).slice(0, 120)}</div>}{body}{spec.source && <div className="sw-src">{String(spec.source).slice(0, 140)}</div>}</div>;
}

// Markdown tables: | a | b | rows become a real, scrollable table.
export function RichTable({ rows, inline }) {
  const cells = rows.map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  const head = cells[0] || []; const body = cells.slice(2);
  return <div className="sw-table-wrap"><table className="sw-table"><thead><tr>{head.map((h, i) => <th key={i}>{inline(h)}</th>)}</tr></thead>
    <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table></div>;
}

export const WIDGET_CSS = `
.sw-card{margin:10px 0;padding:13px;border-radius:12px;background:var(--panel);border:1px solid var(--stone);}
.sw-wait{color:var(--ink3);font-size:13px;}
.sw-title{font-weight:700;font-size:14px;margin-bottom:8px;color:var(--ink);}
.sw-src{margin-top:8px;font-size:11px;color:var(--ink3);}
.sw-hint{font-size:12px;color:var(--ink3);}
.sw-diagram{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.sw-diagram svg{width:100%;height:auto;display:block;max-height:560px;}
.sw-dg-tap{cursor:zoom-in;}.sw-dg-acts{display:flex;gap:6px;flex-wrap:wrap;}
.sw-dg-big{position:fixed;inset:0;z-index:9800;background:var(--bg,#fff);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);}
.sw-dg-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--stone);color:var(--ink);}.sw-dg-bar b{flex:1;font-size:15px;}.sw-dg-bar button{background:none;border:1px solid var(--stone);border-radius:999px;padding:7px 12px;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;}
.sw-dg-scroll{flex:1;overflow:auto;padding:16px;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y pinch-zoom;}
.sw-dg-scroll svg{width:100%;min-width:560px;height:auto;max-height:none;display:block;}
.sw-dg-save{margin-top:8px;background:none;border:1px solid var(--stone);border-radius:999px;padding:6px 12px;font:600 12px Manrope,system-ui,sans-serif;color:var(--ink2);cursor:pointer;}
.sw-chart svg{width:100%;height:auto;display:block;touch-action:manipulation;}
.sw-grid{stroke:var(--stone);stroke-width:1;}
.sw-cross{stroke:var(--ink3);stroke-dasharray:3 3;}
.sw-ax{fill:var(--ink3);font-size:9px;font-family:'JetBrains Mono',monospace;}
.sw-readout{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font-size:12.5px;color:var(--ink2);min-height:18px;}
.sw-readout i,.sw-legend i,.sw-map-list i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:middle;}
.sw-pie{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}.sw-pie svg{width:150px;flex:none;}
.sw-legend{display:flex;flex-direction:column;gap:4px;flex:1;min-width:150px;}
.sw-key{display:flex;align-items:center;gap:4px;background:none;border:1px solid transparent;border-radius:7px;padding:4px 6px;color:var(--ink2);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;}
.sw-key.on{border-color:var(--gold-l);color:var(--ink);}.sw-key b{margin-left:auto;color:var(--ink);}.sw-key span{color:var(--ink3);width:34px;text-align:right;}
.sw-map-box{height:240px;border-radius:9px;overflow:hidden;background:var(--stone-l);}
.sw-map-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.sw-map-list a{font-size:12px;color:var(--ink2);text-decoration:none;border:1px solid var(--stone);border-radius:999px;padding:4px 9px;}
.sw-quiz .sw-q-n,.sw-check .sw-q-n{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px;}
.sw-q{font-weight:600;margin-bottom:9px;line-height:1.4;}
.sw-opt{display:block;width:100%;text-align:left;margin:6px 0;padding:11px 12px;border-radius:10px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:14px;cursor:pointer;min-height:44px;}
.sw-opt.right{border-color:var(--live);background:var(--live-s);}.sw-opt.wrong{border-color:var(--err);background:var(--err-s);}
.sw-why{margin:8px 0;font-size:13.5px;color:var(--ink2);line-height:1.45;}
.sw-btn{margin-top:6px;padding:10px 16px;border-radius:999px;border:1px solid var(--gold);background:none;color:var(--gold);font:inherit;font-weight:600;cursor:pointer;min-height:44px;}
.sw-q-score{font-size:30px;font-weight:700;color:var(--gold);}
.sw-slider{display:block;margin:8px 0 12px;}.sw-slider span{display:flex;justify-content:space-between;font-size:13px;color:var(--ink2);margin-bottom:4px;}
.sw-slider b{color:var(--ink);font-family:'JetBrains Mono',monospace;}
.sw-slider input{width:100%;accent-color:#E8C060;height:28px;}
.sw-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;}
.sw-result{padding:10px;border-radius:10px;background:var(--gold-s);border:1px solid var(--gold-l);}
.sw-result span{display:block;font-size:11.5px;color:var(--ink2);}.sw-result b{font-size:20px;color:var(--gold);font-family:'JetBrains Mono',monospace;}
.sw-tl{display:flex;flex-direction:column;border-left:2px solid var(--gold-l);margin-left:5px;}
.sw-tl-it{position:relative;display:flex;flex-direction:column;gap:2px;text-align:left;background:none;border:none;padding:7px 0 9px 14px;color:var(--ink);font:inherit;cursor:pointer;}
.sw-tl-it::before{content:'';position:absolute;left:-6px;top:12px;width:10px;height:10px;border-radius:50%;background:var(--gold);}
.sw-tl-when{font-size:11.5px;color:var(--gold);font-family:'JetBrains Mono',monospace;}.sw-tl-what{font-size:14px;}.sw-tl-d{font-size:13px;color:var(--ink2);margin-top:3px;}
.sw-check label{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--stone);font-size:14px;cursor:pointer;}
.sw-check label.on{color:var(--ink3);text-decoration:line-through;}.sw-check input{width:20px;height:20px;accent-color:#7ED4A8;flex:none;}
.sw-table-wrap{overflow-x:auto;margin:9px 0;border:1px solid var(--stone);border-radius:10px;}
.sw-table{border-collapse:collapse;width:100%;font-size:13.5px;}
.sw-table th{background:var(--stone-l);text-align:left;font-weight:700;color:var(--ink);}
.sw-table th,.sw-table td{padding:8px 10px;border-bottom:1px solid var(--stone);vertical-align:top;}
.sw-table tr:last-child td{border-bottom:none;}
`;
