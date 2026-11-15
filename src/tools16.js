// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - helpers that run on the phone and load only when used:
//  · checkWriting: grammar and spelling (Harper, Apache-2.0, a 20 MB engine served from /ai/harper/)
//  · readDocx: the words in a Word file (mammoth, BSD-2)
//  · tidyCode: neat, consistent code (Prettier standalone, MIT)
//  · checkSite: a built site's problems in plain words (html-validate MIT + axe-core MPL-2.0)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ── grammar and spelling ──
let __harper = null;
async function harper() {
  if (__harper) return __harper;
  __harper = (async () => {
    const base = (typeof location !== "undefined" ? location.origin : "") + "/ai/harper/";
    const H = await import(/* @vite-ignore */ base + "index.js");
    const B = await import(/* @vite-ignore */ base + "binary.js");
    const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US"; const D = H.Dialect || {};
    const dialect = /-GB|-IE/i.test(lang) ? D.British : /-AU|-NZ/i.test(lang) ? D.Australian : /-CA/i.test(lang) ? D.Canadian : D.American; // spell the way the phone is set
    const L = new H.LocalLinter({ binary: B.binary, dialect });
    await L.setup(); return { L, H };
  })().catch((e) => { __harper = null; throw e; });
  return __harper;
}
const KIND = { Spelling: "Spelling", Typo: "Spelling", Agreement: "Grammar", Grammar: "Grammar", Punctuation: "Punctuation", Capitalization: "Capital letters", Repetition: "Repeated word", Redundancy: "Says it twice", WordChoice: "Word choice", Usage: "Word choice", Malapropism: "Wrong word", Eggcorn: "Wrong word", Readability: "Easier to read", Style: "Style", Formatting: "Formatting", BoundaryError: "Spacing", WordOrder: "Word order" };
export async function checkWriting(text) {
  const t = String(text || "").slice(0, 60000); if (!t.trim()) return [];
  const { L } = await harper(); const lints = await L.lint(t);
  return lints.slice(0, 200).map((l) => { const sp = l.span(); const sug = l.suggestions().slice(0, 4).map((s) => s.get_replacement_text());
    const k = String(l.lint_kind ? l.lint_kind() : ""); return { start: sp.start, end: sp.end, found: t.slice(sp.start, sp.end), kind: KIND[k] || k || "Writing", message: l.message(), suggestions: sug }; });
}
// put one suggestion in (positions counted the way Harper counts: by character)
export function applyFix(text, p, replacement) {
  const ch = Array.from(String(text)); return ch.slice(0, p.start).join("") + String(replacement) + ch.slice(p.end).join("");
}
export function applyAll(text, problems) { // the first suggestion for each, back to front so positions stay right
  let t = String(text); [...problems].filter((p) => p.suggestions && p.suggestions.length).sort((a, b) => b.start - a.start).forEach((p) => { t = applyFix(t, p, p.suggestions[0]); }); return t;
}

// ── Word files ──
export async function readDocx(arrayBuffer) {
  const m = await import("mammoth/mammoth.browser.js"); const mammoth = m.default || m;
  const r = await mammoth.extractRawText({ arrayBuffer });
  return { text: String(r.value || "").replace(/\n{3,}/g, "\n\n").trim(), warnings: (r.messages || []).length };
}

// ── tidy code ──
export async function tidyCode(code, kind) {
  const [p, html, babel, estree, postcss] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/html"), import("prettier/plugins/babel"), import("prettier/plugins/estree"), import("prettier/plugins/postcss")]);
  const prettier = p.default || p; const parser = kind === "css" ? "css" : kind === "js" ? "babel" : "html";
  return prettier.format(String(code || ""), { parser, plugins: [html.default || html, babel.default || babel, estree.default || estree, postcss.default || postcss], printWidth: 100, htmlWhitespaceSensitivity: "ignore" });
}

// ── check a built site ──
const PLAIN = {
  "image-alt": "A picture has no description, so screen readers can't say what it shows.",
  "color-contrast": "Some text is too faint against its background to read easily.",
  "button-name": "A button has no words or label, so people using a screen reader don't know what it does.",
  "link-name": "A link has no words, so it isn't clear where it goes.",
  label: "A form box has no label saying what to type in it.",
  "html-has-lang": "The page doesn't say which language it's in.",
  "document-title": "The page has no title (the name shown on the browser tab).",
  "meta-viewport": "Zooming is blocked, which makes it hard to read for people with poor eyesight.",
  "heading-order": "Headings skip levels, which makes the page harder to follow.",
  "duplicate-id": "Two parts of the page share the same id, which can break buttons and links.",
  "frame-title": "An embedded frame has no title.",
  "list": "A list is built wrongly, so screen readers misread it.",
  "aria-allowed-attr": "Some accessibility labels are used in the wrong place.",
};
export async function checkSite(html, opts) {
  const doc = String(html || ""); const out = [];
  // 1. is the HTML itself well formed?
  try {
    const hv = await import("html-validate/browser");
    const v = new hv.HtmlValidate({ extends: ["html-validate:recommended"], rules: { "no-inline-style": "off", "attribute-boolean-style": "off", "no-trailing-whitespace": "off", "void-style": "off", "attribute-empty-style": "off", "prefer-native-element": "off", "no-raw-characters": "off", "require-sri": "off", "doctype-style": "off", "element-required-attributes": "warn", "unique-landmark": "off", "valid-id": "off", "long-title": "off", "attr-quotes": "off", "no-implicit-button-type": "off", "attr-case": "off", "no-redundant-role": "off" } });
    const rep = await v.validateString(doc, "page.html");
    (rep.results[0] ? rep.results[0].messages : []).slice(0, 40).forEach((m) => out.push({ from: "HTML", rule: m.ruleId, serious: m.severity === 2, line: m.line, plain: m.message, where: (m.selector || "") }));
  } catch (e) { out.push({ from: "HTML", rule: "checker", serious: false, plain: "The HTML checker couldn't load just now." }); }
  // 2. can everyone use it? (axe-core, run inside a sealed copy of the page)
  try {
    const axeSrc = (await import("axe-core/axe.min.js?raw")).default;
    const res = await new Promise((resolve) => {
      const f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-scripts"); f.style.cssText = "position:fixed;left:-10000px;top:0;width:390px;height:844px;border:0;";
      const tag = "spine-axe-" + Math.random().toString(36).slice(2);
      const runner = "<script>" + axeSrc.replace(/<\/script/gi, "<\\/script") + "<\/script><script>window.addEventListener('load',function(){setTimeout(function(){axe.run(document,{resultTypes:['violations'],rules:{region:{enabled:false}}}).then(function(r){parent.postMessage({" + JSON.stringify(tag) + ":r.violations.map(function(v){return {id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.length,where:(v.nodes[0]&&v.nodes[0].target||[]).join(' ')}})},'*');}).catch(function(e){parent.postMessage({" + JSON.stringify(tag) + ":{error:String(e)}},'*');});},300);});<\/script>";
      const withAxe = /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, runner + "</body>") : doc + runner;
      const done = (v) => { window.removeEventListener("message", on); clearTimeout(to); try { f.remove(); } catch (e) {} resolve(v); };
      const on = (e) => { if (e.source === f.contentWindow && e.data && e.data[tag]) done(e.data[tag]); };
      const to = setTimeout(() => done({ error: "timeout" }), (opts && opts.timeout) || 20000);
      window.addEventListener("message", on); f.srcdoc = withAxe; document.body.appendChild(f);
    });
    if (Array.isArray(res)) res.forEach((v) => out.push({ from: "Access", rule: v.id, serious: v.impact === "critical" || v.impact === "serious", plain: (PLAIN[v.id] || v.help) + (v.nodes > 1 ? " (" + v.nodes + " places)" : ""), where: v.where }));
    else out.push({ from: "Access", rule: "checker", serious: false, plain: "The accessibility check couldn't finish on this page." });
  } catch (e) { out.push({ from: "Access", rule: "checker", serious: false, plain: "The accessibility checker couldn't load just now." }); }
  out.sort((a, b) => (b.serious ? 1 : 0) - (a.serious ? 1 : 0));
  return out;
}
export function problemsForBuilder(list) {
  return "Fix these problems found by the site checker, without changing anything else:\n" + list.filter((x) => x.rule !== "checker").slice(0, 25).map((x) => "- [" + x.from + " " + x.rule + "] " + x.plain + (x.where ? " (at " + x.where + ")" : x.line ? " (line " + x.line + ")" : "")).join("\n");
}
