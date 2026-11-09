// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BRAIN STEM - "WHAT PEOPLE USE". The owner's own view of which features and buttons get used
//  most, which are rising or falling, and which nobody touches - to decide where to focus.
//  Reads totals only (admin-only database functions); there is nothing personal in them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from "react";
import { adminUsage, adminUsageDaily } from "./spineData";

const PERIODS = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "Year"]];
const areaOf = (e) => { const p = String(e).split(" · "); return p[0] === "Click" ? (p[1] || "App") : p[0]; };
const nameOf = (e) => { const p = String(e).split(" · "); return p[0] === "Click" ? p.slice(2).join(" · ") || p[1] : p.slice(1).join(" · ") || p[0]; };
const change = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0);

export function AdminInsights() {
  const [days, setDays] = useState(7); const [me, setMe] = useState(false); const [kind, setKind] = useState("all");
  const [rows, setRows] = useState(undefined); const [daily, setDaily] = useState([]); const [q, setQ] = useState(""); const [all, setAll] = useState(false);
  const load = async () => { setRows(undefined); const [r, d] = await Promise.all([adminUsage(days, me), adminUsageDaily(Math.max(days, 7), me)]); setRows(r); setDaily(Array.isArray(d) ? d : []); };
  useEffect(() => { load(); }, [days, me]); // eslint-disable-line
  const list = useMemo(() => (rows || []).map((r) => ({ ...r, total: +r.total, people: +r.people, prev: +r.prev_total, area: areaOf(r.event), name: nameOf(r.event), click: /^Click · /.test(r.event) })), [rows]);
  const shown = list.filter((r) => r.total > 0 && (kind === "all" || (kind === "clicks" ? r.click : !r.click)) && (!q || r.event.toLowerCase().includes(q.toLowerCase())));
  const max = Math.max(1, ...shown.map((r) => r.total));
  const totals = list.reduce((a, r) => a + r.total, 0);
  const areas = useMemo(() => { const m = {}; list.forEach((r) => { if (!r.total) return; m[r.area] = (m[r.area] || 0) + r.total; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10); }, [list]);
  const rising = list.filter((r) => r.total >= 5 && r.prev > 0 && change(r.total, r.prev) >= 25).sort((a, b) => change(b.total, b.prev) - change(a.total, a.prev)).slice(0, 6);
  const newOnes = list.filter((r) => r.total >= 3 && r.prev === 0).slice(0, 6);
  const falling = list.filter((r) => r.prev >= 5 && change(r.total, r.prev) <= -30).sort((a, b) => change(a.total, a.prev) - change(b.total, b.prev)).slice(0, 6);
  const quiet = list.filter((r) => !r.click && r.total <= 2).sort((a, b) => a.total - b.total).slice(0, 8);
  const peopleNow = daily.slice(-days).reduce((a, d) => Math.max(a, +d.people), 0);
  const dmax = Math.max(1, ...daily.map((d) => +d.events));
  const csv = () => {
    const lines = [["feature", "area", "uses", "people", "previous period", "change %"].join(",")].concat(list.map((r) => ['"' + r.event.replace(/"/g, '""') + '"', '"' + r.area + '"', r.total, r.people, r.prev, change(r.total, r.prev) === null ? "new" : change(r.total, r.prev)].join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "spine-usage-" + days + "-days.csv"; document.body.appendChild(a); a.click(); a.remove();
  };
  const Chg = ({ r }) => { const c = change(r.total, r.prev); return <span className={"ai-chg " + (c === null ? "new" : c > 0 ? "up" : c < 0 ? "down" : "")}>{c === null ? "new" : c === 0 ? "=" : (c > 0 ? "▲ " : "▼ ") + Math.abs(c) + "%"}</span>; };
  return (
    <div className="bs-section ai-ins">
      <div className="bs-head"><span className="bs-title serif">What people use</span><span className="cred-tag" style={{ background: "var(--ink)", color: "#fff" }}>{me ? "just you" : "everyone"}</span></div>
      <p className="bs-sub">Which features and buttons get used most, what is rising or falling, and what nobody touches - so you know where to focus. Only names and counts are kept, never what anyone types.</p>
      <div className="ai-row">{PERIODS.map(([d, l]) => <button key={d} className={"ai-chip" + (days === d ? " on" : "")} onClick={() => setDays(d)}>{l}</button>)}</div>
      <div className="ai-row">
        <button className={"ai-chip" + (!me ? " on" : "")} onClick={() => setMe(false)}>Everyone</button><button className={"ai-chip" + (me ? " on" : "")} onClick={() => setMe(true)}>Just me</button>
        <span className="ai-sep" />
        {[["all", "Everything"], ["features", "Features"], ["clicks", "Buttons"]].map(([k, l]) => <button key={k} className={"ai-chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {rows === undefined && <div className="bs-sub">Loading...</div>}
      {rows === null && <div className="bs-sub">Run the batch 10 database step to switch this on.</div>}
      {rows && (<>
        <div className="ai-stats">
          <div><b>{totals.toLocaleString()}</b><span>actions</span></div>
          <div><b>{peopleNow.toLocaleString()}</b><span>people on the busiest day</span></div>
          <div><b>{areas[0] ? areas[0][0] : "-"}</b><span>busiest area</span></div>
        </div>
        {daily.length > 1 && <div className="ai-days" aria-label="Activity per day">{daily.map((d) => <i key={d.day} title={new Date(d.day).toLocaleDateString() + ": " + d.events + " actions, " + d.people + " people"} style={{ height: Math.max(2, (+d.events / dmax) * 56) + "px" }} />)}</div>}
        {areas.length > 0 && <div className="ai-block"><div className="ai-h">By area</div>{areas.map(([a, n]) => <div key={a} className="ai-bar"><span className="ai-name">{a}</span><span className="ai-track"><i style={{ width: (n / areas[0][1]) * 100 + "%" }} /></span><b>{n.toLocaleString()}</b></div>)}</div>}
        <div className="ai-block">
          <div className="ai-h">Most used <input className="ai-find" placeholder="Find..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {shown.slice(0, all ? 200 : 25).map((r) => (
            <div key={r.event} className="ai-bar">
              <span className="ai-name"><small>{r.area}</small>{r.name}</span>
              <span className="ai-track"><i style={{ width: (r.total / max) * 100 + "%" }} /></span>
              <b>{r.total.toLocaleString()}</b><span className="ai-ppl">{r.people} {r.people === 1 ? "person" : "people"}</span><Chg r={r} />
            </div>
          ))}
          {!shown.length && <div className="bs-sub">Nothing counted for this period yet.</div>}
          {shown.length > 25 && <button className="bs-btn alt" onClick={() => setAll((v) => !v)}>{all ? "Show top 25" : "Show all " + shown.length}</button>}
        </div>
        <div className="ai-cols">
          <div className="ai-block"><div className="ai-h">Rising</div>{rising.concat(newOnes).slice(0, 8).map((r) => <div key={r.event} className="ai-li"><span>{r.name} <small>{r.area}</small></span><Chg r={r} /></div>)}{!rising.length && !newOnes.length && <div className="bs-sub">Nothing rising yet.</div>}</div>
          <div className="ai-block"><div className="ai-h">Falling</div>{falling.map((r) => <div key={r.event} className="ai-li"><span>{r.name} <small>{r.area}</small></span><Chg r={r} /></div>)}{!falling.length && <div className="bs-sub">Nothing falling.</div>}</div>
          <div className="ai-block"><div className="ai-h">Hardly used</div>{quiet.map((r) => <div key={r.event} className="ai-li"><span>{r.name} <small>{r.area}</small></span><b>{r.total}</b></div>)}{!quiet.length && <div className="bs-sub">Every feature is getting use.</div>}</div>
        </div>
        <div className="ai-row"><button className="bs-btn alt" onClick={load}>Refresh</button><button className="bs-btn alt" onClick={csv}>Download as a spreadsheet (CSV)</button></div>
      </>)}
    </div>
  );
}

export const INSIGHTS_CSS = `
.ai-ins .ai-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;}
.ai-chip{background:var(--panel);border:1px solid var(--stone);color:var(--ink2);border-radius:999px;padding:6px 11px;font:600 12px Manrope,system-ui,sans-serif;cursor:pointer;}
.ai-chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink);}
.ai-sep{width:1px;height:20px;background:var(--stone);margin:0 4px;}
.ai-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;}
.ai-stats div{border:1px solid var(--stone);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:2px;min-width:0;}
.ai-stats b{font-size:20px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ai-stats span{font-size:11px;color:var(--ink3);}
.ai-days{display:flex;align-items:flex-end;gap:2px;height:60px;padding:4px 0;border-bottom:1px solid var(--stone);margin-bottom:8px;}
.ai-days i{flex:1;background:var(--gold);border-radius:2px 2px 0 0;min-width:2px;opacity:.85;}
.ai-block{margin:10px 0;}.ai-h{font:700 12px Manrope,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-bottom:6px;display:flex;gap:8px;align-items:center;}
.ai-find{margin-left:auto;padding:6px 9px;border-radius:9px;border:1px solid var(--stone);background:var(--panel);color:var(--ink);font:500 13px Manrope,system-ui,sans-serif;width:120px;text-transform:none;letter-spacing:0;}
.ai-bar{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(40px,1fr) auto;gap:4px 8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--stone-l,rgba(0,0,0,.05));font-size:13px;color:var(--ink);}
.ai-bar .ai-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.ai-bar small{display:block;font-size:10.5px;color:var(--ink3);}
.ai-track{height:8px;background:var(--stone-l,rgba(0,0,0,.06));border-radius:4px;overflow:hidden;}.ai-track i{display:block;height:100%;background:var(--gold);border-radius:4px;}
.ai-bar .ai-ppl,.ai-bar .ai-chg{grid-column:2 / span 2;font-size:11px;color:var(--ink3);}
.ai-bar .ai-ppl{grid-column:1;}
.ai-chg.up{color:var(--live,#1a7f37);}.ai-chg.down{color:var(--err,#b3261e);}.ai-chg.new{color:var(--gold);font-weight:700;}
.ai-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 16px;}
.ai-li{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink);padding:5px 0;border-bottom:1px solid var(--stone-l,rgba(0,0,0,.05));}
.ai-li small{color:var(--ink3);font-size:11px;}
`;
