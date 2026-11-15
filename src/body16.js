// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BODY AND FACE TRACKING ON THE PHONE (batch 16), MediaPipe Pose and Face Mesh (Apache-2.0),
//  served from The Spine (/ai/pose/, /ai/facemesh/). Same privacy rule as hands: the camera stays in
//  The Spine; a game or tool only ever gets the points (where the joints or face features are), never
//  the picture. The camera switches off when stopped or when the app is hidden.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const AI = "/ai/";
function script(src) { return new Promise((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s); }); }
const r3 = (x) => Math.round(x * 1000) / 1000;

// ── BODY ─────────────────────────────────────────────────────────────────────
let poseP = null;
export function poseModel() {
  if (!poseP) poseP = (async () => {
    await script(AI + "pose/pose.js");
    const P = new window.Pose({ locateFile: (f) => AI + "pose/" + f });
    P.setOptions({ modelComplexity: 0, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    await P.initialize(); return P;
  })().catch((e) => { poseP = null; throw e; });
  return poseP;
}
// what the body is doing, in words a game can use. Points are mirrored like a selfie (0..1).
export function classifyPose(lm, prev) {
  if (!lm || lm.length < 29) return { pose: "none", points: [] };
  const P = lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, v: p.visibility == null ? 1 : p.visibility }));
  const seen = (i) => P[i] && P[i].v > 0.5;
  const nose = P[0], lS = P[11], rS = P[12], lW = P[15], rW = P[16], lH = P[23], rH = P[24], lK = P[25], rK = P[26];
  const sh = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 }, hip = { x: (lH.x + rH.x) / 2, y: (lH.y + rH.y) / 2 };
  const torso = Math.max(0.05, Math.abs(hip.y - sh.y));
  let pose = "standing";
  if (seen(15) && seen(16) && lW.y < nose.y && rW.y < nose.y) pose = "arms-up";
  else if (seen(15) && seen(16) && Math.abs(lW.y - lS.y) < torso * 0.35 && Math.abs(rW.y - rS.y) < torso * 0.35 && Math.abs(lW.x - rW.x) > Math.abs(lS.x - rS.x) * 2.2) pose = "t-pose";
  else if (seen(15) !== seen(16) || (seen(15) && lW.y < nose.y) || (seen(16) && rW.y < nose.y)) pose = (seen(15) && lW.y < nose.y) || (seen(16) && rW.y < nose.y) ? "one-arm-up" : "standing";
  if (seen(25) && seen(26) && seen(23) && seen(24) && ((lK.y + rK.y) / 2 - hip.y) < torso * 0.45) pose = "squat";
  const lean = Math.max(-1, Math.min(1, (sh.x - hip.x) / (torso * 0.6)));
  // a jump: the hips rise quickly compared with a moment ago
  const jump = !!(prev && prev.hipY != null && prev.hipY - hip.y > torso * 0.18);
  return { pose, jump, lean: r3(lean), x: r3(hip.x), y: r3(hip.y), hipY: hip.y, size: r3(torso), points: P.map((p) => [r3(p.x), r3(p.y), r3(p.z), r3(p.v)]) };
}
export async function startBody(onBody, opts) {
  const o = Object.assign({ fps: 15, video: null }, opts || {});
  const M = await poseModel();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } }, audio: false });
  const v = o.video || document.createElement("video"); v.playsInline = true; v.muted = true; v.srcObject = stream; await v.play().catch(() => {});
  let on = true, busy = false, prev = null, hipHist = [];
  M.onResults((r) => { const b = classifyPose(r.poseLandmarks, prev); if (b.hipY != null) { hipHist.push(b.hipY); if (hipHist.length > 6) hipHist.shift(); prev = { hipY: Math.max(...hipHist) }; } delete b.hipY; try { onBody(b); } catch (e) {} });
  const tick = async () => { if (!on) return; if (!busy && v.readyState >= 2) { busy = true; try { await M.send({ image: v }); } catch (e) {} busy = false; } setTimeout(tick, 1000 / o.fps); };
  tick();
  const stop = () => { if (!on) return; on = false; try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { v.srcObject = null; } catch (e) {} document.removeEventListener("visibilitychange", vis); };
  const vis = () => { if (document.visibilityState === "hidden") stop(); };
  document.addEventListener("visibilitychange", vis);
  return { stop, video: v };
}

// ── FACE ─────────────────────────────────────────────────────────────────────
let faceP = null;
export function faceModel() {
  if (!faceP) faceP = (async () => {
    await script(AI + "facemesh/face_mesh.js");
    const F = new window.FaceMesh({ locateFile: (f) => AI + "facemesh/" + f });
    F.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    await F.initialize(); return F;
  })().catch((e) => { faceP = null; throw e; });
  return faceP;
}
// the face points that matter for games and filters (Face Mesh numbering)
export const FACE_POINTS = { nose: 1, forehead: 10, chin: 152, leftEye: 33, rightEye: 263, leftEyeTop: 159, leftEyeBottom: 145, rightEyeTop: 386, rightEyeBottom: 374, mouthLeft: 61, mouthRight: 291, mouthTop: 13, mouthBottom: 14, leftCheek: 234, rightCheek: 454, leftBrow: 105, rightBrow: 334 };
export function describeFace(lm, mirror) {
  if (!lm || lm.length < 400) return { face: false };
  const M = (p) => ({ x: mirror ? 1 - p.x : p.x, y: p.y, z: p.z });
  const pt = {}; for (const [k, i] of Object.entries(FACE_POINTS)) { const p = M(lm[i]); pt[k] = [r3(p.x), r3(p.y)]; }
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const faceW = d(234, 454) || 0.1, faceH = d(10, 152) || 0.1;
  const mouthOpen = Math.max(0, Math.min(1, (d(13, 14) / faceH - 0.01) * 6));
  const smile = Math.max(0, Math.min(1, (d(61, 291) / faceW - 0.36) * 5));
  const blinkL = d(159, 145) / faceH < 0.025, blinkR = d(386, 374) / faceH < 0.025;
  const roll = Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x) * 180 / Math.PI;
  const yaw = ((lm[1].x - lm[234].x) / ((lm[454].x - lm[234].x) || 1) - 0.5) * 120 * (mirror ? -1 : 1);
  const pitch = ((lm[1].y - lm[10].y) / faceH - 0.5) * 120;
  return { face: true, points: pt, mouthOpen: r3(mouthOpen), smile: r3(smile), blink: blinkL && blinkR, wink: blinkL !== blinkR, yaw: Math.round(yaw), pitch: Math.round(pitch), roll: Math.round(mirror ? -roll : roll), width: r3(faceW) };
}
export async function startFace(onFace, opts) {
  const o = Object.assign({ fps: 15, video: null, mesh: false }, opts || {});
  const F = await faceModel();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } }, audio: false });
  const v = o.video || document.createElement("video"); v.playsInline = true; v.muted = true; v.srcObject = stream; await v.play().catch(() => {});
  let on = true, busy = false;
  F.onResults((r) => { const lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0]; const f = describeFace(lm, true); if (o.mesh && lm) f.mesh = lm.map((p) => [r3(1 - p.x), r3(p.y), r3(p.z)]); try { onFace(f); } catch (e) {} });
  const tick = async () => { if (!on) return; if (!busy && v.readyState >= 2) { busy = true; try { await F.send({ image: v }); } catch (e) {} busy = false; } setTimeout(tick, 1000 / o.fps); };
  tick();
  const stop = () => { if (!on) return; on = false; try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { v.srcObject = null; } catch (e) {} document.removeEventListener("visibilitychange", vis); };
  const vis = () => { if (document.visibilityState === "hidden") stop(); };
  document.addEventListener("visibilitychange", vis);
  return { stop, video: v };
}
// face landmarks for a still picture (for the picture editor's face filters)
export async function faceInPicture(imgEl) {
  const F = await faceModel();
  return new Promise((res) => { F.onResults((r) => { const lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0]; res(lm || null); }); F.send({ image: imgEl }).catch(() => res(null)); });
}
// draw an original filter onto a canvas that already holds the picture
export const FACE_FILTERS = { shades: "Sunglasses", crown: "Crown", blush: "Rosy cheeks", tache: "Moustache", hearts: "Heart eyes", cat: "Cat ears & whiskers" };
export function drawFaceFilter(ctx, lm, kind, W, H) {
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const le = P(33), re = P(263), nose = P(1), fh = P(10), chin = P(152), lc = P(234), rc = P(454), ml = P(61), mr = P(291), mt = P(13);
  const ang = Math.atan2(re.y - le.y, re.x - le.x), fw = Math.hypot(rc.x - lc.x, rc.y - lc.y), fhH = Math.hypot(chin.x - fh.x, chin.y - fh.y);
  const at = (p, f) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); f(); ctx.restore(); };
  const eyeMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 }, ew = Math.hypot(re.x - le.x, re.y - le.y);
  if (kind === "shades") at(eyeMid, () => { ctx.fillStyle = "rgba(15,15,20,.92)"; ctx.strokeStyle = "#111"; ctx.lineWidth = ew * 0.06;
    [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * ew * 0.52, 0, ew * 0.42, ew * 0.3, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.beginPath(); ctx.moveTo(-ew * 0.12, -ew * 0.05); ctx.quadraticCurveTo(0, -ew * 0.15, ew * 0.12, -ew * 0.05); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.35)"; [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * ew * 0.52 - ew * 0.15, -ew * 0.1, ew * 0.1, ew * 0.05, -0.5, 0, Math.PI * 2); ctx.fill(); }); });
  if (kind === "crown") at({ x: fh.x, y: fh.y - fhH * 0.12 }, () => { const w = fw * 0.75, h = fw * 0.32; ctx.fillStyle = "#f2c230"; ctx.strokeStyle = "#a87b00"; ctx.lineWidth = w * 0.02;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h); ctx.lineTo(-w / 4, -h * 0.45); ctx.lineTo(0, -h * 1.15); ctx.lineTo(w / 4, -h * 0.45); ctx.lineTo(w / 2, -h); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ["#e0245e", "#1da1f2", "#17bf63"].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((i - 1) * w / 4, -h * 0.25, w * 0.045, 0, Math.PI * 2); ctx.fill(); }); });
  if (kind === "blush") [P(205), P(425)].forEach((p) => { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, fw * 0.14); g.addColorStop(0, "rgba(255,90,120,.45)"); g.addColorStop(1, "rgba(255,90,120,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, fw * 0.14, 0, Math.PI * 2); ctx.fill(); });
  if (kind === "tache") at({ x: (nose.x + mt.x) / 2, y: (nose.y + mt.y) / 2 + fhH * 0.01 }, () => { const w = Math.hypot(mr.x - ml.x, mr.y - ml.y) * 1.25; ctx.fillStyle = "#3b2414";
    ctx.beginPath(); ctx.moveTo(0, -w * 0.05); ctx.bezierCurveTo(-w * 0.25, -w * 0.25, -w * 0.55, -w * 0.05, -w * 0.62, w * 0.12); ctx.bezierCurveTo(-w * 0.4, w * 0.05, -w * 0.2, w * 0.12, 0, w * 0.05);
    ctx.bezierCurveTo(w * 0.2, w * 0.12, w * 0.4, w * 0.05, w * 0.62, w * 0.12); ctx.bezierCurveTo(w * 0.55, -w * 0.05, w * 0.25, -w * 0.25, 0, -w * 0.05); ctx.fill(); });
  if (kind === "hearts") [le, re].forEach((p) => at(p, () => { const s = ew * 0.42; ctx.fillStyle = "#ff2d55"; ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35); ctx.fill(); }));
  if (kind === "cat") { at({ x: fh.x, y: fh.y - fhH * 0.02 }, () => { const w = fw * 0.42; [-1, 1].forEach((s) => { ctx.fillStyle = "#3a3a3a"; ctx.beginPath(); ctx.moveTo(s * w * 0.35, 0); ctx.lineTo(s * w * 1.05, -w * 0.95); ctx.lineTo(s * w * 1.15, w * 0.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f6a6b8"; ctx.beginPath(); ctx.moveTo(s * w * 0.55, -w * 0.05); ctx.lineTo(s * w * 1.0, -w * 0.65); ctx.lineTo(s * w * 1.04, -w * 0.05); ctx.closePath(); ctx.fill(); }); });
    at(nose, () => { ctx.strokeStyle = "rgba(30,30,30,.85)"; ctx.lineWidth = Math.max(1.5, fw * 0.008); [-1, 1].forEach((s) => [-0.08, 0, 0.08].forEach((dy) => { ctx.beginPath(); ctx.moveTo(s * fw * 0.08, fw * 0.05); ctx.lineTo(s * fw * 0.45, fw * 0.05 + dy * fw * 1.2); ctx.stroke(); }));
      ctx.fillStyle = "#f08aa0"; ctx.beginPath(); ctx.ellipse(0, 0, fw * 0.05, fw * 0.035, 0, 0, Math.PI * 2); ctx.fill(); }); }
}
