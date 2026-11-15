// ============================================================================
//  PROTOTYPES FROM THE CORE (batch 16) - ask for an app or a website in a
//  normal conversation and it is BUILT, live, right in the answer: tap it,
//  type in it, move between its screens. Ask for a change and the next version
//  appears in place; earlier versions stay one tap away. It can go full
//  screen, show its code, be saved as a tool, sent as a link, or carried into
//  the Web or Tool tab to keep working on it.
//
//  Digital invitations are a special prototype: an envelope that glows, opens
//  and unfolds into an invitation you scroll and tap - sent as a link.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { SHELLS, FONTS, PARTICLES, decorFor, fontHref, withDecor, applyEdits } from "./invite16.js";
import { printIntent } from "./printables16.jsx";
import { EditBar } from "./edit17.jsx";

// ── what was asked ────────────────────────────────────────────────────────────
const MAKE = /^(please\s+)?(build|make|create|design|prototype|mock\s*up|code|generate|whip up|put together|spin up|draft|set up|give me|i (want|need|would like)( you to (build|make|create|design))?( a| an)?|can you (build|make|create|design)|could you (build|make|create|design)|let'?s (build|make|create|design))\b/i;
const APPISH = /\b(app|apps|application|web\s*app|website|web\s*site|site|web\s*page|webpage|landing\s*page|home\s*page|homepage|portfolio|dashboard|admin\s*panel|portal|online\s*store|store\s*front|storefront|shop page|booking (page|system)|tool|calculator|tracker|planner|to-?do( list)?|checklist app|crm|form|survey|signup page|sign-?up page|login (page|screen)|ui|interface|screens?|prototype|mock-?up|wireframe|menu (page|app)|kiosk|configurator|quiz app|flashcards? app|timer app|habit tracker|budget (app|tracker)|recipe app|chat app|game)\b/i;
const INVITE = /\b(invitations?|invites?|e-?vites?|save[\s-]the[\s-]date|rsvp|wedding card|party card|evite)\b/i;
const EDIT = /^(now\s+|ok(ay)?[,\s]+|great[,\s]+|nice[,\s]+|cool[,\s]+|perfect[,\s]+|also\s+|and\s+|please\s+|can you\s+|could you\s+)*(make|add|change|remove|delete|put|use|turn|move|swap|replace|fix|give|let|switch|update|rename|resize|shrink|enlarge|bigger|smaller|darker|lighter|more|less|include|drop|take out|show|hide|i want|i'd like|it should|the [a-z]+ should)\b/i;
const QUESTION = /^(how|what|why|when|where|who|which|is|are|does|do|should|explain|tell me about)\b/i;

export const COLORING_RE = /\b(colou?ring)\s*(page|pages|book|books|sheet|sheets|picture|pictures|in page)\b|\b(colou?r|paint)[\s-]*by[\s-]*(number|numbers)\b|\bmystery\s*grid\b|\bsomething (for|to) (my kids? )?(to )?colou?r\b/i;
export function protoIntent(q, thread) {
  const t = String(q || "").trim(); if (!t) return null;
  if (COLORING_RE.test(t) && !/^(what|why|how|who|where|when)\b/i.test(t)) {
    const kind = /by[\s-]*number/i.test(t) ? "number" : /mystery|grid|pixel/i.test(t) ? "grid" : /blank|free|any colou?rs?|my own/i.test(t) ? "free" : "number";
    let subject = t.replace(new RegExp(COLORING_RE.source, "gi"), " ").replace(/\b(mystery|grid|blank|free)\b/gi, " ").replace(/\s+/g, " ").trim();
    for (let k = 0; k < 4; k++) subject = subject.replace(/^(please\s+)?(make|create|draw|give me|design|print|i (want|need)|can you make)\s+(me\s+|us\s+)?/i, "").replace(/^(a|an|the|some|my)\s+/i, "").replace(/^(page|pages|sheet|sheets|picture|pictures|book|books)\b\s*/i, "").replace(/^(of|with|for|about|showing)\s+/i, "").trim();
    if (/^(i (need|want)|please|we need)$/i.test(subject)) subject = "";
    subject = subject.replace(/^something\s*(for\s+)?(my\s+)?(kids?|children)?\s*(to)?\s*$/i, "").slice(0, 140);
    return { kind: "coloring", coloring: { subject, kind } };
  }
  if (!/\b(app|website|web site|site|web page)\b/i.test(t)) { const pr = printIntent(t); if (pr) return pr; }
  const last = lastProto(thread);
  // "make A new thing" is a new build even with a prototype on screen; "make IT ..." is a change
  const fresh = /^(please\s+)?(now\s+)?(build|make|create|design|prototype|code|generate|draft|give me|i (want|need|would like))\s+(me\s+|us\s+)?(a|an|another|a new|one more|my|our)\b/i.test(t);
  if (fresh && INVITE.test(t)) return { kind: "invite" };
  if (fresh && APPISH.test(t) && !(/\b(game)\b/i.test(t) && !/\b(app|website|site|page)\b/i.test(t))) return { kind: "new" };
  // a change to the prototype on screen
  if (last && t.length < 800 && (EDIT.test(t) || /\b(it|the (app|site|page|screen|button|header|menu|card|form|invite|invitation|envelope|colou?r|font|logo))\b/i.test(t)) && !QUESTION.test(t.replace(/^(can|could) you\s+/i, ""))) {
    return { kind: "edit", base: last };
  }
  if (QUESTION.test(t) && !/^(can|could) you\b/i.test(t)) return null; // "how do I build an app" is a question, not a request
  if (INVITE.test(t) && /\b(make|create|design|build|send|need|want|give|draft|for my|for our|to my)\b/i.test(t)) return { kind: "invite" };
  if (MAKE.test(t) && APPISH.test(t) && !/\b(image|picture|photo|logo design|poster|song|music|video|voice)\b/i.test(t.replace(/\b(photo|image)\s+(app|gallery|editor|site)/ig, ""))) {
    if (/\b(game)\b/i.test(t) && !/\b(app|website|site|page)\b/i.test(t)) return null; // games go to the Game tab's engines
    return { kind: "new" };
  }
  return null;
}
export function lastProto(thread) {
  const th = Array.isArray(thread) ? thread : [];
  for (let i = th.length - 1; i >= 0 && i >= th.length - 6; i--) { const m = th[i]; if (m && m.role === "assistant" && m.proto && (m.proto.versions || []).length) return m.proto; }
  // a new chat with a project open: the project's latest build is still "on screen" for changes
  try { const b = typeof window !== "undefined" && window.__spineProjectBuild; if (b && (b.versions || []).length && th.filter((m) => m && m.proto).length === 0 && th.length <= 2) return b; } catch (e) {}
  return null;
}

// ── what the builder is told ──────────────────────────────────────────────────
const SHARED = `
OUTPUT FORMAT - exactly this, nothing before it:
TITLE: a short name for it
WHAT: one sentence, plain words, what it is and what you can do in it
\`\`\`html
<!doctype html> ... the complete page ...
\`\`\`
NEXT: three short ideas for the next change, separated by " | "

RULES FOR THE PAGE:
- ONE complete, self-contained HTML document: all CSS in <style>, all JavaScript in <script>. It runs inside a sandboxed frame on a phone first (390px wide) and must also look right on a computer.
- It must WORK, not just look right: every button does something, forms validate and submit to in-memory state, lists add/edit/delete, tabs and screens switch, search filters, totals add up, modals open and close, empty states read well. Use realistic, specific sample data (real-sounding names, prices, dates) - never "Lorem ipsum" or "Item 1".
- Design at the level of a top product studio: a deliberate type scale (Google Fonts are allowed via <link href="https://fonts.googleapis.com/...">), a restrained palette with one confident accent, generous spacing, soft depth, rounded corners, smooth 150-300ms transitions, clear hierarchy, 44px touch targets, safe-area padding, and a dark mode that follows the phone. Icons: inline SVG or https://api.iconify.design/<set>/<name>.svg (e.g. lucide, ph, tabler).
- Several screens when it is an app (bottom tab bar or side nav on wide screens) with a believable first screen. A website gets a full page: hero, sections, call to action, footer.
- No localStorage, sessionStorage, cookies or alert()/confirm()/prompt() - keep state in JavaScript variables and show your own toasts and dialogs. No Tailwind CDN. Libraries only from https://cdn.jsdelivr.net or https://unpkg.com when truly needed (e.g. Chart.js for charts).
- It can use The Spine through the global Spine object when it helps: await Spine.ask('question') for AI answers, await Spine.live(kind, params) for free live data (weather, news, prices), Spine.speak('text'), Spine.camera(), Spine.share({title,text,url}), Spine.act('calendar'|'directions'|'message'|'call', {...}) and Spine.app('name') + Spine.db('collection') for a real shared backend (people must be signed in to save). Wrap every Spine call in try/catch with a sensible fallback so the page always works.
- Close every tag and bracket. If you are running long, finish the page cleanly rather than adding more.`;

export const PROTO_SYS = `You are The Spine's prototype engineer - the best product designer and front-end engineer in one. The person described an app or a website in conversation. Build it now as a real, working, beautiful prototype they can tap through on their phone, the way a top studio would present a first version to a client.` + SHARED;

export const PROTO_EDIT_SYS = `You are The Spine's prototype engineer. The person is looking at their prototype and asked for a change. Return the COMPLETE updated page with the change made - keep everything else exactly as it was unless the change needs it, keep the design language, and make the change feel native to it.` + SHARED;

export const INVITE_SYS = `You are The Spine's invitation designer - think the most beautiful digital invitation ever made, the kind people screenshot and talk about. Build it as ONE page that is an EXPERIENCE:
1. THE ENVELOPE: the page opens on a single, gorgeous envelope centred on a rich background that suits the occasion (linen, velvet, marble, night sky, florals - drawn with CSS gradients, SVG and subtle texture). A wax seal or monogram with the host's initials. The guest's name on the front when given (window.SPINE_GUEST, set by The Spine when the guest's link carries their name - fall back to "You're invited"). A soft breathing glow and a "Tap to open" hint.
2. THE OPENING: on tap the seal glows and cracks, light spills out (radial light burst + drifting particles - gold dust, petals, confetti or stars to match the theme, on a <canvas>), the flap folds back in 3D (CSS perspective + rotateX), and the card rises out of the envelope and grows to fill the screen. Play a gentle chime made with the Web Audio API on open (no audio files). 900-1600ms total, buttery smooth, respects prefers-reduced-motion.
3. THE INVITATION: a scrolling, elegant page with sections that reveal as they scroll into view (IntersectionObserver): the headline and names in a display typeface, the date and time, a live COUNTDOWN, the place with a "Get directions" button (Spine.act('directions',{to:'address'}) with a fallback link to https://maps.apple.com/?q=...), "Add to calendar" (Spine.act('calendar',{title,start,end,location,notes}) with a fallback that downloads an .ics made in JavaScript), the schedule of the day, dress code, a small photo or illustration area (SVG/CSS art or https://image.pollinations.ai/prompt/<words>?width=800&height=600&nologo=true images), FAQs as tap-to-open rows, gifts/registry, and a heartfelt note.
4. RSVP: a beautiful form (name, attending yes/no/maybe, number of guests, a note or song request). On send: show a delightful thank-you animation, then deliver it - first try await Spine.rsvp({name, answer, guests, note}) (The Spine records it for the host); if that is unavailable, open a message to the host with the answer written for them (sms: or mailto: link built from the host contact if given). Never lose the answer.
5. Little moments: a music toggle (a soft looping melody built with Web Audio), a "Share this invitation" button (Spine.share or navigator.share with location.href), haptics via navigator.vibrate where supported, and an "Open again" to replay the envelope.
Use exactly the names, date, time, place and details the person gave. Where something is missing, write a tasteful placeholder in [square brackets] so they can see what to fill in - never invent a real address or phone number.` + SHARED;

export function readProto(text) {
  const t = String(text || "");
  const title = ((t.match(/^TITLE:\s*(.+)$/m) || [])[1] || "").trim().slice(0, 60);
  const what = ((t.match(/^WHAT:\s*(.+)$/m) || [])[1] || "").trim().slice(0, 300);
  const next = ((t.match(/^NEXT:\s*(.+)$/m) || [])[1] || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  let html = "";
  const f = t.match(/```(?:html)?\s*\n([\s\S]*?)(?:```|$)/i); if (f) html = f[1].trim();
  if (!html) { const d = t.match(/<!doctype html[\s\S]*<\/html>/i) || t.match(/<html[\s\S]*<\/html>/i); if (d) html = d[0]; }
  if (html && !/<\/html>\s*$/i.test(html)) html += "\n</body></html>"; // a cut-off page still opens
  return { title, what, next, html };
}

// ── the card in the conversation ──────────────────────────────────────────────
export function ProtoCard({ proto, buildDoc, onChange, onSave, onOpenIn, onShareLink, onAsk, onVersion, askAI }) {
  const vs = proto.versions || []; const [vi, setVi] = useState(vs.length - 1);
  useEffect(() => { setVi((proto.versions || []).length - 1); }, [(proto.versions || []).length]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = vs[Math.max(0, Math.min(vi, vs.length - 1))] || {};
  const [device, setDevice] = useState("phone"); const [full, setFull] = useState(false); const [code, setCode] = useState(false); const [note, setNote] = useState("");
  const doc = useMemo(() => { try { return buildDoc(v.html || ""); } catch (e) { return v.html || ""; } }, [v.html]); // eslint-disable-line react-hooks/exhaustive-deps
  const frameRef = useRef(null);
  const reload = () => { try { const f = frameRef.current; if (f) { f.srcdoc = ""; setTimeout(() => { f.srcdoc = doc; }, 30); } } catch (e) {} };
  const download = () => { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([v.html || ""], { type: "text/html" })); a.download = (v.title || "prototype").replace(/[^\w -]/g, "").slice(0, 40) + ".html"; a.click(); } catch (e) {} };
  const frame = (
    <iframe ref={frameRef} title={v.title || "Prototype"} className={"pt16-frame " + (full ? "full" : device)} srcDoc={doc}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
      allow="camera; microphone; geolocation; clipboard-write; web-share; fullscreen; autoplay" />
  );
  return (
    <div className={"pt16" + (proto.invite ? " inv" : "")}>
      <div className="pt16-head">
        <div><b>{v.title || (proto.invite ? "Your invitation" : "Your prototype")}</b>{v.what && <span>{v.what}</span>}</div>
        {vs.length > 1 && <div className="pt16-vers">{vs.map((x, i) => <button key={i} className={i === vi ? "on" : ""} onClick={() => setVi(i)} aria-label={"Version " + (i + 1)}>v{i + 1}</button>)}</div>}
      </div>
      {proto.busy && <div className="pt16-busy"><span className="pt16-spin" />{proto.busy}</div>}
      {!code && !full && <div className={"pt16-stage " + device}>{frame}</div>}
      {code && <pre className="pt16-code">{v.html}</pre>}
      <div className="pt16-bar">
        <div className="pt16-seg">{["phone", "tablet", "computer"].map((d) => <button key={d} className={device === d && !code ? "on" : ""} onClick={() => { setDevice(d); setCode(false); }}>{d === "phone" ? "📱" : d === "tablet" ? "▭" : "🖥"}<span>{d}</span></button>)}</div>
        <button onClick={() => setFull(true)}>{"⤢"} Full screen</button>
        <button onClick={reload}>{"↻"} Restart</button>
        <button onClick={() => setCode((c) => !c)}>{code ? "Show it" : "</> Code"}</button>
      </div>
      <div className="pt16-bar">
        {onShareLink && <button className="pri" onClick={async () => { const r = await onShareLink(v); if (r) setNote(r); }}>{proto.invite ? "✉ Send to my contacts" : "🔗 Share a link"}</button>}
        {onSave && <button onClick={() => { onSave(v); setNote("Saved to My tools."); }}>{"★"} Save</button>}
        {onOpenIn && <button onClick={() => onOpenIn("web", v)}>Keep building in Web</button>}
        {onOpenIn && !proto.invite && <button onClick={() => onOpenIn("tool", v)}>Make it a Tool</button>}
        <button onClick={download}>{"⬇"} .html</button>
      </div>
      {proto.invite && !code && <Decorate v={v} frameRef={frameRef} onVersion={onVersion} />}
      {!code && askAI && onVersion && <EditBar kind="proto" code={v.html || ""} buildDoc={buildDoc} askAI={askAI}
        setCode={(next, label, merge) => onVersion({ ...v, html: next, what: label, at: Date.now() }, merge && v.what === label)}
        canUndo={vi > 0} canRedo={vi < vs.length - 1} onUndo={() => setVi(Math.max(0, vi - 1))} onRedo={() => setVi(Math.min(vs.length - 1, vi + 1))}
        prevCode={vi > 0 ? vs[vi - 1].html : null} />}
      {note && <div className="pt16-note">{note}</div>}
      {v.next && v.next.length > 0 && onAsk && <div className="pt16-next"><span>Try next:</span>{v.next.map((n, i) => <button key={i} onClick={() => onAsk(n)}>{n}</button>)}</div>}
      <div className="pt16-hint">Ask for any change in the box below - "make it dark green", "add a login screen" - and the next version appears here.</div>
      {full && (
        <div className="pt16-full">
          <div className="pt16-fbar"><b>{v.title || "Prototype"}</b><button onClick={() => setFull(false)} aria-label="Close">{"✕"}</button></div>
          {frame}
        </div>
      )}
      {onChange ? null : null}
    </div>
  );
}

// The invitation travels as a link that opens it full screen. With names, each guest's
// envelope carries their own name.
export async function inviteLinks(baseUrl, names) {
  const list = (names || []).map((n) => String(n || "").trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return [{ name: "", url: baseUrl }];
  return list.map((n) => { try { const u = new URL(baseUrl); u.searchParams.set("to", n); return { name: n, url: u.toString() }; } catch (e) { return { name: n, url: baseUrl }; } });
}

// Pick people from the phone's contacts where the browser allows it (Chrome on Android);
// everywhere else the share sheet does the sending.
export async function pickContacts() {
  try {
    if (!("contacts" in navigator) || !navigator.contacts || !navigator.contacts.select) return null;
    const got = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
    return (got || []).map((c) => ({ name: (c.name && c.name[0]) || "", tel: (c.tel && c.tel[0]) || "", email: (c.email && c.email[0]) || "" }));
  } catch (e) { return []; }
}

export const PROTO_CSS = `.pt16{margin:10px 0 4px;border:1px solid var(--stone,#e5ded3);border-radius:18px;background:var(--panel,#fff);overflow:hidden}
.pt16.inv{border-color:#d9b96a;box-shadow:0 6px 30px rgba(201,154,58,.15)}
.pt16-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:12px 14px 6px}.pt16-head b{display:block;font-size:16px}.pt16-head span{display:block;font-size:13px;opacity:.75;margin-top:2px}
.pt16-vers{display:flex;gap:4px;flex-wrap:wrap}.pt16-vers button{border:1px solid var(--stone,#ddd);background:none;border-radius:8px;padding:3px 7px;font:inherit;font-size:12px;color:inherit}.pt16-vers button.on{background:#E8C060;color:#1a1405;border-color:#E8C060}
.pt16-stage{display:flex;justify-content:center;padding:8px 10px;background:repeating-linear-gradient(45deg,rgba(0,0,0,.02) 0 10px,transparent 10px 20px)}
.pt16-frame{border:none;background:#fff;display:block;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.pt16-frame.phone{width:min(390px,100%);height:min(760px,72vh)}.pt16-frame.tablet{width:min(820px,100%);height:min(640px,70vh);border-radius:16px}.pt16-frame.computer{width:100%;height:min(680px,70vh);border-radius:10px}
.pt16-frame.full{position:absolute;inset:44px 0 0 0;width:100%;height:calc(100% - 44px);border-radius:0;box-shadow:none}
.pt16-code{max-height:60vh;overflow:auto;margin:0 10px;padding:10px;background:#111;color:#e6e6e6;font-size:11px;border-radius:10px;white-space:pre-wrap;word-break:break-word}
.pt16-bar{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0}.pt16-bar>button,.pt16-seg button{border:1px solid var(--stone,#ddd);background:var(--stone-l,#f6f3ee);color:inherit;border-radius:10px;padding:8px 10px;font:inherit;font-size:13px}
.pt16-bar>button.pri{background:#E8C060;border-color:#E8C060;color:#1a1405;font-weight:700}
.pt16-seg{display:flex;gap:4px}.pt16-seg button span{margin-left:4px}.pt16-seg button.on{outline:2px solid #E8C060}
.pt16-note{margin:8px 14px 0;font-size:13px}.pt16-hint{font-size:12px;opacity:.65;padding:8px 14px 12px}
.pt16-next{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;align-items:center;font-size:12px}.pt16-next button{border:1px dashed #c99a3a;background:none;border-radius:20px;padding:6px 10px;font:inherit;font-size:12px;color:inherit}
.pt16-busy{display:flex;gap:8px;align-items:center;padding:6px 14px;font-size:13px}.pt16-spin{width:14px;height:14px;border-radius:50%;border:2px solid #ccc;border-top-color:#E8C060;animation:pt16s 1s linear infinite}@keyframes pt16s{to{transform:rotate(360deg)}}
.pt16-full{position:fixed;inset:0;z-index:9000;background:#000}.pt16-fbar{height:44px;padding:0 12px;padding-top:env(safe-area-inset-top);display:flex;align-items:center;justify-content:space-between;color:#fff}.pt16-fbar button{background:none;border:none;color:#fff;font-size:22px}
.inv16{margin:8px 12px 0}.inv16-open{width:100%;padding:11px;border-radius:12px;border:1px solid #d9b96a;background:linear-gradient(135deg,#fff7e3,#f3e3bf);font:inherit;font-weight:700;color:#5a4316}.inv16-lbl{font-size:12px;opacity:.7;margin:10px 0 4px}.inv16-row{display:flex;gap:6px;flex-wrap:wrap}.inv16-row button{border:1px solid var(--stone,#ddd);background:var(--stone-l,#f6f3ee);color:inherit;border-radius:10px;padding:7px 9px;font:inherit;font-size:12px}.inv16-row button.on{outline:2px solid #E8C060}.inv16-row button.pri{background:#E8C060;border-color:#E8C060;color:#1a1405;font-weight:700}.inv16-col{display:flex;flex-direction:column;align-items:center;font-size:11px;gap:2px}.inv16-col input{width:40px;height:32px;border:none;background:none;padding:0}
.pt16-send{margin:8px 12px 0;padding:10px;border-radius:12px;background:var(--stone-l,#f6f3ee);font-size:13px}.pt16-send textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--stone,#ddd);padding:8px;font:inherit;font-size:14px;margin:6px 0}`;

// The host's view of who has replied.
export function InviteReplies({ load }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(false); const [err, setErr] = useState("");
  const get = async () => { setErr(""); try { const r = await load(); if (r && r.error) { setErr(r.error === "missing" ? "Replies switch on with the next database step." : r.error); return; } setRows((r && r.data) || []); } catch (e) { setErr("Couldn't load replies."); } };
  const yes = (rows || []).filter((x) => x.answer === "yes"), coming = yes.reduce((a, x) => a + (x.guests || 0), 0);
  return (
    <div className="pt16-send">
      <button className="pt16-rbtn" onClick={() => { setOpen(!open); if (!open) get(); }}>{open ? "Hide replies" : "✉ Replies"}</button>
      {open && <>
        {err && <div>{err}</div>}
        {rows && <div style={{ margin: "6px 0" }}><b>{coming}</b> coming {"·"} {yes.length} yes {"·"} {(rows || []).filter((x) => x.answer === "maybe").length} maybe {"·"} {(rows || []).filter((x) => x.answer === "no").length} can't make it <button onClick={get} style={{ marginLeft: 6 }}>{"↻"}</button></div>}
        {rows && rows.map((x, i) => <div key={i} className="pt16-reply"><b>{x.name}</b> - {x.answer === "yes" ? "coming" + (x.guests > 1 ? " (" + x.guests + ")" : "") : x.answer === "no" ? "can't make it" : "maybe"}{x.note ? <i> "{x.note}"</i> : null}</div>)}
        {rows && !rows.length && <div>No replies yet.</div>}
      </>}
    </div>
  );
}

// ── decorate an invitation, inside it: looks, colours, type, sparkle, and the words ──────────
function Decorate({ v, frameRef, onVersion }) {
  const [open, setOpen] = useState(false); const [d, setD] = useState(v.decor || null); const [editing, setEditing] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { setD(v.decor || null); setEditing(false); }, [v.html]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = (o) => { try { frameRef.current && frameRef.current.contentWindow.postMessage({ __spineDecor: true, ...o }, "*"); } catch (e) {} };
  const change = (next) => { setD(next); send({ decor: next }); setMsg(""); };
  const look = (sh) => change(decorFor(sh));
  const setVar = (k, val) => change({ ...(d || {}), vars: { ...((d && d.vars) || {}), [k]: val } });
  const setFont = (key) => { const f = FONTS[key]; change({ ...(d || {}), fonts: { display: f.display, body: f.body, href: fontHref(key) } }); };
  const keep = () => new Promise((res) => {
    const id = Math.random().toString(36).slice(2);
    const on = (e) => { const x = e.data || {}; if (!x.__spineDecorSaved || x.id !== id) return; window.removeEventListener("message", on); res(x); };
    window.addEventListener("message", on); send({ save: true, id }); setTimeout(() => { window.removeEventListener("message", on); res({ edits: [] }); }, 3000);
  }).then((x) => {
    const html = withDecor(applyEdits(v.html, x.edits || []), d);
    if (onVersion) onVersion({ ...v, html, decor: d, at: Date.now(), what: (x.edits || []).length ? "Your edits and decorations" : "New look" });
    setEditing(false); setMsg("Kept as a new version.");
  });
  const vars = (d && d.vars) || {};
  return (
    <div className="inv16">
      <button className="inv16-open" onClick={() => setOpen(!open)}>{open ? "Close decorating" : "\uD83C\uDFA8 Decorate and edit"}</button>
      {open && <>
        <div className="inv16-lbl">Looks</div>
        <div className="inv16-row">{SHELLS.map((sh) => <button key={sh.key} onClick={() => look(sh)} style={{ background: sh.vars.bg, color: sh.vars.paper === "#141419" ? "#f2e6c9" : sh.vars.ink, borderColor: sh.vars.accent }}>{sh.emoji} {sh.name}</button>)}</div>
        <div className="inv16-lbl">Colours</div>
        <div className="inv16-row">{[["accent", "Accent"], ["bg", "Background"], ["paper", "Card"], ["ink", "Words"], ["envelope", "Envelope"]].map(([k, l]) => <label key={k} className="inv16-col"><input type="color" value={vars[k] || "#cccccc"} onChange={(e) => setVar(k, e.target.value)} />{l}</label>)}</div>
        <div className="inv16-lbl">Type</div>
        <div className="inv16-row">{Object.entries(FONTS).map(([k, f]) => <button key={k} onClick={() => setFont(k)}>{f.display}</button>)}</div>
        <div className="inv16-lbl">Drifting</div>
        <div className="inv16-row">{PARTICLES.map((p) => <button key={p} className={d && d.particles === p ? "on" : ""} onClick={() => change({ ...(d || {}), particles: p })}>{p}</button>)}</div>
        <div className="inv16-row" style={{ marginTop: 8 }}>
          <button className={editing ? "on" : ""} onClick={() => { const n = !editing; setEditing(n); send({ edit: n }); setMsg(n ? "Tap any words on the invitation and type." : ""); }}>{editing ? "\u2713 Done editing words" : "\u270E Edit the words"}</button>
          <button className="pri" onClick={keep}>Keep these changes</button>
        </div>
        {msg && <div className="pt16-note">{msg}</div>}
      </>}
    </div>
  );
}
