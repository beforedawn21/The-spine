// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MORE THINGS A SPINE TOOL CAN DO (batch 16, round 4). Free, no keys of ours. Same rules as
//  batch 15: a link opens the person's own app (they confirm there); anything that pays, posts
//  or sends to their own accounts asks them first; their addresses and tokens stay on their phone.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const enc = encodeURIComponent;
const clip = (s, n) => String(s == null ? "" : s).slice(0, n || 500);
const num = (x, lo, hi) => { const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

// The person's own automation webhook (Make, Zapier, IFTTT, n8n Cloud) - or their Discord/Slack
// channel. The server door accepts exactly these patterns and nothing else (api/assist.js).
export function hookKind(url) {
  const u = String(url || "").trim();
  if (u.length > 400 || /\.\.|%2e%2e|[\s@\\]/i.test(u)) return null;
  if (/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u)) return "discord";
  if (/^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(u)) return "slack";
  if (/^https:\/\/hook\.(?:eu1|eu2|us1|us2)\.make\.com\/[a-z0-9]{16,64}$/.test(u) || /^https:\/\/hook\.integromat\.com\/[a-z0-9]{16,64}$/.test(u)) return "make";
  if (/^https:\/\/hooks\.zapier\.com\/hooks\/catch\/\d{1,12}\/[a-z0-9]{3,20}\/?$/.test(u)) return "zapier";
  if (/^https:\/\/maker\.ifttt\.com\/trigger\/[A-Za-z0-9_-]{1,60}\/(?:json\/)?with\/key\/[A-Za-z0-9_-]{10,64}$/.test(u)) return "ifttt";
  if (/^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.app\.n8n\.cloud\/webhook(?:-test)?\/[A-Za-z0-9_-]{1,80}(?:\/[A-Za-z0-9_-]{1,80}){0,3}$/.test(u)) return "n8n";
  return null;
}
export const AUTOMATION_NAMES = { make: "Make", zapier: "Zapier", ifttt: "IFTTT", n8n: "n8n" };
export const isAutomation = (k) => Object.prototype.hasOwnProperty.call(AUTOMATION_NAMES, k);

// Rides: Uber and Lyft open with the destination filled in; the person books in their own app.
export function rideUrl(r) {
  const lat = num(r && r.lat, -90, 90), lon = num(r && r.lon, -180, 180), name = clip(r && (r.name || r.to), 120);
  if (r && r.service === "lyft") {
    if (lat == null || lon == null) return null; // Lyft needs a map point
    return "https://lyft.com/ride?id=lyft&destination[latitude]=" + lat + "&destination[longitude]=" + lon;
  }
  let u = "https://m.uber.com/ul/?action=setPickup&pickup=my_location";
  if (lat != null && lon != null) u += "&dropoff[latitude]=" + lat + "&dropoff[longitude]=" + lon;
  if (name) u += "&dropoff[nickname]=" + enc(name) + "&dropoff[formatted_address]=" + enc(clip(r.address || name, 200));
  return u;
}
// Food: DoorDash search, or an OpenTable table search (party size and time filled in).
export function foodUrl(f) {
  const q = clip(f && f.q, 80).trim();
  if (f && f.service === "opentable") {
    const covers = Math.round(num(f.people, 1, 20) || 2); const d = f.when ? new Date(f.when) : null;
    const dt = d && !isNaN(d) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    return "https://www.opentable.com/s?covers=" + covers + (dt ? "&dateTime=" + enc(dt) : "") + (q ? "&term=" + enc(q) : "");
  }
  return q ? "https://www.doordash.com/search/store/" + enc(q) + "/" : "https://www.doordash.com/";
}
// Music: a search in Apple Music or Spotify.
export function musicUrl(m) {
  const q = clip(m && m.q, 120).trim(); if (!q) return null;
  return m.service === "spotify" ? "https://open.spotify.com/search/" + enc(q) : "https://music.apple.com/search?term=" + enc(q);
}
// Tips and sales: the person's OWN Ko-fi, Buy Me a Coffee or Stripe payment link.
export function tipUrl(t) {
  const s = t && t.service;
  if (s === "stripe") { const l = String(t.link || t.handle || "").trim(); return /^https:\/\/(?:buy|donate)\.stripe\.com\/[A-Za-z0-9_]{6,80}(?:\?[A-Za-z0-9_=&.-]{0,200})?$/.test(l) ? l : null; }
  const h = String((t && t.handle) || "").replace(/^@/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60); if (!h) return null;
  if (s === "kofi") return "https://ko-fi.com/" + h;
  if (s === "bmc") return "https://buymeacoffee.com/" + h;
  return null;
}
export const TIP_NAMES = { kofi: "Ko-fi", bmc: "Buy Me a Coffee", stripe: "Stripe" };

// Kiri:Moto (free 3D-print slicer in the browser) takes a model by message once it has loaded.
// Its frame API: {clear:true}, {mode:'FDM'}, {parse: <STL bytes>, type:'stl'}. Sending is repeated a
// few times while it starts up; each send clears first, so the model is never doubled.
export const KIRI_URL = "https://grid.space/kiri/";
export function kiriMessages(bytes) { return [{ clear: true }, { mode: "FDM" }, { parse: bytes, type: "stl" }]; }
export function base64ToBytes(b64) {
  const s = atob(String(b64 || "").replace(/^data:[^,]*,/, "")); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
export function looksLikeStl(buf) {
  if (!buf || buf.byteLength < 84) return false;
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(256, buf.byteLength)));
  if (/^\s*solid[\s\S]*facet/.test(head)) return true; // text STL
  const n = new DataView(buf).getUint32(80, true); return n > 0 && 84 + n * 50 === buf.byteLength; // binary STL
}

// Social posts to the person's OWN accounts, with their own login kept on the phone.
export const SOCIAL_LIMITS = { telegram: 4000, mastodon: 500, bluesky: 300 };
export function socialText(service, text) {
  const t = String(text || "").trim(); const lim = SOCIAL_LIMITS[service] || 300;
  const chars = Array.from(t); return chars.length > lim ? chars.slice(0, lim - 1).join("") + "…" : t;
}
export function socialRequests(service, cfg, text) {
  const t = socialText(service, text);
  if (service === "telegram") return [{ url: "https://api.telegram.org/bot" + cfg.token + "/sendMessage", body: { chat_id: cfg.chat, text: t, disable_web_page_preview: false } }];
  if (service === "mastodon") return [{ url: String(cfg.server).replace(/\/+$/, "") + "/api/v1/statuses", headers: { Authorization: "Bearer " + cfg.token }, body: { status: t, visibility: cfg.visibility || "public" } }];
  if (service === "bluesky") {
    const pds = String(cfg.pds || "https://bsky.social").replace(/\/+$/, "");
    return [{ url: pds + "/xrpc/com.atproto.server.createSession", body: { identifier: cfg.handle, password: cfg.password } },
      { url: pds + "/xrpc/com.atproto.repo.createRecord", body: { collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text: t, createdAt: new Date().toISOString() } } }];
  }
  return [];
}
export function socialConfigOk(service, c) {
  if (!c) return false;
  if (service === "telegram") return /^\d{5,15}:[A-Za-z0-9_-]{30,50}$/.test(c.token || "") && /^(-?\d{3,20}|@[A-Za-z0-9_]{5,32})$/.test(String(c.chat || ""));
  if (service === "mastodon") return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(c.server || "").replace(/\/+$/, "")) && String(c.token || "").length >= 20;
  if (service === "bluesky") return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(c.handle || "").replace(/^@/, "")) && /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(String(c.password || ""));
  return false;
}
export const SOCIAL_NAMES = { telegram: "Telegram", mastodon: "Mastodon", bluesky: "Bluesky" };

// Buzz patterns are kept short and polite: at most 12 steps, 5 seconds in all.
export function safePattern(p) {
  let a = Array.isArray(p) ? p : [p == null ? 30 : p]; a = a.slice(0, 12).map((x) => Math.max(0, Math.min(1000, Math.round(Number(x) || 0))));
  let tot = 0; const out = []; for (const x of a) { if (tot + x > 5000) break; tot += x; out.push(x); } return out.length ? out : [30];
}
// NFC tag records in plain words
export function nfcRecords(message) {
  const td = new TextDecoder();
  return ((message && message.records) || []).slice(0, 10).map((r) => {
    let data = null; try { if (r.recordType === "text" || r.recordType === "url" || r.recordType === "absolute-url") data = td.decode(r.data); else if (r.mediaType && /json|text/.test(r.mediaType)) data = td.decode(r.data); } catch (e) { data = null; }
    return { type: r.recordType, mediaType: r.mediaType || null, data };
  });
}
