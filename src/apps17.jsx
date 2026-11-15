// ============================================================================
//  ITS OWN WEB ADDRESS (batch 17) - publish a tool, game, world or site at
//  thespine.cloud/a/your-name. Anyone can open it; only you can change or take
//  it down. A domain you own can point at it with your domain company's free
//  "URL forwarding" - The Spine explains how, step by step.
// ============================================================================
import { useState } from "react";
import { appPublish } from "./spineData.js";

export function suggestSlug(name) { return String(name || "my-app").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-app"; }
const WHY = { taken: "Someone already has that name - try another.", reserved: "That name is kept for The Spine - try another.", "bad name": "Use 3 to 40 letters, numbers or dashes.", "too big": "This one is too big to publish (or empty).", "too many": "You have 50 addresses already - remove one first.", busy: "That's a lot of publishing for one hour - try again soon.", "sign in": "Sign in first - the address is yours, so only you can change it.", missing: "Addresses switch on with the next database step." };

export function OwnAddress({ name, kind, mode, code, signedIn, base }) {
  const [open, setOpen] = useState(false); const [slug, setSlug] = useState(suggestSlug(name)); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [url, setUrl] = useState(""); const [dom, setDom] = useState(false);
  const origin = base || (typeof location !== "undefined" ? location.origin : "https://thespine.cloud");
  const go = async () => {
    setBusy(true); setMsg("");
    const r = await appPublish(slug, name, kind, mode, code); setBusy(false);
    if (r && r.data === "ok") { const u = origin + "/a/" + slug.toLowerCase(); setUrl(u); try { await navigator.clipboard.writeText(u); } catch (e) {} }
    else setMsg(WHY[(r && (r.data || r.error)) || ""] || "Couldn't publish it just now.");
  };
  return (
    <div className="own17">
      <button className="run-btn ghost" onClick={() => setOpen(!open)}>{"🌐"} Give it its own address</button>
      {open && <div className="own17-box">
        {!signedIn ? <div className="hint">{WHY["sign in"]}</div> : <>
          <div className="own17-row"><span>{origin.replace(/^https?:\/\//, "")}/a/</span><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40))} aria-label="Address name" /><button disabled={busy || slug.length < 3} onClick={go}>{busy ? "..." : url ? "Update" : "Publish"}</button></div>
          {msg && <div className="hint" style={{ color: "#b3261e" }}>{msg}</div>}
          {url && <div className="own17-ok">Live at <a href={url} target="_blank" rel="noopener noreferrer">{url}</a> - copied. Publishing again with the same name updates it.
            <div className="own17-acts">{navigator.share && <button onClick={() => navigator.share({ title: name, url }).catch(() => {})}>Send it</button>}<button onClick={() => setDom(!dom)}>Use my own domain</button></div></div>}
          {dom && <ol className="own17-dom">
            <li>Sign in where you bought your domain (GoDaddy, Namecheap, Squarespace, Google/Cloudflare and others).</li>
            <li>Find <b>Forwarding</b> or <b>URL redirect</b> for your domain (it's free at almost every company).</li>
            <li>Forward it to <b>{url}</b> - choose "permanent (301)" and, if offered, "forward the www version too".</li>
            <li>Save. In a few minutes, typing your domain opens your {kind === "game" ? "game" : kind === "world" ? "world" : "page"}.</li>
          </ol>}
        </>}
      </div>}
    </div>
  );
}
export const OWN17_CSS = `.own17{margin-top:8px}.own17-box{margin-top:8px;padding:10px;border:1px solid var(--stone,#ddd);border-radius:12px;background:var(--panel,#fff);font-size:14px}
.own17-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.own17-row span{opacity:.7;font-size:13px}.own17-row input{flex:1;min-width:120px;padding:9px;border-radius:9px;border:1px solid var(--stone,#ddd);font:inherit;background:var(--stone-l,#f6f3ee);color:inherit}.own17-row button,.own17-acts button{border:none;border-radius:9px;padding:9px 13px;background:#E8C060;color:#1a1405;font:inherit;font-weight:700}
.own17-ok{margin-top:8px;line-height:1.5;word-break:break-all}.own17-ok a{color:var(--gold)}.own17-acts{display:flex;gap:6px;margin-top:6px}.own17-acts button{background:var(--stone-l,#f6f3ee);color:inherit;border:1px solid var(--stone,#ddd);font-weight:500}.own17-dom{margin:8px 0 0 18px;padding:0;line-height:1.5}`;
