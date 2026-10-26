// The Spine - data access layer.
// Every database read/write goes through here. If Supabase isn't configured,
// each function degrades gracefully (returns null / local-only) so the app
// still runs in "demo mode" instead of crashing.

import { supabase, supabaseReady } from "./supabaseClient";

const STARTER_CREDITS = 250; // new accounts get a small starter balance to try things

// ---- tiny helpers ---------------------------------------------------------


export { supabaseReady };

// ---- session persistence (remember who's logged in across refreshes) ------

const SESSION_KEY = "spine.session.accountId";

// A SESSION IS A SECRET TOKEN, NOT AN ACCOUNT ID.
// Restoring a session used to mean reading an account id back off the phone - and account ids
// are visible in the Market, so anyone could type in someone else's and open their account.
// Now the database issues a random token at sign-in; only its hash is stored server-side, and
// every private read and write must present it. The account id is kept only for offline mode.
const TOKEN_KEY = "spine.session.token";
let SESSION_TOKEN = (() => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } })();
export function getSessionToken() { return SESSION_TOKEN; }
function setSessionToken(t) {
  SESSION_TOKEN = t || "";
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {}
}
const hasSession = () => supabaseReady && !!SESSION_TOKEN;
// THE SERVERS LEARN WHO IS ASKING. Every request this app makes to its own /api/ carries the
// session token in a header, so wallets, allowances and Pro are decided by who is signed in -
// not by an account id the caller claims. Same-origin /api/ only: the token never goes to any
// outside service.
if (typeof window !== "undefined" && typeof window.fetch === "function" && !window.__spineFetchWrapped) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const u = typeof input === "string" ? input : (input && input.url) || "";
      const sameOriginApi = u.startsWith("/api/") || (typeof location !== "undefined" && u.startsWith(location.origin + "/api/"));
      if (SESSION_TOKEN && sameOriginApi) {
        const h = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || {});
        h.set("X-Spine-Session", SESSION_TOKEN);
        init = { ...(init || {}), headers: h };
      }
    } catch (e) {}
    return realFetch(input, init);
  };
  window.__spineFetchWrapped = true;
}
const one = (d) => (Array.isArray(d) ? d[0] : d);
export function saveSession(accountId) {
  try { if (accountId) localStorage.setItem(SESSION_KEY, accountId); } catch {}
}
export function clearSession() {
  // end it on the server too, so a copied token stops working immediately
  // .then() is what actually sends it: the database client builds a request lazily and only fires
  // it when something waits for the answer. Without it, sign-out never reached the server.
  try { if (supabaseReady && SESSION_TOKEN) supabase.rpc("spine_end_session", { p_token: SESSION_TOKEN }).then(() => {}, () => {}); } catch {}
  setSessionToken("");
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
export function getSavedAccountId() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

// ---- ACCOUNTS + AUTH ------------------------------------------------------

// Returns { ok, account, error }
export async function createAccount({ username, contact, password, isAdmin }) {
  const clean = String(username || "").replace(/^@/, "").trim();
  if (!clean) return { ok: false, error: "Pick a username." };
  if (!supabaseReady) {
    // demo mode - no persistence
    return {
      ok: true,
      account: { id: "local-" + clean.toLowerCase(), name: clean, contact, admin: !!isAdmin, verified: true, local: true },
      starter: STARTER_CREDITS,
    };
  }
  // unique-username check
  // Goes through a database function now. The accounts table is closed to the browser,
  // because a policy that said USING (true) let anyone read every password hash.
  const { data: taken } = await supabase.rpc("spine_username_taken", { p_username: clean });
  if (taken) return { ok: false, error: "That username is taken." };

  // The password goes to the database and is hashed there. It is never hashed in the
  // browser and never stored anywhere the browser can read.
  const { data: rows, error } = await supabase.rpc("spine_sign_up", {
    // admin rights are granted only inside the database; the server ignores this field
    p_username: clean, p_contact: contact || null, p_password: password || "", p_is_admin: false,
  });
  if (error) return { ok: false, error: error.message };
  const data = Array.isArray(rows) ? rows[0] : rows;
  if (!data) return { ok: false, error: "That username is taken." };

  // seed wallet with starter credits (via the server route so it works once anon writes are
  // locked; falls back to a direct insert if the route isn't configured yet).
  // Sign-up opens a session straight away, so the new account can save anything at once.
  const { data: sess } = await supabase.rpc("spine_start_session", { p_username: clean, p_password: password || "" });
  const st = one(sess);
  if (st && st.token) setSessionToken(st.token);
  // Starter credits come only from the server; the old browser fallback was always refused.
  const seeded = await applyWalletDelta(data.id, STARTER_CREDITS, "reward", "Welcome - starter credits");

  return {
    ok: true,
    // pro_until comes back from the database now. An account is Pro while that date is in
    // the future - a date rather than a flag, so a lapsed subscription expires by itself
    // instead of needing something to remember to switch it off.
    account: { id: data.id, name: data.username, contact: data.contact, admin: data.is_admin,
               verified: true, proUntil: data.pro_until || null,
               pro: !!(data.pro_until && new Date(data.pro_until) > new Date()) },
    starter: STARTER_CREDITS,
  };
}

// Returns { ok, account, error }
export async function signInAccount({ username, password }) {
  const clean = String(username || "").replace(/^@/, "").trim();
  if (!clean) return { ok: false, error: "Enter your username." };
  if (!supabaseReady) {
    return { ok: true, account: { id: "local-" + clean.toLowerCase(), name: clean, admin: false, verified: true, local: true } };
  }
  // One call signs in AND opens a session; the token comes back once and is kept on this phone.
  const { data: rows, error } = await supabase.rpc("spine_start_session", { p_username: clean, p_password: password || "" });
  if (error) return { ok: false, error: error.message };
  const d = one(rows);
  if (!d || !d.token) return { ok: false, error: "That username and password don't match." };
  setSessionToken(d.token);
  return {
    ok: true,
    account: { id: d.id, name: d.username, contact: d.contact, admin: d.is_admin, verified: true,
               proUntil: d.pro_until || null, pro: !!(d.pro_until && new Date(d.pro_until) > new Date()) },
  };
}

export async function loadAccountById(id) {
  if (!supabaseReady || !id || String(id).startsWith("local-")) return null;
  // Only the session token can restore an account - an id on its own opens nothing.
  if (!hasSession()) return null;
  const { data } = await supabase.rpc("my_account", { p_token: SESSION_TOKEN });
  const a = one(data);
  if (!a || a.id !== id) { setSessionToken(""); return null; }      // expired, or someone else's
  return { id: a.id, name: a.username, contact: a.contact, admin: a.is_admin, verified: true,
           proUntil: a.pro_until || null, pro: !!(a.pro_until && new Date(a.pro_until) > new Date()) };
}

export async function deleteAccountById(id, password) {
  if (!supabaseReady || !id || String(id).startsWith("local-")) return { ok: true };
  // The session proves it is you; the password is checked too when the account has one.
  const { data: done, error } = await supabase.rpc("spine_delete_my_account", { p_token: SESSION_TOKEN, p_password: password || "" });
  const ok = !error && done === true;
  if (ok) setSessionToken("");
  return { ok, error: error ? error.message : (done ? null : "That password didn't match.") };
}

export async function saveProfile(accountId, { name, handle, spec, bio }) {
  const cleanH = String(handle || "").replace(/^@/, "").trim();
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-")) {
    return { ok: true, profile: { name, handle: cleanH, spec, bio, createdAt: new Date() } };
  }
  if (!hasSession()) return { ok: false, error: "Please sign in again." };
  // The database checks the handle itself - the browser can no longer read other people's profiles.
  const { data: res, error } = await supabase.rpc("save_my_profile",
    { p_token: SESSION_TOKEN, p_display: name || "", p_handle: cleanH, p_specialty: spec || "", p_bio: bio || "" });
  if (error) return { ok: false, error: error.message };
  if (res === "handle taken") return { ok: false, error: "That handle is taken." };
  if (res !== "ok") return { ok: false, error: "Please sign in again." };
  return { ok: true, profile: { name, handle: cleanH, spec, bio, createdAt: new Date() } };
}

export async function loadProfile(accountId) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return null;
  const { data } = await supabase.rpc("my_profile", { p_token: SESSION_TOKEN });
  const d = one(data);
  if (!d) return null;
  return { name: d.display_name, handle: d.handle, spec: d.specialty, bio: d.bio, createdAt: new Date(d.created_at) };
}

export async function loadWallet(accountId) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return null;
  // Prefer the server route (authoritative). Fall back to a direct read if it's not configured.
  try {
    const resp = await fetch("/api/wallet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "read", accountId, token: SESSION_TOKEN }),
    });
    const out = await resp.json().catch(() => ({}));
    if (out && typeof out.balance === "number") return out.balance;
    if (out && !out.notConnected) { /* server reachable but no balance: fall through */ }
  } catch (e) { /* fall through to direct read */ }
  // Fallback: the person's own balance through their session, never by account id.
  if (!hasSession()) return null;
  const { data } = await supabase.rpc("my_wallet", { p_token: SESSION_TOKEN });
  return typeof data === "number" ? data : null;
}

// Server-authoritative balance change: send the DELTA, get back the real balance.
// Returns the new authoritative balance, or null if it couldn't reach the server route
// (caller then falls back to the legacy absolute write).
// Admin-only: set an absolute balance via the server (requires the admin password).
export async function setAdminCredits(accountId, amount, adminPassword) {
  if (!supabaseReady || !accountId) return null;
  try {
    const resp = await fetch("/api/wallet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "set", accountId, amount: Math.round(Number(amount) || 0), password: adminPassword || "" }),
    });
    const out = await resp.json().catch(() => ({}));
    if (out && typeof out.balance === "number") return out.balance;
    return null;
  } catch (e) { return null; }
}

export async function applyWalletDelta(accountId, delta, reason, label) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return null;
  const amount = Math.round(Number(delta));
  if (!amount) return null;
  try {
    const resp = await fetch("/api/wallet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delta", accountId, token: SESSION_TOKEN, amount, reason: reason || (amount > 0 ? "reward" : "spend"), label: label || "" }),
    });
    const out = await resp.json().catch(() => ({}));
    if (out && typeof out.balance === "number") return out.balance;
    return null; // notConnected or error -> caller falls back
  } catch (e) { return null; }
}

export async function setWalletBalance(accountId, balance) {
  // Balances are set only by the server now. This stays so older callers do nothing harmful.
  return;
}

export async function addLedger(accountId, label, direction, amount) {
  // Every spend and top-up is recorded by the server itself; a browser copy was refused anyway.
  return;
}

export async function loadLedger(accountId, limit = 50) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return [];
  const { data } = await supabase.rpc("my_ledger", { p_token: SESSION_TOKEN, p_limit: limit });
  return (data || []).map((r) => ({ label: r.label, dir: r.direction, amt: r.amount, at: new Date(r.created_at) }));
}

export async function loadTools() {
  if (!supabaseReady) return null; // null => caller keeps its seed list
  // The listing is light: names and ratings only. A tool's content loads when someone opens it.
  const { data } = await supabase.from("market_listing").select("*").order("created_at", { ascending: false }).limit(200);
  if (!data) return null;
  return data.map(mapToolRow);
}

// The actual code of a published tool, game, world or helper - fetched only when opened.
export async function loadToolContent(toolId) {
  if (!supabaseReady || !toolId || String(toolId).startsWith("seed")) return null;
  const { data } = await supabase.rpc("get_tool_content", { p_id: toolId });
  return typeof data === "string" ? data : null;
}

function mapToolRow(r) {
  // The listing now carries the author's name and the price; without them every published item
  // showed "by @undefined" and ran for free with nobody earning.
  const price = Math.max(0, Number(r.price) || 0);
  return {
    id: r.id, name: r.name, desc: r.description, type: r.kind,
    trust: r.trust_level, runs: r.runs || 0,
    oY: r.thumbs_up || 0, oT: (r.thumbs_up || 0) + (r.thumbs_down || 0),
    score: Number(r.outcome_score) || 0, persisted: true,
    by: r.author || "someone", accountId: r.account_id || null, featured: !!r.featured,
    price, pricing: price > 0 ? "per-run" : "free", earned: 0, mine: false,
    // a published game is played, not run - without this its card offered "Run" and never played
    playable: r.kind === "game",
  };
}

// ── CREATOR EARNINGS. The price is set by the owner only; a run is charged, shared and counted
// by the database in one step (see run_market_tool), so no phone can fake either side of it.
export async function setToolPriceDb(toolId, price) {
  if (!supabaseReady || !hasSession() || !toolId) return false;
  try { const { data } = await supabase.rpc("set_my_tool_price", { p_token: SESSION_TOKEN, p_id: toolId, p_price: Math.round(Number(price) || 0) }); return data === true; }
  catch (e) { return false; }
}
export async function runMarketTool(toolId) {
  if (!supabaseReady) return { status: "offline" };
  if (!hasSession()) return { status: "sign in" };
  try {
    const { data, error } = await supabase.rpc("run_market_tool", { p_token: SESSION_TOKEN, p_id: toolId });
    if (error) return { status: "error" };
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { status: row.status, balance: row.balance, charged: row.charged, earned: row.earned } : { status: "error" };
  } catch (e) { return { status: "error" }; }
}
export async function loadEarned() {
  if (!supabaseReady || !hasSession()) return null;
  try { const { data } = await supabase.rpc("my_earned", { p_token: SESSION_TOKEN }); return typeof data === "number" ? data : null; }
  catch (e) { return null; }
}

export async function publishToolDb(accountId, { name, description, kind, code, content }) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-")) return { ok: true, tool: null };
  if (!hasSession()) return { ok: false, error: "Please sign in again." };
  // THE CONTENT TRAVELS NOW. Publishing used to save only the name and description, so other
  // people saw a listing they could never open. The author is whoever holds the token.
  const body = String(content != null ? content : (code || ""));
  const { data: id, error } = await supabase.rpc("publish_my_tool", {
    p_token: SESSION_TOKEN, p_name: name || "Untitled", p_description: description || "", p_kind: kind || "tool", p_content: body,
  });
  if (error || !id) return { ok: false, error: error ? error.message : "Could not publish." };
  return { ok: true, tool: { id, name, desc: description, type: kind, trust: "New", runs: 0, oY: 0, oT: 0, score: 0, persisted: true } };
}

export async function recordFeedback(toolId, accountId, thumbsUp, message, kind, contact) {
  // A WRITTEN MESSAGE MUST ALWAYS ARRIVE.
  // Seeded tools returned early here, so a report about one was never sent. And any id that is
  // not a UUID made the insert throw, which the caller swallowed - the message simply vanished.
  // If someone wrote something, it is stored, with the tool named in the text when the id
  // cannot be a foreign key.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(toolId || ""));
  const acct = accountId && !String(accountId).startsWith("local-") ? accountId : null;
  if (message && String(message).trim() && supabaseReady) {
    const { error } = await supabase.from("feedback").insert({
      tool_id: isUuid ? toolId : null,
      account_id: acct,
      thumbs: !!thumbsUp,
      message: (isUuid ? "" : ("[about: " + String(toolId || "unknown") + "] ")) + String(message).slice(0, 3900),
      kind: kind || "feedback",
      contact: contact ? String(contact).slice(0, 200) : null,
      status: "new",
    });
    if (error) return { ok: false, error: error.message };
    if (!isUuid) return { ok: true, sent: true };
  }
  if (!supabaseReady || !toolId || String(toolId).startsWith("seed") || !isUuid) return { ok: true, local: true };
  if (message && String(message).trim()) {
    // Already stored above; only the score update is left to do.
    const { data: t0 } = await supabase.from("market_listing").select("id").eq("id", toolId).maybeSingle();
    if (!t0) return { ok: true, sent: true };
  }
  if (!(message && String(message).trim())) await supabase.from("feedback").insert({
    tool_id: toolId,
    account_id: accountId && !accountId.startsWith("local-") ? accountId : null,
    thumbs: !!thumbsUp,
      // WHY, not just WHETHER. The table stored one boolean, so a flagged tool arrived
      // with nothing to read and nothing to reply to.
      message: message ? String(message).slice(0, 4000) : null,
      kind: kind || "feedback",
      contact: contact ? String(contact).slice(0, 200) : null,
      status: "new",
  });
  // The rating and trust ladder are computed in the database, so no browser can fake them.
  const { data: rated } = await supabase.rpc("rate_tool", { p_id: toolId, p_up: !!thumbsUp });
  const t = one(rated);
  if (t) return { ok: true, up: t.up, down: t.down, score: t.score, trust: t.trust };
  return { ok: true };
}

export async function bumpToolRuns(toolId) {
  if (!supabaseReady || !toolId || String(toolId).startsWith("seed")) return;
  await supabase.rpc("bump_tool_runs", { p_id: toolId });
}

export async function saveConversation(accountId, convId, title, messages) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return { ok: true, id: convId || null };
  const { data, error } = await supabase.rpc("save_my_conversation", {
    p_token: SESSION_TOKEN, p_id: convId || null,
    p_title: (title || "Untitled chat").slice(0, 140), p_messages: JSON.stringify(messages || []),
  });
  // null means the row was not this person's - nothing was written
  return { ok: !error && !!data, id: data || convId || null, error: error ? error.message : (data ? null : "Not your conversation.") };
}

export async function loadConversations(accountId, limit = 30) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return [];
  const { data } = await supabase.rpc("my_conversations", { p_token: SESSION_TOKEN, p_limit: limit });
  return (data || []).map((r) => ({ id: r.id, title: r.title, messages: safeParse(r.messages), updatedAt: new Date(r.updated_at) }));
}

export async function deleteConversation(convId) {
  if (!supabaseReady || !convId || !hasSession()) return { ok: true };
  const { data, error } = await supabase.rpc("delete_my_conversation", { p_token: SESSION_TOKEN, p_id: convId });
  return { ok: !error && data === true, error: error && error.message };
}

export async function saveProject(accountId, projectId, name, data) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return { ok: true, id: projectId || null };
  try {
    const { data: id, error } = await supabase.rpc("save_my_project", {
      p_token: SESSION_TOKEN, p_id: projectId || null, p_name: name || "Untitled project", p_data: JSON.stringify(data || {}),
    });
    return { ok: !error && !!id, id: id || projectId || null, error: error ? error.message : (id ? null : "Not your project.") };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function loadProjects(accountId, limit = 50) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || !hasSession()) return [];
  try {
    const { data } = await supabase.rpc("my_projects", { p_token: SESSION_TOKEN });
    return (data || []).slice(0, limit).map((r) => ({ id: r.id, name: r.name, data: safeParseObj(r.data), updatedAt: new Date(r.updated_at) }));
  } catch (e) { return []; }
}

export async function deleteProject(projectId) {
  if (!supabaseReady || !projectId || !hasSession()) return { ok: true };
  try {
    const { data, error } = await supabase.rpc("delete_my_project", { p_token: SESSION_TOKEN, p_id: projectId });
    return { ok: !error && data === true, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function safeParseObj(s) {
  try { return JSON.parse(s) || {}; } catch { return {}; }
}

function safeParse(s) {
  try { return JSON.parse(s) || []; } catch { return []; }
}

// ---- PLATFORM SETTINGS (admin-editable controls, stored in DB) ------------

const SETTINGS_KEY = "global";
export const DEFAULT_SETTINGS = {
  freeQuestionLimit: 5,
  rateLimitPerHour: 40,
  freeModel: "claude-haiku-4-5-20251001",
  paidModel: "claude-sonnet-4-6",
  signupsOpen: true,
  marketOpen: true,
  starterCredits: 250,
  maintenanceMode: false,
  announcement: "",
  // expanded controls
  coreCostPaid: 10,            // credits per signed-in question
  uploadEnabled: true,         // show the + attach button
  voiceEnabled: true,          // show the mic button
  highStakesEnabled: true,     // allow 3-model high-stakes mode
  supportEmail1: "support@thespine.cloud",
  supportEmail2: "beforedawn2021@gmail.com",
  showCreate: true,
  showMarket: true,
  showStudio: true,
  showEarn: true,
  showVault: true,
  greeting: "",
  extraBlockedTerms: "",
  creditsEnabled: false,
  // ---- IMAGE GENERATION ----
  imageEnabled: true,            // show image generation in Create
  imageModel: "gpt-image-1-mini",// default cheap tier
  imageModelHi: "gpt-image-1",   // high-quality tier
  imageFreeNoSignup: 3,          // images before signup
  imageFreeSignup: 10,           // images after signup (initial)
  imageRefillAmount: 5,          // refill amount
  imageRefillHours: 36,          // refill window (day and a half)
  // ---- GAMES ----
  gameFreeNoSignup: 2,           // games a no-account visitor can make before signup
  gameFreeSignup: 10,            // games per refill cycle for signed-up accounts
  gameRefillHours: 36,           // games refill window (matches images)
  // ---- BLUEPRINTS ----
  blueprintFreeNoSignup: 2,      // blueprints a no-account visitor can make before signup
  blueprintFreeSignup: 5,        // blueprints per refill cycle for signed-up accounts
  blueprintRefillHours: 36,      // blueprint refill window (matches games/images)
  // ---- MONETIZATION (all OFF until payments connect) ----
  spinePlusEnabled: false,
  spinePlusPrice: 9.99,
  spinePlusImages: 100,          // images/mo included
  proToolsEnabled: false,        // creators sell premium tools
  proToolsCutPct: 20,            // platform cut %
  bulkCreditsEnabled: false,
  featuredPlacementEnabled: false,
  featuredPlacementPrice: 5,
  referralsEnabled: false,
  referralBonus: 50,             // credits for a successful referral
  dailyBonusEnabled: false,
  dailyBonusAmount: 10,
  promoCodesEnabled: false,
  marginPct: 20,                 // your margin baked into credit pricing
  // ---- TIERS & PRICING (display on the Pro card; actual free limits live per-tool above) ----
  proPrice: 9.99,
  // Spine Pro inclusions (shown on the buy card)
  proChats: 300, proImages: 50, proVideos: 10,
  // cost controls
  imageRateSeconds: 30,        // 1 image per 30s
  cachingEnabled: true,        // cache common Q&A
  smartRouting: true,          // route by difficulty
  tiersEnabled: false,         // master switch - off until payments connect
  // ---- CREATOR PAYMENT POOL (money out can never exceed money in) ----
  poolEnabled: false,          // off until real payments fund the pool
  poolBalance: 0,              // credits available to pay creators (filled by purchases)
  splitCreatorPct: 70,         // creator's share when their tool is used
  splitPlatformPct: 20,        // your margin
  splitComputePct: 10,         // covers API cost
  payoutMinCredits: 1000,      // creators can cash out only above this (when payments live)
  payoutsLive: false,          // real cash-out activates only when MoR connected
  // ---- PEGGED CREDIT COSTS (1 credit = $0.001) ----
  // Cost = real API cost + margin, rounded to clean credits. Editable as providers change price.
  costChat: 2,        // ~$0.002 - one smart query
  costImage: 30,      // ~$0.03  - one image (cheap tier ~$0.005 cost + margin + headroom)
  costImageHi: 80,    // ~$0.08  - high-quality image
  costVideo: 400,     // ~$0.40  - one short video (when video connects)
  // ---- PROVIDER TOGGLES (features go live when keyed AND toggled on) ----
  searchEnabled: false,        // Tavily last-resort lookup
  videoEnabled: false,         // Kling/Runway video
  videoMaxSeconds: 5,          // hard cap on video length
  imageOrder: "quality",       // "quality": OpenAI, Runway, then free FLUX. "free": FLUX first.
  imageStock: true,            // last resort on the Image tab: a credited, licensed real photo
  subscriptionsLive: false,    // master switch for paid subscriptions
  // Kill switches - instant off for expensive features if costs spike
  killImages: false,
  killVideo: false,
  killSearch: false,
};

export async function loadSettings() {
  if (!supabaseReady) return { ...DEFAULT_SETTINGS };
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    if (data && data.value) return { ...DEFAULT_SETTINGS, ...JSON.parse(data.value) };
  } catch (e) {}
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings, adminPassword) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  // Preferred path: save via the server route (/api/settings) using the service key, gated by
  // the admin password. This is what lets us lock direct settings writes from the public key.
  try {
    const resp = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword || "", value: JSON.stringify(settings) }),
    });
    const out = await resp.json().catch(() => ({}));
    if (out && out.ok) return { ok: true };
    // If the server route isn't configured yet (no service key / env), fall back to the old
    // direct write so the admin panel keeps working until the env is set up. Once env is set
    // and the Level-2 SQL is run, this fallback path is the one that gets blocked (by design).
    if (!out || !out.notConnected) {
      if (out && out.error) return { ok: false, error: out.error };
    }
  } catch (e) { /* fall through to direct write */ }
  // Fallback: direct upsert (works while anon writes are still allowed).
  try {
    const { error } = await supabase.from("settings").upsert(
      {
        key: SETTINGS_KEY,
        value: JSON.stringify(settings),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
      return { ok: false, error: parts.join(" | ") || "Unknown error" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Exception: " + String(e && e.message ? e.message : e) };
  }
}

export async function setToolPublic(toolId, isPublic) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  if (!hasSession()) return { ok: false, error: "Please sign in again." };
  const { data, error } = await supabase.rpc("set_my_tool_public", { p_token: SESSION_TOKEN, p_id: toolId, p_public: !!isPublic });
  return { ok: !error && data === true, error: error ? error.message : (data ? null : "Only the creator can change this.") };
}

export async function loadAllUsers(limit = 200) {
  if (!supabaseReady || !hasSession()) return [];
  try {
    const { data } = await supabase.rpc("admin_list_users", { p_token: SESSION_TOKEN });
    return (data || []).slice(0, limit).map((a) => ({
      id: a.id, username: a.username, contact: a.contact, isAdmin: a.is_admin, createdAt: a.created_at, balance: a.balance || 0,
    }));
  } catch (e) { return []; }
}

export async function adminSetUserCredits(accountId, amount) {
  // This wrote to the wallets table from the browser, which the database always refused, so the
  // Brain Stem button did nothing. The wallet server now checks the admin's own session.
  if (!supabaseReady || !hasSession()) return { ok: false, error: "Please sign in again." };
  try {
    const resp = await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "set", accountId, amount: Math.max(0, Math.round(amount)), token: SESSION_TOKEN }) });
    const out = await resp.json().catch(() => ({}));
    return { ok: typeof out.balance === "number", error: out.error || null };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function adminDeleteUser(accountId) {
  if (!supabaseReady || !hasSession()) return { ok: false, error: "Please sign in again." };
  const { data, error } = await supabase.rpc("admin_delete_user", { p_token: SESSION_TOKEN, p_id: accountId });
  return { ok: !error && data === true, error: error ? error.message : (data ? null : "Could not delete that account.") };
}

export async function adminDeleteTool(toolId) {
  if (!supabaseReady || !hasSession()) return { ok: false, error: "Please sign in again." };
  const { data, error } = await supabase.rpc("admin_set_tool", { p_token: SESSION_TOKEN, p_id: toolId, p_featured: false, p_delete: true });
  return { ok: !error && data === true, error: error && error.message };
}

export async function adminSetToolFeatured(toolId, featured) {
  if (!supabaseReady || !hasSession()) return { ok: false, error: "Please sign in again." };
  const { data, error } = await supabase.rpc("admin_set_tool", { p_token: SESSION_TOKEN, p_id: toolId, p_featured: !!featured, p_delete: false });
  return { ok: !error && data === true, error: error && error.message };
}

export async function loadAdminStats() {
  if (!supabaseReady || !hasSession()) return null;
  const out = {};
  try {
    const { data } = await supabase.rpc("admin_stats", { p_token: SESSION_TOKEN });
    if (!data) return out;
    Object.assign(out, data);
    const days = {}; const now = new Date();
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days[d.toISOString().slice(0, 10)] = 0; }
    (data.signupDates || []).forEach((iso) => { const k = String(iso || "").slice(0, 10); if (k in days) days[k]++; });
    out.signupsByDay = days; delete out.signupDates;
    return out;
  } catch (e) { return out; }
}

const _spineAssets = { images: [], audio: [], video: [], text: [] };

// Add an asset produced by a pipe. kind: "images"|"audio"|"video"|"text".
// asset: { url|src|text, title?, from? } - shape is flexible, we just store it.
export function addProjectAsset(kind, asset) {
  try {
    if (!kind || !(kind in _spineAssets) || !asset) return;
    _spineAssets[kind].unshift({ ...asset, at: Date.now() });
    if (_spineAssets[kind].length > 20) _spineAssets[kind].length = 20; // keep it light
  } catch (e) { /* fail-open: never break a pipe over asset bookkeeping */ }
}

// Read the most recent asset(s) of a kind that another pipe might reuse.
export function getProjectAssets(kind) {
  try {
    if (!kind) return { ..._spineAssets };
    return (_spineAssets[kind] || []).slice();
  } catch (e) { return []; }
}

// Most recent single asset of a kind (e.g. "the last image I made"), or null.
export function latestProjectAsset(kind) {
  try { return (_spineAssets[kind] || [])[0] || null; } catch (e) { return null; }
}

// Clear the workspace (e.g. when starting a fresh project).

// ═══════════════════════════════════════════════════════════════════════════════════════
//  REPORTS - anyone signed in can flag a Market item; three different people hide it until
//  an admin looks. The database does the counting, so nobody can report the same thing twice.
// ═══════════════════════════════════════════════════════════════════════════════════════
export const REPORT_REASONS = [
  ["scam", "A scam, or asks for money or details"],
  ["unsafe", "Dangerous or harmful"],
  ["hateful", "Hateful or harassing"],
  ["sexual", "Sexual content"],
  ["stolen", "Copies someone else's work"],
  ["broken", "Doesn't work"],
  ["other", "Something else"],
];
export async function reportTool(toolId, reason, note) {
  if (!supabaseReady) return { ok: false, status: "offline" };
  if (!hasSession()) return { ok: false, status: "sign in" };
  try {
    const { data, error } = await supabase.rpc("report_tool", { p_token: SESSION_TOKEN, p_id: toolId, p_reason: reason, p_note: note || null });
    if (error) return { ok: false, status: "error" };
    return { ok: data === "ok" || data === "already", status: data };
  } catch (e) { return { ok: false, status: "error" }; }
}
export async function loadReports() {
  if (!supabaseReady || !hasSession()) return [];
  try { const { data } = await supabase.rpc("admin_list_reports", { p_token: SESSION_TOKEN }); return data || []; }
  catch (e) { return []; }
}
export async function adminResolveReport(toolId, action) {
  if (!supabaseReady || !hasSession()) return { ok: false };
  try {
    const { data, error } = await supabase.rpc("admin_resolve_report", { p_token: SESSION_TOKEN, p_id: toolId, p_action: action });
    return { ok: !error && data === true };
  } catch (e) { return { ok: false }; }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
//  WHAT LIVED ONLY ON THE PHONE, NOW KEPT SAFE
//  Memories, helpers, saved tools, projects and tools' own data lived in the browser alone, and
//  iPhone Safari clears a site's storage when it has not been opened for a while. The phone's
//  copy stays the working copy (so nothing about how the app reads it changes) and a second copy
//  is kept in the database for the signed-in person:
//    - after a change, the phone's copy is sent up (checked every 30s and when the app is put away)
//    - on sign-in or opening the app, a newer database copy (from another phone, or after a wipe)
//      comes down. If both changed, the two are merged so nothing is lost.
//  Deletions travel too: a phone that has not changed anything takes the database copy as it is.
//  Another person's data on a shared phone is never sent up under the wrong account.
// ═══════════════════════════════════════════════════════════════════════════════════════
const SYNC_KINDS = { memories: "spine.memories", assistants: "spine.assistants", mytools: "spine.mytools", projects: "spine.projects", tooldata: "spine.tooldata" };
const SYNC_META = "spine.sync.meta";
const SYNC_CAP = 2900000;
function syncHash(s) { let h = 5381; s = String(s || ""); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return s.length + ":" + (h >>> 0).toString(36); }
function readMeta() { try { return JSON.parse(localStorage.getItem(SYNC_META) || "{}") || {}; } catch (e) { return {}; } }
function writeMeta(m) { try { localStorage.setItem(SYNC_META, JSON.stringify(m)); } catch (e) {} }
function readKind(k) { try { return localStorage.getItem(SYNC_KINDS[k]); } catch (e) { return null; } }
function writeKind(k, v) { try { localStorage.setItem(SYNC_KINDS[k], v); return true; } catch (e) { return false; } }
const isEmpty = (s) => s == null || s === "" || s === "[]" || s === "{}" || s === "null";
// Both copies changed: keep everything. Lists join by id (or by text for memories), the phone's
// version first; tool data joins key by key, the phone's value winning.
export function mergeCopies(kind, localStr, dbStr) {
  let a, b; try { a = JSON.parse(localStr); } catch (e) { return dbStr; } try { b = JSON.parse(dbStr); } catch (e) { return localStr; }
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyOf = (x) => (x && (x.id != null ? "id:" + x.id : x.text != null ? "t:" + x.text : "j:" + JSON.stringify(x)));
    const seen = new Set(a.map(keyOf)); const out = a.slice();
    for (const x of b) { const k = keyOf(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
    return JSON.stringify(kind === "assistants" || kind === "mytools" ? out.slice(0, 40) : out);
  }
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify({ ...b, ...a });
  return localStr;
}
// A project too big to keep (pictures written out as text) keeps its shape and small previews.
async function shrinkPictures(str) {
  if (typeof document === "undefined") return str;
  const big = /"(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{150000,})"/g;
  const found = [...new Set((str.match(big) || []).map((m) => m.slice(1, -1)))];
  for (const src of found) {
    const small = await new Promise((res) => {
      try {
        const img = new Image();
        img.onload = () => { try { const e = 480, s = Math.min(1, e / Math.max(img.width, img.height)); const c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.7)); } catch (er) { res(null); } };
        img.onerror = () => res(null); img.src = src;
      } catch (e) { res(null); }
    });
    str = str.split(src).join(small || "");
    if (str.length <= SYNC_CAP) break;
  }
  return str;
}
let syncBusy = false;
export async function syncDown(accountId) {
  const changed = [];
  if (!supabaseReady || !hasSession() || !accountId || syncBusy) return changed;
  syncBusy = true;
  try {
    const { data, error } = await supabase.rpc("my_state", { p_token: SESSION_TOKEN });
    if (error || !Array.isArray(data)) return changed;
    const meta = readMeta();
    const otherPerson = meta.account && meta.account !== accountId;   // a shared phone
    const rows = {}; data.forEach((r) => { rows[r.kind] = r; });
    // On a shared phone the previous person's copy is set aside (not sent anywhere) so that
    // anything they had not yet sent up is still here, and merged back, when they return.
    let stash = {}; try { stash = JSON.parse(localStorage.getItem("spine.sync.stash") || "{}") || {}; } catch (e) { stash = {}; }
    if (otherPerson) {
      const prev = {}; for (const k of Object.keys(SYNC_KINDS)) { const v = readKind(k); if (!isEmpty(v) && !(meta[k] && meta[k].hash === syncHash(v))) prev[k] = v; }
      if (Object.keys(prev).length) stash[meta.account] = prev;
    }
    const mine = stash[accountId] || null;
    for (const k of Object.keys(SYNC_KINDS)) {
      const row = rows[k]; const m = (!otherPerson && meta[k]) || null;
      if (otherPerson) {
        // the phone holds someone else's copy: show this person theirs (or nothing), never mix
        let next = row ? row.data : (k === "tooldata" ? "{}" : "[]");
        if (mine && mine[k]) next = row ? mergeCopies(k, mine[k], row.data) : mine[k];   // their own unsent changes return
        if (writeKind(k, next)) changed.push(k);
        meta[k] = row ? { hash: syncHash(row.data), at: row.updated_at } : { hash: syncHash(k === "tooldata" ? "{}" : "[]"), at: null };
        continue;
      }
      const local = readKind(k);
      if (!row) continue;                                                   // nothing kept yet - it goes up next
      const dbNewer = !m || !m.at || Date.parse(row.updated_at) > Date.parse(m.at);
      if (!dbNewer) continue;
      const localChanged = !m || syncHash(local) !== m.hash;
      const next = (!localChanged || isEmpty(local)) ? row.data : mergeCopies(k, local, row.data);
      if (next !== local && writeKind(k, next)) changed.push(k);
      meta[k] = { hash: syncHash(row.data), at: row.updated_at };          // a merge differs from it, so it goes back up
    }
    if (mine) delete stash[accountId];
    try { localStorage.setItem("spine.sync.stash", JSON.stringify(stash)); } catch (e) {}
    meta.account = accountId; writeMeta(meta);
  } catch (e) { /* the phone's copy simply stays as it is */ }
  finally { syncBusy = false; }
  return changed;
}
export async function syncUp(accountId) {
  const sent = [];
  if (!supabaseReady || !hasSession() || !accountId || syncBusy) return sent;
  const meta = readMeta();
  if (meta.account && meta.account !== accountId) return sent;           // download first - never send another person's copy
  syncBusy = true;
  try {
    for (const k of Object.keys(SYNC_KINDS)) {
      const local = readKind(k); if (local == null) continue;
      const h = syncHash(local); if (meta[k] && meta[k].hash === h) continue;
      let payload = local;
      if (payload.length > SYNC_CAP && k === "projects") payload = await shrinkPictures(payload);
      if (payload.length > SYNC_CAP) continue;                              // too big to keep whole - the phone keeps it
      const { data, error } = await supabase.rpc("save_my_state", { p_token: SESSION_TOKEN, p_kind: k, p_data: payload });
      if (error || !data) continue;
      meta[k] = { hash: h, at: data }; sent.push(k);
    }
    meta.account = accountId; writeMeta(meta);
  } catch (e) {}
  finally { syncBusy = false; }
  return sent;
}
