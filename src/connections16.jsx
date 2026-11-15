// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - in Account safety:
//  · YOUR SPINE CALENDAR: one private address Apple Calendar or Google Calendar subscribes to.
//    It carries the events your Spine tools save and your scheduled Spine jobs, and updates itself.
//  · CONNECTED ON THIS PHONE: every channel, automation, social account and Home Assistant you
//    linked to a Spine tool - they live only on this phone - with a Remove button for each.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { calStatus, calFeedNew, calFeedOff, calFeedUrl } from "./spineData";
import { track } from "./usageTracker.js";

import { copyText as copyNow, COPY_FAIL } from "./copy17.js";
const KEY = "spine.calfeed";
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch (e) { return d; } };

export function CalendarFeedCard() {
  const [st, setSt] = useState(null); const [url, setUrl] = useState(() => readLS(KEY, null)); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { calStatus().then((s) => { setSt(s); if (s && !s.on) { localStorage.removeItem(KEY); setUrl(null); } }).catch(() => {}); }, []);
  const turnOn = async () => {
    setBusy(true); setMsg(""); const r = await calFeedNew(); setBusy(false);
    if (r && r.data) { const u = calFeedUrl(r.data); localStorage.setItem(KEY, JSON.stringify(u)); setUrl(u); setSt((s) => ({ ...(s || {}), on: true })); track("Do · Calendar feed on"); }
    else setMsg(r && r.error === "missing" ? "The calendar isn't switched on in the database yet." : "That didn't work - are you signed in?");
  };
  const turnOff = async () => { setBusy(true); await calFeedOff(); setBusy(false); localStorage.removeItem(KEY); setUrl(null); setSt((s) => ({ ...(s || {}), on: false })); setMsg("Switched off. Calendars subscribed to the old address stop updating."); };
  const webcal = url ? url.replace(/^https?:/, "webcal:") : "";
  return (
    <div className="v15 acc16" data-calfeed>
      <div className="v15-h"><b>Your Spine calendar</b></div>
      <p className="v15-p">One private address your phone's calendar subscribes to. Events your Spine tools save, and your scheduled Spine jobs, appear there and stay up to date by themselves.</p>
      {st && st.on && !url && <p className="v15-p">It's switched on from another phone. Make a new address here to use it on this one (the old address stops working).</p>}
      {url ? (
        <>
          <div className="acc16-row">
            <a className="v15-btn pri" href={webcal} data-apple>Add to Apple Calendar</a>
            <a className="v15-btn" href={"https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal)} target="_blank" rel="noopener noreferrer" data-google>Add to Google Calendar</a>
            <button className="v15-btn" onClick={() => { copyNow(url).then((ok) => setMsg(ok ? "Address copied - keep it private, anyone with it can see these events." : COPY_FAIL)); }}>Copy address</button>
          </div>
          <div className="acc16-row">
            <button className="v15-btn" onClick={turnOn} disabled={busy}>Make a new address</button>
            <button className="v15-btn" onClick={turnOff} disabled={busy}>Switch off</button>
          </div>
          {st && st.items != null && <p className="v15-p">{st.items} event{st.items === 1 ? "" : "s"} saved so far.</p>}
        </>
      ) : (
        <button className="v15-btn pri" onClick={turnOn} disabled={busy}>{busy ? "Switching on..." : "Switch on my calendar"}</button>
      )}
      {msg && <div className="v15-p">{msg}</div>}
    </div>
  );
}

// Everything a tool linked on this phone. Nothing here is on our servers.
const LINKS = [
  { key: "spine.channels", label: (x) => x.name + " (" + (x.kind === "slack" ? "Slack" : "Discord") + " channel)", list: true },
  { key: "spine.automations", label: (x) => x.name + " (" + ({ make: "Make", zapier: "Zapier", ifttt: "IFTTT", n8n: "n8n" }[x.kind] || x.kind) + " automation)", list: true },
  { key: "spine.social", label: (x, k) => ({ telegram: "Telegram", mastodon: "Mastodon", bluesky: "Bluesky" }[k] || k) + (x.handle ? " - @" + String(x.handle).replace(/^@/, "") : x.server ? " - " + String(x.server).replace(/^https:\/\//, "") : x.chat ? " - " + x.chat : ""), map: true },
  { key: "spine.home", label: (x) => "Home Assistant - " + String(x.url || "").replace(/^https:\/\//, ""), single: true },
];
export function connectionsOnPhone() {
  const out = [];
  for (const L of LINKS) {
    const v = readLS(L.key, null); if (!v) continue;
    if (L.list && Array.isArray(v)) v.forEach((x, i) => out.push({ key: L.key, id: i, name: x.name, text: L.label(x) }));
    else if (L.map && typeof v === "object") Object.keys(v).forEach((k) => out.push({ key: L.key, id: k, text: L.label(v[k] || {}, k) }));
    else if (L.single) out.push({ key: L.key, id: null, text: L.label(v) });
  }
  return out;
}
export function forgetConnection(key, id) {
  const v = readLS(key, null); if (v == null) return;
  if (id == null) localStorage.removeItem(key);
  else if (Array.isArray(v)) { v.splice(Number(id), 1); localStorage.setItem(key, JSON.stringify(v)); }
  else { delete v[id]; localStorage.setItem(key, JSON.stringify(v)); }
}
export function PhoneConnections() {
  const [list, setList] = useState(() => connectionsOnPhone());
  return (
    <div className="v15 acc16" data-connections>
      <div className="v15-h"><b>Connected on this phone</b></div>
      {list.length ? <p className="v15-p">Channels, automations and accounts you let a Spine tool use. They're kept only on this phone - remove any you no longer want.</p>
        : <p className="v15-p">Nothing connected. When a tool asks to post to your channel, start an automation or reach your home, it shows up here.</p>}
      {list.map((x) => (
        <div className="acc16-conn" key={x.key + ":" + x.id}><span>{x.text}</span>
          <button className="v15-btn" onClick={() => { forgetConnection(x.key, x.id); setList(connectionsOnPhone()); }}>Remove</button></div>
      ))}
    </div>
  );
}

export const CONN16_CSS = `
.acc16{margin-top:10px;}.acc16-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;}.acc16-row a{text-decoration:none;display:inline-block;}
.acc16-conn{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--stone);font:14px Manrope,system-ui,sans-serif;}
.acc16-conn span{overflow-wrap:anywhere;}
`;
