// ============================================================================
//  ASSIST  —  the free tiers, wired so they switch on when a key appears
//
//  Every one of these is free and needs no card. None of them is required: if a
//  key is absent the endpoint says so plainly and the caller carries on without
//  it, exactly like every other optional engine here.
//
//    GROQ_API_KEY         groq.com          fast answers - game characters
//    CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN   10,000 neurons a day - translation, and the
//                         backup for fast answers, voice, transcription, images and key frames
//    GEMINI_API_KEY       Google AI Studio  third brain for fast answers and translation
//    RESEND_API_KEY       resend.com        3,000 emails a month
//    POLY_PIZZA_KEY       poly.pizza        10,400 CC0 models
// ============================================================================

const RL = new Map();
function __rateLimit(ip, max, windowMs) {
  const now = Date.now();
  const hit = RL.get(ip);
  if (!hit || now > hit.reset) { RL.set(ip, { n: 1, reset: now + windowMs }); return true; }
  if (hit.n >= max) return false;
  hit.n++; return true;
}
const off = (what, where) =>
  ({ error: what + " isn't connected. Add " + where + " in Vercel to switch it on.", missingKey: true });

// ── SPEND GUARD (self-contained, like the rate limiter above) ───────────────────────────────
// The daily allowances lived only in /api/usage, which the APP chose to call first - so anyone
// calling this endpoint directly skipped them and spent on your account without limit. This
// endpoint now counts for itself, in the same race-proof database counter. The person is known
// only from their session token (never from an id they claim); without one, by their address.
// Ceilings are about twice each in-app allowance, so a real person always meets the friendly
// in-app limit first. Checking progress never counts. If the database cannot be reached it
// lets the request through, exactly as the rest of the system does.
const __SG_CAPS = {
  chat:       { anon: 30, acct: 600, pro: 1800 },
  image:      { anon: 6,  acct: 50,  pro: 150 },
  video:      { anon: 2,  acct: 12,  pro: 36 },
  music:      { anon: 2,  acct: 16,  pro: 48 },
  dub:        { anon: 4,  acct: 40,  pro: 120 },
  audiofx:    { anon: 4,  acct: 40,  pro: 120 },
  transcribe: { anon: 10, acct: 100, pro: 300 },
  search:     { anon: 20, acct: 200, pro: 600 },
  readurl:    { anon: 20, acct: 200, pro: 600 },
  assist:     { anon: 30, acct: 300, pro: 900 },
};
// New sb_secret_ keys go in apikey alone; legacy JWT keys in both headers. Right under either rule.
function __sgHeaders(k) { return /^eyJ/.test(k) ? { apikey: k, Authorization: "Bearer " + k } : { apikey: k }; }
async function __spendGuard(req, kind) {
  try {
    const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true, tier: "anon" };
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
    const act = String(b.action || b.op || "").toLowerCase();
    if (act === "poll" || act === "status" || act === "check") return { ok: true, tier: "anon" };
    const H = { ...__sgHeaders(key), "Content-Type": "application/json" };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
    const rpc = async (fn, args) => {
      const r = await fetch(url + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(args), signal: ctl.signal });
      if (!r.ok) throw new Error(fn + " " + r.status); return r.json();
    };
    const tok = String(req.headers["x-spine-session"] || "");
    let who = null, tier = "anon";
    if (/^[0-9a-f]{64}$/.test(tok)) {
      who = await rpc("spine_whoami", { p_token: tok });
      if (who) {
        tier = "acct";
        const r = await fetch(url + "/rest/v1/accounts?select=pro_until&id=eq." + encodeURIComponent(who), { headers: H, signal: ctl.signal });
        const a = r.ok ? (await r.json())[0] : null;
        if (a && a.pro_until && new Date(a.pro_until) > new Date()) tier = "pro";
      }
    }
    let ip = "";
    try { ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || ""); } catch (e) {}
    if (!who && !ip) { clearTimeout(timer); return { ok: true, tier }; }
    const cap = (__SG_CAPS[kind] || __SG_CAPS.chat)[tier];
    const rows = await rpc("usage_bump", { p_subject: who ? "acct:" + who : "ip:" + ip, p_kind: "srv:" + kind, p_lim: cap, p_win_hours: 24 });
    clearTimeout(timer);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.allowed === false) return { ok: false, tier, resetAt: row.reset_at };
    return { ok: true, tier };
  } catch (e) { return { ok: true, tier: "anon" }; }
}


// ============================================================================
//  LIVE  -  free, keyless public data, fetched here so every source gets a proper name
//  (MET Norway and the US Weather Service require one), answers are cached, people's
//  locations never go straight from their phone to a third party, and the browser's
//  cross-site rules never get in the way. A fixed list of sources: no URL comes from
//  the caller, so this cannot be used to reach anything else. All are free for
//  commercial use with credit - which is why Open-Meteo (non-commercial) is no longer here.
// ============================================================================
const __LIVE_UA = "TheSpine/1.1 (+https://thespine.cloud)";
const __LIVE_CACHE = new Map();
async function __liveGet(url, ttlMs, asText) {
  const hit = __LIVE_CACHE.get(url);
  if (hit && hit.exp > Date.now()) return hit.v;
  const r = await fetch(url, { headers: { "User-Agent": __LIVE_UA, Accept: asText ? "*/*" : "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const v = asText ? await r.text() : await r.json();
  if (__LIVE_CACHE.size > 400) __LIVE_CACHE.clear();
  __LIVE_CACHE.set(url, { v, exp: Date.now() + (ttlMs || 600000) });
  return v;
}
const __enc = encodeURIComponent;
const __num = (x, lo, hi) => { const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const __clean = (s, n) => String(s == null ? "" : s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, n || 400);
async function __geocode(q) {
  q = String(q || "").slice(0, 120).trim(); if (!q) return null;
  try {
    const j = await __liveGet("https://photon.komoot.io/api/?limit=1&q=" + __enc(q), 86400000);
    const f = j && j.features && j.features[0];
    if (f && f.geometry && f.geometry.coordinates) {
      const p = f.properties || {};
      return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: [p.name, p.state, p.country].filter(Boolean).join(", "), country: p.countrycode || "" };
    }
  } catch (e) { /* Nominatim below */ }
  try {
    const j = await __liveGet("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=" + __enc(q), 86400000);
    const f = Array.isArray(j) && j[0];
    if (f) return { lat: Number(f.lat), lon: Number(f.lon), name: f.display_name, country: (f.address && f.address.country_code || "").toUpperCase() };
  } catch (e) { /* nothing */ }
  return null;
}
const __SYMBOL = (s) => String(s || "").replace(/_(day|night|polartwilight)$/, "").replace(/_/g, " ").replace("lightrain", "light rain").replace("heavyrain", "heavy rain").replace("partlycloudy", "partly cloudy").replace("clearsky", "clear sky").replace("lightsnow", "light snow").replace("heavysnow", "heavy snow").replace("andthunder", " and thunder").replace("showers", " showers").replace(/\s+/g, " ").trim();
const LIVE = {
  async geocode(b) { const g = await __geocode(b.q); return g ? { ...g, text: g.name + " is at " + g.lat.toFixed(4) + ", " + g.lon.toFixed(4) + ".", source: { title: "OpenStreetMap (Photon / Nominatim)", url: "https://www.openstreetmap.org/copyright" } } : null; },
  async weather(b) {
    let lat = __num(b.lat, -90, 90), lon = __num(b.lon, -180, 180), place = b.q ? String(b.q).slice(0, 80) : "your location", cc = "";
    if ((lat == null || lon == null) && b.q) { const g = await __geocode(b.q); if (!g) return null; lat = g.lat; lon = g.lon; place = g.name; cc = g.country; }
    if (lat == null || lon == null) return null;
    const j = await __liveGet("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4), 900000);
    const ts = j && j.properties && j.properties.timeseries; if (!ts || !ts.length) return null;
    const now = ts[0], d = now.data || {}, inst = (d.instant && d.instant.details) || {};
    const n1 = d.next_1_hours || d.next_6_hours || {};
    const sky = __SYMBOL(n1.summary && n1.summary.symbol_code);
    const rain = n1.details && n1.details.precipitation_amount;
    const days = {};
    for (const t of ts) {
      const day = String(t.time).slice(0, 10), v = t.data && t.data.instant && t.data.instant.details && t.data.instant.details.air_temperature;
      if (v == null) continue;
      const o = days[day] || (days[day] = { min: v, max: v, rain: 0, sky: "" });
      o.min = Math.min(o.min, v); o.max = Math.max(o.max, v);
      const n6 = t.data.next_6_hours; if (n6 && n6.details && /T(06|12):00/.test(t.time)) { o.rain += n6.details.precipitation_amount || 0; if (!o.sky || /T12/.test(t.time)) o.sky = __SYMBOL(n6.summary && n6.summary.symbol_code); }
    }
    const daily = Object.keys(days).slice(0, 4).map((k) => ({ date: k, min: Math.round(days[k].min), max: Math.round(days[k].max), rain: Math.round(days[k].rain * 10) / 10, sky: days[k].sky }));
    const hourly = ts.slice(0, 24).map((t) => ({ time: String(t.time).slice(11, 16), temp: t.data && t.data.instant && t.data.instant.details && t.data.instant.details.air_temperature }));
    const c = inst.air_temperature, f = c == null ? null : Math.round(c * 9 / 5 + 32);
    let text = "Live weather for " + place + ": " + (c != null ? c + "°C (" + f + "°F)" : "") + (sky ? ", " + sky : "") + (inst.wind_speed != null ? ", wind " + Math.round(inst.wind_speed * 3.6) + " km/h" : "") + (inst.relative_humidity != null ? ", humidity " + Math.round(inst.relative_humidity) + "%" : "") + (rain != null ? ", " + rain + " mm rain in the next hour" : "") + ".";
    if (daily.length) text += "\nNext days: " + daily.map((x) => x.date + " " + x.min + "-" + x.max + "°C" + (x.sky ? " " + x.sky : "") + (x.rain ? ", " + x.rain + " mm" : "")).join("; ") + ".";
    let alerts = [];
    const inUS = lat > 18 && lat < 72 && lon > -180 && lon < -64 && (!cc || cc === "US" || cc === "us");
    if (inUS) {
      try {
        const a = await __liveGet("https://api.weather.gov/alerts/active?point=" + lat.toFixed(4) + "," + lon.toFixed(4), 600000);
        alerts = ((a && a.features) || []).slice(0, 3).map((x) => __clean(x.properties && x.properties.headline, 200)).filter(Boolean);
        if (alerts.length) text += "\nActive alerts (US National Weather Service): " + alerts.join(" | ");
      } catch (e) { /* alerts are a bonus */ }
    }
    return { text, lat, lon, place, now: { tempC: c, sky, windKmh: inst.wind_speed != null ? Math.round(inst.wind_speed * 3.6) : null }, daily, hourly, alerts,
      source: { title: "MET Norway (CC BY 4.0)" + (alerts.length ? " + US National Weather Service" : ""), url: "https://api.met.no" } };
  },
  async f1(b) {
    const w = /stand|champ|points|table/i.test(String(b.q || "")) ? "standings" : /next|when|upcoming|schedule/i.test(String(b.q || "")) ? "next" : "last";
    if (w === "next") {
      const j = await __liveGet("https://api.jolpi.ca/ergast/f1/current/next.json", 3600000);
      const r = j && j.MRData && j.MRData.RaceTable && j.MRData.RaceTable.Races && j.MRData.RaceTable.Races[0]; if (!r) return null;
      return { text: "Next Formula 1 race: " + r.raceName + " at " + ((r.Circuit && r.Circuit.circuitName) || "") + ", " + r.date + (r.time ? " " + r.time.slice(0, 5) + " UTC" : "") + ".", source: { title: "Jolpica F1 (Ergast)", url: "https://jolpi.ca" } };
    }
    if (w === "standings") {
      const j = await __liveGet("https://api.jolpi.ca/ergast/f1/current/driverStandings.json", 3600000);
      const L = j && j.MRData && j.MRData.StandingsTable && j.MRData.StandingsTable.StandingsLists && j.MRData.StandingsTable.StandingsLists[0]; if (!L) return null;
      const rows = (L.DriverStandings || []).slice(0, 10).map((x) => ({ pos: +x.position, name: x.Driver.givenName + " " + x.Driver.familyName, team: (x.Constructors && x.Constructors[0] && x.Constructors[0].name) || "", points: +x.points }));
      return { text: "Formula 1 drivers' standings (" + L.season + ", after round " + L.round + "):\n" + rows.map((x) => x.pos + ". " + x.name + " (" + x.team + ") " + x.points).join("\n"), rows, source: { title: "Jolpica F1 (Ergast)", url: "https://jolpi.ca" } };
    }
    const j = await __liveGet("https://api.jolpi.ca/ergast/f1/current/last/results.json", 1800000);
    const r = j && j.MRData && j.MRData.RaceTable && j.MRData.RaceTable.Races && j.MRData.RaceTable.Races[0]; if (!r) return null;
    const top = (r.Results || []).slice(0, 10).map((x) => x.position + ". " + x.Driver.givenName + " " + x.Driver.familyName + " (" + ((x.Constructor && x.Constructor.name) || "") + ")");
    return { text: "Latest Formula 1 result - " + r.raceName + " (" + r.date + "):\n" + top.join("\n"), source: { title: "Jolpica F1 (Ergast)", url: "https://jolpi.ca" } };
  },
  async holidays(b) {
    const cc = /^[A-Za-z]{2}$/.test(String(b.country || "")) ? String(b.country).toUpperCase() : "US";
    const j = await __liveGet("https://date.nager.at/api/v3/NextPublicHolidays/" + cc, 21600000);
    if (!Array.isArray(j) || !j.length) return null;
    const rows = j.slice(0, 6).map((x) => ({ date: x.date, name: x.name, local: x.localName }));
    return { text: "Upcoming public holidays (" + cc + "): " + rows.map((x) => x.date + " " + x.name + (x.local && x.local !== x.name ? " (" + x.local + ")" : "")).join("; ") + ".", rows, source: { title: "Nager.Date", url: "https://date.nager.at" } };
  },
  async onthisday(b) {
    const d = new Date(); const mm = String(b.month || d.getUTCMonth() + 1).padStart(2, "0"), dd = String(b.day || d.getUTCDate()).padStart(2, "0");
    if (!/^\d\d$/.test(mm) || !/^\d\d$/.test(dd)) return null;
    const j = await __liveGet("https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/" + mm + "/" + dd, 43200000);
    const ev = ((j && j.events) || []).slice(0, 6).map((x) => ({ year: x.year, text: __clean(x.text, 240) }));
    if (!ev.length) return null;
    return { text: "On this day (" + mm + "/" + dd + "):\n" + ev.map((x) => x.year + " - " + x.text).join("\n"), events: ev, source: { title: "Wikipedia, On this day (CC BY-SA)", url: "https://en.wikipedia.org/wiki/Wikipedia:On_this_day/Today" } };
  },
  async spaceweather() {
    const j = await __liveGet("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", 900000);
    let rows = [];
    if (Array.isArray(j) && Array.isArray(j[0])) rows = j.slice(1).map((r) => ({ time: String(r[0]), kp: Number(r[1]) }));
    else if (Array.isArray(j)) rows = j.map((r) => ({ time: String(r.time_tag || r.time || ""), kp: Number(r.Kp != null ? r.Kp : (r.kp_index != null ? r.kp_index : r.kp)) }));
    rows = rows.filter((r) => Number.isFinite(r.kp)).slice(-16);
    if (!rows.length) return null;
    const kp = rows[rows.length - 1].kp;
    const level = kp >= 9 ? "an extreme (G5) geomagnetic storm" : kp >= 8 ? "a severe (G4) storm" : kp >= 7 ? "a strong (G3) storm" : kp >= 6 ? "a moderate (G2) storm" : kp >= 5 ? "a minor (G1) storm" : kp >= 4 ? "active conditions" : "quiet conditions";
    return { text: "Space weather right now: planetary Kp " + kp + " - " + level + "." + (kp >= 5 ? " Auroras may be visible further from the poles than usual." : ""), rows, source: { title: "NOAA Space Weather Prediction Center", url: "https://www.swpc.noaa.gov" } };
  },
  async earthevents() {
    const j = await __liveGet("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10", 1800000);
    const ev = ((j && j.events) || []).slice(0, 8).map((e) => { const g = (e.geometry || [])[e.geometry ? e.geometry.length - 1 : 0] || {}; return { title: e.title, kind: e.categories && e.categories[0] && e.categories[0].title, date: String(g.date || "").slice(0, 10), lon: g.coordinates && g.coordinates[0], lat: g.coordinates && g.coordinates[1] }; });
    if (!ev.length) return null;
    return { text: "Natural events happening now (NASA EONET):\n" + ev.map((x) => "- " + x.title + (x.kind ? " (" + x.kind + ")" : "") + (x.date ? ", " + x.date : "")).join("\n"), events: ev, source: { title: "NASA EONET", url: "https://eonet.gsfc.nasa.gov" } };
  },
  async news(b) {
    const q = String(b.q || "").replace(/[^\p{L}\p{N}\s"'-]/gu, " ").trim().slice(0, 100); if (!q) return null;
    const j = await __liveGet("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=8&sort=datedesc&timespan=3d&query=" + __enc(q + " sourcelang:english"), 900000);
    const arts = ((j && j.articles) || []).slice(0, 6).map((a) => ({ title: __clean(a.title, 200), url: a.url, site: a.domain, when: String(a.seendate || "").replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d).*/, "$1-$2-$3 $4:$5") }));
    if (!arts.length) return null;
    return { text: "Latest headlines on \"" + q + "\" (last 3 days):\n" + arts.map((a) => "- " + a.title + " (" + a.site + ", " + a.when + " UTC)").join("\n"), articles: arts, sources: arts.slice(0, 4).map((a) => ({ title: a.site + ": " + a.title, url: a.url })), source: { title: "GDELT", url: "https://www.gdeltproject.org" } };
  },
  async fx(b) {
    const base = /^[A-Za-z]{3}$/.test(String(b.base || "")) ? String(b.base).toLowerCase() : "usd";
    let j = null;
    try { j = await __liveGet("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/" + base + ".json", 3600000); }
    catch (e) { j = await __liveGet("https://latest.currency-api.pages.dev/v1/currencies/" + base + ".json", 3600000); }
    const rates = j && j[base]; if (!rates) return null;
    const want = (Array.isArray(b.to) ? b.to : String(b.to || "usd,eur,gbp,jpy").split(",")).map((x) => String(x).trim().toLowerCase()).filter((x) => rates[x] != null).slice(0, 8);
    return { text: "Exchange rates on " + j.date + " (1 " + base.toUpperCase() + "): " + want.map((k) => k.toUpperCase() + " " + rates[k]).join(", ") + ".", rates: Object.fromEntries(want.map((k) => [k, rates[k]])), source: { title: "Currency API (CC0)", url: "https://github.com/fawazahmed0/exchange-api" } };
  },
  async drug(b) {
    const n = String(b.q || "").replace(/[^A-Za-z0-9 -]/g, "").trim().slice(0, 50); if (!n) return null;
    const j = await __liveGet("https://api.fda.gov/drug/label.json?limit=1&search=openfda.brand_name:%22" + __enc(n) + "%22+openfda.generic_name:%22" + __enc(n) + "%22", 86400000);
    const r = j && j.results && j.results[0]; if (!r) return null;
    const o = r.openfda || {};
    const pick = (k) => __clean(r[k] && r[k][0], 500);
    const text = (o.brand_name && o.brand_name[0] || n) + (o.generic_name ? " (" + o.generic_name[0] + ")" : "") + " - from the US FDA drug label.\nUsed for: " + (pick("indications_and_usage") || "not stated") + (pick("warnings") ? "\nWarnings: " + pick("warnings") : (pick("boxed_warning") ? "\nBoxed warning: " + pick("boxed_warning") : "")) + (pick("drug_interactions") ? "\nInteractions: " + pick("drug_interactions") : "") + "\nThis is label information, not medical advice - check with a pharmacist or doctor.";
    return { text, source: { title: "openFDA drug labels", url: "https://open.fda.gov" } };
  },
  async tv(b) {
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const s = await __liveGet("https://api.tvmaze.com/singlesearch/shows?embed=nextepisode&q=" + __enc(q), 21600000);
    if (!s || !s.name) return null;
    const ne = s._embedded && s._embedded.nextepisode;
    const net = (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || "";
    return { text: s.name + (s.premiered ? " (" + s.premiered.slice(0, 4) + ")" : "") + (net ? " on " + net : "") + ", " + (s.status || "") + (s.rating && s.rating.average ? ", rated " + s.rating.average + "/10" : "") + ". " + __clean(s.summary, 300) + (ne ? "\nNext episode: S" + ne.season + "E" + ne.number + " \"" + ne.name + "\" on " + ne.airdate + "." : ""), image: s.image && (s.image.medium || s.image.original), source: { title: "TVmaze (CC BY-SA)", url: s.url || "https://www.tvmaze.com" } };
  },
  async anime(b) {
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const j = await __liveGet("https://api.jikan.moe/v4/anime?limit=1&q=" + __enc(q), 21600000);
    const a = j && j.data && j.data[0]; if (!a) return null;
    return { text: (a.title_english || a.title) + " - " + (a.type || "") + ", " + (a.episodes ? a.episodes + " episodes" : "episodes unknown") + ", " + (a.status || "") + (a.score ? ", score " + a.score : "") + (a.aired && a.aired.string ? ", aired " + a.aired.string : "") + ". " + __clean(a.synopsis, 300), image: a.images && a.images.jpg && a.images.jpg.image_url, source: { title: "Jikan (MyAnimeList)", url: a.url || "https://myanimelist.net" } };
  },
  async satellite(b) {
    const q = String(b.q || "ISS").replace(/[^A-Za-z0-9 ()-]/g, "").trim().slice(0, 40) || "ISS";
    const j = await __liveGet("https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&NAME=" + __enc(q), 7200000);
    const list = Array.isArray(j) ? j.slice(0, 5) : [];
    if (!list.length) return null;
    return { text: "Satellites matching \"" + q + "\": " + list.map((s) => s.OBJECT_NAME + " (#" + s.NORAD_CAT_ID + ", orbit every " + (s.MEAN_MOTION ? Math.round(1440 / s.MEAN_MOTION) + " min" : "?") + ", inclination " + Math.round(s.INCLINATION) + "°)").join("; ") + ".", elements: list, source: { title: "CelesTrak", url: "https://celestrak.org" } };
  },
  async planes(b) {
    const la = __num(b.lat, -90, 90), lo = __num(b.lon, -180, 180), r = Math.min(2, Math.max(0.2, Number(b.radius) || 1));
    if (la == null || lo == null) return null;
    const j = await __liveGet("https://opensky-network.org/api/states/all?lamin=" + (la - r) + "&lomin=" + (lo - r) + "&lamax=" + (la + r) + "&lomax=" + (lo + r), 60000);
    const st = ((j && j.states) || []).filter((s) => s[5] != null && s[6] != null).slice(0, 60).map((s) => ({ id: s[0], call: String(s[1] || "").trim(), country: s[2], lon: s[5], lat: s[6], alt: s[7], ground: s[8], speed: s[9], heading: s[10] }));
    return { text: st.length + " aircraft in the air near there right now" + (st.length ? ": " + st.slice(0, 6).map((s) => (s.call || s.id) + (s.alt ? " at " + Math.round(s.alt) + " m" : "")).join(", ") : "") + ".", planes: st, source: { title: "The OpenSky Network", url: "https://opensky-network.org" } };
  },
  async species(b) {
    const q = String(b.q || "").slice(0, 60).trim(); if (!q) return null;
    const j = await __liveGet("https://api.inaturalist.org/v1/taxa?per_page=1&q=" + __enc(q), 86400000);
    const t = j && j.results && j.results[0]; if (!t) return null;
    const cs = t.conservation_status && (t.conservation_status.status_name || t.conservation_status.status);
    return { text: (t.preferred_common_name ? t.preferred_common_name + " (" + t.name + ")" : t.name) + " - " + (t.rank || "") + ", " + (t.observations_count || 0).toLocaleString() + " sightings recorded on iNaturalist" + (cs ? ", conservation status: " + cs : "") + ".", image: t.default_photo && t.default_photo.medium_url, imageCredit: t.default_photo && t.default_photo.attribution, source: { title: "iNaturalist", url: "https://www.inaturalist.org/taxa/" + t.id } };
  },
  async vehicle(b) {
    const vin = String(b.vin || b.q || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ""); if (vin.length !== 17) return null;
    const j = await __liveGet("https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/" + vin + "?format=json", 86400000);
    const r = j && j.Results && j.Results[0]; if (!r || !r.Make) return null;
    return { text: "VIN " + vin + ": " + [r.ModelYear, r.Make, r.Model, r.Trim].filter(Boolean).join(" ") + (r.BodyClass ? ", " + r.BodyClass : "") + (r.EngineCylinders ? ", " + r.EngineCylinders + " cylinders" : "") + (r.FuelTypePrimary ? ", " + r.FuelTypePrimary : "") + (r.PlantCountry ? ", built in " + r.PlantCountry : "") + ".", source: { title: "NHTSA vPIC", url: "https://vpic.nhtsa.dot.gov" } };
  },
  async scripture(b) {
    const ref = String(b.q || "").slice(0, 40).trim(); if (!ref) return null;
    const qm = ref.match(/^(?:quran|surah|sura|qur'an)?\s*(\d{1,3})\s*[:.]\s*(\d{1,3})$/i);
    if (qm || /quran|surah|qur/i.test(String(b.book || ""))) {
      const m = qm || ref.match(/(\d{1,3})\s*[:.]\s*(\d{1,3})/); if (!m) return null;
      const j = await __liveGet("https://api.alquran.cloud/v1/ayah/" + m[1] + ":" + m[2] + "/editions/quran-uthmani,en.sahih", 604800000);
      const d = j && j.data; if (!Array.isArray(d) || !d[1]) return null;
      return { text: "Qur'an " + m[1] + ":" + m[2] + " (" + (d[0].surah && d[0].surah.englishName) + ")\n" + d[0].text + "\n" + d[1].text + "\n(Translation: Saheeh International)", source: { title: "AlQuran Cloud", url: "https://alquran.cloud" } };
    }
    const j = await __liveGet("https://bible-api.com/" + __enc(ref) + "?translation=web", 604800000);
    if (!j || !j.text) return null;
    return { text: j.reference + " (" + (j.translation_name || "World English Bible") + "): " + __clean(j.text, 1200), source: { title: "bible-api.com (public domain text)", url: "https://bible-api.com" } };
  },
};
async function __live(body) {
  const kind = String(body.kind || "");
  if (!Object.prototype.hasOwnProperty.call(LIVE, kind)) return { error: "Unknown source." };
  try { const out = await LIVE[kind](body || {}); return out || { error: "Nothing found." }; }
  catch (e) { return { error: "That source didn't answer." }; }
}

export default async function handler(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!__rateLimit(ip, 60, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  {
    let __b = req.body; if (typeof __b === "string") { try { __b = JSON.parse(__b); } catch (e) { __b = {}; } }
    if (__b && __b.what === "live") {
      const out = await __live(__b);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(out);
    }
  }
  {
    const __sg = await __spendGuard(req, "assist");
    req.__spineTier = __sg.tier;
    if (!__sg.ok) return res.status(429).json({ error: "You've reached today's limit for this. It refills within 24 hours.", limitReached: true, resetAt: __sg.resetAt || null });
  }

  const body = req.body || {};
  const what = String(body.what || "");

  // THREE BRAINS FOR THE SMALL JOBS. Fast answers and translation each had one engine; if it
  // was down, the leg asking got nothing. Now each walks Groq, Cloudflare and Gemini in turn,
  // whichever are connected, and answers from the first that replies.
  const cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID, cfTok = process.env.CLOUDFLARE_API_TOKEN;
  const groqKey = process.env.GROQ_API_KEY, geminiKey = process.env.GEMINI_API_KEY;
  async function groqText(prompt, maxTokens, temp, model) {
    if (!groqKey) return "";
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
        body: JSON.stringify({ model: model || "openai/gpt-oss-120b", messages: [{ role: "user", content: prompt }], max_completion_tokens: Math.max(maxTokens, 400), temperature: temp, reasoning_effort: /^openai\//.test(model || "openai/") ? "low" : undefined }),
      });
      if (!r.ok) return "";
      const j = await r.json();
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    } catch (e) { return ""; }
  }
  async function cfText(prompt, maxTokens, temp) {
    if (!cfAcct || !cfTok) return "";
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp }),
      });
      if (!r.ok) return "";
      const j = await r.json();
      const out = j && j.result && j.result.response;
      return typeof out === "string" ? out : "";
    } catch (e) { return ""; }
  }
  async function geminiText(prompt, maxTokens, temp) {
    if (!geminiKey) return "";
    for (const model of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST", signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } }),
        });
        if (r.status === 404) continue;
        if (!r.ok) return "";
        const j = await r.json();
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        return parts.map((x) => x.text || "").join("").trim();
      } catch (e) { return ""; }
    }
    return "";
  }
  async function anyText(prompt, maxTokens, temp, model) {
    return (await groqText(prompt, maxTokens, temp, model)) || (await cfText(prompt, maxTokens, temp)) || (await geminiText(prompt, maxTokens, temp));
  }
  const anyBrain = !!(groqKey || (cfAcct && cfTok) || geminiKey);

  try {
    // ── FAST ANSWERS. A chat model takes seconds; a game character has milliseconds.
    if (what === "fast") {
      if (!anyBrain) return res.status(200).json(off("Fast answers", "GROQ_API_KEY"));
      const prompt = String(body.prompt || "").slice(0, 2000);
      if (!prompt) return res.status(400).json({ error: "Nothing to answer." });
      const max = Math.min(400, body.maxTokens || 160);
      const model = /^[a-z0-9._\/-]{3,60}$/i.test(String(body.model || "")) ? String(body.model) : "";
      const text = await anyText(prompt, max, 0.8, model);
      if (!text) return res.status(200).json({ error: "The fast engine didn't answer." });
      return res.status(200).json({ text });
    }

    // ── TRANSLATION. Core has a language directive and no translator behind it.
    if (what === "translate") {
      // With no engine connected at all, the keyless translator at the end still answers short texts.
      const text = String(body.text || "").slice(0, 4000);
      if (!text) return res.status(400).json({ error: "Nothing to translate." });
      const from = String(body.from || "english").slice(0, 40), to = String(body.to || "spanish").slice(0, 40);
      if (cfAcct && cfTok) {
        try {
          const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + cfAcct + "/ai/run/@cf/meta/m2m100-1.2b", {
            method: "POST", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfTok },
            body: JSON.stringify({ text, source_lang: from, target_lang: to }),
          });
          if (r.ok) {
            const j = await r.json();
            const out = j.result && j.result.translated_text;
            if (out) return res.status(200).json({ text: out });
          }
        } catch (e) { /* the language models below can translate too */ }
      }
      const out = await anyText("Translate the text between the markers from " + from + " to " + to + ". Reply with the translation only - no notes, no quotation marks.\n<<<\n" + text + "\n>>>", 1200, 0.2);
      if (!out) {
        // LAST RESORT, NO KEY: MyMemory's free translator (5,000 characters a day per address).
        const CODES = { english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", dutch: "nl", russian: "ru", chinese: "zh-CN", japanese: "ja", korean: "ko", arabic: "ar", hindi: "hi", turkish: "tr", polish: "pl", swedish: "sv", greek: "el", hebrew: "he", indonesian: "id", vietnamese: "vi", thai: "th", ukrainian: "uk", swahili: "sw", yoruba: "yo", tagalog: "tl", haitian: "ht" };
        const fc = CODES[from.toLowerCase()] || (/^[a-z]{2}(-[A-Z]{2})?$/.test(from) ? from : "en"), tc = CODES[to.toLowerCase()] || (/^[a-z]{2}(-[A-Z]{2})?$/.test(to) ? to : "");
        if (tc && text.length <= 500) {
          try {
            const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + fc + "|" + tc, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "TheSpine/1.1 (+https://thespine.cloud)" } });
            const j = r.ok ? await r.json() : null;
            const t2 = j && j.responseData && j.responseData.translatedText;
            if (t2 && !/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t2)) return res.status(200).json({ text: t2, by: "MyMemory" });
          } catch (e) { /* nothing left */ }
        }
        return res.status(200).json({ error: "Translation didn't come back." });
      }
      return res.status(200).json({ text: out.replace(/^<<<\s*|\s*>>>$/g, "").trim() });
    }

    // ── EMAIL. A contact form that goes nowhere is worse than no form.
    if (what === "email") {
      // Email goes out from your own domain, so only a signed-in person may send it - never a
      // visitor, and never a stranger's Market tool running on someone else's phone.
      if ((req.__spineTier || "anon") === "anon") return res.status(403).json({ error: "Sign in to send email." });
      const key = process.env.RESEND_API_KEY;
      if (!key) return res.status(200).json(off("Email", "RESEND_API_KEY"));
      const to = String(body.to || "").slice(0, 120);
      const subject = String(body.subject || "From your Spine site").slice(0, 160);
      const text = String(body.text || "").slice(0, 8000);
      if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "That isn't an email address." });
      if (!text) return res.status(400).json({ error: "Nothing to send." });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ from: process.env.RESEND_FROM || "The Spine <onboarding@resend.dev>", to: [to], subject, text }),
      }).catch(() => null);
      if (!r || !r.ok) return res.status(200).json({ error: "The email didn't send." });
      return res.status(200).json({ ok: true });
    }

    // ── MODELS. Poly Pizza has 10,400 CC0 models behind a free key; Poly Haven has fewer, keyless,
    // museum-grade ones. Either can answer, so a leg asking for "a lantern" is never left empty.
    if (what === "findmodel") {
      const key = process.env.POLY_PIZZA_KEY;
      const q = String(body.q || "").slice(0, 80);
      if (!q) return res.status(400).json({ error: "Nothing to look for." });
      if (key) {
        try {
          const r = await fetch("https://api.poly.pizza/v1.1/search/" + encodeURIComponent(q) + "?limit=3", {
            headers: { "x-auth-token": key }, signal: AbortSignal.timeout(10000),
          });
          if (r.ok) {
            const j = await r.json();
            const first = (j.results || j.items || [])[0];
            const url = first && (first.Download || first.download || first.url);
            if (url) return res.status(200).json({
              url, name: first.Title || first.title || q,
              credit: (first.Creator && (first.Creator.Username || first.Creator.username)) || "Poly Pizza",
              licence: first.Licence || first.license || "CC0",
            });
          }
        } catch (e) { /* Poly Haven below */ }
      }
      try {
        const r = await fetch("https://api.polyhaven.com/assets?t=models", { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "TheSpine/1.0" } });
        const all = r.ok ? await r.json() : {};
        const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        let best = null, bestScore = 0;
        for (const id of Object.keys(all || {})) {
          const a = all[id] || {};
          const hay = ((a.name || "") + " " + (a.tags || []).join(" ") + " " + (a.categories || []).join(" ") + " " + id).toLowerCase();
          let sc = 0; words.forEach((w) => { if (hay.indexOf(w) >= 0) sc++; });
          if (sc > bestScore) { bestScore = sc; best = id; }
        }
        if (best) {
          const f = await fetch("https://api.polyhaven.com/files/" + best, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "TheSpine/1.0" } });
          const files = f.ok ? await f.json() : null;
          const g = files && (files.gltf || files.glTF);
          const res1 = g && (g["1k"] || g["2k"] || Object.values(g)[0]);
          const url = res1 && ((res1.gltf && res1.gltf.url) || (Object.values(res1)[0] && Object.values(res1)[0].url));
          if (url) return res.status(200).json({ url, name: (all[best] && all[best].name) || best, credit: "Poly Haven", licence: "CC0" });
        }
      } catch (e) { /* nothing matched */ }
      if (!key) return res.status(200).json(off("The big model library", "POLY_PIZZA_KEY"));
      return res.status(200).json({ error: "Nothing matched." });
    }

    return res.status(400).json({ error: "Unknown request." });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong." });
  }
}
