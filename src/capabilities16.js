// ============================================================================
//  WHAT THE SPINE CAN DO (batch 16) - one catalogue the Core and every leg are
//  told, so nothing it can do goes unused, and a formula for how many different
//  things can be made from it (worked out from what is actually wired in).
// ============================================================================

export const LEGS16 = [
  ["Core", "answers, research with sources, reading files and links, live data, working app and website prototypes, invitations, coloring pages"],
  ["Game", "board, card, puzzle, word, quiz, arcade, platformer, shooter, racing, sports, fighting, strategy, sim, rhythm, runner, high-end 3D and story adventures"],
  ["World", "3D places to walk into, real map data, real elevation, AR in your room"],
  ["Tool", "working mini-apps with camera, sensors, live data, a shared backend and real actions"],
  ["Web", "full websites, landing pages, menus, portfolios, invitations, booking pages"],
  ["Image", "pictures, posters, logos, stickers, cut-outs, coloring pages"],
  ["Video", "clips, reels, captions, edits"],
  ["Movie", "a full production you can watch - script, art, voices, score, credits"],
  ["Music", "songs, beats, real instruments, sheet music, humming into notes, key changes"],
  ["Voice", "natural voices, dubbing, reading aloud"],
  ["Text", "letters, toasts, stories, posts - with private grammar checking"],
  ["Blueprint", "things to build or 3D print, with cut lists and print files"],
  ["Agent", "multi-step research and planning that ends in a table, plan or calendar"],
  ["Assistant", "your own helper that remembers how you like things"],
];

export const ABILITY_GROUPS16 = [
  ["See", "camera, scan pages (OCR), barcodes, hand, body and face tracking, cut-outs, picture safety check"],
  ["Hear and speak", "speech to words on the phone, natural voices, reading aloud, translation"],
  ["Music", "real instruments, sheet music, humming to notes, key change, sound effects, background scores"],
  ["Know", "78 live sources (weather, news, quakes, flights, prices, science, law, sport...), web search, reading any link, maths, meaning search"],
  ["Make visual", "images, 3D models, materials, skies, molecules, AR, avatars, coloring pages, films"],
  ["Do", "calendar, messages, directions, payments and tips, shortcuts, automations (Make, Zapier, IFTTT, n8n), Discord/Slack/Telegram/Mastodon/Bluesky posting, smart home, NFC, share sheet, printing"],
  ["Remember and share", "memory by meaning, a shared database for apps, links that open as apps, invitation replies, home-screen apps"],
];

// HOW MANY DIFFERENT THINGS CAN BE MADE
// For each leg: the ways its abilities can be combined (any 1, 2 or 3 of them together) times
// the ways the result can leave (play here, link, home-screen app, print, video file, AR...),
// plus chains where one leg hands its result to another (two or three legs in a row).
//   total = sum over legs [ (C(a,1) + C(a,2) + C(a,3)) x outputs ] + n(n-1) + n(n-1)(n-2)
export function choose(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); }
export function makeableCount(abilities, legs, outputs) {
  const a = Math.max(1, abilities | 0), n = Math.max(1, legs | 0), o = Math.max(1, outputs | 0);
  const perLeg = (choose(a, 1) + choose(a, 2) + choose(a, 3)) * o;
  const chains = n * (n - 1) + n * (n - 1) * (n - 2);
  return { perLeg, chains, total: perLeg * n + chains, a, n, o };
}
export const OUTPUTS16 = ["play it here", "share a link", "its own home-screen app", "print it", "save a picture", "save a video", "put it in your room (AR)", "post it to the Market", "send it to your apps"];

export function bridgeAbilityCount(bridgeSrc) {
  const names = new Set(); const re = /[{,"'\s]([a-zA-Z][a-zA-Z0-9]{1,30})\s*:\s*function\s*\(/g; let m;
  while ((m = re.exec(String(bridgeSrc || "")))) names.add(m[1]);
  return names.size;
}
export function niceNumber(x) { if (x >= 1e9) return (x / 1e9).toFixed(1).replace(/\.0$/, "") + " billion"; if (x >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, "") + " million"; if (x >= 1e3) return Math.round(x / 1e3) + " thousand"; return String(x); }

export function capabilityBrief(abilities) {
  const c = makeableCount(abilities, LEGS16.length, OUTPUTS16.length);
  return "\n\nEVERYTHING THE SPINE CAN DO (use it - never say you can't when one of these does it; offer the right one in a line when it would genuinely help):\n"
    + LEGS16.map(([n, d]) => "- " + n + ": " + d).join("\n") + "\n"
    + ABILITY_GROUPS16.map(([n, d]) => "- " + n + ": " + d).join("\n")
    + "\nWAYS A RESULT CAN LEAVE: " + OUTPUTS16.join(", ") + "."
    + "\nHOW MANY THINGS: with " + c.n + " legs, " + c.a + " abilities that can be combined three at a time, " + c.o + " ways to deliver and legs that hand work to each other, The Spine can make about " + niceNumber(c.total) + " distinct kinds of things (sum over legs of (C(a,1)+C(a,2)+C(a,3)) x outputs, plus two- and three-leg chains). When someone is unsure what to make, use this breadth: suggest a specific, surprising combination that fits what they said (for example a toast + natural voice + a printed card, or a game + body tracking + a leaderboard).";
}
