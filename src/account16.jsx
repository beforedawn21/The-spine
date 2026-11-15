// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - signing in, safer:
//  · FACE ID / FINGERPRINT SIGN-IN (passkeys). Set up in Account safety; then "Sign in with Face ID"
//    in the sign-in window. The phone keeps the private key; The Spine keeps only the public half.
//    Passwords keep working.
//  · A PASSWORD STRENGTH METER (zxcvbn-ts, worked out on the phone - the password never leaves it),
//    under every "new password" box.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { passkeySetUp, passkeyList, passkeyRemove, passkeyReady } from "./spineData";
import { track } from "./usageTracker.js";

export const faceWord = () => { try { const ua = navigator.userAgent || ""; return /iPhone|iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "Face ID" : /Android/.test(ua) ? "fingerprint" : "Face ID or fingerprint"; } catch (e) { return "Face ID"; } };

export function PasskeyCard() {
  const [list, setList] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(true);
  const load = () => passkeyList().then((r) => setList(Array.isArray(r && r.data) ? r.data : [])).catch(() => setList([]));
  useEffect(() => { passkeyReady().then(setOk); load(); }, []);
  const add = async () => { setBusy(true); setMsg(""); const r = await passkeySetUp(/iPhone/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : "This device"); setBusy(false);
    if (r.ok) { setMsg("Done - next time, tap “Sign in with " + faceWord() + "”."); track("Access · Passkey set up"); load(); } else setMsg(r.error); };
  return (
    <div className="v15 acc16" data-passkeys>
      <div className="v15-h"><b>{faceWord() === "fingerprint" ? "Fingerprint sign-in" : "Face ID sign-in"}</b></div>
      <p className="v15-p">Sign in with your face or fingerprint instead of typing your password. The key stays inside this phone; The Spine only keeps a lock it fits. Your password keeps working too.</p>
      {!ok && <p className="v15-p">This browser can't do it - try Safari on iPhone or Chrome on Android.</p>}
      {ok && <button className="v15-btn pri" onClick={add} disabled={busy}>{busy ? "Waiting for " + faceWord() + "..." : "Set up " + faceWord() + " sign-in"}</button>}
      {list && list.length > 0 && list.map((k) => (
        <div className="acc16-conn" key={k.id}><span>{k.name || "Passkey"} · set up {String(k.made || "").slice(0, 10)}{k.used ? " · last used " + String(k.used).slice(0, 10) : ""}</span>
          <button className="v15-btn" onClick={async () => { await passkeyRemove(k.id); load(); }}>Remove</button></div>
      ))}
      {msg && <div className="v15-p" data-msg>{msg}</div>}
    </div>
  );
}

// ── the strength meter ──
let __zx = null;
async function zx() {
  if (__zx) return __zx;
  __zx = (async () => {
    const [core, common, en] = await Promise.all([import("@zxcvbn-ts/core"), import("@zxcvbn-ts/language-common"), import("@zxcvbn-ts/language-en")]);
    const opts = { translations: en.translations, graphs: common.adjacencyGraphs, dictionary: { ...common.dictionary, ...en.dictionary, spine: ["thespine", "spine", "spinecloud"] } };
    if (core.ZxcvbnFactory) { const f = new core.ZxcvbnFactory(opts); return (pw, user) => f.check(pw, user); }
    core.zxcvbnOptions.setOptions(opts); return (pw, user) => core.zxcvbn(pw, user);
  })();
  return __zx;
}
export async function passwordStrength(pw, userInputs) { const f = await zx(); return f(String(pw || ""), (userInputs || []).filter(Boolean)); }
const WORDS = ["Very easy to guess", "Easy to guess", "Could be stronger", "Strong", "Very strong"];
export function StrengthMeter({ password, user }) {
  const [r, setR] = useState(null);
  useEffect(() => { let live = true; if (!password) { setR(null); return; } const t = setTimeout(() => { passwordStrength(password, [user]).then((x) => { if (live) setR(x); }).catch(() => {}); }, 150); return () => { live = false; clearTimeout(t); }; }, [password, user]);
  if (!password || !r) return null;
  const s = r.score; const tip = (r.feedback && (r.feedback.warning || (r.feedback.suggestions || [])[0])) || "";
  return (
    <div className="pw16" data-score={s} aria-live="polite">
      <div className="pw16-bar">{[0, 1, 2, 3].map((i) => <i key={i} className={i < Math.max(1, s) ? "on s" + s : ""} />)}</div>
      <div className="pw16-t"><b>{WORDS[s]}</b>{s < 3 && tip ? " - " + tip : ""}</div>
    </div>
  );
}
export const ACCOUNT16_CSS = `
.pw16{margin:-4px 0 10px;}.pw16-bar{display:flex;gap:4px;}.pw16-bar i{flex:1;height:5px;border-radius:3px;background:var(--stone);}
.pw16-bar i.on.s0,.pw16-bar i.on.s1{background:#b3261e;}.pw16-bar i.on.s2{background:#b26a00;}.pw16-bar i.on.s3{background:#2e7d32;}.pw16-bar i.on.s4{background:#1b5e20;}
.pw16-t{font:12.5px Manrope,system-ui,sans-serif;color:var(--ink-2,var(--ink));margin-top:4px;}
.pk16-btn{margin-top:10px;width:100%;}
`;
