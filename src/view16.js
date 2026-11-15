// ═══════════════════════════════════════════════════════════════════════════════════════════
//  BATCH 16 - looking at things in 3D:
//  · "SEE IT IN YOUR ROOM" on any phone: <model-viewer> (Apache-2.0). iPhones get AR Quick Look (the
//    model is turned into USDZ on the phone), Android and headsets get WebXR. Served from /ai/.
//  · MOLECULES IN 3D: 3Dmol.js (BSD-3) shows a chemical (PubChem) or protein (Protein Data Bank),
//    spin it with a finger. The structure files come straight from those free public services.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const AI = "/ai/";
let mvP = null, dmP = null;
function loadModelViewer() {
  if (!mvP) mvP = new Promise((res, rej) => { if (window.customElements && customElements.get("model-viewer")) return res(); const s = document.createElement("script"); s.type = "module"; s.src = AI + "model-viewer/model-viewer.min.js"; s.onload = () => customElements.whenDefined("model-viewer").then(res); s.onerror = () => { mvP = null; rej(new Error("model-viewer missing")); }; document.head.appendChild(s); });
  return mvP;
}
function load3Dmol() {
  if (!dmP) dmP = new Promise((res, rej) => { if (window.$3Dmol) return res(window.$3Dmol); const s = document.createElement("script"); s.src = AI + "3dmol/3Dmol-min.js"; s.onload = () => res(window.$3Dmol); s.onerror = () => { dmP = null; rej(new Error("3Dmol missing")); }; document.head.appendChild(s); });
  return dmP;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function sheet(title, inner) {
  const box = document.createElement("div"); box.className = "v16-sheet"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", title);
  box.innerHTML = '<div class="v16-bar"><b>' + esc(title) + '</b><button type="button" class="v16-x" aria-label="Close">✕ Close</button></div><div class="v16-body">' + inner + "</div>";
  document.body.appendChild(box);
  const close = () => { try { box.remove(); } catch (e) {} };
  box.querySelector(".v16-x").onclick = close; return { box, close };
}
export async function openRoom(glb, name) {
  let url = null, own = false;
  if (glb instanceof ArrayBuffer || ArrayBuffer.isView(glb)) { const b = glb instanceof ArrayBuffer ? glb : glb.buffer; if (!b.byteLength || b.byteLength > 80 * 1024 * 1024) return { error: "That model is empty or too big." }; url = URL.createObjectURL(new Blob([b], { type: "model/gltf-binary" })); own = true; }
  else if (typeof glb === "string" && /^(data:model\/gltf-binary|data:application\/octet-stream|https:\/\/|blob:)/.test(glb)) url = glb;
  else return { error: "Give a GLB model (bytes, a data: address or an https address)." };
  try { await loadModelViewer(); } catch (e) { return { error: "The 3D viewer couldn't load." }; }
  const { box, close } = sheet(name || "See it in your room",
    '<model-viewer data-room src="' + esc(url) + '" alt="' + esc(name || "3D model") + '" ar ar-modes="webxr scene-viewer quick-look" ar-scale="auto" camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1" style="width:100%;height:100%;background:#f3f1ec">'
    + '<button slot="ar-button" class="v16-ar">See it in your room</button></model-viewer><div class="v16-note">Drag to turn it. On a phone, tap “See it in your room” and point the camera at the floor.</div>');
  const mv = box.querySelector("model-viewer");
  const x = box.querySelector(".v16-x"); x.onclick = () => { close(); if (own) setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const ok = await new Promise((res) => { const t = setTimeout(() => res(false), 20000); mv.addEventListener("load", () => { clearTimeout(t); res(true); }, { once: true }); mv.addEventListener("error", () => { clearTimeout(t); res(false); }, { once: true }); });
  return ok ? { ok: true, ar: !!mv.canActivateAR } : { error: "That model couldn't be shown." };
}
// show a molecule: {cid} or {name} (PubChem chemical), or {pdb:'4HHB'} (protein structure)
export async function openMolecule(o, lookup) {
  o = o || {}; let fmt = "sdf", url = null, title = "";
  try {
    if (o.pdb && /^[0-9][A-Za-z0-9]{3}$/.test(String(o.pdb))) { url = "https://files.rcsb.org/download/" + String(o.pdb).toUpperCase() + ".pdb"; fmt = "pdb"; title = "Protein " + String(o.pdb).toUpperCase(); }
    else {
      let cid = o.cid && /^\d{1,10}$/.test(String(o.cid)) ? String(o.cid) : null;
      if (!cid && o.name && lookup) { const r = await lookup("chemical", { q: String(o.name).slice(0, 80) }); cid = r && r.cid ? String(r.cid) : null; title = r && r.text ? String(o.name) : ""; }
      if (!cid && o.name && lookup) { const r = await lookup("pdb", { q: String(o.name).slice(0, 80) }); const id = r && r.structures && r.structures[0] && r.structures[0].id; if (id) return openMolecule({ pdb: id, title: (r.structures[0].title || "") }, lookup); }
      if (!cid) return { error: "That molecule wasn't found." };
      url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/" + cid + "/record/SDF?record_type=3d"; title = title || o.title || "Molecule " + cid;
    }
    const [$3Dmol, data] = await Promise.all([load3Dmol(), fetch(url).then((r) => { if (!r.ok) throw new Error("no 3D"); return r.text(); })]);
    const { box } = sheet(o.title || title, '<div data-molecule class="v16-mol"></div><div class="v16-note">Drag to turn, pinch to zoom. ' + (fmt === "pdb" ? "Structure from the Protein Data Bank (RCSB, CC0)." : "Structure from PubChem.") + "</div>");
    const v = $3Dmol.createViewer(box.querySelector("[data-molecule]"), { backgroundColor: "white" });
    v.addModel(data, fmt); v.setStyle({}, fmt === "pdb" ? { cartoon: { color: "spectrum" } } : { stick: { radius: 0.18 }, sphere: { scale: 0.28 } });
    v.zoomTo(); v.render(); v.spin("y", 0.4);
    return { ok: true, atoms: v.getModel().selectedAtoms({}).length };
  } catch (e) { return { error: "That molecule couldn't be shown in 3D (" + String(e && e.message || e).slice(0, 60) + ")." }; }
}
export const VIEW16_CSS = `
.v16-sheet{position:fixed;inset:0;z-index:9400;background:var(--bg,#fff);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);}
.v16-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--stone,#ddd);color:var(--ink,#111);font:600 15px Manrope,system-ui,sans-serif;}
.v16-x{border:1px solid var(--stone,#ddd);background:var(--panel,#fff);color:var(--ink,#111);border-radius:10px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;}
.v16-body{flex:1;min-height:0;display:flex;flex-direction:column;}.v16-body model-viewer{flex:1;min-height:0;}
.v16-mol{flex:1;min-height:300px;position:relative;}.v16-note{padding:8px 12px;font:13px Manrope,system-ui,sans-serif;color:var(--ink3,#666);}
.v16-ar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:12px 18px;border-radius:999px;border:none;background:#111;color:#fff;font:700 15px Manrope,system-ui,sans-serif;}
`;
