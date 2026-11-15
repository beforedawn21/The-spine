// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MEMORY BY MEANING (batch 15, owner approved touching Core's recall). Core matched memories by
//  shared words, so "my cat" today never found "the kitten" next month. When the person switches
//  this on (a one-time ~50 MB download in Phone check), each memory gets a meaning-fingerprint on
//  the phone, the question being typed gets one too, and recall adds the closest memories. Nothing
//  leaves the phone. Recall stays instant: everything slow happens in the background beforehand.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { embed, cosine } from "./onDevice15.js";

const KEY = "spine.meaningmem", VKEY = "spine.meaningvecs";
const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 600);
const memKey = (m) => (m && (m.at || "") + "|" + norm(m.note || m.q).slice(0, 80)) || "";
let vecs = null; const asked = new Map(); let timer = null;
const toB64 = (f) => { const u = new Uint8Array(f.buffer); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };
function load() { if (vecs) return vecs; vecs = new Map(); try { const o = JSON.parse(localStorage.getItem(VKEY) || "{}"); for (const k in o) vecs.set(k, fromB64(o[k])); } catch (e) {} return vecs; }
function save() { try { const o = {}; for (const [k, v] of vecs) o[k] = toB64(v); localStorage.setItem(VKEY, JSON.stringify(o)); } catch (e) {} }
export const meaningMemoryOn = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
export function setMeaningMemory(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); if (!on) { localStorage.removeItem(VKEY); vecs = new Map(); asked.clear(); } } catch (e) {} }
// Give every memory that hasn't got one a meaning-fingerprint (and forget fingerprints of deleted memories).
export async function warmMeaningMemory(memories) {
  if (!meaningMemoryOn()) return 0; load();
  const mems = (memories || []).filter((m) => m && !m.sens); const live = new Set(mems.map(memKey));
  for (const k of [...vecs.keys()]) if (!live.has(k)) vecs.delete(k);
  const need = mems.filter((m) => !vecs.has(memKey(m))).slice(0, 200);
  for (let i = 0; i < need.length; i += 16) { const part = need.slice(i, i + 16); const v = await embed(part.map((m) => m.note || m.q || "")); part.forEach((m, j) => vecs.set(memKey(m), v[j])); }
  if (need.length) save(); return need.length;
}
// Called as the person types: the question's fingerprint is ready by the time they press send.
export function prepareQuestion(text) {
  if (!meaningMemoryOn()) return; const t = norm(text); if (t.length < 6 || asked.has(t)) return;
  clearTimeout(timer); timer = setTimeout(async () => { try { const [v] = await embed([t]); asked.set(t, v); while (asked.size > 12) asked.delete(asked.keys().next().value); } catch (e) {} }, 300);
}
export async function prepareQuestionNow(text) { if (!meaningMemoryOn()) return; const t = norm(text); if (t.length < 6 || asked.has(t)) return; try { const [v] = await embed([t]); asked.set(t, v); } catch (e) {} }
// Instant, for Core's recall: memories close in meaning to this question (needs both fingerprints ready).
export function meaningMatches(query, memories, min) {
  if (!meaningMemoryOn()) return []; const q = asked.get(norm(query)); if (!q) return []; load();
  return (memories || []).map((m) => { const v = vecs.get(memKey(m)); return v ? { m, s: cosine(q, v) } : null; })
    .filter((x) => x && x.s >= (min || 0.35)).sort((a, b) => b.s - a.s).slice(0, 3);
}
