// ═══════════════════════════════════════════════════════════════════════════════════════════
//  GETTING BACK IN (batch 15). No email service and no keys:
//  · a recovery code each person can make once and keep - with it they reset their own password
//  · no code? "Ask for help" lands in the owner's inbox, and the owner sets a temporary password
//  · after a temporary password, the person chooses their own on the next sign-in
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { resetWithCode, changePassword, makeRecoveryCode, recordFeedback } from "./spineData";
import { track } from "./usageTracker.js";
import { StrengthMeter } from "./account16.jsx";

import { copyText as copyNow, COPY_FAIL } from "./copy17.js";
const noCaps = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false };

export function ForgotPassword({ startName, onDone, onBack }) {
  const [mode, setMode] = useState("code"); const [name, setName] = useState(startName || ""); const [code, setCode] = useState(""); const [pw, setPw] = useState("");
  const [contact, setContact] = useState(""); const [note, setNote] = useState(""); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!name.trim() || !code.trim()) { setMsg({ bad: 1, t: "Enter your username and your recovery code." }); return; }
    if (pw.length < 6) { setMsg({ bad: 1, t: "Choose a new password of at least 6 characters." }); return; }
    setBusy(true); const r = await resetWithCode(name, code, pw); setBusy(false);
    const st = r.data;
    if (st === "ok") { track("Access · Reset with code"); setMsg({ t: "Done - your password is changed. Sign in with it now." }); setTimeout(() => onDone && onDone(name.trim()), 1200); return; }
    setMsg({ bad: 1, t: st === "slow down" ? "Too many tries - wait an hour, or ask for help below." : st === "too short" ? "Choose a new password of at least 6 characters." : r.error === "missing" ? "Resetting isn't switched on yet - ask for help instead." : r.error ? r.error : "That username and recovery code don't match." });
  };
  const ask = async () => {
    if (!name.trim() || !contact.trim()) { setMsg({ bad: 1, t: "Enter your username and a way to reach you (email or phone)." }); return; }
    setBusy(true);
    const r = await recordFeedback("signin-help", null, true, "[Can't sign in] username: " + name.trim().slice(0, 40) + (note.trim() ? " - " + note.trim().slice(0, 600) : ""), "signin-help", contact.trim().slice(0, 200)).catch(() => ({ ok: false }));
    setBusy(false);
    if (r && r.ok === false) { setMsg({ bad: 1, t: "That didn't send - please email support@thespine.cloud." }); return; }
    track("Access · Asked for help"); setMsg({ t: "Sent to The Spine's owner. You'll get a temporary password at " + contact.trim() + " - then you choose your own." });
  };
  return (
    <div className="acc15">
      <div className="uf-toggle" role="group" aria-label="How to get back in" style={{ marginBottom: 12 }}>
        <button aria-pressed={mode === "code" || undefined} onClick={() => { setMode("code"); setMsg(null); }}>I have a recovery code</button>
        <button aria-pressed={mode === "help" || undefined} onClick={() => { setMode("help"); setMsg(null); }}>Ask for help</button>
      </div>
      <div className="field"><label>Username</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="yourname" autoComplete="username" {...noCaps} /></div>
      {mode === "code" ? (<>
        <div className="field"><label>Recovery code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" {...noCaps} /></div>
        <div className="field"><label>New password</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="at least 6 characters" autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && reset()} /></div>
        <StrengthMeter password={pw} />
        {msg && <div className={"snotice " + (msg.bad ? "warn" : "info")}>{msg.t}</div>}
        <button className="primary-cta" onClick={reset} disabled={busy}>{busy ? "Checking..." : "Set my new password"}</button>
      </>) : (<>
        <div className="field"><label>How can we reach you?</label><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email or phone" autoComplete="email" {...noCaps} /></div>
        <div className="field"><label>Anything else? (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I signed up in the summer" /></div>
        {msg && <div className={"snotice " + (msg.bad ? "warn" : "info")}>{msg.t}</div>}
        <button className="primary-cta" onClick={ask} disabled={busy}>{busy ? "Sending..." : "Send to The Spine"}</button>
      </>)}
      <button className="acct-link" style={{ marginTop: 10 }} onClick={onBack}>Back to sign in</button>
    </div>
  );
}

export function ChooseOwnPassword({ onDone }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (a.length < 6) { setMsg("At least 6 characters, please."); return; }
    if (a !== b) { setMsg("The two don't match."); return; }
    setBusy(true); const r = await changePassword("", a); setBusy(false);
    if (r.data === "ok") { track("Access · Chose own password"); onDone && onDone(); } else setMsg(r.data === "wrong password" ? "Please sign in again." : r.error || "That didn't work - try again.");
  };
  return (
    <div className="acc15" role="dialog" aria-label="Choose your own password">
      <div className="mt serif" style={{ fontSize: 20, marginBottom: 6 }}>Choose your own password</div>
      <p className="v15-p">You signed in with a temporary password. Pick one only you know - it replaces the temporary one everywhere.</p>
      <div className="field"><label>New password</label><input type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" /></div>
      <StrengthMeter password={a} />
      <div className="field"><label>Type it again</label><input type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && go()} /></div>
      {msg && <div className="snotice warn">{msg}</div>}
      <button className="primary-cta" onClick={go} disabled={busy}>{busy ? "Saving..." : "Save my password"}</button>
    </div>
  );
}

export function AccountSafety({ onClose }) {
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [oldPw, setOld] = useState(""); const [newPw, setNew] = useState(""); const [pmsg, setPmsg] = useState(null);
  const make = async () => { setBusy(true); setMsg(""); const r = await makeRecoveryCode(); setBusy(false); if (r.data) { setCode(r.data); track("Access · Recovery code made"); } else setMsg(r.error === "missing" ? "Recovery codes aren't switched on yet." : "That didn't work - try again."); };
  const change = async () => { if (newPw.length < 6) { setPmsg({ bad: 1, t: "At least 6 characters." }); return; } const r = await changePassword(oldPw, newPw); if (r.data === "ok") { setPmsg({ t: "Password changed. Other phones signed in to this account are signed out." }); setOld(""); setNew(""); } else setPmsg({ bad: 1, t: r.data === "wrong password" ? "Your current password isn't right." : r.error || "That didn't work." }); };
  return (
    <div className="v15 acc15">
      <div className="v15-h"><b>Account safety</b>{onClose && <button className="v15-x" onClick={onClose} aria-label="Close">×</button>}</div>
      <p className="v15-p"><b>Recovery code.</b> If you ever forget your password, this code lets you set a new one yourself - no email needed. Keep it somewhere safe (a note, a photo, your password manager). Making a new code cancels the old one.</p>
      {!code && <button className="v15-btn pri" onClick={make} disabled={busy}>{busy ? "Making..." : "Make my recovery code"}</button>}
      {code && <div className="acc15-code"><code data-code>{code}</code><button className="v15-btn" onClick={() => { copyNow(code).then((ok) => setMsg(ok ? "Copied." : COPY_FAIL)); }}>Copy</button><div className="v15-p">This is the only time it's shown.</div></div>}
      {msg && <div className="v15-p">{msg}</div>}
      <p className="v15-p" style={{ marginTop: 14 }}><b>Change password</b></p>
      <div className="field"><label>Current password</label><input type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" /></div>
      <div className="field"><label>New password</label><input type="password" value={newPw} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" /></div>
      <StrengthMeter password={newPw} />
      {pmsg && <div className={"snotice " + (pmsg.bad ? "warn" : "info")}>{pmsg.t}</div>}
      <button className="v15-btn" onClick={change}>Change password</button>
    </div>
  );
}

export const ACCESS15_CSS = `
.bs-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:9px;background:var(--err,#b3261e);color:#fff;font:700 11px Manrope,system-ui,sans-serif;vertical-align:1px;}
.bs-in{border:1px solid var(--stone);border-radius:10px;padding:9px 10px;font:14px Manrope,system-ui,sans-serif;background:var(--panel);color:var(--ink);}
.acc15 .field{margin-bottom:10px;}.acc15-code{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;}
.acc15-code code{font:700 18px ui-monospace,Menlo,monospace;letter-spacing:1px;background:var(--stone-l,rgba(0,0,0,.06));padding:8px 10px;border-radius:8px;color:var(--ink);}
`;
