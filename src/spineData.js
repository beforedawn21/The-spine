// The Spine — data access layer.
// Every database read/write goes through here. If Supabase isn't configured,
// each function degrades gracefully (returns null / local-only) so the app
// still runs in "demo mode" instead of crashing.

import { supabase, supabaseReady } from "./supabaseClient";

const STARTER_CREDITS = 250; // new accounts get a small starter balance to try things

// ---- tiny helpers ---------------------------------------------------------

// A very lightweight password hash. NOTE: this is obfuscation, not real
// security — real auth belongs on a server. It's here so passwords aren't
// stored as raw plaintext in the table while the app is in early access.
async function hashPassword(pw) {
  try {
    const enc = new TextEncoder().encode(pw + "::spine-v1");
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Fallback if subtle crypto isn't available
    let h = 0;
    const s = pw + "::spine-v1";
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "f" + (h >>> 0).toString(16);
  }
}

export { supabaseReady };

// ---- session persistence (remember who's logged in across refreshes) ------

const SESSION_KEY = "spine.session.accountId";

export function saveSession(accountId) {
  try { if (accountId) localStorage.setItem(SESSION_KEY, accountId); } catch {}
}
export function clearSession() {
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
    // demo mode — no persistence
    return {
      ok: true,
      account: { id: "local-" + clean.toLowerCase(), name: clean, contact, admin: !!isAdmin, verified: true, local: true },
      starter: STARTER_CREDITS,
    };
  }
  // unique-username check
  const { data: existing } = await supabase
    .from("accounts").select("id").ilike("username", clean).maybeSingle();
  if (existing) return { ok: false, error: "That username is taken." };

  const password_hash = password ? await hashPassword(password) : null;
  const { data, error } = await supabase
    .from("accounts")
    .insert({ username: clean, contact: contact || null, is_admin: !!isAdmin, password_hash })
    .select().single();
  if (error) return { ok: false, error: error.message };

  // seed wallet with starter credits
  await supabase.from("wallets").insert({ account_id: data.id, balance: STARTER_CREDITS });
  await addLedger(data.id, "Welcome — starter credits", "in", STARTER_CREDITS);

  return {
    ok: true,
    account: { id: data.id, name: data.username, contact: data.contact, admin: data.is_admin, verified: true },
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
  const { data, error } = await supabase
    .from("accounts").select("*").ilike("username", clean).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No account with that username." };

  if (data.password_hash) {
    const tryHash = await hashPassword(password || "");
    if (tryHash !== data.password_hash) return { ok: false, error: "Wrong password." };
  }
  return {
    ok: true,
    account: { id: data.id, name: data.username, contact: data.contact, admin: data.is_admin, verified: true },
  };
}

export async function loadAccountById(id) {
  if (!supabaseReady || !id || id.startsWith("local-")) return null;
  const { data } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.username, contact: data.contact, admin: data.is_admin, verified: true };
}

export async function deleteAccountById(id) {
  if (!supabaseReady || !id || id.startsWith("local-")) return { ok: true };
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  return { ok: !error, error: error && error.message };
}

// ---- PROFILES -------------------------------------------------------------

export async function saveProfile(accountId, { name, handle, spec, bio }) {
  const cleanH = String(handle || "").replace(/^@/, "").trim();
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) {
    return { ok: true, profile: { name, handle: cleanH, spec, bio, createdAt: new Date() } };
  }
  const { data: dup } = await supabase
    .from("profiles").select("id").ilike("handle", cleanH).maybeSingle();
  if (dup) return { ok: false, error: "That handle is taken." };

  const { data, error } = await supabase
    .from("profiles")
    .insert({ account_id: accountId, display_name: name, handle: cleanH, specialty: spec, bio })
    .select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, profile: { name: data.display_name, handle: data.handle, spec: data.specialty, bio: data.bio, createdAt: new Date(data.created_at) } };
}

export async function loadProfile(accountId) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return null;
  const { data } = await supabase.from("profiles").select("*").eq("account_id", accountId).maybeSingle();
  if (!data) return null;
  return { name: data.display_name, handle: data.handle, spec: data.specialty, bio: data.bio, createdAt: new Date(data.created_at) };
}

// ---- WALLET + LEDGER ------------------------------------------------------

export async function loadWallet(accountId) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return null;
  const { data } = await supabase.from("wallets").select("balance").eq("account_id", accountId).maybeSingle();
  return data ? data.balance : null;
}

export async function setWalletBalance(accountId, balance) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return;
  await supabase.from("wallets").upsert({ account_id: accountId, balance: Math.max(0, Math.round(balance)), updated_at: new Date().toISOString() });
}

export async function addLedger(accountId, label, direction, amount) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return;
  await supabase.from("ledger").insert({ account_id: accountId, label, direction, amount: Math.round(amount) });
}

export async function loadLedger(accountId, limit = 50) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return [];
  const { data } = await supabase
    .from("ledger").select("*").eq("account_id", accountId)
    .order("created_at", { ascending: false }).limit(limit);
  return (data || []).map((r) => ({ label: r.label, dir: r.direction, amt: r.amount, at: new Date(r.created_at) }));
}

// ---- TOOLS + FEEDBACK -----------------------------------------------------

export async function loadTools() {
  if (!supabaseReady) return null; // null => caller keeps its seed list
  const { data } = await supabase.from("tools").select("*").order("created_at", { ascending: false });
  if (!data) return null;
  return data.map(mapToolRow);
}

function mapToolRow(r) {
  return {
    id: r.id, name: r.name, desc: r.description, type: r.kind,
    trust: r.trust_level, runs: r.runs || 0,
    oY: r.thumbs_up || 0, oT: (r.thumbs_up || 0) + (r.thumbs_down || 0),
    score: Number(r.outcome_score) || 0, persisted: true,
  };
}

export async function publishToolDb(accountId, { name, description, kind }) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return { ok: true, tool: null };
  const { data, error } = await supabase
    .from("tools")
    .insert({ account_id: accountId, name, description, kind, trust_level: "New" })
    .select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, tool: mapToolRow(data) };
}

// Records a thumbs up/down and updates the tool's running outcome score + trust.
export async function recordFeedback(toolId, accountId, thumbsUp) {
  if (!supabaseReady || !toolId || String(toolId).startsWith("seed")) return { ok: true, local: true };
  await supabase.from("feedback").insert({
    tool_id: toolId,
    account_id: accountId && !accountId.startsWith("local-") ? accountId : null,
    thumbs: !!thumbsUp,
  });
  const { data: t } = await supabase.from("tools").select("*").eq("id", toolId).maybeSingle();
  if (t) {
    const up = (t.thumbs_up || 0) + (thumbsUp ? 1 : 0);
    const down = (t.thumbs_down || 0) + (thumbsUp ? 0 : 1);
    const total = up + down;
    const score = total ? Math.round((up / total) * 100) : 0;
    const trust = score >= 85 && total >= 8 ? "Core" : score >= 70 && total >= 4 ? "Trusted" : total >= 2 ? "Verified" : "New";
    await supabase.from("tools").update({ thumbs_up: up, thumbs_down: down, outcome_score: score, trust_level: trust }).eq("id", toolId);
    return { ok: true, up, down, score, trust };
  }
  return { ok: true };
}

export async function bumpToolRuns(toolId) {
  if (!supabaseReady || !toolId || String(toolId).startsWith("seed")) return;
  const { data: t } = await supabase.from("tools").select("runs").eq("id", toolId).maybeSingle();
  if (t) await supabase.from("tools").update({ runs: (t.runs || 0) + 1 }).eq("id", toolId);
}

// ---- CONVERSATIONS (chat history → Vault) ---------------------------------

// Save or update a conversation thread. messages = [{role, content}]
export async function saveConversation(accountId, convId, title, messages) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return { ok: true, id: convId || null };
  const payload = {
    account_id: accountId,
    title: (title || "Untitled chat").slice(0, 140),
    messages: JSON.stringify(messages || []),
    updated_at: new Date().toISOString(),
  };
  if (convId) {
    const { error } = await supabase.from("conversations").update(payload).eq("id", convId);
    return { ok: !error, id: convId, error: error && error.message };
  }
  const { data, error } = await supabase.from("conversations").insert(payload).select("id").single();
  return { ok: !error, id: data && data.id, error: error && error.message };
}

export async function loadConversations(accountId, limit = 30) {
  if (!supabaseReady || !accountId || accountId.startsWith("local-")) return [];
  const { data } = await supabase
    .from("conversations").select("*").eq("account_id", accountId)
    .order("updated_at", { ascending: false }).limit(limit);
  return (data || []).map((r) => ({
    id: r.id,
    title: r.title,
    messages: safeParse(r.messages),
    updatedAt: new Date(r.updated_at),
  }));
}

export async function deleteConversation(convId) {
  if (!supabaseReady || !convId) return { ok: true };
  const { error } = await supabase.from("conversations").delete().eq("id", convId);
  return { ok: !error, error: error && error.message };
}

// ---- PROJECTS (the creation hub — carries across tabs, lives in the Vault) ----
export async function saveProject(accountId, projectId, name, data) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || accountId === "admin-beforedawn") {
    return { ok: true, id: projectId || null };
  }
  const payload = { account_id: accountId, name: name || "Untitled project", data: JSON.stringify(data || {}), updated_at: new Date().toISOString() };
  try {
    if (projectId) {
      const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
      return { ok: !error, id: projectId, error: error && error.message };
    }
    const { data: ins, error } = await supabase.from("projects").insert(payload).select("id").single();
    return { ok: !error, id: ins && ins.id, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function loadProjects(accountId, limit = 50) {
  if (!supabaseReady || !accountId || String(accountId).startsWith("local-") || accountId === "admin-beforedawn") return [];
  try {
    const { data } = await supabase
      .from("projects").select("*").eq("account_id", accountId)
      .order("updated_at", { ascending: false }).limit(limit);
    return (data || []).map((r) => ({
      id: r.id, name: r.name, data: safeParseObj(r.data), updatedAt: new Date(r.updated_at),
    }));
  } catch (e) { return []; }
}

export async function deleteProject(projectId) {
  if (!supabaseReady || !projectId) return { ok: true };
  try { const { error } = await supabase.from("projects").delete().eq("id", projectId); return { ok: !error, error: error && error.message }; }
  catch (e) { return { ok: false, error: String(e) }; }
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
  // ---- TIERS & LIMITS ----
  proPrice: 9.99,
  // free (no account)
  freeNoAcctChats: 5, freeNoAcctImages: 3, freeNoAcctVideos: 0,
  // free account
  freeAcctChats: 20, freeAcctImages: 5, freeAcctVideos: 1,
  // Spine Pro
  proChats: 300, proImages: 50, proVideos: 10,
  // add-on packs (prices)
  packChatsPrice: 1.99, packChatsAmount: 100,
  packImagesPrice: 2.99, packImagesAmount: 20,
  packVideosPrice: 4.99, packVideosAmount: 5,
  // cost controls
  videoFreeSeconds: 5, videoProSeconds: 15,
  imageRateSeconds: 30,        // 1 image per 30s
  cachingEnabled: true,        // cache common Q&A
  smartRouting: true,          // route by difficulty
  tiersEnabled: false,         // master switch — off until payments connect
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
  costChat: 2,        // ~$0.002 — one smart query
  costImage: 30,      // ~$0.03  — one image (cheap tier ~$0.005 cost + margin + headroom)
  costImageHi: 80,    // ~$0.08  — high-quality image
  costVideo: 400,     // ~$0.40  — one short video (when video connects)
  // ---- PROVIDER TOGGLES (features go live when keyed AND toggled on) ----
  searchEnabled: false,        // Tavily last-resort lookup
  videoEnabled: false,         // Kling/Runway video
  videoMaxSeconds: 5,          // hard cap on video length
  subscriptionsLive: false,    // master switch for paid subscriptions
  // Kill switches — instant off for expensive features if costs spike
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

export async function saveSettings(settings) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
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
  try {
    const { error } = await supabase.from("tools").update({ is_public: isPublic }).eq("id", toolId);
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ---- ADMIN: user + tool management ----------------------------------------

export async function loadAllUsers(limit = 200) {
  if (!supabaseReady) return [];
  try {
    const { data: accts } = await supabase
      .from("accounts").select("id,username,contact,is_admin,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (!accts) return [];
    // attach wallet balances
    const ids = accts.map((a) => a.id);
    const { data: wallets } = await supabase.from("wallets").select("account_id,balance").in("account_id", ids);
    const wmap = {};
    (wallets || []).forEach((w) => { wmap[w.account_id] = w.balance; });
    return accts.map((a) => ({
      id: a.id, username: a.username, contact: a.contact,
      isAdmin: a.is_admin, createdAt: a.created_at,
      balance: wmap[a.id] != null ? wmap[a.id] : 0,
    }));
  } catch (e) { return []; }
}

export async function adminSetUserCredits(accountId, amount) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  try {
    const { error } = await supabase.from("wallets")
      .upsert({ account_id: accountId, balance: amount }, { onConflict: "account_id" });
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function adminDeleteUser(accountId) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  try {
    const { error } = await supabase.from("accounts").delete().eq("id", accountId);
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function adminDeleteTool(toolId) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  try {
    const { error } = await supabase.from("tools").delete().eq("id", toolId);
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function adminSetToolFeatured(toolId, featured) {
  if (!supabaseReady) return { ok: false, error: "Database not connected." };
  try {
    const { error } = await supabase.from("tools").update({ featured }).eq("id", toolId);
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ---- ADMIN STATS (Brain Stem dashboard) -----------------------------------

export async function loadAdminStats() {
  if (!supabaseReady) return null;
  const out = {};
  try {
    const tables = ["accounts", "profiles", "tools", "feedback", "ledger", "conversations", "wallets"];
    await Promise.all(tables.map(async (t) => {
      const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
      out[t] = count || 0;
    }));

    // recent signups
    const { data: recentAccounts } = await supabase
      .from("accounts").select("username,created_at,is_admin")
      .order("created_at", { ascending: false }).limit(10);
    out.recentAccounts = recentAccounts || [];

    // top tools by runs
    const { data: topTools } = await supabase
      .from("tools").select("name,runs,thumbs_up,thumbs_down,trust_level,outcome_score")
      .order("runs", { ascending: false }).limit(10);
    out.topTools = topTools || [];

    // credit flow from ledger
    const { data: ledgerRows } = await supabase
      .from("ledger").select("direction,amount").limit(2000);
    let credIn = 0, credOut = 0;
    (ledgerRows || []).forEach((r) => {
      if (r.direction === "in") credIn += r.amount || 0;
      else credOut += r.amount || 0;
    });
    out.creditsIn = credIn;
    out.creditsOut = credOut;

    // total feedback split
    const { data: fb } = await supabase.from("feedback").select("thumbs").limit(5000);
    out.thumbsUp = (fb || []).filter((x) => x.thumbs).length;
    out.thumbsDown = (fb || []).filter((x) => !x.thumbs).length;

    // signups over last 7 days
    const days = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    (recentAccounts || []).forEach(() => {}); // placeholder
    const { data: allAccts } = await supabase.from("accounts").select("created_at").limit(5000);
    (allAccts || []).forEach((a) => {
      const k = (a.created_at || "").slice(0, 10);
      if (k in days) days[k]++;
    });
    out.signupsByDay = days;

    return out;
  } catch (e) {
    return out;
  }
}
