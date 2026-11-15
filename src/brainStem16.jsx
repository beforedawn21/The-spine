// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - in the Brain Stem:
//  · "IS IT THEM OR US?" When people can't sign in or things are slow, one tap reads Supabase's and
//    Vercel's own status pages and knocks on The Spine's database, then says in plain words whose
//    problem it is.
//  · SECURITY GRADE for thespine.cloud from Mozilla's free HTTP Observatory (owner only, hourly).
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { getSessionToken } from "./spineData";

const COL = { green: "var(--live,#2e7d32)", amber: "#b26a00", red: "var(--err,#b3261e)", unknown: "var(--ink3,#777)" };
const WORD = { green: "fine", amber: "a bit wobbly", red: "having trouble", unknown: "couldn't tell" };
async function live(kind, extra) {
  const r = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what: "live", kind, ...(extra || {}) }), signal: AbortSignal.timeout(40000) });
  return r.json();
}
export function ThemOrUs() {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false); const [sec, setSec] = useState(null); const [sbusy, setSbusy] = useState(false);
  const check = async () => { setBusy(true); try { setSt(await live("status")); } catch (e) { setSt({ error: "The check itself couldn't run - that usually means your own internet." }); } setBusy(false); };
  const grade = async () => { setSbusy(true); try { setSec(await live("secgrade", { token: getSessionToken() || "" })); } catch (e) { setSec({ error: "Mozilla's checker didn't answer - try again in a minute." }); } setSbusy(false); };
  return (
    <div className="bs-section" data-themorus>
      <div className="bs-head"><span className="bs-title serif">Is it them or us?</span></div>
      <p className="bs-sub">If people say they can't get in or The Spine is slow, tap this first. It reads Supabase's and Vercel's own status pages and checks The Spine's database.</p>
      <button className="bs-btn" onClick={check} disabled={busy}>{busy ? "Checking..." : "Check now"}</button>
      {st && st.error && <div className="bs-sub" style={{ marginTop: 8 }}>{st.error}</div>}
      {st && !st.error && (
        <div style={{ marginTop: 8 }}>
          <div className="bs-sub" data-verdict style={{ color: COL[st.level], fontWeight: 700 }}>{st.verdict}</div>
          {(st.checks || []).map((c, i) => (
            <div key={i} className="ai-li"><span>{c.name}</span><b style={{ color: COL[c.level] }}>{WORD[c.level]}{c.words ? " · " + c.words : ""}</b></div>
          ))}
          {(st.checks || []).filter((c) => (c.incidents || []).length).map((c, i) => <div key={"i" + i} className="bs-sub">{c.name.split(" (")[0]}: {c.incidents.join("; ")}{(c.affected || []).length ? " - affects " + c.affected.join(", ") : ""}</div>)}
        </div>
      )}
      <div className="bs-head" style={{ marginTop: 14 }}><span className="bs-title serif">Security grade</span></div>
      <p className="bs-sub">Mozilla's free check of thespine.cloud's security settings. It can be run once an hour.</p>
      <button className="bs-btn" onClick={grade} disabled={sbusy}>{sbusy ? "Mozilla is checking (up to 30 seconds)..." : "Check the security grade"}</button>
      {sec && <div className="bs-sub" data-grade style={{ marginTop: 8 }}>{sec.error || sec.text}{sec.report && <> <a href={sec.report} target="_blank" rel="noopener noreferrer">See the full report</a></>}</div>}
    </div>
  );
}
