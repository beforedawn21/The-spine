// ============================================================================
//  THE CORE, GROWN UP
//  Everything here runs on the phone and needs no new key:
//    - an effort dial (Quick / Auto / Deep)
//    - a chat lock (a PIN, plus Face ID / Touch ID where the phone offers it)
//    - memories you can read, correct, sort, pin, hide or delete
//    - "My month": a recap of what you made and asked
//    - slides and documents made inside the Core, presented full-screen or saved as PDF
//    - any long answer opened as a page you can read, present and ask about
//    - the agent's activity log: every run, every step, every source
//    - a picker to run any Market tool without leaving the Core
// ============================================================================
import { DeckEditor, PageEditor, deckStyle, cleanHtml } from "./editSuite.jsx";
import { printBook } from "./localAI.js";
import React, { useEffect, useMemo, useRef, useState } from "react";

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

// ── EFFORT ──────────────────────────────────────────────────────────────────
export const EFFORTS = [
  { key: "quick", label: "Quick", hint: "Fast, short answers" },
  { key: "auto", label: "Auto", hint: "The Spine picks" },
  { key: "deep", label: "Deep", hint: "Slower, thinks it through" },
];
export function loadEffort() { const e = ls.get("spine.effort", "auto"); return EFFORTS.some((x) => x.key === e) ? e : "auto"; }
export function EffortDial({ value, onChange, disabled }) {
  return (
    <div className="eff-dial" role="radiogroup" aria-label="How hard should The Spine think?">
      {EFFORTS.map((e) => (
        <button key={e.key} role="radio" aria-checked={value === e.key} disabled={disabled} title={e.hint}
          className={"eff-chip" + (value === e.key ? " on" : "")} onClick={() => { ls.set("spine.effort", e.key); onChange(e.key); }}>
          {e.key === "quick" ? "⚡ " : e.key === "deep" ? "🧠 " : "✦ "}{e.label}
        </button>))}
    </div>
  );
}
export const DEEP_DIRECTIVE = "\n\nTHE PERSON ASKED YOU TO THINK DEEPLY. Take the time: work the problem through in parts, check each step, weigh alternatives and edge cases, then give the most rigorous, complete answer you can. Show the key reasoning, not every scratch step.";
export const QUICK_DIRECTIVE = "\n\nTHE PERSON ASKED FOR A QUICK ANSWER. Answer in the fewest words that are fully correct - a sentence or a short list. No preamble.";

// ── CHAT LOCK ───────────────────────────────────────────────────────────────
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function lockConfig() { return ls.get("spine.lock", null); }
export function lockEnabled() { const c = lockConfig(); return !!(c && c.hash); }
export async function setLockPin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const prev = lockConfig() || {};
  ls.set("spine.lock", { ...prev, salt, hash: await sha(salt + ":" + pin), after: prev.after || 5 });
}
export function clearLock() { try { localStorage.removeItem("spine.lock"); } catch (e) {} }
async function checkPin(pin) { const c = lockConfig(); return !!(c && c.hash && (await sha(c.salt + ":" + pin)) === c.hash); }
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export async function passkeyAvailable() {
  try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch (e) { return false; }
}
// Face ID / Touch ID: a key that lives on this phone and only opens after the face or finger is checked.
export async function addPasskey() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "The Spine" },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "chat-lock", displayName: "The Spine chat lock" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" }, timeout: 60000 } });
  if (!cred) throw new Error("cancelled");
  const c = lockConfig() || {}; ls.set("spine.lock", { ...c, passkey: b64u(cred.rawId) });
}
async function checkPasskey() {
  const c = lockConfig(); if (!c || !c.passkey) return false;
  const a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: unb64u(c.passkey) }], userVerification: "required", timeout: 60000 } });
  return !!(a && a.response && a.response.authenticatorData && (new Uint8Array(a.response.authenticatorData)[32] & 4));
}
export function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(""); const c = lockConfig() || {};
  const tryPasskey = async () => { try { if (await checkPasskey()) onUnlock(); else setErr("That didn't match."); } catch (e) { setErr("Face ID was cancelled. Use your PIN."); } };
  useEffect(() => { if (c.passkey) tryPasskey(); /* eslint-disable-next-line */ }, []);
  const go = async (p) => { if (await checkPin(p)) onUnlock(); else { setErr("Wrong PIN."); setPin(""); } };
  const press = (d) => { const p = (pin + d).slice(0, 8); setPin(p); setErr(""); if (p.length >= 4 && p.length === (c.len || 4)) go(p); };
  return (
    <div className="lock-screen" role="dialog" aria-label="Chats are locked">
      <div className="lock-ic">{"🔒"}</div>
      <div className="lock-t">Your chats are locked</div>
      <div className="lock-dots">{Array.from({ length: c.len || 4 }).map((_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
      {err && <div className="lock-err">{err}</div>}
      <div className="lock-pad">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => k === "" ? <span key={i} /> :
        <button key={i} onClick={() => k === "⌫" ? setPin(pin.slice(0, -1)) : press(k)}>{k}</button>)}</div>
      {c.passkey && <button className="lock-alt" onClick={tryPasskey}>Use Face ID / Touch ID</button>}
    </div>
  );
}
export function LockSettings({ onClose }) {
  const [on, setOn] = useState(lockEnabled()); const [pin, setPin] = useState(""); const [msg, setMsg] = useState(""); const [pk, setPk] = useState(false);
  const c = lockConfig() || {};
  useEffect(() => { passkeyAvailable().then(setPk); }, []);
  return (
    <div className="xs-sheet">
      <div className="xs-head"><b>Chat lock & spending</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <p className="xs-p">Locks your chats, memories and Vault behind a PIN whenever The Spine has been away for a few minutes. It stays on this phone - it is never sent anywhere.</p>
      {!on ? (<>
        <input className="xs-in" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="Choose a 4 to 8 digit PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        <button className="xs-btn" disabled={pin.length < 4} onClick={async () => { await setLockPin(pin); const cc = lockConfig(); ls.set("spine.lock", { ...cc, len: pin.length }); setOn(true); setPin(""); setMsg("Locked with your PIN."); }}>Turn on the lock</button>
      </>) : (<>
        <div className="xs-row"><span>Lock after</span>
          <select className="xs-in sm" defaultValue={c.after || 5} onChange={(e) => ls.set("spine.lock", { ...lockConfig(), after: Number(e.target.value) })}>
            {[0, 1, 5, 15, 60].map((m) => <option key={m} value={m}>{m === 0 ? "Immediately" : m + " min away"}</option>)}
          </select></div>
        {pk && !c.passkey && <button className="xs-btn ghost" onClick={async () => { try { await addPasskey(); setMsg("Face ID / Touch ID added."); } catch (e) { setMsg("That wasn't set up."); } }}>Also unlock with Face ID / Touch ID</button>}
        <button className="xs-btn ghost" onClick={() => { clearLock(); setOn(false); setMsg("The lock is off."); }}>Turn the lock off</button>
      </>)}
      {msg && <div className="xs-ok">{msg}</div>}
      <div className="xs-head" style={{ marginTop: 18 }}><b>Spending</b></div>
      <p className="xs-p">Ask me before anything costs more than this - nothing is taken until I tap again.</p>
      <select className="xs-in" defaultValue={String(ls.get("spine.spendAsk", "off"))} onChange={(e) => { ls.set("spine.spendAsk", e.target.value === "off" ? null : Number(e.target.value)); setMsg(e.target.value === "off" ? "Spending approval is off." : "I'll ask before anything over " + e.target.value + " credits."); }}>
        <option value="off">Don't ask (as now)</option>{[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>Ask above {n} credits</option>)}
      </select>
    </div>
  );
}

// ── MEMORIES ────────────────────────────────────────────────────────────────
export const MEM_CATS = ["Personal", "Family", "Work", "Projects", "Health", "Money", "Learning", "Other"];
export function MemoryManager({ onClose }) {
  const [mems, setMems] = useState(() => ls.get("spine.memories", []));
  const [cat, setCat] = useState("All"); const [edit, setEdit] = useState(null); const [draft, setDraft] = useState("");
  const save = (m) => { setMems(m); ls.set("spine.memories", m); };
  const shown = mems.map((m, i) => ({ m, i })).filter(({ m }) => cat === "All" || (m.cat || "Other") === cat);
  const add = () => { const t = draft.trim(); if (!t) return; save([{ q: t.slice(0, 280), note: t.slice(0, 280), topics: t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 12), at: Date.now(), cat: cat === "All" ? "Personal" : cat, pin: true, mine: true }, ...mems]); setDraft(""); };
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>What The Spine remembers</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <p className="xs-p">These stay on your phone (and your account, if you're signed in). Pinned ones are always used; hidden ones are never sent to the reasoning centre.</p>
      <div className="xs-chips">{["All", ...MEM_CATS].map((c) => <button key={c} className={"xs-chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="xs-row"><input className="xs-in" placeholder="Tell it something to always remember" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><button className="xs-btn sm" onClick={add}>Add</button></div>
      {!shown.length && <div className="xs-p dim">Nothing here yet.</div>}
      {shown.map(({ m, i }) => (
        <div key={m.at + "-" + i} className={"mem-it" + (m.sens ? " sens" : "")}>
          {edit === i ? (
            <textarea className="xs-in" defaultValue={m.note || m.q} rows={3} onBlur={(e) => { const n = [...mems]; n[i] = { ...m, note: e.target.value.slice(0, 280) }; save(n); setEdit(null); }} autoFocus />
          ) : <div className="mem-t" onClick={() => setEdit(i)}>{m.note || m.q}</div>}
          <div className="mem-meta">
            <select value={m.cat || "Other"} onChange={(e) => { const n = [...mems]; n[i] = { ...m, cat: e.target.value }; save(n); }}>{MEM_CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <button className={m.pin ? "on" : ""} onClick={() => { const n = [...mems]; n[i] = { ...m, pin: !m.pin }; save(n); }}>{m.pin ? "📌 Pinned" : "Pin"}</button>
            <button className={m.sens ? "on" : ""} onClick={() => { const n = [...mems]; n[i] = { ...m, sens: !m.sens }; save(n); }}>{m.sens ? "🙈 Hidden" : "Hide"}</button>
            <button onClick={() => save(mems.filter((_, k) => k !== i))}>Delete</button>
            <span>{new Date(m.at).toLocaleDateString()}</span>
          </div>
        </div>))}
    </div>
  );
}

// ── MY MONTH ────────────────────────────────────────────────────────────────
export function ReflectPanel({ onClose, projects, ask, renderRich }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const since = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }, []);
  const mems = (ls.get("spine.memories", []) || []).filter((m) => m.at >= since);
  const log = (ls.get("spine.agentLog", []) || []).filter((r) => r.at >= since);
  const made = (projects || []).reduce((n, p) => n + Object.values((p && p.assets) || {}).reduce((a, v) => a + (Array.isArray(v) ? v.filter((x) => !x.at || x.at >= since).length : 0), 0), 0);
  const topics = {}; mems.forEach((m) => (m.topics || []).slice(0, 4).forEach((t) => (topics[t] = (topics[t] || 0) + 1)));
  const top = Object.keys(topics).sort((a, b) => topics[b] - topics[a]).slice(0, 8);
  const month = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>{month}</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <div className="rf-grid">
        <div><b>{mems.length}</b><span>conversations remembered</span></div>
        <div><b>{made}</b><span>things made and kept</span></div>
        <div><b>{log.length}</b><span>agent runs</span></div>
      </div>
      {top.length > 0 && <div className="xs-chips">{top.map((t) => <span key={t} className="xs-chip on">{t}</span>)}</div>}
      {!text && <button className="xs-btn" disabled={busy || !mems.length} onClick={async () => {
        setBusy(true);
        const r = await ask("You write a short, warm monthly recap for one person of what they explored with The Spine. Plain words, no flattery, 120-180 words: what they were curious about, what they built, one pattern you notice, and one gentle suggestion for next month. Never invent anything not in the notes.",
          "This month (" + month + ") they asked about:\n" + mems.slice(0, 40).map((m) => "- " + (m.note || m.q)).join("\n") + "\n\nThey made and kept " + made + " things and ran the agent " + log.length + " times.");
        setText((r && r.text) || "That couldn't be written just now."); setBusy(false);
      }}>{busy ? "Writing your month..." : mems.length ? "Write my month" : "Nothing to look back on yet"}</button>}
      {text && <div className="rf-text">{renderRich ? renderRich(text) : text}</div>}
    </div>
  );
}

// ── AGENT ACTIVITY LOG ──────────────────────────────────────────────────────
export function logAgentRun(entry) {
  const L = ls.get("spine.agentLog", []) || [];
  L.unshift({ at: Date.now(), ...entry });
  ls.set("spine.agentLog", L.slice(0, 100));
}
export function AgentLog({ onClose }) {
  const [L, setL] = useState(() => ls.get("spine.agentLog", []) || []);
  const [open, setOpen] = useState(null);
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Agent activity</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <p className="xs-p">Every time the agent works for you: what it was asked, each step it took, what it looked up and where the facts came from. Kept on this phone.</p>
      {!L.length && <div className="xs-p dim">The agent hasn't run yet.</div>}
      {L.map((r, i) => (
        <div key={r.at + "-" + i} className="al-it">
          <button className="al-h" onClick={() => setOpen(open === i ? null : i)}>
            <span className={"al-dot " + (r.ok ? "ok" : "bad")} /><b>{r.task}</b><span>{new Date(r.at).toLocaleString()}</span>
          </button>
          {open === i && <div className="al-b">
            {(r.steps || []).map((s, k) => <div key={k} className="al-s">{k + 1}. {s.do}{s.search ? <i> - looked up "{s.search}" {s.found ? "✓" : "(nothing found)"}</i> : null}</div>)}
            {(r.sources || []).length > 0 && <div className="al-src">{r.sources.map((s, k) => <a key={k} href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>)}</div>}
            {r.spent ? <div className="al-s">Credits used: {r.spent}</div> : null}
          </div>}
        </div>))}
      {L.length > 0 && <button className="xs-btn ghost" onClick={() => { ls.set("spine.agentLog", []); setL([]); }}>Clear the log</button>}
    </div>
  );
}

// ── RUN A MARKET TOOL FROM THE CORE ─────────────────────────────────────────
export function ToolPicker({ tools, onPick, onClose }) {
  const [q, setQ] = useState("");
  const list = (tools || []).filter((t) => t && t.type !== "game" && t.type !== "assistant" && (!q || (t.name + " " + (t.desc || "")).toLowerCase().includes(q.toLowerCase()))).slice(0, 40);
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Use a tool</b><button onClick={onClose} aria-label="Close">{"✕"}</button></div>
      <input className="xs-in" placeholder="Search your tools and the Market" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {list.map((t) => (
        <button key={t.id} className="tp-it" onClick={() => onPick(t)}>
          <b>{t.name}</b><span>{t.desc}</span><i>{t.mine ? "Yours" : (t.price ? t.price + " cr" : "Free") + (t.by ? " · @" + t.by : "")}</i>
        </button>))}
      {!list.length && <div className="xs-p dim">No tools match.</div>}
    </div>
  );
}

// ── SLIDES AND DOCUMENTS ────────────────────────────────────────────────────
export const SLIDES_SYS = "You make presentation slides. Return ONLY JSON: {\"title\":string,\"subtitle\":string,\"slides\":[{\"title\":string,\"bullets\":[string],\"note\":string,\"big\":string|null}]}. 6 to 12 slides. Each slide: a short title, at most 5 bullets of at most 12 words, an optional 'big' line (a striking number or quote) and a speaker note of 1-3 sentences. Accurate facts only. No markdown inside strings.";
export const DOC_SYS = "You write a finished, well-structured document in markdown: a title as '# ', short sections with '## ' headings, tight paragraphs, lists where they help, and tables where they help. No preamble, no closing remarks - just the document. Accurate facts only; mark anything uncertain.";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function mdToHtml(md) {
  const lines = String(md || "").split("\n"); const out = []; let list = null, tbl = null;
  const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const flush = () => { if (list) { out.push("</" + list + ">"); list = null; } if (tbl) { out.push("</table>"); tbl = null; } };
  for (const ln of lines) {
    let m;
    if (/^\s*\|.*\|\s*$/.test(ln)) { if (/^\s*\|?\s*:?-{2,}/.test(ln)) continue; const cells = ln.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|"); if (!tbl) { flush(); tbl = 1; out.push("<table>"); out.push("<tr>" + cells.map((c) => "<th>" + inl(c.trim()) + "</th>").join("") + "</tr>"); } else out.push("<tr>" + cells.map((c) => "<td>" + inl(c.trim()) + "</td>").join("") + "</tr>"); continue; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { flush(); out.push("<h" + m[1].length + ">" + inl(m[2]) + "</h" + m[1].length + ">"); continue; }
    if ((m = ln.match(/^\s*[-*]\s+(.*)$/))) { if (list !== "ul") { flush(); list = "ul"; out.push("<ul>"); } out.push("<li>" + inl(m[1]) + "</li>"); continue; }
    if ((m = ln.match(/^\s*\d+\.\s+(.*)$/))) { if (list !== "ol") { flush(); list = "ol"; out.push("<ol>"); } out.push("<li>" + inl(m[1]) + "</li>"); continue; }
    if (/^```/.test(ln)) continue;
    flush(); if (ln.trim()) out.push("<p>" + inl(ln) + "</p>");
  }
  flush(); return out.join("\n");
}
const PRINT_CSS = "body{font:15px/1.55 Georgia,serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px}h1{font-size:30px;margin:0 0 6px}h2{font-size:20px;margin:28px 0 8px}h3{font-size:16px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}code{background:#f2f2f2;padding:1px 4px;border-radius:3px}.foot{margin-top:40px;font-size:11px;color:#777}";
const SLIDE_PRINT_CSS = "@page{size:landscape;margin:0}body{margin:0;font-family:-apple-system,Helvetica,Arial,sans-serif}.s{width:100vw;height:100vh;box-sizing:border-box;padding:7vh 8vw;page-break-after:always;background:#0B1019;color:#EAF1FB;display:flex;flex-direction:column;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.s h1{font-size:6vh;margin:0 0 3vh;color:#E8C060}.s h2{font-size:3vh;color:#A9B8CC;margin:0}.s ul{font-size:3.2vh;line-height:1.5}.s .big{font-size:7vh;color:#E8C060;margin:2vh 0}";
export function printHtml(title, bodyHtml, css) {
  const f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument; d.open();
  d.write("<!doctype html><html><head><meta charset='utf-8'><title>" + esc(title) + "</title><style>" + (css || PRINT_CSS) + "</style></head><body>" + bodyHtml + "</body></html>");
  d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); }, 350);
}
export function parseDeck(text) {
  try { const s = String(text || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}"); const j = JSON.parse(s.slice(a, b + 1));
    if (!j || !Array.isArray(j.slides) || !j.slides.length) return null;
    return { title: String(j.title || "Slides"), subtitle: String(j.subtitle || ""), slides: j.slides.slice(0, 20).map((x) => ({ title: String(x.title || ""), bullets: (Array.isArray(x.bullets) ? x.bullets : []).slice(0, 6).map(String), note: String(x.note || ""), big: x.big ? String(x.big) : "" })) };
  } catch (e) { return null; }
}
export function SlideDeck({ deck: deck0, onClose, onChange, ask }) {
  // EDITABLE NOW: every word, the order, the look, and AI rewrites slide by slide.
  const [deck, setDeckLocal] = useState(deck0); const [editing, setEditing] = useState(false);
  useEffect(() => { setDeckLocal(deck0); }, [deck0]);
  const S = deckStyle(deck);
  const all = [{ cover: true, title: deck.title, subtitle: deck.subtitle }, ...deck.slides];
  const [i, setI] = useState(0); const [notes, setNotes] = useState(false); const x0 = useRef(null);
  const s = all[i];
  useEffect(() => { const k = (e) => { if (e.key === "ArrowRight" || e.key === " ") setI((v) => Math.min(all.length - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [all.length, onClose]);
  const themeCss = ".s{background:" + S.th.bg + ";color:" + S.th.fg + ";font-family:" + S.f + ";text-align:" + S.align + "}.s h1,.s .big{color:" + S.ac + "}.s h2{color:" + S.th.sub + "}.s ul{text-align:left;display:inline-block;font-size:" + (3.2 * S.sz).toFixed(2) + "vh}";
  const pdf = () => printHtml(deck.title, all.map((x) => "<div class='s'>" + (x.cover ? "<h1>" + esc(x.title) + "</h1><h2>" + esc(x.subtitle) + "</h2>" : "<h1>" + esc(x.title) + "</h1>" + (x.big ? "<div class='big'>" + esc(x.big) + "</div>" : "") + "<ul>" + x.bullets.map((b) => "<li>" + esc(b) + "</li>").join("") + "</ul>") + "</div>").join(""), SLIDE_PRINT_CSS + themeCss);
  return (
    <div className="deck" onTouchStart={(e) => { x0.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (x0.current == null) return; const dx = e.changedTouches[0].clientX - x0.current; if (dx < -40) setI(Math.min(all.length - 1, i + 1)); if (dx > 40) setI(Math.max(0, i - 1)); x0.current = null; }}>
      <div className="deck-bar"><button onClick={onClose}>{"✕"} Close</button><span>{i + 1} / {all.length}</span><button onClick={() => setNotes(!notes)}>{notes ? "Hide notes" : "Notes"}</button><button onClick={pdf}>Save PDF</button><button onClick={() => setEditing(true)}>{"\u270E"} Edit</button></div>
      <div className={"deck-slide" + (s.cover ? " cover" : "")} onClick={() => setI(Math.min(all.length - 1, i + 1))} style={{ background: S.th.bg, fontFamily: S.f, textAlign: S.align }}>
        <h1 style={{ color: S.ac, fontFamily: S.f }}>{s.title}</h1>
        {s.cover ? <h2 style={{ color: S.th.sub }}>{s.subtitle}</h2> : <>{s.big && <div className="deck-big" style={{ color: S.ac }}>{s.big}</div>}<ul style={{ textAlign: "left" }}>{(s.bullets || []).map((b, k) => <li key={k} style={{ color: S.th.fg, fontSize: "calc(clamp(15px,4.2vw,22px) * " + S.sz + ")" }}>{b}</li>)}</ul></>}
      </div>
      {editing && <DeckEditor deck={deck} ask={ask} onClose={() => setEditing(false)} onSave={(d) => { setDeckLocal(d); setEditing(false); setI((v) => Math.min(v, d.slides.length)); onChange && onChange(d); }} />}
      {notes && !s.cover && s.note && <div className="deck-note">{s.note}</div>}
      <div className="deck-dots">{all.map((_, k) => <i key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}</div>
    </div>
  );
}

// ── A LONG ANSWER, OPENED AS A PAGE ─────────────────────────────────────────
export function PageView({ page: page0, onClose, renderRich, onAsk, onSlides, onChange, ask }) {
  const [q, setQ] = useState("");
  // EDITABLE NOW: a full word processor (formatting, find & replace, AI rewrite, translate, Word export).
  const [page, setPage] = useState(page0); const [editing, setEditing] = useState(false);
  useEffect(() => { setPage(page0); }, [page0]);
  const pdf = () => printHtml(page.title || "The Spine", "<h1>" + esc(page.title || "") + "</h1>" + (page.html ? cleanHtml(page.html) : mdToHtml(page.text)) + (page.sources && page.sources.length ? "<h3>Sources</h3><ol>" + page.sources.map((s) => "<li>" + esc(s.title || "") + " - " + esc(s.url || "") + "</li>").join("") + "</ol>" : "") + "<div class='foot'>Made with The Spine (AI)</div>");
  return (
    <div className="pv">
      <div className="pv-bar"><button onClick={onClose}>{"←"} Back</button><span>{page.kind === "doc" ? "Document" : "Page"}</span><button onClick={pdf}>Save PDF</button><button data-pv="book" onClick={() => printBook(page.title || "The Spine", (page.html ? cleanHtml(page.html) : mdToHtml(page.text)) + (page.sources && page.sources.length ? "<h2>Sources</h2><ol>" + page.sources.map((s) => "<li>" + esc(s.title || "") + " - " + esc(s.url || "") + "</li>").join("") + "</ol>" : ""))}>Print-ready</button>{onSlides && <button onClick={() => onSlides(page)}>Slides</button>}<button onClick={() => setEditing(true)}>{"\u270E"} Edit</button></div>
      <div className="pv-body">
        {page.title && <h1 className="pv-title">{page.title}</h1>}
        {page.html ? <div className="pv-html" dangerouslySetInnerHTML={{ __html: cleanHtml(page.html) }} /> : renderRich(page.text)}
        {page.sources && page.sources.length > 0 && <div className="pv-src"><b>Sources</b>{page.sources.map((s, k) => <a key={k} href={s.url} target="_blank" rel="noreferrer">{k + 1}. {s.title || s.url}</a>)}</div>}
      </div>
      {editing && <PageEditor title={page.title} html={page.html || mdToHtml(page.text)} ask={ask} onClose={() => setEditing(false)} onSave={(r) => { const n = { ...page, title: r.title, html: r.html, text: r.text }; setPage(n); setEditing(false); onChange && onChange(n); }} />}
      {onAsk && <div className="pv-ask"><input placeholder="Ask about this page..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { onAsk(page, q.trim()); setQ(""); } }} /><button disabled={!q.trim()} onClick={() => { onAsk(page, q.trim()); setQ(""); }}>Ask</button></div>}
    </div>
  );
}
export { mdToHtml };

export const EXTRAS_CSS = `
/* Fit the phone: the answer's button row wraps instead of pushing the whole Core wider than the
   screen (it used to, after the first answer - Deep and the right edge went off-screen). */
.msg-ai-foot{flex-wrap:wrap;}
.msg-ai-foot>*{min-width:0;}
.msg-ai-foot>div,.msg-ai-foot>span{flex-wrap:wrap;}
.msg-ai,.msg-user{min-width:0;overflow-wrap:anywhere;}
.thread,.panel{min-width:0;max-width:100%;}
.starters-row{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;margin-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.starters-row::-webkit-scrollbar{display:none;}
.starters-row .starter{flex:0 0 auto;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;padding:9px 12px;font-size:13px;}
.eff-dial{display:flex;gap:6px;margin:0 0 8px;}
.eff-chip{flex:1;padding:7px 6px;border-radius:999px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;min-height:34px;}
.eff-chip.on{border-color:var(--gold);color:var(--gold);background:var(--gold-s);}
.lock-screen{position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;padding-top:env(safe-area-inset-top);}
.lock-ic{font-size:38px;}.lock-t{font-size:18px;font-weight:700;color:var(--ink);}
.lock-dots{display:flex;gap:12px;}.lock-dots i{width:14px;height:14px;border-radius:50%;border:2px solid var(--ink3);}.lock-dots i.on{background:var(--gold);border-color:var(--gold);}
.lock-err{color:var(--err);font-size:13px;}
.lock-pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px;margin-top:8px;}
.lock-pad button{width:72px;height:72px;border-radius:50%;border:1px solid var(--stone);background:var(--panel);color:var(--ink);font:600 24px 'Manrope',sans-serif;cursor:pointer;}
.lock-alt{background:none;border:none;color:var(--gold);font:inherit;font-weight:600;padding:10px;cursor:pointer;}
.xs-back{position:fixed;inset:0;z-index:9000;background:rgba(5,8,14,.72);display:flex;align-items:flex-end;justify-content:center;}
.xs-sheet{width:100%;max-width:560px;max-height:86vh;overflow:auto;background:var(--panel);border:1px solid var(--stone);border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch;}
.xs-sheet.tall{min-height:60vh;}
.xs-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}.xs-head b{font-size:17px;color:var(--ink);}
.xs-head button{background:none;border:none;color:var(--ink2);font-size:18px;width:40px;height:40px;cursor:pointer;}
.xs-p{font-size:13.5px;color:var(--ink2);line-height:1.5;margin:4px 0 12px;}.xs-p.dim{color:var(--ink3);}
.xs-in{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:15px;margin-bottom:10px;}
.xs-in.sm{width:auto;margin:0;}
.xs-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px;}.xs-row .xs-in{margin:0;}
.xs-btn{display:block;width:100%;padding:12px;border-radius:12px;border:none;background:var(--gold);color:#1a1405;font:inherit;font-weight:700;cursor:pointer;margin:6px 0;min-height:46px;}
.xs-btn.sm{width:auto;padding:10px 14px;margin:0;}.xs-btn.ghost{background:none;border:1px solid var(--stone-m);color:var(--ink);}
.xs-btn:disabled{opacity:.45;}
.xs-ok{margin-top:8px;color:var(--live);font-size:13.5px;}
.xs-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px;}
.xs-chip{padding:6px 11px;border-radius:999px;border:1px solid var(--stone);background:none;color:var(--ink2);font:inherit;font-size:12.5px;cursor:pointer;}.xs-chip.on{border-color:var(--gold-l);color:var(--gold);}
.mem-it{border:1px solid var(--stone);border-radius:12px;padding:10px 11px;margin-bottom:8px;}.mem-it.sens{opacity:.6;border-style:dashed;}
.mem-t{font-size:14px;color:var(--ink);line-height:1.45;cursor:text;}
.mem-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:12px;color:var(--ink3);}
.mem-meta select,.mem-meta button{background:var(--stone-l);border:1px solid var(--stone);color:var(--ink2);border-radius:8px;padding:5px 8px;font:inherit;font-size:12px;cursor:pointer;}
.mem-meta button.on{color:var(--gold);border-color:var(--gold-l);}.mem-meta span{margin-left:auto;}
.rf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 12px;}
.rf-grid div{background:var(--stone-l);border:1px solid var(--stone);border-radius:12px;padding:10px;text-align:center;}
.rf-grid b{display:block;font-size:24px;color:var(--gold);}.rf-grid span{font-size:11.5px;color:var(--ink2);}
.rf-text{margin-top:10px;}
.al-it{border-bottom:1px solid var(--stone);}
.al-h{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--ink);font:inherit;text-align:left;padding:11px 0;cursor:pointer;}
.al-h b{flex:1;font-size:14px;font-weight:600;}.al-h span:last-child{font-size:11px;color:var(--ink3);}
.al-dot{width:9px;height:9px;border-radius:50%;flex:none;}.al-dot.ok{background:var(--live);}.al-dot.bad{background:var(--err);}
.al-b{padding:0 0 12px 17px;font-size:13px;color:var(--ink2);}.al-s{margin:4px 0;}.al-s i{color:var(--ink3);}
.al-src{display:flex;flex-direction:column;gap:4px;margin-top:6px;}.al-src a{color:var(--gold);font-size:12.5px;word-break:break-all;}
.tp-it{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;background:var(--stone-l);border:1px solid var(--stone);border-radius:12px;padding:11px;margin-bottom:8px;color:var(--ink);font:inherit;cursor:pointer;}
.tp-it span{font-size:12.5px;color:var(--ink2);}.tp-it i{font-size:11.5px;color:var(--gold);font-style:normal;}
.deck{position:fixed;inset:0;z-index:9500;background:#05080E;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);}
.deck-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;color:var(--ink2);font-size:13px;}.deck-bar span{flex:1;text-align:center;}
.deck-bar,.pv-bar{flex-wrap:wrap;row-gap:6px;}
.deck-bar button{background:var(--panel);border:1px solid var(--stone);color:var(--ink);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;}
.deck-slide{flex:1;margin:8px 14px;border-radius:16px;background:linear-gradient(160deg,#111826,#0B1019);border:1px solid var(--stone);padding:28px 24px;display:flex;flex-direction:column;justify-content:center;overflow:auto;}
.deck-slide h1{font-size:clamp(22px,6vw,40px);color:var(--gold);line-height:1.15;margin-bottom:16px;font-family:'Instrument Serif',Georgia,serif;font-weight:400;}
.deck-slide.cover h1{font-size:clamp(30px,9vw,56px);}.deck-slide h2{color:var(--ink2);font-size:18px;font-weight:500;}
.deck-slide ul{padding-left:20px;}.deck-slide li{font-size:clamp(15px,4.2vw,22px);line-height:1.5;margin:7px 0;color:var(--ink);}
.deck-big{font-size:clamp(26px,8vw,48px);color:var(--gold);margin:6px 0 14px;font-weight:700;}
.deck-note{margin:0 14px;padding:10px 12px;border-radius:12px;background:var(--panel);color:var(--ink2);font-size:13.5px;}
.deck-dots{display:flex;justify-content:center;gap:6px;padding:12px;}.deck-dots i{width:7px;height:7px;border-radius:50%;background:var(--stone-m);cursor:pointer;}.deck-dots i.on{background:var(--gold);}
.pv{position:fixed;inset:0;z-index:9400;background:var(--bg);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);}
.pv-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--stone);}.pv-bar span{flex:1;text-align:center;color:var(--ink3);font-size:12px;text-transform:uppercase;letter-spacing:.1em;}
.pv-bar button{background:none;border:1px solid var(--stone);color:var(--ink);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;}
.pv-body{flex:1;overflow:auto;padding:18px 18px 30px;max-width:760px;width:100%;margin:0 auto;-webkit-overflow-scrolling:touch;}
.pv-title{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:clamp(28px,7vw,42px);color:var(--ink);margin-bottom:12px;line-height:1.15;}
.pv-html{font-size:16px;line-height:1.6;color:var(--ink);}.pv-html h2{font-size:22px;margin:20px 0 8px}.pv-html h3{font-size:18px;margin:16px 0 6px}.pv-html table{border-collapse:collapse;width:100%}.pv-html td,.pv-html th{border:1px solid var(--stone);padding:6px 8px}.pv-html blockquote{border-left:3px solid var(--gold);margin:10px 0;padding:2px 12px;color:var(--ink2)}.pv-html a{color:var(--gold)}
.pv-src{margin-top:20px;display:flex;flex-direction:column;gap:5px;font-size:13px;}.pv-src a{color:var(--gold);word-break:break-all;}
.pv-ask{display:flex;gap:8px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--stone);background:var(--panel);}
.pv-ask input{flex:1;padding:11px 12px;border-radius:12px;border:1px solid var(--stone);background:var(--stone-l);color:var(--ink);font:inherit;font-size:15px;}
.pv-ask button{padding:0 16px;border-radius:12px;border:none;background:var(--gold);color:#1a1405;font:inherit;font-weight:700;}
`;

// ── CAST & WORLD BIBLE ──────────────────────────────────────────────────────
// Your recurring characters, your world's rules and your look, written once. When it is on, every
// creative leg (image, video, movie, music, voice, game, world, site, tool, text) is handed it, so
// the same hero looks, sounds and behaves the same everywhere.
export function loadBible() { return ls.get("spine.castBible", { on: false, cast: [], world: "", style: "" }) || { on: false, cast: [], world: "", style: "" }; }
export const BIBLE_LEGS = ["image", "video", "movie", "music", "dub", "game", "world", "web", "tool", "text"];
export function bibleBrief(leg) {
  const b = loadBible();
  if (!b.on || BIBLE_LEGS.indexOf(leg) < 0) return "";
  const cast = (b.cast || []).filter((c) => c && c.name).slice(0, 12);
  if (!cast.length && !b.world && !b.style) return "";
  return "\n\nTHE PERSON'S CAST & WORLD BIBLE - keep everything consistent with it whenever it applies (use these characters by name, with exactly these looks and voices; respect the world's rules; match the style). Do not force characters in where they don't belong.\n"
    + (cast.length ? "CAST:\n" + cast.map((c) => "- " + String(c.name).slice(0, 40) + (c.look ? " | looks: " + String(c.look).slice(0, 240) : "") + (c.voice ? " | voice: " + String(c.voice).slice(0, 160) : "") + (c.traits ? " | personality: " + String(c.traits).slice(0, 160) : "")).join("\n") + "\n" : "")
    + (b.world ? "WORLD: " + String(b.world).slice(0, 1200) + "\n" : "")
    + (b.style ? "STYLE: " + String(b.style).slice(0, 400) + "\n" : "");
}
export function BibleEditor({ onClose }) {
  const [b, setB] = useState(loadBible());
  const save = (n) => { setB(n); ls.set("spine.castBible", n); };
  const setC = (i, k, v) => { const cast = [...(b.cast || [])]; cast[i] = { ...cast[i], [k]: v }; save({ ...b, cast }); };
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Cast & World Bible</b><button onClick={onClose} aria-label="Close">{"\u2715"}</button></div>
      <p className="xs-p">Write your characters, world and look once. When it's on, every image, film, song, game, world and site uses them - so your hero is the same hero everywhere.</p>
      <label className="xs-row"><span>Use it in everything I make</span><input type="checkbox" checked={!!b.on} onChange={(e) => save({ ...b, on: e.target.checked })} style={{ width: 22, height: 22, accentColor: "#E8C060" }} /></label>
      {(b.cast || []).map((c, i) => (
        <div key={i} className="mem-it">
          <input className="xs-in" placeholder="Name" value={c.name || ""} onChange={(e) => setC(i, "name", e.target.value.slice(0, 40))} />
          <textarea className="xs-in" rows={2} placeholder="How they look (age, face, hair, clothes, colours)" value={c.look || ""} onChange={(e) => setC(i, "look", e.target.value.slice(0, 240))} />
          <input className="xs-in" placeholder="How they sound (voice, accent, pace)" value={c.voice || ""} onChange={(e) => setC(i, "voice", e.target.value.slice(0, 160))} />
          <input className="xs-in" placeholder="Personality" value={c.traits || ""} onChange={(e) => setC(i, "traits", e.target.value.slice(0, 160))} />
          <div className="mem-meta"><button onClick={() => save({ ...b, cast: b.cast.filter((_, k) => k !== i) })}>Remove</button></div>
        </div>))}
      {(b.cast || []).length < 12 && <button className="xs-btn ghost" onClick={() => save({ ...b, cast: [...(b.cast || []), { name: "", look: "", voice: "", traits: "" }] })}>+ Add a character</button>}
      <textarea className="xs-in" rows={3} placeholder="The world: where it is, when, its rules, what is normal there" value={b.world || ""} onChange={(e) => save({ ...b, world: e.target.value.slice(0, 1200) })} />
      <input className="xs-in" placeholder="The look: e.g. warm 35mm film, muted teal and amber, hand-painted" value={b.style || ""} onChange={(e) => save({ ...b, style: e.target.value.slice(0, 400) })} />
    </div>
  );
}

// ── IS THIS AI? ─────────────────────────────────────────────────────────────
// Reads the labels a picture or video carries inside its own file: a C2PA content credential
// (OpenAI, Adobe, Google, Microsoft and most cameras' newest ones), the IPTC "made by AI" tag
// (The Spine writes it, as do Google, Meta and others), and generator fingerprints some tools
// leave (Stable Diffusion settings, a "made with" software name). It never guesses from the
// pixels: no label found does NOT prove a picture is real, and it says so.
export function readAiMarks(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const n = Math.min(b.length, 8 * 1024 * 1024);
  let txt = ""; for (let i = 0; i < n; i += 65536) txt += String.fromCharCode.apply(null, b.subarray(i, Math.min(n, i + 65536)));
  const found = [];
  const kind = b[0] === 0x89 && b[1] === 0x50 ? "PNG picture" : b[0] === 0xFF && b[1] === 0xD8 ? "JPEG picture" : /^....ftyp(heic|heix|mif1)/.test(txt.slice(0, 16)) ? "HEIC picture" : /^RIFF....WEBP/.test(txt.slice(0, 16)) ? "WebP picture" : /^....ftyp/.test(txt.slice(0, 12)) ? "video" : "file";
  const c2pa = /caBX/.test(txt.slice(0, 200000)) || /jumb[\s\S]{0,64}c2pa/.test(txt) || /c2pa\.(actions|hash|claim|signature)/.test(txt);
  if (c2pa) found.push({ k: "Content credential (C2PA)", d: "The file carries a signed record of how it was made. Open it at contentcredentials.org/verify to read who made it and with what." });
  const iptc = (txt.match(/(compositeWithTrainedAlgorithmicMedia|trainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)/) || [])[1];
  if (iptc) found.push({ k: iptc === "trainedAlgorithmicMedia" ? "Labelled as made by AI" : iptc === "compositeWithTrainedAlgorithmicMedia" ? "Labelled as partly made with AI" : "Labelled as computer-generated", d: "IPTC digital source type: " + iptc + "." });
  const gens = ["DALL-E", "DALL·E", "Midjourney", "Firefly", "Imagen", "Gemini", "Stable Diffusion", "ComfyUI", "Leonardo", "Ideogram", "Runway", "Sora", "Kling", "FLUX", "The Spine"];
  const tool = gens.find((g) => txt.indexOf(g) >= 0 && new RegExp("(CreatorTool|Software|softwareAgent|generator|claim_generator|parameters|made with|Created by)[^\\n]{0,200}" + g.replace(/[.·]/g, "."), "i").test(txt));
  if (tool) found.push({ k: "Made with " + tool, d: "The file names the tool that created it." });
  if (/(parameters|prompt)[\s\S]{0,40}(Steps:|Sampler:|CFG scale|"seed")/.test(txt)) found.push({ k: "Image-generator settings inside", d: "The file still holds the prompt and settings an AI image tool used." });
  return { kind, ai: found.length > 0, found };
}
export function AiChecker({ onClose }) {
  const [res, setRes] = useState(null); const [prev, setPrev] = useState(""); const inp = useRef(null);
  const pick = async (f) => {
    if (!f) return; setRes(null);
    try { setPrev(/^image\//.test(f.type) ? URL.createObjectURL(f) : ""); const buf = new Uint8Array(await f.arrayBuffer()); setRes({ name: f.name, ...readAiMarks(buf) }); }
    catch (e) { setRes({ name: f.name, error: true }); }
  };
  return (
    <div className="xs-sheet tall">
      <div className="xs-head"><b>Is this AI?</b><button onClick={onClose} aria-label="Close">{"\u2715"}</button></div>
      <p className="xs-p">Pick a picture or video. The Spine reads the labels inside the file itself - nothing is uploaded.</p>
      <input ref={inp} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => pick(e.target.files && e.target.files[0])} />
      <button className="xs-btn" onClick={() => inp.current && inp.current.click()}>Choose a picture or video</button>
      {prev && <img src={prev} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 12, margin: "10px 0" }} />}
      {res && !res.error && <div className={"aic " + (res.ai ? "yes" : "no")}>
        <b>{res.ai ? "This " + res.kind + " says it was made or changed with AI." : "No AI label found in this " + res.kind + "."}</b>
        {res.found.map((x, i) => <div key={i} className="aic-f"><span>{x.k}</span><i>{x.d}</i></div>)}
        {!res.ai && <i className="aic-n">That does not prove it is real: labels are easy to strip, and screenshots or re-saved copies lose them. Treat it with ordinary care.</i>}
      </div>}
      {res && res.error && <div className="xs-p">That file couldn't be read.</div>}
    </div>
  );
}
export const AIC_CSS = `.aic{margin-top:10px;padding:12px;border-radius:12px;border:1px solid var(--stone);}.aic.yes{border-color:var(--gold-l);background:var(--gold-s);}
.aic b{display:block;font-size:15px;color:var(--ink);margin-bottom:6px;}.aic-f{margin:6px 0;}.aic-f span{display:block;font-weight:700;color:var(--gold);font-size:13.5px;}
.aic-f i,.aic-n{font-style:normal;font-size:12.5px;color:var(--ink2);line-height:1.45;display:block;}`;

// ── A FACE FOR YOUR HELPER ──────────────────────────────────────────────────
// Drawn on the phone, free: a face in the helper's own colours that looks at you, blinks and
// moves its mouth as the phone's voice reads the answer aloud.
export function TalkingFace({ name, text, onClose }) {
  const [open, setOpen] = useState(0); const [blink, setBlink] = useState(false); const [talking, setTalking] = useState(false);
  const hue = useMemo(() => { let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }, [name]);
  useEffect(() => {
    let alive = true, t = null; const bl = setInterval(() => { setBlink(true); setTimeout(() => alive && setBlink(false), 140); }, 3200);
    try {
      const u = new SpeechSynthesisUtterance(String(text || "").replace(/```[\s\S]*?```/g, " ").replace(/[#*`>_|]/g, "").slice(0, 3000));
      u.rate = 1; u.onstart = () => { setTalking(true); t = setInterval(() => alive && setOpen(0.25 + Math.random() * 0.75), 110); };
      u.onboundary = () => alive && setOpen(1);
      u.onend = u.onerror = () => { clearInterval(t); if (alive) { setTalking(false); setOpen(0); } };
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) {}
    return () => { alive = false; clearInterval(bl); clearInterval(t); try { window.speechSynthesis.cancel(); } catch (e) {} };
  }, [text]);
  const skin = `hsl(${hue},45%,72%)`, dark = `hsl(${hue},40%,28%)`, hair = `hsl(${(hue + 200) % 360},35%,30%)`;
  return (
    <div className="tf-back" onClick={onClose}>
      <svg viewBox="0 0 200 220" className="tf-face" role="img" aria-label={(name || "Helper") + " speaking"}>
        <ellipse cx="100" cy="112" rx="72" ry="86" fill={skin} />
        <path d="M30 100 Q34 24 100 22 Q166 24 170 100 Q150 52 100 50 Q50 52 30 100Z" fill={hair} />
        <g transform={`translate(0 ${blink ? 2 : 0})`}>
          <ellipse cx="72" cy="104" rx="10" ry={blink ? 1.2 : 11} fill="#fff" /><circle cx="73" cy="106" r={blink ? 0 : 5.5} fill={dark} />
          <ellipse cx="128" cy="104" rx="10" ry={blink ? 1.2 : 11} fill="#fff" /><circle cx="129" cy="106" r={blink ? 0 : 5.5} fill={dark} />
        </g>
        <path d="M60 86 Q72 80 84 85 M116 85 Q128 80 140 86" stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M100 118 Q96 134 102 136" stroke={dark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <ellipse cx="100" cy="160" rx={18 + open * 4} ry={2 + open * 13} fill={dark} />
        {open > 0.4 && <ellipse cx="100" cy={160 + open * 6} rx={9} ry={open * 4} fill="#d77" />}
      </svg>
      <div className="tf-name">{name || "Your helper"}{talking ? " is talking..." : ""}</div>
      <div className="tf-hint">Tap anywhere to close</div>
    </div>
  );
}
export const TF_CSS = `.tf-back{position:fixed;inset:0;z-index:9600;background:radial-gradient(circle at 50% 40%,#1a2436,#05080E);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.tf-face{width:min(70vw,320px);height:auto;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5));}
.tf-name{color:var(--ink);font-size:17px;font-weight:700;}.tf-hint{color:var(--ink3);font-size:12px;}`;
export const SHOT_CSS = `.shot-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;}
.shot-card{flex:0 0 78%;max-width:300px;scroll-snap-align:start;border:1px solid var(--stone);border-radius:12px;padding:10px;background:var(--stone-l);display:flex;flex-direction:column;gap:6px;}
.shot-card b{font:700 11px 'JetBrains Mono',monospace;color:var(--gold);letter-spacing:.06em;}.shot-card span{font-size:13.5px;color:var(--ink);line-height:1.45;}
.shot-acts{display:flex;gap:6px;margin-top:auto;}.shot-acts button{flex:1;padding:8px;border-radius:9px;border:1px solid var(--stone-m);background:none;color:var(--ink2);font:inherit;font-size:12.5px;cursor:pointer;}`;
