// ═══════════════════════════════════════════════════════════════════════════════════════════
//  PHONE CHECK (batch 15). One screen that says, in plain words, what this phone can do with
//  The Spine - and how to switch on what's missing. Reads only what the browser reports about
//  itself; nothing is sent anywhere.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { voiceDownloaded, browserAIStatus, meaningModel } from "./onDevice15.js";
import { meaningMemoryOn, setMeaningMemory, warmMeaningMemory } from "./meaningMemory15.js";
import { track } from "./usageTracker.js";

const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const mb = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : Math.round(b / 1048576) + " MB");
// a tiny WebAssembly module that only validates if the phone has SIMD (fast on-phone AI)
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

const soon = (p, v) => Promise.race([Promise.resolve(p).catch(() => v), new Promise((r) => setTimeout(() => r(v), 3500))]);
export async function runPhoneCheck() {
  const r = []; const add = (k, ok, name, say, fix) => r.push({ k, ok, name, say, fix });
  add("online", navigator.onLine !== false, "Connected", navigator.onLine !== false ? "Online now." : "No signal right now - downloaded helpers still work.", "");
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  add("home", standalone, "On your Home Screen", standalone ? "Opened as an app." : "Opened in the browser.", ios() ? "In Safari tap Share, then 'Add to Home Screen' - needed on iPhone for alerts." : "Use the browser menu's 'Install app' or 'Add to Home screen'.");
  const sw = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  add("offline", sw, "Works with no signal", sw ? "The app is kept on this phone." : "Not kept yet.", "Open The Spine once more with signal and it will be.");
  try { const e = await soon(navigator.storage.estimate(), {}); const kept = navigator.storage.persisted ? await soon(navigator.storage.persisted(), false) : false;
    add("storage", (e.quota || 0) > 200 * 1048576, "Space for downloads", "Using " + mb(e.usage || 0) + " of about " + mb(e.quota || 0) + (kept ? ", kept safe from clean-ups." : "."), (e.quota || 0) > 200 * 1048576 ? "" : "Free up space on the phone for the voice and AI helpers."); } catch (e) { add("storage", null, "Space for downloads", "This browser doesn't say.", ""); }
  const push = "PushManager" in window && "Notification" in window; const perm = "Notification" in window ? Notification.permission : "unsupported";
  add("alerts", push && perm === "granted", "Lock-screen alerts", !push ? "Not available here." : perm === "granted" ? "Allowed." : perm === "denied" ? "Turned off for The Spine." : "Not asked yet.", !push && ios() && !standalone ? "Add The Spine to your Home Screen first (iPhone rule)." : perm === "denied" ? "Settings → Notifications → The Spine → Allow." : "Turn on 'Tell me on this phone' in Agent.");
  try { const d = await soon(navigator.mediaDevices.enumerateDevices(), []); const cam = d.filter((x) => x.kind === "videoinput").length, mic = d.filter((x) => x.kind === "audioinput").length;
    add("camera", cam > 0, "Camera", cam ? cam + (cam === 1 ? " camera" : " cameras") + " - scanning, hands, AR." : "None found.", ""); add("mic", mic > 0, "Microphone", mic ? "Ready for talking, humming and subtitles." : "None found.", ""); } catch (e) { add("camera", null, "Camera & microphone", "This browser doesn't say until asked.", ""); }
  add("motion", "DeviceOrientationEvent" in window, "Motion sensors", "DeviceOrientationEvent" in window ? "Tilt to look around worlds and levels." : "Not available.", "");
  let gl = false; try { gl = !!document.createElement("canvas").getContext("webgl2"); } catch (e) {}
  add("3d", gl, "3D graphics", gl ? "Worlds and 3D games run here." : "3D is limited on this browser.", gl ? "" : "Update the phone's software.");
  const gpu = !!navigator.gpu; add("gpu", gpu, "Extra-fast graphics (WebGPU)", gpu ? "Available." : "Not on this browser yet - everything still works, a little slower.", "");
  let simd = false; try { simd = WebAssembly.validate(SIMD); } catch (e) {}
  add("simd", simd, "Fast on-phone AI", simd ? "Yes - voice, cut-outs and search run quickly." : "Slower, but they still run.", simd ? "" : "Update the phone's software.");
  const v = await soon(voiceDownloaded(), false);
  add("voice", v, "Natural voice", v ? "Downloaded - works with no signal." : "Not downloaded.", v ? "" : "Tap 'Voice' next to your name (about 95 MB, best on Wi-Fi).");
  const mm = meaningMemoryOn();
  add("meaning", mm, "Memory by meaning", mm ? "On - Core finds past conversations by what they mean, not just the same words." : "Off.", mm ? "" : "Turn it on below (a one-time 50 MB download, best on Wi-Fi).");
  const a = await soon(browserAIStatus(), {}); const anyAI = Object.values(a).some((x) => x && x !== "unavailable");
  add("browserai", anyAI, "Browser's own AI", anyAI ? "This browser has built-in AI too (" + Object.entries(a).filter(([, x]) => x !== "unavailable").map(([k]) => k).join(", ") + ")." : "Not on this browser - nothing is missing, it's an extra.", "");
  let ar = false; try { const x = document.createElement("a"); ar = !!(x.relList && x.relList.supports && x.relList.supports("ar")); } catch (e) {} const xr = !!navigator.xr;
  add("ar", ar || xr, "See things in your room (AR)", ar ? "Yes, with the iPhone's AR viewer." : xr ? "Yes, with WebXR." : "Not on this browser.", "");
  track("Phone check · run");
  return r;
}

export function PhoneCheck({ onClose }) {
  const [rows, setRows] = useState(null); const [busy, setBusy] = useState("");
  const run = () => { setRows(null); runPhoneCheck().then(setRows).catch(() => setRows([])); };
  useEffect(run, []);
  const good = rows ? rows.filter((x) => x.ok).length : 0;
  return (
    <div className="pc15" role="dialog" aria-label="Phone check">
      <div className="pc15-h"><b>Phone check</b>{onClose && <button className="v15-x" onClick={onClose} aria-label="Close">×</button>}</div>
      <p className="v15-p">What this phone can do with The Spine, and how to switch on anything that's off. Nothing here is sent anywhere.</p>
      {!rows && <div className="v15-p">Checking...</div>}
      {rows && <div className="pc15-sum">{good} of {rows.length} ready</div>}
      {rows && rows.map((x) => (
        <div key={x.k} className={"pc15-row " + (x.ok ? "ok" : x.ok === false ? "no" : "na")}>
          <span className="pc15-ic" aria-hidden="true">{x.ok ? "✓" : x.ok === false ? "–" : "?"}</span>
          <div><b>{x.name}</b><span>{x.say}</span>{!x.ok && x.fix && <em>{x.fix}</em>}</div>
        </div>))}
      {rows && rows.some((x) => x.k === "meaning" && !x.ok) && <button className="v15-btn pri" style={{ marginTop: 10, marginRight: 8 }} disabled={!!busy} onClick={async () => {
        setBusy("Downloading the meaning finder..."); try { await meaningModel((t) => setBusy(t)); setMeaningMemory(true); await warmMeaningMemory(JSON.parse(localStorage.getItem("spine.memories") || "[]")); setBusy(""); run(); } catch (e) { setMeaningMemory(false); setBusy("That download stopped - try again on Wi-Fi."); } }}>Turn on memory by meaning</button>}
      {rows && rows.some((x) => x.k === "meaning" && x.ok) && <button className="v15-btn" style={{ marginTop: 10, marginRight: 8 }} onClick={() => { setMeaningMemory(false); run(); }}>Turn off memory by meaning</button>}
      {busy && <div className="v15-p">{busy}</div>}
      {rows && <button className="v15-btn" onClick={run} style={{ marginTop: 10 }}>Check again</button>}
    </div>
  );
}

export const PHONECHECK_CSS = `
.pc15{background:var(--panel);border:1px solid var(--stone);border-radius:14px;padding:14px 16px;color:var(--ink);max-width:480px;max-height:86vh;overflow:auto;}
.pc15-h{display:flex;justify-content:space-between;align-items:center;font-size:16px;}
.pc15-sum{font:700 13px Manrope,system-ui,sans-serif;color:var(--ink2);margin:6px 0;}
.pc15-row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--stone-l,rgba(0,0,0,.06));font-size:13px;}
.pc15-row b{display:block;color:var(--ink);}.pc15-row span{display:block;color:var(--ink2);}.pc15-row em{display:block;color:var(--gold);font-style:normal;font-weight:600;margin-top:2px;}
.pc15-ic{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none;background:var(--stone-l,rgba(0,0,0,.06));color:var(--ink3);}
.pc15-row.ok .pc15-ic{background:var(--live,#1a7f37);color:#fff;}
`;
