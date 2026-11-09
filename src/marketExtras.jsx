// ============================================================================
//  BATCH 7 - SCHEDULED AGENTS, BOUNTIES, REMIX FAMILY TREES
//  Small screens over the token-checked database functions in spineData.js.
// ============================================================================
import React, { useEffect, useState } from "react";
import { mySchedules, saveSchedule, deleteSchedule, seenSchedules, savePush, deletePush, hasPush, listBounties, postBounty, enterBounty, bountyEntries, awardBounty, closeBounty, toolLineage, toolEdition, requestPayout, myPayouts, cancelMyPayout, adminListPayouts, adminDecidePayout } from "./spineData";

// ── LOCK-SCREEN ALERTS (batch 14) ── "Tell me on this phone when a job runs". Standard Web Push;
// on an iPhone it needs The Spine on the Home Screen (Apple's rule), so it says so when it isn't.
const VAPID = (import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) || "";
const b64u = (s) => { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
export function PhoneAlerts() {
  const [st, setSt] = useState("checking"); const [msg, setMsg] = useState("");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const supported = !!VAPID && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const check = async () => { if (!supported || (ios && !standalone)) { setSt("unsupported"); return; } // iPhone alerts need the Home Screen app
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) { setSt("off"); return; } const h = await hasPush(sub.endpoint); setSt(h === null ? "nodb" : h ? "on" : "off"); } catch (e) { setSt("off"); } };
  useEffect(() => { check(); /* eslint-disable-next-line */ }, []);
  const turnOn = async () => { setMsg("");
    try { const perm = await Notification.requestPermission(); if (perm !== "granted") { setMsg("Notifications are turned off for The Spine in Settings."); return; }
      const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID) });
      const j = sub.toJSON(); const ok = await savePush(j.endpoint, j.keys && j.keys.p256dh, j.keys && j.keys.auth);
      if (ok === null) { setSt("nodb"); return; } setSt(ok ? "on" : "off"); setMsg(ok ? "Done - when a job runs, this phone will tell you." : "That couldn't be saved. Try again.");
    } catch (e) { setMsg("This phone wouldn't allow alerts: " + String(e && e.message || e).slice(0, 80)); } };
  const turnOff = async () => { try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await deletePush(sub.endpoint); await sub.unsubscribe(); } setSt("off"); setMsg("Alerts are off on this phone."); } catch (e) { setSt("off"); } };
  if (!VAPID) return null;
  return (<div className="xs-p" data-alerts={st} style={{ border: "1px solid var(--stone)", borderRadius: 12, padding: 10 }}>
    {st === "unsupported" ? (ios && !standalone ? <>To get alerts on this iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>, open The Spine from that icon, and come back here.</> : "This browser can't show alerts.")
      : st === "nodb" ? "Alerts need one more database step (Step 4e)."
      : st === "on" ? <><b>{"\u2713"} Alerts are on for this phone.</b> <button className="xs-btn sm" onClick={turnOff}>Turn off</button></>
      : st === "off" ? <><b>Tell me on this phone</b> when a job runs, like an app would. <button className="xs-btn sm" onClick={turnOn}>Turn on alerts</button></> : "..."}
    {msg && <div className="xs-ok">{msg}</div>}</div>);
}

// ── SCHEDULED AGENTS ────────────────────────────────────────────────────────
export function ScheduleManager({ onClose, signedIn, myTools, renderRich, onSignIn }) {
  const [rows, setRows] = useState(null); const [prompt, setPrompt] = useState(""); const [cad, setCad] = useState("daily");
  const [tool, setTool] = useState(""); const [msg, setMsg] = useState(""); const [open, setOpen] = useState(null);
  const load = async () => { const r = await mySchedules(); setRows(r); if (r.some((x) => !x.seen)) seenSchedules(); };
  useEffect(() => { if (signedIn) load(); else setRows([]); /* eslint-disable-next-line */ }, [signedIn]);
  const add = async () => {
    if (prompt.trim().length < 3) return;
    const id = await saveSchedule(null, prompt.trim(), cad, tool || null, true);
    if (id) { setPrompt(""); setTool(""); setMsg("Scheduled. It runs overnight and the result waits here for you."); load(); }
    else setMsg("That couldn't be saved - you can have up to five.");
  };
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Scheduled agents</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <p className="xs-p">Give The Spine a job to do on its own, every day or every week - a briefing, a plan, a list, fresh content for one of your tools. Results wait here.</p>
      {!signedIn ? <button className="xs-btn" onClick={onSignIn}>Sign in to schedule</button> : <>
        <textarea className="xs-in" rows={3} maxLength={1000} placeholder="e.g. Every Monday: three free things to do this weekend, with a one-line why for each" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="xs-row">
          <select className="xs-in sm" value={cad} onChange={(e) => setCad(e.target.value)}><option value="daily">Every day</option><option value="weekly">Every week</option></select>
          {myTools && myTools.length > 0 && <select className="xs-in sm" value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="">Just tell me</option>{myTools.map((t) => <option key={t.id} value={t.id}>Update "{t.name.slice(0, 24)}"</option>)}</select>}
          <button className="xs-btn sm" disabled={prompt.trim().length < 3} onClick={add}>Schedule</button>
        </div>
        {msg && <div className="xs-ok">{msg}</div>}
        <PhoneAlerts />
        {rows === null && <div className="xs-p dim">Loading...</div>}
        {rows && !rows.length && <div className="xs-p dim">Nothing scheduled yet.</div>}
        {(rows || []).map((r) => (
          <div key={r.id} className="mem-it">
            <div className="mem-t" onClick={() => setOpen(open === r.id ? null : r.id)}>{!r.seen && <b style={{ color: "var(--gold)" }}>New - </b>}{r.prompt}</div>
            <div className="mem-meta">
              <span style={{ marginLeft: 0 }}>{r.cadence === "weekly" ? "Weekly" : "Daily"}{r.tool_id ? " · updates a tool" : ""}{r.last_run ? " · last ran " + new Date(r.last_run).toLocaleDateString() : " · first run tonight"}</span>
              <button className={r.active ? "on" : ""} onClick={async () => { await saveSchedule(r.id, r.prompt, r.cadence, r.tool_id, !r.active); load(); }}>{r.active ? "On" : "Paused"}</button>
              <button onClick={async () => { await deleteSchedule(r.id); load(); }}>Delete</button>
            </div>
            {open === r.id && r.last_result && <div className="rf-text">{renderRich ? renderRich(r.last_result) : r.last_result}</div>}
          </div>))}
      </>}
    </div>
  );
}

// ── BOUNTIES ────────────────────────────────────────────────────────────────
export function BountyBoard({ onClose, signedIn, myTools, balance, onSignIn, onBalance }) {
  const [list, setList] = useState(null); const [title, setTitle] = useState(""); const [details, setDetails] = useState(""); const [reward, setReward] = useState(100);
  const [msg, setMsg] = useState(""); const [open, setOpen] = useState(null); const [entries, setEntries] = useState([]); const [pick, setPick] = useState(""); const [note, setNote] = useState("");
  const load = async () => setList(await listBounties());
  useEffect(() => { load(); }, []);
  const show = async (b) => { if (open === b.id) { setOpen(null); return; } setOpen(b.id); setEntries([]); setEntries(await bountyEntries(b.id)); };
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Bounties</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <p className="xs-p">Ask for something to be made and put credits on it. Makers enter with their work; you pick the winner and they earn the reward. If nobody wins, close it and the credits come back.</p>
      {signedIn ? <>
        <input className="xs-in" maxLength={120} placeholder="What do you want made? e.g. A pirate platformer with a parrot boss" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="xs-in" rows={2} maxLength={2000} placeholder="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="xs-row"><span>Reward</span><input className="xs-in sm" type="number" min={10} max={100000} value={reward} onChange={(e) => setReward(e.target.value)} style={{ width: 110 }} /><span style={{ color: "var(--ink3)", fontSize: 12 }}>you have {balance} cr</span>
          <button className="xs-btn sm" disabled={title.trim().length < 3 || reward < 10} onClick={async () => {
            const r = await postBounty(title.trim(), details.trim(), reward);
            if (r && r.status === "ok") { setTitle(""); setDetails(""); setMsg("Posted. The " + reward + " credits are held until you award or close it."); if (onBalance && typeof r.balance === "number") onBalance(r.balance); load(); }
            else setMsg(r && r.status === "not enough" ? "Not enough credits for that reward." : "That couldn't be posted just now.");
          }}>Post</button></div>
        {msg && <div className="xs-ok">{msg}</div>}
      </> : <button className="xs-btn ghost" onClick={onSignIn}>Sign in to post or enter a bounty</button>}
      {list === null && <div className="xs-p dim">Loading...</div>}
      {list && !list.length && <div className="xs-p dim">No bounties yet - be the first.</div>}
      {(list || []).map((b) => (
        <div key={b.id} className="mem-it">
          <div className="bty-h" onClick={() => show(b)}><b>{b.title}</b><span className={"bty-r " + b.status}>{b.status === "open" ? b.reward + " cr" : b.status}</span></div>
          <div className="mem-meta"><span style={{ marginLeft: 0 }}>by @{b.by_name} · {Number(b.entries)} {Number(b.entries) === 1 ? "entry" : "entries"}{b.status === "open" ? " · closes " + new Date(b.closes_at).toLocaleDateString() : ""}</span></div>
          {open === b.id && <div className="bty-b">
            {b.details && <p className="xs-p">{b.details}</p>}
            {entries.map((e) => (
              <div key={e.id} className="bty-e"><span><b>@{e.by_name}</b>{e.tool_name ? " - " + e.tool_name : ""}{e.note ? ": " + e.note : ""}</span>
                {b.mine && b.status === "open" && <button className="xs-btn sm" onClick={async () => { const r = await awardBounty(b.id, e.id); setMsg(r === "ok" ? "Awarded - @" + e.by_name + " earned " + b.reward + " credits." : "That couldn't be awarded."); load(); setOpen(null); }}>Award</button>}
              </div>))}
            {b.mine && b.status === "open" && <button className="xs-btn ghost" onClick={async () => { const r = await closeBounty(b.id); setMsg(r === "ok" ? "Closed - your " + b.reward + " credits are back." : "That couldn't be closed."); load(); setOpen(null); }}>Close and get my credits back</button>}
            {!b.mine && signedIn && b.status === "open" && <div>
              <select className="xs-in" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Enter without a Market item</option>{(myTools || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input className="xs-in" maxLength={500} placeholder="A note for the poster" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="xs-btn" onClick={async () => { const r = await enterBounty(b.id, pick || null, note); setMsg(r === "ok" ? (b.entered ? "Entry updated." : "Entered - good luck.") : "That couldn't be entered (" + r + ")."); show(b); load(); }}>{b.entered ? "Update my entry" : "Enter"}</button>
            </div>}
          </div>}
        </div>))}
    </div>
  );
}

// ── FAMILY TREE + TODAY'S EDITION (inside a Market item) ────────────────────
export function ToolOrigins({ tool, onOpen, renderRich }) {
  const [tree, setTree] = useState([]); const [ed, setEd] = useState(null);
  const id = tool && tool.id; const real = !!(tool && tool.persisted && /^[0-9a-f-]{36}$/i.test(String(id)));
  useEffect(() => { if (!real) return; let dead = false; toolLineage(id).then((t) => { if (!dead) setTree(t || []); }); toolEdition(id).then((e) => { if (!dead) setEd(e); }); return () => { dead = true; }; }, [id, real]);
  if (!real) return null;
  const others = tree.filter((x) => x.relation !== "this");
  return (
    <div className="to-wrap">
      {ed && ed.edition && <div className="to-ed"><div className="to-l">Today's edition{ed.edition_at ? " · " + new Date(ed.edition_at).toLocaleDateString() : ""}</div>{renderRich ? renderRich(ed.edition) : ed.edition}</div>}
      {others.length > 0 && <div className="to-tree"><div className="to-l">Family tree</div>
        {tree.map((x) => <button key={x.id} className={"to-n" + (x.relation === "this" ? " me" : "")} style={{ marginLeft: x.relation === "remixed into" ? 14 * Math.max(0, Number(x.depth) - 1) : 0 }}
          onClick={() => x.relation !== "this" && onOpen && onOpen(x.id)}>
          <span>{x.relation === "came from" ? "↑ came from" : x.relation === "remixed into" ? "↳ remixed into" : "● this"}</span> {x.name} <i>@{x.by_name}</i></button>)}
      </div>}
    </div>
  );
}

export const MARKET_EXTRAS_CSS = `
.po-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;}.po-row label{flex:1 1 200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink2);}
.po-row input{padding:10px 11px;border-radius:10px;border:1px solid var(--stone);background:var(--panel);color:var(--ink);font:inherit;font-size:15px;}
.po-hint{font-size:12px;color:var(--ink3);margin-top:8px;line-height:1.45;}.po-msg{margin-top:8px;font-size:13px;color:var(--ink);}
.po-list{margin-top:12px;display:flex;flex-direction:column;gap:6px;}.po-item{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:9px 11px;border:1px solid var(--stone);border-radius:10px;font-size:13px;}
.po-item .po-st{color:var(--ink2);}.po-item.paid .po-st{color:var(--live);}.po-item.rejected .po-st{color:var(--err,#b3261e);}.po-note{flex:1 1 100%;color:var(--ink3);font-size:12px;}
.bs-in{padding:9px 10px;border-radius:9px;border:1px solid var(--stone);background:var(--panel);color:var(--ink);font:inherit;font-size:14px;box-sizing:border-box;}
.po-x{margin-left:auto;background:none;border:1px solid var(--stone);border-radius:999px;padding:5px 10px;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;}

.bty-h{display:flex;justify-content:space-between;gap:10px;align-items:center;cursor:pointer;}
.bty-h b{font-size:14.5px;color:var(--ink);}
.bty-r{font:700 13px 'JetBrains Mono',monospace;color:var(--gold);white-space:nowrap;}.bty-r.awarded{color:var(--live);}.bty-r.closed{color:var(--ink3);}
.bty-b{margin-top:8px;}
.bty-e{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--stone);font-size:13px;color:var(--ink2);}
.to-wrap{margin:10px 0;}
.to-l{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px;}
.to-ed{padding:10px 12px;border-radius:12px;background:var(--gold-s);border:1px solid var(--gold-l);margin-bottom:10px;}
.to-tree{display:flex;flex-direction:column;gap:4px;}
.to-n{text-align:left;background:none;border:1px solid var(--stone);border-radius:10px;padding:7px 10px;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;}
.to-n.me{border-color:var(--gold-l);cursor:default;}.to-n span{color:var(--ink3);font-size:11.5px;margin-right:4px;}.to-n i{color:var(--ink3);font-style:normal;font-size:12px;}
`;

// ── PAYOUT REVIEW (batch 8) ─────────────────────────────────────────────────
// Creator side: ask to cash out earned credits. They are held (default 7 days), the owner reviews,
// then pays. Until the batch 8 database step is run, the old "send the owner a message" path is used.
const PO_STATUS = { held: "Held for review", approved: "Approved - payment on its way", paid: "Paid", rejected: "Not approved - credits returned", cancelled: "Cancelled - credits returned" };
const fmtD = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
export function PayoutPanel({ earned, live, holdDays, onEarned, fallbackSend }) {
  const [rows, setRows] = useState(null); const [amt, setAmt] = useState(""); const [method, setMethod] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => { const r = await myPayouts(); setRows(Array.isArray(r) ? r : null); };
  useEffect(() => { load(); }, []);
  const usd = (c) => "$" + (c * 0.001).toFixed(2);
  const open = (rows || []).find((r) => r.status === "held" || r.status === "approved");
  const want = Math.floor(Number(amt || earned) || 0);
  const can = live && !open && want >= 10000 && want <= earned && method.trim().length >= 3;
  async function ask() {
    setBusy(true); setMsg("");
    const r = await requestPayout(want, method.trim());
    if (r === null && fallbackSend) { await fallbackSend(want, method.trim()); setMsg("Request sent to the owner for review."); setBusy(false); return; }
    const st = r && r.status;
    if (st === "held") { setMsg("Requested. It's held until " + fmtD(r.release_at) + " for review, then the owner pays you."); setAmt(""); onEarned && onEarned(r.earned); load(); }
    else setMsg({ "not open": "Cash-out isn't open yet.", "already waiting": "You already have a request waiting.", "minimum 10000": "The minimum is $10 (10,000 credits).", "not enough earned": "That's more than you've earned.", "slow down": "Too many tries today - try tomorrow.", "sign in": "Sign in first." }[st] || "That didn't go through - try again.");
    setBusy(false);
  }
  return (
    <div className="po">
      <div className="wt-row" style={{ maxWidth: 360 }}><span>Earned, in dollars</span><b className="mono">{usd(earned)}</b></div>
      {live && !open && (<>
        <div className="po-row">
          <label>Amount (credits)<input type="number" min="10000" max={earned} step="1000" placeholder={String(earned)} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
          <label>How should we pay you?<input placeholder="PayPal email, or bank / Stripe details" value={method} onChange={(e) => setMethod(e.target.value)} maxLength={200} /></label>
        </div>
        <button className="primary-cta" style={{ marginTop: 10 }} disabled={!can || busy} onClick={ask}>{busy ? "Sending..." : earned >= 10000 ? "Request cash-out of " + usd(want) : "Earn $10 to cash out"}</button>
        <div className="po-hint">Every cash-out is held for {holdDays || 7} days and checked by a person before it's paid - that keeps fake earnings out and real ones safe.</div>
      </>)}
      {!live && <button className="primary-cta" style={{ marginTop: 10 }} disabled>Cash-out coming soon</button>}
      {msg && <div className="po-msg">{msg}</div>}
      {rows && rows.length > 0 && (
        <div className="po-list">
          {rows.slice(0, 8).map((r) => (
            <div key={r.id} className={"po-item " + r.status}>
              <span><b>{usd(r.credits)}</b> . {fmtD(r.created_at)}</span>
              <span className="po-st">{PO_STATUS[r.status] || r.status}{r.status === "held" ? " until " + fmtD(r.release_at) : ""}{r.paid_ref ? " . ref " + r.paid_ref : ""}</span>
              {r.admin_note && <span className="po-note">"{r.admin_note}"</span>}
              {r.status === "held" && <button className="po-x" onClick={async () => { if (await cancelMyPayout(r.id)) { onEarned && onEarned(earned + r.credits); load(); } }}>Cancel</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// Owner side, in Brain Stem.
export function AdminPayouts() {
  const [rows, setRows] = useState(null); const [note, setNote] = useState({}); const [ref, setRef] = useState({}); const [msg, setMsg] = useState("");
  const load = async () => { const r = await adminListPayouts(); setRows(r); };
  useEffect(() => { load(); }, []);
  const usd = (c) => "$" + (c * 0.001).toFixed(2);
  const act = async (r, a) => { if (a === "reject" && !window.confirm("Reject this cash-out? The credits go back to " + r.username + ".")) return; const out = await adminDecidePayout(r.id, a, note[r.id] || "", ref[r.id] || ""); setMsg(r.username + ": " + out); load(); };
  const waiting = (rows || []).filter((r) => r.status === "held" || r.status === "approved");
  return (
    <div className="bs-section">
      <div className="bs-head"><span className="bs-title serif">Cash-outs</span><span className="cred-tag" style={{ background: "var(--ink)", color: "#fff" }}>{rows ? waiting.length : "-"} waiting</span></div>
      <p className="bs-sub">Every request is held, then you check it. Approve only when the hold is over and it looks real; pay the creator yourself (PayPal, Stripe, bank), then mark it paid with the reference. Reject puts the credits straight back.</p>
      <button className="bs-btn alt" onClick={load}>Refresh cash-outs</button>
      {rows === null && <div className="bs-sub">Run the batch 8 database step to switch this on.</div>}
      {msg && <div className="bs-sub" style={{ color: "var(--live)" }}>{msg}</div>}
      {(rows || []).slice(0, 60).map((r) => (
        <div key={r.id} className="prov-row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
          <span style={{ flex: "1 1 100%" }}><b>{usd(r.credits)}</b> to <b>{r.username}</b>{r.contact ? " (" + r.contact + ")" : ""} . asked {fmtD(r.created_at)} . {r.status}{r.status === "held" ? (r.ready ? " . hold over" : " . held until " + fmtD(r.release_at)) : ""}</span>
          <span style={{ flex: "1 1 100%", fontSize: 13, color: "var(--ink2)" }}>Pay by: {r.method || "-"} . still earning: {usd(r.earned_now || 0)}{r.paid_ref ? " . ref " + r.paid_ref : ""}</span>
          {r.flags && <span style={{ flex: "1 1 100%", fontSize: 13, color: "var(--err,#b3261e)" }}>Check: {r.flags}</span>}
          {(r.status === "held" || r.status === "approved") && (<>
            <input className="bs-in" placeholder="Note to the creator (optional)" value={note[r.id] || ""} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} style={{ flex: "1 1 100%" }} />
            {r.status === "approved" && <input className="bs-in" placeholder="Payment reference (e.g. PayPal ID)" value={ref[r.id] || ""} onChange={(e) => setRef((n) => ({ ...n, [r.id]: e.target.value }))} style={{ flex: "1 1 100%" }} />}
            {r.status === "held" && <button className="bs-btn alt" disabled={!r.ready} onClick={() => act(r, "approve")}>{r.ready ? "Approve" : "In hold"}</button>}
            {r.status === "approved" && <button className="bs-btn alt" onClick={() => act(r, "paid")}>Mark paid</button>}
            <button className="bs-btn" onClick={() => act(r, "reject")}>Reject</button>
          </>)}
        </div>
      ))}
    </div>
  );
}
