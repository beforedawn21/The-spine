// One copy helper for every Copy button. The modern clipboard can refuse (an iPhone does when the copy
// isn't straight from a tap, some browsers when the page isn't focused); then the older select-and-copy
// way is tried. Resolves true only when the words really reached the clipboard, so a button can say
// "Copied" honestly - and never leaves an unhandled error behind.
export function copyText(text) {
  const t = String(text == null ? "" : text);
  const old = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
      const ok = document.execCommand && document.execCommand("copy");
      ta.remove(); return !!ok;
    } catch (e) { return false; }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => old());
  } catch (e) { /* fall through */ }
  return Promise.resolve(old());
}
export const COPY_FAIL = "Couldn't copy here - press and hold the text to copy it.";
// Copy, then say what happened in a small note at the bottom of the screen (read out by screen readers).
export function copyAndSay(text, okWords) {
  return copyText(text).then((ok) => { say(ok ? (okWords || "Copied.") : COPY_FAIL); return ok; });
}
let sayTimer = null;
export function say(words) {
  try {
    let el = document.getElementById("spine-say17");
    if (!el) {
      el = document.createElement("div"); el.id = "spine-say17"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.style.cssText = "position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;background:#15161C;color:#fff;padding:9px 16px;border-radius:999px;font:600 14px/1.3 system-ui,-apple-system,sans-serif;max-width:86vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;transition:opacity .2s;opacity:0;";
      document.body.appendChild(el);
    }
    el.textContent = words; el.style.opacity = "1";
    clearTimeout(sayTimer); sayTimer = setTimeout(() => { el.style.opacity = "0"; }, 1800);
  } catch (e) { /* nowhere to say it */ }
}
