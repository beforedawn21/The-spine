// ============================================================================
//  INVITATIONS (batch 16): ready-made looks for every occasion, and a decorate
//  layer that lives inside the invitation itself - change the look, the colours,
//  the type, the falling sparkle, and edit the words right on the card, all
//  without waiting for a rebuild.
// ============================================================================

// Each look: colours (CSS variables every invitation uses), a type pairing, what drifts down
// the screen, the envelope, and the tone the words should take.
export const SHELLS = [
  { key: "wedding", name: "Wedding", emoji: "💍", vars: { bg: "#f4eee6", paper: "#fffdf8", ink: "#3b3127", accent: "#b08d57", envelope: "#efe4d3" }, fonts: "classic", particles: "petals", tone: "romantic, timeless, elegant; sections for the ceremony, reception, travel and stay, registry, dress code" },
  { key: "boho", name: "Garden wedding", emoji: "🌿", vars: { bg: "#e9efe6", paper: "#fbfcf8", ink: "#2f3a2c", accent: "#7a8f5b", envelope: "#dfe7d6" }, fonts: "airy", particles: "leaves", tone: "relaxed, natural, warm" },
  { key: "birthday", name: "Birthday party", emoji: "🎉", vars: { bg: "#1d1a3a", paper: "#fff7ec", ink: "#22183d", accent: "#ff5c8a", envelope: "#ffd166" }, fonts: "bold", particles: "confetti", tone: "joyful, fun, a little cheeky" },
  { key: "kids", name: "Kids' party", emoji: "🎈", vars: { bg: "#bfe9ff", paper: "#ffffff", ink: "#20345c", accent: "#ff8a00", envelope: "#ffe066" }, fonts: "playful", particles: "balloons", tone: "bright, playful, simple words; what to bring, pick-up time" },
  { key: "milestone", name: "30th / 40th / 50th", emoji: "✨", vars: { bg: "#0f0f12", paper: "#141419", ink: "#f2e6c9", accent: "#d4af37", envelope: "#1f1f26" }, fonts: "deco", particles: "gold", tone: "glamorous black and gold, a night to remember" },
  { key: "memorial", name: "Celebration of life", emoji: "🕊", vars: { bg: "#e9ecef", paper: "#fbfbfc", ink: "#2d3339", accent: "#7d8b99", envelope: "#dde2e7" }, fonts: "quiet", particles: "candle", tone: "gentle, dignified and warm; 'join us to remember and celebrate'; service, gathering after, flowers or donations, a place to share a memory; no jokes, no confetti, no countdown, music off by default" },
  { key: "baby", name: "Baby shower", emoji: "🍼", vars: { bg: "#fdf0f3", paper: "#ffffff", ink: "#4a3b45", accent: "#e8a0b4", envelope: "#f9dde5" }, fonts: "soft", particles: "bubbles", tone: "sweet and soft; registry, games, a guess-the-date poll" },
  { key: "graduation", name: "Graduation", emoji: "🎓", vars: { bg: "#0b2545", paper: "#fdfcf7", ink: "#13315c", accent: "#e0b84b", envelope: "#13315c" }, fonts: "collegiate", particles: "confetti", tone: "proud, celebratory; the graduate's story, ceremony and party" },
  { key: "anniversary", name: "Anniversary", emoji: "❤", vars: { bg: "#3a0d1d", paper: "#fff6f3", ink: "#4a1426", accent: "#c9485b", envelope: "#f4d5d8" }, fonts: "classic", particles: "hearts", tone: "loving, nostalgic; years together, a photo timeline" },
  { key: "holiday", name: "Holiday party", emoji: "❄", vars: { bg: "#0d3b2e", paper: "#fffaf2", ink: "#123d2f", accent: "#c8102e", envelope: "#f3e9d7" }, fonts: "festive", particles: "snow", tone: "festive and cosy; food, secret gift exchange, dress code" },
  { key: "corporate", name: "Work event", emoji: "💼", vars: { bg: "#0e1726", paper: "#ffffff", ink: "#0e1726", accent: "#3a7bfd", envelope: "#e7edf7" }, fonts: "modern", particles: "none", tone: "polished and clear; agenda, speakers, parking, accessibility" },
  { key: "faith", name: "Religious ceremony", emoji: "🕎", vars: { bg: "#f1ece2", paper: "#fffdf7", ink: "#2c2a26", accent: "#8c6d3f", envelope: "#e8dfcf" }, fonts: "classic", particles: "gold", tone: "reverent and joyful; for a christening, bar or bat mitzvah, first communion, nikah, quinceanera - use the person's own tradition and words" },
  { key: "housewarming", name: "Housewarming", emoji: "🏡", vars: { bg: "#f6efe4", paper: "#ffffff", ink: "#3e3226", accent: "#d97b41", envelope: "#f1e2cc" }, fonts: "airy", particles: "leaves", tone: "friendly and relaxed; the new address, parking, 'bring nothing but yourselves'" },
];
export const FONTS = {
  classic: { display: "Cormorant Garamond", body: "Lora", w: "500;600" },
  airy: { display: "Playfair Display", body: "Nunito Sans", w: "400;600" },
  bold: { display: "Bricolage Grotesque", body: "DM Sans", w: "600;800" },
  playful: { display: "Fredoka", body: "Nunito", w: "500;700" },
  deco: { display: "Poiret One", body: "Josefin Sans", w: "400;600" },
  quiet: { display: "EB Garamond", body: "Source Serif 4", w: "400;500" },
  soft: { display: "Quicksand", body: "Nunito", w: "500;700" },
  collegiate: { display: "Libre Baskerville", body: "Inter", w: "400;700" },
  festive: { display: "Mountains of Christmas", body: "Lato", w: "400;700" },
  modern: { display: "Manrope", body: "Inter", w: "500;800" },
};
export const PARTICLES = ["petals", "leaves", "confetti", "balloons", "gold", "candle", "bubbles", "hearts", "snow", "stars", "none"];

export function detectOccasion(text) {
  const t = String(text || "").toLowerCase();
  const rules = [
    ["memorial", /funeral|memorial|celebration of life|passed away|in loving memory|wake\b|homegoing|repast/],
    ["baby", /baby shower|sprinkle|gender reveal|sip and see/],
    ["kids", /\b(kid|kids|child|children|toddler|son|daughter)('?s)?\b.*(party|birthday)|\b(1st|first|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+birthday/],
    ["milestone", /\b(21st|30th|40th|50th|60th|70th|80th|90th|100th)\b/],
    ["boho", /garden wedding|boho|rustic wedding|barn wedding/],
    ["wedding", /wedding|marriage|engagement|save the date|nuptial|vow renewal/],
    ["anniversary", /anniversary/],
    ["graduation", /graduat|commencement|convocation/],
    ["holiday", /christmas|holiday party|new year|hanukkah|diwali|eid party|thanksgiving|xmas/],
    ["corporate", /conference|work event|company|corporate|launch event|offsite|networking|webinar/],
    ["faith", /christening|baptism|bar mitzvah|bat mitzvah|communion|confirmation|nikah|quincea|dedication/],
    ["housewarming", /housewarming|new home|moving party/],
    ["birthday", /birthday|bday|party/],
  ];
  for (const [k, re] of rules) if (re.test(t)) return SHELLS.find((s) => s.key === k);
  return null;
}

export function shellBrief(shell) {
  if (!shell) return "";
  const f = FONTS[shell.fonts] || FONTS.classic; const v = shell.vars;
  return "\n\nTHE LOOK FOR THIS OCCASION (" + shell.name + "): start from these exact values so the person's decorate panel works - background " + v.bg + ", paper " + v.paper + ", ink " + v.ink + ", accent " + v.accent + ", envelope " + v.envelope + "; display type '" + f.display + "', body type '" + f.body + "' (Google Fonts); drifting " + shell.particles + ". Tone: " + shell.tone + ".";
}

// What every invitation must follow so it can be decorated and edited inside.
export const DECOR_CONTRACT = "\n\nDECORATE AND EDIT INSIDE (required): "
  + "1. Every colour and font comes from these CSS variables on :root - --inv-bg, --inv-paper, --inv-ink, --inv-accent, --inv-envelope, --inv-display (font-family), --inv-body (font-family) - never hard-code colours elsewhere (gradients and shadows mix these with transparency). "
  + "2. Every piece of text the person might change carries data-edit=\"a-short-key\" (headline, names, date line, time, place, address, dress code, each schedule line, each FAQ, the note, the RSVP prompt). "
  + "3. Do NOT draw your own drifting particles - The Spine adds them (window.SPINE_DECOR handles it). When the envelope opens, call window.SPINE_BURST && window.SPINE_BURST() for the burst of light and sparkle. "
  + "4. Keep the envelope and the opened invitation in the same page; give the replay button the id 'inv-replay'.";

// The small layer added to every invitation: drifting particles, the open burst, and the
// decorate / edit messages from the card it sits in.
export const DECOR_RUNTIME = `<script data-spine-runtime>(function(){
var cv=document.createElement('canvas');cv.id='spine-decor';cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
var ctx=null,parts=[],kind='none',W=0,H=0,burst=[],raf=0,still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function size(){W=cv.width=innerWidth*(devicePixelRatio||1);H=cv.height=innerHeight*(devicePixelRatio||1);}
function col(){var s=getComputedStyle(document.documentElement);return [s.getPropertyValue('--inv-accent').trim()||'#d4af37',s.getPropertyValue('--inv-paper').trim()||'#fff','#ffd166','#ff5c8a','#7bdff2','#b2f7ef'];}
function make(i){var c=col(),r=Math.random;return {x:r()*W,y:-20-r()*H,v:(0.4+r()*1.1)*(devicePixelRatio||1),s:(6+r()*10)*(devicePixelRatio||1),a:r()*6.28,w:(r()-.5)*.04,c:c[(i%c.length)],ph:r()*6.28};}
function draw(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.c;ctx.globalAlpha=.85;var s=p.s;
 if(kind==='confetti'){ctx.fillRect(-s/2,-s/4,s,s/2);}
 else if(kind==='petals'||kind==='leaves'){ctx.fillStyle=kind==='leaves'?'#7a8f5b':p.c;ctx.beginPath();ctx.ellipse(0,0,s/2,s/4,0,0,6.28);ctx.fill();}
 else if(kind==='hearts'){ctx.beginPath();ctx.moveTo(0,s/4);ctx.bezierCurveTo(s/2,-s/3,s/4,-s/1.4,0,-s/4);ctx.bezierCurveTo(-s/4,-s/1.4,-s/2,-s/3,0,s/4);ctx.fill();}
 else if(kind==='balloons'){ctx.beginPath();ctx.ellipse(0,0,s/2,s/1.6,0,0,6.28);ctx.fill();ctx.strokeStyle=p.c;ctx.beginPath();ctx.moveTo(0,s/1.6);ctx.lineTo(0,s*1.5);ctx.stroke();}
 else if(kind==='snow'||kind==='bubbles'){ctx.globalAlpha=kind==='bubbles'?.35:.9;ctx.fillStyle=kind==='snow'?'#fff':p.c;ctx.beginPath();ctx.arc(0,0,s/3,0,6.28);ctx.fill();}
 else if(kind==='candle'){ctx.globalAlpha=.25+.25*Math.sin(p.ph);var g=ctx.createRadialGradient(0,0,0,0,0,s);g.addColorStop(0,'#ffd9a0');g.addColorStop(1,'rgba(255,217,160,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,s,0,6.28);ctx.fill();}
 else {ctx.globalAlpha=.5+.5*Math.sin(p.ph);ctx.beginPath();ctx.arc(0,0,s/5,0,6.28);ctx.fill();}
 ctx.restore();}
function tick(){raf=requestAnimationFrame(tick);if(!ctx)return;ctx.clearRect(0,0,W,H);
 for(var i=0;i<parts.length;i++){var p=parts[i];var up=kind==='balloons'||kind==='bubbles'||kind==='candle';p.y+=up?-p.v:p.v;p.x+=Math.sin(p.ph+=.02)*.6;p.a+=p.w;if(!up&&p.y>H+30){p.y=-20;p.x=Math.random()*W;}if(up&&p.y<-40){p.y=H+20;p.x=Math.random()*W;}draw(p);}
 for(var j=burst.length-1;j>=0;j--){var b=burst[j];b.x+=b.vx;b.y+=b.vy;b.vy+=.12*(devicePixelRatio||1);b.l-=1;ctx.globalAlpha=Math.max(0,b.l/60);ctx.fillStyle=b.c;ctx.fillRect(b.x,b.y,b.s,b.s);if(b.l<=0)burst.splice(j,1);}
 ctx.globalAlpha=1;}
function set(k){kind=k||'none';parts=[];if(kind==='none'||still)return;var n=kind==='candle'?14:kind==='balloons'?12:42;for(var i=0;i<n;i++){var p=make(i);if(kind==='balloons'||kind==='bubbles'||kind==='candle')p.y=Math.random()*H;parts.push(p);}}
window.SPINE_BURST=function(){if(still||!ctx)return;var c=col();for(var i=0;i<140;i++){var a=Math.random()*6.28,v=(2+Math.random()*7)*(devicePixelRatio||1);burst.push({x:W/2,y:H/2,vx:Math.cos(a)*v,vy:Math.sin(a)*v-3,l:40+Math.random()*30,s:(2+Math.random()*4)*(devicePixelRatio||1),c:c[i%c.length]});}};
window.SPINE_DECOR=function(o){o=o||{};var r=document.documentElement.style;
 if(o.vars)for(var k in o.vars)r.setProperty('--inv-'+k,o.vars[k]);
 if(o.fonts){if(o.fonts.href&&!document.querySelector('link[data-spine-font="'+o.fonts.href+'"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=o.fonts.href;l.setAttribute('data-spine-font',o.fonts.href);document.head.appendChild(l);}r.setProperty('--inv-display',"'"+o.fonts.display+"', serif");r.setProperty('--inv-body',"'"+o.fonts.body+"', sans-serif");}
 if(o.particles)set(o.particles);};
function editing(on){var els=document.querySelectorAll('[data-edit]');if(on&&els.length===0){var t=document.querySelectorAll('h1,h2,h3,h4,p,li,dt,dd,figcaption,label,small,em,strong');var k=0;for(var j=0;j<t.length;j++){if(t[j].children.length===0&&t[j].textContent.trim()&&!t[j].closest('script,style,button')){t[j].setAttribute('data-edit','auto'+(k++));}}els=document.querySelectorAll('[data-edit]');}
 for(var i=0;i<els.length;i++){var el=els[i];if(on){if(!el.hasAttribute('data-orig'))el.setAttribute('data-orig',el.textContent);el.setAttribute('contenteditable','true');el.style.outline='1.5px dashed rgba(127,127,127,.6)';el.style.outlineOffset='3px';}else{el.removeAttribute('contenteditable');el.style.outline='';el.style.outlineOffset='';}}}
function changes(){var out=[];var els=document.querySelectorAll('[data-orig]');for(var i=0;i<els.length;i++){var a=els[i].getAttribute('data-orig'),b=els[i].textContent;if(a!==b)out.push({key:els[i].getAttribute('data-edit'),from:a,to:b});}return out;}
window.addEventListener('message',function(e){var d=e.data||{};if(!d.__spineDecor)return;
 if(d.decor)window.SPINE_DECOR(d.decor);
 if(d.edit!=null)editing(!!d.edit);
 if(d.save){editing(false);try{parent.postMessage({__spineDecorSaved:true,id:d.id,edits:changes(),particles:kind},'*');}catch(_){}}});
function start(){document.body.appendChild(cv);ctx=cv.getContext('2d');size();addEventListener('resize',size);if(window.SPINE_START_DECOR)window.SPINE_DECOR(window.SPINE_START_DECOR);else set('none');tick();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();<\/script>`;

export function fontHref(fonts) {
  const f = FONTS[fonts] || FONTS.classic;
  return "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(f.display) + ":wght@" + f.w + "&family=" + encodeURIComponent(f.body) + ":wght@400;600&display=swap";
}
export function decorFor(shell) {
  if (!shell) return null; const f = FONTS[shell.fonts] || FONTS.classic;
  return { vars: shell.vars, fonts: { display: f.display, body: f.body, href: fontHref(shell.fonts) }, particles: shell.particles };
}

// Put the runtime and the chosen look into an invitation's page (replacing any earlier ones),
// so it always opens exactly as it was last decorated.
export function withDecor(html, decor) {
  let h = String(html || "").replace(/<script data-spine-start>[\s\S]*?<\/script>/gi, "").replace(/<script data-spine-runtime>[\s\S]*?<\/script>/gi, "");
  const start = decor ? '<script data-spine-start>window.SPINE_START_DECOR=' + JSON.stringify(decor).replace(/</g, "\\u003c") + ';<\/script>' : "";
  const add = start + DECOR_RUNTIME;
  return /<\/body>/i.test(h) ? h.replace(/<\/body>(?![\s\S]*<\/body>)/i, add + "</body>") : h + add;
}

// Words changed on the card go back into the page itself (by their data-edit key, or by the
// text they replaced), so the next version is the same invitation with the new words.
export function applyEdits(html, edits) {
  if (!edits || !edits.length) return html;
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    for (const e of edits) {
      let el = e.key && !/^auto\d+$/.test(e.key) ? doc.querySelector('[data-edit="' + String(e.key).replace(/"/g, "") + '"]') : null;
      if (!el) el = [...doc.body.querySelectorAll("*")].find((x) => x.children.length === 0 && x.textContent === e.from) || null;
      if (el) el.textContent = String(e.to || "").slice(0, 2000);
    }
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  } catch (err) { return html; }
}
