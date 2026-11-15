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
async function __liveGet(url, ttlMs, asText, extra) {
  const hit = __LIVE_CACHE.get(url);
  if (hit && hit.exp > Date.now()) return hit.v;
  const r = await fetch(url, { headers: { "User-Agent": __LIVE_UA, Accept: asText ? "*/*" : "application/json", ...(extra || {}) }, signal: AbortSignal.timeout(9000) });
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
// The person's own webhook addresses this server will post to - nothing else (batch 15 + 16).
function __hookKind(u) {
  u = String(u || "");
  if (u.length > 400 || /\.\.|%2e%2e|[\s@\\]/i.test(u)) return null;
  if (/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u)) return "discord";
  if (/^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(u)) return "slack";
  if (/^https:\/\/hook\.(?:eu1|eu2|us1|us2)\.make\.com\/[a-z0-9]{16,64}$/.test(u) || /^https:\/\/hook\.integromat\.com\/[a-z0-9]{16,64}$/.test(u)) return "make";
  if (/^https:\/\/hooks\.zapier\.com\/hooks\/catch\/\d{1,12}\/[a-z0-9]{3,20}\/?$/.test(u)) return "zapier";
  if (/^https:\/\/maker\.ifttt\.com\/trigger\/[A-Za-z0-9_-]{1,60}\/(?:json\/)?with\/key\/[A-Za-z0-9_-]{10,64}$/.test(u)) return "ifttt";
  if (/^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.app\.n8n\.cloud\/webhook(?:-test)?\/[A-Za-z0-9_-]{1,80}(?:\/[A-Za-z0-9_-]{1,80}){0,3}$/.test(u)) return "n8n";
  return null;
}
async function __where(b) { // a place from {lat,lon} or {q} (batch 16)
  const lat = __num(b && b.lat, -90, 90), lon = __num(b && b.lon, -180, 180);
  if (lat != null && lon != null) return { lat, lon, name: (b && b.q ? String(b.q).slice(0, 80) : lat.toFixed(3) + ", " + lon.toFixed(3)) };
  return b && b.q ? await __geocode(b.q) : null;
}
const __SYMBOL = (s) => String(s || "").replace(/_(day|night|polartwilight)$/, "").replace(/_/g, " ").replace("lightrain", "light rain").replace("heavyrain", "heavy rain").replace("partlycloudy", "partly cloudy").replace("clearsky", "clear sky").replace("lightsnow", "light snow").replace("heavysnow", "heavy snow").replace("andthunder", " and thunder").replace("showers", " showers").replace(/\s+/g, " ").trim();
const __km = (a, b, c, d) => { if ([a, b, c, d].some((x) => typeof x !== "number" && !(typeof x === "string" && x !== "" && isFinite(+x)))) return null; [a, b, c, d] = [a, b, c, d].map(Number); const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const __CB = { title: "CityBikes", url: "https://citybik.es" };
const __NOAA = { title: "NOAA Tides & Currents", url: "https://tidesandcurrents.noaa.gov" };
const __RX = { title: "RxNorm, US National Library of Medicine", url: "https://www.nlm.nih.gov/research/umls/rxnorm/" };
const __OPEN = new Set([
  // pictures, design, charts
  "picsum.photos", "emojihub.yurace.pro", "icon.horse", "quickchart.io", "img.shields.io",
  // places, earth, weather
  "api.opentopodata.org", "api.postcodes.io", "api-adresse.data.gouv.fr", "geo.api.gouv.fr", "viacep.com.br", "api.rainviewer.com", "data.hko.gov.hk",
  "www.7timer.info", "api.weather.gc.ca", "api.opensensemap.org", "www.refugerestrooms.org", "api.aviationapi.com",
  // transport
  "v6.db.transport.rest", "v6.vbb.transport.rest", "api.entur.io", "v0.ovapi.nl", "api.irail.be", "transport.opendata.ch", "rata.digitraffic.fi",
  // government and world bodies
  "data.police.uk", "members-api.parliament.uk", "bills-api.parliament.uk", "represent.opennorth.ca", "open.canada.ca", "data.gov.au", "catalog.data.gov",
  "data.europa.eu", "www.data.gouv.fr", "opendata.swiss", "www.govdata.de", "api.datausa.io", "api.fbi.gov", "chroniclingamerica.loc.gov",
  "api.bcb.gov.br", "dadosabertos.camara.leg.br", "servicodados.ibge.gov.br", "ghoapi.azureedge.net", "www.imf.org", "sdmx.oecd.org",
  "ec.europa.eu", "data-api.ecb.europa.eu", "api.nbp.pl", "api.nobelprize.org", "callook.info",
  // money
  "api.vatcomply.com", "mempool.space", "api.coinlore.net",
  // science and space
  "www.ebi.ac.uk", "search.idigbio.org", "tle.ivanstanojevic.me", "api.spaceflightnewsapi.net",
  // building blocks
  "www.purgomalum.com", "api.microlink.io", "rdap.org", "observatory-api.mdn.mozilla.net", "api.openbrewerydb.org",
  // games and fun (original-safe)
  "www.cheapshark.com", "www.gamerpower.com",
  // music and video
  "itunes.apple.com",
  // batch 16 (round 4)
  "api.brightsky.dev", "www.seismicportal.eu", "aa.usno.navy.mil", "api.energy-charts.info", "api.energidataservice.dk", "data.economie.gouv.fr",
  "data.sensor.community", "ssd-api.jpl.nasa.gov", "exoplanetarchive.ipac.caltech.edu", "pubchem.ncbi.nlm.nih.gov", "rest.uniprot.org",
  "search.rcsb.org", "data.rcsb.org", "dailymed.nlm.nih.gov", "wsearch.nlm.nih.gov", "doaj.org", "api.opencitations.net", "dblp.org",
  "www.ecfr.gov", "www.legislation.gov.uk", "latest.currency-api.pages.dev", "api.kraken.com", "api.coinbase.com", "api.aladhan.com",
  "www.hebcal.com", "api.openf1.org", "api.openligadb.de", "api.squiggle.com.au", "valhalla1.openstreetmap.de", "api.panoramax.xyz",
  "public.api.bsky.app", "api.listenbrainz.org", "jobicy.com",
]);
const __OPEN_HDR = { "api.entur.io": { "ET-Client-Name": "thespine-app" }, "rata.digitraffic.fi": { "Digitraffic-User": "TheSpine" }, "api.squiggle.com.au": { "User-Agent": "TheSpine/1.1 (+https://thespine.cloud; hello@thespine.cloud)" } };
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
  // ── BATCH 15: more free, keyless sources (all fine for a business; credit shown) ──
  async bikes(b) {
    let lat = __num(b.lat, -90, 90), lon = __num(b.lon, -180, 180), place = b.q ? String(b.q).slice(0, 80) : "you";
    if ((lat == null || lon == null) && b.q) { const g = await __geocode(b.q); if (!g) return null; lat = g.lat; lon = g.lon; place = g.name; }
    if (lat == null || lon == null) return null;
    const nets = await __liveGet("https://api.citybik.es/v2/networks?fields=id,name,location", 86400000);
    const near = ((nets && nets.networks) || []).map((n) => ({ n, d: __km(lat, lon, n.location && n.location.latitude, n.location && n.location.longitude) })).filter((x) => x.d != null).sort((a, c) => a.d - c.d)[0];
    if (!near || near.d > 40) return { text: "There's no bike-share network listed near " + place + ".", stations: [], source: __CB };
    const j = await __liveGet("https://api.citybik.es/v2/networks/" + __enc(near.n.id) + "?fields=stations", 120000);
    const st = ((j && j.network && j.network.stations) || []).map((x) => ({ name: x.name, bikes: x.free_bikes, docks: x.empty_slots, lat: x.latitude, lon: x.longitude, km: __km(lat, lon, x.latitude, x.longitude) })).sort((a, c) => a.km - c.km).slice(0, 6);
    return { text: near.n.name + " bike share near " + place + ":\n" + st.map((x) => x.name + " - " + x.bikes + " bikes, " + x.docks + " free docks (" + (x.km < 1 ? Math.round(x.km * 1000) + " m" : x.km.toFixed(1) + " km") + ")").join("\n"), network: near.n.name, stations: st, source: __CB };
  },
  async tides(b) {
    let lat = __num(b.lat, -90, 90), lon = __num(b.lon, -180, 180), place = b.q ? String(b.q).slice(0, 80) : "there";
    if ((lat == null || lon == null) && b.q) { const g = await __geocode(b.q); if (!g) return null; lat = g.lat; lon = g.lon; place = g.name; }
    if (lat == null || lon == null) return null;
    const S = await __liveGet("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions", 604800000);
    const near = ((S && S.stations) || []).map((x) => ({ x, d: __km(lat, lon, x.lat, x.lng) })).filter((x) => x.d != null).sort((a, c) => a.d - c.d)[0];
    if (!near || near.d > 120) return { text: "NOAA's tide predictions cover US coasts and territories, and there isn't a station near " + place + ".", tides: [], source: __NOAA };
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const j = await __liveGet("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=TheSpine&begin_date=" + day + "&range=48&datum=MLLW&station=" + __enc(near.x.id) + "&time_zone=lst_ldt&units=english&interval=hilo&format=json", 3600000);
    const t = ((j && j.predictions) || []).map((x) => ({ time: x.t, feet: Number(x.v), type: x.type === "H" ? "high" : "low" }));
    return { text: "Tides at " + near.x.name + " (local time):\n" + t.map((x) => x.time + " " + x.type + " " + x.feet.toFixed(1) + " ft").join("\n"), station: near.x.name, tides: t, source: __NOAA };
  },
  async usforecast(b) {
    let lat = __num(b.lat, -90, 90), lon = __num(b.lon, -180, 180);
    if ((lat == null || lon == null) && b.q) { const g = await __geocode(b.q); if (!g) return null; lat = g.lat; lon = g.lon; }
    if (lat == null || lon == null) return null;
    const pt = await __liveGet("https://api.weather.gov/points/" + lat.toFixed(4) + "," + lon.toFixed(4), 86400000);
    const url = pt && pt.properties && pt.properties.forecast; if (!url || !/^https:\/\/api\.weather\.gov\//.test(url)) return { text: "The US Weather Service only covers the United States.", periods: [] };
    const f = await __liveGet(url, 1800000);
    const per = ((f && f.properties && f.properties.periods) || []).slice(0, 6).map((x) => ({ name: x.name, temp: x.temperature, unit: x.temperatureUnit, short: x.shortForecast, detail: __clean(x.detailedForecast, 300) }));
    const loc = pt.properties.relativeLocation && pt.properties.relativeLocation.properties;
    return { text: "Official forecast" + (loc ? " for " + loc.city + ", " + loc.state : "") + ":\n" + per.map((x) => x.name + ": " + x.detail).join("\n"), periods: per, source: { title: "US National Weather Service", url: "https://www.weather.gov" } };
  },
  async disasters(b) {
    const st = String(b.state || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    const j = await __liveGet("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=40" + (st ? "&$filter=" + __enc("state eq '" + st + "'") : ""), 3600000);
    const seen = new Set(); const rows = [];
    for (const x of (j && j.DisasterDeclarationsSummaries) || []) { if (seen.has(x.disasterNumber)) continue; seen.add(x.disasterNumber); rows.push({ title: x.declarationTitle, type: x.incidentType, state: x.state, date: String(x.declarationDate || "").slice(0, 10), number: x.disasterNumber }); if (rows.length >= 8) break; }
    return { text: "Latest US disaster declarations" + (st ? " in " + st : "") + ":\n" + rows.map((x) => x.date + " " + x.state + " - " + x.title + " (" + x.type + ")").join("\n"), declarations: rows, source: { title: "FEMA (OpenFEMA)", url: "https://www.fema.gov/about/openfema" } };
  },
  async ukflood(b) {
    let lat = __num(b.lat, -90, 90), lon = __num(b.lon, -180, 180), place = b.q ? String(b.q).slice(0, 80) : "there";
    if ((lat == null || lon == null) && b.q) { const g = await __geocode(b.q); if (!g) return null; lat = g.lat; lon = g.lon; place = g.name; }
    const j = await __liveGet("https://environment.data.gov.uk/flood-monitoring/id/floods" + (lat != null && lon != null ? "?lat=" + lat.toFixed(4) + "&long=" + lon.toFixed(4) + "&dist=30" : ""), 600000);
    const w = ((j && j.items) || []).slice(0, 8).map((x) => ({ area: x.description || x.eaAreaName, severity: x.severity, level: x.severityLevel, raised: String(x.timeRaised || "").slice(0, 16), message: __clean(x.message, 240) }));
    return { text: w.length ? "Flood warnings" + (lat != null ? " near " + place : " in England") + ":\n" + w.map((x) => x.severity + ": " + x.area).join("\n") : "No flood warnings in force" + (lat != null ? " near " + place : " in England") + " right now.", warnings: w, source: { title: "Environment Agency flood data (Open Government Licence)", url: "https://environment.data.gov.uk/flood-monitoring/doc/reference" } };
  },
  async ukcarbon() {
    const [i, g] = await Promise.all([__liveGet("https://api.carbonintensity.org.uk/intensity", 600000), __liveGet("https://api.carbonintensity.org.uk/generation", 600000).catch(() => null)]);
    const d = i && i.data && i.data[0]; if (!d) return null; const it = d.intensity || {};
    const mix = ((g && g.data && g.data.generationmix) || []).filter((x) => x.perc > 0).sort((a, c) => c.perc - a.perc);
    return { text: "Great Britain's electricity right now: " + (it.actual || it.forecast) + " gCO2/kWh (" + it.index + ")." + (mix.length ? " Mix: " + mix.slice(0, 5).map((x) => x.fuel + " " + x.perc + "%").join(", ") + "." : ""), intensity: it.actual || it.forecast, index: it.index, mix, source: { title: "National Grid ESO Carbon Intensity API (CC BY 4.0)", url: "https://carbonintensity.org.uk" } };
  },
  async medicine(b) {
    const q = String(b.q || "").slice(0, 60).trim(); if (!q) return null;
    const j = await __liveGet("https://rxnav.nlm.nih.gov/REST/drugs.json?name=" + __enc(q), 86400000);
    const rows = []; for (const g of ((j && j.drugGroup && j.drugGroup.conceptGroup) || [])) for (const c of g.conceptProperties || []) rows.push({ name: c.name, brand: c.synonym || "", kind: c.tty });
    if (!rows.length) return { text: "No medicine called '" + q + "' was found in RxNorm.", forms: [], source: __RX };
    return { text: "'" + q + "' comes as (RxNorm, US):\n" + rows.slice(0, 12).map((x) => "- " + x.name + (x.brand ? " [" + x.brand + "]" : "")).join("\n") + "\nThis is product information, not medical advice.", forms: rows.slice(0, 40), source: __RX };
  },
  async foodhygiene(b) {
    const name = String(b.q || b.name || "").slice(0, 80), where = String(b.where || b.postcode || "").slice(0, 60); if (!name && !where) return null;
    const j = await __liveGet("https://api.ratings.food.gov.uk/Establishments?pageSize=6" + (name ? "&name=" + __enc(name) : "") + (where ? "&address=" + __enc(where) : ""), 86400000, false, { "x-api-version": "2" });
    const e = ((j && j.establishments) || []).map((x) => ({ name: x.BusinessName, rating: x.RatingValue, address: [x.AddressLine1, x.AddressLine2, x.AddressLine3, x.PostCode].filter(Boolean).join(", "), date: String(x.RatingDate || "").slice(0, 10) }));
    return { text: e.length ? "Food hygiene ratings (UK, 5 is best):\n" + e.map((x) => x.name + " - " + x.rating + " (" + x.address + ", rated " + x.date + ")").join("\n") : "No food business matched that.", places: e, source: { title: "Food Standards Agency (Open Government Licence)", url: "https://ratings.food.gov.uk" } };
  },
  async rules(b) {
    const q = String(b.q || "").slice(0, 100);
    const j = await __liveGet("https://www.federalregister.gov/api/v1/documents.json?per_page=6&order=newest" + (q ? "&conditions%5Bterm%5D=" + __enc(q) : ""), 3600000);
    const r = ((j && j.results) || []).map((x) => ({ title: x.title, type: x.type, date: x.publication_date, url: x.html_url, agency: ((x.agencies || [])[0] || {}).name || "" }));
    return { text: "Latest from the US Federal Register" + (q ? " about '" + q + "'" : "") + ":\n" + r.map((x) => x.date + " " + x.type + " - " + x.title + (x.agency ? " (" + x.agency + ")" : "")).join("\n"), documents: r, source: { title: "Federal Register", url: "https://www.federalregister.gov" } };
  },
  async company(b) {
    const q = String(b.q || "").slice(0, 80).trim().toLowerCase(); if (!q) return null;
    const ua = { "User-Agent": "TheSpine hello@thespine.cloud" };   // the SEC asks every caller to say who they are
    const T = await __liveGet("https://www.sec.gov/files/company_tickers.json", 86400000, false, ua);
    const all = Object.values(T || {}); const hit = all.find((x) => String(x.ticker).toLowerCase() === q) || all.find((x) => String(x.title).toLowerCase() === q) || all.find((x) => String(x.title).toLowerCase().includes(q));
    if (!hit) return { text: "No US-listed company matched '" + b.q + "'.", filings: [] };
    const cik = String(hit.cik_str).padStart(10, "0");
    const j = await __liveGet("https://data.sec.gov/submissions/CIK" + cik + ".json", 3600000, false, ua);
    const r = j && j.filings && j.filings.recent; const f = [];
    if (r) for (let i = 0; i < Math.min(30, (r.form || []).length) && f.length < 8; i++) if (/^(10-K|10-Q|8-K|S-1|DEF 14A|20-F|6-K)$/.test(r.form[i])) f.push({ form: r.form[i], date: r.filingDate[i], url: "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + String(r.accessionNumber[i]).replace(/-/g, "") + "/" + r.primaryDocument[i] });
    return { text: (j && j.name || hit.title) + " (" + hit.ticker + ")" + (j && j.sicDescription ? ", " + j.sicDescription : "") + ". Latest filings:\n" + f.map((x) => x.date + " " + x.form).join("\n"), name: j && j.name, ticker: hit.ticker, filings: f, source: { title: "SEC EDGAR", url: "https://www.sec.gov/edgar" } };
  },
  async lei(b) {
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const j = await __liveGet("https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=6&filter%5Bfulltext%5D=" + __enc(q), 86400000, false, { Accept: "application/vnd.api+json" });
    const r = ((j && j.data) || []).map((x) => { const e = (x.attributes && x.attributes.entity) || {}; const a = e.legalAddress || {}; return { lei: x.attributes && x.attributes.lei, name: e.legalName && e.legalName.name, city: a.city, country: a.country, status: e.status }; });
    return { text: r.length ? "Registered companies matching '" + q + "' (worldwide LEI register):\n" + r.map((x) => x.name + " - " + [x.city, x.country].filter(Boolean).join(", ") + " (" + x.status + ", LEI " + x.lei + ")").join("\n") : "No registered company matched.", companies: r, source: { title: "GLEIF Global LEI Index (CC0)", url: "https://www.gleif.org" } };
  },
  async recalls(b) {
    const make = String(b.make || "").slice(0, 40), model = String(b.model || "").slice(0, 40), year = __num(b.year, 1950, 2100);
    if (make && model && year) {
      const j = await __liveGet("https://api.nhtsa.gov/recalls/recallsByVehicle?make=" + __enc(make) + "&model=" + __enc(model) + "&modelYear=" + year, 86400000);
      const r = ((j && j.results) || []).slice(0, 8).map((x) => ({ part: x.Component, summary: __clean(x.Summary, 300), date: x.ReportReceivedDate, id: x.NHTSACampaignNumber }));
      return { text: r.length ? r.length + " recall" + (r.length === 1 ? "" : "s") + " for the " + year + " " + make + " " + model + ":\n" + r.map((x) => "- " + x.part + ": " + x.summary).join("\n") : "No recalls found for the " + year + " " + make + " " + model + ".", recalls: r, source: { title: "NHTSA", url: "https://www.nhtsa.gov/recalls" } };
    }
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallTitle=" + __enc(q), 86400000);
    const r = (Array.isArray(j) ? j : []).slice(0, 8).map((x) => ({ title: x.Title, date: String(x.RecallDate || "").slice(0, 10), hazard: ((x.Hazards || [])[0] || {}).Name || "", url: x.URL }));
    return { text: r.length ? "Product recalls matching '" + q + "':\n" + r.map((x) => x.date + " - " + x.title + (x.hazard ? " (" + __clean(x.hazard, 120) + ")" : "")).join("\n") : "No product recalls matched '" + q + "'.", recalls: r, source: { title: "US Consumer Product Safety Commission", url: "https://www.cpsc.gov/Recalls" } };
  },
  async complaints(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?size=6&sort=created_date_desc&search_term=" + __enc(q), 21600000);
    const h = ((j && j.hits && j.hits.hits) || []).map((x) => x._source || {}).map((x) => ({ company: x.company, product: x.product, issue: x.issue, date: String(x.date_received || "").slice(0, 10), state: x.state }));
    const total = j && j.hits && (j.hits.total && j.hits.total.value != null ? j.hits.total.value : j.hits.total);
    return { text: (total != null ? total.toLocaleString() + " consumer complaints mention '" + q + "'. Latest:\n" : "") + h.map((x) => x.date + " " + x.company + " - " + x.product + ": " + x.issue).join("\n"), total, complaints: h, source: { title: "CFPB Consumer Complaint Database", url: "https://www.consumerfinance.gov/data-research/consumer-complaints/" } };
  },
  async bank(b) {
    const q = String(b.q || "").slice(0, 60).replace(/["\\]/g, ""); if (!q) return null;
    const j = await __liveGet("https://banks.data.fdic.gov/api/institutions?search=" + __enc("NAME:" + q) + "&fields=NAME,CITY,STNAME,ACTIVE,CERT,ASSET&sort_by=ASSET&sort_order=DESC&limit=6", 86400000);
    const r = ((j && j.data) || []).map((x) => x.data || {}).map((x) => ({ name: x.NAME, city: x.CITY, state: x.STNAME, active: x.ACTIVE === 1, cert: x.CERT, assetsThousands: x.ASSET }));
    return { text: r.length ? "FDIC-insured banks matching '" + q + "':\n" + r.map((x) => x.name + " - " + x.city + ", " + x.state + (x.active ? " (insured, active)" : " (no longer active)")).join("\n") : "No FDIC-insured bank matched '" + q + "'.", banks: r, source: { title: "FDIC BankFind", url: "https://banks.data.fdic.gov" } };
  },
  async art(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&limit=6&q=" + __enc(q), 86400000);
    const r = ((j && j.data) || []).map((x) => ({ title: x.title, by: ((x.creators || [])[0] || {}).description || "", date: x.creation_date, image: x.images && x.images.web && x.images.web.url, url: x.url }));
    return { text: "Public-domain art at the Cleveland Museum of Art for '" + q + "':\n" + r.map((x) => x.title + (x.by ? " - " + x.by : "") + (x.date ? " (" + x.date + ")" : "")).join("\n"), works: r, source: { title: "Cleveland Museum of Art Open Access (CC0)", url: "https://www.clevelandart.org/open-access" } };
  },
  async spaceimages(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://images-api.nasa.gov/search?media_type=image&q=" + __enc(q), 86400000);
    const r = ((j && j.collection && j.collection.items) || []).slice(0, 8).map((x) => { const d = (x.data || [])[0] || {}; return { title: d.title, date: String(d.date_created || "").slice(0, 10), about: __clean(d.description, 200), image: ((x.links || [])[0] || {}).href, id: d.nasa_id }; });
    return { text: "NASA pictures for '" + q + "':\n" + r.map((x) => x.date + " " + x.title).join("\n"), images: r, source: { title: "NASA Image and Video Library", url: "https://images.nasa.gov" } };
  },
  async archive(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const [ia, loc] = await Promise.all([
      __liveGet("https://archive.org/advancedsearch.php?q=" + __enc(q) + "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=mediatype&fl%5B%5D=year&rows=5&output=json", 86400000).catch(() => null),
      __liveGet("https://www.loc.gov/search/?fo=json&c=5&q=" + __enc(q), 86400000).catch(() => null)]);
    const a = ((ia && ia.response && ia.response.docs) || []).map((x) => ({ from: "Internet Archive", title: x.title, kind: x.mediatype, year: x.year, url: "https://archive.org/details/" + x.identifier }));
    const l = ((loc && loc.results) || []).map((x) => ({ from: "Library of Congress", title: x.title, kind: (x.original_format || [])[0] || "", year: x.date, url: x.url }));
    const all = a.concat(l);
    return { text: "From the archives for '" + q + "':\n" + all.map((x) => x.from + ": " + x.title + (x.year ? " (" + x.year + ")" : "") + (x.kind ? " - " + x.kind : "")).join("\n"), items: all, source: { title: "Internet Archive + Library of Congress", url: "https://archive.org" } };
  },
  async exploited(b) {
    const q = String(b.q || "").slice(0, 60).toLowerCase();
    const j = await __liveGet("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", 21600000);
    const v = ((j && j.vulnerabilities) || []).filter((x) => !q || (x.vendorProject + " " + x.product + " " + x.vulnerabilityName).toLowerCase().includes(q)).sort((a, c) => String(c.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 8)
      .map((x) => ({ cve: x.cveID, who: x.vendorProject + " " + x.product, name: x.vulnerabilityName, added: x.dateAdded, ransomware: x.knownRansomwareCampaignUse === "Known" }));
    return { text: (q ? "Actively exploited flaws in '" + q + "'" : "Newest actively exploited flaws") + " (CISA):\n" + v.map((x) => x.added + " " + x.cve + " - " + x.who + ": " + x.name + (x.ransomware ? " [used by ransomware]" : "")).join("\n"), flaws: v, source: { title: "CISA Known Exploited Vulnerabilities (CC0)", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" } };
  },
  // ── BATCH 15 round 2: other countries ──
  async companyfr(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://recherche-entreprises.api.gouv.fr/search?per_page=5&q=" + __enc(q), 86400000);
    const r = ((j && j.results) || []).map((x) => ({ name: x.nom_complet, siren: x.siren, city: x.siege && x.siege.libelle_commune, address: x.siege && x.siege.adresse, active: x.etat_administratif === "A", since: x.date_creation }));
    return { text: r.length ? "French companies matching '" + q + "':\n" + r.map((x) => x.name + " - SIREN " + x.siren + (x.city ? ", " + x.city : "") + (x.active ? "" : " (closed)")).join("\n") : "No French company matched.", companies: r, source: { title: "Annuaire des entreprises (api.gouv.fr)", url: "https://annuaire-entreprises.data.gouv.fr" } };
  },
  async companyno(b) {
    const q = String(b.q || "").slice(0, 80); if (!q) return null;
    const j = await __liveGet("https://data.brreg.no/enhetsregisteret/api/enheter?size=5&navn=" + __enc(q), 86400000);
    const r = ((j && j._embedded && j._embedded.enheter) || []).map((x) => ({ name: x.navn, orgnr: x.organisasjonsnummer, employees: x.antallAnsatte, city: x.forretningsadresse && x.forretningsadresse.poststed, industry: x.naeringskode1 && x.naeringskode1.beskrivelse }));
    return { text: r.length ? "Norwegian companies matching '" + q + "':\n" + r.map((x) => x.name + " - org. " + x.orgnr + (x.city ? ", " + x.city : "") + (x.industry ? " (" + x.industry + ")" : "") + (x.employees != null ? ", " + x.employees + " staff" : "")).join("\n") : "No Norwegian company matched.", companies: r, source: { title: "Brønnøysund Register Centre (NLOD)", url: "https://data.brreg.no" } };
  },
  async brazil(b) {
    const cep = String(b.cep || "").replace(/\D/g, ""), cnpj = String(b.cnpj || "").replace(/\D/g, "");
    if (cep.length === 8) { const j = await __liveGet("https://brasilapi.com.br/api/cep/v2/" + cep, 604800000); return j && j.city ? { text: "CEP " + cep + ": " + [j.street, j.neighborhood, j.city, j.state].filter(Boolean).join(", ") + ".", address: j, source: { title: "BrasilAPI", url: "https://brasilapi.com.br" } } : null; }
    if (cnpj.length === 14) { const j = await __liveGet("https://brasilapi.com.br/api/cnpj/v1/" + cnpj, 86400000); return j && j.razao_social ? { text: j.razao_social + (j.nome_fantasia ? " (" + j.nome_fantasia + ")" : "") + " - " + (j.descricao_situacao_cadastral || "") + ", " + [j.municipio, j.uf].filter(Boolean).join("/") + ".", company: { name: j.razao_social, status: j.descricao_situacao_cadastral, city: j.municipio, state: j.uf, activity: j.cnae_fiscal_descricao }, source: { title: "BrasilAPI (Receita Federal)", url: "https://brasilapi.com.br" } } : null; }
    return null;
  },
  async swisstrain(b) {
    const from = String(b.from || "").slice(0, 80), to = String(b.to || "").slice(0, 80); if (!from || !to) return null;
    const j = await __liveGet("https://transport.opendata.ch/v1/connections?limit=4&from=" + __enc(from) + "&to=" + __enc(to), 120000);
    const r = ((j && j.connections) || []).map((x) => ({ leaves: x.from && x.from.departure, arrives: x.to && x.to.arrival, duration: String(x.duration || "").replace(/^00d/, "").slice(0, 5), changes: x.transfers, trains: (x.products || []).join(" ") }));
    const t = (s) => String(s || "").slice(11, 16);
    return { text: r.length ? "Swiss public transport, " + from + " to " + to + ":\n" + r.map((x) => t(x.leaves) + " -> " + t(x.arrives) + " (" + x.duration + ", " + x.changes + " change" + (x.changes === 1 ? "" : "s") + ") " + x.trains).join("\n") : "No connections found.", connections: r, source: { title: "transport.opendata.ch", url: "https://transport.opendata.ch" } };
  },
  async fitrains(b) {
    const st = String(b.station || "HKI").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "HKI";
    const j = await __liveGet("https://rata.digitraffic.fi/api/v1/live-trains/station/" + st + "?departing_trains=6&arrived_trains=0&arriving_trains=0&departed_trains=0&include_nonstopping=false", 60000, false, { "Digitraffic-User": "TheSpine" });
    const r = (Array.isArray(j) ? j : []).map((x) => { const row = (x.timeTableRows || []).find((y) => y.stationShortCode === st && y.type === "DEPARTURE") || {}; const last = (x.timeTableRows || []).slice(-1)[0] || {}; return { train: (x.trainType || "") + " " + (x.commuterLineID || x.trainNumber), to: last.stationShortCode, at: row.liveEstimateTime || row.scheduledTime, late: row.differenceInMinutes || 0, cancelled: !!x.cancelled }; }).sort((a, c) => String(a.at).localeCompare(String(c.at)));
    return { text: "Next trains from " + st + " (Finland):\n" + r.map((x) => String(x.at || "").slice(11, 16) + " UTC " + x.train + " to " + x.to + (x.cancelled ? " CANCELLED" : x.late > 0 ? " (" + x.late + " min late)" : "")).join("\n"), departures: r, source: { title: "Fintraffic / Digitraffic (CC BY 4.0)", url: "https://www.digitraffic.fi" } };
  },
  async sgweather() {
    const j = await __liveGet("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast", 600000);
    const it = j && j.data && j.data.items && j.data.items[0]; const f = (it && it.forecasts) || [];
    const by = {}; f.forEach((x) => { (by[x.forecast] = by[x.forecast] || []).push(x.area); });
    return { text: "Singapore, next two hours: " + Object.entries(by).sort((a, c) => c[1].length - a[1].length).map(([k, v]) => k + " (" + v.length + " areas)").join(", ") + ".", forecasts: f, source: { title: "Singapore NEA via data.gov.sg (Singapore Open Data Licence)", url: "https://data.gov.sg" } };
  },
  async myrates() {
    const j = await __liveGet("https://api.bnm.gov.my/public/exchange-rate", 3600000, false, { Accept: "application/vnd.BNM.API.v1+json" });
    const r = ((j && j.data) || []).map((x) => ({ currency: x.currency_code, unit: x.unit, middle: x.rate && x.rate.middle_rate })).filter((x) => x.middle);
    return { text: "Malaysian ringgit rates (Bank Negara Malaysia, middle rate): " + r.filter((x) => /USD|SGD|EUR|GBP|CNY|JPY/.test(x.currency)).map((x) => x.unit + " " + x.currency + " = RM" + x.middle).join(", ") + ".", rates: r, source: { title: "Bank Negara Malaysia", url: "https://apikijangportal.bnm.gov.my" } };
  },
  async worldstat(b) {
    const cc = String(b.country || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "WLD";
    const IND = { population: "SP.POP.TOTL", gdp: "NY.GDP.MKTP.CD", "life expectancy": "SP.DYN.LE00.IN", inflation: "FP.CPI.TOTL.ZG", unemployment: "SL.UEM.TOTL.ZS", co2: "EN.GHG.CO2.PC.CE.AR5", internet: "IT.NET.USER.ZS" };
    const k = Object.keys(IND).find((x) => String(b.measure || "population").toLowerCase().includes(x)) || "population";
    const j = await __liveGet("https://api.worldbank.org/v2/country/" + cc + "/indicator/" + IND[k] + "?format=json&mrnev=1", 86400000);
    const row = Array.isArray(j) && j[1] && j[1][0]; if (!row || row.value == null) return { text: "The World Bank has no recent figure for that.", value: null };
    return { text: (row.country && row.country.value) + " - " + (row.indicator && row.indicator.value) + ": " + Number(row.value).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " (" + row.date + ").", value: row.value, year: row.date, source: { title: "World Bank Open Data (CC BY 4.0)", url: "https://data.worldbank.org" } };
  },
  // ── BATCH 16 (round 4): more free, no-key sources the owner approved. Each one is cached, has a
  //    timeout, and says where its data came from. Checked for keys and terms on 2026-11-09.
  async dewarn(b) { // German weather warnings (DWD via Bright Sky)
    const p = await __where(b); if (!p) return null;
    const j = await __liveGet("https://api.brightsky.dev/alerts?lat=" + p.lat.toFixed(4) + "&lon=" + p.lon.toFixed(4), 600000);
    const a = ((j && j.alerts) || []).map((x) => ({ event: x.event_en || x.event_de, headline: __clean(x.headline_en || x.headline_de, 200), severity: x.severity, onset: x.onset, expires: x.expires, advice: __clean(x.instruction_en || x.instruction_de, 300) }));
    const where = (j && j.location && j.location.name) || p.name;
    return { text: a.length ? "Weather warnings for " + where + " (Germany): " + a.slice(0, 4).map((x) => x.headline + (x.severity ? " [" + x.severity + "]" : "")).join(" | ") : "No weather warnings right now for " + where + " (Germany's weather service only covers Germany).", alerts: a, place: where, source: { title: "Deutscher Wetterdienst via Bright Sky", url: "https://brightsky.dev" } };
  },
  async quakes(b) { // European-Mediterranean Seismological Centre, worldwide
    const mm = __num(b.minmag, 0, 9) ?? 2.5; let u = "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=10&orderby=time&minmag=" + mm;
    const p = (b.q || b.lat != null) ? await __where(b) : null; if (p) u += "&lat=" + p.lat.toFixed(3) + "&lon=" + p.lon.toFixed(3) + "&maxradius=" + (__num(b.radius, 0.1, 30) || 5);
    const j = await __liveGet(u, 300000);
    const q = ((j && j.features) || []).map((f) => { const x = f.properties || {}; return { mag: x.mag, place: x.flynn_region, time: x.time, depthKm: x.depth, lat: x.lat, lon: x.lon }; });
    return { text: q.length ? "Latest earthquakes" + (p ? " near " + p.name : "") + " (EMSC): " + q.slice(0, 6).map((x) => "M" + x.mag + " " + String(x.place || "").toLowerCase() + " at " + String(x.time || "").slice(0, 16).replace("T", " ") + " UTC").join("; ") : "No earthquakes of that size recently" + (p ? " near " + p.name : "") + ".", quakes: q, source: { title: "EMSC - European-Mediterranean Seismological Centre", url: "https://www.seismicportal.eu" } };
  },
  async sunmoon(b) { // US Naval Observatory: sun and moon for one day, anywhere
    const p = await __where(b); if (!p) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : new Date().toISOString().slice(0, 10);
    const tz = __num(b.tzOffset, -14, 14) ?? 0;
    const j = await __liveGet("https://aa.usno.navy.mil/api/rstt/oneday?date=" + date + "&coords=" + p.lat.toFixed(4) + "," + p.lon.toFixed(4) + "&tz=" + tz, 21600000);
    const d = j && j.properties && j.properties.data; if (!d) return null;
    const f = (L, ph) => ((L || []).find((x) => new RegExp(ph, "i").test(x.phen)) || {}).time || "-";
    return { text: "Sun and moon at " + p.name + " on " + date + " (times UTC" + (tz ? (tz > 0 ? "+" : "") + tz : "") + "): sunrise " + f(d.sundata, "^Rise") + ", sunset " + f(d.sundata, "^Set") + ", moonrise " + f(d.moondata, "^Rise") + ", moonset " + f(d.moondata, "^Set") + ". Moon: " + (d.curphase || (d.closestphase && d.closestphase.phase) || "") + (d.fracillum ? ", " + d.fracillum + " lit" : "") + ".",
      sun: d.sundata, moon: d.moondata, phase: d.curphase, lit: d.fracillum, source: { title: "US Naval Observatory", url: "https://aa.usno.navy.mil" } };
  },
  async power(b) { // live electricity mix, most of Europe
    const cc = String(b.country || "de").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 5) || "de";
    const j = await __liveGet("https://api.energy-charts.info/public_power?country=" + cc, 900000);
    const T = ((j && j.production_types) || []).filter((x) => !/load|residual|cross border|renewable share/i.test(x.name || ""));
    // the newest moment that has figures (the last few are often still empty), the same moment for every source
    let at = -1; for (const x of T) (x.data || []).forEach((y, i) => { if (y != null && i > at) at = i; });
    const L = T.map((x) => ({ name: x.name, mw: at >= 0 && x.data[at] != null ? Math.round(x.data[at]) : null })).filter((x) => x.mw != null && x.mw > 0);
    const tot = L.reduce((s, x) => s + x.mw, 0); L.sort((a, c) => c.mw - a.mw);
    return { text: tot ? "Electricity being made in " + cc.toUpperCase() + " right now: " + L.slice(0, 6).map((x) => x.name + " " + Math.round((x.mw / tot) * 100) + "%").join(", ") + "." : "No live figures for that country.", mix: L, totalMW: tot, source: { title: "Energy-Charts, Fraunhofer ISE (CC BY 4.0)", url: "https://energy-charts.info" } };
  },
  async dkpower(b) { // Danish electricity prices, day ahead
    const area = /dk2|east|copenhagen|zealand/i.test(String(b.area || "")) ? "DK2" : "DK1";
    const j = await __liveGet("https://api.energidataservice.dk/dataset/DayAheadPrices?limit=48&sort=" + __enc("TimeUTC desc") + "&filter=" + __enc(JSON.stringify({ PriceArea: [area] })), 1800000);
    const rows = ((j && j.records) || []).map((r) => { const k = Object.keys(r); const t = r[k.find((x) => /^Time.*DK$|^HourDK$/.test(x))] || r[k.find((x) => /Time|Hour/.test(x))]; const e = r[k.find((x) => /Price.*EUR/i.test(x))]; const d = r[k.find((x) => /Price.*DKK/i.test(x))]; return { time: t, eurMWh: e, dkkMWh: d }; }).filter((x) => x.time).reverse();
    const now = rows.filter((x) => String(x.time) <= new Date(Date.now() + 3600000).toISOString().slice(0, 16)).pop() || rows[0];
    return { text: now ? "Danish power price (" + area + ") around " + String(now.time).slice(0, 16).replace("T", " ") + ": " + (now.dkkMWh != null ? (Math.round(now.dkkMWh) / 1000).toFixed(2) + " kr/kWh" : "") + (now.eurMWh != null ? " (" + Math.round(now.eurMWh) + " EUR/MWh)" : "") + " before taxes and fees." : "No prices published.", prices: rows, area, source: { title: "Energi Data Service, Energinet", url: "https://www.energidataservice.dk" } };
  },
  async frfuel(b) { // French fuel prices by station
    const p = await __where(b); if (!p) return null;
    const where = "within_distance(geom, geom'POINT(" + p.lon.toFixed(4) + " " + p.lat.toFixed(4) + ")', 5km)";
    const j = await __liveGet("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=8&where=" + __enc(where), 1800000);
    const s = ((j && j.results) || []).map((x) => ({ address: [x.adresse, x.ville].filter(Boolean).join(", "), gazole: x.gazole_prix, e10: x.e10_prix, sp95: x.sp95_prix, sp98: x.sp98_prix, e85: x.e85_prix, gpl: x.gplc_prix }));
    const pr = (v) => v != null ? Number(v).toFixed(3) + " EUR" : null;
    return { text: s.length ? "Fuel prices near " + p.name + ":\n" + s.slice(0, 6).map((x) => x.address + " - " + [["Diesel", x.gazole], ["E10", x.e10], ["SP95", x.sp95], ["SP98", x.sp98]].filter((y) => y[1] != null).map((y) => y[0] + " " + pr(y[1])).join(", ")).join("\n") : "No French stations within 5 km (this only covers France).", stations: s, source: { title: "prix-carburants.gouv.fr (Licence Ouverte)", url: "https://www.prix-carburants.gouv.fr" } };
  },
  async airsensors(b) { // community air-quality sensors (PM2.5, PM10)
    const p = await __where(b); if (!p) return null;
    const j = await __liveGet("https://data.sensor.community/airrohr/v1/filter/area=" + p.lat.toFixed(3) + "," + p.lon.toFixed(3) + ",3", 600000);
    const v = { P1: [], P2: [], temperature: [], humidity: [] };
    (Array.isArray(j) ? j : []).forEach((r) => (r.sensordatavalues || []).forEach((x) => { const n = Number(x.value); if (v[x.value_type] && isFinite(n)) v[x.value_type].push(n); }));
    const med = (a) => { if (!a.length) return null; a.sort((x, y) => x - y); return Math.round(a[a.length >> 1] * 10) / 10; };
    const pm25 = med(v.P2), pm10 = med(v.P1);
    const band = pm25 == null ? "" : pm25 <= 5 ? "very clean" : pm25 <= 15 ? "fine" : pm25 <= 35 ? "moderate" : pm25 <= 55 ? "unhealthy for sensitive people" : "unhealthy";
    return { text: pm25 == null && pm10 == null ? "No community air sensors within 3 km of " + p.name + "." : "Air near " + p.name + " (" + v.P2.length + " community sensors): PM2.5 " + pm25 + " µg/m³ (" + band + "), PM10 " + pm10 + " µg/m³.", pm25, pm10, sensors: v.P2.length, source: { title: "Sensor.Community (ODbL)", url: "https://sensor.community" } };
  },
  async asteroids(b) { // NASA JPL: close approaches, or fireballs
    if (/fire/i.test(String(b.show || b.q || ""))) {
      const j = await __liveGet("https://ssd-api.jpl.nasa.gov/fireball.api?limit=6", 3600000);
      const F = (j && j.fields) || [], R = ((j && j.data) || []).map((r) => Object.fromEntries(F.map((f, i) => [f, r[i]])));
      return { text: "Latest fireballs (bright meteors) seen by US sensors: " + R.map((x) => String(x.date).slice(0, 16) + " UTC" + (x.lat ? " over " + x.lat + x["lat-dir"] + " " + x.lon + x["lon-dir"] : "") + (x.energy ? ", energy " + x.energy + "e10 J" : "")).join("; ") + ".", fireballs: R, source: { title: "NASA JPL CNEOS", url: "https://cneos.jpl.nasa.gov/fireballs/" } };
    }
    const j = await __liveGet("https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=%2B60&sort=dist&limit=8", 3600000);
    const F = (j && j.fields) || [], R = ((j && j.data) || []).map((r) => Object.fromEntries(F.map((f, i) => [f, r[i]]))).map((x) => ({ name: x.des, date: x.cd, lunar: Math.round(Number(x.dist) * 389.17 * 10) / 10, kms: Math.round(Number(x.v_rel) * 10) / 10 }));
    return { text: R.length ? "Asteroids passing closest to Earth in the next 60 days: " + R.map((x) => x.name + " on " + String(x.date).slice(0, 11) + " at " + x.lunar + " times the Moon's distance").join("; ") + "." : "No close approaches listed.", approaches: R, source: { title: "NASA JPL Small-Body Database", url: "https://ssd-api.jpl.nasa.gov" } };
  },
  async exoplanets(b) { // NASA Exoplanet Archive
    const q = String(b.q || "").replace(/[^A-Za-z0-9 .+-]/g, "").slice(0, 40).trim();
    const sql = "select top 8 pl_name,hostname,disc_year,discoverymethod,pl_rade,pl_orbper,sy_dist from ps where default_flag=1" + (q ? " and (lower(pl_name) like '%" + q.toLowerCase() + "%' or lower(hostname) like '%" + q.toLowerCase() + "%')" : "") + " order by disc_year desc";
    const j = await __liveGet("https://exoplanetarchive.ipac.caltech.edu/TAP/sync?format=json&query=" + __enc(sql), 86400000);
    const R = (Array.isArray(j) ? j : []).map((x) => ({ name: x.pl_name, star: x.hostname, year: x.disc_year, method: x.discoverymethod, earthRadii: x.pl_rade, orbitDays: x.pl_orbper, lightYears: x.sy_dist != null ? Math.round(x.sy_dist * 3.2616) : null }));
    return { text: R.length ? (q ? "Exoplanets matching " + q : "Recently found exoplanets") + ": " + R.map((x) => x.name + " (" + x.year + (x.earthRadii ? ", " + Math.round(x.earthRadii * 10) / 10 + "x Earth's size" : "") + (x.lightYears ? ", " + x.lightYears + " light years away" : "") + ")").join("; ") + "." : "No planets matched.", planets: R, source: { title: "NASA Exoplanet Archive", url: "https://exoplanetarchive.ipac.caltech.edu" } };
  },
  async chemical(b) { // PubChem
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const j = await __liveGet("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" + __enc(q) + "/property/Title,MolecularFormula,MolecularWeight,IUPACName,SMILES,XLogP/JSON", 604800000);
    const c = j && j.PropertyTable && j.PropertyTable.Properties && j.PropertyTable.Properties[0]; if (!c) return null;
    return { text: (c.Title || q) + ": formula " + c.MolecularFormula + ", molecular weight " + c.MolecularWeight + " g/mol" + (c.IUPACName ? ", IUPAC name " + c.IUPACName : "") + ".", cid: c.CID, formula: c.MolecularFormula, weight: c.MolecularWeight, smiles: c.SMILES || c.IsomericSMILES || c.CanonicalSMILES, image: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/" + c.CID + "/PNG", url: "https://pubchem.ncbi.nlm.nih.gov/compound/" + c.CID, source: { title: "PubChem, US National Library of Medicine", url: "https://pubchem.ncbi.nlm.nih.gov" } };
  },
  async protein(b) { // UniProt
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const j = await __liveGet("https://rest.uniprot.org/uniprotkb/search?format=json&size=5&fields=accession,protein_name,organism_name,gene_names,length&query=" + __enc("(" + q + ") AND (reviewed:true)"), 604800000);
    const R = ((j && j.results) || []).map((x) => ({ id: x.primaryAccession, name: (((x.proteinDescription || {}).recommendedName || {}).fullName || {}).value, organism: (x.organism || {}).scientificName, gene: ((x.genes || [])[0] || {}).geneName ? x.genes[0].geneName.value : null, length: (x.sequence || {}).length, url: "https://www.uniprot.org/uniprotkb/" + x.primaryAccession }));
    return { text: R.length ? "Proteins (UniProt, reviewed): " + R.map((x) => x.name + (x.gene ? " (" + x.gene + ")" : "") + " - " + x.organism + ", " + x.length + " amino acids [" + x.id + "]").join("; ") + "." : "No reviewed proteins matched.", proteins: R, source: { title: "UniProt (CC BY 4.0)", url: "https://www.uniprot.org" } };
  },
  async pdb(b) { // RCSB Protein Data Bank: 3D molecule structures
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const s = await __liveGet("https://search.rcsb.org/rcsbsearch/v2/query?json=" + __enc(JSON.stringify({ query: { type: "terminal", service: "full_text", parameters: { value: q } }, return_type: "entry", request_options: { paginate: { start: 0, rows: 3 } } })), 604800000);
    const ids = ((s && s.result_set) || []).map((x) => x.identifier).filter((x) => /^[0-9A-Z]{4}$/i.test(x));
    const R = [];
    for (const id of ids) { try { const e = await __liveGet("https://data.rcsb.org/rest/v1/core/entry/" + id, 604800000); R.push({ id, title: e && e.struct && e.struct.title, method: e && e.exptl && e.exptl[0] && e.exptl[0].method, model: "https://files.rcsb.org/download/" + id + ".cif", view: "https://www.rcsb.org/3d-view/" + id }); } catch (er) { R.push({ id }); } }
    return { text: R.length ? "3D structures (Protein Data Bank): " + R.map((x) => x.id + (x.title ? " - " + x.title : "")).join("; ") + "." : "No structures matched.", structures: R, source: { title: "RCSB Protein Data Bank (CC0)", url: "https://www.rcsb.org" } };
  },
  async druglabel(b) { // DailyMed: official US drug labels
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const j = await __liveGet("https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?pagesize=5&drug_name=" + __enc(q), 86400000);
    const R = ((j && j.data) || []).map((x) => ({ title: __clean(x.title, 200), published: x.published_date, url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=" + x.setid }));
    return { text: R.length ? "Official drug labels (DailyMed): " + R.map((x) => x.title).join("; ") + ". This is not medical advice - ask a pharmacist or doctor." : "No labels found.", labels: R, source: { title: "DailyMed, US National Library of Medicine", url: "https://dailymed.nlm.nih.gov" } };
  },
  async health(b) { // MedlinePlus health topics in plain words
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    const x = await __liveGet("https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&retmax=3&term=" + __enc(q), 86400000, true);
    const docs = String(x || "").split(/<document /).slice(1).map((d) => { const g = (n) => { const m = d.match(new RegExp('<content name="' + n + '">([\\s\\S]*?)</content>')); return m ? __clean(m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), 900) : ""; }; return { title: g("title"), summary: g("FullSummary") || g("snippet"), url: (d.match(/url="([^"]+)"/) || [])[1] }; }).filter((d) => d.title);
    return { text: docs.length ? docs[0].title + ": " + docs[0].summary.slice(0, 700) + " (MedlinePlus - not medical advice.)" : "MedlinePlus has no topic for that.", topics: docs, source: { title: "MedlinePlus, US National Library of Medicine", url: "https://medlineplus.gov" } };
  },
  async journals(b) { // DOAJ: open-access articles
    const q = String(b.q || "").slice(0, 100).trim(); if (!q) return null;
    const j = await __liveGet("https://doaj.org/api/search/articles/" + __enc(q) + "?pageSize=5", 86400000);
    const R = ((j && j.results) || []).map((x) => { const bj = x.bibjson || {}; return { title: bj.title, journal: bj.journal && bj.journal.title, year: bj.year, url: ((bj.link || []).find((l) => l.url) || {}).url }; });
    return { text: R.length ? "Free-to-read research (DOAJ): " + R.map((x) => x.title + " - " + x.journal + " (" + x.year + ")").join("; ") + "." : "No open-access articles matched.", articles: R, source: { title: "Directory of Open Access Journals", url: "https://doaj.org" } };
  },
  async citations(b) { // OpenCitations: how often a paper is cited
    const doi = String(b.doi || b.q || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().slice(0, 200); if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return { error: "That needs a DOI like 10.1038/nature12373." };
    const c = await __liveGet("https://api.opencitations.net/index/v2/citation-count/doi:" + __enc(doi), 86400000);
    const r = await __liveGet("https://api.opencitations.net/index/v2/reference-count/doi:" + __enc(doi), 86400000);
    const n = Number(c && c[0] && c[0].count), m = Number(r && r[0] && r[0].count);
    return { text: "DOI " + doi + " is cited by " + (isFinite(n) ? n : "an unknown number of") + " works and cites " + (isFinite(m) ? m : "an unknown number of") + " (OpenCitations).", cited: isFinite(n) ? n : null, cites: isFinite(m) ? m : null, source: { title: "OpenCitations (CC0)", url: "https://opencitations.net" } };
  },
  async papers(b) { // DBLP: computer-science papers
    const q = String(b.q || "").slice(0, 100).trim(); if (!q) return null;
    const j = await __liveGet("https://dblp.org/search/publ/api?format=json&h=6&q=" + __enc(q), 86400000);
    const H = (((j || {}).result || {}).hits || {}).hit || [];
    const R = H.map((h) => { const i = h.info || {}; const a = i.authors && i.authors.author; return { title: __clean(i.title, 250), venue: i.venue, year: i.year, authors: (Array.isArray(a) ? a : a ? [a] : []).map((x) => x.text).slice(0, 4), url: i.ee || i.url }; });
    return { text: R.length ? "Computer-science papers (dblp): " + R.map((x) => x.title + " - " + x.authors.join(", ") + " (" + x.venue + " " + x.year + ")").join("; ") : "No papers matched.", papers: R, source: { title: "dblp (CC0)", url: "https://dblp.org" } };
  },
  async usregs(b) { // eCFR: US federal regulations in force
    const q = String(b.q || "").slice(0, 100).trim(); if (!q) return null;
    const j = await __liveGet("https://www.ecfr.gov/api/search/v1/results?per_page=5&query=" + __enc(q), 86400000);
    const R = ((j && j.results) || []).map((x) => { const h = x.headings || {}, hh = x.hierarchy || {}; return { where: "Title " + hh.title + (hh.part ? ", Part " + hh.part : "") + (hh.section ? ", Section " + hh.section : ""), heading: __clean(h.section || h.part || "", 200), excerpt: __clean(x.full_text_excerpt, 300), url: "https://www.ecfr.gov/current/title-" + hh.title + (hh.section ? "/section-" + hh.section : hh.part ? "/part-" + hh.part : "") }; });
    return { text: R.length ? "US regulations in force (eCFR): " + R.map((x) => x.where + " - " + x.heading).join("; ") + "." : "No regulations matched.", rules: R, source: { title: "Electronic Code of Federal Regulations", url: "https://www.ecfr.gov" } };
  },
  async uklaw(b) { // legislation.gov.uk
    const q = String(b.q || "").slice(0, 100).trim(); if (!q) return null;
    const x = await __liveGet("https://www.legislation.gov.uk/search/data.feed?results-count=6&text=" + __enc(q), 86400000, true);
    const R = String(x || "").split(/<entry>/).slice(1).map((e) => ({ title: __clean((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1], 200), url: (e.match(/<link[^>]*rel="self"[^>]*href="([^"]+)"/) || e.match(/<id>([^<]+)<\/id>/) || [])[1], year: (e.match(/<ukm:Year Value="(\d+)"/) || [])[1] })).filter((r) => r.title);
    return { text: R.length ? "UK laws (legislation.gov.uk): " + R.map((r) => r.title + (r.year ? " (" + r.year + ")" : "")).join("; ") + "." : "No UK laws matched.", laws: R, source: { title: "legislation.gov.uk (Open Government Licence)", url: "https://www.legislation.gov.uk" } };
  },
  async currency(b) { // 150+ currencies including crypto and metals, daily
    const base = String(b.base || "usd").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "usd";
    const to = String(b.to || "eur,gbp,jpy").toLowerCase().split(/[\s,]+/).map((x) => x.replace(/[^a-z0-9]/g, "")).filter(Boolean).slice(0, 12);
    let j; try { j = await __liveGet("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/" + base + ".json", 3600000); } catch (e) { j = await __liveGet("https://latest.currency-api.pages.dev/v1/currencies/" + base + ".json", 3600000); }
    const r = j && j[base]; if (!r) return null;
    const rates = Object.fromEntries(to.filter((k) => r[k] != null).map((k) => [k, r[k]]));
    return { text: "1 " + base.toUpperCase() + " = " + Object.entries(rates).map(([k, v]) => (Math.round(v * 10000) / 10000) + " " + k.toUpperCase()).join(", ") + " (" + j.date + ").", base, date: j.date, rates, source: { title: "fawazahmed0 currency-api (CC0)", url: "https://github.com/fawazahmed0/exchange-api" } };
  },
  async crypto(b) { // live prices from two exchanges' public feeds
    const coin = String(b.coin || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "BTC", cur = String(b.in || "USD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "USD";
    let cb = null, kr = null;
    try { const j = await __liveGet("https://api.coinbase.com/v2/prices/" + coin + "-" + cur + "/spot", 60000); cb = j && j.data && Number(j.data.amount); } catch (e) { /* one is enough */ }
    try { const kc = coin === "BTC" ? "XBT" : coin; const j = await __liveGet("https://api.kraken.com/0/public/Ticker?pair=" + kc + cur, 60000); const k = j && j.result && Object.values(j.result)[0]; kr = k && k.c ? Number(k.c[0]) : null; } catch (e) { /* one is enough */ }
    if (!cb && !kr) return null;
    return { text: coin + " is " + [cb ? cur + " " + cb.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " on Coinbase" : "", kr ? cur + " " + kr.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " on Kraken" : ""].filter(Boolean).join(" and ") + " right now. Prices move fast - not financial advice.", coinbase: cb, kraken: kr, source: { title: "Coinbase and Kraken public price feeds", url: "https://www.coinbase.com" } };
  },
  async prayer(b) { // Aladhan: prayer times anywhere
    const p = await __where(b); if (!p) return null;
    const method = __num(b.method, 0, 23); const d = new Date(); const ds = String(d.getUTCDate()).padStart(2, "0") + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + d.getUTCFullYear();
    const j = await __liveGet("https://api.aladhan.com/v1/timings/" + ds + "?latitude=" + p.lat.toFixed(4) + "&longitude=" + p.lon.toFixed(4) + (method != null ? "&method=" + method : ""), 3600000);
    const t = j && j.data && j.data.timings; if (!t) return null;
    const hd = j.data.date && j.data.date.hijri;
    return { text: "Prayer times today for " + p.name + ": Fajr " + t.Fajr + ", Sunrise " + t.Sunrise + ", Dhuhr " + t.Dhuhr + ", Asr " + t.Asr + ", Maghrib " + t.Maghrib + ", Isha " + t.Isha + " (local time)." + (hd ? " Hijri date: " + hd.day + " " + (hd.month && hd.month.en) + " " + hd.year + "." : ""), timings: t, hijri: hd, source: { title: "Aladhan", url: "https://aladhan.com" } };
  },
  async jewish(b) { // Hebcal: Shabbat and holiday times, and the Hebrew date
    const p = await __where(b); if (!p) return null;
    const tz = /^[A-Za-z]+\/[A-Za-z_\/+-]+$|^UTC$/.test(String(b.tz || "")) ? String(b.tz) : "UTC";
    const j = await __liveGet("https://www.hebcal.com/shabbat?cfg=json&M=on&latitude=" + p.lat.toFixed(4) + "&longitude=" + p.lon.toFixed(4) + "&tzid=" + __enc(tz), 3600000);
    const it = (j && j.items) || []; const c = it.find((x) => x.category === "candles"), h = it.find((x) => x.category === "havdalah"), r = it.find((x) => x.category === "parashat");
    let heb = ""; try { const k = await __liveGet("https://www.hebcal.com/converter?cfg=json&g2h=1&date=" + new Date().toISOString().slice(0, 10), 3600000); heb = k && k.hebrew ? " Today is " + k.hebrew + "." : ""; } catch (e) { /* optional */ }
    return { text: "Shabbat in " + p.name + ": " + [c && c.title, h && h.title, r && r.title].filter(Boolean).join("; ") + " (times in " + tz + ")." + heb, items: it, source: { title: "Hebcal (CC BY 4.0)", url: "https://www.hebcal.com" } };
  },
  async f1history(b) { // OpenF1: past race results (live timing is paid, so past only)
    const yr = __num(b.year, 2023, 2100) || new Date().getUTCFullYear(); const where = String(b.q || "").replace(/[^A-Za-z .'-]/g, "").slice(0, 40).trim();
    const S = await __liveGet("https://api.openf1.org/v1/sessions?session_name=Race&year=" + yr + (where ? "&country_name=" + __enc(where) : ""), 3600000);
    const past = (Array.isArray(S) ? S : []).filter((s) => String(s.date_end || s.date_start) < new Date().toISOString()); const s = past[past.length - 1]; if (!s) return { text: "No finished race found for that.", results: [] };
    const res = await __liveGet("https://api.openf1.org/v1/session_result?session_key=" + s.session_key, 86400000);
    const drv = await __liveGet("https://api.openf1.org/v1/drivers?session_key=" + s.session_key, 86400000);
    const nm = {}; (Array.isArray(drv) ? drv : []).forEach((d) => { nm[d.driver_number] = { name: d.full_name || d.broadcast_name, team: d.team_name, colour: d.team_colour }; });
    const R = (Array.isArray(res) ? res : []).filter((x) => x.position).sort((a, c) => a.position - c.position).slice(0, 10).map((x) => ({ position: x.position, ...(nm[x.driver_number] || { name: "#" + x.driver_number }) }));
    return { text: "Formula 1, " + (s.country_name || s.location) + " " + yr + " race: " + R.map((x) => x.position + ". " + x.name + (x.team ? " (" + x.team + ")" : "")).join(", ") + ".", race: { country: s.country_name, circuit: s.circuit_short_name, date: s.date_start }, results: R, source: { title: "OpenF1 (unofficial, not associated with Formula 1)", url: "https://openf1.org" } };
  },
  async germanfootball(b) { // OpenLigaDB: Bundesliga
    const lg = /2|zwei|second/i.test(String(b.league || "")) ? "bl2" : "bl1"; const d = new Date(); const season = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    if (/table|stand/i.test(String(b.show || b.q || ""))) {
      const t = await __liveGet("https://api.openligadb.de/getbltable/" + lg + "/" + season, 1800000);
      const R = (Array.isArray(t) ? t : []).map((x, i) => ({ pos: i + 1, team: x.teamName, points: x.points, played: x.matches, goalDiff: x.goalDiff }));
      return { text: (lg === "bl1" ? "Bundesliga" : "2. Bundesliga") + " table: " + R.slice(0, 10).map((x) => x.pos + ". " + x.team + " " + x.points + " pts").join(", ") + ".", table: R, source: { title: "OpenLigaDB", url: "https://www.openligadb.de" } };
    }
    const m = await __liveGet("https://api.openligadb.de/getmatchdata/" + lg, 300000);
    const R = (Array.isArray(m) ? m : []).map((x) => { const fin = (x.matchResults || []).find((r) => r.resultTypeID === 2) || (x.matchResults || []).slice(-1)[0]; return { home: x.team1 && x.team1.teamName, away: x.team2 && x.team2.teamName, kickoff: x.matchDateTimeUTC, done: x.matchIsFinished, score: fin ? fin.pointsTeam1 + "-" + fin.pointsTeam2 : null }; });
    return { text: (lg === "bl1" ? "Bundesliga" : "2. Bundesliga") + " this matchday: " + R.map((x) => x.home + " " + (x.score != null ? x.score : "v") + " " + x.away + (x.done ? "" : x.score != null ? " (live)" : " - " + String(x.kickoff || "").slice(0, 16).replace("T", " ") + " UTC")).join("; ") + ".", matches: R, source: { title: "OpenLigaDB", url: "https://www.openligadb.de" } };
  },
  async afl(b) { // Squiggle: Australian football
    const yr = new Date().getUTCFullYear(); const H = { "User-Agent": "TheSpine/1.1 (+https://thespine.cloud; hello@thespine.cloud)" };
    if (/ladder|table|stand/i.test(String(b.show || b.q || ""))) {
      const j = await __liveGet("https://api.squiggle.com.au/?q=standings;year=" + yr, 1800000, false, H);
      const R = ((j && j.standings) || []).sort((a, c) => a.rank - c.rank).map((x) => ({ rank: x.rank, team: x.name, points: x.pts, percentage: Math.round(x.percentage * 10) / 10 }));
      return { text: "AFL ladder " + yr + ": " + R.slice(0, 10).map((x) => x.rank + ". " + x.team + " " + x.points).join(", ") + ".", ladder: R, source: { title: "Squiggle", url: "https://squiggle.com.au" } };
    }
    const j = await __liveGet("https://api.squiggle.com.au/?q=games;year=" + yr, 600000, false, H);
    const G = ((j && j.games) || []).filter((g) => g.complete === 100).sort((a, c) => String(c.date).localeCompare(String(a.date))).slice(0, 6).map((g) => ({ home: g.hteam, away: g.ateam, score: g.hscore + "-" + g.ascore, winner: g.winner, date: g.date }));
    return { text: G.length ? "Latest AFL results: " + G.map((g) => g.home + " " + g.score + " " + g.away).join("; ") + "." : "No AFL results yet this year.", games: G, source: { title: "Squiggle", url: "https://squiggle.com.au" } };
  },
  async route(b) { // Valhalla on the OpenStreetMap community servers: walking, cycling, driving
    const a = await __where({ q: b.from, lat: b.fromLat, lon: b.fromLon }), z = await __where({ q: b.to, lat: b.toLat, lon: b.toLon }); if (!a || !z) return { error: "Couldn't find one of those places." };
    const costing = /walk|foot|pedestrian/i.test(String(b.mode || "")) ? "pedestrian" : /bike|cycl/i.test(String(b.mode || "")) ? "bicycle" : "auto";
    const j = await __liveGet("https://valhalla1.openstreetmap.de/route?json=" + __enc(JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: z.lat, lon: z.lon }], costing, units: "kilometers", directions_options: { units: "kilometers" } })), 3600000);
    const tr = j && j.trip; if (!tr) return null; const sm = tr.summary || {};
    const steps = ((tr.legs && tr.legs[0] && tr.legs[0].maneuvers) || []).map((m) => m.instruction).slice(0, 30);
    return { text: ({ pedestrian: "Walking", bicycle: "Cycling", auto: "Driving" }[costing]) + " from " + (b.from ? String(b.from).slice(0, 60) : a.name) + " to " + (b.to ? String(b.to).slice(0, 60) : z.name) + ": " + (Math.round(sm.length * 10) / 10) + " km, about " + Math.round(sm.time / 60) + " min.", km: sm.length, minutes: Math.round(sm.time / 60), steps, shape: tr.legs && tr.legs[0] && tr.legs[0].shape, source: { title: "Valhalla on FOSSGIS servers, data OpenStreetMap", url: "https://www.openstreetmap.org/copyright" } };
  },
  async reach(b) { // everywhere within N minutes (an isochrone, as GeoJSON to draw on a map)
    const p = await __where(b); if (!p) return null;
    const mins = Math.round(__num(b.minutes, 1, 60) || 15); const costing = /bike|cycl/i.test(String(b.mode || "")) ? "bicycle" : /drive|car|auto/i.test(String(b.mode || "")) ? "auto" : "pedestrian";
    const j = await __liveGet("https://valhalla1.openstreetmap.de/isochrone?json=" + __enc(JSON.stringify({ locations: [{ lat: p.lat, lon: p.lon }], costing, contours: [{ time: mins }], polygons: true })), 3600000);
    if (!j || !j.features) return null;
    return { text: "The area you can reach from " + p.name + " in " + mins + " minutes " + ({ pedestrian: "on foot", bicycle: "by bike", auto: "by car" }[costing]) + " is ready to draw on a map.", geojson: j, center: { lat: p.lat, lon: p.lon }, source: { title: "Valhalla on FOSSGIS servers, data OpenStreetMap", url: "https://www.openstreetmap.org/copyright" } };
  },
  async streetphotos(b) { // Panoramax: open street-level photos
    const p = await __where(b); if (!p) return null; const d = 0.003;
    const j = await __liveGet("https://api.panoramax.xyz/api/search?limit=6&bbox=" + [p.lon - d, p.lat - d, p.lon + d, p.lat + d].map((x) => x.toFixed(5)).join(","), 3600000);
    const R = ((j && j.features) || []).map((f) => { const a = f.assets || {}; return { thumb: a.thumb && a.thumb.href, photo: (a.sd || a.hd || {}).href, taken: f.properties && f.properties.datetime, by: f.providers && f.providers[0] && f.providers[0].name, licence: f.properties && f.properties.license }; }).filter((x) => x.thumb || x.photo);
    return { text: R.length ? R.length + " open street-level photos near " + p.name + " (Panoramax)." : "No open street-level photos near " + p.name + " yet.", photos: R, source: { title: "Panoramax (open licences - credit the photographer)", url: "https://panoramax.fr" } };
  },
  async bluesky(b) { // public Bluesky posts and profiles (read only)
    const h = String(b.handle || "").replace(/^@/, "").replace(/[^A-Za-z0-9.:-]/g, "").slice(0, 100);
    const B = "https://public.api.bsky.app/xrpc/";
    const post = (p) => ({ by: p.author && (p.author.displayName || p.author.handle), handle: p.author && p.author.handle, text: __clean(p.record && p.record.text, 300), at: p.record && p.record.createdAt, likes: p.likeCount, url: p.author && p.uri ? "https://bsky.app/profile/" + p.author.handle + "/post/" + String(p.uri).split("/").pop() : null });
    if (h) {
      const pr = await __liveGet(B + "app.bsky.actor.getProfile?actor=" + __enc(h), 600000);
      const f = await __liveGet(B + "app.bsky.feed.getAuthorFeed?limit=6&filter=posts_no_replies&actor=" + __enc(h), 300000);
      const P = ((f && f.feed) || []).map((x) => post(x.post || {}));
      return { text: (pr.displayName || pr.handle) + " (@" + pr.handle + ") on Bluesky - " + (pr.followersCount || 0) + " followers. Latest: " + P.slice(0, 3).map((x) => "“" + x.text + "”").join(" "), profile: { name: pr.displayName, handle: pr.handle, bio: __clean(pr.description, 300), followers: pr.followersCount, avatar: pr.avatar }, posts: P, source: { title: "Bluesky public data", url: "https://bsky.app" } };
    }
    const q = String(b.q || "").slice(0, 80).trim(); if (!q) return null;
    let j; try { j = await __liveGet(B + "app.bsky.feed.searchPosts?limit=8&q=" + __enc(q), 300000); } catch (e) { return { error: "Bluesky's public search is busy - try a person's handle instead." }; }
    const P = ((j && j.posts) || []).map(post);
    return { text: P.length ? "Public Bluesky posts about " + q + ": " + P.slice(0, 4).map((x) => "@" + x.handle + ": “" + x.text + "”").join(" ") : "No public posts found.", posts: P, source: { title: "Bluesky public data", url: "https://bsky.app" } };
  },
  async listening(b) { // ListenBrainz: what people (or one person) listen to
    const u = String(b.user || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60); const range = /month/i.test(String(b.range || "")) ? "month" : /year/i.test(String(b.range || "")) ? "year" : "week";
    const j = await __liveGet("https://api.listenbrainz.org/1/stats/" + (u ? "user/" + u : "sitewide") + "/artists?count=10&range=" + range, 3600000);
    const A = ((j && j.payload && j.payload.artists) || []).map((x) => ({ artist: x.artist_name, plays: x.listen_count }));
    return { text: A.length ? "Most played artists this " + range + (u ? " for " + u : " on ListenBrainz") + ": " + A.map((x) => x.artist + " (" + x.plays + ")").join(", ") + "." : "No listening stats for that yet.", artists: A, source: { title: "ListenBrainz, MetaBrainz (CC0)", url: "https://listenbrainz.org" } };
  },
  async jobs(b) { // Jobicy: remote jobs (cached an hour, as they ask)
    const tag = String(b.q || "").replace(/[^A-Za-z0-9 +#.-]/g, "").slice(0, 50).trim(); const geo = String(b.geo || "").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 30);
    const j = await __liveGet("https://jobicy.com/api/v2/remote-jobs?count=10" + (tag.length >= 3 ? "&tag=" + __enc(tag) : "") + (geo ? "&geo=" + geo : ""), 3600000);
    const R = ((j && j.jobs) || []).map((x) => ({ title: __clean(x.jobTitle, 150), company: x.companyName, where: x.jobGeo, type: Array.isArray(x.jobType) ? x.jobType.join(", ") : x.jobType, salary: x.salaryMin ? x.salaryMin + (x.salaryMax ? "-" + x.salaryMax : "") + " " + (x.salaryCurrency || "") + (x.salaryPeriod ? "/" + x.salaryPeriod : "") : null, posted: x.pubDate, url: x.url }));
    return { text: R.length ? "Remote jobs (from Jobicy): " + R.slice(0, 6).map((x) => x.title + " at " + x.company + " (" + x.where + ")").join("; ") + "." : "No remote jobs matched.", jobs: R, source: { title: "Jobicy - always link each job back to Jobicy", url: "https://jobicy.com" } };
  },
  // ── BATCH 16 round 5: "Is it them or us?" - Supabase (the database host) and Vercel (the web
  //    host) status pages, plus a quick knock on The Spine's own database. Cached for a minute.
  async status() {
    const hit = __LIVE_CACHE.get("status:all"); if (hit && hit.exp > Date.now()) return hit.v;
    const one = async (name, bases) => {
      for (const base of bases) {
        // Atlassian Statuspage format
        try { const j = await __liveGet(base + "/api/v2/summary.json", 60000);
          if (j && j.status) { const ind = j.status.indicator; const inc = (j.incidents || []).filter((x) => x.status !== "resolved").map((x) => __clean(x.name, 160));
            const bad = (j.components || []).filter((c) => c.status && c.status !== "operational" && !c.group).map((c) => c.name + " (" + String(c.status).replace(/_/g, " ") + ")");
            return { name, level: ind === "none" ? "green" : ind === "minor" || ind === "maintenance" ? "amber" : "red", words: j.status.description, incidents: inc, affected: bad.slice(0, 8), url: base }; } } catch (e) { /* next format */ }
        // incident.io widget format
        try { const j = await __liveGet(base + "/api/v1/summary", 60000);
          if (j && Array.isArray(j.ongoing_incidents)) { const inc = j.ongoing_incidents; const worst = inc.map((x) => x.current_worst_impact).sort((a, c) => ["operational", "degraded_performance", "partial_outage", "full_outage"].indexOf(c) - ["operational", "degraded_performance", "partial_outage", "full_outage"].indexOf(a))[0];
            const maint = j.in_progress_maintenances || [];
            return { name, level: !inc.length ? (maint.length ? "amber" : "green") : worst === "full_outage" || worst === "partial_outage" ? "red" : "amber", words: !inc.length ? (maint.length ? "Maintenance in progress" : "All systems operational") : inc.length + " incident" + (inc.length === 1 ? "" : "s") + " being worked on",
              incidents: inc.map((x) => __clean(x.name, 160)), affected: [...new Set(inc.flatMap((x) => (x.affected_components || []).map((c) => c.name)))].slice(0, 8), maintenance: maint.map((x) => __clean(x.name, 160)), url: base }; } } catch (e) { /* next format */ }
        // RSS / Atom feed: the newest entry, and whether it says resolved
        try { const x = await __liveGet(base + "/feed.rss", 60000, true); const item = String(x || "").split(/<item>|<entry>/)[1] || "";
          if (item) { const t = __clean((item.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1], 160).replace(/^<!\[CDATA\[|\]\]>$/g, ""); const d = (item.match(/<(?:pubDate|updated)>([^<]+)</) || [])[1];
            const recent = d && Date.now() - new Date(d).getTime() < 6 * 3600000; const resolved = /resolved|completed|operational/i.test(item);
            return { name, level: recent && !resolved ? "amber" : "green", words: recent && !resolved ? "Something was reported recently" : "No current problems reported", incidents: recent && !resolved ? [t] : [], affected: [], url: base }; } } catch (e) { /* none worked */ }
      }
      return { name, level: "unknown", words: "Their status page didn't answer", incidents: [], affected: [], url: bases[0] };
    };
    const [sb, vc] = await Promise.all([one("Supabase (your database host)", ["https://status.supabase.com"]), one("Vercel (your web host)", ["https://www.vercel-status.com"])]);
    let us = { name: "The Spine's own database", level: "unknown", words: "Not checked (not set up here)" };
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) { const t0 = Date.now(); try { const hdr = /^eyJ/.test(key) ? { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } : { apikey: key, "Content-Type": "application/json" };
        const r = await fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/spine_whoami", { method: "POST", headers: hdr, body: JSON.stringify({ p_token: "" }), signal: AbortSignal.timeout(6000) });
        const ms = Date.now() - t0; us = { name: us.name, level: r.ok ? (ms > 2500 ? "amber" : "green") : "red", words: r.ok ? "Answered in " + ms + " ms" + (ms > 2500 ? " (slow)" : "") : "Didn't answer properly (" + r.status + ")", ms };
      } catch (e) { us = { name: us.name, level: "red", words: "Didn't answer at all" }; } }
    const all = [sb, vc, us]; const red = all.filter((x) => x.level === "red"), amber = all.filter((x) => x.level === "amber");
    const verdict = red.length ? (us.level === "red" && sb.level !== "red" ? "It's us: The Spine's database isn't answering, but Supabase says it's fine - check the Supabase dashboard (a paused project or a full database)." : "It's them: " + red.map((x) => x.name.split(" (")[0]).join(" and ") + " " + (red.length > 1 ? "are" : "is") + " having trouble. Nothing to fix on our side - it should come back by itself.")
      : amber.length ? "Mostly fine: " + amber.map((x) => x.name.split(" (")[0] + " - " + x.words).join("; ") + "." : all.some((x) => x.level === "unknown") ? "No known problems (one check couldn't be read)." : "All clear - Supabase, Vercel and The Spine's database are all fine.";
    const out = { text: verdict, verdict, level: red.length ? "red" : amber.length ? "amber" : "green", checks: all, source: { title: "status.supabase.com, vercel-status.com", url: "https://status.supabase.com" } };
    __LIVE_CACHE.set("status:all", { v: out, exp: Date.now() + 60000 }); return out;
  },
  // Security grade for The Spine's own address from Mozilla's HTTP Observatory. Owner only; once an hour.
  async secgrade(b) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { error: "Not set up here." };
    const hdr = /^eyJ/.test(key) ? { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } : { apikey: key, "Content-Type": "application/json" };
    let admin = false; try { const tok = String(b.token || ""); if (/^[0-9a-f]{64}$/.test(tok)) { const r = await fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/spine_is_admin", { method: "POST", headers: hdr, body: JSON.stringify({ p_token: tok }), signal: AbortSignal.timeout(6000) }); admin = r.ok && (await r.json()) === true; } } catch (e) { admin = false; }
    if (!admin) return { error: "Owner only." };
    const host = String(process.env.SPINE_HOST || "thespine.cloud").toLowerCase().replace(/[^a-z0-9.-]/g, "");
    const hit = __LIVE_CACHE.get("secgrade:" + host); if (hit && hit.exp > Date.now()) return hit.v;
    const r = await fetch("https://observatory-api.mdn.mozilla.net/api/v2/scan?host=" + __enc(host), { method: "POST", headers: { "User-Agent": __LIVE_UA }, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => null); if (!r.ok || !j || j.error) return { error: "Mozilla's checker didn't finish (" + ((j && j.error) || r.status) + ") - try again in a minute." };
    const g = String(j.grade || "?"); const good = /^A/.test(g), ok2 = /^B/.test(g);
    const out = { text: host + " gets " + g + " (" + j.score + "/100) from Mozilla's security check: " + j.tests_passed + " of " + j.tests_quantity + " checks passed." + (j.tests_failed ? " " + j.tests_failed + " to look at - the full report says which." : "") + (good ? " That's a strong result." : ok2 ? " Good, with room to improve." : " Worth improving - most fixes are a few lines in vercel.json."),
      grade: g, score: j.score, passed: j.tests_passed, failed: j.tests_failed, total: j.tests_quantity, scanned: j.scanned_at, report: j.details_url, source: { title: "Mozilla HTTP Observatory", url: "https://developer.mozilla.org/en-US/observatory" } };
    __LIVE_CACHE.set("secgrade:" + host, { v: out, exp: Date.now() + 3600000 }); return out;
  },
  // ── BATCH 15 round 3: the vetted open shelf. One door to many free, no-key public services that
  //    the owner approved (catalog round 3). Safety limits: https GET only, only these hosts (the
  //    address can't be bent elsewhere, redirects included), no cookies or keys sent, answers capped
  //    at 400 KB, cached, and the usual per-visitor rate limit.
  async open(b) {
    let u; try { u = new URL(String(b.url || "")); } catch (e) { return { error: "That address isn't one The Spine can read." }; }
    if (u.protocol !== "https:" || u.username || u.password || u.port || !__OPEN.has(u.hostname)) return { error: "That address isn't on The Spine's list of free sources." };
    const extra = __OPEN_HDR[u.hostname] || {};
    const hit = __LIVE_CACHE.get("open:" + u.href); if (hit && hit.exp > Date.now()) return hit.v;
    const r = await fetch(u.href, { method: "GET", redirect: "follow", headers: { "User-Agent": __LIVE_UA, Accept: "application/json, text/xml, text/csv, text/plain;q=0.8", ...extra }, signal: AbortSignal.timeout(10000) });
    let fin; try { fin = new URL(r.url || u.href); } catch (e) { fin = u; }
    if (fin.protocol !== "https:" || !__OPEN.has(fin.hostname)) return { error: "That source sent us somewhere else, so it wasn't read." };
    if (!r.ok) return { error: "The source said " + r.status + "." };
    const len = Number(r.headers.get("content-length") || 0); if (len > 400000) return { error: "That answer is too big - ask for less (fewer rows, one page)." };
    const type = String(r.headers.get("content-type") || "");
    if (!/json|xml|csv|text\/plain|geo\+json|text\/html/.test(type)) return { error: "That source didn't send data The Spine can read." };
    const text = (await r.text()).slice(0, 400000);
    let data = null; if (/json/.test(type) || /^\s*[[{]/.test(text)) { try { data = JSON.parse(text); } catch (e) { data = null; } }
    const out = { text: data ? JSON.stringify(data).slice(0, 4000) : __clean(text, 4000), data: data != null ? data : undefined, raw: data == null ? text.slice(0, 60000) : undefined, source: { title: fin.hostname, url: fin.origin } };
    __LIVE_CACHE.set("open:" + u.href, { v: out, exp: Date.now() + 600000 });
    return out;
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
    // batch 15: post a line to the person's OWN Discord or Slack channel. Only real Discord/Slack
    // webhook addresses are accepted (so this can't be used to reach anything else); the address
    // comes from the person's phone and is never stored here.
    if (__b && __b.what === "post") {
      // batch 16: also the person's OWN automations - a Make, Zapier, IFTTT or n8n Cloud webhook. Each
      // service has its own strict address pattern, so this door still can't reach anything else.
      const url = String(__b.url || ""), text = String(__b.text || "").slice(0, 1900).trim();
      const kind = __hookKind(url);
      let data = null; if (__b.data != null) { try { const d = JSON.stringify(__b.data); if (d.length <= 8000) data = JSON.parse(d); } catch (e) { data = null; } }
      const auto = kind && !["discord", "slack"].includes(kind);
      if (!kind || (!text && !(auto && data))) return res.status(200).json({ error: kind ? "Nothing to post." : "That isn't a Discord, Slack, Make, Zapier, IFTTT or n8n webhook address." });
      if (!__rateLimit("post:" + ip, 20, 60_000)) return res.status(200).json({ error: "Too many posts - wait a minute." });
      let body;
      if (kind === "discord") body = { content: text, allowed_mentions: { parse: [] } };
      else if (kind === "slack") body = { text };
      else if (kind === "ifttt" && !/\/json\/with\//.test(url)) body = { value1: text, value2: data ? JSON.stringify(data).slice(0, 1900) : "", value3: "The Spine" };
      else body = { text, data, from: "The Spine", at: new Date().toISOString() };
      try {
        const r = await fetch(url, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), body: JSON.stringify(body) });
        return res.status(200).json(r.ok ? { ok: true, kind } : { error: (auto ? "The automation" : "The channel") + " said no (" + r.status + ")." });
      } catch (e) { return res.status(200).json({ error: auto ? "Couldn't reach the automation." : "Couldn't reach the channel." }); }
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
