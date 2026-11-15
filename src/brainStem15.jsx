// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BRAIN STEM - KEEP A COPY (batch 15). The free database plan keeps no backups of its own, so:
//  · a full copy every night, kept 7 days, in Supabase → Storage → backups (the nightly job does it)
//  · "Download a backup" saves a copy to this phone or computer whenever you like
//  · "Put a backup back" restores from one of those files
//  · how full the database is, against the free plan's 500 MB
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { adminBackup, adminRestore, adminDbSize, adminFindAccounts, adminSetPassword } from "./spineData";

const mb = (b) => (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + " MB";
const LABEL = { accounts: "accounts", tools: "tools & creations", ledger: "money records", wallets: "wallets", projects: "projects", conversations: "conversations", app_rows: "app data", usage_events: "usage counts", profiles: "profiles", feedback: "messages", reports: "reports", bounties: "bounties", bounty_entries: "bounty entries", payout_requests: "cash-out requests", schedules: "scheduled jobs", push_subs: "phones for alerts", boards: "leaderboards", user_state: "saved app state", settings: "settings" };

async function readBackupFile(file) {
  let text;
  if (/\.gz$/i.test(file.name) || (file.type || "").includes("gzip")) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open .gz files - unzip it first, then pick the .json.");
    text = await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  } else text = await file.text();
  const d = JSON.parse(text);
  if (!d || d.format !== "spine-backup-1" || !d.tables) throw new Error("That file is not a Spine backup.");
  return d;
}

export function BackupPanel() {
  const [size, setSize] = useState(undefined); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState(null); const [picked, setPicked] = useState(null);
  const loadSize = async () => { const r = await adminDbSize(); setSize(r.error === "missing" ? null : r.error ? { error: r.error } : r.data); };
  useEffect(() => { loadSize(); }, []);
  const download = async () => {
    setBusy("Making a backup..."); setMsg(null);
    const r = await adminBackup(); setBusy("");
    if (r.error) { setMsg({ bad: true, t: r.error === "missing" ? "Run database Step 4f to switch backups on." : r.error }); return; }
    const d = new Date(); const name = "spine-backup-" + d.toISOString().slice(0, 10) + ".json";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data)], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
    const c = r.data.counts || {}; setMsg({ t: "Saved " + name + " - " + (c.accounts || 0) + " accounts, " + (c.tools || 0) + " creations, " + (c.ledger || 0) + " money records. Keep it somewhere safe: it has everything in the database." });
  };
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    setMsg(null); try { const d = await readBackupFile(f); setPicked({ name: f.name, data: d }); } catch (er) { setPicked(null); setMsg({ bad: true, t: er.message || "Could not read that file." }); }
  };
  const restore = async (mode) => {
    if (!picked) return;
    const when = picked.data.made_at ? new Date(picked.data.made_at).toLocaleString() : "an unknown time";
    if (mode === "missing" && !window.confirm("Put back anything that has gone missing since " + when + "?\n\nNothing that exists now is changed or removed.")) return;
    if (mode === "all" && (!window.confirm("Turn everything in this backup back to how it was at " + when + "?\n\nAnything changed since then goes back to the old version. Things made since then are kept.") || !window.confirm("Are you sure? This can't be undone - download a fresh backup first if you're not."))) return;
    setBusy("Putting it back..."); setMsg(null);
    const r = await adminRestore(picked.data, mode); setBusy("");
    if (r.error) { setMsg({ bad: true, t: r.error === "missing" ? "Run database Step 4f to switch backups on." : "Nothing was changed: " + r.error }); return; }
    const done = Object.entries((r.data && r.data.restored) || {}).filter(([, n]) => +n > 0).map(([t, n]) => n + " " + (LABEL[t] || t));
    setMsg({ t: done.length ? "Done - put back " + done.join(", ") + "." : "Done - nothing was missing." }); setPicked(null); loadSize();
  };
  const pct = size && size.bytes ? Math.min(100, (size.bytes / size.limit) * 100) : 0;
  return (
    <div className="bs-section bk15">
      <div className="bs-head"><span className="bs-title serif">Keep a copy</span><span className="cred-tag" style={{ background: "var(--ink)", color: "#fff" }}>backups</span></div>
      <p className="bs-sub">Supabase's free plan keeps no backups, so The Spine makes its own: a full copy every night, kept for 7 days in Supabase → Storage → backups. You can also save one here any time, and put one back.</p>
      {size === null && <div className="bs-sub">Run database Step 4f to switch this on.</div>}
      {size && size.error && <div className="bs-sub">{size.error}</div>}
      {size && size.bytes > 0 && (
        <div className="bk15-size">
          <div className="bk15-row"><b>{mb(size.bytes)}</b><span>of {mb(size.limit)} used ({pct < 1 ? "under 1" : Math.round(pct)}%)</span></div>
          <div className="bk15-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Database space used"><i className={pct > 80 ? "hot" : pct > 60 ? "warm" : ""} style={{ width: Math.max(1, pct) + "%" }} /></div>
          {pct > 80 && <div className="bs-sub" style={{ color: "var(--err)" }}>Nearly full. At 500 MB the free plan stops saving new things - clear old usage counts or move to a paid plan.</div>}
          <details><summary>What takes the most room</summary>{(size.tables || []).slice(0, 8).map((t) => <div key={t.name} className="ai-li"><span>{LABEL[t.name] || t.name}</span><b>{mb(+t.bytes)}</b></div>)}</details>
        </div>
      )}
      <div className="ai-row">
        <button className="bs-btn" onClick={download} disabled={!!busy}>Download a backup</button>
        <label className="bs-btn alt" style={{ cursor: "pointer" }}>Put a backup back<input type="file" accept=".json,.gz,application/json,application/gzip" onChange={pick} style={{ display: "none" }} /></label>
      </div>
      {picked && (
        <div className="bk15-pick">
          <div><b>{picked.name}</b> - made {picked.data.made_at ? new Date(picked.data.made_at).toLocaleString() : "at an unknown time"}, {Object.values(picked.data.counts || {}).reduce((a, n) => a + (+n || 0), 0).toLocaleString()} rows</div>
          <div className="ai-row">
            <button className="bs-btn" onClick={() => restore("missing")} disabled={!!busy}>Put back only what's missing</button>
            <button className="bs-btn alt" onClick={() => restore("all")} disabled={!!busy}>Turn everything back</button>
            <button className="bs-btn alt" onClick={() => setPicked(null)} disabled={!!busy}>Cancel</button>
          </div>
          <div className="bs-sub">"Only what's missing" is the safe one: it adds back anything deleted and changes nothing else. Either way it's all or nothing - if any part fails, nothing changes.</div>
        </div>
      )}
      {busy && <div className="bs-sub">{busy}</div>}
      {msg && <div className={"snotice " + (msg.bad ? "warn" : "info")} style={{ marginTop: 8 }}>{msg.t}</div>}
    </div>
  );
}

export const BACKUP_CSS = `
.bk15-size{margin:10px 0;}.bk15-row{display:flex;gap:8px;align-items:baseline;color:var(--ink);}.bk15-row b{font-size:20px;}.bk15-row span{font-size:12px;color:var(--ink3);}
.bk15-track{height:10px;background:var(--stone-l,rgba(0,0,0,.06));border-radius:5px;overflow:hidden;margin:6px 0;}
.bk15-track i{display:block;height:100%;background:var(--live,#1a7f37);border-radius:5px;}.bk15-track i.warm{background:var(--gold);}.bk15-track i.hot{background:var(--err,#b3261e);}
.bk15 details{margin-top:6px;font-size:13px;color:var(--ink2);}.bk15 summary{cursor:pointer;font-weight:600;}
.bk15-pick{border:1px solid var(--stone);border-radius:10px;padding:10px;margin-top:8px;font-size:13px;color:var(--ink);}
`;

// ── CHECK THE FREE SOURCES: asks each free data source one small question from the live server,
// so the owner can see which are answering today. (Nothing about anyone is sent.)
const SOURCES = [["weather", { q: "London" }, "Weather (MET Norway)"], ["usforecast", { q: "Denver" }, "US forecast (NWS)"], ["tides", { q: "Boston" }, "Tides (NOAA)"],
  ["bikes", { q: "Paris" }, "Bike share (CityBikes)"], ["disasters", { state: "FL" }, "Disasters (FEMA)"], ["ukflood", {}, "UK floods (Environment Agency)"], ["ukcarbon", {}, "UK power mix (National Grid)"],
  ["medicine", { q: "ibuprofen" }, "Medicines (RxNorm)"], ["foodhygiene", { where: "London" }, "Food hygiene (FSA)"], ["rules", { q: "energy" }, "US rules (Federal Register)"],
  ["company", { q: "AAPL" }, "Company filings (SEC)"], ["lei", { q: "Siemens" }, "Companies worldwide (GLEIF)"], ["recalls", { q: "heater" }, "Product recalls (CPSC)"],
  ["recalls", { make: "Toyota", model: "Camry", year: 2020 }, "Car recalls (NHTSA)"], ["complaints", { q: "credit card" }, "Complaints (CFPB)"], ["bank", { q: "Chase" }, "Banks (FDIC)"],
  ["art", { q: "sea" }, "Art (Cleveland Museum)"], ["spaceimages", { q: "moon" }, "Space pictures (NASA)"], ["archive", { q: "harbor" }, "Archives (Internet Archive + LoC)"], ["exploited", {}, "Security flaws (CISA)"],
  ["companyfr", { q: "renault" }, "France companies (api.gouv.fr)"], ["companyno", { q: "equinor" }, "Norway companies (Brreg)"], ["brazil", { cep: "01001000" }, "Brazil (BrasilAPI)"],
  ["swisstrain", { from: "Zurich", to: "Bern" }, "Swiss transport"], ["fitrains", { station: "HKI" }, "Finland trains (Digitraffic)"], ["sgweather", {}, "Singapore weather (NEA)"],
  ["myrates", {}, "Malaysia rates (BNM)"], ["worldstat", { country: "BR", measure: "population" }, "World Bank"],
  // batch 16 (round 4)
  ["dewarn", { q: "Berlin" }, "German weather warnings (Bright Sky)"], ["quakes", {}, "Earthquakes (EMSC)"], ["sunmoon", { q: "Chicago" }, "Sun and moon (US Naval Observatory)"],
  ["power", { country: "de" }, "Europe power mix (Energy-Charts)"], ["dkpower", {}, "Danish power prices (Energinet)"], ["frfuel", { q: "Lyon" }, "French fuel prices"],
  ["airsensors", { q: "Stuttgart" }, "Air sensors (Sensor.Community)"], ["asteroids", {}, "Asteroids (NASA JPL)"], ["exoplanets", {}, "Exoplanets (NASA)"],
  ["chemical", { q: "caffeine" }, "Chemicals (PubChem)"], ["protein", { q: "insulin" }, "Proteins (UniProt)"], ["pdb", { q: "hemoglobin" }, "3D molecules (RCSB PDB)"],
  ["druglabel", { q: "ibuprofen" }, "Drug labels (DailyMed)"], ["health", { q: "asthma" }, "Health topics (MedlinePlus)"], ["journals", { q: "climate" }, "Open journals (DOAJ)"],
  ["citations", { doi: "10.1038/nature12373" }, "Citations (OpenCitations)"], ["papers", { q: "transformer" }, "CS papers (dblp)"], ["usregs", { q: "drone" }, "US regulations (eCFR)"],
  ["uklaw", { q: "housing" }, "UK laws (legislation.gov.uk)"], ["currency", { base: "usd" }, "Currencies (currency-api)"], ["crypto", {}, "Crypto (Coinbase + Kraken)"],
  ["prayer", { q: "Cairo" }, "Prayer times (Aladhan)"], ["jewish", { q: "Jerusalem", tz: "Asia/Jerusalem" }, "Shabbat times (Hebcal)"], ["f1history", {}, "F1 history (OpenF1)"],
  ["germanfootball", {}, "Bundesliga (OpenLigaDB)"], ["afl", {}, "AFL (Squiggle)"], ["route", { from: "Paris", to: "Versailles", mode: "bike" }, "Routes (Valhalla)"],
  ["reach", { q: "Amsterdam", minutes: 10 }, "Reach in N minutes (Valhalla)"], ["streetphotos", { q: "Lyon" }, "Street photos (Panoramax)"], ["bluesky", { handle: "bsky.app" }, "Bluesky public posts"],
  ["listening", {}, "Listening stats (ListenBrainz)"], ["jobs", { q: "design" }, "Remote jobs (Jobicy)"]];
export function SourcesCheck() {
  const [rows, setRows] = useState([]); const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setRows(SOURCES.map(([k, , n]) => ({ k, n, st: "..." })));
    // a few at a time, and a wait-and-retry if the server's per-minute limit is reached (there are
    // more sources than the 60-a-minute allowance)
    let next = 0;
    const one = async (i) => {
      const [k, params] = SOURCES[i]; const t0 = Date.now(); let st = "failed";
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what: "live", kind: k, ...params }), signal: AbortSignal.timeout(20000) });
          if (r.status === 429) { setRows((a) => a.map((x, j) => (j === i ? { ...x, st: "waiting a minute..." } : x))); await new Promise((d) => setTimeout(d, 31000)); continue; }
          const j = await r.json(); st = j && !j.error && j.text ? "ok" : (j && j.error) || "failed";
        } catch (e) { st = "no answer"; }
        break;
      }
      setRows((a) => a.map((x, j) => (j === i ? { ...x, st, ms: Date.now() - t0 } : x)));
    };
    await Promise.all(Array.from({ length: 6 }, async () => { while (next < SOURCES.length) await one(next++); }));
    setBusy(false);
  };
  const okN = rows.filter((x) => x.st === "ok").length;
  return (
    <div className="bs-section">
      <div className="bs-head"><span className="bs-title serif">Free sources</span><span className="cred-tag" style={{ background: "var(--ink)", color: "#fff" }}>no keys</span></div>
      <p className="bs-sub">The free public data The Spine reads for answers and for what people build. Tap to ask each one a small question from the live site and see who's answering today.</p>
      <button className="bs-btn" onClick={run} disabled={busy}>{busy ? "Checking..." : "Check the free sources"}</button>
      {rows.length > 0 && <div className="bs-sub" style={{ marginTop: 8 }}>{okN} of {rows.length} answering</div>}
      {rows.map((x, i) => <div key={i} className="ai-li"><span>{x.n}</span><b style={{ color: x.st === "ok" ? "var(--live)" : x.st === "..." ? "var(--ink3)" : "var(--err)" }}>{x.st === "ok" ? "answering" + (x.ms ? " · " + (x.ms / 1000).toFixed(1) + "s" : "") : x.st}</b></div>)}
    </div>
  );
}

// ── PEOPLE: find someone and get them back in. Shows who can't sign in (accounts from before
// passwords were kept in the database) - never a password. A temporary password signs them out
// everywhere and asks them to choose their own the next time they sign in.
const tempPw = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; const b = new Uint8Array(8); crypto.getRandomValues(b); return "spine-" + Array.from(b, (x) => a[x % a.length]).join(""); };
export function PeoplePanel() {
  const [q, setQ] = useState(""); const [rows, setRows] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState({});
  const find = async () => { setBusy(true); const r = await adminFindAccounts(q.trim()); setBusy(false); setRows(r.error ? { error: r.error === "missing" ? "Run database Step 4f to switch this on." : r.error } : r.data || []); };
  const reset = async (u) => {
    const pw = tempPw();
    if (!window.confirm("Give " + u + " a temporary password?\n\nThey'll be signed out everywhere and asked to choose their own the next time they sign in.")) return;
    const r = await adminSetPassword(u, pw);
    setDone((d) => ({ ...d, [u]: r.data === "ok" ? { pw } : { error: r.error || r.data || "That didn't work." } }));
  };
  const blocked = Array.isArray(rows) ? rows.filter((x) => !x.can_sign_in).length : 0;
  return (
    <div className="bs-section">
      <div className="bs-head"><span className="bs-title serif">People</span><span className="cred-tag" style={{ background: "var(--ink)", color: "#fff" }}>sign-in help</span></div>
      <p className="bs-sub">Find anyone by username. "Can't sign in" means their account was made before passwords were kept in the database - give them a temporary password and send it to them (reply to their message, or text it).</p>
      <div className="ai-row"><input className="bs-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="username (or leave empty for the newest 50)" autoCapitalize="none" autoCorrect="off" spellCheck={false} onKeyDown={(e) => e.key === "Enter" && find()} style={{ flex: 1, minWidth: 0 }} /><button className="bs-btn" onClick={find} disabled={busy}>{busy ? "Looking..." : "Find"}</button></div>
      {rows && rows.error && <div className="bs-sub">{rows.error}</div>}
      {Array.isArray(rows) && <div className="bs-sub" style={{ marginTop: 6 }}>{rows.length} found{blocked ? ", " + blocked + " can't sign in" : ""}</div>}
      {Array.isArray(rows) && rows.map((x) => (
        <div key={x.username} className="ai-li pp15" data-user={x.username}>
          <span><b>@{x.username}</b>{x.is_admin ? " · owner" : ""}<small> · joined {x.made_on}{x.last_seen ? " · last in " + new Date(x.last_seen).toLocaleDateString() : ""}{x.contact ? " · " + x.contact : ""}</small>
            <small style={{ display: "block", color: x.can_sign_in ? "var(--live)" : "var(--err)" }}>{x.can_sign_in ? (x.must_change ? "on a temporary password" : "can sign in") + (x.has_recovery ? " · has a recovery code" : "") : "can't sign in - no password stored"}</small>
            {done[x.username] && done[x.username].pw && <small style={{ display: "block" }}>Temporary password: <code data-temp>{done[x.username].pw}</code> - send it to them.</small>}
            {done[x.username] && done[x.username].error && <small style={{ display: "block", color: "var(--err)" }}>{done[x.username].error}</small>}</span>
          <button className="bs-mini" onClick={() => reset(x.username)}>Temporary password</button>
        </div>))}
    </div>
  );
}
