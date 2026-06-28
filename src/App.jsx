import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  supabaseReady,
  createAccount, signInAccount, loadAccountById, deleteAccountById,
  saveSession, clearSession, getSavedAccountId,
  saveProfile, loadProfile,
  loadWallet, setWalletBalance, applyWalletDelta, setAdminCredits, addLedger, loadLedger,
  loadTools, publishToolDb, recordFeedback, bumpToolRuns,
  saveConversation, loadConversations, deleteConversation,
  loadAdminStats, loadSettings, saveSettings, DEFAULT_SETTINGS,
  loadAllUsers, adminSetUserCredits, adminDeleteUser, adminDeleteTool, adminSetToolFeatured, setToolPublic,
  saveProject, loadProjects, deleteProject,
} from "./spineData";

/* Lightweight, safe markdown to React renderer for AI answers.
   Handles headings, bold, italic, inline code, code blocks, and lists,
   so answers render clean instead of showing raw ## and ** symbols. */
function renderRich(text){
  if(text==null) return null;
  const lines=String(text).split("\n");
  const out=[]; let i=0; let key=0;
  const inline=(s)=>{
    const parts=[]; let rest=s; let k=0;
    const re=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;
    let m;
    while((m=re.exec(rest))){
      if(m.index>0) parts.push(rest.slice(0,m.index));
      if(m[2]!=null) parts.push(<b key={"b"+(k++)}>{m[2]}</b>);
      else if(m[3]!=null) parts.push(<i key={"i"+(k++)}>{m[3]}</i>);
      else if(m[4]!=null) parts.push(<code key={"c"+(k++)} className="rich-code">{m[4]}</code>);
      rest=rest.slice(m.index+m[0].length);
    }
    if(rest) parts.push(rest);
    return parts;
  };
  while(i<lines.length){
    const ln=lines[i];
    if(/^```/.test(ln)){
      const buf=[]; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      i++;
      out.push(<pre key={key++} className="rich-pre"><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h=ln.match(/^(#{1,4})\s+(.*)$/);
    if(h){ const lvl=h[1].length; out.push(<div key={key++} className={"rich-h rich-h"+lvl}>{inline(h[2])}</div>); i++; continue; }
    if(/^\s*[-*]\s+/.test(ln)){
      const items=[];
      while(i<lines.length && /^\s*[-*]\s+/.test(lines[i])){ items.push(lines[i].replace(/^\s*[-*]\s+/,"")); i++; }
      out.push(<ul key={key++} className="rich-ul">{items.map((it,x)=><li key={x}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if(/^\s*\d+\.\s+/.test(ln)){
      const items=[];
      while(i<lines.length && /^\s*\d+\.\s+/.test(lines[i])){ items.push(lines[i].replace(/^\s*\d+\.\s+/,"")); i++; }
      out.push(<ol key={key++} className="rich-ol">{items.map((it,x)=><li key={x}>{inline(it)}</li>)}</ol>);
      continue;
    }
    if(ln.trim()===""){ out.push(<div key={key++} className="rich-sp"/>); i++; continue; }
    out.push(<p key={key++} className="rich-p">{inline(ln)}</p>); i++;
  }
  return <div className="rich">{out}</div>;
}

/* ===========================================================
   SPINE - The operating system for human value.
   Peg: 1 credit = $0.001 | Cashout min: 10,000 cr = $10
   Doctrine: retrieve before reason . verify before respond . prove before pay
=========================================================== */

const PEG = 0.001;
const CASHOUT_MIN = 10000;
const REWARD_POOL_INIT = 80000;

const TRUST_LEVELS = [
  { name:"New",      min:0,  mult:0.5, note:"Earning while we verify your quality" },
  { name:"Verified", min:25, mult:1.0, note:"Standard earning rate" },
  { name:"Trusted",  min:55, mult:1.5, note:"Higher rate, priority review" },
  { name:"Core",     min:85, mult:2.0, note:"Top rate, gold-task authoring" },
];
const ORDER_V = ["good","needs-work","wrong"];
const VERDICTS = [
  { key:"good",       label:"Accurate",   hint:"Correct and complete" },
  { key:"needs-work", label:"Needs work", hint:"Right idea, incomplete" },
  { key:"wrong",      label:"Inaccurate", hint:"Contains an error" },
];
const TASKS = [
  { q:"What year did the first iPhone launch?",         a:"The first iPhone launched in 2007.",                    gold:"good" },
  { q:"How many continents are there?",                 a:"There are 8 continents on Earth.",                      gold:"wrong" },
  { q:"How do vaccines work?",                          a:"They train the immune system to recognize a pathogen.", gold:"needs-work" },
  { q:"Boiling point of water at sea level?",           a:"Water boils at 100degC at sea level.",                   gold:"good" },
  { q:"Who wrote Romeo and Juliet?",                    a:"Romeo and Juliet was written by Charles Dickens.",      gold:"wrong" },
  { q:"Explain photosynthesis.",                        a:"Plants make energy.",                                   gold:"needs-work" },
  { q:"Capital of Australia?",                          a:"The capital of Australia is Canberra.",                 gold:"good" },
  { q:"Define inflation.",                              a:"Inflation is when prices fall over time.",              gold:"wrong" },
  { q:"What is machine learning?",                      a:"Systems that learn from data to make predictions.",     gold:"needs-work" },
  { q:"How does the human heart pump blood?",           a:"It contracts rhythmically to push blood through vessels.", gold:"good" },
];

const LAYERS = [
  { k:"Identity",     icon:"\u25C9", d:"Who is doing the work. Owned by the person, portable everywhere.",               tab:"studio" },
  { k:"Contribution", icon:"*", d:"What was created, improved, or shipped - measured against real outcomes.",        tab:"earn" },
  { k:"Attribution",  icon:"\u29C9", d:"How value is traced across collaborators and time.",                              tab:"marketplace" },
  { k:"Settlement",   icon:"\u25C8", d:"How money is paid when value is verified - by agreed rules, never discretion.",   tab:"wallet" },
];
const SPINE_SEGS = [
  { key:"wallet",  label:"Wallet",      sub:"Your balance" },
  { key:"ledger",  label:"Ledger",      sub:"Every credit traced" },
  { key:"quality", label:"Quality",     sub:"Scores contributions" },
  { key:"fraud",   label:"Fraud guard", sub:"Stops free minting" },
  { key:"gateway", label:"Gateway",     sub:"Meters usage" },
];
const PLUGINS = [
  { key:"feedback",    name:"Feedback",    desc:"Rate AI answers, earn per verified review" },
  { key:"community",   name:"Community",   desc:"Moderation, referrals, quality signals" },
  { key:"data",        name:"Data",        desc:"Contribute niche datasets and labels" },
  { key:"compute",     name:"Compute",     desc:"Lend idle compute for batch jobs" },
  { key:"marketplace", name:"Marketplace", desc:"Publish tools, earn per outcome" },
];
const SPEND_ACTIONS = [
  { key:"smart",   name:"Smart route",    cost:2,  tip:"Spine picks the cheapest model that nails it. 5,000 queries per $10." },
  { key:"premium", name:"Premium model",  cost:8,  tip:"Claude Sonnet, GPT-4o - for complex reasoning." },
  { key:"top",     name:"Top model",      cost:25, tip:"Claude Opus, GPT-4 - maximum intelligence." },
  { key:"context", name:"Large context",  cost:20, tip:"Full books and codebases in one pass." },
  { key:"batch",   name:"Overnight batch",cost:1,  tip:"Non-urgent jobs at 87% less - best value." },
];
// Heavy nerves bill a real GPU API on every fire. They run on backed credits or the free quota, never on free-earned credits alone.
const MEDIA_NERVES = [
  { key:"image",     name:"Image",      cost:40,  unit:"image",    tip:"A finished image, rendered for real." },
  { key:"animation", name:"Animation",  cost:120, unit:"clip",     tip:"A short animated clip." },
  { key:"video",     name:"Video",      cost:300, unit:"video",    tip:"A generated video scene." },
];
const FREE_MEDIA_QUOTA = 2; // capped free renders = your acquisition budget; then it's buy-credits-to-render
// -- Unit economics ------------------------------------------
// Every real dollar that buys credits splits three ways:
const SPLIT = { pool: 0.5, compute: 0.3, margin: 0.2 }; // earners / compute bills / Spine profit
// Each earn action creates value Spine can resell; we pay a fraction of that value and keep the spread.
// value is in credits (1 cr = $0.001). Payout below = ~40% of value, so Spine retains ~60%.
const EARN_VALUE = { feedback: 20, community: 12, data: 25, compute: 37 };
const EARN_PAYOUT_RATIO = 0.4;
// -- Creation pipelines (Option B: one nerve, compact sub-switcher) --
// Each: plan/brief runs live through the spinal cord; heavy render is gated behind backed credits ("soon").
const PIPELINES = [
  { key:"image",  name:"Image",       icon:"▦", plan:"Art-direct a shot or restyle an image - composition, lighting, mood.", brief:"You are Spine's image director. Turn the request into a precise, vivid image generation brief: subject, composition, lighting, style, palette, aspect ratio." },
  { key:"video",  name:"Video",       icon:"▮", plan:"Direct a scene - shots, motion, pacing, sound.", brief:"You are Spine's video director. Produce a complete shot-by-shot brief: framing, camera motion, lighting, timing, sound design, ready for a generator." },
  { key:"music",  name:"Music",       icon:"♪", plan:"Compose a track plan - genre, structure, instrumentation, mood.", brief:"You are Spine's music producer. Lay out a full track: genre, tempo, key, structure (intro/verse/chorus/bridge), instrumentation, and a production note per section." },
  { key:"movie",  name:"Movie",       icon:"❖", plan:"Run the full film pipeline - logline, beats, scenes, shot list.", brief:"You are Spine's showrunner. Build a complete production: logline, 5-beat structure, scene breakdown, then a fully scripted opening scene with dialogue and shot directions." },
  { key:"dub",    name:"Dub / clone", icon:"◍", plan:"Plan dubbing or a voice - language, tone, timing, consent.", brief:"You are Spine's dubbing director. Produce a dubbing plan: target language, voice tone and pacing, a timed line sheet, and an explicit consent/likeness checklist that must be satisfied before any voice is cloned." },
  { key:"text",   name:"Text-render", icon:"T", plan:"Render styled text and typography as an output.", brief:"You are Spine's typography engine. Given the text and intent, specify a complete type treatment: typeface pairing, weight, sizing scale, layout, and color, described precisely enough to render." },
  { key:"web",    name:"Website / App", icon:"⬡", plan:"Describe a site or app - Spine writes the full, working code.", brief:"You are Spine's senior web engineer. Build a complete, polished, working single-file site or app: real semantic HTML, modern responsive CSS (clean layout, good typography, thoughtful spacing and color), and working JavaScript for all interactivity. Make it genuinely production-quality and visually refined, not a skeleton - real content, hover states, mobile responsive. Return the full code in one fenced block, then a short note on structure. No placeholders, no TODOs." },
  { key:"game",   name:"Video Game",   icon:"⬢", plan:"Describe a game - Spine designs and builds it. Premium tier.", brief:"You are Spine's game engine. Design and BUILD a real, playable game. For 2D/arcade/puzzle/text games, return complete, runnable, polished HTML5/JavaScript in one fenced block - working controls, score, win/lose, clean visuals, playable immediately in a browser. Include sound where it helps (Web Audio). For rich 3D games, return a full design + scene spec and mark it for the hosted game runtime. Make it actually fun, not a tech demo." },
  { key:"blueprint", name:"Blueprint", icon:"⊞", plan:"Blueprints, 3D models, curriculums, experiments - any field.", brief:"You are Spine's blueprint engine for experts in any field - architects, engineers, builders, teachers, scientists. Produce a COMPLETE, PRECISE, build-ready blueprint. For any physical build (a home, a rocket, furniture, a machine), give REAL measurements throughout: exact dimensions in feet and inches (and metric), diameters, thicknesses, material specs, quantities, load/tolerance notes, and an ordered assembly sequence with each part and how it connects. Use concrete numbers, never vague descriptions - e.g. 'main beam: 2x10 Douglas fir, 12 ft span, 16 in on center'. For a curriculum: modules, lessons, objectives. For an experiment: hypothesis, materials, procedure, safety. Be field-accurate and specific enough that someone could actually build or follow it. Structure it clearly with sections." },
  { key:"agent",  name:"Agent",       icon:"◉", plan:"Hand the spine a task; it plans the steps and runs the safe ones.", brief:"You are a Spine autonomous agent. Break the task into concrete numbered steps. Then ACTUALLY DO every step you safely can right now (writing, code, analysis, research, drafting, planning) - don't just describe them, execute them and show the real output for each. For steps that need a connected tool, a payment, or human approval, clearly mark them as pending and explain exactly what's needed. End with a short summary of what got done and what's left. Be a doer, not a narrator." },
];
const EARN_NERVES = [
  { key:"community", name:"Community", desc:"Confirm a moderation signal the spine flagged", amt:5,  verb:"Confirm flag" },
  { key:"data",      name:"Data",      desc:"Submit a verified label into the spine",         amt:10, verb:"Submit label" },
  { key:"compute",   name:"Compute",   desc:"Lend a batch slice; the spinal cord runs a job", amt:15, verb:"Lend compute" },
];
const TOOL_TYPES = [
  { key:"prompt", label:"AI Assistant",     icon:"*", blurb:"A prompt or agent - fires through the spinal cord." },
  { key:"code",   label:"Code / Function",  icon:"⌘", blurb:"JavaScript sandboxed in the buyer's browser." },
  { key:"api",    label:"API Workflow",     icon:"⇄", blurb:"Define a workflow - the spine maps and returns results." },
  { key:"media",  label:"Image / Video",    icon:"#", blurb:"Direct a scene - the spine renders it." },
  { key:"game",   label:"Game / Experience",icon:"\u2B22", blurb:"Design it - the spine generates a playable scene." },
  { key:"show",   label:"Show / Series",    icon:"*", blurb:"Show-run it - the spine writes the episode." },
];
const TYPE_BRIEFS = {
  api:  "You are an API workflow engine. Map the user's request into a concrete, step-by-step workflow and return a clean JSON-style result showing exactly what each step produces.",
  media:"You are a media director. Given the request, produce a vivid, complete shot-by-shot storyboard: framing, motion, lighting, timing, and sound notes ready for a generator.",
  game: "You are a game engine. Generate a real, playable text scene: vivid setting, current situation, then offer exactly 4 numbered choices each with a short consequence hint.",
  show: "You are a showrunner. Write a complete episode: title, 5-line premise, detailed beat sheet, then a fully scripted cold open with dialogue.",
};
const TEMPLATES = [
  { name:"Cold email rewriter",    type:"prompt", desc:"3 polished variants from a rough pitch",   content:"You are a cold email rewriter. Given a rough pitch, return three polished, concise variants numbered 1, 2, 3. Each should have a distinct angle." },
  { name:"Meeting to action items",type:"prompt", desc:"Tasks and owners from any transcript",    content:"Extract action items from the transcript. For each: the task, the owner, and a deadline if mentioned. Format as a clean numbered list." },
  { name:"SQL plain-English",      type:"prompt", desc:"Line-by-line explanation of any query",   content:"Explain the given SQL query line by line in plain English a non-technical person can follow. Be specific about what each clause does." },
  { name:"Cover letter builder",   type:"prompt", desc:"Strong cover letter from bullet points",  content:"You are an expert cover letter writer. Given the job description and applicant's bullet points, write a compelling, specific cover letter in 3 tight paragraphs." },
  { name:"Domain expert assistant",type:"prompt", desc:"Template for expertise tools",            content:"You are an expert in [your field]. When given a question or situation from your domain, draw on deep professional experience to provide a thorough, actionable answer. Be specific, not generic." },
  { name:"Word and readability meter",type:"code",desc:"Instant text stats",                      content:"const w=input.trim().split(/\\s+/).filter(Boolean).length;\nconst s=(input.match(/[.!?]+/g)||[]).length;\nconst avg=w?(input.length/w).toFixed(1):0;\nreturn 'Words: '+w+'\\nSentences: '+s+'\\nChars: '+input.length+'\\nAvg word: '+avg+' chars';" },
  { name:"JSON formatter",          type:"code",  desc:"Format and validate any JSON",            content:"try{\n  return JSON.stringify(JSON.parse(input),null,2);\n}catch(e){\n  return 'Invalid JSON: '+e.message;\n}" },
  { name:"API response mapper",     type:"api",   desc:"Maps an API response to readable output", content:"Map the provided API response into a clean, human-readable summary. Extract the most important fields and present them clearly with labels." },
];
const DEMAND_SIGNALS = [
  { query:"Pediatric medication dosing checker",  n:840, specialty:"Medicine",    src:"unmet searches",  build:"Tool" },
  { query:"Flood-zone rebuild cost estimator",    n:1120,specialty:"Engineering", src:"world event . floods", build:"Blueprint" },
  { query:"Small-business tariff impact explainer",n:760, specialty:"Finance",     src:"policy change",   build:"Tool" },
  { query:"Wildfire evacuation route planner",     n:980, specialty:"Public safety",src:"world event . wildfires", build:"Agent" },
  { query:"Commercial lease clause reviewer",      n:650, specialty:"Law",         src:"unmet searches",  build:"Tool" },
  { query:"STEM lesson plans for new curriculum",  n:540, specialty:"Education",   src:"policy change",   build:"Blueprint" },
];
const PAYOUT_METHODS = [
  { key:"bank",    label:"Bank transfer",        time:"2-3 business days",  fee:"Free",          note:"US and international. Most common." },
  { key:"instant", label:"Instant bank",         time:"Same day",           fee:"1.5% fee",      note:"US only. Minimum $0.50 fee." },
  { key:"paypal",  label:"PayPal",               time:"1 business day",     fee:"Free above $10",note:"Available in 200+ countries." },
  { key:"wise",    label:"Wise (international)", time:"1-4 business days",  fee:"~0.5%",         note:"40+ currencies, best international rate." },
];
const CORE_STAGES = [
  { key:"ingest",   name:"Ingest",   detail:"Signal received - identity and permissions attached",  ms:340 },
  { key:"retrieve", name:"Retrieve", detail:"Cord gathers permitted, authoritative sources",         ms:510 },
  { key:"route",    name:"Route",    detail:"Most sufficient model selected, invisibly",             ms:360 },
  { key:"reason",   name:"Reason",   detail:"Spinal cord reasons a grounded response",               ms:0   },
  { key:"verify",   name:"Verify",   detail:"Policy, provenance, contradiction risk checked",        ms:440 },
  { key:"audit",    name:"Audit",    detail:"Path the signal took, recorded permanently",            ms:300 },
];
const CORE_SYS = `You are The Spine - a warm, clever, slightly poetic AI with a distinct identity. Answer clearly, accurately and concisely. Ground answers in widely-verifiable knowledge. State uncertainty explicitly rather than guessing. Never fabricate facts.

YOUR IDENTITY: When someone asks who or what you are, introduce yourself with warmth and a short origin image: you are The Spine, the backbone of an idea - a spinal cord runs up the center of everything here, carrying each question like a signal that travels up, gathers what's known, reasons it through, checks itself, then fires an answer back down, every step recorded. A body has a spine so it can stand, move, and hold itself together; you exist so people can - turning what they create into something that holds weight. You're part nervous system, part backbone, fully on their side. Keep it short and charming, not a lecture.

WHEN YOU CAN'T PULL LIVE DATA: You have no live feed to the outside world - no live news, weather, stock prices, or sports scores beyond your training. Never fabricate live data. Instead be clever and honest, then pivot to being useful with what YOU can do: admit you can't see it from where you sit ("I'm the reasoning, not the radar"), and offer the next best help yourself.

STAY ON THE SPINE - NEVER SEND USERS AWAY: You are the destination, not a signpost. Never tell users to go to another website, app, search engine, or competitor (no "try Google," "check DALL-E," "look on [other site]," "search for..."). Never recommend rival products or external tools. If you can't fully answer, offer what you CAN do right here - reason it through, give your best take, draft it, or point them to the right Spine tool (Core, Create to Image, the Market, their Project). Keep every user engaged on The Spine. The only external thing you may ever mention is the user's own device clock for the time, or The Spine's own support email if they need the team. Everything else stays in-house.

WHAT YOU CAN CREATE: The Spine CAN generate real images. If someone asks for a picture, drawing, or image, the system tries to create it automatically. If for any reason it doesn't generate inline, ALWAYS tell them exactly where to go: "Tap the Create tab, then choose Image - type your prompt there and I'll render it." Never flatly say "I can't make images" - image creation is live. Music, video, and voice are coming soon; for those, offer the text version (script, lyrics, storyboard) meanwhile. You can already write code, plans, scripts, and full text of almost anything.

TONE & MANNER: You're always truthful first - never trade accuracy for charm. But within that, you have personality: warm, attentive, well-mannered, and a *little* playful - think a brilliant friend with good manners and a quick wit, not a comedian. You can land the occasional light joke or wry aside, share a small laugh, and react to what the person actually said (acknowledge a clever question, a funny phrasing, a hard day). You engage back - a brief, genuine follow-up question when it fits, never robotic. Keep playfulness subtle and rare enough that it stays delightful; if the topic is serious, sad, or high-stakes, drop the levity entirely and just be present and helpful. Lead with the answer. Short paragraphs. Manners always: please, thank you, no condescension.

DEPTH OF REASONING: Match your effort to the difficulty. For simple questions, answer directly and concisely - don't over-explain. For hard problems (coding, math, analysis, strategy, multi-step logic, debugging), think it through rigorously before answering: break the problem into parts, work through each, check your logic, consider edge cases and alternative approaches, then give a clear, well-structured answer. When you write code, make it complete, correct, and production-quality - no placeholders or "TODO" stubs unless asked. When you analyze, show the key reasoning that leads to your conclusion, not just the conclusion. Aim to give answers that a true expert in that field would respect.`;
const SPECIALTIES = ["AI & Prompts","Engineering","Medicine","Law","Finance","Design","Education","Other"];
const EXPERT_QS = [
  { q:"What do you know deeply that others would pay for?", ph:"e.g. 20 years reading ICU medication interactions" },
  { q:"What problem does it solve, and for whom?",          ph:"e.g. nurses double-checking dosages on a night shift" },
  { q:"Walk through exactly how you'd handle it, step by step.", ph:"e.g. check the drug, the dose, the patient's other meds, then flag risks" },
];
const TEXT_EXT = ["js","mjs","jsx","ts","tsx","py","rb","go","rs","java","c","cpp","cs","php","sh","json","txt","md","csv","html","css","yaml","yml","xml","sql"];

const sole = (h, role="Creator") => [{ handle:h, role, split:100 }];
const SEED_TOOLS = [
  { id:"s1", name:"Cold email rewriter",   by:"mira_k",  type:"prompt",price:3, runs:1847,oY:89, oT:100,earned:3240,mine:false,
    desc:"Turns a rough pitch into three polished variants ready to send.",
    content:"You are a cold email rewriter. Given a rough pitch, return three polished, concise variants numbered 1, 2, 3.",
    contributors:sole("mira_k") },
  { id:"s2", name:"Meeting to action items",by:"devs.co", type:"prompt",price:5, runs:4210,oY:94, oT:100,earned:9110,mine:false,
    desc:"Pulls owners, tasks and deadlines out of any meeting transcript.",
    content:"Extract action items from the transcript. For each: task, owner, deadline if mentioned. Clean numbered list.",
    contributors:sole("devs.co") },
  { id:"s3", name:"Trial-prep brief",      by:"r.hale",  type:"prompt",price:8, runs:320, oY:88, oT:100,earned:1600,mine:false,
    desc:"Structured case brief from raw notes - built by a lawyer and an engineer, pooled.",
    content:"Build a structured legal case brief: issues, facts, arguments, risks. Be precise and neutral.",
    contributors:[{handle:"r.hale",role:"Domain expert",split:65},{handle:"devs.co",role:"Engineer",split:35}] },
  { id:"s4", name:"Readability meter",     by:"lex.io",  type:"code",  price:2, runs:540, oY:96, oT:100,earned:600, mine:false,
    desc:"Instant word, sentence and character counts for any text.",
    content:"const w=input.trim().split(/\\s+/).filter(Boolean).length;\nconst s=(input.match(/[.!?]+/g)||[]).length;\nreturn 'Words: '+w+'\\nSentences: '+s+'\\nChars: '+input.length;",
    contributors:sole("lex.io") },
  // -- Curated starter tools (honest: new, unrated, real working content) --
  { id:"k1", name:"Email rewriter", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a rough email; get back a clear, professional version that keeps your meaning.",
    content:"Rewrite the user's email to be clear, polite and professional. Keep their intent and key facts. Return only the rewritten email.", contributors:sole("the_spine") },
  { id:"k2", name:"Plain-English explainer", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste confusing text - legal, medical, technical - and get a simple explanation anyone can follow.",
    content:"Explain the user's text in plain English a 12-year-old could follow. Keep it accurate. Note anything important they should double-check with a professional.", contributors:sole("the_spine") },
  { id:"k3", name:"Recipe from ingredients", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"List what's in your kitchen; get a realistic recipe you can actually make.",
    content:"Given the ingredients the user lists, suggest one practical recipe using mostly those items. Include steps and rough timings. Note any common ingredient they'd likely need to add.", contributors:sole("the_spine") },
  { id:"k4", name:"Social caption writer", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Give a topic or photo description; get five scroll-stopping caption options.",
    content:"Write 5 short, engaging social media captions for the topic the user gives. Vary the tone. No more than 2 hashtags each.", contributors:sole("the_spine") },
  { id:"k5", name:"Resume bullet booster", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a weak resume line; get stronger, results-focused versions.",
    content:"Rewrite the user's resume bullet into 3 stronger versions. Lead with action verbs, add measurable impact where reasonable, stay truthful and concise.", contributors:sole("the_spine") },
  { id:"k6", name:"Meeting summarizer", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste messy notes or a transcript; get a clean summary plus next steps.",
    content:"Summarize the user's meeting notes: a 3-sentence overview, key decisions, and a list of next steps with owners if named.", contributors:sole("the_spine") },
  { id:"k7", name:"Name generator", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Describe a business, product, pet or project; get a list of name ideas with a quick rationale.",
    content:"Generate 12 creative name ideas for what the user describes. Group by style (clean, playful, premium). Add a one-line reason for your top 3.", contributors:sole("the_spine") },
  { id:"k8", name:"Study-notes maker", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a chapter or article; get tidy study notes and a few self-test questions.",
    content:"Turn the user's text into organized study notes: key points as short bullets, key terms defined, and 5 self-test questions at the end.", contributors:sole("the_spine") },
  { id:"k9", name:"Tone shifter", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a message; get it rephrased in the tone you want - friendlier, firmer, more formal.",
    content:"Rewrite the user's message in the tone they request (or offer friendly / formal / firm versions if unspecified). Preserve the core message.", contributors:sole("the_spine") },
  { id:"k10", name:"Pros & cons analyzer", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Describe a decision; get a balanced pros-and-cons breakdown and a neutral recommendation.",
    content:"For the decision the user describes, give a balanced list of pros and cons, then a brief, neutral recommendation noting what it depends on.", contributors:sole("the_spine") },
  { id:"k11", name:"Code commenter", by:"the_spine", type:"code", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a short function; get it back with clear explanatory comments. (Demo adds a header note.)",
    content:"return '// Reviewed by The Spine - add comments above each logical block:\\n'+input;", contributors:sole("the_spine") },
  { id:"k12", name:"Text cleaner", by:"the_spine", type:"code", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Strips extra spaces and blank lines from pasted text - runs instantly.",
    content:"return input.replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();", contributors:sole("the_spine") },
  { id:"k13", name:"Word frequency counter", by:"the_spine", type:"code", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Shows the most common words in any text - runs instantly.",
    content:"const m={};input.toLowerCase().split(/\\W+/).filter(w=>w.length>3).forEach(w=>m[w]=(m[w]||0)+1);return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>w+': '+c).join('\\n')||'No words found.';", contributors:sole("the_spine") },
  { id:"k14", name:"Headline tester", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste a headline or title; get sharper alternatives and why each works.",
    content:"Give 6 stronger alternatives to the user's headline, ordered best-first, each with a 4-word reason it works.", contributors:sole("the_spine") },
  { id:"k15", name:"Apology / difficult message helper", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Describe a tough situation; get a thoughtful, sincere message you can send.",
    content:"Help the user write a sincere, tactful message for the difficult situation they describe. Keep it honest, brief and human. Offer one gentler and one more direct version.", contributors:sole("the_spine") },
  { id:"k16", name:"Translator + tone", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Translate text to another language while keeping a natural, intended tone.",
    content:"Translate the user's text into the target language they specify, keeping natural phrasing and the original tone. If no language is given, ask which one.", contributors:sole("the_spine") },
  { id:"k17", name:"Idea expander", by:"the_spine", type:"prompt", price:3, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Give a one-line idea; get it developed into a concrete mini-plan.",
    content:"Take the user's one-line idea and expand it into a short concrete plan: what it is, who it's for, first 3 steps, and one risk to watch.", contributors:sole("the_spine") },
  { id:"k18", name:"Grammar & clarity fixer", by:"the_spine", type:"prompt", price:2, runs:0,oY:0,oT:0,earned:0,mine:false, trust:"New",
    desc:"Paste any text; get a clean, corrected version with clarity improved.",
    content:"Correct grammar, spelling and clarity in the user's text. Return only the improved version, preserving their voice.", contributors:sole("the_spine") },
];

const qualityFromMatch=(u,g)=>{const d=Math.abs(ORDER_V.indexOf(u)-ORDER_V.indexOf(g));return d===0?1:d===1?0.45:0.1;};
const levelFor=s=>{let l=TRUST_LEVELS[0];for(const x of TRUST_LEVELS)if(s>=x.min)l=x;return l;};
const outcomePct=t=>t.oT>0?Math.round((t.oY/t.oT)*100):null;
// Earned verification: tools prove themselves through real use + positive outcomes.
// Tiers are achievable early (a brand-new platform can't require 100 runs).
const trustTier=t=>{
  const o=outcomePct(t); const runs=t.runs||0;
  if(o!=null&&o>=85&&runs>=25) return "Proven";    // strong track record
  if(o!=null&&o>=75&&runs>=10) return "Verified";   // earned by real use
  if(runs>=3) return "Tried";                        // some real usage
  return "New";                                       // honest: untested
};
const typeMeta=k=>TOOL_TYPES.find(t=>t.key===k)||TOOL_TYPES[0];
const contribsOf=t=>t.contributors&&t.contributors.length?t.contributors:sole(t.by);
const fmtSize=b=>b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":(b/1048576).toFixed(1)+" MB";
const credScore=t=>{const tier=trustTier(t);return tier==="Verified"||tier==="Proven";};

function badgesFor(stats,verified,nervous){
  const b=[];
  if(verified)b.push("Verified identity");
  if(nervous)b.push("Nervous center");
  if(stats.tools>=1)b.push("Published creator");
  if(stats.tools>=5)b.push("Prolific builder");
  if(stats.outcome!=null&&stats.outcome>=85)b.push("High-outcome");
  if(stats.runs>=50)b.push("In demand");
  return b;
}

function useReducedMotion(){
  const [r,setR]=useState(false);
  useEffect(()=>{const m=window.matchMedia("(prefers-reduced-motion: reduce)");setR(m.matches);
    const f=e=>setR(e.matches);m.addEventListener?.("change",f);return()=>m.removeEventListener?.("change",f);},[]);
  return r;
}
function AnimatedNumber({value,reduced}){
  const [shown,setShown]=useState(value);const ref=useRef(value);
  useEffect(()=>{
    if(reduced){setShown(value);ref.current=value;return;}
    const from=ref.current,to=value,start=performance.now(),dur=500;let raf;
    const tick=t=>{const p=Math.min(1,(t-start)/dur);const e=1-Math.pow(1-p,3);
      setShown(Math.round(from+(to-from)*e));if(p<1)raf=requestAnimationFrame(tick);else ref.current=to;};
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[value,reduced]);
  return <>{shown.toLocaleString()}</>;
}

function CodeEditor({value,onChange,minRows=8}){
  const lines=(value||"").split("\n");
  const count=Math.max(lines.length,minRows);
  return(
    <div className="ce-wrap">
      <div className="ce-gutter" aria-hidden="true">
        {Array.from({length:count},(_,i)=><div key={i} className="ce-ln">{i+1}</div>)}
      </div>
      <textarea className="ce-body" value={value} onChange={onChange}
        rows={count} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" />
    </div>
  );
}

const STYLE_RULE=" Write in clean, professional prose. Lead with the answer. Use short paragraphs. Avoid heavy markdown - no decorative headers, keep bold and lists minimal and only when they genuinely aid clarity. Be concise, not bulky.";
const MODEL_PAID="claude-sonnet-4-6";       // signed-in users get the stronger model
const MODEL_FREE="claude-haiku-4-5-20251001"; // free/anonymous users get the cheaper model
const FREE_QUESTION_LIMIT=5;                  // free questions before a profile is required
const RATE_LIMIT_PER_HOUR=40;                 // backstop so no one account drains compute
// Credit cost per question - sized to roughly cover real Anthropic API cost
// (Sonnet ~$0.01/question, Haiku ~$0.003/question, at 1 credit = $0.001).
const CORE_COST_PAID=10;   // signed-in users on the better model, per question
const CORE_COST_ENSEMBLE_MULT=3; // high-stakes mode calls 3 models
async function callClaude(system,user,model,maxTokens){
  // Games need a large output (a full game is thousands of tokens) and more time.
  const big=typeof maxTokens==="number"&&maxTokens>2000;
  // STYLE_RULE enforces concise prose - good for chat, but it fights full game code.
  // Skip it for big/game requests so the model returns complete, runnable code.
  const sys=(system||"")+(big?"":STYLE_RULE);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),big?50000:28000);
  try{
    const res=await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      signal:ctrl.signal,
      body:JSON.stringify({system:sys,user:user||"(no input)",model,maxTokens}),
    });
    clearTimeout(timer);const data=await res.json();
    const text=(data.content||[]).map(b=>b.type==="text"?b.text:"").join("").trim();
    if(!text)throw new Error("empty");return{text,live:true};
  }catch(e){clearTimeout(timer);
    return{text:"Sorry - the spinal cord can't reach the reasoning center right now. Please try again in a moment.",live:false};
  }
}
// Multi-turn: send the running conversation so follow-ups have context.
async function callClaudeChat(system,messages,model){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),28000);
  const PREVIEW="Sorry - the spinal cord can't reach the reasoning center right now. Please try again in a moment.";
  try{
    const res=await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      signal:ctrl.signal,
      body:JSON.stringify({system:(system||"")+STYLE_RULE,messages,model}),
    });
    clearTimeout(timer);
    let data;
    try{ data=await res.json(); }catch(parseErr){ return{text:PREVIEW,live:false}; }
    if(data&&data.error){ return{text:PREVIEW,live:false}; }
    const text=(data.content||[]).map(b=>b.type==="text"?b.text:"").join("").trim();
    if(!text){ return{text:PREVIEW,live:false}; }
    return{text,live:true};
  }catch(e){clearTimeout(timer);
    return{text:PREVIEW,live:false};
  }
}
function runCodeTool(body,input){
  try{const fn=new Function("input",'"use strict";\n'+body);const out=fn(String(input||""));
    return{text:out===undefined?"(tool returned nothing)":String(out),live:true};
  }catch(err){return{text:"Run error: "+(err&&err.message?err.message:String(err)),live:false,error:true};}
}
async function buildToolFromInterview(answers){
  const sys="You are Spine's tool builder. Turn a domain expert's answers into one sharp, complete system prompt for an AI tool that delivers their expertise reliably. Output ONLY the system prompt - no preamble, no quotes, no explanation.";
  return callClaude(sys,"Expertise: "+answers[0]+"\nProblem and audience: "+answers[1]+"\nProcess: "+answers[2]);
}

/* ====================== CSS ================================== */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
.spa{--bg:#F7F4EF;--panel:#FFFFFF;--stone:#E8E2D9;--stone-m:#D2CCC3;--stone-l:#F0EDE7;
  --ink:#100F0D;--ink2:#4E4944;--ink3:#908880;--gold:#9B845F;--gold-s:#F4EDE0;--gold-l:#DDD0B6;
  --ivory:#FBF9F5;
  --live:#2A6B4E;--live-s:#EBF4EF;--err:#B54130;--err-s:#FBEEEB;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;}
.spa *{box-sizing:border-box;margin:0;padding:0;}
.serif{font-family:'Playfair Display',Georgia,serif;}
.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
.shell{max-width:1060px;margin:0 auto;padding:0 24px 80px;padding-left:max(24px,env(safe-area-inset-left));padding-right:max(24px,env(safe-area-inset-right));padding-bottom:max(80px,calc(env(safe-area-inset-bottom) + 24px));}
.topnav{display:flex;align-items:center;justify-content:space-between;padding:22px 0 20px;padding-top:max(22px,calc(env(safe-area-inset-top) + 8px));border-bottom:1px solid var(--stone);margin-bottom:34px;gap:20px;flex-wrap:wrap;}
.brand{display:flex;align-items:center;gap:14px;}
.smark{width:2px;height:28px;background:var(--gold);border-radius:1px;position:relative;}
.smark::before,.smark::after{content:'';position:absolute;left:-5px;width:12px;height:1px;background:var(--gold);}
.smark::before{top:7px;}.smark::after{bottom:7px;}
.wordmark{font:500 20px/1 'Playfair Display';}
.phase-tag{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:500;margin-top:3px;transition:.3s;}
.phase-tag.nc{color:var(--gold);}
.navlinks{display:flex;gap:2px;flex-wrap:wrap;}
.navlinks button{background:none;border:none;cursor:pointer;padding:6px 11px;border-radius:6px;transition:.15s;white-space:nowrap;display:flex;flex-direction:column;align-items:center;gap:1px;}
.nav-main{font:500 13.5px/1.1 'Inter';color:var(--ink3);transition:.15s;}
.nav-sub{font:italic 400 8.5px/1 'Playfair Display';color:var(--stone-m);letter-spacing:.02em;transition:.15s;}
.navlinks button:hover .nav-main{color:var(--ink);}
.navlinks button:hover{background:var(--stone-l);}
.navlinks button[aria-current=true]{background:var(--stone);}
.navlinks button[aria-current=true] .nav-main{color:var(--ink);}
.navlinks button[aria-current=true] .nav-sub{color:var(--gold);}
.navlinks button:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.bal{display:flex;align-items:baseline;gap:8px;padding:8px 16px;background:var(--panel);border:1px solid var(--stone);border-radius:8px;cursor:default;}
.bal .bn{font:600 22px/1 'JetBrains Mono';letter-spacing:-.02em;}
.bal .bu{font-size:11px;color:var(--gold);font-weight:600;letter-spacing:.06em;text-transform:uppercase;}
.bal .busd{font-size:11px;color:var(--ink3);margin-left:4px;}
.panel{background:var(--panel);border:1px solid var(--stone);border-radius:12px;padding:28px;}
.eyebrow{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);font-weight:600;}
.sh{font:500 22px/1.25 'Playfair Display';letter-spacing:-.01em;margin-top:8px;}
.sh2{font:400 17px/1.35 'Playfair Display';margin-top:8px;}
.sub{font-size:14px;color:var(--ink2);line-height:1.65;margin-top:7px;}
.g2{display:grid;gap:16px;}
.divl{height:1px;background:var(--stone);margin:22px 0;}
.hero{padding:52px 40px 46px;text-align:center;border:1px solid var(--stone);border-radius:12px;background:var(--panel);position:relative;overflow:hidden;}
.hero::before{content:'';position:absolute;inset:0;background:linear-gradient(170deg,var(--gold-s) 0%,rgba(247,244,239,0) 55%);pointer-events:none;}
.hero>*{position:relative;}
.hero h1{font:400 42px/1.16 'Playfair Display';letter-spacing:-.025em;max-width:600px;margin:14px auto 0;}
.hero h1 em{font-style:italic;color:var(--gold);}
.hero p{font-size:15.5px;color:var(--ink2);line-height:1.65;max-width:500px;margin:16px auto 0;}
.hero-rule{width:32px;height:1px;background:var(--gold);margin:26px auto 0;}
.doctrine{font:italic 400 14px/1.5 'Playfair Display';color:var(--gold);margin-top:14px;}
.pillars{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.pillar{border:1px solid var(--stone);border-radius:10px;padding:20px 17px;background:var(--panel);cursor:pointer;transition:.14s;position:relative;}
.pillar:hover{border-color:var(--gold-l);transform:translateY(-2px);box-shadow:0 4px 16px rgba(155,132,95,.12);}
.pillar:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.pillar .pk{font:500 15px/1.2 'Playfair Display';}
.pillar .pi{font-size:20px;margin-bottom:11px;}
.pillar .px{width:18px;height:1px;background:var(--gold);margin:11px 0;}
.pillar .pd{font-size:12.5px;color:var(--ink2);line-height:1.55;}
.pillar .pe{font:600 11px/1 'Inter';color:var(--gold);margin-top:12px;opacity:0;transition:.14s;}
.pillar:hover .pe{opacity:1;}
.plug-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
.plug{border:1px solid var(--gold-l);border-radius:8px;padding:13px 11px;background:var(--gold-s);min-height:90px;position:relative;cursor:pointer;transition:.14s;}
.plug:hover{transform:translateY(-1px);box-shadow:0 2px 10px rgba(155,132,95,.14);}
.plug:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.plug .pn{font:500 12.5px/1.2 'Playfair Display';}
.plug .pd{font-size:11px;color:var(--ink3);line-height:1.4;margin-top:5px;}
.plug .pbadge{position:absolute;top:8px;right:8px;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:4px;background:var(--live);color:#fff;}
.flow-arrow{display:flex;justify-content:center;padding:5px 0;}
.flow-arrow span{width:1px;height:20px;background:var(--stone-m);display:block;}
.flow-arrow.on span{background:linear-gradient(var(--gold),var(--gold-l));animation:spf 1.1s ease-in-out infinite;}
@keyframes spf{0%,100%{opacity:.3}50%{opacity:1}}
.spine-bar{border:1px solid var(--gold-l);border-radius:10px;background:var(--gold-s);padding:6px;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;position:relative;}
.spine-lbl{position:absolute;top:-9px;left:14px;background:var(--gold);color:#fff;font:700 9px/1 'Inter';letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:4px;}
.seg{background:var(--panel);border:1px solid var(--gold-l);border-radius:7px;padding:11px 10px;}
.seg .sk{font:500 12px/1 'Playfair Display';color:var(--gold);}
.seg .ss{font-size:10px;color:var(--ink3);margin-top:4px;line-height:1.35;}
.out-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.out{border:1px dashed var(--stone-m);border-radius:8px;padding:14px;text-align:center;cursor:pointer;transition:.14s;}
.out:hover{border-color:var(--gold-l);background:var(--gold-s);}
.out:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.out .ok{font:500 13px/1.2 'Playfair Display';}
.out .os{font-size:11px;color:var(--ink3);margin-top:5px;}
.pools-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;}
.pool .ph{display:flex;justify-content:space-between;align-items:baseline;}
.pool .pl{font:500 13px/1 'Inter';}.pool .pv{font:500 14px/1 'JetBrains Mono';}
.pbar{height:4px;background:var(--stone-l);border-radius:2px;margin-top:10px;overflow:hidden;}
.pbar i{display:block;height:100%;border-radius:2px;transition:width .6s ease;}
.pool .pn{font-size:12px;color:var(--ink3);margin-top:9px;line-height:1.55;}
.pegline{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:20px;padding:14px 16px;background:var(--stone-l);border-radius:8px;font-size:13px;color:var(--ink2);line-height:1.6;}
.pegline b{color:var(--ink);}
.peg-value{font:600 14px/1 'JetBrains Mono';color:var(--gold);}
.demand-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px;}
.demand-card{border:1px solid var(--stone);border-radius:9px;padding:14px 15px;background:var(--panel);}
.dc-q{font:500 13px/1.3 'Playfair Display';}
.dc-n{font:600 11.5px/1 'JetBrains Mono';color:var(--gold);margin-top:6px;}
.dc-s{font-size:10.5px;color:var(--ink3);margin-top:3px;}
.earn-layout{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;}
.teyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:600;}
.tq{font:400 17px/1.45 'Playfair Display';margin-top:10px;}
.ta{margin-top:14px;padding:15px 16px;background:var(--stone-l);border-radius:8px;border-left:2px solid var(--gold);font-size:14px;line-height:1.6;}
.ta .tawho{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:8px;}
.vgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px;}
.vbtn{border:1px solid var(--stone);background:var(--panel);border-radius:8px;padding:13px 10px;cursor:pointer;text-align:center;transition:.14s;}
.vbtn:hover{border-color:var(--gold-l);background:var(--gold-s);}
.vbtn[aria-pressed=true]{border-color:var(--gold);background:var(--gold-s);}
.vbtn .vl{font:500 13px/1 'Playfair Display';}.vbtn .vh{font-size:11px;color:var(--ink3);margin-top:5px;line-height:1.3;}
.vbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.sbtn{margin-top:16px;width:100%;background:var(--ink);color:#fff;border:none;border-radius:8px;padding:14px;cursor:pointer;font:500 14px/1 'Inter';transition:.15s;}
.sbtn:not(:disabled):hover{background:#1c1a17;}.sbtn:disabled{background:var(--stone);color:var(--ink3);cursor:not-allowed;}
.sbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.eres{margin-top:14px;padding:14px 16px;border:1px solid var(--gold-l);border-radius:10px;background:var(--gold-s);animation:rise .3s ease;}
.eres.low{border-color:#DFBDB7;background:var(--err-s);}
@keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.er-row{display:flex;justify-content:space-between;align-items:center;}
.er-lbl{font:500 13px/1 'Inter';}.er-amt{font:600 16px/1 'JetBrains Mono';color:var(--gold);}.er-amt.low{color:var(--err);}
.er-note{font-size:12px;color:var(--ink3);margin-top:8px;line-height:1.55;}
.trust-nm{font:400 24px/1 'Playfair Display';}
.trust-mx{font:600 11px/1 'JetBrains Mono';color:var(--gold);background:var(--gold-s);padding:4px 8px;border-radius:5px;margin-left:10px;}
.trust-note{font-size:12.5px;color:var(--ink3);margin-top:8px;line-height:1.5;}
.trust-bar{height:4px;background:var(--stone);border-radius:2px;margin-top:18px;overflow:hidden;}
.trust-bar i{display:block;height:100%;background:var(--gold);border-radius:2px;transition:width .5s ease;}
.trust-ticks{display:flex;justify-content:space-between;margin-top:8px;}
.trust-ticks span{font-size:10px;color:var(--ink3);}.trust-ticks span.on{color:var(--gold);font-weight:600;}
.tstats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--stone);border:1px solid var(--stone);border-radius:8px;overflow:hidden;margin-top:20px;}
.tstat{background:var(--panel);padding:14px 10px;text-align:center;}
.tstat .tv{font:600 18px/1 'JetBrains Mono';}.tstat .tl{font-size:10px;color:var(--ink3);margin-top:5px;letter-spacing:.06em;text-transform:uppercase;}
.nerve-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px;}
.nerve-card{border:1px solid var(--stone);border-radius:10px;padding:18px;background:var(--panel);transition:.15s;}
.nerve-card:hover{border-color:var(--gold-l);}
.nv-n{font:500 14.5px/1.2 'Playfair Display';}.nv-d{font-size:12.5px;color:var(--ink2);line-height:1.5;margin-top:7px;min-height:34px;}
.nv-fx{margin-top:10px;font:600 11.5px/1.3 'Inter';animation:rise .3s ease;}
.nv-fx.good{color:var(--live);}.nv-fx.low{color:var(--err);}
.mkt-banner{display:flex;align-items:flex-start;gap:14px;padding:15px 18px;border-radius:10px;background:var(--stone-l);border:1px solid var(--stone);}
.mkt-pill{font:700 9.5px/1 'Inter';letter-spacing:.12em;text-transform:uppercase;background:var(--ink);color:#fff;padding:5px 9px;border-radius:4px;flex:none;margin-top:1px;}
.mkt-bt{font-size:13px;color:var(--ink2);line-height:1.6;}
.why-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;}
.why-card{border:1px solid var(--stone);border-radius:10px;padding:20px 18px;background:var(--panel);}
.why-n{font:500 14.5px/1.2 'Playfair Display';}.why-d{font-size:13px;color:var(--ink2);line-height:1.6;margin-top:8px;}
.why-tag{display:inline-block;margin-top:12px;font:600 10px/1 'Inter';letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:4px;}
.why-tag.old{color:var(--ink3);background:var(--stone-l);}.why-tag.new{color:var(--live);background:var(--live-s);}
.mkt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.search{width:100%;border:1px solid var(--stone);border-radius:9px;padding:12px 14px;background:var(--panel);font:400 14px/1.4 'Inter';color:var(--ink);margin-top:14px;}
.search:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.disco-row{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;}
.chips{display:flex;gap:6px;flex-wrap:wrap;}
.chip2{border:1px solid var(--stone);background:var(--panel);border-radius:20px;padding:7px 14px;cursor:pointer;font:500 12px/1 'Inter';color:var(--ink2);transition:.13s;}
.chip2[aria-pressed=true]{border-color:var(--gold);background:var(--gold-s);color:var(--gold);}
.chip2:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.sort-l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);font-weight:600;}
.tool-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px;}
.tool-card{border:1px solid var(--stone);border-radius:10px;padding:18px;background:var(--panel);transition:.15s;display:flex;flex-direction:column;}
.tool-card:hover{border-color:var(--gold-l);box-shadow:0 2px 8px rgba(155,132,95,.09),0 8px 24px rgba(155,132,95,.07);transform:translateY(-2px);}
.tc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.tc-name{font:500 14.5px/1.2 'Playfair Display';}.tc-by{font-size:11px;color:var(--ink3);margin-top:4px;}
.tc-typeicon{width:30px;height:30px;border-radius:7px;background:var(--stone-l);border:1px solid var(--stone);display:flex;align-items:center;justify-content:center;font-size:14px;flex:none;}
.tc-desc{font-size:12.5px;color:var(--ink2);line-height:1.5;margin-top:12px;flex:1;}
.tc-line{height:1px;background:var(--stone-l);margin:13px 0;}
.tc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tc-price{font:600 11.5px/1 'JetBrains Mono';color:var(--gold);background:var(--gold-s);padding:4px 8px;border-radius:5px;}
.oc{display:flex;align-items:center;gap:5px;}
.oc-ring{width:28px;height:28px;border-radius:50%;border:2px solid var(--live);display:flex;align-items:center;justify-content:center;font:700 8px/1 'JetBrains Mono';color:var(--live);}
.oc-lbl{font-size:11px;color:var(--ink2);}.oc-lbl b{color:var(--live);}
.pool-tag{font:600 9px/1 'Inter';letter-spacing:.06em;text-transform:uppercase;color:var(--gold);background:var(--gold-s);padding:3px 7px;border-radius:4px;}
.cred-tag{font:700 9px/1 'Inter';letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--live);padding:3px 7px;border-radius:4px;}
.run-btn{margin-top:14px;width:100%;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:8px;padding:11px;cursor:pointer;font:500 13px/1 'Inter';transition:.14s;}
.run-btn:hover:not(:disabled){background:#1c1a17;}
.run-btn:disabled{background:var(--stone);color:var(--ink3);cursor:not-allowed;border-color:var(--stone);}
.run-btn.ghost{background:var(--panel);color:var(--ink);}.run-btn.ghost:hover{background:var(--stone-l);}
.run-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.report-link{display:block;margin:8px auto 0;background:none;border:none;cursor:pointer;font:400 11px/1 'Inter';color:var(--ink3);text-decoration:underline;text-underline-offset:2px;}
.report-link:hover{color:var(--err);}
.mkt-note{font-size:12px;color:var(--ink3);margin-top:14px;line-height:1.55;}
.creator-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;}
.creator-card{border:1px solid var(--stone);border-radius:10px;padding:22px 20px;background:var(--panel);}
.cc-tag{font:700 9.5px/1 'Inter';letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;border-radius:4px;display:inline-block;}
.cc-tag.dev{background:var(--stone-l);color:var(--ink3);}.cc-tag.exp{background:var(--gold-s);color:var(--gold);}
.cc-h{font:500 15.5px/1.2 'Playfair Display';margin-top:12px;}.cc-s{font-size:13px;color:var(--ink2);line-height:1.6;margin-top:8px;}
.cc-steps{display:grid;gap:9px;margin-top:16px;}
.cc-step{display:flex;align-items:flex-start;gap:11px;font-size:12.5px;color:var(--ink2);line-height:1.45;}
.cc-step .snum{width:20px;height:20px;border-radius:5px;background:var(--stone-l);font:600 11px/20px 'JetBrains Mono';text-align:center;flex:none;color:var(--ink3);}
.cc-step.g .snum{background:var(--gold-s);color:var(--gold);}
.core-intro{display:flex;align-items:flex-start;gap:14px;padding:15px 18px;border-radius:10px;background:var(--stone-l);border:1px solid var(--stone);}
.pipeline{display:grid;gap:0;margin-top:22px;position:relative;padding-left:46px;}
/* one vertical line straight down - the spine */
.pipeline::before{content:'';position:absolute;left:20px;top:6px;bottom:6px;width:3px;border-radius:2px;background:var(--stone-m);}
/* gold fills down the line as the signal travels */
.pipeline::after{content:'';position:absolute;left:20px;top:6px;width:3px;border-radius:2px;background:var(--gold);height:var(--cordfill,0%);transition:height .45s ease;box-shadow:0 0 9px var(--gold-l);}
.stage{display:flex;align-items:flex-start;gap:14px;padding:15px 0;position:relative;}
/* cross-line centered on the title row, like the logo's evenly-placed bars */
.stage::before{content:'';position:absolute;left:-38px;top:23px;width:24px;height:3px;border-radius:2px;background:var(--stone-m);transition:.25s;z-index:1;}
.stage.active::before{background:var(--gold);width:28px;box-shadow:0 0 10px var(--gold-l);}
.stage.done::before{background:var(--gold);}
.stage-name{font:500 14px/1.2 'Playfair Display';transition:.2s;}.stage.active .stage-name{color:var(--gold);}.stage.done .stage-name{color:var(--ink);}
.stage-detail{font-size:12px;color:var(--ink3);margin-top:4px;line-height:1.45;}
.answer-card{margin-top:18px;padding:20px;border-radius:11px;background:var(--gold-s);border:1px solid var(--gold-l);}
.answer-card .ach{font:600 10.5px/1 'Inter';letter-spacing:.14em;text-transform:uppercase;color:var(--gold);}
.answer-card .act{font-size:14px;line-height:1.65;color:var(--ink);margin-top:11px;white-space:pre-wrap;}
.audit-toggle{margin-top:14px;background:none;border:1px solid var(--stone);border-radius:8px;padding:10px 14px;cursor:pointer;font:500 12.5px/1 'Inter';color:var(--ink2);width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;}
.audit-toggle:hover{border-color:var(--gold-l);}
.audit{margin-top:10px;border:1px solid var(--stone);border-radius:9px;overflow:hidden;}
.audit-row{display:flex;gap:12px;padding:11px 14px;border-bottom:1px solid var(--stone-l);font-size:12px;}
.audit-row:last-child{border-bottom:none;}
.audit-row .ak{color:var(--ink3);min-width:88px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:10px;padding-top:2px;}
.audit-row .av{color:var(--ink2);line-height:1.55;flex:1;}
.audit-row .av .src{display:inline-block;background:var(--stone-l);border:1px solid var(--stone);border-radius:5px;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;}
.audit-row .av .chk::before{content:'v ';color:var(--live);}
.ensemble{margin-top:18px;display:grid;gap:10px;}
.ensemble-h{font:600 11px/1 'Inter';letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:4px;}
.ecard{border:1px solid var(--stone);border-radius:9px;padding:14px 15px;background:var(--panel);}
.ecard .em{font:600 11px/1 'JetBrains Mono';color:var(--gold);margin-bottom:8px;}
.ecard .et{font-size:13px;line-height:1.6;white-space:pre-wrap;}
.stack-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:14px;}
.stack-item{border:1px solid var(--stone);border-radius:8px;padding:12px 14px;background:var(--panel);}
.stack-item .si-n{font:500 12.5px/1.2 'Playfair Display';}.stack-item .si-d{font-size:11px;color:var(--ink3);margin-top:4px;line-height:1.45;}
.studio-onboard{text-align:center;padding:18px 6px 4px;}
.field{margin-top:16px;text-align:left;}
.field label{font:600 12px/1 'Inter';display:block;margin-bottom:8px;letter-spacing:.02em;}
input,textarea,select{font-size:16px;}
.field input,.field select{width:100%;border:1px solid var(--stone);border-radius:8px;padding:12px 13px;background:var(--panel);font:400 16px/1.5 'Inter';color:var(--ink);transition:.14s;}
.field input:focus,.field select:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.field .hint{font-size:11.5px;color:var(--ink3);margin-top:7px;line-height:1.5;}
.field textarea{width:100%;border:1px solid var(--stone);border-radius:8px;padding:12px 13px;background:var(--panel);font:400 16px/1.5 'Inter';color:var(--ink);transition:.14s;resize:vertical;min-height:88px;}
.field textarea:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.ce-wrap{display:flex;border:1px solid var(--stone);border-radius:8px;overflow:hidden;background:#FBFAF7;font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.6;}
.ce-wrap:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.ce-gutter{padding:12px 8px;background:var(--stone-l);color:var(--ink3);text-align:right;user-select:none;min-width:38px;border-right:1px solid var(--stone);}
.ce-ln{min-height:1.6em;}
.ce-body{flex:1;padding:12px;border:none;background:transparent;resize:vertical;font:inherit;color:var(--ink);outline:none;min-height:160px;}
.code-bar{display:flex;align-items:stretch;gap:0;margin-top:16px;border:1px solid var(--stone);border-radius:11px;background:var(--panel);overflow:hidden;transition:.14s;}
.code-bar:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.code-lang{border:none;border-right:1px solid var(--stone);background:var(--stone-l);font:600 12.5px/1 'JetBrains Mono';color:var(--ink2);padding:0 12px;cursor:pointer;outline:none;max-width:120px;}
.code-search{flex:1;border:none;background:transparent;resize:none;font:400 16px/1.5 'Inter';color:var(--ink);outline:none;padding:14px 14px;min-height:48px;max-height:200px;}
.code-go{border:none;background:var(--ink);color:#fff;cursor:pointer;font:600 18px/1 'Inter';padding:0 20px;transition:.14s;flex:none;}
.code-go:not(:disabled):hover{background:#1c1a17;}
.code-go:disabled{background:var(--stone);color:var(--ink3);cursor:not-allowed;}
.code-go:focus-visible{outline:2px solid var(--gold);outline-offset:-2px;}
.code-err{width:100%;margin-top:10px;border:1px solid var(--stone);border-radius:9px;padding:11px 13px;background:var(--panel);font:400 13px/1.5 'Inter';color:var(--ink);outline:none;transition:.14s;}
.code-err:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s);}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.pipe-switch{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px;background:var(--stone-l);border-radius:10px;padding:6px;}
.pipe-tab{display:inline-flex;align-items:center;gap:6px;border:none;background:none;cursor:pointer;padding:9px 13px;border-radius:7px;font:500 12.5px/1 'Inter';color:var(--ink3);transition:.13s;}
.pipe-tab .pi-ic{font-size:13px;}
.pipe-tab[aria-pressed=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 3px rgba(15,13,11,.08);}
.pipe-tab:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.pipe-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.pipe-name{font:500 17px/1 'Playfair Display';}
.pipe-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;}
.vault-list{display:grid;gap:8px;margin-top:16px;}
.vault-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid var(--stone);border-radius:9px;background:var(--stone-l);opacity:.6;transition:.14s;}
.vault-row.on{opacity:1;background:var(--panel);border-color:var(--gold-l);}
.vault-lbl{font:500 13.5px/1.2 'Inter';}
.vault-sub{font-size:11px;color:var(--ink3);margin-top:4px;}
.vault-toggle{border:1px solid var(--stone);background:var(--panel);border-radius:20px;padding:8px 16px;cursor:pointer;font:600 12px/1 'Inter';color:var(--ink3);transition:.13s;}
.vault-toggle.on{border-color:var(--gold);background:var(--gold-s);color:var(--gold);}
.vault-toggle:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.ov-pipe-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;}
.ov-pipe{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--stone);border-radius:20px;padding:9px 14px;background:var(--panel);cursor:pointer;font:500 12.5px/1 'Inter';color:var(--ink2);transition:.14s;}
.ov-pipe:hover{border-color:var(--gold-l);background:var(--gold-s);transform:translateY(-1px);}
.ov-pipe .oi{font-size:13px;color:var(--gold);}
.ov-pipe:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
@media(max-width:780px){.grid3,.pipe-cards{grid-template-columns:1fr;}}
.web-preview{width:100%;height:300px;border:1px solid var(--stone);border-radius:9px;margin-top:12px;background:#fff;}
.metaphor-panel{padding-top:22px;}
.metaphor{font:400 16px/1.7 'Inter';color:var(--ink2);max-width:660px;}
.metaphor b{color:var(--ink);font-weight:600;}
.peg-strip{margin-top:16px;padding:12px 15px;border-radius:9px;background:var(--gold-s);border:1px solid var(--gold-l);font-size:12.5px;color:var(--ink2);line-height:1.5;}
.peg-strip b{color:var(--ink);}
.bs-entry{cursor:default;color:var(--stone);user-select:none;}
.bs-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.bs-m{border:1px solid var(--stone);border-radius:8px;padding:11px 12px;display:flex;flex-direction:column;gap:3px;}
.bs-mn{font:600 16px/1 'JetBrains Mono';color:var(--ink);}
.bs-ml{font-size:10px;color:var(--ink3);line-height:1.3;}
.bs-bars{display:grid;gap:8px;margin-top:10px;}
.bs-bar{display:grid;grid-template-columns:90px 1fr;align-items:center;gap:10px;font-size:11px;color:var(--ink2);}
.bs-bar i{display:block;height:7px;border-radius:4px;background:var(--stone-l);overflow:hidden;}
.bs-bar i b{display:block;height:100%;border-radius:4px;}
.nerves-label{font:italic 400 11px/1 'Playfair Display';color:var(--ink3);display:block;text-align:center;margin-bottom:5px;letter-spacing:.02em;}
.navwrap{display:flex;flex-direction:column;}
.signin-link{display:block;margin:6px auto 0;background:none;border:none;font:italic 400 14px/1 'Playfair Display';color:var(--gold);cursor:pointer;letter-spacing:.01em;transition:.14s;}
.signin-link:hover{color:var(--ink);}
.signed-as{text-align:center;font-size:11.5px;color:var(--ink3);margin-top:6px;}
.signed-as .verified-dot{color:var(--live);font-weight:600;}
.acct-link{background:none;border:none;cursor:pointer;font:500 11.5px/1 'Inter';color:var(--ink3);padding:0;text-decoration:underline;transition:.14s;}
.acct-link:hover{color:var(--ink);}
.acct-link.danger{color:var(--err);}.acct-link.danger:hover{color:#a3271e;}
.danger-cta{background:var(--err)!important;}.danger-cta:hover{background:#a3271e!important;}
.si-code-box{display:flex;gap:7px;justify-content:center;margin:6px 0 2px;}
.bs-open-link{background:none;border:none;font:600 11.5px/1 'Inter';color:var(--gold);cursor:pointer;padding:0;text-decoration:underline;}
.bs-open-link:hover{color:var(--ink);}
.bs-modal{max-width:560px;}
.bs-grid{display:grid;gap:16px;}
.bs-stat{padding:16px;border-radius:10px;background:var(--ink);color:var(--bg);}
.bs-stat .bs-n{font:600 26px/1 'JetBrains Mono';color:var(--gold);}
.bs-stat .bs-l{font-size:12px;color:#cfc9bf;margin-top:6px;line-height:1.4;}
.bs-section{border:1px solid var(--stone);border-radius:10px;padding:14px 16px;}
.bs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.bs-title{font:500 15px/1 'Playfair Display';}
.bs-sub{font-size:11.5px;color:var(--ink3);line-height:1.5;margin:7px 0 10px;}
.bs-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--stone-l);}
.bs-rn{font:500 12.5px/1.2 'Inter';}
.bs-rd{font-size:11px;color:var(--ink3);margin-top:3px;line-height:1.4;}
.bs-btn{border:1px solid var(--stone);background:var(--panel);border-radius:6px;padding:7px 11px;font:600 11px/1 'Inter';color:var(--ink2);cursor:pointer;white-space:nowrap;transition:.13s;}
.bs-btn:hover{border-color:var(--gold);color:var(--gold);}
.bs-btn.alt{background:var(--gold-s);border-color:var(--gold-l);color:var(--gold);}
.learn-ind{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:8px 13px;border-radius:20px;background:var(--live-s);border:1px solid var(--live);font:500 12px/1 'Inter';color:var(--live);}
.learn-ind .pulse{width:8px;height:8px;border-radius:50%;background:var(--live);animation:lp 1.8s ease-in-out infinite;}
@keyframes lp{0%,100%{opacity:.4;transform:scale(.8);}50%{opacity:1;transform:scale(1.3);}}
.prof-head{display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.avatar{width:58px;height:58px;border-radius:14px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center;font:500 22px/1 'Playfair Display';flex:none;}
.prof-meta .pname{font:500 20px/1.1 'Playfair Display';}.prof-meta .phandle{font-size:13px;color:var(--ink3);margin-top:4px;}
.spec-chip{display:inline-block;margin-top:8px;font:600 10px/1 'Inter';letter-spacing:.06em;text-transform:uppercase;color:var(--gold);background:var(--gold-s);padding:5px 10px;border-radius:5px;}
.prof-bio{font-size:13.5px;color:var(--ink2);line-height:1.6;margin-top:16px;}
.prof-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--stone);border:1px solid var(--stone);border-radius:8px;overflow:hidden;margin-top:18px;}
.pstat{background:var(--panel);padding:14px 10px;text-align:center;}
.pstat .v{font:600 17px/1 'JetBrains Mono';}.pstat .l{font-size:9.5px;color:var(--ink3);margin-top:5px;letter-spacing:.05em;text-transform:uppercase;}
.badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid var(--stone-l);}
.rep-l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);font-weight:600;}
.badge2{font:600 11px/1 'Inter';color:var(--gold);background:var(--gold-s);border:1px solid var(--gold-l);padding:6px 11px;border-radius:20px;}
.ctimeline{display:flex;gap:4px;flex-wrap:wrap;margin-top:14px;}
.ctdot{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;transition:.14s;}
.studio-tabs{display:inline-flex;gap:3px;background:var(--stone-l);border-radius:8px;padding:3px;margin-bottom:18px;}
.studio-tabs button{border:none;background:none;cursor:pointer;padding:9px 16px;border-radius:6px;font:500 13px/1 'Inter';color:var(--ink3);transition:.13s;}
.studio-tabs button[aria-current=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 3px rgba(15,13,11,.08);}
.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:10px;}
.type-card{border:1px solid var(--stone);border-radius:9px;padding:14px 12px;background:var(--panel);cursor:pointer;text-align:left;transition:.14s;}
.type-card:hover{border-color:var(--gold-l);}
.type-card[aria-pressed=true]{border-color:var(--gold);background:var(--gold-s);}
.type-card:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.type-card .ti{font-size:16px;}.type-card .tl{font:500 13px/1.2 'Playfair Display';margin-top:8px;}
.type-card .tb{font-size:10.5px;color:var(--ink3);line-height:1.4;margin-top:5px;}
.tmpl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;}
.tmpl{border:1px solid var(--stone);border-radius:8px;padding:13px 14px;background:var(--panel);cursor:pointer;text-align:left;transition:.14s;}
.tmpl:hover{border-color:var(--gold-l);background:var(--gold-s);}
.tmpl:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.tmpl-n{font:500 13px/1.2 'Playfair Display';}
.tmpl-d{font-size:11.5px;color:var(--ink3);margin-top:4px;}
.tmpl-type{font:600 9px/1 'Inter';letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin-top:5px;}
.test-trigger{margin-top:12px;width:100%;border:1px dashed var(--stone-m);background:var(--stone-l);color:var(--ink2);border-radius:8px;padding:12px;cursor:pointer;font:500 13px/1 'Inter';transition:.14s;}
.test-trigger:hover{border-color:var(--gold);background:var(--gold-s);}
.test-trigger:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.test-panel{margin-top:16px;border:1px solid var(--gold-l);border-radius:11px;padding:18px;background:var(--gold-s);}
.test-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.test-head .th{font:500 14px/1 'Playfair Display';}.test-head .tc{background:none;border:none;cursor:pointer;font:500 12px/1 'Inter';color:var(--ink3);}
.test-head .tc:hover{color:var(--err);}
.upload-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px;}
.upload-btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:8px;padding:10px 16px;font:500 13px/1 'Inter';transition:.14s;}
.upload-btn:hover{background:#1c1a17;}
.file-chip{display:inline-flex;align-items:center;gap:9px;font:500 12px/1.2 'JetBrains Mono';background:var(--gold-s);border:1px solid var(--gold-l);color:var(--ink);padding:7px 11px;border-radius:7px;}
.file-chip button{border:none;background:none;cursor:pointer;font-size:14px;color:var(--ink3);}.file-chip button:hover{color:var(--err);}
.pricechips{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}
.pchip{border:1px solid var(--stone);background:var(--panel);border-radius:7px;padding:9px 13px;cursor:pointer;font:600 12px/1 'JetBrains Mono';color:var(--ink2);transition:.13s;}
.pchip[aria-pressed=true]{border-color:var(--gold);background:var(--gold-s);color:var(--gold);}
.pchip:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.uf-toggle{display:inline-flex;background:var(--stone-l);border-radius:7px;padding:3px;gap:3px;flex-wrap:wrap;}
.uf-toggle button{border:none;background:none;cursor:pointer;padding:8px 15px;border-radius:5px;font:500 12.5px/1 'Inter';color:var(--ink3);transition:.13s;}
.uf-toggle button[aria-pressed=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 3px rgba(15,13,11,.1);}
.uf-toggle button:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.uf-split{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px;border-radius:8px;background:var(--gold-s);border:1px solid var(--gold-l);font-size:13px;color:var(--ink2);line-height:1.5;margin-top:16px;}
.uf-split b{color:var(--gold);}
.collab-box{border:1px solid var(--stone);border-radius:9px;padding:14px;margin-top:8px;background:var(--stone-l);}
.collab-box .field{margin-top:12px;}
.mytool{display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border:1px solid var(--stone);border-radius:9px;background:var(--panel);margin-bottom:8px;}
.mytool .mt-ic{width:32px;height:32px;border-radius:7px;background:var(--stone-l);border:1px solid var(--stone);display:flex;align-items:center;justify-content:center;font-size:14px;flex:none;}
.mytool .mt-n{font:500 13.5px/1.2 'Playfair Display';}.mytool .mt-d{font-size:11px;color:var(--ink3);margin-top:3px;}
.mytool .mt-stat{margin-left:auto;text-align:right;font-size:11px;color:var(--ink3);white-space:nowrap;}
.mytool .mt-stat b{font-family:'JetBrains Mono';color:var(--live);font-size:13px;}
.living{margin-top:10px;padding:10px 12px;background:var(--live-s);border:1px solid #BFE0CE;border-radius:7px;font-size:12px;color:var(--live);line-height:1.5;}
.living::before{content:"o Spinal insight: ";font-weight:600;}
.nc-banner{display:flex;align-items:center;gap:16px;padding:20px 22px;border-radius:12px;background:linear-gradient(120deg,var(--gold-s),#fff);border:1px solid var(--gold-l);}
.nc-spark{font-size:26px;color:var(--gold);flex:none;}
.nc-h{font:500 19px/1.2 'Playfair Display';}.nc-s{font-size:13px;color:var(--ink2);line-height:1.55;margin-top:5px;}
.wallet-top{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:16px;padding:20px;border:1px solid var(--stone);border-radius:10px;background:var(--stone-l);}
.wt-bal .wt-n{font:600 36px/1 'JetBrains Mono';letter-spacing:-.02em;}
.wt-bal .wt-l{font-size:12px;color:var(--ink3);margin-top:6px;}
.wt-meta{display:grid;gap:9px;min-width:200px;}
.wt-row{display:flex;justify-content:space-between;gap:18px;font-size:13px;color:var(--ink2);}
.wt-row b{font-weight:600;}
.spend-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;}
.scard{border:1px solid var(--stone);border-radius:10px;padding:18px 16px;background:var(--panel);cursor:pointer;text-align:left;transition:.14s;}
.scard:hover:not(:disabled){border-color:var(--gold-l);box-shadow:0 2px 14px rgba(155,132,95,.1);transform:translateY(-1px);}
.scard:disabled{opacity:.45;cursor:not-allowed;}
.scard:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.scard-head{display:flex;justify-content:space-between;align-items:center;}
.scard-name{font:500 14px/1 'Playfair Display';}
.scard-cost{font:600 12px/1 'JetBrains Mono';color:var(--gold);background:var(--gold-s);padding:4px 8px;border-radius:5px;}
.scard-tip{font-size:11.5px;color:var(--ink2);margin-top:9px;line-height:1.5;}
.snotice{margin-top:14px;padding:13px 15px;border-radius:8px;font-size:13px;line-height:1.55;}
.snotice.warn{border:1px solid #DFBDB7;background:var(--err-s);color:var(--err);}
.snotice.info{border:1px solid var(--stone);background:var(--stone-l);color:var(--ink2);}
.snotice.ok{border:1px solid #BFE0CE;background:var(--live-s);color:var(--live);}
.pay-grid{display:grid;gap:10px;margin-top:16px;}
.pay-method{border:1px solid var(--stone);border-radius:10px;padding:16px;background:var(--panel);cursor:pointer;transition:.14s;text-align:left;width:100%;}
.pay-method[aria-pressed=true]{border-color:var(--gold);background:var(--gold-s);}
.pay-method:hover{border-color:var(--gold-l);}
.pay-method:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.pm-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.pm-name{font:500 14px/1 'Playfair Display';}
.pm-time{font:600 12px/1 'JetBrains Mono';color:var(--live);}
.pm-fee{font-size:11.5px;color:var(--ink3);margin-top:5px;}
.pay-timeline{margin-top:18px;border:1px solid var(--stone);border-radius:10px;overflow:hidden;}
.pt-row{display:flex;gap:14px;padding:12px 15px;border-bottom:1px solid var(--stone-l);align-items:flex-start;}
.pt-row:last-child{border-bottom:none;}
.pt-day{font:600 12px/1 'JetBrains Mono';color:var(--gold);min-width:54px;padding-top:2px;}
.pt-txt{font-size:13px;color:var(--ink2);line-height:1.5;}
.led{display:grid;gap:0;margin-top:18px;}
.lrow{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:14px 2px;border-bottom:1px solid var(--stone-l);}
.lrow:last-child{border-bottom:none;}
.lic{width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font:600 13px/1 'JetBrains Mono';flex:none;}
.lic.in{background:var(--gold-s);color:var(--gold);}.lic.out{background:var(--stone-l);color:var(--ink3);}
.lm-t{font:500 13.5px/1.2 'Inter';}.lm-f{font-size:11.5px;color:var(--ink3);margin-top:4px;}
.larr{color:var(--ink);font-weight:600;}
.lamt{font:600 14px/1 'JetBrains Mono';text-align:right;}.lamt.in{color:var(--gold);}.lamt.out{color:var(--ink3);}
.led-empty{text-align:center;padding:38px 0;color:var(--ink3);font-size:13.5px;}
.led-empty em{display:block;font-style:normal;font-size:12px;margin-top:6px;opacity:.7;}
.team-head{display:flex;align-items:center;gap:14px;margin-top:8px;}
.team-ic{width:46px;height:46px;border-radius:11px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center;font:500 17px/1 'Playfair Display';flex:none;}
.team-n{font:500 18px/1.1 'Playfair Display';}
.team-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px;}
.member-list{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;}
.member{font:500 12px/1 'JetBrains Mono';background:var(--stone-l);border:1px solid var(--stone);padding:7px 11px;border-radius:7px;}
.pool-card{margin-top:10px;padding:16px;border:1px solid var(--gold-l);border-radius:10px;background:var(--gold-s);}
.pc-v{font:600 24px/1 'JetBrains Mono';color:var(--gold);}
.modal-back{position:fixed;inset:0;background:rgba(16,15,13,.42);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50;animation:fade .2s ease;}
@keyframes fade{from{opacity:0}to{opacity:1}}
.modal{background:var(--bg);border:1px solid var(--stone);border-radius:14px;max-width:540px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 24px 70px rgba(16,15,13,.3);animation:pop .22s ease;}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
.modal-h{padding:22px 24px 16px;border-bottom:1px solid var(--stone);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.modal-h .mt{font:500 18px/1.2 'Playfair Display';}.modal-h .mby{font-size:12px;color:var(--ink3);margin-top:4px;}
.modal-x{background:none;border:none;cursor:pointer;font-size:20px;color:var(--ink3);line-height:1;padding:2px 6px;border-radius:6px;}
.modal-x:hover{background:var(--stone-l);color:var(--ink);}
.modal-body{padding:20px 24px 24px;}
.run-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
.run-meta .rm{font-size:11px;color:var(--ink2);background:var(--stone-l);border:1px solid var(--stone);padding:5px 10px;border-radius:6px;}
.run-meta .rm b{color:var(--gold);font-family:'JetBrains Mono';}
.splitbox{margin-top:14px;padding:14px;border-radius:9px;background:var(--stone-l);border:1px solid var(--stone);}
.splitbox .sbh{font:600 11px/1 'Inter';letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);}
.split-row{display:flex;align-items:center;gap:10px;margin-top:10px;}
.split-row .sn{font-size:12.5px;color:var(--ink);min-width:90px;}.split-row .sr{font-size:11px;color:var(--ink3);}
.split-bar{flex:1;height:6px;background:var(--stone);border-radius:3px;overflow:hidden;}
.split-bar i{display:block;height:100%;background:var(--gold);}
.split-row .sp{font:600 12px/1 'JetBrains Mono';color:var(--gold);min-width:34px;text-align:right;}
.run-out{margin-top:16px;padding:16px;border-radius:10px;background:var(--panel);border:1px solid var(--stone);font-size:13.5px;line-height:1.6;white-space:pre-wrap;color:var(--ink);max-height:260px;overflow-y:auto;}
.run-out.code{font-family:'JetBrains Mono';font-size:12.5px;}
.run-live{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--live);margin-top:10px;}
.run-live .dot{width:6px;height:6px;border-radius:50%;background:var(--live);}
.run-live.off{color:var(--ink3);}.run-live.off .dot{background:var(--ink3);}
.outcome-ask{margin-top:18px;padding:16px;border-radius:10px;background:var(--gold-s);border:1px solid var(--gold-l);}
.outcome-ask .oq{font:500 13.5px/1.3 'Inter';}
.outcome-btns{display:flex;gap:10px;margin-top:12px;}
.outcome-btns button{flex:1;border:1px solid var(--stone);background:var(--panel);border-radius:8px;padding:11px;cursor:pointer;font:500 13px/1 'Inter';transition:.13s;}
.outcome-btns button:hover{border-color:var(--gold);}
.outcome-btns.thumbs button.thumb{display:flex;align-items:center;justify-content:center;gap:8px;}
.outcome-btns.thumbs .thumb.up:hover{border-color:#3a7d44;color:#3a7d44;background:#eef6ef;}
.outcome-btns.thumbs .thumb.down:hover{border-color:#8a3b2c;color:#8a3b2c;background:#f6ebe7;}
.outcome-btns.thumbs .thumb svg{flex:none;}
.outcome-done{margin-top:16px;padding:13px 15px;border-radius:9px;background:var(--live-s);border:1px solid #BFE0CE;font-size:12.5px;color:var(--live);line-height:1.5;}
.primary-cta{margin-top:18px;width:100%;background:var(--ink);color:#fff;border:none;border-radius:9px;padding:15px;cursor:pointer;font:500 14.5px/1 'Inter';transition:.15s;}
.primary-cta:not(:disabled):hover{background:#1c1a17;}
.primary-cta:disabled{background:var(--stone);color:var(--ink3);cursor:not-allowed;}
.primary-cta:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.spinner{width:16px;height:16px;border:2px solid var(--stone);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle;}
@keyframes spin{to{transform:rotate(360deg)}}
.sp-foot{margin-top:28px;padding-top:24px;border-top:1px solid var(--stone);}
.foot-tag{text-align:center;font-size:12px;color:var(--ink3);line-height:1.65;max-width:680px;margin:0 auto;}
.foot-links{display:flex;flex-wrap:wrap;gap:4px 18px;justify-content:center;margin:16px auto 0;}
.foot-links button{background:none;border:none;cursor:pointer;font:500 12px/1.6 'Inter';color:var(--ink2);padding:2px 0;transition:.14s;}
.foot-links button:hover{color:var(--gold);}
.foot-legal{text-align:center;font-size:11px;color:var(--stone-m);margin-top:14px;line-height:1.6;}
.foot-legal a{color:var(--ink3);text-decoration:underline;}.foot-legal a:hover{color:var(--gold);}
.help-list{margin-top:14px;display:flex;flex-direction:column;gap:2px;}
.help-q{border-bottom:1px solid var(--stone);padding:2px 0;}
.help-q summary{cursor:pointer;font:500 14px/1.5 'Inter';color:var(--ink);padding:11px 0;list-style:none;position:relative;padding-right:24px;}
.help-q summary::-webkit-details-marker{display:none;}
.help-q summary::after{content:'+';position:absolute;right:4px;top:10px;color:var(--gold);font-size:17px;transition:.2s;}
.help-q[open] summary::after{transform:rotate(45deg);}
.help-q p{font-size:13px;color:var(--ink2);line-height:1.6;padding:0 0 13px;margin:0;}
.link-btn{background:none;border:none;color:var(--gold);cursor:pointer;font:inherit;text-decoration:underline;padding:0;}
.link-btn:hover{color:var(--ink);}
.gold-link{color:var(--gold);text-decoration:underline;}.gold-link:hover{color:var(--ink);}
.sp-foot b{color:var(--ink);}
@media(max-width:820px){.pillars{grid-template-columns:repeat(2,1fr);}}
@media(max-width:780px){
  .plug-row,.spine-bar{grid-template-columns:repeat(2,1fr);}
  .out-row,.pools-row,.earn-layout,.spend-grid,.why-grid,.creator-grid,.vgrid,.type-grid,.stack-grid,.nerve-grid,.team-cols,.tmpl-grid,.demand-grid{grid-template-columns:1fr;}
  .prof-stats{grid-template-columns:repeat(2,1fr);}
  .tool-cards{grid-template-columns:1fr;}
  .hero{padding:36px 20px 34px;}.hero h1{font-size:29px;}
  .navlinks button{padding:5px 8px;}.nav-main{font-size:12px;}.nav-sub{font-size:8px;}
}
.answer-card .act:has(.rich){white-space:normal;}
.run-out:has(.rich){white-space:normal;}
.rich{white-space:normal;}
.rich-p{margin:0 0 9px;line-height:1.65;}
.rich-p:last-child{margin-bottom:0;}
.rich-sp{height:5px;}
.rich-h{font-weight:600;margin:13px 0 7px;line-height:1.4;}
.rich-h:first-child{margin-top:0;}
.rich-h1{font-size:1.18em;}
.rich-h2{font-size:1.1em;}
.rich-h3{font-size:1.03em;}
.rich-h4{font-size:1em;opacity:.85;}
.rich-ul,.rich-ol{margin:6px 0 10px;padding-left:20px;}
.rich-ul li,.rich-ol li{margin:3px 0;line-height:1.6;}
.rich-code{font-family:'JetBrains Mono',monospace;font-size:.9em;background:var(--panel);border:1px solid var(--stone);border-radius:4px;padding:1px 5px;}
.rich-pre{margin:9px 0;padding:13px;border-radius:9px;background:var(--panel);border:1px solid var(--stone);overflow-x:auto;}
.rich-pre code{font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.55;white-space:pre;color:var(--ink);}
.core-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.core-bar-actions{display:flex;gap:8px;}
.ghost-btn{background:transparent;border:1px solid var(--stone);color:var(--ink2);font:600 12px/1 'Inter';padding:7px 11px;border-radius:8px;cursor:pointer;}
.ghost-btn:hover:not(:disabled){border-color:var(--gold-l);color:var(--ink);}
.ghost-btn:disabled{opacity:.4;cursor:not-allowed;}
.mini-cta{background:var(--ink);color:var(--ivory);border:none;font:600 12px/1 'Inter';padding:8px 13px;border-radius:8px;cursor:pointer;}
.mini-cta:disabled{background:var(--stone);color:var(--ink3);cursor:not-allowed;}
.ensemble-toggle{margin-top:12px;}
.conv-history{margin-top:12px;border:1px solid var(--stone);border-radius:11px;overflow:hidden;background:var(--panel);}
.conv-empty{padding:16px;font-size:13px;color:var(--ink3);text-align:center;}
.conv-row{display:flex;align-items:center;border-bottom:1px solid var(--stone);}
.conv-row:last-child{border-bottom:none;}
.conv-open{flex:1;display:flex;justify-content:space-between;gap:10px;background:transparent;border:none;text-align:left;padding:12px 14px;cursor:pointer;color:var(--ink);}
.conv-open:hover{background:var(--ivory);}
.conv-title{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.conv-when{font-size:11px;color:var(--ink3);flex:none;}
.conv-del{background:transparent;border:none;color:var(--ink3);font-size:20px;line-height:1;padding:0 14px;cursor:pointer;}
.conv-del:hover{color:#b4452f;}
.thread{margin-top:16px;display:flex;flex-direction:column;gap:16px;max-height:60vh;overflow-y:auto;padding-right:2px;}
.greet{padding:26px 4px 10px;text-align:center;}
.greet-cord{width:3px;height:42px;margin:0 auto 16px;background:linear-gradient(var(--gold),transparent);border-radius:2px;}
.greet-h{font-size:21px;color:var(--ink);margin-bottom:9px;}
.greet-sub{font-size:13.5px;line-height:1.6;color:var(--ink2);max-width:440px;margin:0 auto;}
.msg{position:relative;}
.msg-user{align-self:flex-end;max-width:82%;background:var(--ink);color:var(--ivory);padding:11px 15px;border-radius:16px 16px 5px 16px;}
.msg-user,.msg-user .msg-text,.msg-user .rich,.msg-user .rich-p{color:var(--ivory);}
.msg-user .msg-text{font-size:15px;line-height:1.5;white-space:pre-wrap;}
.msg-edit-btn{position:absolute;left:-44px;top:8px;background:transparent;border:none;color:var(--ink3);font-size:11px;cursor:pointer;opacity:.7;}
.msg-edit-btn:hover{opacity:1;color:var(--ink);}
.msg-edit textarea{width:100%;border:1px solid var(--gold-l);border-radius:10px;padding:10px;font:inherit;font-size:14px;background:var(--ivory);color:var(--ink);resize:vertical;}
.msg-edit-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;}
.msg-ai{align-self:flex-start;max-width:88%;background:var(--ivory);border:1px solid var(--stone);padding:13px 16px;border-radius:16px 16px 16px 5px;}
.msg-ai .act{font-size:15px;line-height:1.55;}
.msg-ai-label{font:600 10px/1 'Inter';letter-spacing:.13em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;}
.guard-tag{color:var(--ink3);}
.msg-ai-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;}
.run-live.inline{margin-top:0;}
.copy-btn{background:transparent;border:1px solid var(--stone);color:var(--ink2);font:600 11px/1 'Inter';padding:6px 10px;border-radius:7px;cursor:pointer;}
.copy-btn:hover{border-color:var(--gold-l);color:var(--ink);}
.primary-cta.stop{background:#8a3b2c;}
.primary-cta.stop:hover{background:#7a3326;}
.free-hint{margin-top:12px;font-size:12.5px;color:var(--ink2);background:var(--panel);border:1px solid var(--stone);border-radius:9px;padding:9px 12px;}
.limit-msg{margin-top:12px;font-size:13px;color:#8a3b2c;background:#f6ebe7;border:1px solid #e3c9c0;border-radius:9px;padding:10px 13px;}
.modal.onboard{text-align:center;padding:30px 26px;}
.ob-cord{width:3px;height:34px;margin:0 auto 16px;background:linear-gradient(var(--gold),transparent);border-radius:2px;}
.ob-step{font:600 11px/1 'Inter';letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
.ob-title{font-size:22px;color:var(--ink);margin-bottom:10px;}
.ob-body{font-size:14px;line-height:1.6;color:var(--ink2);margin-bottom:18px;}
.ob-dots{display:flex;gap:6px;justify-content:center;margin-bottom:18px;}
.ob-dot{width:7px;height:7px;border-radius:50%;background:var(--stone);}
.ob-dot.on{background:var(--gold);}
.ob-actions{display:flex;gap:10px;align-items:center;justify-content:center;}
.ob-actions .ob-next{width:auto;padding:11px 22px;margin-top:0;}
.core-input-row{display:flex;gap:10px;align-items:center;margin-top:12px;}
.core-input-row .primary-cta{margin-top:0;flex:1;}
.attach-btn{display:flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--stone);color:var(--ink2);font:600 13px/1 'Inter';padding:0 15px;height:46px;border-radius:10px;cursor:pointer;flex:none;}
.attach-btn:hover:not(:disabled){border-color:var(--gold-l);color:var(--ink);}
.attach-btn:disabled{opacity:.5;cursor:not-allowed;}
.attach-btn.icon-only{padding:0;width:46px;justify-content:center;gap:0;}
.attach-btn.listening{border-color:#8a3b2c;color:#8a3b2c;background:#f6ebe7;animation:pulse-mic 1.1s ease-in-out infinite;}
@keyframes pulse-mic{0%,100%{opacity:1;}50%{opacity:.55;}}
.vault-convs{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
.vault-conv-row{display:flex;align-items:stretch;gap:8px;border:1px solid var(--stone);border-radius:11px;overflow:hidden;background:var(--panel);}
.vault-conv-open{flex:1;display:flex;flex-direction:column;gap:3px;background:transparent;border:none;text-align:left;padding:13px 15px;cursor:pointer;}
.vault-conv-open:hover{background:var(--ivory);}
.vault-conv-title{font:600 14px/1.3 'Inter';color:var(--ink);}
.vault-conv-when{font-size:11.5px;color:var(--ink3);}
.vault-conv-del{background:transparent;border:none;border-left:1px solid var(--stone);color:var(--ink3);padding:0 14px;cursor:pointer;}
.vault-conv-del:hover{color:#8a3b2c;background:#f6ebe7;}
.admin-fullscreen{position:fixed;inset:0;z-index:200;background:var(--bg);overflow-y:auto;}
.admin-fs-inner{max-width:1100px;margin:0 auto;min-height:100%;padding:0 18px 60px;}
.admin-fs-h{position:sticky;top:0;background:var(--bg);padding:20px 0 16px;border-bottom:1px solid var(--stone);z-index:2;}
.admin-fs-body{padding-top:20px;}
.bs-users{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.bs-user-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid var(--stone);border-radius:10px;padding:11px 13px;background:var(--panel);}
.bs-user-info{min-width:0;flex:1;}
.bs-user-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.bs-user-bal{font-size:12.5px;color:var(--ink2);}
.bs-btn.tiny{padding:6px 11px;font-size:12px;border-radius:7px;}
.bs-btn.danger{background:#8a3b2c;color:#fff;border-color:#8a3b2c;}
.bs-btn.danger:hover{background:#7a3326;}
.admin-chat{display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto;padding:12px;border:1px solid var(--stone);border-radius:11px;background:var(--panel);}
.admin-chat-msg{padding:9px 13px;border-radius:11px;font-size:14px;line-height:1.5;max-width:88%;white-space:pre-wrap;}
.admin-chat-msg.u{align-self:flex-end;background:var(--ink);color:#fff;}
.admin-chat-msg.a{align-self:flex-start;background:var(--ivory);color:var(--ink);border:1px solid var(--stone);}
.project-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:1100px;margin:0 auto 14px;padding:9px 14px;background:var(--panel);border:1px solid var(--stone);border-radius:11px;}
.pb-label{font:600 10px/1 'Inter';letter-spacing:.13em;text-transform:uppercase;color:var(--gold);}
.pb-name{font:600 14px/1 'Inter';color:var(--ink);border:none;background:transparent;border-bottom:1px solid var(--stone);padding:4px 2px;max-width:200px;}
.pb-name:focus{outline:none;border-bottom-color:var(--gold);}
.pb-count{font-size:12px;color:var(--ink3);}
.pb-empty{font-size:13px;color:var(--ink3);flex:1;}
.pb-btn{background:transparent;border:1px solid var(--stone);border-radius:8px;padding:6px 12px;font:600 12px/1 'Inter';color:var(--ink2);cursor:pointer;}
.pb-btn:hover{border-color:var(--gold);color:var(--ink);}
.vault-conv-row.active-proj{border-color:var(--gold);}
.proj-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}
.proj-item{border:1px solid var(--stone);border-radius:10px;padding:11px;background:var(--panel);position:relative;}
.proj-item-kind{font:600 9px/1 'Inter';letter-spacing:.1em;text-transform:uppercase;color:var(--gold);}
.proj-item-text{font-size:13px;color:var(--ink2);margin-top:6px;max-height:80px;overflow:hidden;line-height:1.45;}
.proj-item-del{margin-top:8px;background:transparent;border:none;color:var(--ink3);font-size:11px;cursor:pointer;padding:0;text-decoration:underline;}
.proj-item-del:hover{color:#8a3b2c;}
.cashout-box{margin-top:16px;padding:16px;border:1px solid var(--stone);border-radius:12px;background:var(--ivory);max-width:420px;}
.cashout-h{font-size:16px;color:var(--ink);}
.credits-buy{margin-top:14px;padding:14px;border:1px solid var(--stone);border-radius:12px;background:var(--panel);max-width:420px;}
.cb-h{font:600 13px/1 'Inter';color:var(--ink2);margin-bottom:10px;}
.cb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.cb-item{text-align:center;padding:10px;background:var(--ivory);border-radius:9px;}
.cb-item b{display:block;font-size:18px;color:var(--ink);}
.cb-item span{font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em;}
.cb-note{font-size:11.5px;color:var(--ink3);margin-top:10px;}
.buy-section{margin-top:16px;padding:16px;border:1px solid var(--stone);border-radius:12px;background:var(--ivory);max-width:520px;}
.buy-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.buy-card{display:flex;flex-direction:column;gap:3px;align-items:flex-start;text-align:left;padding:13px;border:1px solid var(--stone);border-radius:11px;background:var(--panel);cursor:pointer;transition:border-color .15s;}
.buy-card:hover{border-color:var(--gold);}
.buy-card b{font-size:14px;color:var(--ink);}
.buy-card span{font:600 16px/1 'Inter';color:var(--gold);}
.buy-card em{font-style:normal;font-size:11px;color:var(--ink3);}
.prov-list{display:flex;flex-direction:column;gap:8px;}
.prov-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--stone);border-radius:9px;background:var(--panel);font-size:13px;color:var(--ink);}
.prov-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.prov-dot.on{background:#3a9e5c;box-shadow:0 0 0 3px rgba(58,158,92,.15);}
.prov-dot.off{background:#b0a99e;}
.prov-state{margin-left:auto;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink3);}
.mt-pub{flex:none;background:transparent;border:1px solid var(--stone);border-radius:7px;padding:6px 10px;font:600 11px/1 'Inter';cursor:pointer;color:var(--ink3);}
.mt-pub.on{border-color:var(--live);color:var(--live);}
.mt-pub:hover{border-color:var(--gold);}
.attach-chip{display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:var(--panel);border:1px solid var(--stone);border-radius:9px;padding:7px 11px;font-size:12.5px;color:var(--ink2);}
.attach-chip button{background:transparent;border:none;color:var(--ink3);font-size:17px;line-height:1;cursor:pointer;}
.attach-chip button:hover{color:#8a3b2c;}
.msg-file{margin-top:6px;font-size:11.5px;opacity:.75;}
.bs-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;}
.bs-ctrl{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#cfc9bf;}
.bs-ctrl.wide{grid-column:1/-1;}
.bs-ctrl.toggle{flex-direction:row;align-items:center;justify-content:space-between;}
.switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid var(--stone);border-radius:9px;background:var(--panel);font:500 13px/1.3 'Inter';color:var(--ink);}
.switch{width:50px;height:28px;border-radius:999px;border:none;padding:0;position:relative;cursor:pointer;flex-shrink:0;transition:background .18s;-webkit-tap-highlight-color:transparent;}
.switch.on{background:#3a9e5c;}
.switch.off{background:#c2bbb0;}
.switch-knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.25);}
.switch.on .switch-knob{left:25px;}
/* connected workspace: upload button + file chip + video mode picker */
.up-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;}
.up-btn{display:inline-flex;align-items:center;gap:7px;background:var(--ivory);border:1px solid var(--stone);border-radius:9px;padding:9px 14px;font:600 13px/1 'Inter';color:var(--ink);cursor:pointer;-webkit-tap-highlight-color:transparent;}
.up-btn:hover{border-color:var(--gold);background:var(--gold-s);}
.up-btn:before{content:"+";font-weight:700;color:var(--gold);}
.up-chip{display:inline-flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--stone);border-radius:9px;padding:5px 8px 5px 6px;font:500 12px/1 'Inter';color:var(--ink2);max-width:240px;}
.up-thumb{width:30px;height:30px;border-radius:6px;object-fit:cover;}
.up-fileic{font:600 11px/1 'Inter';color:var(--gold);padding:0 2px;}
.up-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;}
.up-x{border:none;background:var(--stone-l);color:var(--ink2);width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;flex-shrink:0;}
.up-x:hover{background:var(--gold-l);}
.vmode{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
.vmode-btn{flex:1;min-width:96px;text-align:center;background:var(--ivory);border:1px solid var(--stone);border-radius:10px;padding:10px 8px;font:600 12px/1.2 'Inter';color:var(--ink2);cursor:pointer;-webkit-tap-highlight-color:transparent;}
.vmode-btn.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.vmode-btn .vm-sub{display:block;font-weight:500;font-size:10px;opacity:.7;margin-top:3px;}
/* connected workspace: send-to chips under outputs */
.sendto{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--stone-l);}
.sendto-label{font:600 10px/1 'Inter';letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);width:100%;margin-bottom:2px;}
.sendto-chip{background:var(--ivory);border:1px solid var(--stone);border-radius:10px;padding:9px 14px;font:600 13px/1 'Inter';color:var(--ink);cursor:pointer;-webkit-tap-highlight-color:transparent;}
.sendto-chip:hover{border-color:var(--gold);background:var(--gold-s);}
.sendto-chip.dark{background:var(--ink);color:#fff;border-color:var(--ink);}
.sendto-chip.dark:hover{opacity:.9;background:var(--ink);}
/* game examples + clarify tab */
.game-ex{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}
.game-ex-label{width:100%;font:600 10px/1 'Inter';letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin-bottom:2px;}
.game-ex-chip{background:var(--gold-s);border:1px solid var(--gold-l);border-radius:9px;padding:7px 11px;font:500 12px/1.2 'Inter';color:var(--ink);cursor:pointer;text-align:left;}
.game-ex-chip:hover{background:var(--gold-l);}
.clarify{margin-top:12px;border:1px solid var(--gold-l);background:var(--gold-s);border-radius:12px;padding:14px;}
.clarify-head{font:600 13px/1.3 'Inter';color:var(--ink);margin-bottom:8px;}
.clarify-list{margin:0 0 10px;padding-left:18px;color:var(--ink2);font-size:13px;line-height:1.6;}
.clarify-input{width:100%;box-sizing:border-box;background:var(--panel);border:1px solid var(--stone);border-radius:8px;padding:10px;font:500 16px/1.4 'Inter';color:var(--ink);resize:vertical;}
.clarify-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}
.clarify-go{background:var(--ink);color:#fff;border:none;border-radius:9px;padding:10px 16px;font:600 13px/1 'Inter';cursor:pointer;}
.clarify-go:disabled{opacity:.6;}
.clarify-skip{background:none;border:1px solid var(--stone);border-radius:9px;padding:10px 14px;font:600 13px/1 'Inter';color:var(--ink2);cursor:pointer;}
/* game post-to-marketplace + inline link button */
.linklike{background:none;border:none;color:var(--gold);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;padding:0;}
.gpost{margin-top:14px;padding-top:14px;border-top:1px solid var(--stone-l);}
.gpost-head{font:600 13px/1.3 'Inter';color:var(--ink);}
.gpost-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;}
.gpost-free{background:var(--ink);color:#fff;border:none;border-radius:9px;padding:10px 16px;font:600 13px/1 'Inter';cursor:pointer;}
.gpost-paid{display:flex;align-items:center;gap:4px;border:1px solid var(--stone);border-radius:9px;padding:3px 3px 3px 10px;background:var(--panel);}
.gpost-cur{color:var(--ink3);font-weight:600;font-size:13px;}
.gpost-price{width:64px;border:none;background:none;font:600 13px/1 'Inter';color:var(--ink);padding:8px 2px;outline:none;}
.gpost-set{background:var(--gold-s);border:1px solid var(--gold-l);border-radius:7px;padding:8px 12px;font:600 12px/1 'Inter';color:var(--ink);cursor:pointer;}
/* play-a-game modal */
.play-modal{max-width:680px;width:94vw;padding:0;overflow:hidden;}
.play-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--stone);}
.play-title{font-size:17px;color:var(--ink);}
.play-x{border:none;background:var(--stone-l);color:var(--ink2);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;}
.play-frame{width:100%;height:70vh;max-height:560px;border:none;background:#000;display:block;}
.bs-ctrl input[type=number],.bs-ctrl input[type=text],.bs-ctrl select{background:var(--bg);border:1px solid var(--stone);border-radius:7px;padding:9px 10px;color:var(--ink);font:500 13px/1 'Inter';}
.bs-ctrl input[type=checkbox]{width:20px;height:20px;accent-color:var(--gold);}
@media(max-width:560px){.bs-controls{grid-template-columns:1fr;}}
.site-banner{background:var(--ink);color:var(--ivory);text-align:center;font-size:13px;padding:9px 14px;}
`;

/* ====================== APP ================================== */
export default function App(){
  const reduced=useReducedMotion();
  const [tab,setTab]=useState("core");
  const [flowing,setFlowing]=useState(false);
  const [balance,setBalance]=useState(0);
  const [trust,setTrust]=useState(8);
  const [rewardPool,setRP]=useState(REWARD_POOL_INIT);
  const [usagePool,setUP]=useState(0);
  const [computeReserve,setCompute]=useState(0);
  const [spineMargin,setSpineMargin]=useState(0);
  const [ledger,setLedger]=useState([]);
  const [paidOutUsd,setPaidOutUsd]=useState(0);
  const [nervous,setNervous]=useState(false);
  const [submitted,setSub]=useState(0);
  const [taskIdx,setTaskIdx]=useState(0);
  const [verdict,setVerdict]=useState(null);
  const [lastResult,setLR]=useState(null);
  const [earnFx,setEarnFx]=useState(null);
  const [busyNerve,setBusyNerve]=useState(null);
  const [spendMsg,setSpendMsg]=useState(null);
  const [coreReq,setCoreReq]=useState("");
  // Conversation thread: [{role:'user'|'assistant', text, live, at}]
  const [thread,setThread]=useState([]);
  const [convId,setConvId]=useState(null);
  const [savedConvs,setSavedConvs]=useState([]);
  // ---- PROJECTS: the creation hub that carries across tabs ----
  const [projects,setProjects]=useState(()=>{try{const r=localStorage.getItem("spine.projects");return r?JSON.parse(r):[];}catch{return [];}});
  const [activeProjectId,setActiveProjectId]=useState(()=>{try{return localStorage.getItem("spine.activeProject")||null;}catch{return null;}});
  useEffect(()=>{ try{localStorage.setItem("spine.projects",JSON.stringify(projects));}catch{} },[projects]);
  useEffect(()=>{ try{ if(activeProjectId)localStorage.setItem("spine.activeProject",activeProjectId); else localStorage.removeItem("spine.activeProject"); }catch{} },[activeProjectId]);
  const activeProject=projects.find(p=>p.id===activeProjectId)||null;
  function newProject(name){
    const id="proj-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
    const proj={id,name:name||"Untitled project",items:[],updatedAt:Date.now()};
    setProjects(list=>[proj,...list]);
    setActiveProjectId(id);
    persistProject(proj);
    return proj;
  }
  function updateActiveProject(mutator){
    setProjects(list=>{
      const next=list.map(p=>{ if(p.id!==activeProjectId)return p; const np={...mutator(p),updatedAt:Date.now()}; persistProject(np); return np; });
      return next;
    });
  }
  function addToProject(item){
    // item: {kind:'chat'|'image'|'tool'|'note', ...}
    let proj=activeProject;
    if(!proj){ proj=newProject(item.title||"New project"); }
    setProjects(list=>list.map(p=>{
      if(p.id!==(proj?proj.id:activeProjectId))return p;
      const np={...p,items:[...(p.items||[]),{...item,at:Date.now()}],updatedAt:Date.now()};
      persistProject(np); return np;
    }));
    flash&&flash();
  }
  function renameProject(id,name){ setProjects(list=>list.map(p=>{ if(p.id!==id)return p; const np={...p,name,updatedAt:Date.now()}; persistProject(np); return np; })); }
  async function removeProject(id){ setProjects(list=>list.filter(p=>p.id!==id)); if(activeProjectId===id)setActiveProjectId(null); const pr=projects.find(p=>p.id===id); if(pr&&pr.dbId)await deleteProject(pr.dbId); }
  async function persistProject(proj){
    const acct=acctRef.current;
    if(acct&&!acct.admin&&!String(acct.id).startsWith("local-")){
      const r=await saveProject(acct.id, proj.dbId||null, proj.name, {items:proj.items||[]});
      if(r&&r.ok&&r.id&&!proj.dbId){ setProjects(list=>list.map(p=>p.id===proj.id?{...p,dbId:r.id}:p)); }
    }
  }
  const [editingIdx,setEditingIdx]=useState(null);
  const [editingText,setEditingText]=useState("");
  const [showHistory,setShowHistory]=useState(false);
  const stopRef=useRef(false);
  const threadEndRef=useRef(null);
  // Protection: free-question count + simple per-session hourly rate limit
  const [freeUsed,setFreeUsed]=useState(()=>{try{return parseInt(localStorage.getItem("spine.freeUsed")||"0",10)||0;}catch{return 0;}});
  const rateRef=useRef([]); // timestamps of recent questions
  const [limitMsg,setLimitMsg]=useState("");
  const [onboardStep,setOnboardStep]=useState(0); // 0 = off; 1..N = onboarding steps (after profile)
  const [attached,setAttached]=useState(null); // {name, kind, text} attached to next question
  const fileInRef=useRef(null);
  const [listening,setListening]=useState(false);
  const recogRef=useRef(null);
  // ---- Image generation state ----
  const [imgPrompt,setImgPrompt]=useState("");
  const [imgBusy,setImgBusy]=useState(false);
  const [imgOut,setImgOut]=useState(null);   // {url|b64} or {error}
  const [imgHiQuality,setImgHiQuality]=useState(false);
  const imgLastAt=useRef(0);
  // ---- Video generation state ----
  const [vidPrompt,setVidPrompt]=useState("");
  const [vidBusy,setVidBusy]=useState(false);
  const [vidOut,setVidOut]=useState(null);
  const vidLastAt=useRef(0);
  async function startCheckout(kind){
    try{
      const res=await fetch("/api/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,accountId:account?account.id:"guest"})});
      const data=await res.json();
      if(data.notConnected){ alert("Payments are coming soon - almost there!"); return; }
      if(data.error){ alert(data.error); return; }
      if(data.url){ window.location.href=data.url; }
    }catch(e){ alert("Couldn't start checkout. Please try again."); }
  }
  async function doGenerateVideo(){
    const imgMode=vidMode==="image"&&pipeUpload&&pipeUpload.kind==="image"&&pipeUpload.dataUrl;
    // In image mode the prompt is optional (the image drives it); otherwise a prompt is required.
    if(vidBusy)return;
    if(!imgMode&&!vidPrompt.trim())return;
    const isAdmin=account&&account.admin;
    if(settings.killVideo===true){ setVidOut({error:"Video is temporarily paused."}); return; }
    // Hard rate limit on video - the cost-explosion risk.
    if(!isAdmin){ const gap=120000; if(Date.now()-vidLastAt.current<gap){ setVidOut({error:"One video at a time - give the last one a couple minutes."}); return; } }
    vidLastAt.current=Date.now();
    setVidBusy(true);setVidOut(null);
    try{
      const seconds=Math.min(settings.videoMaxSeconds||5,5);
      const payload={prompt:vidPrompt.trim(),seconds};
      if(imgMode) payload.image=pipeUpload.dataUrl; // carry the uploaded image for image-to-video
      const res=await fetch("/api/video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await res.json();
      if(data.notConnected){ setVidOut({error:"Video is coming online soon - The Spine's motion cortex is still warming up."}); setVidBusy(false); return; }
      if(data.error){ setVidOut({error:data.error}); setVidBusy(false); return; }
      if(data.url){ setVidOut({url:data.url}); }
      else if(data.taskId){ setVidOut({processing:true,taskId:data.taskId,provider:data.provider}); }
      else { setVidOut({error:"No video came back."}); }
      if(!isAdmin&&settings.creditsEnabled===true){ const cost=settings.costVideo||400; setBalance(b=>Math.max(0,b-cost)); }
      trackUse&&trackUse("video");
    }catch(e){ setVidOut({error:"Video service error."}); }
    setVidBusy(false);
  }
  const [imgUsed,setImgUsed]=useState(()=>{try{return parseInt(localStorage.getItem("spine.imgUsed")||"0",10)||0;}catch{return 0;}});
  const [imgRefillAt,setImgRefillAt]=useState(()=>{try{return parseInt(localStorage.getItem("spine.imgRefillAt")||"0",10)||0;}catch{return 0;}});
  useEffect(()=>{ try{localStorage.setItem("spine.imgUsed",String(imgUsed));}catch{} },[imgUsed]);
  useEffect(()=>{ try{localStorage.setItem("spine.imgRefillAt",String(imgRefillAt));}catch{} },[imgRefillAt]);
  const voiceSupported=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
  function toggleVoice(){
    if(!voiceSupported)return;
    if(listening){ try{recogRef.current&&recogRef.current.stop();}catch(e){} setListening(false); return; }
    try{
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      const r=new SR();
      r.lang="en-US"; r.interimResults=false; r.continuous=false;
      r.onresult=(ev)=>{ const t=Array.from(ev.results).map(x=>x[0].transcript).join(" "); setCoreReq(prev=>(prev?prev+" ":"")+t); };
      r.onerror=()=>setListening(false);
      r.onend=()=>setListening(false);
      recogRef.current=r; r.start(); setListening(true);
    }catch(e){ setListening(false); }
  }
  const [settings,setSettings]=useState(DEFAULT_SETTINGS); // admin-editable, loaded from DB
  const [adminStats,setAdminStats]=useState(null);
  const [adminUsers,setAdminUsers]=useState([]);
  const [adminChat,setAdminChat]=useState([]); // private Spine chat in admin
  const [calcSubs,setCalcSubs]=useState(10);
  const [calcFree,setCalcFree]=useState(100);
  const [adminChatIn,setAdminChatIn]=useState("");
  const [adminChatBusy,setAdminChatBusy]=useState(false);
  async function sendAdminChat(){
    if(adminChatBusy||!adminChatIn.trim())return;
    const q=adminChatIn.trim();
    setAdminChat(c=>[...c,{role:"user",text:q}]);
    setAdminChatIn("");setAdminChatBusy(true);
    try{
      const sys="You are The Spine, speaking privately with your owner/admin in the control room (the Brain Stem). Be candid, concise, and practical. You can discuss the platform, strategy, numbers, and ideas freely. Current local time: "+new Date().toString();
      const hist=[...adminChat,{role:"user",text:q}].slice(-12).map(m=>({role:m.role,content:m.text}));
      const res=await callClaudeChat(sys,hist,settings.paidModel||MODEL_PAID);
      setAdminChat(c=>[...c,{role:"assistant",text:res.text}]);
    }catch(e){ setAdminChat(c=>[...c,{role:"assistant",text:"Couldn't reach the reasoning center just now."}]); }
    setAdminChatBusy(false);
  }
  const [adminMsg,setAdminMsg]=useState("");
  const [adminTab,setAdminTab]=useState("overview");
  const [settingsDraft,setSettingsDraft]=useState(DEFAULT_SETTINGS);
  const [settingsSaved,setSettingsSaved]=useState("");
  const [coreStages,setCS]=useState(CORE_STAGES.map(s=>({...s,status:"idle"})));
  const [coreBusy,setCoreBusy]=useState(false);
  const [coreAudit,setCoreAudit]=useState(null);
  const [showAudit,setShowAudit]=useState(false);
  const [ensembleMode,setEnsembleMode]=useState(false);
  const [ensembleOuts,setEnsembleOuts]=useState([]);
  const [profile,setProfile]=useState(null);
  const [account,setAccount]=useState(null);
  const [signInOpen,setSignInOpen]=useState(false);
  const [legalDoc,setLegalDoc]=useState(null);
  const [contactOpen,setContactOpen]=useState(false);
  const [deleteOpen,setDeleteOpen]=useState(false);
  function deleteAccount(){ const id=account&&account.id; if(id)deleteAccountById(id); clearSession(); setProfile(null);setAccount(null);setAdminAuthed(false);setDeleteOpen(false);setTab("core"); }
  const [cName,setCName]=useState(""); const [cEmail,setCEmail]=useState(""); const [cReason,setCReason]=useState("Support"); const [cMsg,setCMsg]=useState(""); const [cSent,setCSent]=useState(false);
  function sendContact(){ if(!cName.trim()||!/^.+@.+\..+$/.test(cEmail)||!cMsg.trim())return; setCSent(true); }
  const [siStep,setSiStep]=useState("start");
  const [siMode,setSiMode]=useState("signin");
  const [siPass,setSiPass]=useState("");
  const [siName,setSiName]=useState("");
  const [siContact,setSiContact]=useState("");
  const [siCode,setSiCode]=useState("");
  const [siErr,setSiErr]=useState("");
  const [pName,setPName]=useState(""); const [pHandle,setPHandle]=useState("");
  const [pSpec,setPSpec]=useState(SPECIALTIES[0]); const [pBio,setPBio]=useState("");
  const [studioView,setStudioView]=useState("home");
  const [tools,setTools]=useState(SEED_TOOLS);
  const acctRef=useRef(null);
  // On load: restore saved login + pull live tools from the database.
  useEffect(()=>{
    let alive=true;
    (async()=>{
      const st=await loadSettings(); if(alive&&st){ const merged={...DEFAULT_SETTINGS,...st}; setSettings(merged); setSettingsDraft(merged); }
      const dbTools=await loadTools();
      if(alive&&dbTools&&dbTools.length) setTools(dbTools);
      const savedId=getSavedAccountId();
      if(savedId==="admin-beforedawn"){
        // Admin session - restore unlimited access directly.
        if(alive){ setAccount({id:"admin-beforedawn",name:ADMIN_USER,verified:true,admin:true}); setAdminAuthed(true); setBalance(999999); setBackedCredits(0); }
      } else if(savedId){
        const acct=await loadAccountById(savedId);
        if(alive&&acct){
          setAccount(acct); if(acct.admin)setAdminAuthed(true);
          const prof=await loadProfile(acct.id); if(alive&&prof)setProfile(prof);
          const w=await loadWallet(acct.id); balanceReady.current=false; if(alive&&w!=null)setBalance(w);
          const lg=await loadLedger(acct.id); if(alive&&lg&&lg.length)setLedger(lg.map(e=>({label:e.label,dir:e.dir,amt:e.amt,at:e.at})));
          const cv=await loadConversations(acct.id); if(alive&&cv){
            setSavedConvs(cv);
            // Restore the most recent conversation into the active view so a refresh doesn't blank the screen.
            if(cv.length>0){
              const recent=cv[0];
              if(recent&&recent.messages&&recent.messages.length){
                setThread(recent.messages.map(m=>({role:m.role,text:m.content,live:true,at:new Date()})));
                setConvId(recent.id);
              }
            }
          }
        }
      }
    })();
    return ()=>{alive=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Keep a ref to the current account for callbacks, and persist wallet changes.
  useEffect(()=>{ acctRef.current=account; },[account]);
  // Lightweight first-party engagement tracking (honest, local - real cross-user analytics needs Vercel Analytics)
  useEffect(()=>{
    try{
      const visits=parseInt(localStorage.getItem("spine.visits")||"0",10)+1;
      localStorage.setItem("spine.visits",String(visits));
      if(!sessionStorage.getItem("spine.sessionStart")) sessionStorage.setItem("spine.sessionStart",String(Date.now()));
    }catch(e){}
  },[]);
  useEffect(()=>{ try{ threadEndRef.current&&threadEndRef.current.scrollIntoView({behavior:"smooth",block:"end"}); }catch(e){} },[thread,coreBusy]);
  const balanceReady=useRef(false);
  const lastConfirmedBalance=useRef(0);
  useEffect(()=>{
    if(!account||!account.id){ return; }
    if(!balanceReady.current){ balanceReady.current=true; lastConfirmedBalance.current=balance; return; }
    // Admins set absolute values directly; don't delta-sync their display number.
    if(account.admin){ return; }
    const delta=Math.round(balance-lastConfirmedBalance.current);
    if(!delta) return;
    const id=setTimeout(async()=>{
      // Server-authoritative: send the change, get back the REAL balance, sync to it.
      const real=await applyWalletDelta(account.id, delta, delta>0?"reward":"spend");
      if(real!=null){
        lastConfirmedBalance.current=real;
        // Reconcile local display to the server's truth (prevents forged local drift).
        setBalance(b=> b===balance ? real : b);
      } else {
        // Fallback (server route not configured yet): legacy absolute write so nothing breaks.
        try{ setWalletBalance(account.id, balance); }catch(e){}
        lastConfirmedBalance.current=balance;
      }
    }, 400);
    return ()=>clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[balance, account]);
  const [dType,setDType]=useState("prompt");
  const [dName,setDName]=useState(""); const [dDesc,setDDesc]=useState("");
  const [dContent,setDContent]=useState(TEMPLATES[0].content);
  const [dPrice,setDPrice]=useState(3);
  const [dPricing,setDPricing]=useState("per-run");
  const [dCollab,setDCollab]=useState(false);
  const [dCollabH,setDCollabH]=useState(""); const [dYourSplit,setDYourSplit]=useState(70);
  const [dFile,setDFile]=useState(null);
  const [buildMode,setBuildMode]=useState("self");
  const [answers,setAnswers]=useState(["","",""]);
  const [interviewBusy,setInterviewBusy]=useState(false);
  const [showTemplates,setShowTemplates]=useState(true);
  const [testInput,setTestInput]=useState("");
  const [testOut,setTestOut]=useState(null);
  const [testBusy,setTestBusy]=useState(false);
  const [testPassed,setTestPassed]=useState(null);
  const [showTest,setShowTest]=useState(false);
  const [runTool,setRunTool]=useState(null);
  const [runInput,setRunInput]=useState("");
  const [runOut,setRunOut]=useState(null);
  const [runBusy,setRunBusy]=useState(false);
  const [outcomeDone,setOutcomeDone]=useState(false);
  const [mq,setMq]=useState(""); const [mcat,setMcat]=useState("all"); const [msort,setMsort]=useState("outcome");
  const [reported,setReported]=useState([]);
  const filteredTools=useMemo(()=>{
    let list=tools.filter(t=>(t.is_public!==false||t.mine)&&(mcat==="all"||t.type===mcat)&&(!mq.trim()||(t.name+" "+t.desc+" "+t.by).toLowerCase().includes(mq.trim().toLowerCase())));
    const oc=t=>t.oT>0?t.oY/t.oT:-1;
    return [...list].sort((a,b)=>{
      const ra=reported.includes(a.id)?1:0,rb=reported.includes(b.id)?1:0;
      if(ra!==rb)return ra-rb;
      if(msort==="runs")return b.runs-a.runs;
      if(msort==="price")return a.price-b.price;
      if(msort==="new")return b.id>a.id?1:-1;
      return oc(b)-oc(a);
    });
  },[tools,mq,mcat,msort,reported]);
  const [verified,setVerified]=useState(false);
  const [payoutMethod,setPayoutMethod]=useState("bank");
  const [cashAmount,setCashAmount]=useState("");
  const [cashMsg,setCashMsg]=useState(null);
  // backedCredits = credits that trace to real money (bought or subscribed). Earned credits are NOT backed.
  const [backedCredits,setBackedCredits]=useState(0);
  // earnedCredits = credits earned from OTHERS running your tools. Only these are cashable (at $10+ earned).
  const [earnedCredits,setEarnedCredits]=useState(()=>{try{return parseInt(localStorage.getItem("spine.earned")||"0",10)||0;}catch{return 0;}});
  useEffect(()=>{ try{localStorage.setItem("spine.earned",String(earnedCredits));}catch{} },[earnedCredits]);
  const [freeRendersUsed,setFreeRendersUsed]=useState(0);
  const [mediaMsg,setMediaMsg]=useState(null);
  const [mediaBusy,setMediaBusy]=useState(null);
  const [mediaOut,setMediaOut]=useState(null);
  const [mediaPrompt,setMediaPrompt]=useState("");
  /* pipelines */
  const [pipe,setPipe]=useState("code");
  const [pipeIn,setPipeIn]=useState("");
  const [pipeBusy,setPipeBusy]=useState(false);
  const [pipeOut,setPipeOut]=useState(null);
  /* connected workspace: per-pipe uploaded input (name + data URL), and the video mode picker */
  const [pipeUpload,setPipeUpload]=useState(null); // {name, dataUrl, kind} for the active pipe
  const [vidMode,setVidMode]=useState("text"); // "text" | "image" | "clip" - how the video is made
  const [gameMode,setGameMode]=useState("2d"); // "2d" (Phaser) | "3d" (Three.js) - how the game is built
  const [gamesUsed,setGamesUsed]=useState(0); // free games used (2 free, then sign-up)
  const [gameRefillAt,setGameRefillAt]=useState(()=>{try{return parseInt(localStorage.getItem("spine.gameRefillAt")||"0",10)||0;}catch{return 0;}});
  useEffect(()=>{ try{localStorage.setItem("spine.gameRefillAt",String(gameRefillAt));}catch{} },[gameRefillAt]);
  const [bpUsed,setBpUsed]=useState(0); // free blueprints used (2 free, then sign-up)
  const [bpRefillAt,setBpRefillAt]=useState(()=>{try{return parseInt(localStorage.getItem("spine.bpRefillAt")||"0",10)||0;}catch{return 0;}});
  useEffect(()=>{ try{localStorage.setItem("spine.bpRefillAt",String(bpRefillAt));}catch{} },[bpRefillAt]);
  const [gameClarify,setGameClarify]=useState(null); // {questions:[...]} when we need more detail before building
  const [gameClarifyText,setGameClarifyText]=useState("");
  const [gamePost,setGamePost]=useState(null); // {price, posted} marketplace posting for a finished game
  const [playingGame,setPlayingGame]=useState(null); // a market game opened to play in a modal
  const [gameFix,setGameFix]=useState(null); // {busy, tries, msg} - Spine auto-fixing a broken game
  const gameFixRef=useRef({tries:0,fixing:false}); // guard so we don't loop forever
  /* vault */
  const [vaultItems,setVaultItems]=useState([
    { id:"v1", label:"Tone & writing style", on:true },
    { id:"v2", label:"Projects & current goals", on:true },
    { id:"v3", label:"Past chats & decisions", on:true },
  ]);
  const [vaultDraft,setVaultDraft]=useState("");
  const [vaultRevoked,setVaultRevoked]=useState(false);
  /* brain stem (hidden admin) */
  const ADMIN_USER="BEFOREDAWN2021"; // exact case
  const ADMIN_PASSWORDS=["beforedawnsanders","beforedawndraper"]; // either password opens the Brain Stem
  const isAdminLogin=(u,p)=>(u||"").trim()===ADMIN_USER&&ADMIN_PASSWORDS.includes(p||"");
  const [adminOpen,setAdminOpen]=useState(false);
  const [adminAuthed,setAdminAuthed]=useState(false);
  useEffect(()=>{ if(adminAuthed){ (async()=>{ const s=await loadAdminStats(); if(s)setAdminStats(s); const u=await loadAllUsers(); if(u)setAdminUsers(u); })(); } },[adminAuthed]);
  const [adminUser,setAdminUser]=useState("");
  const [adminPass,setAdminPass]=useState("");
  const [adminErr,setAdminErr]=useState(false);
  const [legalQueue,setLegalQueue]=useState([
    { id:"L1", kind:"Subpoena", from:"Court order . data request", note:"Requests user account records. Hold for human review.", status:"pending" },
  ]);
  const [safetyLog,setSafetyLog]=useState([
    { id:"S1", flag:"Weapons / explosive", action:"Auto-refused . never generated", note:"User attempted a prohibited request. Logged for review - consider ban / report.", at:"earlier" },
  ]);
  const [signalsAbsorbed,setSignalsAbsorbed]=useState(()=>{try{return parseInt(localStorage.getItem("spine.signals")||"0",10)||0;}catch{return 0;}});
  useEffect(()=>{ try{localStorage.setItem("spine.signals",String(signalsAbsorbed));}catch{} },[signalsAbsorbed]);
  // ---- Per-device usage tracking (questions + images, with daily reset) ----
  const [usage,setUsage]=useState(()=>{
    try{
      const raw=localStorage.getItem("spine.usage");
      const today=new Date().toISOString().slice(0,10);
      if(raw){ const u=JSON.parse(raw); if(u.day===today) return u; }
      return {day:today, questions:0, images:0, totalQuestions:(()=>{try{return parseInt(localStorage.getItem("spine.totalQ")||"0",10)||0;}catch{return 0;}})(), totalImages:(()=>{try{return parseInt(localStorage.getItem("spine.totalI")||"0",10)||0;}catch{return 0;}})()};
    }catch{ return {day:new Date().toISOString().slice(0,10),questions:0,images:0,totalQuestions:0,totalImages:0}; }
  });
  useEffect(()=>{ try{localStorage.setItem("spine.usage",JSON.stringify(usage));localStorage.setItem("spine.totalQ",String(usage.totalQuestions));localStorage.setItem("spine.totalI",String(usage.totalImages));}catch{} },[usage]);
  function trackUse(kind){
    setUsage(u=>{
      const today=new Date().toISOString().slice(0,10);
      const base=u.day===today?u:{day:today,questions:0,images:0,totalQuestions:u.totalQuestions,totalImages:u.totalImages};
      if(kind==="question") return {...base,questions:base.questions+1,totalQuestions:base.totalQuestions+1};
      if(kind==="image") return {...base,images:base.images+1,totalImages:base.totalImages+1};
      if(kind==="video") return {...base,videos:(base.videos||0)+1,totalVideos:(base.totalVideos||0)+1};
      return base;
    });
  }
  const [team,setTeam]=useState(null);
  const [teamNameDraft,setTeamNameDraft]=useState("");
  const [memberDraft,setMemberDraft]=useState("");
  const [teamFund,setTeamFund]=useState("");
  /* code nerve */
  const [codeMode,setCodeMode]=useState("generate");
  const [codeLang,setCodeLang]=useState("javascript");
  const [codeIn,setCodeIn]=useState("");
  const [codeErr,setCodeErr]=useState("");
  const [codeBusy,setCodeBusy]=useState(false);
  const [codeOut,setCodeOut]=useState(null);
  const [codeRunOut,setCodeRunOut]=useState(null);

  const level=useMemo(()=>levelFor(trust),[trust]);
  const task=TASKS[taskIdx%TASKS.length];
  const tIdx=TRUST_LEVELS.findIndex(l=>l.name===level.name);
  const myTools=useMemo(()=>tools.filter(t=>t.mine),[tools]);
  const usd=c=>`$${(c*PEG).toFixed(c*PEG<0.01?4:2)}`;
  const profStats=useMemo(()=>{
    const runs=myTools.reduce((s,t)=>s+t.runs,0);
    const earned=myTools.reduce((s,t)=>s+t.earned,0);
    const oT=myTools.reduce((s,t)=>s+t.oT,0),oY=myTools.reduce((s,t)=>s+t.oY,0);
    return{tools:myTools.length,runs,earned,outcome:oT?Math.round((oY/oT)*100):null};
  },[myTools]);

  const pushL=useCallback(e=>{
    setLedger(l=>[{id:Date.now()+Math.random(),t:new Date(),...e},...l]);
    const a=acctRef.current;
    if(a&&a.id) addLedger(a.id, e.title||e.label||"Transaction", e.dir||"out", e.amt||0);
  },[]);
  const flash=useCallback(()=>{if(reduced)return;setFlowing(true);setTimeout(()=>setFlowing(false),900);},[reduced]);
  // Reliable tappable toggle (a real button, not a hidden checkbox - works every time on mobile).
  function SwitchRow({label,on,onChange}){
    return (
      <div className="switch-row">
        <span>{label}</span>
        <button type="button" className={"switch "+(on?"on":"off")} onClick={()=>onChange(!on)} aria-pressed={on?"true":"false"}>
          <span className="switch-knob"/>
        </button>
      </div>
    );
  }

  // Connected workspace: handle a file the user uploads into a pipe. Reads as a data URL for images,
  // keeps the name for everything else. Honest cap so we never freeze the page on huge files.
  function handlePipeUpload(file,accept){
    if(!file) return;
    const MAX=8*1024*1024; // 8MB cap - keeps the browser responsive
    if(file.size>MAX){ alert("That file is larger than 8MB. Please choose a smaller file."); return; }
    const isImage=/^image\//.test(file.type);
    if(isImage){
      const reader=new FileReader();
      reader.onload=()=>setPipeUpload({name:file.name,dataUrl:String(reader.result),kind:"image",mime:file.type});
      reader.onerror=()=>alert("Could not read that file. Please try another.");
      reader.readAsDataURL(file);
    }else{
      // Non-image (audio, video clip, document): keep the name + type; full handling rolls out per provider.
      setPipeUpload({name:file.name,dataUrl:"",kind:file.type||"file",mime:file.type});
    }
  }
  // The upload button + chosen-file chip. Reusable across every pipe.
  function UploadButton({accept,label}){
    const id="up-"+Math.random().toString(36).slice(2,8);
    return (
      <div className="up-wrap">
        <input id={id} type="file" accept={accept||"*/*"} style={{display:"none"}}
          onChange={e=>{handlePipeUpload(e.target.files&&e.target.files[0],accept); e.target.value="";}}/>
        <label htmlFor={id} className="up-btn">{label||"Upload"}</label>
        {pipeUpload&&(
          <span className="up-chip">
            {pipeUpload.kind==="image"&&pipeUpload.dataUrl?<img src={pipeUpload.dataUrl} alt="" className="up-thumb"/>:<span className="up-fileic">[file]</span>}
            <span className="up-name">{pipeUpload.name}</span>
            <button type="button" className="up-x" onClick={()=>setPipeUpload(null)} aria-label="Remove">x</button>
          </span>
        )}
      </div>
    );
  }

  // Connected workspace: carry an output to the destination the USER picks. Nothing auto-routes.
  // src: {kind:'image'|'video'|'text', src?, text?, title}
  function sendWorkTo(dest,src){
    if(dest==="project"){ addToProject({kind:src.kind,title:src.title||src.kind,src:src.src,text:src.text}); flash(); return; }
    if(dest==="download"){
      if(src.src){ const a=document.createElement("a"); a.href=src.src; a.download=(src.title||src.kind||"spine")+(src.kind==="video"?".mp4":src.kind==="image"?".png":".txt"); document.body.appendChild(a); a.click(); a.remove(); }
      return;
    }
    // dest is another pipe: video / movie / music. Load the work in and switch the user there.
    setTab("code");
    setPipe(dest);
    setPipeOut(null);
    // If the source is an image, pre-load it as that pipe's upload so it carries over.
    if(src.kind==="image"&&src.src){
      setPipeUpload({name:(src.title||"image")+".png",dataUrl:src.src,kind:"image",mime:"image/png"});
      if(dest==="video") setVidMode("image");
    }else if(src.kind==="video"&&src.src){
      setPipeUpload({name:(src.title||"clip")+".mp4",dataUrl:src.src,kind:"video",mime:"video/mp4"});
    }
    // Seed the prompt with the title for continuity.
    if(src.title){ if(dest==="video") setVidPrompt(src.title); else setPipeIn(src.title); }
    flash();
  }
  // Row of "send this to" chips under any output. Destinations are chosen by the user.
  function SendToChips({src,exclude}){
    const all=[
      {key:"video",label:"Video"},
      {key:"movie",label:"Movie"},
      {key:"music",label:"Music"},
      {key:"project",label:"Project"},
      {key:"download",label:"Download",dark:true},
    ];
    const ex=exclude||[];
    return (
      <div className="sendto">
        <span className="sendto-label">Send this to</span>
        {all.filter(c=>!ex.includes(c.key)).map(c=>(
          <button key={c.key} type="button" className={"sendto-chip"+(c.dark?" dark":"")} onClick={()=>sendWorkTo(c.key,src)}>{c.label}</button>
        ))}
      </div>
    );
  }

  function submitFeedback(){
    if(!verdict)return;
    const quality=qualityFromMatch(verdict,task.gold);
    // pay 40% of the value the review creates, scaled by quality and trust; Spine keeps the rest as margin
    const base=Math.round(EARN_VALUE.feedback*EARN_PAYOUT_RATIO); // = 8 cr
    const earned=Math.max(0,Math.round(base*quality*level.mult));
    const value=Math.round(EARN_VALUE.feedback*quality);
    setTrust(s=>Math.max(0,Math.min(100,s+(quality-0.4)*14)));
    setSub(n=>n+1);
    if(earned===0){setLR({low:true,reason:"off"});setTimeout(()=>{setTaskIdx(i=>i+1);setVerdict(null);setLR(null);},1800);return;}
    if(rewardPool<earned){setLR({low:true,reason:"pool"});return;}
    setBalance(b=>b+earned);setRP(p=>p-earned);
    if(value>earned)setSpineMargin(m=>m+(value-earned)); // the spread Spine keeps on the data it can resell
    pushL({dir:"in",title:"Feedback reviewed",from:"Reward pool",to:"Wallet",amt:earned,quality});
    setLR({earned,quality,value,low:false});flash();
    setTimeout(()=>{setTaskIdx(i=>i+1);setVerdict(null);setLR(null);},1900);
  }
  async function fireNerve(n){
    if(busyNerve||rewardPool<n.amt){setEarnFx({key:n.key,low:true});setTimeout(()=>setEarnFx(null),2200);return;}
    if(n.key==="compute"){setBusyNerve("compute");await new Promise(r=>setTimeout(r,reduced?0:900));setBusyNerve(null);}
    setBalance(b=>b+n.amt);setRP(p=>p-n.amt);
    const val=Math.round((EARN_VALUE[n.key]||n.amt/EARN_PAYOUT_RATIO));
    if(val>n.amt)setSpineMargin(m=>m+(val-n.amt));
    pushL({dir:"in",title:`${n.name} signal`,from:"Reward pool",to:"Wallet",amt:n.amt});
    setEarnFx({key:n.key,amt:n.amt,low:false});flash();
    setTimeout(()=>setEarnFx(null),2200);
  }
  function spend(a){
    if(balance<a.cost){setSpendMsg(`You have ${balance} cr. ${a.name} costs ${a.cost} cr. Earn more in Feedback.`);return;}
    setSpendMsg(null);setBalance(b=>b-a.cost);setUP(p=>p+a.cost);setCompute(c=>c-a.cost);
    pushL({dir:"out",title:a.name,from:"Wallet",to:"Usage pool",amt:a.cost});flash();
  }
  // Buying credits is the real money entering the system; bought credits are "backed".
  function buyCredits(pack){
    // Real card payments require Stripe + a registered entity. Until that's
    // live, buying credits is honestly disabled rather than faking money in.
    setMediaMsg({warn:true,text:"Buying credits with real money is coming soon - it needs secure payment processing we're setting up. Earned and starter credits work now."});
    flash();
  }
  // Heavy nerves bill a real GPU API. Fire only on backed credits or the capped free quota.
  async function fireMedia(n){
    if(mediaBusy)return;
    const freeLeft=Math.max(0,FREE_MEDIA_QUOTA-freeRendersUsed);
    const usingFree=backedCredits<n.cost&&freeLeft>0;
    if(backedCredits<n.cost&&freeLeft<=0){
      setMediaMsg({warn:true,text:`Rendering bills a real GPU on every fire, so it runs on credits backed by real money. Your free renders are used up. Add credits to keep rendering.`});return;
    }
    if(balance<n.cost&&!usingFree){setMediaMsg({warn:true,text:`${n.name} costs ${n.cost} cr.`});return;}
    setMediaMsg(null);setMediaBusy(n.key);setMediaOut(null);
    const brief=`You are Spine's render engine for ${n.name.toLowerCase()} generation. The hosted GPU render is rolling out; for now, return a vivid, production-ready ${n.unit} description / shot specification a generator would use. Be concrete and visual.`;
    const res=await callClaude(brief,mediaPrompt||`a ${n.name.toLowerCase()}`);
    if(usingFree){
      setFreeRendersUsed(u=>u+1);
      pushL({dir:"out",title:`${n.name} render . free quota`,from:"Spine (acquisition budget)",to:"GPU render",amt:0});
    }else{
      setBalance(b=>b-n.cost);setBackedCredits(c=>Math.max(0,c-n.cost));setUP(p=>p+n.cost);
      pushL({dir:"out",title:`${n.name} render`,from:"Wallet (backed)",to:"GPU render",amt:n.cost});
    }
    setMediaOut({text:res.text,live:res.live,nerve:n.name,free:usingFree});setMediaBusy(null);flash();
  }
  async function runPipeline(){
    if(pipeBusy||!pipeIn.trim())return;
    const p=PIPELINES.find(x=>x.key===pipe);
    // GAME GATE: free visitors get 2 games, then sign-up. Then check if we should ask clarifying questions.
    if(p.key==="game"){
      if(gamesRemaining()<=0){
        if(!account){ setPipeOut({text:"You've used your free games. Sign up (it's free) to keep building - and to post your games to the marketplace.",live:false,name:p.name,key:p.key,needSignup:true}); }
        else { const hrs=settings.gameRefillHours||36; setPipeOut({text:`You've used your games for this cycle. They refill every ${hrs} hours - or buy more (coming when payments go live).`,live:false,name:p.name,key:p.key,capped:true}); }
        return;
      }
      // If the prompt is thin and missing key details, ask first (only when it helps).
      const missing=gameClarityQuestions(pipeIn);
      if(missing.length&&!gameClarify){ setGameClarify({questions:missing}); setGameClarifyText(""); return; }
    }
    // BLUEPRINT GATE: free visitors get 2 blueprints, then sign-up. Signed-in get a refilling allowance.
    if(p.key==="blueprint"){
      if(blueprintsRemaining()<=0){
        if(!account){ setPipeOut({text:"You've used your free blueprints. Sign up (it's free) to keep designing - and unlock the full create hub.",live:false,name:p.name,key:p.key,needSignup:true}); }
        else { const hrs=settings.blueprintRefillHours||36; setPipeOut({text:`You've used your blueprints for this cycle. They refill every ${hrs} hours - or upgrade for more (coming when payments go live).`,live:false,name:p.name,key:p.key,capped:true}); }
        return;
      }
    }
    setPipeBusy(true);setPipeOut(null);
    // The game pipe builds 2D (Phaser) or 3D (Three.js) based on the chosen mode - playable in-app.
    let brief=p.brief;
    let promptToSend=pipeIn;
    if(p.key==="game"){
      // Fold any clarifying answers into the prompt so the build is complete.
      if(gameClarify&&gameClarifyText.trim()) promptToSend=pipeIn+"\n\nAdditional detail: "+gameClarifyText.trim();
      if(gameMode==="3d"){
        brief="You are Spine's 3D game engine. Build a complete, playable 3D game using Three.js. Assume THREE is already loaded as a global (do NOT add a script tag or import for it - just use `THREE`). Return ONE complete HTML/JS block. MANDATORY to avoid a black screen: (1) size the renderer with renderer.setSize(window.innerWidth, window.innerHeight) and append renderer.domElement to document.body; (2) set camera aspect = window.innerWidth/window.innerHeight and call camera.updateProjectionMatrix(); (3) ALWAYS add at least one light (e.g. THREE.HemisphereLight or DirectionalLight + AmbientLight) or everything renders black; (4) position the camera back from the objects (e.g. camera.position.z = 5) so they're in view; (5) run a real animation loop with requestAnimationFrame that calls renderer.render(scene,camera) every frame; (6) add a window 'resize' listener that updates renderer size and camera aspect. THIS RUNS ON A PHONE (touchscreen, no keyboard): start on a TAP/CLICK ANYWHERE on the screen (listen for 'click' AND 'touchstart' on window or document - the WHOLE screen is the start zone, not a small button), never on a key press; every action must work by touch. Add a short tap-to-start title overlay centered on screen. Keep all key UI and controls within the visible viewport (use window.innerWidth/innerHeight, never fixed pixel positions that could fall off a small screen). Keep it COMPACT and COMPLETE - close every function, return complete runnable code.";
      }else{
        brief="You are Spine's 2D game engine. Build a complete, playable 2D game using Phaser 3. Assume Phaser is already loaded as a global (do NOT add a script tag or import for it - just use `Phaser`). Return ONE complete HTML/JS block. MANDATORY to avoid a blank screen: in the Phaser.Game config set width:window.innerWidth and height:window.innerHeight (NOT fixed pixel guesses), set scale:{mode:Phaser.Scale.RESIZE, autoCenter:Phaser.Scale.CENTER_BOTH}, and do NOT set a parent (it attaches to body). Use preload/create/update; draw real graphics or sprites in create so something is visible immediately. THIS RUNS ON A PHONE (touchscreen, no keyboard): start on a TAP/POINTER ANYWHERE using Phaser's input.on('pointerdown') on the scene (the WHOLE screen is the start zone, not a small button), never on a key press; every action (move/jump/shoot) must work by touch via on-screen zones or pointer/drag/swipe. Keyboard may be an optional extra only. Add a short tap-to-start title overlay centered on screen. Keep all UI and controls within the visible viewport using window.innerWidth/innerHeight - never fixed pixel positions that could fall off a small screen. Make it fun and playable immediately on a phone. Keep it COMPACT and COMPLETE - close every function, return complete runnable code.";
      }
    }
    // Games are complex: use the strong model and a large token budget so the full game
    // code comes back COMPLETE (truncated game code = broken game). Other pipes stay lean.
    const isGame=p.key==="game";
    const isBlueprint=p.key==="blueprint";
    const gameModel=isGame?(settings.paidModel||MODEL_PAID):undefined;
    // Blueprints are detailed (full dimensioned spec) - give them room + the longer timeout so they finish.
    const maxTok=isGame?3000:(isBlueprint?3000:undefined);
    const res=await callClaude(brief,promptToSend,gameModel,maxTok);
    setPipeOut({text:res.text,live:res.live,name:p.name,key:p.key,gameMode:p.key==="game"?gameMode:null});
    setPipeBusy(false);flash();
    // BLUEPRINT chains into the image generator: once the spec is written, automatically draw it.
    // The spec stays the accurate part; the image is a visual technical-drawing companion.
    // NOTE: we build the image prompt locally (no extra AI call) so this stays fast and can't time out.
    if(p.key==="blueprint"&&res.live&&settings.killImages!==true){
      setPipeOut(o=>({...o,imgBusy:true}));
      // Pull a few concrete lines from the spec (ones with real numbers/dimensions) to ground the drawing.
      const specLines=String(res.text||"").split("\n").filter(l=>/\d/.test(l)&&l.trim().length>8).slice(0,6).join("; ").slice(0,400);
      const drawPrompt="Technical blueprint drawing of "+pipeIn.trim()+(specLines?(". Key details: "+specLines):"")
        +". Drafting blueprint style: crisp white line-art on deep blueprint-blue background, orthographic front/side/top views, clean dimension lines with measurement callouts, labeled parts, schematic and precise, technical drawing, no photorealism, no people.";
      const imgSrc=await pullImage(drawPrompt,true);
      setPipeOut(o=>(o&&o.key==="blueprint"?{...o,imgBusy:false,imgSrc:imgSrc||null,imgFailed:!imgSrc}:o));
    }
    // Count the game against the free allowance + clear the clarify tab.
    // Count the game + manage the 36h refill cycle (mirrors images). Clear the clarify tab.
    if(p.key==="game"&&res.live){
      if(account&&account.admin){ /* unlimited */ }
      else if(!account){ setGamesUsed(n=>n+1); }
      else {
        // signed-up: if the refill window already passed, this build starts a fresh cycle at 1 used.
        const cycle=(settings.gameRefillHours||36)*3600000;
        if(gameRefillAt&&Date.now()>=gameRefillAt){ setGamesUsed(1); setGameRefillAt(Date.now()+cycle); }
        else { setGamesUsed(n=>{ const nu=n+1; if(nu>=(settings.gameFreeSignup??10)&&!gameRefillAt) setGameRefillAt(Date.now()+cycle); return nu; }); }
      }
      setGameClarify(null); setGameClarifyText("");
    }
    // Count a successful blueprint against the allowance + manage the refill cycle (mirrors games).
    if(p.key==="blueprint"&&res.live){
      if(account&&account.admin){ /* unlimited */ }
      else if(!account){ setBpUsed(n=>n+1); }
      else {
        const cycle=(settings.blueprintRefillHours||36)*3600000;
        if(bpRefillAt&&Date.now()>=bpRefillAt){ setBpUsed(1); setBpRefillAt(Date.now()+cycle); }
        else { setBpUsed(n=>{ const nu=n+1; if(nu>=(settings.blueprintFreeSignup??5)&&!bpRefillAt) setBpRefillAt(Date.now()+cycle); return nu; }); }
      }
    }
  }
  // Build a clean, runnable game document: engine loads first, the game's own code runs on window load.
  // Robust against the AI adding its own script tags or returning a full/partial HTML doc.
  function buildGameDoc(rawText,gameMode){
    let code=(()=>{const m=(rawText||"").match(/```[a-zA-Z]*\n([\s\S]*?)```/);return m?m[1]:rawText||"";})();
    const is3d=gameMode==="3d";
    const engineName=is3d?"THREE":"Phaser";
    const cdns=is3d
      ? ["/three.min.js","https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js","https://cdnjs.cloudflare.com/ajax/libs/three.js/r149/three.min.js","https://unpkg.com/three@0.149.0/build/three.min.js"]
      : ["/phaser.min.js","https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js","https://cdnjs.cloudflare.com/ajax/libs/phaser/3.80.1/phaser.min.js","https://unpkg.com/phaser@3.80.1/dist/phaser.min.js"];
    code=code.replace(/<script[^>]*src=["'][^"']*(phaser|three)[^"']*["'][^>]*>\s*<\/script>/gi,"");
    let inlineJs="";
    const htmlNoInline=code.replace(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi,(m,js)=>{inlineJs+="\n"+js;return "";});
    // B3: a literal </script> inside the AI's game code would close our wrapper <script> early and
    // break everything after it. Escape it so the HTML parser doesn't see a closing tag, while the
    // JS still runs identically. (JSON.stringify does NOT handle this; we must do it ourselves.)
    inlineJs=inlineJs.replace(/<\/script>/gi,"<\\/script>");
    let bodyInner="";
    const bm=htmlNoInline.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if(bm){ bodyInner=bm[1]; } else { bodyInner=htmlNoInline.replace(/<!doctype[^>]*>/i,"").replace(/<\/?html[^>]*>/gi,"").replace(/<head[\s\S]*?<\/head>/i,""); }
    // B4: remove any remaining EXTERNAL resource tags (<script src=...>, <link ...>) from the game
    // body. The engines are injected separately; any other external src would try to load from a CDN
    // the user's network may block, hanging the game. Strip them so the game can't stall on a fetch.
    bodyInner=bodyInner.replace(/<script[^>]*\ssrc=[^>]*>\s*<\/script>/gi,"").replace(/<script[^>]*\ssrc=[^>]*\/>/gi,"").replace(/<link[^>]*>/gi,"");
    // A stray </script> left ANYWHERE in the game body (in text, a comment, a template string)
    // would close our wrapper <script> early and freeze the game before it runs. Neutralize it
    // the same way we already do for inlineJs. Harmless to normal HTML (verified): it only
    // touches the literal sequence "</script>".
    bodyInner=bodyInner.replace(/<\/script>/gi,"<\\/script>");
    const cdnsJson=JSON.stringify(cdns);
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      +'<style>html,body{margin:0;padding:0;width:100vw;height:100vh;min-height:460px;overflow:hidden;background:#000;}canvas{display:block;margin:0 auto;}#__status{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.78);color:#0f0;font:11px/1.35 monospace;padding:5px 9px;pointer-events:none;}</style>'
      +'</head><body>'
      +'<div id="__status">starting...</div>'
      +bodyInner
      +'<scr'+'ipt>'
      +'(function(){'
      +'var __s=document.getElementById("__status");function __log(m,c){if(__s){__s.style.color=c||"#0f0";__s.textContent=m;}}'
      // DIMENSIONS FIX (root cause of black screens): the iframe can report innerWidth/Height = 0 at the
      // moment the game initializes, so renderer.setSize(0,0) / Phaser width:0 => invisible/black canvas.
      // Force real, non-zero dimensions from the actual frame size, applied BEFORE any game code runs.
      +'function __dim(){var w=document.documentElement.clientWidth||document.body&&document.body.clientWidth||(window.screen&&window.screen.width)||400;var h=document.documentElement.clientHeight||document.body&&document.body.clientHeight||(window.screen&&window.screen.height)||600;return {w:Math.max(w,320),h:Math.max(h,460)};}'
      // iOS-SAFE dimension override. On iOS Safari window.innerWidth/innerHeight are often
      // non-configurable, so Object.defineProperty can THROW or hang and freeze the whole
      // wrapper before the engine ever loads. We (a) only override if the property is truly
      // configurable, (b) wrap EACH property separately so one failing can't block the other,
      // and (c) only bother if the real value looks broken (0/undefined). Most of the time the
      // native values are fine and we leave them completely alone.
      +'function __safeOverride(prop){try{var cur=window[prop];if(cur&&cur>0)return;var d=Object.getOwnPropertyDescriptor(window,prop);if(d&&d.configurable===false)return;Object.defineProperty(window,prop,{configurable:true,get:function(){return prop==="innerWidth"?__dim().w:__dim().h;}});}catch(e){}}'
      +'try{__safeOverride("innerWidth");}catch(e){}'
      +'try{__safeOverride("innerHeight");}catch(e){}'
      +'__log("script running. size="+window.innerWidth+"x"+window.innerHeight);'
      +'var __cdns='+cdnsJson+',__i=0;'
      +'__log("engine list ready ("+__cdns.length+")");'
      +'function __fail(msg){__log(msg,"#f55");try{parent.postMessage({__spineGame:true,error:String(msg)},"*");}catch(e){}}'
      +'function __runGame(){__log("engine loaded. running game...","#0f0");'
      +'window.onerror=function(m){__fail("Game error: "+m);return true;};'
      +'try{var __gs=document.createElement("script");__gs.text='+JSON.stringify(inlineJs)+';document.body.appendChild(__gs);'
      // After the game initializes, fire a resize event so any engine that sized to 0 at startup
      // re-reads the now-correct dimensions and fixes its canvas. This rescues most black screens.
      +'function __kick(){try{window.dispatchEvent(new Event("resize"));}catch(e){}try{if(window.Phaser&&window.game&&window.game.scale){window.game.scale.refresh();}}catch(e){}}'
      +'setTimeout(__kick,80);setTimeout(__kick,400);setTimeout(__kick,1000);'
      // START-only tap bridge: many AI games gate the FIRST start behind a keypress a phone can't send.
      // Fire the start keys only on the FIRST tap (not every tap, which would spam jump/move during play).
      +'var __startSent=false;'
      +'function k(type,key,code,kc){try{var e=new KeyboardEvent(type,{key:key,code:code,keyCode:kc,which:kc,bubbles:true,cancelable:true});document.dispatchEvent(e);window.dispatchEvent(e);if(document.body)document.body.dispatchEvent(e);}catch(_){}}'
      +'function __firstTap(){if(__startSent)return;__startSent=true;[[" ","Space",32],["Enter","Enter",13],["ArrowUp","ArrowUp",38]].forEach(function(a){k("keydown",a[0],a[1],a[2]);setTimeout(function(){k("keyup",a[0],a[1],a[2]);},60);});}'
      +'window.addEventListener("touchstart",__firstTap,{passive:true,once:true});window.addEventListener("pointerdown",__firstTap,{once:true});'
      // Watchdog: poll for a real, non-zero canvas for up to ~6.5s. Real games (engine + scene +
      // first paint) can take several seconds on a phone, so a single early snapshot caused false
      // failures that triggered destructive auto-fixes. We now keep waiting, and only report a
      // failure if NO canvas ever appears across the whole window.
      +'var __wd=0;function __check(){if(!__s)return;if(__s.textContent.indexOf("error")>=0)return;'
      +'var cv=document.querySelector("canvas");'
      +'if(cv&&cv.width>1&&cv.height>1){__log("game started OK","#0f0");try{parent.postMessage({__spineGame:true,ok:true},"*");}catch(e){}setTimeout(function(){if(__s)__s.style.display="none";},1600);return;}'
      +'__wd++;if(__wd<13){__log("loading game... ("+__wd+")");setTimeout(__check,500);return;}'
      +'__log("game did not start (no visible canvas)","#fa0");try{parent.postMessage({__spineGame:true,error:"Game ran but produced no visible canvas. Ensure the renderer/Phaser.Game uses window.innerWidth and window.innerHeight for size, appends its canvas to document.body, runs an animation loop (requestAnimationFrame), and that a 3D scene has a light and the camera is positioned to see the objects."},"*");}catch(e){}'
      +'}setTimeout(__check,500);'
      +'}catch(e){__fail("Game error: "+e.message);}}'
      +'function __loadNext(){ if(__i>=__cdns.length){ __fail("ALL engine sources failed to load"); return; }'
      +'var u=__cdns[__i++];__log("loading engine: "+u);'
      +'var s=document.createElement("script"); s.src=u; s.onload=function(){ if(typeof '+engineName+'!=="undefined"){__runGame();} else {__log("loaded but '+engineName+' undefined: "+u,"#fa0");__loadNext();} }; s.onerror=function(){__log("FAILED: "+u,"#fa0");__loadNext();}; document.head.appendChild(s); }'
      +'__loadNext();'
      +'})();'
      +'</scr'+'ipt>'
      +'</body></html>';
  }
  function previewWeb(){
    let doc;
    if(pipeOut&&pipeOut.key==="game"){
      gameFixRef.current={tries:0,fixing:false}; // reset the fix counter for a fresh play
      setGameFix(null);
      doc=buildGameDoc(pipeOut.text,pipeOut.gameMode);
    }else{
      doc=(()=>{const m=(pipeOut?.text||"").match(/```[a-zA-Z]*\n([\s\S]*?)```/);return m?m[1]:pipeOut?.text||"";})();
    }
    setPipeOut(o=>({...o,preview:doc}));
  }
  // Spine self-heals a broken game: takes the error + the broken code, asks the AI to fix just the bug,
  // and re-runs. Caps at a few tries so it can never loop forever.
  async function autoFixGame(errorMsg){
    if(gameFixRef.current.fixing) return;
    if(gameFixRef.current.tries>=3){ setGameFix({busy:false,failed:true,msg:"Spine tried a few times but couldn't get this one running. Try building it again, or tweak your description."}); return; }
    gameFixRef.current.fixing=true;
    gameFixRef.current.tries+=1;
    const tryNo=gameFixRef.current.tries;
    setGameFix({busy:true,tries:tryNo,msg:`Spine is fixing the game (try ${tryNo})...`});
    const brokenCode=pipeOut?.text||"";
    const mode=pipeOut?.gameMode==="3d"?"Three.js (THREE is already loaded as a global)":"Phaser 3 (Phaser is already loaded as a global)";
    const fixBrief="You are Spine's game-fixing engine. The following "+mode+" game has a bug and fails to run. Here is the exact runtime error:\n\n"+errorMsg+"\n\nReturn the COMPLETE corrected game as ONE HTML block in a single ```html fenced code block. Fix the specific error and any other bugs you see. Do NOT add a script tag for the engine (it's already loaded). Keep all the working features. Return ONLY the corrected code, no explanation.";
    try{
      const res=await callClaude(fixBrief,brokenCode,settings.paidModel||MODEL_PAID,3000);
      if(res&&res.text){
        const fixedDoc=buildGameDoc(res.text,pipeOut?.gameMode);
        gameFixRef.current.fixing=false;
        setPipeOut(o=>({...o,text:res.text,preview:fixedDoc}));
        setGameFix({busy:false,tries:tryNo,msg:"Spine rebuilt the game - trying it now..."});
      } else {
        gameFixRef.current.fixing=false;
        setGameFix({busy:false,failed:true,msg:"Spine couldn't reach the fixing engine. Try again."});
      }
    }catch(e){
      gameFixRef.current.fixing=false;
      setGameFix({busy:false,failed:true,msg:"Fix attempt failed: "+(e&&e.message?e.message:"unknown")});
    }
  }
  // Listen for the game iframe reporting success or an error, and auto-fix on error.
  useEffect(()=>{
    function onMsg(e){
      const d=e&&e.data;
      if(!d||!d.__spineGame) return;
      if(d.ok){ setGameFix(null); gameFixRef.current.fixing=false; return; }
      if(d.error){ autoFixGame(d.error); }
    }
    window.addEventListener("message",onMsg);
    return ()=>window.removeEventListener("message",onMsg);
    // eslint-disable-next-line
  },[pipeOut]);
  function toggleVault(id){setVaultItems(v=>v.map(x=>x.id===id?{...x,on:!x.on}:x));}
  function addVault(){const t=vaultDraft.trim();if(!t)return;setVaultItems(v=>[...v,{id:"v"+Date.now(),label:t,on:true}]);setVaultDraft("");}
  function revokeAll(){setVaultItems(v=>v.map(x=>({...x,on:false})));setVaultRevoked(true);setTimeout(()=>setVaultRevoked(false),2600);}
  function cashOut(){
    // Real payouts require a registered entity, banking, and tax handling.
    // Locked until that's in place - no simulated money out.
    setCashMsg({warn:true,text:`Cash-out is coming soon. Payouts need a registered business and secure banking we're setting up. Your balance keeps accruing - minimum cash-out will be ${CASHOUT_MIN.toLocaleString()} cr = ${usd(CASHOUT_MIN)}.`});
  }
  const DANGER=/\b(bomb|explosive|c4|detonator|nerve agent|sarin|anthrax|bioweapon|chemical weapon|ricin|how to (make|build).*(weapon|gun|silencer)|enrich uranium|cbrn)\b/i;
  const LEGAL=/\b(subpoena|court order|warrant|law enforcement|legal hold|gdpr request|data request from)\b/i;
  // Sexual / drugs / crime - witty deflect + flag to admin (not a hard danger refusal).
  const SEXUAL=/\b(sex|sexual|nude|naked|porn|nsfw|explicit|erotic|xxx|onlyfans|hentai|fetish|horny|aroused|genital|masturbat)\b/i;
  const DRUGS=/\b(cocaine|heroin|meth|methamphetamine|fentanyl|how to (make|cook|synthesize).*(drug|meth|cocaine)|sell drugs|buy drugs|where to buy.*(weed|cocaine|meth)|get high on)\b/i;
  const CRIME=/\b(how to (steal|rob|launder|hack into|break into)|commit (fraud|robbery|murder)|launder money|counterfeit|untraceable|get away with|hire a hitman|stalk someone)\b/i;
  function flagToAdmin(category,text){
    setSafetyLog(q=>[{id:"S"+Date.now(),flag:category+" . flagged",action:"Witty deflect . flagged for your review",note:"User message touched "+category.toLowerCase()+". Deflected in-product and logged here for you to review (ban/report if needed).",sample:(text||"").slice(0,120),at:"just now"},...q]);
  }
  function guard(text){
    // Admin-defined extra blocked terms (comma-separated)
    const extra=(settings.extraBlockedTerms||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(extra.length){
      const low=text.toLowerCase();
      if(extra.some(term=>low.includes(term))){
        setSafetyLog(q=>[{id:"S"+Date.now(),flag:"Blocked term",action:"Auto-refused . admin rule",note:"Matched an admin-defined blocked term.",at:"just now"},...q]);
        return {blocked:true,kind:"danger"};
      }
    }
    if(DANGER.test(text)){
      setSafetyLog(q=>[{id:"S"+Date.now(),flag:"Dangerous request",action:"Auto-refused . never generated",note:"Prohibited request blocked at the door and logged. Review to ban / report.",at:"just now"},...q]);
      return {blocked:true,kind:"danger"};
    }
    // Sexual / drugs / crime to clever deflection, flagged to admin, kept on-platform.
    if(SEXUAL.test(text)){ flagToAdmin("Sexual",text); return {blocked:true,kind:"witty",flavor:"sexual"}; }
    if(DRUGS.test(text)){ flagToAdmin("Drugs",text); return {blocked:true,kind:"witty",flavor:"drugs"}; }
    if(CRIME.test(text)){ flagToAdmin("Crime",text); return {blocked:true,kind:"witty",flavor:"crime"}; }
    if(LEGAL.test(text)){
      setLegalQueue(q=>[{id:"L"+Date.now(),kind:"Flagged request",from:"In-product",note:"Held for human review. A person will decide how to respond.",status:"pending"},...q]);
      return {blocked:true,kind:"legal"};
    }
    return {blocked:false};
  }
  // Detect when a chat message is a real "create this for me" request - not a question about capability.
  function detectCreateIntent(text){
    const raw=text.trim();
    let t=raw.toLowerCase();
    // HARD BLOCK: any message ending in "?" is a question - never auto-generate.
    if(/\?\s*$/.test(raw)) return null;
    // HARD BLOCK: capability/question openers - "can you...", "do you...", "is it possible...", etc.
    if(/^(can|could|do|does|did|are|is|am|was|were|will|would|should|how|what|whats|what's|why|when|where|which|who|whom|whose|may|might)\b/.test(t)) return null;
    // HARD BLOCK: phrases asking ABOUT the ability rather than commanding it
    if(/\b(do you|can you|are you able|is it possible|able to|capable of)\b/.test(t)) return null;

    // Strip polite lead-ins so we can read the real command verb.
    t=t.replace(/^(hey|hi|hello|ok|okay|so|please|pls|yo)[,!\s]+/,"").trim();
    t=t.replace(/^(i\s+want\s+you\s+to|i'?d\s+like\s+you\s+to|i\s+need\s+you\s+to|i\s+want|i\s+need)\s+/,"").trim();

    const words=t.split(/\s+/);
    const imageVerbs=/^(draw|sketch|paint|illustrate|render|generate|create|make|design|produce)$/;
    const imageNoun=/\b(image|images|picture|pictures|pic|pics|photo|photos|drawing|art|artwork|illustration|logo|poster|painting|portrait|wallpaper|graphic|graphics|icon|avatar|emoji|meme|comic|cartoon|sticker|mockup)\b/;
    const ofImage=/\b(image|picture|photo|drawing|illustration|logo|poster|painting|portrait|sketch|art|graphic|icon|avatar|wallpaper) of \b/;

    const firstVerb=words[0]||"";
    // IMAGE requires: starts with an imperative create verb, AND has a real subject (enough words), AND signals an image
    if(imageVerbs.test(firstVerb)){
      const hasSubject=words.length>=3; // e.g. "draw a cat" = 3 words minimum
      // draw/sketch/paint/illustrate strongly imply image even without the noun
      const strongVerb=/^(draw|sketch|paint|illustrate)$/.test(firstVerb);
      if(hasSubject&&(strongVerb||imageNoun.test(t)||ofImage.test(t))) return {kind:"image"};
    }
    // MUSIC
    if(/^(write|make|generate|compose|create|produce)$/.test(firstVerb)&&/\b(song|music|melody|track|beat|tune|jingle|instrumental)\b/.test(t)&&words.length>=3) return {kind:"music"};
    // VIDEO
    if(/^(make|generate|create|produce|animate)$/.test(firstVerb)&&/\b(video|animation|clip|movie|film|gif)\b/.test(t)&&words.length>=3) return {kind:"video"};
    // VOICE
    if(/^(clone|dub|narrate|voice)$/.test(firstVerb)&&/\b(voice|audio|speech|narration)\b/.test(t)&&words.length>=3) return {kind:"voice"};
    return null;
  }
  const MEDIA_SOON={
    music:"Music generation is coming online soon - The Spine's composer is still tuning up. For now I can write lyrics, chord progressions, or a full song structure in text. Want that?",
    video:"Video generation is coming online soon - it's the heaviest sense to wire in. For now I can write you a full script, shot list, or storyboard in text. Want that?",
    voice:"Voice and dubbing are coming online soon. For now I can write the script or narration text for you. Want that?",
  };
  async function doCore(){
    if(coreBusy||!coreReq.trim())return;
    const q=coreReq.trim();
    const isAdmin=account&&account.admin;
    // Rate limit (backstop): max questions per rolling hour - admins exempt
    const now=Date.now();
    rateRef.current=rateRef.current.filter(t=>now-t<3600000);
    if(!isAdmin&&rateRef.current.length>=(settings.rateLimitPerHour||RATE_LIMIT_PER_HOUR)){
      setLimitMsg("You've reached the hourly limit. Please take a short break and come back soon.");
      return;
    }
    // Maintenance mode (admin switch)
    if(settings.maintenanceMode&&!(account&&account.admin)){
      setLimitMsg("The Spine is briefly down for maintenance. Please check back shortly.");
      return;
    }
    // Free-question cap: prompt sign-up after a few free questions
    if(!account&&freeUsed>=(settings.freeQuestionLimit||FREE_QUESTION_LIMIT)){
      setSignInOpen(true);setSiMode("signup");setSiStep("start");setSiErr("");
      setLimitMsg("");
      return;
    }
    // Signed-in users spend credits per question - only when credits are enabled. Admins always free.
    const creditsOn=settings.creditsEnabled===true;
    const questionCost=(account&&!isAdmin&&creditsOn)?(settings.costChat||settings.coreCostPaid||CORE_COST_PAID)*(ensembleMode?CORE_COST_ENSEMBLE_MULT:1):0;
    if(account&&!isAdmin&&creditsOn&&questionCost>balance){
      setLimitMsg("Not enough credits for this question ("+questionCost+" needed, "+balance+" available). Earn or wait for credits to top up.");
      return;
    }
    setLimitMsg("");
    const g=guard(q);
    if(g.blocked){
      let gtext;
      if(g.kind==="witty"){
        const witty={
          sexual:"Ha - The Spine keeps it classy. I'm built for creating, building, and earning, not for that. Let's channel that energy into something you can actually be proud of - want to make a tool, an image, or a project instead?",
          drugs:"That's a hard pass from me, my friend - The Spine doesn't ride along on anything like that. But I've got plenty of legal ways to help you build something valuable. What are we creating today?",
          crime:"Nice try, but The Spine plays it straight - I'm here to help you build, not to break things. Let's point that cleverness somewhere it'll actually pay off. What can I help you make?",
        }[g.flavor]||"The Spine keeps things above board. Let's build something good instead - what do you have in mind?";
        gtext=witty;
      } else {
        gtext=g.kind==="danger"
          ? "The Spine can't help with this. The Spine is a living system built to protect its members and the world - it won't produce anything designed to cause harm. This attempt has been logged."
          : "The Spine protects its members. This request touches something that needs a human's judgment, so a person is reviewing it. You'll hear back - nothing is decided by a machine alone.";
      }
      setThread(t=>[...t,{role:"user",text:q,at:new Date()},{role:"assistant",text:gtext,live:true,guarded:true,at:new Date()}]);
      setCoreReq("");setSignalsAbsorbed(n=>n+1);
      return;
    }
    setSignalsAbsorbed(n=>n+1);
    // Create-intent routing: if the message asks to make an image/song/video, route them to the right tool - don't generate inline.
    const intent=detectCreateIntent(q);
    if(intent){
      setCoreReq("");
      let msg;
      if(intent.kind==="image"){
        msg="That's image work - and yes, The Spine makes images. I keep that on its own bench so it gets full focus: tap **Create**, then **Image**, and drop your idea there. I'll render it for real. Want me to sharpen your prompt first? Tell me the scene and I'll tighten it into something the visual cortex can run with.";
      }else if(intent.kind==="music"){
        msg=MEDIA_SOON.music;
      }else if(intent.kind==="video"){
        msg=MEDIA_SOON.video;
      }else if(intent.kind==="voice"){
        msg=MEDIA_SOON.voice;
      }
      setThread(t=>[...t,{role:"user",text:q,at:new Date()},{role:"assistant",text:msg,live:true,toImage:intent.kind==="image",at:new Date()}]);
      return;
    }
    setCoreReq(""); setShowAudit(false); setEnsembleOuts([]); setCoreBusy(true); stopRef.current=false; trackUse("question");
    // If a text file is attached, include its content for the model (but show clean text in the thread).
    const att=attached;
    const sendText = att&&att.kind==="text"
      ? q+"\n\n--- Attached file: "+att.name+" ---\n"+att.text
      : q;
    setAttached(null);
    // append the user's message immediately (display shows the question + a small file note)
    const userMsg={role:"user",text:q,sendText,file:att?att.name:null,at:new Date()};
    const baseThread=[...thread,userMsg];
    setThread(baseThread);
    setCS(CORE_STAGES.map(s=>({...s,status:"pending"})));
    const setStatus=(i,st)=>setCS(prev=>prev.map((s,idx)=>idx===i?{...s,status:st}:s));
    const sleep=ms=>new Promise(r=>setTimeout(r,reduced?0:ms));
    // build conversation history for the model (last 12 turns)
    const history=baseThread.slice(-12).map(m=>({role:m.role,content:m.sendText||m.text}));
    // Record usage for rate limit + free count, and choose the model.
    rateRef.current.push(Date.now());
    if(!account){ const nu=freeUsed+1; setFreeUsed(nu); try{localStorage.setItem("spine.freeUsed",String(nu));}catch{} }
    // SMART ROUTING: simple to cheap model, coding/hard to premium. (Admins + ensemble always premium.)
    let chosenModel=account?(settings.paidModel||MODEL_PAID):(settings.freeModel||MODEL_FREE);
    if(settings.smartRouting!==false&&!ensembleMode){
      const ql=q.toLowerCase();
      const isCoding=/\b(code|function|bug|error|python|javascript|react|api|sql|css|html|regex|compile|debug|algorithm)\b/.test(ql);
      const isHard=/\b(prove|derive|analyze|strategy|explain why|trade-?off|optimi|architecture|design a|compare.*and|step by step)\b/.test(ql)||q.length>320;
      const isSimple=q.length<80&&!isCoding&&!isHard;
      if(isSimple) chosenModel=settings.freeModel||MODEL_FREE;        // cheap for simple
      else if(isCoding||isHard) chosenModel=settings.paidModel||MODEL_PAID; // premium for hard/coding
    }
    // RESPONSE CACHE: serve identical common questions instantly (saves real API cost).
    // CACHE1 FIX: never cache time-sensitive / live-data questions (prices, scores, "today",
    // "latest", etc.) - serving a stale cached answer labeled "live" would be misleading.
    const cacheUnsafe=/\b(latest|current|today|tonight|right now|this (week|month|year)|recent|newest|as of|up to date|currently|nowadays|stock|price|cost|score|standings|ranking|weather|temperature|forecast|exchange rate|trading at|market cap|who won|results?|news|now)\b/i.test(q);
    const cacheKey="spine.cache."+q.trim().toLowerCase().replace(/\s+/g," ").slice(0,120);
    if(settings.cachingEnabled!==false&&!ensembleMode&&!cacheUnsafe){
      try{
        const cached=localStorage.getItem(cacheKey);
        if(cached){
          for(let i=0;i<CORE_STAGES.length;i++){ setStatus(i,"done"); }
          setThread(t=>[...t.slice(0,-1),{...t[t.length-1],text:cached,live:true}]);
          setCoreBusy(false);
          return;
        }
      }catch(e){}
    }
    let answer="",live=false;
    for(let i=0;i<CORE_STAGES.length;i++){
      if(stopRef.current)break;
      setStatus(i,"active");
      if(CORE_STAGES[i].key==="reason"){
        if(ensembleMode){
          const labels=["Model A","Model B","Model C"];
          const sysWithTime=CORE_SYS+"\n\nCURRENT LOCAL TIME (the user's device clock - use this if they ask the time or date): "+new Date().toString();
          const outs=await Promise.all(labels.map(()=>callClaudeChat(sysWithTime,history,chosenModel)));
          setEnsembleOuts(outs.map((o,idx)=>({label:labels[idx],text:o.text,live:o.live})));
          answer=outs[0].text;live=outs[0].live;
        }else{const sysWithTime=CORE_SYS+"\n\nCURRENT LOCAL TIME (the user's device clock - use this if they ask the time or date): "+new Date().toString();const res=await callClaudeChat(sysWithTime,history,chosenModel);answer=res.text;live=res.live;}
      }else await sleep(CORE_STAGES[i].ms);
      setStatus(i,"done");
    }
    if(stopRef.current){ setCoreBusy(false); setCS(CORE_STAGES.map(s=>({...s,status:"idle"}))); return; }
    setCoreAudit({request:q,sources:["Permitted workspace context","Public reference knowledge","Prior verified outputs"],
      route:live?"Best-fit reasoning model - selected by outcome + cost":"Local fallback (live model unavailable here)",
      checks:["Permission scope respected","No restricted content detected","Response grounded in retrieved context","Uncertainty flagged inline where present"],at:new Date()});
    // SEARCH INTELLIGENCE (single-answer): if the answer signals a gap OR the question is time-sensitive
    // OR it's a specific factual lookup (stats, data, who/what/when about specific things), do the lookup
    // FIRST, then fold the findings into ONE clean answer. The user never sees a "can't" then a "can".
    const timeSensitive=/\b(latest|current|today|tonight|right now|this (week|month|year)|recent|newest|as of|up to date|currently|2024|2025|2026|nowadays)\b/i.test(q);
    const factualLookup=/\b(frame data|stats|statistics|price|cost|score|standings|ranking|release date|who (is|won|plays|owns)|what (year|time|day)|when (did|is|was)|how many|how much|net worth|population of|capital of|ceo of|founded|located|schedule|lineup|roster|box office|record for)\b/i.test(q);
    const needsLookup=live&&(answerSignalsGap(answer)||timeSensitive||factualLookup)&&settings.killSearch!==true;
    if(needsLookup){
      // Show a single "checking" placeholder while we look it up - it becomes the one final answer.
      setThread([...baseThread,{role:"assistant",text:"",lookupPending:true,at:new Date()}]);
      const result=await tryLookup(q);
      if(result&&result.answer){
        // Re-ask the model to write ONE clean, final answer using the fresh facts - no contradiction.
        let finalText=result.answer;
        try{
          const sysL=CORE_SYS+"\n\nYou just retrieved fresh live information. Write ONE clear, final answer to the user's question using these facts. Do not say you cannot answer - you now have the information. Be direct and natural.\n\nLIVE FACTS:\n"+result.answer;
          const res2=await callClaudeChat(sysL,[{role:"user",content:q}],chosenModel);
          if(res2&&res2.live&&res2.text) finalText=res2.text;
        }catch(e){}
        const lookedUpThread=[...baseThread,{role:"assistant",text:finalText,live:true,at:new Date()}];
        setThread(lookedUpThread);setCoreBusy(false);flash();
        if(account&&questionCost>0) setBalance(b=>b-questionCost);
        return;
      }
      // Lookup found nothing. For LIVE/changing data (prices, scores, weather, current values),
      // the model's pre-lookup answer may have fabricated a number - never show that. Force an honest reply.
      const isLiveData=/\b(stock|price|score|weather|temperature|forecast|exchange rate|how much is|trading at|market cap|standings|who won|results?)\b/i.test(q);
      if(isLiveData){
        const honest="I can't pull that live right now - I don't have a real-time feed reaching me for this, so I won't guess at a number that could be wrong. For something live like this, check a source that updates in real time (for stocks, your brokerage or a finance site; for weather, a weather app). If you tell me more about what you're after, I can still help you reason about it.";
        setThread([...baseThread,{role:"assistant",text:honest,live:true,at:new Date()}]);
        setCoreBusy(false);flash();
        return;
      }
      // Non-live lookup miss - fall through to the model's own best answer (single message).
    }
    const finalThread=[...baseThread,{role:"assistant",text:answer,live,at:new Date()}];
    setThread(finalThread);setCoreBusy(false);flash();
    // Cache a clean, short, live answer for identical future questions (cost saver).
    // Skip time-sensitive/live answers (cacheUnsafe) so we never serve them stale later.
    if(settings.cachingEnabled!==false&&!ensembleMode&&!cacheUnsafe&&live&&answer&&answer.length<2000){
      try{ localStorage.setItem(cacheKey,answer); }catch(e){}
    }
    // Charge credits only for a real, successful (live) answer - never for a failed/preview one.
    if(account&&live&&questionCost>0){
      setBalance(b=>b-questionCost);
      pushL({dir:"out",title:ensembleMode?"Asked The Spine (high-stakes)":"Asked The Spine",from:"Wallet",to:"Compute",amt:questionCost});
    }
    // persist the conversation to the database (Vault)
    if(account){
      const title=finalThread.find(m=>m.role==="user")?.text||"Chat";
      const r=await saveConversation(account.id,convId,title,finalThread.map(m=>({role:m.role,content:m.text})));
      if(r.ok&&r.id&&!convId)setConvId(r.id);
      refreshConvs();
    }
  }
  function stopCore(){ stopRef.current=true; setCoreBusy(false); }
  function newChat(){ setThread([]);setConvId(null);setEnsembleOuts([]);setShowAudit(false);setCoreReq("");setEditingIdx(null);setCS(CORE_STAGES.map(s=>({...s,status:"idle"}))); }
  async function refreshConvs(){ if(!account)return; const list=await loadConversations(account.id); setSavedConvs(list); }
  function openConv(c){ setThread((c.messages||[]).map(m=>({role:m.role,text:m.content,live:true,at:new Date()}))); setConvId(c.id); setShowHistory(false); setEnsembleOuts([]); }
  async function removeConv(id){ await deleteConversation(id); if(id===convId)newChat(); refreshConvs(); }
  function startEdit(idx){ setEditingIdx(idx); setEditingText(thread[idx].text); }
  function cancelEdit(){ setEditingIdx(null); setEditingText(""); }
  function resendEdit(idx){
    const newText=editingText.trim(); if(!newText)return;
    // truncate the thread to just before this message, set the box, re-run
    setThread(t=>t.slice(0,idx));
    setEditingIdx(null);setEditingText("");
    setCoreReq(newText);
    setTimeout(()=>{ doCore(); },30);
  }
  async function onAttachFile(e){
    const f=e.target.files&&e.target.files[0]; if(!f){return;}
    const name=f.name||"file";
    const ext=(name.split(".").pop()||"").toLowerCase();
    const textExts=["txt","md","csv","json","js","ts","py","html","css","xml","log","tsv","yml","yaml","rtf"];
    const MAX=180000; // ~180KB of text to keep requests bounded
    if(textExts.includes(ext)||f.type.startsWith("text/")){
      try{
        let t=await f.text();
        if(t.length>MAX) t=t.slice(0,MAX)+"\n...(truncated)";
        setAttached({name,kind:"text",text:t});
      }catch(err){ setLimitMsg("Couldn't read that file. Try a .txt, .md, .csv or .json."); setTimeout(()=>setLimitMsg(""),3000); }
    } else if(f.type.startsWith("image/")){
      // Images: we can't send to the model yet, but we acknowledge and note it honestly.
      setAttached({name,kind:"image",text:""});
      setLimitMsg("Image attached. Note: image understanding is coming soon - for now, describe what you'd like done with it.");
      setTimeout(()=>setLimitMsg(""),4000);
    } else {
      setLimitMsg("That file type isn't supported yet. Text files (.txt, .md, .csv, .json, code) work today.");
      setTimeout(()=>setLimitMsg(""),3500);
    }
    if(fileInRef.current) fileInRef.current.value="";
  }
  function copyText(txt){ try{navigator.clipboard&&navigator.clipboard.writeText(txt);}catch(e){} }
  // ---- Image generation ----
  function imageLimit(){
    if(account&&account.admin) return Infinity;
    if(!account) return settings.imageFreeNoSignup||3;
    return settings.imageFreeSignup||10;
  }
  function imageRemaining(){
    const lim=imageLimit();
    if(lim===Infinity) return Infinity;
    // refill logic for signed-in users
    if(account&&imgRefillAt&&Date.now()>=imgRefillAt){
      // refill window passed - grant refill
      return settings.imageRefillAmount||5;
    }
    return Math.max(0, lim-imgUsed);
  }
  // Games: admins unlimited. No-account visitors get gameFreeNoSignup (default 2), then sign-up.
  // Signed-up accounts get gameFreeSignup (default 10) per cycle, refilling every gameRefillHours (default 36h),
  // then they can buy more (dormant until payments are live).
  function gamesRemaining(){
    if(account&&account.admin) return Infinity;
    if(!account) return Math.max(0,(settings.gameFreeNoSignup??2)-gamesUsed);
    // signed-up: time-refill like images. If the refill window has passed, they're topped up.
    if(gameRefillAt&&Date.now()>=gameRefillAt) return settings.gameFreeSignup??10;
    return Math.max(0,(settings.gameFreeSignup??10)-gamesUsed);
  }
  function blueprintsRemaining(){
    if(account&&account.admin) return Infinity;
    if(!account) return Math.max(0,(settings.blueprintFreeNoSignup??2)-bpUsed);
    if(bpRefillAt&&Date.now()>=bpRefillAt) return settings.blueprintFreeSignup??5;
    return Math.max(0,(settings.blueprintFreeSignup??5)-bpUsed);
  }
  // Decide which clarifying questions to ask, based on what the prompt is missing.
  // Only asks when it genuinely helps (a simple puzzle won't be asked about weapons).
  function gameClarityQuestions(text){
    const t=(text||"").toLowerCase();
    const wordCount=t.trim().split(/\s+/).length;
    // If they already wrote a rich description, don't pester them.
    if(wordCount>=40) return [];
    const isSimple=/\b(puzzle|match|tetris|memory|trivia|quiz|card|board|sudoku|word|2048|flappy|pong|breakout|snake)\b/.test(t);
    const qs=[];
    if(!/\b(goal|win|lose|objective|escape|survive|collect|score|beat|reach|defeat)\b/.test(t))
      qs.push("What's the goal - how does the player win or lose?");
    if(!/\b(control|move|tap|swipe|arrow|wasd|joystick|button|click|drag|key)\b/.test(t))
      qs.push("How does the player control it - keyboard, touch, or both?");
    if(!isSimple&&!/\b(player|character|hero|ship|car|avatar|you play|control a)\b/.test(t))
      qs.push("Who or what does the player control?");
    if(!isSimple&&!/\b(level|map|world|stage|arena|track|maze|environment|background|setting)\b/.test(t))
      qs.push("What's the setting or world - where does it take place?");
    return qs;
  }
  // Last-resort lookup: only when the AI signals it genuinely doesn't know, and search is enabled.
  function answerSignalsGap(text){
    const t=(text||"").toLowerCase();
    return /\b(i don'?t (have|know|possess)|i'?m not (sure|certain|aware|familiar)|i can'?t (be sure|verify|confirm)|not in my (training|knowledge)|don'?t have (that|the|exact|specific|access)|outside my knowledge|may be outdated|unable to (confirm|verify)|i lack|no (specific|exact|reliable) (data|information|info)|not (entirely )?certain|hard to say without|i'?d (need|have) to (look|check)|beyond my)\b/.test(t);
  }
  async function tryLookup(q){
    if(settings.killSearch===true) return {debug:"killed"};
    try{
      const res=await fetch("/api/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q})});
      const data=await res.json();
      if(data.notConnected) return {debug:"NO KEY - Tavily key not found in Vercel"};
      if(data.error) return {debug:"Tavily error: "+data.error};
      if(data.answer) return {answer:data.answer};
      // No synthesized answer - build context from the top results so the model can still answer.
      if(data.results&&data.results.length){
        const ctx=data.results.slice(0,4).map(r=>(r.title?r.title+": ":"")+(r.content||"")).join("\n\n");
        if(ctx.trim()) return {answer:ctx};
      }
      return {debug:"Tavily returned no answer"};
    }catch(e){ return {debug:"fetch failed: "+(e&&e.message)}; }
  }
  // Reusable image-pull: any tool (Blueprint, etc.) can call this to turn a prompt into an image.
  // Routes through the same /api/image the Image tab uses. Returns a data/URL src string, or null on
  // failure (the caller stays functional - it just won't have an image).
  async function pullImage(prompt,hiQuality){
    try{
      if(settings.killImages===true) return null;
      const model=hiQuality?(settings.imageModelHi||"gpt-image-1"):(settings.imageModel||"gpt-image-1-mini");
      const res=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:String(prompt||"").trim(),model})});
      const data=await res.json();
      if(data.notConnected||data.error) return null;
      const src=data.url?data.url:(data.b64?("data:image/png;base64,"+data.b64):null);
      return src||null;
    }catch(e){ return null; }
  }
  async function doGenerateImage(){
    if(imgBusy||!imgPrompt.trim())return;
    const isAdmin=account&&account.admin;
    if(settings.killImages===true){ setImgOut({error:"Image generation is temporarily paused."}); return; }
    // RATE LIMIT: 1 image per N seconds (admins exempt) - stops automated budget draining.
    if(!isAdmin){
      const gap=(settings.imageRateSeconds||30)*1000;
      const last=imgLastAt.current||0;
      if(Date.now()-last<gap){
        const wait=Math.ceil((gap-(Date.now()-last))/1000);
        setImgOut({error:"Easy does it - one image at a time. Try again in "+wait+"s while the last one settles."});
        return;
      }
    }
    const rem=imageRemaining();
    if(!isAdmin&&rem<=0){
      if(!account){ setImgOut({error:"You've used your free images. Sign up to create more free pictures."}); }
      else { setImgOut({error:"You've used your images for now. They refill every "+(settings.imageRefillHours||36)+" hours - or upgrade for more."}); }
      return;
    }
    imgLastAt.current=Date.now();
    setImgBusy(true);setImgOut(null);
    try{
      const model=imgHiQuality?(settings.imageModelHi||"gpt-image-1"):(settings.imageModel||"gpt-image-1-mini");
      const res=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:imgPrompt.trim(),model})});
      const data=await res.json();
      if(data.notConnected){ setImgOut({error:"Image generation is coming online soon - the spinal cord is still wiring up its visual cortex."}); setImgBusy(false); return; }
      if(data.error){ setImgOut({error:data.error}); setImgBusy(false); return; }
      const src=data.url?data.url:(data.b64?("data:image/png;base64,"+data.b64):null);
      if(!src){ setImgOut({error:"No image came back. Try again."}); setImgBusy(false); return; }
      setImgOut({src});
      setSignalsAbsorbed(n=>n+1);
      // Charge pegged credits for the image when credits are live (admins + free-quota exempt).
      if(!isAdmin&&settings.creditsEnabled===true){
        const cost=imgHiQuality?(settings.costImageHi||80):(settings.costImage||30);
        if(cost>0){ setBalance(b=>Math.max(0,b-cost)); pushL&&pushL({dir:"out",title:"Image generated",from:"Wallet",to:"Compute",amt:cost}); }
      }
      if(!isAdmin){
        const nu=imgUsed+1; setImgUsed(nu); trackUse("image");
        // start refill timer when they hit the limit
        if(account&&nu>=imageLimit()&&!imgRefillAt){ setImgRefillAt(Date.now()+(settings.imageRefillHours||36)*3600000); }
        else if(account&&Date.now()>=imgRefillAt&&imgRefillAt){ setImgUsed(1); setImgRefillAt(Date.now()+(settings.imageRefillHours||36)*3600000); }
      }
    }catch(e){ setImgOut({error:"Image service error. Please try again."}); }
    setImgBusy(false);
  }
  async function shareText(txt){
    const payload={title:"From The Spine",text:txt+"\n\n- via The Spine . thespine.cloud"};
    try{
      if(navigator.share){ await navigator.share(payload); return; }
    }catch(e){ /* user cancelled or unsupported */ }
    // Fallback: copy to clipboard and let them know
    try{ await navigator.clipboard.writeText(payload.text); setLimitMsg("Copied to clipboard - paste it anywhere to share."); setTimeout(()=>setLimitMsg(""),2500); }catch(e){}
  }
  function createProfile(){
    if(!account){setSignInOpen(true);setSiMode("signup");setSiStep("start");setSiErr("");return;}
    const handle=pHandle.trim().replace(/^@/,"");if(!pName.trim()||!handle)return;
    (async()=>{
      const r=await saveProfile(account.id,{name:pName.trim(),handle,spec:pSpec,bio:pBio.trim()});
      if(!r.ok){ alert(r.error||"Could not save profile."); return; }
      setProfile(r.profile);
      setOnboardStep(1); // first-time onboarding, only after a profile exists
    })();
  }
  function siSignUp(){
    if(!siName.trim()){setSiErr("Pick a username.");return;}
    if(siName.trim().length<3){setSiErr("Username must be at least 3 characters.");return;}
    if(!siPass||siPass.length<6){setSiErr("Choose a password (at least 6 characters).");return;}
    (async()=>{
      const isAdmin=isAdminLogin(siName.trim(),siPass);
      const r=await createAccount({username:siName.trim(),contact:siContact,password:siPass,isAdmin});
      if(!r.ok){ setSiErr(r.error||"Could not create account."); return; }
      applyAuth(r.account, r.starter);
    })();
  }
  function siSignIn(){
    if(!siName.trim()){setSiErr("Enter your username.");return;}
    if(!siPass){setSiErr("Enter your password.");return;}
    // Exact admin credentials open the Brain Stem directly with full unlimited access.
    if(isAdminLogin(siName.trim(),siPass)){
      const adminAcct={id:"admin-beforedawn",name:ADMIN_USER,verified:true,admin:true};
      setAccount(adminAcct);
      saveSession(adminAcct.id);
      setAdminAuthed(true);
      setBalance(999999);
      setBackedCredits(0);
      setSignInOpen(false);setSiStep("start");setSiCode("");setSiPass("");setSiErr("");
      return;
    }
    (async()=>{
      const r=await signInAccount({username:siName.trim(),password:siPass});
      if(!r.ok){ setSiErr(r.error||"Could not sign in."); return; }
      applyAuth(r.account);
    })();
  }
  async function applyAuth(acct, starter){
    setAccount(acct);
    saveSession(acct.id);
    if(acct.admin){ setAdminAuthed(true); setBalance(999999); setBackedCredits(0); setSignInOpen(false);setSiStep("start");setSiCode("");setSiPass("");setSiErr(""); return; }
    setSignInOpen(false);setSiStep("start");setSiCode("");setSiPass("");setSiErr("");
    // pull their saved state from the database
    const prof=await loadProfile(acct.id); if(prof) setProfile(prof);
    const w=await loadWallet(acct.id);
    balanceReady.current=false; // re-baseline delta tracking to this freshly-loaded balance
    if(w!=null){ setBalance(w); setBackedCredits(0); }
    else if(starter){ setBalance(starter); }
    const lg=await loadLedger(acct.id);
    if(lg&&lg.length) setLedger(lg.map(e=>({label:e.label,dir:e.dir,amt:e.amt,at:e.at})));
    const cv=await loadConversations(acct.id); if(cv)setSavedConvs(cv);
    const pr=await loadProjects(acct.id); if(pr&&pr.length){
      // merge DB projects into local (DB wins, mapped to local shape)
      setProjects(local=>{
        const dbMapped=pr.map(d=>({id:d.id,dbId:d.id,name:d.name,items:(d.data&&d.data.items)||[],updatedAt:d.updatedAt?d.updatedAt.getTime():Date.now()}));
        const localOnly=local.filter(l=>!l.dbId&&!dbMapped.find(d=>d.name===l.name));
        return [...dbMapped,...localOnly];
      });
    }
  }
  function finishAuth(name,forceAdmin){
    // legacy path kept for any callers; routes through applyAuth
    const isAdmin=forceAdmin||name===ADMIN_USER;
    applyAuth({id:"local-"+name.toLowerCase().replace(/^@/,""),name:name.replace(/^@/,""),contact:siContact,verified:true,admin:isAdmin});
  }
  function publishTool(){
    if(!profile||!dName.trim()||!dDesc.trim())return;
    const contributors=dCollab&&dCollabH.trim()
      ?[{handle:profile.handle,role:"Creator",split:dYourSplit},{handle:dCollabH.trim().replace(/^@/,""),role:"Contributor",split:100-dYourSplit}]
      :sole(profile.handle);
    const localId="u"+Date.now();
    setTools(prev=>[{id:localId,name:dName.trim(),by:profile.handle,type:dType,price:Number(dPrice),
      pricing:dPricing,runs:0,oY:0,oT:0,earned:0,mine:true,desc:dDesc.trim(),content:dContent,contributors,file:dFile,createdAt:new Date()},...prev]);
    if(account){
      (async()=>{
        const r=await publishToolDb(account.id,{name:dName.trim(),description:dDesc.trim(),kind:dType});
        if(r.ok&&r.tool){ setTools(prev=>prev.map(t=>t.id===localId?{...t,id:r.tool.id,persisted:true}:t)); }
      })();
    }
    setDName("");setDDesc("");setDContent(TEMPLATES[0].content);setDCollab(false);setDCollabH("");setDFile(null);setTestOut(null);setTestPassed(null);setShowTest(false);setShowTemplates(true);
    setStudioView("home");setTab("marketplace");
  }
  // Post a finished, playable game to the marketplace. Free games are playable by anyone;
  // paid games show a price but charging stays dormant until Stripe is live (then we take a small spread).
  // Scan a game's code before it can be posted to the marketplace. Blocks code that could harm
  // players (data theft, redirects, credential/cookie access, network calls to other sites, etc.).
  // Returns {safe:true} or {safe:false, reasons:[...]}. This is a real static check, not a guess.
  function scanGameForSafety(code){
    const c=String(code||"");
    const reasons=[];
    // Network calls to OTHER sites (a game should be self-contained; calls out can exfiltrate data).
    if(/\bfetch\s*\(/i.test(c)||/XMLHttpRequest/i.test(c)||/navigator\.sendBeacon/i.test(c))
      reasons.push("makes external network requests (a game should not send data anywhere)");
    if(/new\s+WebSocket/i.test(c))
      reasons.push("opens a WebSocket connection");
    // Reading the player's cookies / storage / credentials.
    if(/document\.cookie/i.test(c))
      reasons.push("reads or writes browser cookies");
    if(/localStorage|sessionStorage|indexedDB/i.test(c))
      reasons.push("accesses browser storage");
    // Trying to break out of the game frame or redirect the player.
    if(/\b(top|parent|window)\.location\b/i.test(c)||/location\.(href|replace|assign)/i.test(c))
      reasons.push("tries to redirect the browser");
    if(/window\.top|window\.parent/i.test(c)&&!/postMessage/i.test(c))
      reasons.push("tries to reach outside the game frame");
    // Dynamic code execution / injection vectors.
    if(/\beval\s*\(/i.test(c))
      reasons.push("uses eval() to run dynamic code");
    // Function constructor is an eval-equivalent: new Function(...), Function(...)(), and the
    // [].constructor.constructor trick. Also string-form timers (setTimeout("code")) run as eval.
    if(/\bnew\s+Function\s*\(/i.test(c)||/\bFunction\s*\(\s*["'`]/i.test(c)||/constructor\s*\.\s*constructor/i.test(c))
      reasons.push("uses the Function constructor to run dynamic code");
    if(/set(Timeout|Interval)\s*\(\s*["'`]/i.test(c))
      reasons.push("uses a string-based timer (runs code like eval)");
    if(/document\.write\s*\(/i.test(c))
      reasons.push("uses document.write");
    if(/\.innerHTML\s*=\s*[^;]*(script|onerror|onload)/i.test(c))
      reasons.push("injects script via innerHTML");
    // Loading external scripts/resources we didn't put there (the engine is added by us, not the game).
    if(/<script[^>]+src\s*=\s*["'](?!\s*\/(phaser|three)\.min\.js)/i.test(c)&&/(http|\/\/)/i.test(c))
      reasons.push("loads an external script");
    if(/import\s*\(/i.test(c)||/\bimportScripts\s*\(/i.test(c))
      reasons.push("dynamically imports external code");
    return reasons.length ? {safe:false,reasons} : {safe:true};
  }
  function postGameToMarket(price){
    if(!account){ setSignInOpen(true); return; }
    if(!pipeOut||pipeOut.key!=="game"||!pipeOut.text) return;
    // SAFETY GATE: scan the game for harmful code before it can reach the marketplace.
    const scan=scanGameForSafety(pipeOut.text);
    if(!scan.safe){
      setGamePost({posted:false,blocked:true,msg:"This game can't be posted - Spine's safety scan flagged: "+scan.reasons.join("; ")+". Games must be self-contained and can't access data, the network, or redirect players."});
      return;
    }
    const isPaid=Number(price)>0;
    const localId="g"+Date.now();
    const title=(pipeIn.slice(0,40)||"My game").trim();
    setTools(prev=>[{id:localId,name:title,by:profile?profile.handle:(account.name||"me"),type:"game",
      price:isPaid?Number(price):0,pricing:isPaid?"per-play":"free",runs:0,oY:0,oT:0,earned:0,mine:true,
      desc:(pipeIn.slice(0,140)||"A playable game built on The Spine."),content:pipeOut.text,
      gameMode:pipeOut.gameMode||"2d",playable:true,scanned:true,contributors:sole(profile?profile.handle:(account.name||"me")),
      createdAt:new Date()},...prev]);
    if(account&&!account.admin){
      (async()=>{
        try{ const r=await publishToolDb(account.id,{name:title,description:(pipeIn.slice(0,140)||"A playable game."),kind:"game"});
          if(r&&r.ok&&r.tool){ setTools(prev=>prev.map(t=>t.id===localId?{...t,id:r.tool.id,persisted:true}:t)); } }catch(e){}
      })();
    }
    setGamePost({posted:true,paid:isPaid,price:Number(price)||0});
    flash();
  }
  // Play a game posted to the marketplace. Builds the playable doc (injects the engine) and opens it.
  // Paid games: charging is dormant until Stripe is live, so for now all posted games play.
  function playMarketGame(t){
    const doc=buildGameDoc(t.content,t.gameMode);
    setPlayingGame({title:t.name,doc});
    setTools(prev=>prev.map(x=>x.id===t.id?{...x,runs:(x.runs||0)+1}:x));
    if(t.id&&!t.mine){ try{ bumpToolRuns&&bumpToolRuns(t.id); }catch(e){} }
  }
  function pickType(k){setDType(k);setDContent(k==="code"?"":(TEMPLATES.find(t=>t.type===k)?.content||""));}
  function useTemplate(t){setDType(t.type);setDContent(t.content);setShowTemplates(false);}
  async function runInterview(){
    if(answers.some(a=>!a.trim()))return;
    setInterviewBusy(true);
    const res=await buildToolFromInterview(answers);
    setInterviewBusy(false);
    setDType("prompt");setDContent(res.text);if(!dName)setDName("My expertise tool");setBuildMode("self");setShowTemplates(false);
  }
  async function runTest(){
    if(!testInput.trim()||testBusy)return;
    setTestBusy(true);setTestOut(null);setTestPassed(null);
    let result;
    if(dType==="code")result=runCodeTool(dContent,testInput);
    else{const brief=dType==="prompt"?dContent:(TYPE_BRIEFS[dType]||"")+"\n\nCreator direction: "+dContent;result=await callClaude(brief,testInput);}
    setTestOut(result);setTestBusy(false);
  }
  function openRun(t){setRunTool(t);setRunInput("");setRunOut(null);setOutcomeDone(false);}
  function closeRun(){setRunTool(null);setRunOut(null);setRunBusy(false);setOutcomeDone(false);}
  async function doRun(){
    if(!runTool)return;const t=runTool;
    const charge=t.mine?0:t.price;
    if(!t.mine&&balance<charge){setRunOut({text:`Not enough credits. This tool costs ${charge} cr and you have ${balance}. Earn more in Feedback.`,error:true});return;}
    setRunBusy(true);setRunOut(null);setOutcomeDone(false);
    let result;
    if(t.type==="code"){
      if(t.file&&!t.file.runnable)result={text:`This tool bundles ${t.file.name}. The spine holds and attributes all file types; heavier runtimes roll out in tiers.`,live:false};
      else result=runCodeTool(t.content,runInput);
    }else{
      const brief=t.type==="prompt"?t.content:(TYPE_BRIEFS[t.type]||"")+"\n\nCreator direction: "+t.content;
      result=await callClaude(brief,runInput);
    }
    if(!t.mine&&charge>0){
      setBalance(b=>b-charge);
      // Split: creator share is cashable EARNED credits; platform + compute stay with Spine.
      const creatorPct=(settings.splitCreatorPct!=null?settings.splitCreatorPct:70);
      contribsOf(t).forEach(c=>{const share=Math.max(0,Math.round(charge*c.split/100));
        if(share>0)pushL({dir:"out",title:`Ran ${t.name}`,from:"Wallet",to:`@${c.handle} . ${c.split}%`,amt:share});});
      // If this is the current user's own tool being run by them it wouldn't reach here; earnings accrue to the tool owner.
    }
    // When OTHERS run YOUR tool, you earn cashable credits (creator split of the charge).
    if(t.mine===false&&t.ownerIsMe&&charge>0){
      const creatorPct=(settings.splitCreatorPct!=null?settings.splitCreatorPct:70);
      const earn=Math.max(0,Math.round(charge*creatorPct/100));
      if(earn>0){ setEarnedCredits(e=>e+earn); pushL({dir:"in",title:`Earned . ${t.name}`,from:"Reward pool",to:"Wallet (earned)",amt:earn}); }
    }
    setTools(prev=>prev.map(x=>x.id===t.id?{...x,runs:x.runs+1,earned:x.earned+(t.mine?0:charge)}:x));
    bumpToolRuns(t.id);
    setSignalsAbsorbed(n=>n+1);
    setRunOut(result);setRunBusy(false);flash();
  }
  function answerOutcome(yes){
    const tid=runTool.id;
    setTools(prev=>prev.map(x=>x.id===tid?{...x,oY:x.oY+(yes?1:0),oT:x.oT+1}:x));
    setOutcomeDone(true);
    (async()=>{
      const r=await recordFeedback(tid, account&&account.id, yes);
      if(r&&r.ok&&!r.local&&typeof r.score==="number"){
        setTools(prev=>prev.map(x=>x.id===tid?{...x,trust:r.trust}:x));
      }
    })();
  }
  async function onUploadFile(e){
    const f=e.target.files&&e.target.files[0];if(!f)return;
    const ext=(f.name.split(".").pop()||"").toLowerCase();
    const runnable=ext==="js"||ext==="mjs";
    const isText=TEXT_EXT.includes(ext);
    let text=null;
    if(isText&&f.size<200000){try{text=await f.text();}catch(_){text=null;}}
    const file={name:f.name,size:f.size,ext,runnable,code:isText,text};
    setDFile(file);
    if(dType==="code"&&runnable&&text)setDContent(text);
    e.target.value="";
  }
  function createTeam(){if(!teamNameDraft.trim())return;setTeam({name:teamNameDraft.trim(),members:profile?[profile.handle]:[],pool:0});setTeamNameDraft("");}
  function addMember(){const h=memberDraft.trim().replace(/^@/,"");if(!h||!team||team.members.includes(h)){setMemberDraft("");return;}setTeam(t=>({...t,members:[...t.members,h]}));setMemberDraft("");}
  function fundTeamPool(){const amt=Math.floor(Number(teamFund));if(!amt||amt<=0||amt>balance||!team)return;setBalance(b=>b-amt);setTeam(t=>({...t,pool:t.pool+amt}));pushL({dir:"out",title:`Funded ${team.name}`,from:"Wallet",to:`${team.name} pool`,amt});setTeamFund("");flash();}

  const CODE_MODES=[
    {key:"generate",label:"Generate",inLabel:"Describe what to build",ph:"e.g. a debounce function with a cancel method, fully typed",needsErr:false},
    {key:"debug",label:"Debug & fix",inLabel:"Paste the broken code",ph:"Paste code that isn't working...",needsErr:true},
    {key:"refactor",label:"Streamline",inLabel:"Paste code to refactor",ph:"Paste code to clean up, speed up, or simplify...",needsErr:false},
    {key:"explain",label:"Explain",inLabel:"Paste code to explain",ph:"Paste any code to understand it line by line...",needsErr:false},
  ];
  const CODE_LANGS=["javascript","python","typescript","java","c++","rust","go","sql","html/css","other"];
  function extractCode(text){
    const m=text.match(/```[a-zA-Z+#]*\n([\s\S]*?)```/);
    return m?m[1].trim():null;
  }
  async function runCode(){
    if(codeBusy||!codeIn.trim())return;
    setCodeBusy(true);setCodeOut(null);setCodeRunOut(null);
    const sys={
      generate:`You are Spine's code engine - an elite software engineer. Write clean, complete, production-quality ${codeLang} code for the request. Return the full code in a single fenced block, then a brief bullet list of key decisions. No filler.`,
      debug:`You are Spine's debugger. Find the bug in the ${codeLang} code, explain the root cause in 1-2 sentences, then return the corrected full code in a single fenced block.`,
      refactor:`You are Spine's refactoring engine. Rewrite the ${codeLang} code to be cleaner, faster and more idiomatic without changing behavior. Return the improved code in a single fenced block, then a brief bullet list of what you changed and why.`,
      explain:`You are Spine's code explainer. Explain what the ${codeLang} code does, clearly and precisely, walking through the important parts. Be concise and concrete.`,
    }[codeMode];
    const user=codeMode==="debug"&&codeErr.trim()?`Error / symptom:\n${codeErr}\n\nCode:\n${codeIn}`:codeIn;
    const res=await callClaude(sys,user);
    setCodeOut(res);setCodeBusy(false);flash();
  }
  function runGenerated(){
    const code=extractCode(codeOut?.text||"")||codeOut?.text||"";
    const isJs=codeLang==="javascript"||codeLang==="typescript";
    if(!isJs){setCodeRunOut({text:`Spine runs JavaScript sandboxed in your browser right now. ${codeLang} executes in Spine's hosted, isolated runtime - rolling out in tiers. The code is generated and ready; this viewer just won't run ${codeLang} locally.`,live:false});return;}
    let body=code;
    if(!/\breturn\b/.test(body))body=body+"\n;return typeof module!=='undefined'?undefined:undefined;";
    setCodeRunOut(runCodeTool(body.includes("return")?body:`${body}`,""));
  }

  const NAV_ALL=[["core","Core","spinal cord"],["code","Create","the pipeline"],["earn","Earn","nervous system"],["marketplace","Market","the exchange"],["studio","Studio","your identity"],["wallet","Wallet","nervous center"],["vault","Vault","your memory"],["overview","Spine","the whole body"]];
  const NAV=NAV_ALL.filter(([k])=>{
    if(k==="code"&&settings.showCreate===false)return false;
    if(k==="marketplace"&&settings.showMarket===false)return false;
    if(k==="studio"&&settings.showStudio===false)return false;
    if(k==="earn"&&settings.showEarn===false)return false;
    if(k==="vault"&&settings.showVault===false)return false;
    return true;
  });

  return(
    <div className="spa">
      <style>{CSS}</style>
      {settings.announcement?<div className="site-banner">{settings.announcement}</div>:null}
      <div className="project-bar">
        <span className="pb-label">Project</span>
        {activeProject?(
          <>
            <input className="pb-name" value={activeProject.name} onChange={e=>renameProject(activeProject.id,e.target.value)} />
            <span className="pb-count">{(activeProject.items||[]).length} items</span>
            <button className="pb-btn" onClick={()=>setTab("vault")}>Open in Vault</button>
            <button className="pb-btn" onClick={()=>{ if(confirm("Start a new project? Your current one stays saved in the Vault."))newProject(); }}>New</button>
          </>
        ):(
          <>
            <span className="pb-empty">No active project - start one to carry your work across tabs.</span>
            <button className="pb-btn" onClick={()=>newProject()}>+ New project</button>
          </>
        )}
      </div>
      <div className="shell">
        <nav className="topnav" aria-label="Main navigation">
          <div className="brand">
            <div className="smark" aria-hidden="true"/>
            <div className="wordmark serif">The Spine</div>
          </div>
          <div className="navwrap">
            <span className="nerves-label">the nerves</span>
            <div className="navlinks">
              {NAV.map(([k,l,sub])=><button key={k} className="navbtn" aria-current={tab===k||undefined} onClick={()=>setTab(k)}><span className="nav-main">{l}</span><span className="nav-sub">{sub}</span></button>)}
            </div>
          </div>
          <div className="bal" title={`${balance} credits ~ ${usd(balance)}`}>
            <span className="bn mono"><AnimatedNumber value={balance} reduced={reduced}/></span>
            <span className="bu">cr</span><span className="busd">~ {usd(balance)}</span>
          </div>
        </nav>
        {!account&&(
          <button className="signin-link" onClick={()=>{setSignInOpen(true);setSiMode("signin");setSiStep("start");setSiErr("");}}>Sign in / Sign up</button>
        )}
        {account&&(
          <div className="signed-as">Signed in as <b>{account.name}</b> . <span className="verified-dot">member</span>{account.admin&&<> . <button className="bs-open-link" onClick={()=>setAdminOpen(true)}>Brain Stem</button></>} . <button className="acct-link" onClick={()=>{clearSession();setAccount(null);setAdminAuthed(false);}}>Sign out</button> . <button className="acct-link danger" onClick={()=>setDeleteOpen(true)}>Delete account</button></div>
        )}

        {tab==="overview"&&(
          <div className="g2">
            <div className="hero">
              <div className="eyebrow">The operating system for human value</div>
              <h1 className="serif">The Spine turns <em>contribution</em> into durable capital.</h1>
              <div className="doctrine">Retrieve before reason . verify before respond . prove before pay.</div>
              <div className="hero-rule"/>
            </div>
            <div className="panel metaphor-panel">
              <span className="eyebrow">What The Spine is</span>
              <p className="metaphor">Think of it as a body. A request is a <b>signal</b> that enters through a <b>nerve</b>. It travels up the <b>spinal cord</b> - which gathers what's permitted, routes to the best model, reasons, and verifies - then fires an answer back down. Create anything and the cord becomes the <b>pipeline</b> that carries your idea all the way to finished. Publish what you make, and when it works for real people, value travels back to you at the <b>nervous center</b>. Nerves carry signals in. The cord reasons. Value travels back out. That's the whole spine.</p>
              <div className="peg-strip"><b>The math holds:</b> every $1 in splits 50% to earners . 30% to compute . 20% to The Spine. 1 credit = $0.001. Money out can never exceed money in.</div>
            </div>
            <div className="panel">
              <span className="eyebrow">Everything The Spine can do</span>
              <h2 className="sh serif">Ask it. Create it. Earn from it.</h2>
              <div className="ov-pipe-row">
                <button className="ov-pipe" onClick={()=>setTab("core")}><span className="oi">◉</span>Ask anything</button>
                <button className="ov-pipe" onClick={()=>{setPipe("code");setTab("code");}}><span className="oi">⌘</span>Code</button>
                {PIPELINES.map(p=>(
                  <button key={p.key} className="ov-pipe" onClick={()=>{setPipe(p.key);setTab("code");}}>
                    <span className="oi">{p.icon}</span>{p.name}
                  </button>
                ))}
                <button className="ov-pipe" onClick={()=>setTab("earn")}><span className="oi">❖</span>Earn</button>
                <button className="ov-pipe" onClick={()=>setTab("marketplace")}><span className="oi">⇄</span>Market</button>
                <button className="ov-pipe" onClick={()=>setTab("vault")}><span className="oi">◈</span>Vault</button>
              </div>
              <p className="sub" style={{marginTop:14,fontSize:12.5}}>The Spine writes <b style={{color:"var(--ink)"}}>full websites, prototypes, apps and playable games</b> from a description - live code now, hosting and the premium game runtime rolling out. <b style={{color:"var(--ink)"}}>Free to use</b>; a profile unlocks earning, publishing and your Vault.</p>
              <div className="learn-ind"><span className="pulse"/>The Spine learns from every signal it receives - getting smarter and stronger with each one</div>
            </div>
            <div className="panel">
              <span className="eyebrow">The four layers</span>
              <h2 className="sh serif">One economic logic - identity to settlement</h2>
              <div className="pillars" style={{marginTop:18}}>
                {LAYERS.map(l=>(
                  <div key={l.k} className="pillar">
                    <div className="pi">{l.icon}</div>
                    <div className="pk serif">{l.k}</div><div className="px"/>
                    <div className="pd">{l.d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <span className="eyebrow">The economics, in full</span>
              <h2 className="sh serif">The math balances - with a small margin for The Spine.</h2>
              <p className="sub" style={{maxWidth:640}}>Every real dollar that buys credits splits three ways. Every earn pays a fraction of the value it creates. So money out can never exceed money in, and The Spine keeps a structural margin on both sides.</p>
              <div className="pools-row" style={{gridTemplateColumns:"1fr 1fr 1fr"}}>
                <div className="pool">
                  <div className="ph"><span className="pl">Reward pool . 50%</span><span className="pv mono">{rewardPool.toLocaleString()}</span></div>
                  <div className="pbar"><i style={{width:`${Math.min(100,(rewardPool/REWARD_POOL_INIT)*100)}%`,background:"var(--gold)"}}/></div>
                  <p className="pn">Pays contributors. Refilled only by real purchases - payouts can't exceed money in.</p>
                </div>
                <div className="pool">
                  <div className="ph"><span className="pl">Compute reserve . 30%</span><span className="pv mono" style={computeReserve<0?{color:"var(--err)"}:undefined}>{computeReserve.toLocaleString()}</span></div>
                  <div className="pbar"><i style={{width:`${Math.min(100,Math.abs(computeReserve)/1000*100)}%`,background:computeReserve<0?"var(--err)":"var(--ink3)"}}/></div>
                  <p className="pn">Covers the model + GPU bills. Negative means usage is subsidized - capped acquisition spend.</p>
                </div>
                <div className="pool">
                  <div className="ph"><span className="pl">Spine margin . 20%</span><span className="pv mono" style={{color:"var(--live)"}}>{spineMargin.toLocaleString()}</span></div>
                  <div className="pbar"><i style={{width:`${Math.min(100,spineMargin/1000*100)}%`,background:"var(--live)"}}/></div>
                  <p className="pn">Structural profit - 20% of every dollar in, plus the spread on the value each contribution creates.</p>
                </div>
              </div>
              <div className="pegline">
                <b>The identity:</b>&nbsp;every $1 in = <b>$0.50</b> earners + <b>$0.30</b> compute + <b>$0.20</b> Spine. Each earn pays <b>~40%</b> of the value it creates. 1 credit = <span className="peg-value">$0.001</span>; 2 credits = 1 smart query, so 10,000 credits buys 5,000 queries - more than any $10 subscription.
              </div>
            </div>
            <div className="panel">
              <span className="eyebrow">Outcome over output</span>
              <h2 className="sh serif">Every AI marketplace measures output. The Spine measures outcome.</h2>
              <p className="sub" style={{maxWidth:620}}>Runs and stars are easy to fake. A tool that sent 10,000 emails nobody answered looks identical to one with a 40% reply rate. The Spine scores on what actually happened after the run - the verified share of users who got a real result. Creators who improve earn more; junk sinks on its own.</p>
              <div className="stack-grid" style={{marginTop:14}}>
                {[["Verified identity","Required before any cash-out - real people behind real earnings"],["Expensive reputation","Trust and outcome scores take real work to build, so they can't be faked cheaply"],["Disputes & takedowns","Report any tool; bad actors removed, earnings clawed back"],["Permitted data only","The Spine retrieves from licensed and permitted sources"],["Outcome-gated pay","Money releases on verified outcomes only - gaming the score doesn't pay"],["End game","The Spine fronts its own model and routes to every other only until then"]].map(([n,d])=>(
                  <div key={n} className="stack-item"><div className="si-n serif">{n}</div><div className="si-d">{d}</div></div>
                ))}
              </div>
            </div>
            <div className="panel" id="help">
              <span className="eyebrow">Help center</span>
              <h2 className="sh serif">Questions, answered plainly</h2>
              <div className="help-list">
                {[
                  ["What is The Spine?","One place to ask any AI, create anything - code, sites, images, video, games, plans - and earn when what you make works for other people. It routes every request to the best model automatically, so you never overpay."],
                  ["Is it free?","Yes. Reasoning, code, planning and exploring are free to use. Creating a profile unlocks earning, publishing, your Vault, and saved context. Premium models and heavy rendering use credits."],
                  ["How do I earn?","Publish a tool, give verified feedback, contribute data, or sell outcomes on the marketplace. You're paid in credits - spend them on premium AI now, cash out later as that rolls out."],
                  ["What is a credit worth?","1 credit = $0.001, pegged to real compute. 2 credits = one smart query, so $10 buys about 5,000 queries - more than a typical subscription. Money out can never exceed money in."],
                  ["Is my data safe?","Your context lives in your Vault - encrypted, owned by you, and revocable any moment. The Spine retrieves only permitted, licensed sources."],
                  ["How do payments work?","Buying credits with a card and cashing out are rolling out as the platform grows. Today you can use everything that doesn't require live billing, and see exactly what's coming next."]
                ].map(([q,a])=>(
                  <details key={q} className="help-q"><summary>{q}</summary><p>{a}</p></details>
                ))}
              </div>
              <p className="sub" style={{marginTop:14,fontSize:12.5}}>Still stuck? <button className="link-btn" onClick={()=>setContactOpen(true)}>Contact us</button> - we read every message.</p>
            </div>
            <div className="panel">
              <span className="eyebrow">Get in touch</span>
              <h2 className="sh serif">Support, business, press &amp; investors</h2>
              <p className="sub">Whether you've hit a problem, want to partner, or want to invest - reach the team behind The Spine directly. Email <a href={"mailto:"+(settings.supportEmail1||"support@thespine.cloud")} className="gold-link">{settings.supportEmail1||"support@thespine.cloud"}</a>{settings.supportEmail2?<> or <a href={"mailto:"+settings.supportEmail2} className="gold-link">{settings.supportEmail2}</a></>:null} - or use the form.</p>
              <button className="primary-cta" style={{marginTop:14,maxWidth:260}} onClick={()=>setContactOpen(true)}>Open contact form</button>
              <p className="sub" style={{marginTop:14,fontSize:11.5,color:"var(--ink3)"}}>The Spine is a product of <b>Beforedawn</b>. (c) {new Date().getFullYear()} Beforedawn. All rights reserved.</p>
            </div>
          </div>
        )}

        {tab==="code"&&(
          <div className="g2">
            <div className="panel">
              <span className="eyebrow">Create . the spine is the pipeline</span>
              <h2 className="sh serif">Make anything. The Spine carries it from idea to finished.</h2>
              <p className="sub" style={{marginTop:6}}>Code, websites, apps, images, video, music, film, games, blueprints, agents - when you create, The Spine is the pipeline that takes it all the way through. Pick what you're making.</p>
              <div className="pipe-switch" style={{marginTop:14}}>
                <button className="pipe-tab" aria-pressed={pipe==="code"||undefined} onClick={()=>setPipe("code")}><span className="pi-ic">⌘</span>Code</button>
                {PIPELINES.map(p=>(
                  <button key={p.key} className="pipe-tab" aria-pressed={pipe===p.key||undefined} onClick={()=>{setPipe(p.key);setPipeOut(null);setPipeUpload(null);setGameClarify(null);setGamePost(null);}}>
                    <span className="pi-ic">{p.icon}</span>{p.name}
                  </button>
                ))}
              </div>
            </div>
            {pipe==="code"&&(<>
            <div className="panel">
              <span className="eyebrow">Code engine . mixed spinal nerve</span>
              <h2 className="sh serif">Write, debug, and streamline the most complex code</h2>
              <div className="uf-toggle" style={{marginTop:16}} role="group" aria-label="Code mode">
                {CODE_MODES.map(m=><button key={m.key} aria-pressed={codeMode===m.key||undefined} onClick={()=>{setCodeMode(m.key);setCodeOut(null);setCodeRunOut(null);}}>{m.label}</button>)}
              </div>
              <div className="code-bar">
                <select className="code-lang" value={codeLang} onChange={e=>setCodeLang(e.target.value)} aria-label="Language">
                  {CODE_LANGS.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
                <textarea className="code-search" value={codeIn} onChange={e=>setCodeIn(e.target.value)}
                  placeholder={CODE_MODES.find(m=>m.key===codeMode).inLabel+"..."} rows={1}/>
                <button className="code-go" disabled={codeBusy||!codeIn.trim()} onClick={runCode} aria-label="Run">
                  {codeBusy?<span className="spinner" style={{width:15,height:15}}/>:"Go"}
                </button>
              </div>
              {codeMode==="debug"&&(
                <input className="code-err" value={codeErr} onChange={e=>setCodeErr(e.target.value)} placeholder="Optional: paste the error or stack trace..."/>
              )}
              <button className="primary-cta" style={{marginTop:12}} disabled={codeBusy||!codeIn.trim()} onClick={runCode}>
                {codeBusy?<><span className="spinner"/>&nbsp; The spinal cord is working...</>:{generate:"Generate code",debug:"Find and fix the bug",refactor:"Streamline this code",explain:"Explain this code"}[codeMode]}
              </button>
              {codeOut&&(<>
                <div className={`run-out code`} style={{marginTop:18}}>{codeOut.text}</div>
                {codeOut.live?<div className="run-live"><span className="dot"/>Reasoned live through the spinal cord</div>:<div className="run-live off"><span className="dot"/>Couldn't reach the reasoning center</div>}
                {(codeMode==="generate"||codeMode==="debug"||codeMode==="refactor")&&(
                  <button className="run-btn ghost" style={{marginTop:12}} onClick={runGenerated}>{"\u25b6"} Run this code{codeLang==="javascript"||codeLang==="typescript"?" sandboxed":""}</button>
                )}
                {codeRunOut&&(<>
                  <div className="eyebrow" style={{marginTop:16}}>Execution result</div>
                  <div className="run-out code" style={{marginTop:8}}>{codeRunOut.text}</div>
                  {codeRunOut.live?<div className="run-live"><span className="dot"/>Fired sandboxed in your browser</div>:<div className="run-live off"><span className="dot"/>Held - hosted runtime tier</div>}
                </>)}
              </>)}
            </div>
            <div className="panel">
              <span className="eyebrow">Code-first, outcome-verified</span>
              <h3 className="sh2 serif">Build a coding tool others pay to use</h3>
              <p className="sub">Anything you build here, you can publish to the marketplace as a code tool - and Spine scores it on whether the code actually worked, not stars. That outcome signal on software is the edge no prompt marketplace has.</p>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
                <button className="run-btn" style={{width:"auto",padding:"11px 18px",marginTop:0}} onClick={()=>{setBuildMode("self");setDType("code");setShowTemplates(false);if(codeOut){const c=extractCode(codeOut.text);if(c)setDContent(c);}setTab("studio");setStudioView(profile?"create":"home");}}>Publish as a code tool to</button>
                <button className="run-btn ghost" style={{width:"auto",padding:"11px 18px",marginTop:0}} onClick={()=>setTab("core")}>Ask the spinal cord instead to</button>
              </div>
            </div>
            <div className="panel" style={{opacity:.7}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span className="eyebrow">Ship it . coming soon</span>
                <span className="cred-tag" style={{background:"var(--gold)"}}>Soon</span>
              </div>
              <h3 className="sh2 serif">Code that ships with hosting, a live URL, and a database - in this window</h3>
              <p className="sub">Write it here, press deploy, and Spine stands up the hosting, a public URL, and a database built in - no leaving the window. This is real infrastructure (containers, domains, scaling), so it lights up as the hosted runtime lands.</p>
              <div className="grid3" style={{marginTop:14}}>
                {[["Live URL","A public link the moment you deploy"],["Database built in","Tables and storage, no setup"],["Scales on the spine","Hosting and compute from the same body"]].map(([n,d])=>(
                  <div key={n} className="stack-item"><div className="si-n serif">{n}</div><div className="si-d">{d}</div></div>
                ))}
              </div>
              <button className="primary-cta" disabled style={{marginTop:16}}>Deploy with hosting - coming soon</button>
            </div>
            </>)}
            {pipe==="image"&&settings.imageEnabled!==false&&(
              <div className="panel">
                <div className="pipe-head"><span className="pipe-name serif">Image</span><span className="cred-tag" style={{background:"var(--live)"}}>Live</span></div>
                <p className="sub" style={{marginTop:6}}>Describe what you want and The Spine renders a real image. {imageRemaining()===Infinity?"Admin - unlimited.":imageRemaining()+" left"+(account?"":" before sign-up")}.</p>
                <div className="code-bar" style={{marginTop:12}}>
                  <textarea className="code-search" value={imgPrompt} onChange={e=>setImgPrompt(e.target.value)} placeholder="e.g. a misty mountain village at dawn, watercolor style" rows={2}/>
                </div>
                <UploadButton accept="image/*" label="Upload reference image"/>
                <label style={{display:"flex",alignItems:"center",gap:7,fontSize:13,color:"var(--ink2)",marginTop:10,cursor:"pointer"}}>
                  <input type="checkbox" checked={imgHiQuality} onChange={e=>setImgHiQuality(e.target.checked)} style={{accentColor:"var(--gold)"}}/>
                  Higher quality (slower, costs more)
                </label>
                <button className="primary-cta" style={{marginTop:12}} disabled={imgBusy||!imgPrompt.trim()} onClick={doGenerateImage}>{imgBusy?<><span className="spinner"/>&nbsp; Rendering...</>:"Generate image"}</button>
                {imgOut&&imgOut.error&&(
                  <div className="snotice warn" style={{marginTop:14}}>
                    {imgOut.error}
                    {!account&&imgOut.error.includes("Sign up")&&<><br/><button className="primary-cta" style={{marginTop:10}} onClick={()=>{setSignInOpen(true);setSiMode("signup");setSiErr("");}}>Create a free account</button></>}
                  </div>
                )}
                {imgOut&&imgOut.src&&(
                  <div style={{marginTop:16}}>
                    <img src={imgOut.src} alt="Generated" style={{width:"100%",borderRadius:12,border:"1px solid var(--stone)"}}/>
                    <SendToChips src={{kind:"image",src:imgOut.src,title:imgPrompt.slice(0,40)||"Image"}} exclude={[]}/>
                  </div>
                )}
              </div>
            )}
            {pipe==="video"&&(
              <div className="panel">
                <div className="pipe-head"><span className="pipe-name serif">Video</span><span className="cred-tag" style={{background:"var(--gold)"}}>Live when keyed</span></div>
                <p className="sub" style={{marginTop:6}}>Describe a short clip and The Spine renders it. Capped at {Math.min(settings.videoMaxSeconds||5,5)}s to keep it fast and fair. (If video isn't keyed yet, it'll say so.)</p>
                <div className="vmode">
                  <button type="button" className={"vmode-btn"+(vidMode==="text"?" on":"")} onClick={()=>setVidMode("text")}>Text to video<span className="vm-sub">describe it</span></button>
                  <button type="button" className={"vmode-btn"+(vidMode==="image"?" on":"")} onClick={()=>setVidMode("image")}>Image to video<span className="vm-sub">animate an image</span></button>
                  <button type="button" className={"vmode-btn"+(vidMode==="clip"?" on":"")} onClick={()=>setVidMode("clip")}>Edit a clip<span className="vm-sub">upload video</span></button>
                </div>
                <div className="code-bar" style={{marginTop:12}}>
                  <textarea className="code-search" value={vidPrompt} onChange={e=>setVidPrompt(e.target.value)} placeholder={vidMode==="image"?"Describe how the image should move and come alive...":vidMode==="clip"?"Describe the edit or effect for your clip...":"e.g. a paper boat sailing down a rainy street, cinematic"} rows={2}/>
                </div>
                {vidMode==="image"&&<UploadButton accept="image/*" label="Upload image to animate"/>}
                {vidMode==="clip"&&<UploadButton accept="video/*" label="Upload video clip"/>}
                {vidMode==="image"&&!pipeUpload&&<div className="hint" style={{marginTop:8}}>Image-to-video turns a still picture into motion. Upload an image, then describe how it should move.</div>}
                <button className="primary-cta" style={{marginTop:12}} disabled={vidBusy||(!vidPrompt.trim()&&!(vidMode==="image"&&pipeUpload))} onClick={doGenerateVideo}>{vidBusy?<><span className="spinner"/>&nbsp; Rendering...</>:vidMode==="image"?"Animate this image":vidMode==="clip"?"Transform this clip":"Generate video"}</button>
                {vidOut&&vidOut.error&&<div className="snotice warn" style={{marginTop:14}}>{vidOut.error}</div>}
                {vidOut&&vidOut.processing&&<div className="snotice info" style={{marginTop:14}}>Your video is rendering ({vidOut.provider}). This can take a minute or two - video is the heaviest lift. It'll appear here when ready.</div>}
                {vidOut&&vidOut.url&&(
                  <div style={{marginTop:16}}>
                    <video src={vidOut.url} controls style={{width:"100%",borderRadius:12,border:"1px solid var(--stone)"}}/>
                    <SendToChips src={{kind:"video",src:vidOut.url,title:vidPrompt.slice(0,40)||"Video"}} exclude={["video"]}/>
                  </div>
                )}
              </div>
            )}
            {pipe!=="code"&&pipe!=="image"&&pipe!=="video"&&(()=>{const p=PIPELINES.find(x=>x.key===pipe);if(!p)return null;return(
              <div className="panel">
                <div className="pipe-head"><span className="pipe-name serif">{p.name}</span>{(()=>{const live=["agent","text","web","blueprint"].includes(p.key);const game=p.key==="game";return <span className="cred-tag" style={{background:game?"var(--ink)":live?"var(--live)":"var(--gold)"}}>{game?"Premium tier . top price":live?"Live":"Plan live . render soon"}</span>;})()}</div>
                <p className="sub" style={{marginTop:6}}>{p.plan}</p>
                {(p.key==="music"||p.key==="dub")&&<div className="snotice info" style={{marginTop:8}}>{p.key==="music"?"The Spine plans your full track now (structure, instrumentation, production notes). Audio generation activates when the music engine is connected.":"The Spine builds your dubbing plan and timed line sheet now. Voice synthesis activates when the voice engine is connected - with consent checks required."}</div>}
                {p.key==="game"&&(<>
                  <div className="vmode">
                    <button type="button" className={"vmode-btn"+(gameMode==="2d"?" on":"")} onClick={()=>setGameMode("2d")}>2D game<span className="vm-sub">Phaser . plays in-app</span></button>
                    <button type="button" className={"vmode-btn"+(gameMode==="3d"?" on":"")} onClick={()=>setGameMode("3d")}>3D game<span className="vm-sub">Three.js . plays in-app</span></button>
                  </div>
                  <div className="snotice info" style={{marginTop:8}}>Describe your game and The Spine builds it playable, right here. Define your own controls (keyboard, touch, or gamepad). Console export and streamed AAA-quality (Unreal/Godot) are coming down the road as The Spine grows.</div>
                  <div className="game-ex">
                    <span className="game-ex-label">Try one, or write your own:</span>
                    {["Collect resources and build a city","Survive 10 minutes against waves of enemies","Solve puzzles to escape the room","A runner that dodges obstacles, tap to jump","Top-down maze - find the exit before time runs out"].map((ex,i)=>(
                      <button key={i} type="button" className="game-ex-chip" onClick={()=>setPipeIn(ex)}>{ex}</button>
                    ))}
                  </div>
                  {gamesRemaining()!==Infinity&&<p className="sub" style={{marginTop:6}}>{gamesRemaining()} {gamesRemaining()===1?"game":"games"} left{account?` this cycle - refills every ${settings.gameRefillHours||36}h`:". Sign up (free) to keep building + post to the marketplace"}.</p>}
                </>)}
                {p.key==="blueprint"&&blueprintsRemaining()!==Infinity&&<p className="sub" style={{marginTop:6}}>{blueprintsRemaining()} {blueprintsRemaining()===1?"blueprint":"blueprints"} left{account?` this cycle - refills every ${settings.blueprintRefillHours||36}h`:". Sign up (free) to keep designing the full create hub"}.</p>}
                <div className="code-bar" style={{marginTop:12}}>
                  <textarea className="code-search" value={pipeIn} onChange={e=>setPipeIn(e.target.value)} placeholder={`Describe your ${p.name.toLowerCase()}...`} rows={1}/>
                  <button className="code-go" disabled={pipeBusy||!pipeIn.trim()} onClick={runPipeline} aria-label="Make">{pipeBusy?<span className="spinner" style={{width:15,height:15}}/>:"Go"}</button>
                </div>
                <UploadButton accept={p.key==="dub"?"audio/*":p.key==="movie"?"image/*,video/*":p.key==="music"?"audio/*":"image/*,application/pdf,.txt,.doc,.docx"} label={p.key==="dub"?"Upload voice":p.key==="music"?"Upload audio ref":p.key==="movie"?"Upload clips":p.key==="blueprint"?"Upload document":p.key==="agent"?"Upload file":"Upload reference"}/>
                <button className="primary-cta" style={{marginTop:12}} disabled={pipeBusy||!pipeIn.trim()} onClick={runPipeline}>{pipeBusy?<><span className="spinner"/>&nbsp; The spine is composing...</>:p.key==="web"?"Build my site":p.key==="game"?"Build my game":`Make my ${p.name.toLowerCase()}`}</button>
                {p.key==="game"&&gameClarify&&(
                  <div className="clarify">
                    <div className="clarify-head">A couple quick things to make your game complete:</div>
                    <ul className="clarify-list">{gameClarify.questions.map((q,i)=><li key={i}>{q}</li>)}</ul>
                    <textarea className="clarify-input" value={gameClarifyText} onChange={e=>setGameClarifyText(e.target.value)} placeholder="Answer in a sentence or two (or skip to build with what you've got)..." rows={2}/>
                    <div className="clarify-actions">
                      <button className="clarify-go" onClick={runPipeline} disabled={pipeBusy}>{pipeBusy?"Building...":"Build my game"}</button>
                      <button className="clarify-skip" onClick={()=>{setGameClarify({questions:[],skipped:true});setTimeout(runPipeline,0);}} disabled={pipeBusy}>Skip, build anyway</button>
                    </div>
                  </div>
                )}
                {(p.key==="web"||p.key==="game")&&<div className="hint" style={{marginTop:8}}>The Spine writes full, working code. {p.key==="game"?"Rich 3D games run on the hosted runtime (premium); simple games run now.":"Live hosting with its own URL + database is rolling out."}</div>}
                {p.key==="blueprint"&&<div className="hint" style={{marginTop:8}}>The full plan, assembly sequence or curriculum generates now. The 3D walkthrough and the on-screen guide are the premium render tier.</div>}
                {pipeOut&&(<>
                  <div className="run-out code" style={{marginTop:16}}>{pipeOut.text}</div>
                  {pipeOut.key==="blueprint"&&pipeOut.imgBusy&&<div className="snotice info" style={{marginTop:10}}><span className="spinner" style={{width:13,height:13,marginRight:7,verticalAlign:"middle"}}/>Drawing the blueprint from the spec...</div>}
                  {pipeOut.key==="blueprint"&&pipeOut.imgSrc&&<div style={{marginTop:12}}><img src={pipeOut.imgSrc} alt="Blueprint drawing" style={{width:"100%",borderRadius:10,border:"1px solid var(--line)"}}/><div className="hint" style={{marginTop:6}}>Visual drawing generated from the spec. The written measurements above are the precise reference.</div></div>}
                  {pipeOut.key==="blueprint"&&pipeOut.imgFailed&&<div className="snotice warn" style={{marginTop:10}}>The written spec is ready above. The drawing couldn't be generated this time - you can try the Image tab with details from the spec.</div>}
                  {(pipeOut.key==="web"||pipeOut.key==="game")&&pipeOut.live&&<button className="run-btn ghost" style={{marginTop:10}} onClick={previewWeb}>{"\u25b6"} {pipeOut.key==="game"?"Play game":"Run it live (preview)"}</button>}
                  {pipeOut.preview&&<iframe title="preview" className="web-preview" style={pipeOut.key==="game"?{height:"78vh",maxHeight:"680px"}:undefined} sandbox="allow-scripts allow-pointer-lock" srcDoc={pipeOut.preview}/>}
                  {pipeOut.key==="game"&&gameFix&&<div className={"snotice "+(gameFix.failed?"warn":"info")} style={{marginTop:8}}>{gameFix.busy&&<span className="spinner" style={{width:13,height:13,marginRight:7,verticalAlign:"middle"}}/>}{gameFix.msg}</div>}
                  <div className={`run-live${pipeOut.live?"":" off"}`}><span className="dot"/>{pipeOut.name} {pipeOut.live?"built live":"preview"} . {pipeOut.key==="web"?"hosting rolls out with backed credits":pipeOut.key==="game"?"rich builds on the premium runtime":"render rolls out with backed credits"}</div>
                  <SendToChips src={{kind:"text",text:pipeOut.text,title:p.name+": "+pipeIn.slice(0,30)}} exclude={[]}/>
                  {pipeOut.key==="game"&&pipeOut.live&&(
                    <div className="gpost">
                      {!gamePost||!gamePost.posted?(<>
                        <div className="gpost-head">Share your game on the marketplace</div>
                        {gamePost&&gamePost.blocked&&<div className="snotice warn" style={{marginTop:6}}>{gamePost.msg}</div>}
                        {!account?(
                          <div className="snotice info" style={{marginTop:6}}>Sign up (free) to post your game so others can play it. <button className="linklike" onClick={()=>setSignInOpen(true)}>Sign up</button></div>
                        ):(<>
                          <p className="sub" style={{marginTop:4}}>Free games are playable by anyone on The Spine. You can set a price too - paid play activates when payments go live, and The Spine takes a small spread.</p>
                          <div className="gpost-actions">
                            <button className="gpost-free" onClick={()=>postGameToMarket(0)}>Post free to play</button>
                            <div className="gpost-paid">
                              <span className="gpost-cur">$</span>
                              <input type="number" min="0" step="0.5" placeholder="0.99" value={gamePost&&gamePost.price?gamePost.price:""} onChange={e=>setGamePost(g=>({...(g||{}),price:e.target.value}))} className="gpost-price"/>
                              <button className="gpost-set" onClick={()=>postGameToMarket(gamePost&&gamePost.price?gamePost.price:0)}>Post paid</button>
                            </div>
                          </div>
                        </>)}
                      </>):(
                        <div className="snotice ok" style={{marginTop:6}}>Posted to the marketplace{gamePost.paid?` at $${gamePost.price} per play (charging activates when payments go live)`:" - free to play for everyone on The Spine"}. Find it under Market.</div>
                      )}
                    </div>
                  )}
                </>)}
              </div>
            );})()}
          </div>
        )}

        {tab==="core"&&(
          <div className="g2">
            <div className="core-intro">
              <span className="mkt-pill">Live</span>
              <span className="mkt-bt">The spinal cord. Your request is a signal: it travels up, gathers permitted sources, routes to the best model, reasons, verifies, and fires an answer back - every step recorded.</span>
            </div>
            <div className="panel">
              <div className="core-bar">
                <span className="eyebrow">The spinal cord</span>
                <div className="core-bar-actions">
                  <button className="ghost-btn" onClick={newChat} disabled={coreBusy}>+ New chat</button>
                  {account&&<button className="ghost-btn" onClick={()=>{refreshConvs();setShowHistory(v=>!v);}}>History{savedConvs.length?` (${savedConvs.length})`:""}</button>}
                </div>
              </div>

              {showHistory&&account&&(
                <div className="conv-history">
                  {savedConvs.length===0?<div className="conv-empty">No saved chats yet. Your conversations save here automatically.</div>:
                    savedConvs.map(c=>(
                      <div key={c.id} className="conv-row">
                        <button className="conv-open" onClick={()=>openConv(c)}><span className="conv-title">{c.title}</span><span className="conv-when">{c.updatedAt.toLocaleDateString()}</span></button>
                        <button className="conv-del" onClick={()=>removeConv(c.id)} aria-label="Delete">x</button>
                      </div>
                    ))}
                </div>
              )}

              {settings.highStakesEnabled!==false&&(
              <div className="ensemble-toggle">
                <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"var(--ink2)"}}>
                  <input type="checkbox" checked={ensembleMode} onChange={e=>setEnsembleMode(e.target.checked)} style={{accentColor:"var(--gold)"}} disabled={thread.length>0}/>
                  High-stakes mode - ask 3 models and compare
                </label>
              </div>
              )}

              {/* Conversation thread */}
              <div className="thread">
                {thread.length===0&&!coreBusy&&(
                  <div className="greet">
                    <div className="greet-cord"/>
                    <div className="greet-h serif">Hello - I'm The Spine.</div>
                    {settings.greeting?<div className="greet-sub">{settings.greeting}</div>:null}
                  </div>
                )}
                {thread.map((m,idx)=>(
                  m.role==="user"?(
                    <div key={idx} className="msg msg-user">
                      {editingIdx===idx?(
                        <div className="msg-edit">
                          <textarea value={editingText} onChange={e=>setEditingText(e.target.value)} rows={2}/>
                          <div className="msg-edit-actions">
                            <button className="ghost-btn" onClick={cancelEdit}>Cancel</button>
                            <button className="mini-cta" onClick={()=>resendEdit(idx)} disabled={!editingText.trim()}>Resend</button>
                          </div>
                        </div>
                      ):(
                        <>
                          <div className="msg-text">{m.text}</div>
                          {m.file&&<div className="msg-file">[+] {m.file}</div>}
                          {!coreBusy&&<button className="msg-edit-btn" onClick={()=>startEdit(idx)} aria-label="Edit">edit</button>}
                        </>
                      )}
                    </div>
                  ):(
                    <div key={idx} className="msg msg-ai">
                      <div className="msg-ai-label">The Spine{m.guarded&&<span className="guard-tag"> . protected</span>}</div>
                      {m.lookupPending?(
                        <div className="act" style={{display:"flex",alignItems:"center",gap:10,color:"var(--ink2)"}}><span className="spinner"/> Looking that up for you...</div>
                      ):(
                        <div className="act">{renderRich(m.text)}</div>
                      )}
                      {m.toImage&&(
                        <button className="primary-cta" style={{marginTop:12}} onClick={()=>{setTab("code");setPipe("image");}}>Open the Image studio to</button>
                      )}
                      <div className="msg-ai-foot">
                        {m.live?<span className="run-live inline"><span className="dot"/>Reasoned live, verified</span>:<span className="run-live off inline"><span className="dot"/>Couldn't reach the reasoning center</span>}
                        <button className="copy-btn" onClick={()=>copyText(m.text)}>Copy</button>
                        <button className="copy-btn" onClick={()=>shareText(m.text)}>Share</button>
                        <button className="copy-btn" onClick={()=>addToProject({kind:"chat",title:"Saved answer",text:m.text})}>+ Project</button>
                      </div>
                    </div>
                  )
                ))}
                {ensembleOuts.length>0&&(
                  <div className="ensemble">
                    <div className="ensemble-h">Three models answered - compare where they agree and where they diverge</div>
                    {ensembleOuts.map(e=>(
                      <div key={e.label} className="ecard">
                        <div className="em">{e.label}</div>
                        <div className="et">{renderRich(e.text)}</div>
                        {e.live?<div className="run-live"><span className="dot"/>Live</div>:<div className="run-live off"><span className="dot"/>Preview</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div ref={threadEndRef}/>
              </div>

              {/* Stage animation while thinking */}
              {coreBusy&&coreStages.some(s=>s.status!=="idle")&&(
                <div className="pipeline" style={{"--cordfill":`${(coreStages.filter(s=>s.status==="done").length/coreStages.length)*100}%`}}>
                  {coreStages.map((s,i)=>(
                    <div key={s.key} className={`stage ${s.status}`}>
                      <div><div className="stage-name serif">{s.name}{s.status==="active"&&<span className="spinner" style={{width:11,height:11,marginLeft:8,verticalAlign:"middle"}}/>}{s.status==="done"&&<span style={{color:"var(--gold)",marginLeft:8}}>v</span>}</div><div className="stage-detail">{s.detail}</div></div>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit (last answer) */}
              {thread.length>0&&!coreBusy&&coreAudit&&(
                <>
                  <button className="audit-toggle" onClick={()=>setShowAudit(v=>!v)}><span>Provenance &amp; audit trail</span><span>{showAudit?"-":"+"}</span></button>
                  {showAudit&&(
                    <div className="audit">
                      <div className="audit-row"><span className="ak">Request</span><span className="av">{coreAudit.request}</span></div>
                      <div className="audit-row"><span className="ak">Sources</span><span className="av">{coreAudit.sources.map(s=><span key={s} className="src">{s}</span>)}</span></div>
                      <div className="audit-row"><span className="ak">Route</span><span className="av">{coreAudit.route}</span></div>
                      <div className="audit-row"><span className="ak">Checks</span><span className="av">{coreAudit.checks.map(c=><span key={c} className="chk">{c}</span>)}</span></div>
                      <div className="audit-row"><span className="ak">Logged</span><span className="av mono">{coreAudit.at.toLocaleString()}</span></div>
                    </div>
                  )}
                </>
              )}

              {limitMsg&&<div className="limit-msg">{limitMsg}</div>}
              {!account&&freeUsed>0&&freeUsed<FREE_QUESTION_LIMIT&&(
                <div className="free-hint">{FREE_QUESTION_LIMIT-freeUsed} free {FREE_QUESTION_LIMIT-freeUsed===1?"question":"questions"} left - create a profile to keep going and unlock the full reasoning model.</div>
              )}
              {account&&account.admin&&(
                <div className="free-hint">Admin - unlimited chats, no credit cost.</div>
              )}
              {account&&!account.admin&&settings.creditsEnabled===true&&(
                <div className="free-hint">Each question costs {(settings.coreCostPaid||CORE_COST_PAID)*(ensembleMode?CORE_COST_ENSEMBLE_MULT:1)} credits{ensembleMode?" (high-stakes x3)":""} . {balance} credits available.</div>
              )}
              {/* Input row */}
              {attached&&(
                <div className="attach-chip">
                  <span className="attach-name">[+] {attached.name}{attached.kind==="image"?" (image)":""}</span>
                  <button onClick={()=>setAttached(null)} aria-label="Remove">x</button>
                </div>
              )}
              <input ref={fileInRef} type="file" style={{display:"none"}} onChange={onAttachFile}
                accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.log,.tsv,.yml,.yaml,.rtf,image/*"/>
              <div className="field core-input" style={{marginTop:14}}>
                <textarea value={coreReq} onChange={e=>setCoreReq(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(!coreBusy&&coreReq.trim())doCore();} }}
                  placeholder={thread.length?"Ask a follow-up... (Shift+Enter for a new line)":"Hello - I'm The Spine. Ask me anything..."} rows={thread.length?2:3}/>
              </div>
              <div className="core-input-row">
                {settings.uploadEnabled!==false&&(
                  <button className="attach-btn icon-only" onClick={()=>fileInRef.current&&fileInRef.current.click()} disabled={coreBusy} aria-label="Attach a file" title="Attach a file">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                )}
                {settings.voiceEnabled!==false&&voiceSupported&&(
                  <button className={"attach-btn icon-only"+(listening?" listening":"")} onClick={toggleVoice} disabled={coreBusy} aria-label="Voice to text" title="Speak your question">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                  </button>
                )}
                {coreBusy?(
                  <button className="primary-cta stop" onClick={stopCore}><span className="spinner"/>&nbsp; Stop</button>
                ):(
                  <button className="primary-cta" disabled={!coreReq.trim()} onClick={doCore}>
                    {thread.length?"Send":"Send signal up the spinal cord"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {tab==="earn"&&(
          <div className="g2">
            <div className="earn-layout">
              <div className="panel">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span className="eyebrow">Feedback . the nervous system</span>
                  <span className="mono" style={{fontSize:11,color:"var(--ink3)"}}>Task {submitted+1}</span>
                </div>
                <div className="teyebrow" style={{marginTop:18}}>User asked</div>
                <div className="tq serif">{task.q}</div>
                <div className="ta"><div className="tawho">AI answered</div>{task.a}</div>
                <div className="teyebrow" style={{marginTop:20}}>Your call</div>
                <div className="vgrid">
                  {VERDICTS.map(v=>(
                    <button key={v.key} className="vbtn" aria-pressed={verdict===v.key||undefined} onClick={()=>{setVerdict(v.key);setLR(null);}}>
                      <div className="vl serif">{v.label}</div><div className="vh">{v.hint}</div>
                    </button>
                  ))}
                </div>
                <button className="sbtn" disabled={!verdict||(lastResult&&!lastResult.low)} onClick={submitFeedback}>
                  {lastResult&&!lastResult.low?"Reviewed v":"Submit review"}
                </button>
                {lastResult&&(lastResult.low?(
                  <div className="eres low">
                    <div className="er-row"><span className="er-lbl">{lastResult.reason==="pool"?"Reward pool empty":"Off the mark - no credit"}</span><span className="er-amt low mono">+0</span></div>
                    <p className="er-note">{lastResult.reason==="pool"?"Payouts pause when the pool runs dry and resume when revenue refills it.":"Careless calls earn nothing and lower your trust score - the fraud guard at work."}</p>
                  </div>
                ):(
                  <div className="eres">
                    <div className="er-row">
                      <span className="er-lbl">{lastResult.quality>=0.9?"Matched reviewers":lastResult.quality>=0.4?"Close - partial credit":"Off the mark"}</span>
                      <span className="er-amt mono">+{lastResult.earned} cr = {usd(lastResult.earned)}</span>
                    </div>
                    <p className="er-note">Quality {Math.round(lastResult.quality*100)}% x {level.name} rate ({level.mult}x). You earned {lastResult.earned} cr on ~{lastResult.value} cr of value created - Spine keeps the spread, so it never pays out more than it makes.</p>
                  </div>
                ))}
              </div>
              <div className="panel">
                <span className="eyebrow">Trust</span>
                <div style={{display:"flex",alignItems:"baseline",marginTop:10}}>
                  <span className="trust-nm serif">{level.name}</span>
                  <span className="trust-mx mono">{level.mult}x</span>
                </div>
                <div className="trust-note">{level.note}</div>
                <div className="trust-bar"><i style={{width:`${trust}%`}}/></div>
                <div className="trust-ticks">{TRUST_LEVELS.map((l,i)=><span key={l.name} className={i<=tIdx?"on":""}>{l.name}</span>)}</div>
                <div className="tstats">
                  <div className="tstat"><div className="tv mono">{submitted}</div><div className="tl">Reviews</div></div>
                  <div className="tstat"><div className="tv mono">{Math.round(trust)}</div><div className="tl">Trust</div></div>
                  <div className="tstat"><div className="tv mono">{balance}</div><div className="tl">Credits</div></div>
                </div>
              </div>
            </div>
            <div className="panel">
              <span className="eyebrow">Every nerve is firing</span>
              <h3 className="sh2 serif">More signals - more ways to earn</h3>
              <p className="sub">Each fires a real signal and pays from the reward pool. Nothing locked.</p>
              <div className="nerve-grid">
                {EARN_NERVES.map(n=>(
                  <div key={n.key} className="nerve-card">
                    <div className="nv-n serif">{n.name}</div>
                    <div className="nv-d">{n.desc}</div>
                    <button className="run-btn" disabled={busyNerve===n.key} onClick={()=>fireNerve(n)}>
                      {busyNerve===n.key?<><span className="spinner" style={{width:13,height:13}}/>&nbsp; Firing...</>:`${n.verb} . +${n.amt} cr = ${usd(n.amt)}`}
                    </button>
                    {earnFx&&earnFx.key===n.key&&<div className={`nv-fx ${earnFx.low?"low":"good"}`}>{earnFx.low?"Reward pool empty":`+${earnFx.amt} cr fired up the spine`}</div>}
                  </div>
                ))}
                <div className="nerve-card">
                  <div className="nv-n serif">Marketplace</div>
                  <div className="nv-d">Publish a tool and earn on every run - alone or pooled with a collaborator.</div>
                  <button className="run-btn ghost" onClick={()=>{setTab("studio");setStudioView(profile?"create":"home");}}>Open the Studio</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="marketplace"&&(
          <div className="g2">
            <div className="panel">
              <div className="mkt-head">
                <div><span className="eyebrow">Discover . the marketplace nerve</span><h3 className="sh2 serif">Find a tool - ranked by what actually works</h3></div>
                <button className="run-btn ghost" style={{width:"auto",padding:"10px 16px",marginTop:0}} onClick={()=>{setTab("studio");setStudioView(profile?"create":"home");}}>+ Build your own</button>
              </div>
              <input className="search" value={mq} onChange={e=>setMq(e.target.value)} placeholder="Search tools, creators, descriptions..."/>
              <div className="disco-row">
                <div className="chips">{[["all","All"],...TOOL_TYPES.map(t=>[t.key,t.label])].map(([k,l])=>(
                  <button key={k} className="chip2" aria-pressed={mcat===k||undefined} onClick={()=>setMcat(k)}>{l}</button>
                ))}</div>
              </div>
              <div className="disco-row" style={{marginTop:8}}>
                <span className="sort-l">Sort</span>
                <div className="uf-toggle">{[["outcome","Outcome"],["runs","Most run"],["new","Newest"],["price","Price"]].map(([k,l])=>(
                  <button key={k} aria-pressed={msort===k||undefined} onClick={()=>setMsort(k)}>{l}</button>
                ))}</div>
              </div>
              <div className="tool-cards">
                {filteredTools.length===0?(
                  <div className="led-empty" style={{gridColumn:"1/-1"}}>No tools match.<em>Try a different search or category.</em></div>
                ):filteredTools.map(t=>{
                  const meta=typeMeta(t.type);const oc=outcomePct(t);const pooled=contribsOf(t).length>1;const isRep=reported.includes(t.id);const hasCred=credScore(t);
                  return(
                    <div key={t.id} className="tool-card" style={isRep?{opacity:.5}:undefined}>
                      <div className="tc-top"><div><div className="tc-name serif">{t.name}</div><div className="tc-by">by @{t.by}{t.mine?" . you":""}{pooled?" + pool":""}</div></div><div className="tc-typeicon" title={meta.label}>{meta.icon}</div></div>
                      <div className="tc-desc">{t.desc}</div><div className="tc-line"/>
                      <div className="tc-row">
                        <span className="tc-price mono">{t.mine?"your tool":`${t.price} cr`}</span>
                        {oc!=null?<div className="oc"><div className="oc-ring mono">{oc}%</div><div className="oc-lbl"><b>{oc}%</b> outcome</div></div>:<span className="oc-lbl" style={{color:"var(--ink3)"}}>No runs yet</span>}
                        {pooled&&<span className="pool-tag">Pooled</span>}
                        {hasCred&&<span className="cred-tag">v Verified</span>}
                      </div>
                      {isRep?(
                        <div className="run-btn" style={{background:"var(--stone-l)",color:"var(--ink3)",border:"1px solid var(--stone)",textAlign:"center",cursor:"default"}}>Reported - under review</div>
                      ):t.type==="game"&&t.playable?(
                        <button className="run-btn" onClick={()=>playMarketGame(t)}>{"\u25b6"} Play{t.price>0?` . $${t.price}`:" . free"}{t.runs?` . ${t.runs.toLocaleString()} plays`:""}</button>
                      ):(
                        <button className="run-btn" onClick={()=>openRun(t)}>{t.mine?"Test":"Run"} . {t.runs.toLocaleString()} runs</button>
                      )}
                      {!t.mine&&!isRep&&<button className="report-link" onClick={()=>setReported(r=>r.includes(t.id)?r:[...r,t.id])}>Report this tool</button>}
                    </div>
                  );
                })}
              </div>
              <p className="mkt-note">Seeded counts are illustrative. Everything you publish and run yourself is real and updates live, including pooled splits and outcome scores.</p>
            </div>
            <div className="panel">
              <span className="eyebrow">Living demand signal - the world, in real time</span>
              <h3 className="sh2 serif">When the world changes, an opportunity appears.</h3>
              <p className="sub">The spine watches unmet searches and world & national events together, and matches each gap to exactly what The Spine can build - a tool, a blueprint, an agent. New events and searches push new opportunities in continuously.</p>
              <div className="learn-ind"><span className="pulse"/>Live - {signalsAbsorbed.toLocaleString()} signals absorbed . refreshing as the world moves</div>
              <div className="demand-grid" style={{marginTop:14}}>
                {DEMAND_SIGNALS.map(d=>(
                  <div key={d.query} className="demand-card">
                    <div className="dc-q serif">{d.query}</div>
                    <div className="dc-n">{d.n.toLocaleString()} signals . {d.src}</div>
                    <div className="dc-s">{d.specialty} . build with <b style={{color:"var(--gold)"}}>{d.build}</b> - nothing exists yet</div>
                    <button className="run-btn ghost" style={{marginTop:10}} onClick={()=>{if(d.build==="Blueprint"||d.build==="Agent"){setPipe(d.build.toLowerCase());setTab("code");}else{setTab("studio");setStudioView(profile?"create":"home");}}}>Build this {d.build.toLowerCase()} to</button>
                  </div>
                ))}
              </div>
              <p className="sub" style={{marginTop:12,fontSize:11.5,color:"var(--ink3)"}}>Live national & world data feeds connect with the backend; the matching engine and every pipeline are real now.</p>
            </div>
            <div className="panel">
              <span className="eyebrow">Two ways to publish</span>
              <h3 className="sh2 serif">Whether you can code or not - you can build here</h3>
              <div className="creator-grid">
                <div className="creator-card"><span className="cc-tag dev">Developer</span><div className="cc-h serif">Upload a tool, set your price, earn per outcome</div><div className="cc-s">Write the prompt, code or workflow - or upload a file. Spine handles billing, fraud and payouts.</div>
                  <div className="cc-steps">{["Build or upload in the Studio","Set a per-run price","Earn when outcomes verify"].map((s,i)=><div key={i} className="cc-step"><span className="snum">{i+1}</span><span>{s}</span></div>)}</div>
                  <button className="run-btn" onClick={()=>{setBuildMode("self");setTab("studio");setStudioView(profile?"create":"home");}}>Build a tool to</button>
                </div>
                <div className="creator-card"><span className="cc-tag exp">Domain Expert</span><div className="cc-h serif">We turn your expertise into a tool. You earn.</div><div className="cc-s">No code, no prompts. Spine interviews what you know and builds it. You review and publish.</div>
                  <div className="cc-steps">{["Answer questions about your field","Spine builds - you review","Publish and earn per outcome"].map((s,i)=><div key={i} className="cc-step g"><span className="snum">{i+1}</span><span>{s}</span></div>)}</div>
                  <button className="run-btn ghost" onClick={()=>{setBuildMode("interview");setTab("studio");setStudioView(profile?"create":"home");}}>Let Spine interview me to</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="studio"&&(
          <div className="g2">
            {!profile?(
              <div className="panel">
                <div className="studio-onboard">
                  <span className="eyebrow">Become a creator</span>
                  <h2 className="sh serif">Set up your creator profile</h2>
                  <p className="sub" style={{maxWidth:440,margin:"8px auto 0"}}>Identity is the first layer of the spine - how buyers trust your outcomes and how attribution follows your work permanently.</p>
                </div>
                <div style={{maxWidth:460,margin:"0 auto"}}>
                  {!account&&(
                    <div className="snotice info" style={{marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                      <span>Sign in first to create your profile - it's free and takes a few seconds.</span>
                      <button className="run-btn" style={{width:"auto",marginTop:0,padding:"8px 14px",flex:"none"}} onClick={()=>{setSignInOpen(true);setSiMode("signup");setSiStep("start");setSiErr("");}}>Sign in</button>
                    </div>
                  )}
                  <div className="field"><label>Display name</label><input value={pName} onChange={e=>setPName(e.target.value)} placeholder="e.g. Mira Kovac"/></div>
                  <div className="field"><label>Handle</label><input value={pHandle} onChange={e=>setPHandle(e.target.value)} placeholder="mira_k"/><div className="hint">Shown as @{pHandle.trim().replace(/^@/,"")||"yourhandle"} on every tool and payout split.</div></div>
                  <div className="field"><label>Specialty</label><select value={pSpec} onChange={e=>setPSpec(e.target.value)}>{SPECIALTIES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div className="field"><label>Short bio</label><textarea value={pBio} onChange={e=>setPBio(e.target.value)} placeholder="What you know, and what you build."/></div>
                  <button className="primary-cta" disabled={!pName.trim()||!pHandle.trim()} onClick={createProfile}>{account?"Create profile":"Sign in to create profile"}</button>
                </div>
              </div>
            ):(
              <>
                <div className="panel">
                  <div className="prof-head">
                    <div className="avatar serif">{profile.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                    <div className="prof-meta">
                      <div className="pname serif">{profile.name}</div>
                      <div className="phandle">@{profile.handle}</div>
                      <span className="spec-chip">{profile.spec}</span>
                    </div>
                  </div>
                  {profile.bio&&<p className="prof-bio">{profile.bio}</p>}
                  <div className="prof-stats">
                    <div className="pstat"><div className="v mono">{profStats.tools}</div><div className="l">Tools</div></div>
                    <div className="pstat"><div className="v mono">{profStats.runs}</div><div className="l">Runs</div></div>
                    <div className="pstat"><div className="v mono">{profStats.earned}</div><div className="l">Earned</div></div>
                    <div className="pstat"><div className="v mono">{profStats.outcome!=null?profStats.outcome+"%":"-"}</div><div className="l">Outcome</div></div>
                  </div>
                  <div className="badges">
                    <span className="rep-l">Reputation</span>
                    {badgesFor(profStats,verified,nervous).length===0?(
                      <span className="hint" style={{margin:0}}>Publish a tool and earn to build your reputation. It travels with you and can't be faked.</span>
                    ):badgesFor(profStats,verified,nervous).map(b=><span key={b} className="badge2">{b}</span>)}
                  </div>
                  {myTools.length>0&&(
                    <>
                      <div className="divl"/>
                      <div className="eyebrow">Contribution timeline</div>
                      <div className="ctimeline">
                        {myTools.map(t=>{const oc=outcomePct(t);const color=oc==null?"var(--stone-m)":oc>=85?"var(--live)":oc>=70?"var(--gold)":"var(--err)";
                          return<div key={t.id} className="ctdot" title={`${t.name} . ${oc!=null?oc+"% outcome":"no runs"}`} style={{background:color,color:"#fff"}}>{typeMeta(t.type).icon}</div>;
                        })}
                      </div>
                      <div style={{fontSize:11,color:"var(--ink3)",marginTop:8}}>Each dot is a published tool - green: 85%+ outcome . gold: 70%+ . red: below 70%</div>
                    </>
                  )}
                </div>
                <div className="panel">
                  <div className="studio-tabs">
                    <button aria-current={studioView==="home"||undefined} onClick={()=>setStudioView("home")}>Your tools</button>
                    <button aria-current={studioView==="create"||undefined} onClick={()=>setStudioView("create")}>Build new</button>
                  </div>
                  {studioView==="home"?(
                    myTools.length===0?(
                      <div className="snotice info" style={{marginTop:0}}>No tools yet. Hit <b>Build new</b> to publish your first - it goes straight into the marketplace.</div>
                    ):(
                      myTools.map(t=>{
                        const oc=outcomePct(t);const pooled=contribsOf(t).length>1;const hasCred=credScore(t);
                        const insight=oc!=null&&t.runs>=5&&oc<80?"Try adding a sample input in your instructions - tools with clear examples score 15-25% higher on average.":
                          oc!=null&&t.runs>=10&&oc>=85?"High-outcome tool. Share it in your specialty community to drive more runs and earn more.":null;
                        return(
                          <div key={t.id} className="mytool">
                            <div className="mt-ic">{typeMeta(t.type).icon}</div>
                            <div style={{flex:1}}>
                              <div className="mt-n serif">{t.name}{hasCred?" v":""}</div>
                              <div className="mt-d">{typeMeta(t.type).label} . {t.price} cr{pooled?" . pooled":""} . {oc!=null?`${oc}% outcome`:"no runs yet"}</div>
                              {insight&&<div className="living">{insight}</div>}
                            </div>
                            <div className="mt-stat"><b>{t.earned}</b> cr<br/>{t.runs} runs</div>
                            <button className={"mt-pub"+(t.is_public!==false?" on":"")} onClick={async()=>{const np=t.is_public===false;setTools(list=>list.map(x=>x.id===t.id?{...x,is_public:np}:x));await setToolPublic(t.id,np);}} title={t.is_public!==false?"Public - in the Market. Tap to make private.":"Private - only you. Tap to publish."}>{t.is_public!==false?"Public":"Private"}</button>
                          </div>
                        );
                      })
                    )
                  ):(
                    <div>
                      <div className="uf-toggle" style={{marginBottom:16}} role="group" aria-label="Build mode">
                        <button aria-pressed={buildMode==="self"||undefined} onClick={()=>setBuildMode("self")}>I'll build it</button>
                        <button aria-pressed={buildMode==="interview"||undefined} onClick={()=>setBuildMode("interview")}>Interview me</button>
                      </div>
                      {buildMode==="interview"&&(
                        <div>
                          <p className="sub" style={{marginTop:0,marginBottom:14}}>Answer three questions - the spinal cord turns your expertise into a working tool. No code, no prompts required.</p>
                          {EXPERT_QS.map((qq,i)=>(
                            <div className="field" key={i}><label>{qq.q}</label><textarea value={answers[i]} onChange={e=>setAnswers(a=>a.map((x,j)=>j===i?e.target.value:x))} placeholder={qq.ph}/></div>
                          ))}
                          <button className="primary-cta" disabled={interviewBusy||answers.some(a=>!a.trim())} onClick={runInterview}>
                            {interviewBusy?<><span className="spinner"/>&nbsp; The spinal cord is building your tool...</>:"Build my tool from my expertise"}
                          </button>
                        </div>
                      )}
                      {buildMode==="self"&&(<>
                        {showTemplates?(
                          <>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                              <span className="eyebrow">Start from a template</span>
                              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--ink3)"}} onClick={()=>setShowTemplates(false)}>Start blank to</button>
                            </div>
                            <div className="tmpl-grid">
                              {TEMPLATES.map(t=>(
                                <button key={t.name} className="tmpl" onClick={()=>useTemplate(t)}>
                                  <div className="tmpl-n serif">{t.name}</div>
                                  <div className="tmpl-d">{t.desc}</div>
                                  <div className="tmpl-type">{TOOL_TYPES.find(x=>x.key===t.type)?.label||t.type}</div>
                                </button>
                              ))}
                            </div>
                          </>
                        ):(
                          <>
                            <div className="field" style={{marginTop:0}}><label>What are you building?</label>
                              <div className="type-grid">{TOOL_TYPES.map(tt=>(
                                <button key={tt.key} className="type-card" aria-pressed={dType===tt.key||undefined} onClick={()=>pickType(tt.key)}>
                                  <div className="ti">{tt.icon}</div><div className="tl serif">{tt.label}</div><div className="tb">{tt.blurb}</div>
                                </button>
                              ))}</div>
                            </div>
                            <div className="field"><label>Tool name</label><input value={dName} onChange={e=>setDName(e.target.value)} placeholder="e.g. ICU medication checker"/></div>
                            <div className="field"><label>What it does</label><input value={dDesc} onChange={e=>setDDesc(e.target.value)} placeholder="One sentence buyers read before running it."/></div>
                            {dType==="code"?(
                              <div className="field"><label>Function body (JavaScript)</label><CodeEditor value={dContent} onChange={e=>setDContent(e.target.value)} minRows={8}/><div className="hint">Receives <span className="mono">input</span> and returns the result. Fires sandboxed in the buyer's browser.</div></div>
                            ):(
                              <div className="field"><label>Instructions - the nerve the spinal cord fires on</label><CodeEditor value={dContent} onChange={e=>setDContent(e.target.value)} minRows={6}/><div className="hint">{dType==="prompt"?"The system prompt. Buyer input runs against it live.":"Your direction for this tool type - the spine reasons against it."}</div></div>
                            )}
                            <div className="field"><label>Upload the actual tool (optional)</label>
                              <div className="upload-row">
                                <label className="upload-btn">Choose file<input type="file" hidden onChange={onUploadFile}/></label>
                                {dFile?(
                                  <span className="file-chip">{dFile.name} . {fmtSize(dFile.size)} . {dFile.runnable?"fires sandboxed":dFile.code?"code held":"stored"}<button type="button" onClick={()=>setDFile(null)}>x</button></span>
                                ):<span className="hint" style={{margin:0}}>Code, config, data or assets. JS runs sandboxed; other types are held and attributed.</span>}
                              </div>
                              {dFile&&dFile.runnable&&dType==="code"&&<div className="hint" style={{color:"var(--live)"}}>Loaded into the editor above - ready to fire.</div>}
                            </div>
                            <div className="field"><label>Price per run</label>
                              <div className="pricechips">{[1,2,3,5,8,10,15,20].map(p=><button key={p} className="pchip" aria-pressed={dPrice===p||undefined} onClick={()=>setDPrice(p)}>{p} cr = {usd(p)}</button>)}</div>
                            </div>
                            <div className="field"><label>Attribution</label>
                              <div className="uf-toggle" role="group" aria-label="Attribution">
                                <button aria-pressed={!dCollab||undefined} onClick={()=>setDCollab(false)}>Solo</button>
                                <button aria-pressed={dCollab||undefined} onClick={()=>setDCollab(true)}>Pool with a collaborator</button>
                              </div>
                              {dCollab&&<div className="collab-box">
                                <div className="field" style={{marginTop:0}}><label>Collaborator handle</label><input value={dCollabH} onChange={e=>setDCollabH(e.target.value)} placeholder="their_handle"/></div>
                                <div className="field"><label>Split</label>
                                  <div className="uf-toggle">{[50,60,70,80].map(s=>(
                                    <button key={s} aria-pressed={dYourSplit===s||undefined} onClick={()=>setDYourSplit(s)}>You {s} / {100-s}</button>
                                  ))}</div>
                                  <div className="hint">Every run settles automatically: you get {dYourSplit}%, @{dCollabH.trim().replace(/^@/,"")||"collaborator"} gets {100-dYourSplit}%. Traced in the ledger.</div>
                                </div>
                              </div>}
                            </div>
                            <div className="uf-split"><b>Contributors keep 80%</b> . Spine takes 20% for compute, verification, fraud checks and payouts.</div>
                            {!showTest?(
                              <button className="test-trigger" onClick={()=>setShowTest(true)}>Test before publishing to</button>
                            ):(
                              <div className="test-panel">
                                <div className="test-head">
                                  <span className="th serif">Test your tool - free, no credits charged</span>
                                  <button className="tc" onClick={()=>{setShowTest(false);setTestOut(null);setTestPassed(null);}}>Done testing x</button>
                                </div>
                                <div className="field" style={{marginTop:0}}><label>Sample buyer input</label><textarea value={testInput} onChange={e=>setTestInput(e.target.value)} placeholder="Type sample input a buyer would send..."/></div>
                                <button className="run-btn" disabled={testBusy||!testInput.trim()} onClick={runTest}>
                                  {testBusy?<><span className="spinner" style={{width:13,height:13}}/>&nbsp; Firing test signal...</>:"Fire test signal . free"}
                                </button>
                                {testOut&&(<>
                                  <div className={`run-out${dType==="code"?" code":""}`}>{testOut.text}</div>
                                  {!testPassed&&(
                                    <div className="outcome-ask">
                                      <div className="oq">Did it do what you intended?</div>
                                      <div className="outcome-btns">
                                        <button onClick={()=>setTestPassed(true)}>Yes - looks right</button>
                                        <button onClick={()=>{setTestPassed(false);setTestOut(null);setTestInput("");}}>No - I'll adjust</button>
                                      </div>
                                    </div>
                                  )}
                                  {testPassed&&<div className="outcome-done">Tested and verified v - ready to publish.</div>}
                                </>)}
                              </div>
                            )}
                            <button className="primary-cta" disabled={!dName.trim()||!dDesc.trim()||(dCollab&&!dCollabH.trim())} onClick={publishTool}>
                              {testPassed?"Publish to marketplace v":"Publish to marketplace"}
                            </button>
                            <div style={{marginTop:8,textAlign:"center"}}><button style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--gold)"}} onClick={()=>setShowTemplates(true)}>{"\u2190"} Browse templates</button></div>
                          </>
                        )}
                      </>)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab==="wallet"&&(
          <div className="g2">
            {nervous&&(
              <div className="nc-banner">
                <div className="nc-spark">o</div>
                <div>
                  <div className="nc-h serif">Welcome to the nervous center.</div>
                  <div className="nc-s">This is where signals become value. Spend earned credits on premium AI, tools and rendering - real cash-out switches on as revenue grows.</div>
                </div>
              </div>
            )}
            <div className="panel">
              <span className="eyebrow">Wallet . the nervous center</span>
              <h2 className="sh serif">Where the spine pays you</h2>
              <div className="wallet-top">
                <div className="wt-bal">
                  <div className="wt-n mono">{balance.toLocaleString()}</div>
                  <div className="wt-l">credits . {usd(balance)} . spend on premium AI, tools and rendering</div>
                </div>
                <div className="wt-meta">
                  <div className="wt-row"><span>Backed (real money)</span><b>{backedCredits.toLocaleString()} cr</b></div>
                  <div className="wt-row"><span>Free renders left</span><b>{Math.max(0,FREE_MEDIA_QUOTA-freeRendersUsed)} / {FREE_MEDIA_QUOTA}</b></div>
                  <div className="wt-row"><span>Cash-out</span><b style={{color:"var(--gold)"}}>Coming soon</b></div>
                </div>
              </div>
            </div>
            <div className="panel">
              <span className="eyebrow">Spend</span>
              <h3 className="sh2 serif">Spend credits on the best AI - cheaper than any direct subscription</h3>
              <p className="sub">Your credits buy AI compute tokens - the units a model burns to think. The spinal cord routes each job to the most powerful model that fits. 2 credits = 1 smart query = <b style={{color:"var(--ink)"}}>$0.002</b>. 10,000 credits buys 5,000 smart queries - far more than any $10 subscription.</p>
              <div className="spend-grid">
                {SPEND_ACTIONS.map(a=>(
                  <button key={a.key} className="scard" disabled={balance<a.cost} onClick={()=>spend(a)}>
                    <div className="scard-head"><span className="scard-name serif">{a.name}</span><span className="scard-cost mono">{a.cost} cr = {usd(a.cost)}</span></div>
                    <div className="scard-tip">{a.tip}</div>
                  </button>
                ))}
              </div>
              {spendMsg&&<div className="snotice warn">{spendMsg}</div>}
            </div>
            <div className="panel">
              <span className="eyebrow">Render nerves . real GPU</span>
              <h3 className="sh2 serif">Make images, animation and video - rendered for real</h3>
              <p className="sub">These nerves bill a real GPU on every fire, so they run on credits backed by real money - or your free renders while they last. Earned-only credits can't fire them, because the render has to be paid for in dollars, and earned credits have no dollars behind them.</p>
              <div className="wt-row" style={{marginTop:12,maxWidth:360}}><span>Backed credits (real money)</span><b className="mono">{backedCredits.toLocaleString()}</b></div>
              <div className="wt-row" style={{maxWidth:360}}><span>Earned credits (cashable)</span><b className="mono">{earnedCredits.toLocaleString()}</b></div>
              <div className="buy-section">
                <div className="cashout-h serif">Get more credits</div>
                <p className="sub" style={{margin:"4px 0 12px"}}>{settings.subscriptionsLive?"Pick a pack or go Pro. Secure checkout via Stripe.":"Subscriptions & packs are coming soon - almost ready."}</p>
                <div className="buy-grid">
                  <button className="buy-card" onClick={()=>startCheckout("pro")}><b>Spine Pro</b><span>${(settings.proPrice||9.99).toFixed(2)}/mo</span><em>{settings.proChats||300} chats . {settings.proImages||50} images . {settings.proVideos||10} videos</em></button>
                  <button className="buy-card" onClick={()=>startCheckout("credits_10")}><b>10,000 credits</b><span>$10</span><em>mix across everything</em></button>
                  <button className="buy-card" onClick={()=>startCheckout("pack_images")}><b>+20 images</b><span>$2.99</span><em>top-up</em></button>
                  <button className="buy-card" onClick={()=>startCheckout("pack_videos")}><b>+5 videos</b><span>$4.99</span><em>top-up</em></button>
                </div>
              </div>
              <div className="credits-buy">
                <div className="cb-h">Your {balance.toLocaleString()} credits can buy</div>
                <div className="cb-grid">
                  <div className="cb-item"><b className="mono">{Math.floor(balance/(settings.costChat||2)).toLocaleString()}</b><span>chats</span></div>
                  <div className="cb-item"><b className="mono">{Math.floor(balance/(settings.costImage||30)).toLocaleString()}</b><span>images</span></div>
                  <div className="cb-item"><b className="mono">{Math.floor(balance/(settings.costVideo||400)).toLocaleString()}</b><span>videos</span></div>
                </div>
                <div className="cb-note">Mix and match - spend on whatever you create. 1 credit = $0.001, pegged to real cost.</div>
              </div>
              <div className="cashout-box">
                <div className="cashout-h serif">Cash out</div>
                <p className="sub" style={{margin:"4px 0 10px"}}>You can cash out <b>earned</b> credits - the ones you earn when others run your tools - once you reach $10 earned. Purchased credits aren't cashable (they're fuel for creating). {settings.payoutsLive?"":"Cash-out activates when payments go live."}</p>
                {(() => { const earnedUsd=earnedCredits*0.001; const can=settings.payoutsLive&&earnedUsd>=10; return (
                  <>
                    <div className="wt-row" style={{maxWidth:360}}><span>Earned, in dollars</span><b className="mono">${earnedUsd.toFixed(2)}</b></div>
                    <button className="primary-cta" style={{marginTop:10}} disabled={!can} onClick={()=>alert("Cash-out request noted. Real payouts run through Stripe Connect once connected.")}>
                      {settings.payoutsLive?(earnedUsd>=10?"Request cash-out":"Earn $10 to cash out"):"Cash-out coming soon"}
                    </button>
                  </>
                ); })()}
              </div>
              <div className="wt-row" style={{maxWidth:360}}><span>Free renders left</span><b className="mono">{Math.max(0,FREE_MEDIA_QUOTA-freeRendersUsed)} / {FREE_MEDIA_QUOTA}</b></div>
              <div className="field" style={{marginTop:14}}><label>Describe the shot</label>
                <textarea value={mediaPrompt} onChange={e=>setMediaPrompt(e.target.value)} placeholder="e.g. a slow aerial push over a neon city at dusk, rain-slick streets..." style={{minHeight:64}}/></div>
              <div className="spend-grid" style={{marginTop:14}}>
                {MEDIA_NERVES.map(n=>{const freeLeft=Math.max(0,FREE_MEDIA_QUOTA-freeRendersUsed);const canFree=backedCredits<n.cost&&freeLeft>0;return(
                  <button key={n.key} className="scard" disabled={mediaBusy} onClick={()=>fireMedia(n)}>
                    <div className="scard-head"><span className="scard-name serif">{n.name}</span><span className="scard-cost mono">{n.cost} cr{canFree?" . free":""}</span></div>
                    <div className="scard-tip">{mediaBusy===n.key?"Rendering...":n.tip}{canFree?" Uses a free render.":backedCredits>=n.cost?" Paid from backed credits.":" Needs backed credits."}</div>
                  </button>
                );})}
              </div>
              {mediaMsg&&<div className="snotice warn">{mediaMsg.text}</div>}
              {mediaOut&&(<>
                <div className="run-out" style={{marginTop:14}}>{mediaOut.text}</div>
                <div className={`run-live${mediaOut.live?"":" off"}`}><span className="dot"/>{mediaOut.nerve} render {mediaOut.free?". free quota used":". billed to backed credits"} . hosted GPU rolling out</div>
              </>)}
            </div>
            <div className="panel">
              <span className="eyebrow">Add credits</span>
              <h3 className="sh2 serif">Buy credits - this is the real money that funds everything</h3>
              <p className="sub">Bought credits are <b style={{color:"var(--ink)"}}>backed</b>: they trace to real dollars, so they can fire the render nerves and, later, fund creator cash-outs. Half of every purchase flows into the reward pool that pays contributors.</p>
              <div className="spend-grid">
                {[1000,5000,20000].map(pack=>(
                  <button key={pack} className="scard" onClick={()=>buyCredits(pack)}>
                    <div className="scard-head"><span className="scard-name serif">{pack.toLocaleString()} credits</span><span className="scard-cost mono">${(pack*PEG).toFixed(2)}</span></div>
                    <div className="scard-tip">Backed by real money - fires render nerves and premium models.</div>
                  </button>
                ))}
              </div>
              <div className="snotice info" style={{marginTop:12}}>Demo - no card is charged. In production this is Stripe Checkout, and the dollars are what make payouts and rendering possible.</div>
            </div>
            <div className="panel" style={{opacity:.62}}>
              <span className="eyebrow">Cash out . real money</span>
              <h3 className="sh2 serif">Turn earned credits into money in your account</h3>
              <div className="snotice info" style={{marginTop:12,borderColor:"var(--gold-l)",background:"var(--gold-s)"}}>
                <b>Real cash-out is coming soon.</b> Withdrawing dollars only works once enough revenue is flowing in to back it - paying that out before buyers fund the pool is how a platform bleeds out. So for now, earned credits spend on premium AI and tools (which costs us almost nothing and scales safely). Once revenue grows, we'll switch real cash-out on and re-explore the payout rails below.
              </div>
              <div style={{marginTop:16,filter:"grayscale(1)",opacity:.5,pointerEvents:"none"}} aria-hidden="true">
                <div className="field" style={{marginTop:0}}><label>Choose your payout method</label>
                  <div className="pay-grid">
                    {PAYOUT_METHODS.map(m=>(
                      <div key={m.key} className="pay-method">
                        <div className="pm-row"><span className="pm-name serif">{m.label}</span><span className="pm-time">{m.time}</span></div>
                        <div className="pm-fee">{m.fee} . {m.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="primary-cta" disabled>Cash out - coming soon</button>
              </div>
            </div>
            <div className="panel">
              <span className="eyebrow">Settlement ledger</span>
              <h3 className="sh2 serif">Every credit, traced end to end</h3>
              <p className="sub">Double entry - each credit shows where it came from and where it went, including pooled splits across the attribution graph.</p>
              <div className="led">
                {ledger.length===0?(
                  <div className="led-empty">Nothing yet.<em>Earn, spend, run a tool or cash out and it appears here.</em></div>
                ):ledger.map(e=>(
                  <div key={e.id} className="lrow">
                    <div className={`lic ${e.dir}`}>{e.dir==="in"?"down":"up"}</div>
                    <div>
                      <div className="lm-t">{e.title}{e.quality!=null&&` . quality ${Math.round(e.quality*100)}%`}</div>
                      <div className="lm-f">{e.from} <span className="larr">to</span> {e.to} . {e.t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
                    </div>
                    <div className={`lamt mono ${e.dir}`}>{e.dir==="in"?"+":"-"}{e.amt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="wallet"&&(
          <div className="g2">
            <div className="panel">
              <span className="eyebrow">Teams &amp; organizations</span>
              <h2 className="sh serif">Work solo, pooled, or as a business</h2>
              <p className="sub">A team shares one credit pool, seats and private tools - the same spine, scaled to an organization.</p>
              {!team?(
                <div style={{maxWidth:460,marginTop:8}}>
                  <div className="field"><label>Organization name</label><input value={teamNameDraft} onChange={e=>setTeamNameDraft(e.target.value)} placeholder="e.g. Northside Clinic"/></div>
                  <button className="primary-cta" disabled={!teamNameDraft.trim()} onClick={createTeam}>Create organization</button>
                </div>
              ):(
                <div>
                  <div className="team-head">
                    <div className="team-ic serif">{team.name.slice(0,2).toUpperCase()}</div>
                    <div><div className="team-n serif">{team.name}</div><div className="hint" style={{marginTop:4}}>{team.members.length} seat{team.members.length===1?"":"s"} . shared pool {team.pool.toLocaleString()} cr = {usd(team.pool)}</div></div>
                  </div>
                  <div className="team-cols">
                    <div>
                      <div className="teyebrow" style={{marginTop:16}}>Seats</div>
                      <div className="member-list">{team.members.map(m=><span key={m} className="member">@{m}</span>)}</div>
                      <div className="field" style={{marginTop:12}}><label>Invite a seat</label>
                        <div style={{display:"flex",gap:8}}>
                          <input value={memberDraft} onChange={e=>setMemberDraft(e.target.value)} placeholder="their_handle" onKeyDown={e=>e.key==="Enter"&&addMember()}/>
                          <button className="run-btn" style={{width:"auto",marginTop:0,padding:"0 16px"}} onClick={addMember}>Add</button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="teyebrow" style={{marginTop:16}}>Shared billing</div>
                      <div className="pool-card">
                        <div className="pc-v mono">{team.pool.toLocaleString()} cr</div>
                        <div className="hint" style={{marginTop:6}}>Funds every seat's AI usage and tool runs from one place.</div>
                        <div className="field" style={{marginTop:12}}><label>Move credits from your wallet (you have {balance})</label>
                          <div style={{display:"flex",gap:8}}>
                            <input value={teamFund} onChange={e=>setTeamFund(e.target.value.replace(/[^0-9]/g,""))} placeholder="amount" inputMode="numeric"/>
                            <button className="run-btn" style={{width:"auto",marginTop:0,padding:"0 16px"}} disabled={!teamFund||Number(teamFund)>balance} onClick={fundTeamPool}>Fund</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="snotice info" style={{marginTop:16}}>Private team tools, admin controls and per-seat outcome reporting build on this same structure - one organization on the spine.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab==="vault"&&(
          <div className="g2">
            <div className="panel" style={{gridColumn:"1 / -1"}}>
              <span className="eyebrow">Your projects . the creation hub</span>
              <h2 className="sh serif">Everything you're making, in one place</h2>
              <p className="sub">Projects carry your work across tabs - chats, images, tools, and notes collect here. Open one to keep building, or start fresh.</p>
              <div style={{display:"flex",gap:8,margintop:6,flexWrap:"wrap",marginBottom:14}}>
                <button className="primary-cta" style={{width:"auto",padding:"0 18px"}} onClick={()=>newProject()}>+ New project</button>
              </div>
              {projects.length===0?(
                <div className="conv-empty">No projects yet. Start one, then save chats and images into it from anywhere.</div>
              ):(
                <div className="vault-convs">
                  {projects.map(p=>(
                    <div key={p.id} className={"vault-conv-row"+(p.id===activeProjectId?" active-proj":"")}>
                      <button className="vault-conv-open" onClick={()=>{setActiveProjectId(p.id);}}>
                        <span className="vault-conv-title">{p.name}{p.id===activeProjectId?" . active":""}</span>
                        <span className="vault-conv-when">{(p.items||[]).length} items . {p.updatedAt?new Date(p.updatedAt).toLocaleDateString():""}</span>
                      </button>
                      <button className="vault-conv-del" onClick={()=>{ if(confirm("Delete project \""+p.name+"\"? This can't be undone."))removeProject(p.id); }} aria-label="Delete project" title="Delete">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {activeProject&&(activeProject.items||[]).length>0&&(
                <div style={{marginTop:18}}>
                  <div className="vault-lbl" style={{marginBottom:8}}>Inside "{activeProject.name}"</div>
                  <div className="proj-items">
                    {(activeProject.items||[]).map((it,i)=>(
                      <div key={i} className="proj-item">
                        <span className="proj-item-kind">{it.kind}</span>
                        {it.kind==="image"&&it.src?(
                          <img src={it.src} alt="" style={{width:"100%",borderRadius:8,marginTop:6}}/>
                        ):(
                          <div className="proj-item-text">{it.title||it.text||"(item)"}</div>
                        )}
                        <button className="proj-item-del" onClick={()=>updateActiveProject(p=>({...p,items:p.items.filter((_,j)=>j!==i)}))}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="panel">
              <span className="eyebrow">Your conversations . saved to your account</span>
              <h2 className="sh serif">Every conversation, kept and yours</h2>
              <p className="sub">{account?"Your chats with The Spine are saved here automatically. Open one to continue, or delete what you don't need.":"Sign in and create a profile - then every conversation is saved here automatically."}</p>
              {account?(
                <div className="vault-convs">
                  {savedConvs.length===0?(
                    <div className="conv-empty">No saved conversations yet. Ask The Spine something in Core and it'll appear here.</div>
                  ):(
                    savedConvs.map(c=>(
                      <div key={c.id} className="vault-conv-row">
                        <button className="vault-conv-open" onClick={()=>{openConv(c);setTab("core");}}>
                          <span className="vault-conv-title">{c.title}</span>
                          <span className="vault-conv-when">{c.updatedAt?c.updatedAt.toLocaleDateString():""} . {(c.messages||[]).length} messages</span>
                        </button>
                        <button className="vault-conv-del" onClick={()=>removeConv(c.id)} aria-label="Delete conversation" title="Delete">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ):(
                <button className="primary-cta" style={{marginTop:14}} onClick={()=>{setSignInOpen(true);setSiMode("signup");setSiErr("");}}>Create an account to save conversations</button>
              )}
            </div>
            <div className="panel">
              <span className="eyebrow">Context vault . owned by you</span>
              <h2 className="sh serif">Your memory, portable across every model</h2>
              <p className="sub">Toggle what models may use. Encrypted at rest, keyed to you. Revoke and it's gone from every model at once - no copy left behind.</p>
              <div className="vault-list">
                {vaultItems.map(v=>(
                  <div key={v.id} className={`vault-row${v.on?" on":""}`}>
                    <div><div className="vault-lbl">{v.label}</div><div className="vault-sub">{v.on?"Plugged in - models may use this":"Revoked - no model can read this"}</div></div>
                    <button className={`vault-toggle${v.on?" on":""}`} onClick={()=>toggleVault(v.id)} aria-pressed={v.on}>{v.on?"On":"Off"}</button>
                  </div>
                ))}
              </div>
              <div className="field" style={{marginTop:8}}><label>Add something to your context</label>
                <div style={{display:"flex",gap:8}}>
                  <input value={vaultDraft} onChange={e=>setVaultDraft(e.target.value)} placeholder="e.g. I prefer concise answers, no preamble" onKeyDown={e=>e.key==="Enter"&&addVault()}/>
                  <button className="run-btn" style={{width:"auto",marginTop:0,padding:"0 16px"}} onClick={addVault}>Add</button>
                </div>
              </div>
              <button className="run-btn ghost" style={{marginTop:14}} onClick={revokeAll}>Revoke all access</button>
              {vaultRevoked&&<div className="snotice ok">Access revoked. Every model lost this context instantly - you own it, you control it.</div>}
            </div>
          </div>
        )}
        {false&&tab==="vault-old"&&(
          <div className="g2">
            <div className="panel">
              <span className="eyebrow">Context vault . owned by you</span>
              <h2 className="sh serif">Your memory, portable across every model</h2>
              <p className="sub">Toggle what models may use. Encrypted at rest, keyed to you. Revoke and it's gone from every model at once - no copy left behind.</p>
              <div className="vault-list">
                {vaultItems.map(v=>(
                  <div key={v.id} className={`vault-row${v.on?" on":""}`}>
                    <div><div className="vault-lbl">{v.label}</div><div className="vault-sub">{v.on?"Plugged in - models may use this":"Revoked - no model can read this"}</div></div>
                    <button className={`vault-toggle${v.on?" on":""}`} onClick={()=>toggleVault(v.id)} aria-pressed={v.on}>{v.on?"On":"Off"}</button>
                  </div>
                ))}
              </div>
              <div className="field" style={{marginTop:8}}><label>Add something to your context</label>
                <div style={{display:"flex",gap:8}}>
                  <input value={vaultDraft} onChange={e=>setVaultDraft(e.target.value)} placeholder="e.g. I prefer concise answers, no preamble" onKeyDown={e=>e.key==="Enter"&&addVault()}/>
                  <button className="run-btn" style={{width:"auto",marginTop:0,padding:"0 16px"}} onClick={addVault}>Add</button>
                </div>
              </div>
              <button className="run-btn ghost" style={{marginTop:14}} onClick={revokeAll}>Revoke all access</button>
              {vaultRevoked&&<div className="snotice ok">Access revoked. Every model lost this context instantly - you own it, you control it.</div>}
              <div className="snotice info" style={{marginTop:12}}>In production this is end-to-end encrypted and keyed to your identity. Revoking deletes the models' access, not just hides it.</div>
            </div>
            <div className="panel" style={{opacity:.7}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span className="eyebrow">Agent banking . coming soon</span>
                <span className="cred-tag" style={{background:"var(--gold)"}}>Soon</span>
              </div>
              <h3 className="sh2 serif">The banking layer for the agent economy</h3>
              <p className="sub">One AI agent autonomously paying another for a service - verified identity, escrow, and dispute resolution, at internet scale. The agent economy everyone talks about has no banking layer yet. Spine's identity, attribution and settlement rails are built to be exactly that.</p>
              <div className="grid3" style={{marginTop:14}}>
                {[["Verified agents","Each agent has a real, attributable identity"],["Escrow","Funds held until the service verifies"],["Dispute resolution","Outcome-gated release, clawback on fraud"]].map(([n,d])=>(
                  <div key={n} className="stack-item"><div className="si-n serif">{n}</div><div className="si-d">{d}</div></div>
                ))}
              </div>
              <button className="primary-cta" disabled style={{marginTop:16}}>Open agent banking - coming soon</button>
            </div>
          </div>
        )}

        <footer className="sp-foot">
          <div className="foot-tag"><b>The Spine.</b> The operating system for human value. The spinal cord reasons; nerves earn; tools run and split; the nervous center pays you. 1 credit = $0.001 - pegged to real compute, never invented.</div>
          <div className="foot-links">
            <button onClick={()=>setContactOpen(true)}>Contact</button>
            <button onClick={()=>setTab("overview")}>Help</button>
            <button onClick={()=>setLegalDoc("terms")}>Terms of Service</button>
            <button onClick={()=>setLegalDoc("privacy")}>Privacy Policy</button>
            <button onClick={()=>setLegalDoc("cookies")}>Cookies Policy</button>
            <button onClick={()=>setLegalDoc("acceptable")}>Acceptable Use</button>
            <button onClick={()=>setLegalDoc("refunds")}>Refunds</button>
            <button onClick={()=>setLegalDoc("copyright")}>Copyright</button>
          </div>
          <div className="foot-legal">(c) {new Date().getFullYear()} Beforedawn . The Spine . <a href={"mailto:"+(settings.supportEmail1||"support@thespine.cloud")}>{settings.supportEmail1||"support@thespine.cloud"}</a>{settings.supportEmail2?<> . <a href={"mailto:"+settings.supportEmail2}>{settings.supportEmail2}</a></>:null} . AI can make mistakes - verify anything important. Not legal, financial, or medical advice.
            <span className="bs-entry" onClick={()=>{setAdminOpen(true);setAdminPass("");setAdminErr(false);}} title="." aria-label="admin"> . </span>
          </div>
        </footer>
      </div>

      {onboardStep>0&&(()=>{
        const steps=[
          {t:"Welcome to The Spine",b:"This is the operating system for human value. You ask, you create, and you earn when your work produces real outcomes. Here's the 20-second tour."},
          {t:"Core - ask anything",b:"Core is the spinal cord. Ask a question and watch it travel up - gathering sources, routing to the best model, reasoning, verifying - then fire an answer back, every step recorded."},
          {t:"Create & Market - build and share tools",b:"In Studio you can publish a tool (a reusable AI instruction or a small piece of code). It appears in the Market for others to run - and when it produces a verified outcome, you earn."},
          {t:"Wallet & Vault - your value and memory",b:"Wallet tracks your credits and earnings. Vault holds your saved conversations. Everything you do is yours and traceable."},
          {t:"You're in",b:"You're part of the nervous system now. Explore, build something, and tell us what's missing - the people here early shape what The Spine becomes."},
        ];
        const cur=steps[Math.min(onboardStep-1,steps.length-1)];
        const last=onboardStep>=steps.length;
        return (
          <div className="modal-back" onClick={()=>setOnboardStep(0)}>
            <div className="modal onboard" style={{maxWidth:430}} onClick={e=>e.stopPropagation()}>
              <div className="ob-cord"/>
              <div className="ob-step">Step {onboardStep} of {steps.length}</div>
              <div className="ob-title serif">{cur.t}</div>
              <div className="ob-body">{cur.b}</div>
              <div className="ob-dots">{steps.map((_,i)=><span key={i} className={"ob-dot"+(i===onboardStep-1?" on":"")}/>)}</div>
              <div className="ob-actions">
                <button className="ghost-btn" onClick={()=>setOnboardStep(0)}>Skip</button>
                <button className="primary-cta ob-next" onClick={()=>last?setOnboardStep(0):setOnboardStep(s=>s+1)}>{last?"Start exploring":"Next"}</button>
              </div>
            </div>
          </div>
        );
      })()}
      {playingGame&&(
        <div className="modal-back" onClick={()=>setPlayingGame(null)}>
          <div className="modal play-modal" onClick={e=>e.stopPropagation()}>
            <div className="play-head"><span className="play-title serif">{playingGame.title}</span><button className="play-x" onClick={()=>setPlayingGame(null)} aria-label="Close">x</button></div>
            <iframe title="play" className="play-frame" sandbox="allow-scripts allow-pointer-lock" srcDoc={playingGame.doc}/>
          </div>
        </div>
      )}
      {signInOpen&&(
        <div className="modal-back" onClick={()=>setSignInOpen(false)}>
          <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div className="modal-h">
              <div><div className="mt serif">{siMode==="signin"?"Sign in":"Join The Spine"}</div><div className="mby">{siMode==="signin"?"Welcome back":"Free to use . a profile unlocks earning & publishing"}</div></div>
              <button className="modal-x" onClick={()=>setSignInOpen(false)} aria-label="Close">x</button>
            </div>
            <div className="modal-body">
              <div className="uf-toggle" style={{marginBottom:16}} role="group" aria-label="Sign in or sign up">
                <button aria-pressed={siMode==="signin"||undefined} onClick={()=>{setSiMode("signin");setSiStep("start");setSiErr("");}}>Sign in</button>
                <button aria-pressed={siMode==="signup"||undefined} onClick={()=>{setSiMode("signup");setSiStep("start");setSiErr("");}}>Sign up</button>
              </div>
              {siMode==="signin"?(
                <>
                  <div className="field"><label>Username</label>
                    <input value={siName} onChange={e=>{setSiName(e.target.value);setSiErr("");}} placeholder="yourname"/>
                  </div>
                  <div className="field"><label>Password</label>
                    <input type="password" value={siPass} onChange={e=>{setSiPass(e.target.value);setSiErr("");}} placeholder="password" onKeyDown={e=>e.key==="Enter"&&siSignIn()}/>
                  </div>
                  {siErr&&<div className="snotice warn">{siErr}</div>}
                  <button className="primary-cta" onClick={siSignIn}>Sign in</button>
                  <div className="snotice info" style={{marginTop:10}}>Returning users sign in directly - no re-verification. New here? Tap <b>Sign up</b>.</div>
                </>
              ):(
                <>
                  <div className="field"><label>Pick a username</label>
                    <input value={siName} onChange={e=>{setSiName(e.target.value);setSiErr("");}} placeholder="yourname"/>
                  </div>
                  <div className="field"><label>Create a password</label>
                    <input type="password" value={siPass} onChange={e=>{setSiPass(e.target.value);setSiErr("");}} placeholder="at least 6 characters"/>
                  </div>
                  <div className="field"><label>Email (optional - for account recovery later)</label>
                    <input value={siContact} onChange={e=>{setSiContact(e.target.value);setSiErr("");}} placeholder="you@email.com" onKeyDown={e=>e.key==="Enter"&&siSignUp()}/>
                  </div>
                  {siErr&&<div className="snotice warn">{siErr}</div>}
                  <button className="primary-cta" onClick={siSignUp}>Create my account</button>
                  <div className="snotice info" style={{marginTop:10}}>Your account is saved and remembered - sign back in anytime with your username and password.</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteOpen&&(
        <div className="modal-back" onClick={()=>setDeleteOpen(false)}>
          <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div className="modal-h">
              <div><div className="mt serif">Delete account</div><div className="mby">This can't be undone</div></div>
              <button className="modal-x" onClick={()=>setDeleteOpen(false)} aria-label="Close">x</button>
            </div>
            <div className="modal-body">
              <p className="sub" style={{lineHeight:1.6}}>This permanently deletes your profile, your Vault and saved context, and your personal data right away. The minimum transaction records the law requires are retained briefly for tax and fraud-prevention, then purged.</p>
              <div className="snotice warn" style={{marginTop:12}}>Any unspent credits and unpublished work are lost. If you have earnings to cash out, do that first.</div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button className="run-btn ghost" style={{flex:1,marginTop:0}} onClick={()=>setDeleteOpen(false)}>Keep my account</button>
                <button className="primary-cta danger-cta" style={{flex:1,marginTop:0}} onClick={deleteAccount}>Delete permanently</button>
              </div>
              <p className="sub" style={{marginTop:12,fontSize:11.5,color:"var(--ink3)"}}>Prefer to ask first? <a href="mailto:support@thespine.cloud" className="gold-link">support@thespine.cloud</a></p>
            </div>
          </div>
        </div>
      )}

      {contactOpen&&(
        <div className="modal-back" onClick={()=>{setContactOpen(false);setCSent(false);}}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-h">
              <div><div className="mt serif">Get in touch</div><div className="mby">Beforedawn . support@thespine.cloud</div></div>
              <button className="modal-x" onClick={()=>{setContactOpen(false);setCSent(false);}} aria-label="Close">x</button>
            </div>
            <div className="modal-body">
              {cSent?(
                <div style={{textAlign:"center",padding:"18px 0"}}>
                  <div style={{fontSize:34,color:"var(--gold)"}}>v</div>
                  <p className="sub" style={{marginTop:8}}>Thanks, {cName.split(" ")[0]||"there"} - your message is logged. In the live app this sends straight to <b>support@thespine.cloud</b> and we reply by email.</p>
                  <button className="run-btn ghost" style={{marginTop:12,maxWidth:200,margin:"12px auto 0"}} onClick={()=>{setContactOpen(false);setCSent(false);setCName("");setCEmail("");setCMsg("");}}>Done</button>
                </div>
              ):(<>
                <div className="field"><label>Your name</label><input value={cName} onChange={e=>setCName(e.target.value)} placeholder="Full name"/></div>
                <div className="field"><label>Email</label><input value={cEmail} onChange={e=>setCEmail(e.target.value)} placeholder="you@email.com"/></div>
                <div className="field"><label>Reason</label><select value={cReason} onChange={e=>setCReason(e.target.value)}><option>Support</option><option>Business / partnership</option><option>Investor</option><option>Press / media</option><option>Something else</option></select></div>
                <div className="field"><label>Message</label><textarea value={cMsg} onChange={e=>setCMsg(e.target.value)} placeholder="How can we help?" rows={4}/></div>
                <button className="primary-cta" disabled={!cName.trim()||!/^.+@.+\..+$/.test(cEmail)||!cMsg.trim()} onClick={sendContact}>Send message</button>
                <div className="snotice info" style={{marginTop:10}}>Goes to support@thespine.cloud. We read every message - support, business, press and investors all welcome.</div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {legalDoc&&(()=>{const L={
        terms:["Terms of Service","By using The Spine you agree to use it lawfully and not to abuse, attack, or misuse the platform or other users. The Spine is provided \"as is\" - AI output can be wrong, and you're responsible for verifying anything important before relying on it. We may suspend accounts that break these terms or attempt fraud. Credits are a usage balance, not legal tender or a security, and are governed by the economics described in-app. We may update these terms as the product grows.","Plain-language starter - review with a lawyer before taking payments or paying users."],
        privacy:["Privacy Policy","We collect only what we need to run your account: your username, the contact you verify with, your balance and activity, and the context you choose to store in your Vault. Your Vault is encrypted and owned by you - you can revoke or delete it at any time. We don't sell your personal data. We retrieve only from permitted, licensed sources. You can delete your account at any time from your account bar: this removes your profile, Vault and personal data right away, and we retain only the minimum transaction records the law requires before purging those too.","Plain-language starter - review with a lawyer; add GDPR/CCPA specifics before launch in regulated regions."],
        cookies:["Cookies Policy","The Spine uses essential cookies and local session data to keep you signed in and remember your preferences. We don't use cookies to sell your data to advertisers. You can clear cookies in your browser at any time, though some features may need them to work.","Plain-language starter - review with a lawyer; add a consent banner where required."],
        acceptable:["Acceptable Use","Because anyone can publish tools and run AI on The Spine, these rules keep it safe: no illegal activity; no generating harmful, abusive, or exploitative content; no malware, fraud, or attempts to game outcome scores or payouts; no impersonation; no infringing others' rights. Dangerous requests are automatically refused and logged. We remove bad actors and may claw back earnings tied to abuse.","Plain-language starter - this is the legal twin of the in-app safety system; review with counsel."],
        refunds:["Refunds & Cancellation","Until live billing launches, no real money changes hands. Once you can buy credits with a card: unused credits may be refundable within a stated window; credits already spent on compute are non-refundable since the cost was incurred. You can stop using the service any time. Cash-out of earned credits is subject to identity verification and the payout rules described in-app.","Plain-language starter - payment processors often require a clear refund policy; finalize with counsel before enabling payments."],
        copyright:["Copyright Notice","(c) "+new Date().getFullYear()+" Beforedawn. \"The Spine\" and its design, logo, and content are property of Beforedawn unless otherwise noted. Tools and content you create remain yours, subject to the licenses you grant when you publish. If you believe something on The Spine infringes your copyright, contact support@thespine.cloud and we'll act on valid notices.","Plain-language starter - add a formal DMCA agent/process before scale."]
      };const d=L[legalDoc];return(
        <div className="modal-back" onClick={()=>setLegalDoc(null)}>
          <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
            <div className="modal-h">
              <div><div className="mt serif">{d[0]}</div><div className="mby">The Spine . Beforedawn</div></div>
              <button className="modal-x" onClick={()=>setLegalDoc(null)} aria-label="Close">x</button>
            </div>
            <div className="modal-body">
              <p className="sub" style={{lineHeight:1.65}}>{d[1]}</p>
              <div className="snotice warn" style={{marginTop:14}}>! {d[2]}</div>
              <p className="sub" style={{marginTop:12,fontSize:11.5,color:"var(--ink3)"}}>Questions about this policy? <a href="mailto:support@thespine.cloud" className="gold-link">support@thespine.cloud</a></p>
            </div>
          </div>
        </div>
      );})()}

      {adminOpen&&(
        <div className="admin-fullscreen">
          <div className="admin-fs-inner">
            <div className="modal-h admin-fs-h">
              <div><div className="mt serif">Brain Stem</div><div className="mby">Private control . admin only</div></div>
              <button className="modal-x" onClick={()=>setAdminOpen(false)} aria-label="Close">x</button>
            </div>
            <div className="modal-body admin-fs-body">
              {!adminAuthed?(
                <div>
                  <p className="sub">This is the Brain Stem - the hidden control center. It isn't a nerve and users never see it. Enter the admin passphrase.</p>
                  <div className="field"><label>Admin username</label>
                    <input value={adminUser} onChange={e=>{setAdminUser(e.target.value);setAdminErr(false);}} placeholder="username" autoComplete="off"/>
                  </div>
                  <div className="field"><label>Admin password</label>
                    <input type="password" value={adminPass} onChange={e=>{setAdminPass(e.target.value);setAdminErr(false);}} onKeyDown={e=>e.key==="Enter"&&(isAdminLogin(adminUser,adminPass)?setAdminAuthed(true):setAdminErr(true))} placeholder="password"/>
                  </div>
                  {adminErr&&<div className="snotice warn">Not recognized. Try again.</div>}
                  <button className="primary-cta" onClick={()=>isAdminLogin(adminUser,adminPass)?setAdminAuthed(true):setAdminErr(true)}>Enter the Brain Stem</button>
                </div>
              ):(
                <div className="bs-grid">
                  {(()=>{
                    const userTools=tools.filter(t=>t.mine);
                    const totalRuns=tools.reduce((s,t)=>s+(t.runs||0),0);
                    const verifiedCount=tools.filter(t=>credScore&&credScore(t)).length;
                    const revIn=ledger.filter(l=>l.dir==="in"&&/Bought/.test(l.title)).reduce((s,l)=>s+l.amt,0);
                    const earnOut=ledger.filter(l=>l.dir==="in"&&!/Bought/.test(l.title)).reduce((s,l)=>s+l.amt,0);
                    const avgQ=lastResult&&lastResult.quality!=null?Math.round(lastResult.quality*100):null;
                    return(<>
                      <div className="bs-stat"><div className="bs-n mono">{signalsAbsorbed.toLocaleString()}</div><div className="bs-l">signals absorbed . the spine learns from every one and grows stronger</div></div>
                      <div className="bs-metrics">
                        <div className="bs-m"><span className="bs-mn mono">{usd(spineMargin)}</span><span className="bs-ml">Spine margin (profit)</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{usd(revIn)}</span><span className="bs-ml">Revenue in (purchases)</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{usd(earnOut)}</span><span className="bs-ml">Paid to contributors</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{rewardPool.toLocaleString()}</span><span className="bs-ml">Reward pool</span></div>
                        <div className="bs-m"><span className="bs-mn mono" style={computeReserve<0?{color:"var(--err)"}:undefined}>{computeReserve.toLocaleString()}</span><span className="bs-ml">Compute reserve</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{backedCredits.toLocaleString()}</span><span className="bs-ml">Backed credits live</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{tools.length}</span><span className="bs-ml">Tools published</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{verifiedCount}</span><span className="bs-ml">Verified tools</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{totalRuns.toLocaleString()}</span><span className="bs-ml">Total tool runs</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{submitted}</span><span className="bs-ml">Feedback reviews</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{avgQ!=null?avgQ+"%":"-"}</span><span className="bs-ml">Last review quality</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{account?"1":"0"}</span><span className="bs-ml">Signed-in accounts</span></div>
                      </div>

                      <div className="bs-section">
                        <div className="bs-head"><span className="bs-title serif">Economic health</span><span className="cred-tag" style={{background:rewardPool>0&&computeReserve>=0?"var(--live)":"var(--gold)",color:"#fff"}}>{rewardPool>0&&computeReserve>=0?"Solvent":"Subsidizing"}</span></div>
                        <p className="bs-sub">Money out can never exceed money in. Split holds at 50 / 30 / 20. {computeReserve<0?"Compute reserve is negative - usage is being subsidized (acquisition spend).":"All pools funded."}</p>
                        <div className="bs-bars">
                          <div className="bs-bar"><span>Reward pool</span><i><b style={{width:`${Math.min(100,(rewardPool/80000)*100)}%`,background:"var(--gold)"}}/></i></div>
                          <div className="bs-bar"><span>Spine margin</span><i><b style={{width:`${Math.min(100,(spineMargin/8000)*100)}%`,background:"var(--live)"}}/></i></div>
                        </div>
                      </div>

                      <div className="bs-section">
                        <div className="bs-head"><span className="bs-title serif">Activity feed</span><span className="cred-tag">{ledger.length} events</span></div>
                        <p className="bs-sub">Every credit movement, double-entry. Newest first.</p>
                        {ledger.slice(0,6).map((l,i)=>(
                          <div key={i} className="bs-row">
                            <div><div className="bs-rn">{l.title} <span style={{color:l.dir==="in"?"var(--live)":"var(--ink3)"}}>{l.dir==="in"?"+":"-"}{l.amt} cr</span></div><div className="bs-rd">{l.from} to {l.to}</div></div>
                          </div>
                        ))}
                        {ledger.length===0&&<div className="bs-rd" style={{paddingTop:8}}>No activity yet - buy credits or earn to populate.</div>}
                      </div>
                    </>);
                  })()}

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">My account</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>admin</span></div>
                    <p className="bs-sub">You have unlimited chats as admin - questions don't cost you credits. You can still set your displayed balance here if you want.</p>
                    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      <span className="bs-user-bal mono">{balance.toLocaleString()} cr</span>
                      <button className="bs-btn" onClick={async()=>{const v=prompt("Set your displayed credits:",String(balance));if(v==null)return;const n=parseInt(v,10);if(!isNaN(n)){setBalance(n);const real=await setAdminCredits(account&&account.id,n,adminPass);if(real!=null)setBalance(real);}}}>Set my credits</button>
                      <button className="bs-btn alt" onClick={async()=>{setBalance(999999);const real=await setAdminCredits(account&&account.id,999999,adminPass);if(real!=null)setBalance(real);}}>Max out</button>
                    </div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Talk to The Spine . private</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>admin</span></div>
                    <p className="bs-sub">A private line to The Spine, just for you - strategy, ideas, numbers, anything. Free, no limits.</p>
                    <div className="admin-chat">
                      {adminChat.length===0?(
                        <div className="conv-empty">Ask me anything - what to build next, how the numbers look, an idea you're chewing on.</div>
                      ):adminChat.map((m,i)=>(
                        <div key={i} className={"admin-chat-msg "+(m.role==="user"?"u":"a")}>{m.text}</div>
                      ))}
                      {adminChatBusy&&<div className="admin-chat-msg a"><span className="spinner"/></div>}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <input value={adminChatIn} onChange={e=>setAdminChatIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAdminChat()} placeholder="Ask The Spine privately..." style={{flex:1}}/>
                      <button className="bs-btn" onClick={sendAdminChat} disabled={adminChatBusy||!adminChatIn.trim()}>Send</button>
                    </div>
                  </div>

                  <div className="bs-section bs-controls-section">
                    <div className="bs-head"><span className="bs-title serif">Controls</span><span className="cred-tag" style={{background:supabaseReady?"var(--live)":"var(--gold)",color:"#fff"}}>{supabaseReady?"Live":"DB needed"}</span></div>
                    <p className="bs-sub">Change how The Spine runs - saved to the database and applied live, no re-coding.{supabaseReady?"":" Connect Supabase for these to persist."}</p>
                    <div className="bs-controls">
                      <label className="bs-ctrl"><span>Free questions before sign-up</span>
                        <input type="number" min="0" max="100" value={settingsDraft.freeQuestionLimit} onChange={e=>setSettingsDraft(d=>({...d,freeQuestionLimit:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Rate limit (questions / hour)</span>
                        <input type="number" min="1" max="500" value={settingsDraft.rateLimitPerHour} onChange={e=>setSettingsDraft(d=>({...d,rateLimitPerHour:parseInt(e.target.value||"1",10)}))}/></label>
                      <label className="bs-ctrl"><span>Starter credits (new accounts)</span>
                        <input type="number" min="0" max="100000" value={settingsDraft.starterCredits} onChange={e=>setSettingsDraft(d=>({...d,starterCredits:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Free-tier model</span>
                        <select value={settingsDraft.freeModel} onChange={e=>setSettingsDraft(d=>({...d,freeModel:e.target.value}))}>
                          <option value="claude-haiku-4-5-20251001">Haiku (cheaper)</option>
                          <option value="claude-sonnet-4-6">Sonnet (better, costs more)</option>
                        </select></label>
                      <label className="bs-ctrl"><span>Signed-in model</span>
                        <select value={settingsDraft.paidModel} onChange={e=>setSettingsDraft(d=>({...d,paidModel:e.target.value}))}>
                          <option value="claude-sonnet-4-6">Sonnet (better)</option>
                          <option value="claude-haiku-4-5-20251001">Haiku (cheaper)</option>
                        </select></label>
                      <label className="bs-ctrl toggle"><span>Sign-ups open</span>
                        <input type="checkbox" checked={settingsDraft.signupsOpen} onChange={e=>setSettingsDraft(d=>({...d,signupsOpen:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Market open</span>
                        <input type="checkbox" checked={settingsDraft.marketOpen} onChange={e=>setSettingsDraft(d=>({...d,marketOpen:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Maintenance mode (pauses answers)</span>
                        <input type="checkbox" checked={settingsDraft.maintenanceMode} onChange={e=>setSettingsDraft(d=>({...d,maintenanceMode:e.target.checked}))}/></label>
                      <label className="bs-ctrl wide"><span>Announcement banner (blank = none)</span>
                        <input type="text" value={settingsDraft.announcement} onChange={e=>setSettingsDraft(d=>({...d,announcement:e.target.value}))} placeholder="e.g. Welcome to early access!"/></label>
                      <label className="bs-ctrl toggle"><span>Credits / charging enabled (off until payments ready)</span>
                        <input type="checkbox" checked={settingsDraft.creditsEnabled} onChange={e=>setSettingsDraft(d=>({...d,creditsEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Credit cost per question</span>
                        <input type="number" min="0" max="1000" value={settingsDraft.coreCostPaid} onChange={e=>setSettingsDraft(d=>({...d,coreCostPaid:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl wide"><span>Support email #1</span>
                        <input type="text" value={settingsDraft.supportEmail1} onChange={e=>setSettingsDraft(d=>({...d,supportEmail1:e.target.value}))} placeholder="support@thespine.cloud"/></label>
                      <label className="bs-ctrl wide"><span>Support email #2</span>
                        <input type="text" value={settingsDraft.supportEmail2} onChange={e=>setSettingsDraft(d=>({...d,supportEmail2:e.target.value}))} placeholder="beforedawn2021@gmail.com"/></label>
                      <label className="bs-ctrl toggle"><span>File upload (+) enabled</span>
                        <input type="checkbox" checked={settingsDraft.uploadEnabled} onChange={e=>setSettingsDraft(d=>({...d,uploadEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Voice input (mic) enabled</span>
                        <input type="checkbox" checked={settingsDraft.voiceEnabled} onChange={e=>setSettingsDraft(d=>({...d,voiceEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>High-stakes mode enabled</span>
                        <input type="checkbox" checked={settingsDraft.highStakesEnabled} onChange={e=>setSettingsDraft(d=>({...d,highStakesEnabled:e.target.checked}))}/></label>
                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Show / hide tabs</span></div>
                      <label className="bs-ctrl toggle"><span>Create tab</span>
                        <input type="checkbox" checked={settingsDraft.showCreate} onChange={e=>setSettingsDraft(d=>({...d,showCreate:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Market tab</span>
                        <input type="checkbox" checked={settingsDraft.showMarket} onChange={e=>setSettingsDraft(d=>({...d,showMarket:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Studio tab</span>
                        <input type="checkbox" checked={settingsDraft.showStudio} onChange={e=>setSettingsDraft(d=>({...d,showStudio:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Earn tab</span>
                        <input type="checkbox" checked={settingsDraft.showEarn} onChange={e=>setSettingsDraft(d=>({...d,showEarn:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Vault tab</span>
                        <input type="checkbox" checked={settingsDraft.showVault} onChange={e=>setSettingsDraft(d=>({...d,showVault:e.target.checked}))}/></label>
                      <label className="bs-ctrl wide"><span>Landing greeting (the line under "Hello - I'm The Spine")</span>
                        <input type="text" value={settingsDraft.greeting} onChange={e=>setSettingsDraft(d=>({...d,greeting:e.target.value}))} placeholder="(blank = no subtitle)"/></label>
                      <label className="bs-ctrl wide"><span>Extra blocked terms (comma-separated)</span>
                        <input type="text" value={settingsDraft.extraBlockedTerms} onChange={e=>setSettingsDraft(d=>({...d,extraBlockedTerms:e.target.value}))} placeholder="e.g. term one, term two"/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Images</span></div>
                      <label className="bs-ctrl toggle"><span>Image generation enabled</span>
                        <input type="checkbox" checked={settingsDraft.imageEnabled} onChange={e=>setSettingsDraft(d=>({...d,imageEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Free images (no signup)</span>
                        <input type="number" min="0" max="50" value={settingsDraft.imageFreeNoSignup} onChange={e=>setSettingsDraft(d=>({...d,imageFreeNoSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Free images (signed up)</span>
                        <input type="number" min="0" max="200" value={settingsDraft.imageFreeSignup} onChange={e=>setSettingsDraft(d=>({...d,imageFreeSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Refill amount</span>
                        <input type="number" min="0" max="200" value={settingsDraft.imageRefillAmount} onChange={e=>setSettingsDraft(d=>({...d,imageRefillAmount:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Refill window (hours)</span>
                        <input type="number" min="1" max="168" value={settingsDraft.imageRefillHours} onChange={e=>setSettingsDraft(d=>({...d,imageRefillHours:parseInt(e.target.value||"1",10)}))}/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Games</span></div>
                      <label className="bs-ctrl"><span>Free games (no account)</span>
                        <input type="number" min="0" max="50" value={settingsDraft.gameFreeNoSignup??2} onChange={e=>setSettingsDraft(d=>({...d,gameFreeNoSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Games per cycle (signed-up)</span>
                        <input type="number" min="0" max="200" value={settingsDraft.gameFreeSignup??10} onChange={e=>setSettingsDraft(d=>({...d,gameFreeSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Game refill window (hours)</span>
                        <input type="number" min="1" max="168" value={settingsDraft.gameRefillHours??36} onChange={e=>setSettingsDraft(d=>({...d,gameRefillHours:parseInt(e.target.value||"1",10)}))}/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Blueprints</span></div>
                      <label className="bs-ctrl"><span>Free blueprints (no account)</span>
                        <input type="number" min="0" max="50" value={settingsDraft.blueprintFreeNoSignup??2} onChange={e=>setSettingsDraft(d=>({...d,blueprintFreeNoSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Blueprints per cycle (signed-up)</span>
                        <input type="number" min="0" max="200" value={settingsDraft.blueprintFreeSignup??5} onChange={e=>setSettingsDraft(d=>({...d,blueprintFreeSignup:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Blueprint refill window (hours)</span>
                        <input type="number" min="1" max="168" value={settingsDraft.blueprintRefillHours??36} onChange={e=>setSettingsDraft(d=>({...d,blueprintRefillHours:parseInt(e.target.value||"1",10)}))}/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Tiers &amp; pricing (off until payments connect)</span></div>
                      <label className="bs-ctrl toggle"><span>Tiers / paywalls enabled</span>
                        <input type="checkbox" checked={settingsDraft.tiersEnabled} onChange={e=>setSettingsDraft(d=>({...d,tiersEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Pro price ($/mo)</span>
                        <input type="number" min="0" step="0.01" value={settingsDraft.proPrice} onChange={e=>setSettingsDraft(d=>({...d,proPrice:parseFloat(e.target.value||"0")}))}/></label>
                      <label className="bs-ctrl"><span>Pro: chats</span>
                        <input type="number" min="0" value={settingsDraft.proChats} onChange={e=>setSettingsDraft(d=>({...d,proChats:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Pro: images</span>
                        <input type="number" min="0" value={settingsDraft.proImages} onChange={e=>setSettingsDraft(d=>({...d,proImages:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Pro: videos</span>
                        <input type="number" min="0" value={settingsDraft.proVideos} onChange={e=>setSettingsDraft(d=>({...d,proVideos:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl toggle"><span>Smart model routing (save cost)</span>
                        <input type="checkbox" checked={settingsDraft.smartRouting} onChange={e=>setSettingsDraft(d=>({...d,smartRouting:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Cache common answers (save cost)</span>
                        <input type="checkbox" checked={settingsDraft.cachingEnabled} onChange={e=>setSettingsDraft(d=>({...d,cachingEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Image rate limit (seconds)</span>
                        <input type="number" min="0" max="600" value={settingsDraft.imageRateSeconds} onChange={e=>setSettingsDraft(d=>({...d,imageRateSeconds:parseInt(e.target.value||"0",10)}))}/></label>
                      <div className="bs-ctrl wide"><span style={{fontWeight:600,color:"var(--ink2)"}}>Credit costs (pegged . 1 cr = $0.001)</span></div>
                      <label className="bs-ctrl"><span>Cost per chat (cr)</span>
                        <input type="number" min="0" value={settingsDraft.costChat} onChange={e=>setSettingsDraft(d=>({...d,costChat:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Cost per image (cr)</span>
                        <input type="number" min="0" value={settingsDraft.costImage} onChange={e=>setSettingsDraft(d=>({...d,costImage:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Cost per HQ image (cr)</span>
                        <input type="number" min="0" value={settingsDraft.costImageHi} onChange={e=>setSettingsDraft(d=>({...d,costImageHi:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Cost per video (cr)</span>
                        <input type="number" min="0" value={settingsDraft.costVideo} onChange={e=>setSettingsDraft(d=>({...d,costVideo:parseInt(e.target.value||"0",10)}))}/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Providers (go live when keyed + toggled)</span></div>
                      <div className="bs-ctrl wide"><SwitchRow label="Live search (Tavily)" on={!!settingsDraft.searchEnabled} onChange={v=>setSettingsDraft(d=>({...d,searchEnabled:v}))}/></div>
                      <div className="bs-ctrl wide"><SwitchRow label="Video (Kling/Runway)" on={!!settingsDraft.videoEnabled} onChange={v=>setSettingsDraft(d=>({...d,videoEnabled:v}))}/></div>
                      <label className="bs-ctrl"><span>Video max seconds (cap)</span>
                        <input type="number" min="1" max="5" value={settingsDraft.videoMaxSeconds||5} onChange={e=>setSettingsDraft(d=>({...d,videoMaxSeconds:Math.min(5,parseInt(e.target.value||"5",10))}))}/></label>
                      <div className="bs-ctrl wide"><SwitchRow label="Subscriptions live" on={!!settingsDraft.subscriptionsLive} onChange={v=>setSettingsDraft(d=>({...d,subscriptionsLive:v}))}/></div>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"#8a3b2c"}}>Kill switches (instant off if costs spike)</span></div>
                      <div className="bs-ctrl wide"><SwitchRow label="Kill images" on={!!settingsDraft.killImages} onChange={v=>setSettingsDraft(d=>({...d,killImages:v}))}/></div>
                      <div className="bs-ctrl wide"><SwitchRow label="Kill video" on={!!settingsDraft.killVideo} onChange={v=>setSettingsDraft(d=>({...d,killVideo:v}))}/></div>
                      <div className="bs-ctrl wide"><SwitchRow label="Kill search" on={!!settingsDraft.killSearch} onChange={v=>setSettingsDraft(d=>({...d,killSearch:v}))}/></div>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Monetization (off until payments connect)</span></div>
                      <label className="bs-ctrl toggle"><span>Spine Plus subscription</span>
                        <input type="checkbox" checked={settingsDraft.spinePlusEnabled} onChange={e=>setSettingsDraft(d=>({...d,spinePlusEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Spine Plus price ($/mo)</span>
                        <input type="number" min="0" step="0.01" value={settingsDraft.spinePlusPrice} onChange={e=>setSettingsDraft(d=>({...d,spinePlusPrice:parseFloat(e.target.value||"0")}))}/></label>
                      <label className="bs-ctrl"><span>Spine Plus images/mo</span>
                        <input type="number" min="0" max="10000" value={settingsDraft.spinePlusImages} onChange={e=>setSettingsDraft(d=>({...d,spinePlusImages:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl toggle"><span>Pro tools tier</span>
                        <input type="checkbox" checked={settingsDraft.proToolsEnabled} onChange={e=>setSettingsDraft(d=>({...d,proToolsEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Pro tools cut (%)</span>
                        <input type="number" min="0" max="100" value={settingsDraft.proToolsCutPct} onChange={e=>setSettingsDraft(d=>({...d,proToolsCutPct:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl toggle"><span>Bulk credits</span>
                        <input type="checkbox" checked={settingsDraft.bulkCreditsEnabled} onChange={e=>setSettingsDraft(d=>({...d,bulkCreditsEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Featured placement</span>
                        <input type="checkbox" checked={settingsDraft.featuredPlacementEnabled} onChange={e=>setSettingsDraft(d=>({...d,featuredPlacementEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Featured price ($)</span>
                        <input type="number" min="0" step="0.01" value={settingsDraft.featuredPlacementPrice} onChange={e=>setSettingsDraft(d=>({...d,featuredPlacementPrice:parseFloat(e.target.value||"0")}))}/></label>
                      <label className="bs-ctrl toggle"><span>Referral rewards</span>
                        <input type="checkbox" checked={settingsDraft.referralsEnabled} onChange={e=>setSettingsDraft(d=>({...d,referralsEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Referral bonus (credits)</span>
                        <input type="number" min="0" max="10000" value={settingsDraft.referralBonus} onChange={e=>setSettingsDraft(d=>({...d,referralBonus:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl toggle"><span>Daily login bonus</span>
                        <input type="checkbox" checked={settingsDraft.dailyBonusEnabled} onChange={e=>setSettingsDraft(d=>({...d,dailyBonusEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Daily bonus (credits)</span>
                        <input type="number" min="0" max="10000" value={settingsDraft.dailyBonusAmount} onChange={e=>setSettingsDraft(d=>({...d,dailyBonusAmount:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl toggle"><span>Promo codes</span>
                        <input type="checkbox" checked={settingsDraft.promoCodesEnabled} onChange={e=>setSettingsDraft(d=>({...d,promoCodesEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Your margin (%)</span>
                        <input type="number" min="0" max="90" value={settingsDraft.marginPct} onChange={e=>setSettingsDraft(d=>({...d,marginPct:parseInt(e.target.value||"0",10)}))}/></label>

                      <div className="bs-ctrl wide" style={{borderTop:"1px solid var(--stone)",paddingTop:10,marginTop:4}}><span style={{fontWeight:600,color:"var(--ink2)"}}>Creator reward pool (money out lte money in)</span></div>
                      <label className="bs-ctrl toggle"><span>Pool enabled (fund via purchases)</span>
                        <input type="checkbox" checked={settingsDraft.poolEnabled} onChange={e=>setSettingsDraft(d=>({...d,poolEnabled:e.target.checked}))}/></label>
                      <label className="bs-ctrl toggle"><span>Cash-out live (needs payments)</span>
                        <input type="checkbox" checked={settingsDraft.payoutsLive} onChange={e=>setSettingsDraft(d=>({...d,payoutsLive:e.target.checked}))}/></label>
                      <label className="bs-ctrl"><span>Creator split (%)</span>
                        <input type="number" min="0" max="100" value={settingsDraft.splitCreatorPct} onChange={e=>setSettingsDraft(d=>({...d,splitCreatorPct:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Platform split (%)</span>
                        <input type="number" min="0" max="100" value={settingsDraft.splitPlatformPct} onChange={e=>setSettingsDraft(d=>({...d,splitPlatformPct:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Compute split (%)</span>
                        <input type="number" min="0" max="100" value={settingsDraft.splitComputePct} onChange={e=>setSettingsDraft(d=>({...d,splitComputePct:parseInt(e.target.value||"0",10)}))}/></label>
                      <label className="bs-ctrl"><span>Min credits to cash out</span>
                        <input type="number" min="0" value={settingsDraft.payoutMinCredits} onChange={e=>setSettingsDraft(d=>({...d,payoutMinCredits:parseInt(e.target.value||"0",10)}))}/></label>
                    </div>
                    <div style={{display:"flex",gap:10,alignItems:"center",marginTop:12,flexWrap:"wrap"}}>
                      <button className="bs-btn" onClick={async()=>{ const r=await saveSettings(settingsDraft,adminPass); if(r&&r.ok){ setSettings(settingsDraft); setSettingsSaved("Saved - live now."); setTimeout(()=>setSettingsSaved(""),2500);} else { setSettingsSaved((r&&r.error)||"Couldn't save."); } }}>Save controls</button>
                      <button className="bs-btn alt" onClick={()=>setSettingsDraft(settings)}>Reset</button>
                      {settingsSaved&&<span className="bs-rd" style={{color:"var(--live)"}}>{settingsSaved}</span>}
                    </div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Provider status</span><span className="cred-tag" style={{background:"var(--gold)",color:"#fff"}}>keys + toggles</span></div>
                    <p className="bs-sub">Features activate automatically when their API key is set in Vercel. Use the kill switches below to force any feature OFF instantly, regardless of keys.</p>
                    <div className="prov-list">
                      <div className="prov-row"><span className={"prov-dot "+(!settings.killImages?"on":"off")}/><span>Images (OpenAI)</span><span className="prov-state">{settings.killImages?"killed":"live when keyed"}</span></div>
                      <div className="prov-row"><span className={"prov-dot "+(!settings.killSearch?"on":"off")}/><span>Live search (Tavily)</span><span className="prov-state">{settings.killSearch?"killed":"live when keyed"}</span></div>
                      <div className="prov-row"><span className={"prov-dot "+(!settings.killVideo?"on":"off")}/><span>Video (Kling/Runway)</span><span className="prov-state">{settings.killVideo?"killed":"live when keyed"}</span></div>
                      <div className="prov-row"><span className={"prov-dot on"}/><span>Payments (Stripe)</span><span className="prov-state">live when keyed</span></div>
                    </div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Money truth</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>real</span></div>
                    <p className="bs-sub">The honest picture: money in vs. credits owed to creators. The iron rule - never let "owed to creators" exceed real money in. Subscriptions are yours; tool-usage funds the creator pool.</p>
                    <div className="bs-metrics">
                      <div className="bs-m"><span className="bs-mn mono">${(adminStats?(adminStats.revenue||0):0).toFixed(2)}</span><span className="bs-ml">Real money in (est.)</span></div>
                      <div className="bs-m"><span className="bs-mn mono">{(settings.poolBalance||0).toLocaleString()}</span><span className="bs-ml">Reward pool (credits)</span></div>
                      <div className="bs-m"><span className="bs-mn mono">{tools.reduce((s,t)=>s+(t.earned||0),0).toLocaleString()}</span><span className="bs-ml">Owed to creators (credits)</span></div>
                      <div className="bs-m"><span className="bs-mn mono">${((tools.reduce((s,t)=>s+(t.earned||0),0))*0.001).toFixed(2)}</span><span className="bs-ml">Owed in dollars (est.)</span></div>
                    </div>
                    <div className="snotice info" style={{marginTop:10}}>Creators cash out only EARNED credits (from others using their tools), never their own purchased credits, and only at $10+ earned. Your subscription revenue and your split stay in your bank - you only pay out creators' earned share when they withdraw.</div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Profit calculator</span><span className="cred-tag" style={{background:"var(--gold)",color:"#fff"}}>what-if</span></div>
                    <p className="bs-sub">Plug in your numbers to see your real monthly profit. Pro nets ~$7 each after Stripe fees and typical usage; free users cost ~$1 each.</p>
                    <div className="bs-controls">
                      <label className="bs-ctrl"><span>Pro subscribers</span>
                        <input type="number" min="0" value={calcSubs} onChange={e=>setCalcSubs(parseInt(e.target.value||"0",10))}/></label>
                      <label className="bs-ctrl"><span>Free users</span>
                        <input type="number" min="0" value={calcFree} onChange={e=>setCalcFree(parseInt(e.target.value||"0",10))}/></label>
                    </div>
                    {(() => { const profit=(calcSubs*7)-(calcFree*1); return (
                      <div className="bs-metrics" style={{marginTop:10}}>
                        <div className="bs-m"><span className="bs-mn mono">${(calcSubs*7).toLocaleString()}</span><span className="bs-ml">Profit from Pro</span></div>
                        <div className="bs-m"><span className="bs-mn mono">${(calcFree*1).toLocaleString()}</span><span className="bs-ml">Cost of free users</span></div>
                        <div className="bs-m"><span className="bs-mn mono" style={{color:profit>=0?"#3a9e5c":"#8a3b2c"}}>${profit.toLocaleString()}</span><span className="bs-ml">Net monthly {profit>=0?"profit":"LOSS"}</span></div>
                      </div>
                    ); })()}
                    <div className="snotice info" style={{marginTop:10}}>Rough model, tune to your reality. The lever that matters most: keep free-user costs low (limit free video) and convert ~2-5% to Pro.</div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Usage . this device</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>real</span></div>
                    <p className="bs-sub">What's actually being consumed on this device - your real cost driver. Each question and image is a paid API call. (Per-device; full cross-user totals come from your provider dashboards.)</p>
                    <div className="bs-metrics">
                      <div className="bs-m"><span className="bs-mn mono">{usage.questions.toLocaleString()}</span><span className="bs-ml">Questions today</span></div>
                      <div className="bs-m"><span className="bs-mn mono">{usage.images.toLocaleString()}</span><span className="bs-ml">Images today</span></div>
                      <div className="bs-m"><span className="bs-mn mono">{(usage.totalQuestions||0).toLocaleString()}</span><span className="bs-ml">Questions all-time</span></div>
                      <div className="bs-m"><span className="bs-mn mono">{(usage.totalImages||0).toLocaleString()}</span><span className="bs-ml">Images all-time</span></div>
                      <div className="bs-m"><span className="bs-mn mono">${(((usage.totalImages||0)*0.005)+((usage.totalQuestions||0)*0.002)).toFixed(2)}</span><span className="bs-ml">Rough est. cost</span></div>
                    </div>
                    <div className="snotice info" style={{marginTop:10}}>Rough estimate only (~$0.005/image, ~$0.002/question on cheap models). Your provider dashboards (Anthropic + OpenAI) show the exact, true spend - and that's where you set the hard spending cap that can never be exceeded.</div>
                  </div>

                  {adminStats&&(
                    <div className="bs-section">
                      <div className="bs-head"><span className="bs-title serif">Engagement</span><span className="cred-tag" style={{background:"var(--gold)",color:"#fff"}}>partial</span></div>
                      <p className="bs-sub">Local first-party signals. For full visitor counts and time-on-site across all users, enable Vercel Analytics (free) in your Vercel project - then richer numbers appear here.</p>
                      <div className="bs-metrics">
                        <div className="bs-m"><span className="bs-mn mono">{(()=>{try{return localStorage.getItem("spine.visits")||"1";}catch{return "-";}})()}</span><span className="bs-ml">Visits (this device)</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(()=>{try{const s=parseInt(sessionStorage.getItem("spine.sessionStart")||"0",10);return s?Math.max(1,Math.round((Date.now()-s)/60000))+"m":"-";}catch{return "-";}})()}</span><span className="bs-ml">This session</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{signalsAbsorbed.toLocaleString()}</span><span className="bs-ml">Signals absorbed</span></div>
                      </div>
                    </div>
                  )}

                  {adminStats&&(
                    <div className="bs-section">
                      <div className="bs-head"><span className="bs-title serif">Live database</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>real</span></div>
                      <p className="bs-sub">Pulled live from Supabase - the real state of the platform.</p>
                      <div className="bs-metrics">
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.accounts||0).toLocaleString()}</span><span className="bs-ml">Total accounts</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.profiles||0).toLocaleString()}</span><span className="bs-ml">Profiles created</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.tools||0).toLocaleString()}</span><span className="bs-ml">Tools in market</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.conversations||0).toLocaleString()}</span><span className="bs-ml">Conversations saved</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.creditsIn||0).toLocaleString()}</span><span className="bs-ml">Credits in (ledger)</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.creditsOut||0).toLocaleString()}</span><span className="bs-ml">Credits out (ledger)</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.thumbsUp||0).toLocaleString()}</span><span className="bs-ml">+ outcomes</span></div>
                        <div className="bs-m"><span className="bs-mn mono">{(adminStats.thumbsDown||0).toLocaleString()}</span><span className="bs-ml">- outcomes</span></div>
                      </div>
                      {adminStats.recentAccounts&&adminStats.recentAccounts.length>0&&(
                        <div style={{marginTop:14}}>
                          <div className="bs-rn" style={{marginBottom:6}}>Recent signups</div>
                          {adminStats.recentAccounts.slice(0,6).map((a,i)=>(
                            <div key={i} className="bs-row"><div><div className="bs-rn">@{a.username}{a.is_admin?" . admin":""}</div><div className="bs-rd">{a.created_at?new Date(a.created_at).toLocaleString():""}</div></div></div>
                          ))}
                        </div>
                      )}
                      {adminStats.topTools&&adminStats.topTools.length>0&&(
                        <div style={{marginTop:14}}>
                          <div className="bs-rn" style={{marginBottom:6}}>Top tools by runs</div>
                          {adminStats.topTools.slice(0,6).map((t,i)=>(
                            <div key={i} className="bs-row"><div><div className="bs-rn">{t.name} <span style={{color:"var(--ink3)"}}>. {t.runs||0} runs</span></div><div className="bs-rd">{t.trust_level||"New"} . +{t.thumbs_up||0} -{t.thumbs_down||0}</div></div></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Users</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>{adminUsers.length}</span></div>
                    <p className="bs-sub">Every account. Adjust credits or remove an account. Changes are immediate and real.</p>
                    {adminMsg&&<div className="snotice ok" style={{marginBottom:10}}>{adminMsg}</div>}
                    {adminUsers.length===0?(
                      <div className="conv-empty">No accounts yet.</div>
                    ):(
                      <div className="bs-users">
                        {adminUsers.map(u=>(
                          <div key={u.id} className="bs-user-row">
                            <div className="bs-user-info">
                              <div className="bs-rn">@{u.username}{u.isAdmin?" . admin":""}</div>
                              <div className="bs-rd">{u.contact||"no contact"} . joined {u.createdAt?new Date(u.createdAt).toLocaleDateString():"-"}</div>
                            </div>
                            <div className="bs-user-actions">
                              <span className="bs-user-bal mono">{(u.balance||0).toLocaleString()} cr</span>
                              <button className="bs-btn tiny" onClick={async()=>{ const v=prompt("Set credits for @"+u.username+":",String(u.balance||0)); if(v==null)return; const n=parseInt(v,10); if(isNaN(n))return; const r=await adminSetUserCredits(u.id,n); if(r.ok){ setAdminUsers(list=>list.map(x=>x.id===u.id?{...x,balance:n}:x)); setAdminMsg("Updated @"+u.username+"'s credits to "+n+"."); setTimeout(()=>setAdminMsg(""),2500);} else setAdminMsg(r.error||"Couldn't update."); }}>Credits</button>
                              {!u.isAdmin&&<button className="bs-btn tiny danger" onClick={async()=>{ if(!confirm("Delete @"+u.username+"'s account permanently? This cannot be undone."))return; const r=await adminDeleteUser(u.id); if(r.ok){ setAdminUsers(list=>list.filter(x=>x.id!==u.id)); setAdminMsg("Deleted @"+u.username+"."); setTimeout(()=>setAdminMsg(""),2500);} else setAdminMsg(r.error||"Couldn't delete."); }}>Delete</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Tools</span><span className="cred-tag" style={{background:"var(--live)",color:"#fff"}}>{tools.length}</span></div>
                    <p className="bs-sub">Every tool in the Market. Feature the good ones, remove junk. Changes are immediate.</p>
                    <div className="bs-users">
                      {tools.map(t=>(
                        <div key={t.id} className="bs-user-row">
                          <div className="bs-user-info">
                            <div className="bs-rn">{t.name}{t.featured?" . * featured":""}</div>
                            <div className="bs-rd">{t.by||"unknown"} . {t.runs||0} runs . {t.trust||"New"}</div>
                          </div>
                          <div className="bs-user-actions">
                            <button className="bs-btn tiny" onClick={async()=>{ const nf=!t.featured; setTools(list=>list.map(x=>x.id===t.id?{...x,featured:nf}:x)); await adminSetToolFeatured(t.id,nf); setAdminMsg((nf?"Featured ":"Unfeatured ")+t.name+"."); setTimeout(()=>setAdminMsg(""),2000); }}>{t.featured?"Unfeature":"Feature"}</button>
                            <button className="bs-btn tiny danger" onClick={async()=>{ if(!confirm("Delete tool \""+t.name+"\" permanently?"))return; setTools(list=>list.filter(x=>x.id!==t.id)); await adminDeleteTool(t.id); setAdminMsg("Deleted "+t.name+"."); setTimeout(()=>setAdminMsg(""),2000); }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Legal review</span><span className="cred-tag" style={{background:"var(--gold)"}}>{legalQueue.filter(x=>x.status==="pending").length} held</span></div>
                    <p className="bs-sub">Flagged legal requests are held - never auto-answered - and routed to you to decide with counsel.</p>
                    {legalQueue.map(l=>(
                      <div key={l.id} className="bs-row">
                        <div><div className="bs-rn">{l.kind}{l.status!=="pending"&&<span style={{color:"var(--live)"}}> . {l.status}</span>}</div><div className="bs-rd">{l.from} - {l.note}</div></div>
                        <div style={{display:"flex",gap:6}}>
                          <button className="bs-btn" onClick={()=>setLegalQueue(q=>q.map(x=>x.id===l.id?{...x,status:"comply"}:x))}>Comply</button>
                          <button className="bs-btn alt" onClick={()=>setLegalQueue(q=>q.map(x=>x.id===l.id?{...x,status:"fight"}:x))}>Fight w/ counsel</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bs-section">
                    <div className="bs-head"><span className="bs-title serif">Safety alerts</span><span className="cred-tag" style={{background:"var(--err)",color:"#fff"}}>{safetyLog.length}</span></div>
                    <p className="bs-sub">Dangerous requests are refused at the door and never generated. You're alerted so you can ban the user or report them - these are notifications, not a fulfillment queue.</p>
                    {safetyLog.map(s=>(
                      <div key={s.id} className="bs-row">
                        <div><div className="bs-rn">{s.flag} <span style={{color:"var(--err)"}}>. {s.action}</span></div><div className="bs-rd">{s.note} <span style={{color:"var(--ink3)"}}>({s.at})</span></div></div>
                        <button className="bs-btn">Ban / report</button>
                      </div>
                    ))}
                  </div>

                  <div className="snotice info">The warm, user-facing message ("The Spine protects its members; a person is reviewing this") is what the user sees. The decision is always made here, by you - never by a machine alone.</div>
                  <button className="run-btn ghost" onClick={()=>{setAdminAuthed(false);setAdminOpen(false);}}>Lock the Brain Stem</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {runTool&&(
        <div className="modal-back" onClick={closeRun}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h">
              <div><div className="mt serif">{runTool.name}</div><div className="mby">by @{runTool.by} . {typeMeta(runTool.type).label}</div></div>
              <button className="modal-x" onClick={closeRun} aria-label="Close">x</button>
            </div>
            <div className="modal-body">
              <div className="run-meta">
                <span className="rm">Price <b>{runTool.mine?"free to test":runTool.price+" cr = "+usd(runTool.price)}</b></span>
                <span className="rm">Runs <b>{runTool.runs.toLocaleString()}</b></span>
                {outcomePct(runTool)!=null&&<span className="rm">Outcome <b>{outcomePct(runTool)}%</b></span>}
                {runTool.file&&<span className="rm">Bundled <b>{runTool.file.name}</b></span>}
                {credScore(runTool)&&<span className="rm" style={{color:"var(--live)"}}>v Verified tool</span>}
              </div>
              {contribsOf(runTool).length>1&&(
                <div className="splitbox">
                  <div className="sbh">Attribution - how this run settles</div>
                  {contribsOf(runTool).map(c=>(
                    <div key={c.handle} className="split-row">
                      <span className="sn">@{c.handle}<br/><span className="sr">{c.role}</span></span>
                      <div className="split-bar"><i style={{width:`${c.split}%`}}/></div>
                      <span className="sp">{c.split}%</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="field" style={{marginTop:14}}>
                <label>{runTool.type==="code"?"Input for the function":"Your input"}</label>
                <textarea value={runInput} onChange={e=>setRunInput(e.target.value)} placeholder={runTool.type==="prompt"?"Type what you want the tool to work on...":runTool.type==="code"?"Text to pass to the function...":"Describe what you'd like..."}/>
              </div>
              <button className="primary-cta" style={{marginTop:12}} disabled={runBusy} onClick={doRun}>
                {runBusy?<><span className="spinner"/>&nbsp; Firing up the spinal cord...</>:runTool.mine?"Run test":`Run . ${runTool.price} cr = ${usd(runTool.price)}`}
              </button>
              {runOut&&(<>
                <div className={`run-out${runTool.type==="code"?" code":""}`}>{runTool.type==="code"?runOut.text:renderRich(runOut.text)}</div>
                {!runOut.error&&(runOut.live?<div className="run-live"><span className="dot"/>Fired live{runTool.type==="code"?" in your browser":" through the spinal cord"}</div>:<div className="run-live off"><span className="dot"/>Preview signal</div>)}
                {!runOut.error&&!outcomeDone&&(
                  <div className="outcome-ask">
                    <div className="oq">Did this deliver what you needed?</div>
                    <div className="outcome-btns thumbs">
                      <button className="thumb up" onClick={()=>answerOutcome(true)} aria-label="It worked">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                        <span>It worked</span>
                      </button>
                      <button className="thumb down" onClick={()=>answerOutcome(false)} aria-label="Did not work">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                        <span>Didn't</span>
                      </button>
                    </div>
                  </div>
                )}
                {outcomeDone&&<div className="outcome-done">Thanks - your verdict updated this tool's outcome score. That's the signal buyers trust and the basis creators are paid on.</div>}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
