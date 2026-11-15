// ═══════════════════════════════════════════════════════════════════════════════════════════
//  WHAT PEOPLE USE - the counter behind Brain Stem's "What people use".
//  Counts the NAMES of features and buttons used ("Create · Image made", "Click · Core · Make
//  slides") and nothing else: never what anyone types, says, uploads or makes. Counts are batched
//  on the phone and sent about once a minute, and when the app is put away.
//  OFFLINE: use while the phone has no signal is still counted. It is kept on the phone under the
//  day it happened, named "Offline · ...", and sent the moment the phone is back online.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { trackUsage, trackUsageDays } from "./spineData";

const QKEY = "spine.track.q";
let Q = {}; let timer = null; let enabled = true; let tabName = () => "";
try { Q = JSON.parse(localStorage.getItem(QKEY) || "{}") || {}; } catch (e) { Q = {}; }

function device() {
  try { let d = localStorage.getItem("spine.device"); if (!d) { d = "p" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("spine.device", d); } return d; } catch (e) { return ""; }
}
const keep = () => { try { localStorage.setItem(QKEY, JSON.stringify(Q)); } catch (e) {} };
export function setTrackingEnabled(on) { enabled = on !== false; }
const dayOf = (d) => { const x = d || new Date(); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const isOffline = () => { try { return navigator.onLine === false; } catch (e) { return false; } };
export function track(name) {
  if (!enabled) return;
  let n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (n.length < 3) return;
  if (isOffline() && !/^(Offline|Downloaded) · /.test(n)) n = "Offline · " + n;
  const k = dayOf() + "|" + n.slice(0, 90);
  Q[k] = (Q[k] || 0) + 1; keep();
  if (!timer) timer = setTimeout(flush, isOffline() ? 60000 : 45000);
}
let flushing = false;
export async function flush() {
  clearTimeout(timer); timer = null;
  if (flushing) return;
  const all = Object.keys(Q); if (!all.length) return;
  if (isOffline()) return;                                            // kept; sent when the phone is back
  flushing = true;
  try {
    const today = dayOf(); const keys = all.slice(0, 120); const batch = {}; keys.forEach((k) => { batch[k] = Q[k]; delete Q[k]; }); keep();
    const now = {}, past = {};
    keys.forEach((k) => {
      const m = /^(\d{4}-\d\d-\d\d)\|(.+)$/.exec(k); const d = m ? m[1] : today; const ev = m ? m[2] : k;   // old-style entries count as today
      if (d === today) now[ev] = (now[ev] || 0) + batch[k]; else (past[d] = past[d] || {})[ev] = (past[d][ev] || 0) + batch[k];
    });
    const putBack = (ks) => { ks.forEach((k) => (Q[k] = (Q[k] || 0) + batch[k])); if (Object.keys(Q).length > 600) Q = {}; keep(); };
    let okNow = true, okPast = true;
    if (Object.keys(now).length) okNow = (await trackUsage(now, device()).catch(() => null)) !== null;
    if (Object.keys(past).length) {
      okPast = (await trackUsageDays(past, device()).catch(() => null)) !== null;
      // Before the batch 15 database step there is no by-day door: count it today rather than lose it.
      if (!okPast && okNow) { const flat = {}; Object.values(past).forEach((o) => Object.entries(o).forEach(([e, c]) => (flat[e] = (flat[e] || 0) + c))); okPast = (await trackUsage(flat, device()).catch(() => null)) !== null; }
    }
    putBack(keys.filter((k) => { const m = /^(\d{4}-\d\d-\d\d)\|/.exec(k); return (m ? m[1] : today) === today ? !okNow : !okPast; }));
    if (Object.keys(Q).length && okNow && okPast) timer = setTimeout(flush, 5000);
  } finally { flushing = false; }
}

// A button's label, if it is safe to count: a short piece of the app's own wording - never text
// from inside a conversation, a document, a form field or anything a person wrote.
const PRIVATE = ".msg-user,.msg-text,.msg-ai .md,.thread .rich,.followups,.conv-open,.conv-list,.pv-body,.es-doc,.es-docwrap,[contenteditable],textarea,input,select,[data-notrack],.mem-it,.mem-t,.xs-sheet .rf-text,.po-list,.st-take,.ai-ins";
export function labelOf(el) {
  if (!el || el.closest(PRIVATE)) return "";
  // A card that shows a title, a name or a picture is showing someone's content - only its
  // own label (aria-label / data-track) is counted, never the words on it.
  const card = el.querySelector && el.querySelector('[class*="title"],[class*="name"],[class*="when"],img,video,canvas');
  // The button's main words: the first piece of its text that has letters in it - "Create", not
  // "Create nervous center"; "Video Game", not "⬢ Video Game soon".
  let main = "";
  if (!card) { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/\p{L}/u.test(n.nodeValue)) { main = n.nodeValue; break; } } }
  const t = el.getAttribute("data-track") || el.getAttribute("aria-label") || main || "";
  let s = String(t).replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}$£€]+/u, "").trim();
  if (!s || s.length > 44) return "";                                        // long text is content, not a button label
  s = s.replace(/[$£€]?\d[\d,.:%]*\s*(cr|s|ms|x|×)?/gi, "#").replace(/#(\s*#)+/g, "#").trim();
  if (/@|https?:|www\./i.test(s)) return "";
  return s.slice(0, 40);
}
export function startAutoTrack(getTabName) {
  tabName = getTabName || tabName;
  const onClick = (e) => {
    try {
      const el = e.target && e.target.closest && e.target.closest("button,[role=button],label.st-btn,.es-tab,.st-tab");
      if (!el) return;
      const lab = labelOf(el); if (!lab) return;
      const where = el.closest(".es-sheet") ? "Editor" : el.closest(".st") ? "Studio" : el.closest(".bs-section,.bs") ? "Brain Stem" : el.closest(".deck,.pv") ? "Slides & pages" : (tabName() || "App");
      track("Click · " + where + " · " + lab);
    } catch (er) {}
  };
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  const onOnline = () => setTimeout(flush, 1500);                      // back from offline: send what was kept
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", onOnline);
  if (Object.keys(Q).length) timer = setTimeout(flush, 8000);
  return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); window.removeEventListener("online", onOnline); };
}
