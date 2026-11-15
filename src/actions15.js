// ═══════════════════════════════════════════════════════════════════════════════════════════
//  THINGS A SPINE TOOL CAN DO IN THE WORLD (batch 15). Free, no keys of ours. Each one either
//  hands the person a ready-made link (they still tap Send / Pay / Save themselves) or, for the
//  person's OWN services (their Discord/Slack channel, their Home Assistant), uses their own
//  address or token, kept on their phone. Anything that unlocks, opens or pays asks first.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const enc = encodeURIComponent;
const clip = (s, n) => String(s == null ? "" : s).slice(0, n || 500);
export const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// iPhone Shortcuts: run one of the person's shortcuts by name, with text as its input.
export function shortcutUrl(name, input) {
  return "shortcuts://run-shortcut?name=" + enc(clip(name, 120)) + (input != null && input !== "" ? "&input=text&text=" + enc(clip(input, 2000)) : "");
}
// Calendar: Google and Outlook "add event" links, and a real .ics file Apple Calendar opens.
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function calendarLinks(ev) {
  const start = new Date(ev.start || Date.now()); const end = new Date(ev.end || start.getTime() + 3600000);
  if (isNaN(start) || isNaN(end)) return null;
  const t = clip(ev.title || "Event", 200), d = clip(ev.details || "", 1500), l = clip(ev.location || "", 300);
  const google = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + enc(t) + "&dates=" + icsDate(start) + "/" + icsDate(end) + (d ? "&details=" + enc(d) : "") + (l ? "&location=" + enc(l) : "");
  const outlook = "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=" + enc(t) + "&startdt=" + enc(start.toISOString()) + "&enddt=" + enc(end.toISOString()) + (d ? "&body=" + enc(d) : "") + (l ? "&location=" + enc(l) : "");
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Spine//EN", "BEGIN:VEVENT", "UID:" + Date.now() + "-" + Math.random().toString(36).slice(2) + "@thespine.cloud", "DTSTAMP:" + icsDate(Date.now()), "DTSTART:" + icsDate(start), "DTEND:" + icsDate(end), "SUMMARY:" + esc(t)]
    .concat(d ? ["DESCRIPTION:" + esc(d)] : [], l ? ["LOCATION:" + esc(l)] : [], ev.remindMinutes ? ["BEGIN:VALARM", "TRIGGER:-PT" + Math.max(0, Math.round(ev.remindMinutes)) + "M", "ACTION:DISPLAY", "DESCRIPTION:" + esc(t), "END:VALARM"] : [], ["END:VEVENT", "END:VCALENDAR"]).join("\r\n");
  return { google, outlook, ics };
}
// A contact card (vCard) the phone's Contacts app saves.
export function vcard(c) {
  const e = (s) => clip(s, 200).replace(/[,;\\]/g, (m) => "\\" + m).replace(/\r?\n/g, " ");
  return ["BEGIN:VCARD", "VERSION:3.0", "FN:" + e(c.name || "Contact"), c.org ? "ORG:" + e(c.org) : "", c.phone ? "TEL;TYPE=CELL:" + e(c.phone) : "", c.email ? "EMAIL:" + e(c.email) : "", c.url ? "URL:" + e(c.url) : "", c.note ? "NOTE:" + e(c.note) : "", "END:VCARD"].filter(Boolean).join("\r\n");
}
// Messages: the app opens with the words filled in; the person presses Send.
export function messageUrl(m) {
  const text = clip(m.text, 2000), to = String(m.to || "").trim();
  const digits = to.replace(/[^\d+]/g, "");
  if (m.via === "whatsapp") return "https://wa.me/" + digits.replace(/^\+/, "") + "?text=" + enc(text);
  if (m.via === "email") return "mailto:" + enc(to).replace(/%40/g, "@") + "?subject=" + enc(clip(m.subject, 200)) + "&body=" + enc(text);
  if (m.via === "call") return "tel:" + digits;
  return "sms:" + digits + (isIOS() ? "&" : "?") + "body=" + enc(text);
}
// Directions: Apple Maps on iPhone, Google Maps elsewhere.
export function directionsUrl(d) {
  const to = clip(d.to, 200), from = d.from ? clip(d.from, 200) : ""; const mode = d.mode || "driving";
  if (isIOS()) return "https://maps.apple.com/?daddr=" + enc(to) + (from ? "&saddr=" + enc(from) : "") + "&dirflg=" + ({ walking: "w", transit: "r", driving: "d" }[mode] || "d");
  return "https://www.google.com/maps/dir/?api=1&destination=" + enc(to) + (from ? "&origin=" + enc(from) : "") + "&travelmode=" + ({ walking: "walking", transit: "transit", bicycling: "bicycling" }[mode] || "driving");
}
// Payment links: the person's own payment app opens with the amount; nothing passes through The Spine.
export function payUrl(p) {
  const h = String(p.handle || "").replace(/^[@$]/, "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60); if (!h) return null;
  const amt = Math.max(0, Math.round(Number(p.amount || 0) * 100) / 100); const note = clip(p.note, 120);
  if (p.service === "venmo") return "https://venmo.com/" + h + "?txn=pay" + (amt ? "&amount=" + amt : "") + (note ? "&note=" + enc(note) : "");
  if (p.service === "cashapp") return "https://cash.app/$" + h + (amt ? "/" + amt : "");
  return "https://paypal.me/" + h + (amt ? "/" + amt : "");
}
// Is this one of the person's own chat-channel addresses (Discord or Slack incoming webhook)?
export function webhookKind(url) {
  const u = String(url || "");
  if (/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u)) return "discord";
  if (/^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(u)) return "slack";
  return null;
}
// Home Assistant: things that need a "yes" from the person every time.
export const SENSITIVE_HOME = /^(lock|alarm_control_panel|cover|garage|siren|valve|button)\b/;
export function homeNeedsYes(domain, service) { return SENSITIVE_HOME.test(String(domain || "")) || /unlock|open|disarm|trigger/.test(String(service || "")); }
