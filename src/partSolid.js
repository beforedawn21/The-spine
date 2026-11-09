// ============================================================================
//  SOLID MODELLING for the 3D blueprint, with Manifold (Apache-2.0) - the same
//  geometry kernel OpenSCAD now uses. Its whole point is that every result is
//  a closed, solid ("manifold") mesh, which is exactly what a 3D printer's
//  slicer needs. Loaded only when a blueprint is turned into a 3D part.
// ============================================================================
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";

let enginePromise=null;
export function engine(){
  if(!enginePromise) enginePromise=Module({locateFile:()=>wasmUrl}).then(w=>{ w.setup(); return w; });
  return enginePromise;
}

// Shapes are in millimetres, z up, "at" is the centre of the shape.
function shape(M,s){
  const { Manifold, CrossSection } = M;
  const k=String(s.shape||"box").toLowerCase(); const num=(v,d)=>{ const n=Number(v); return Number.isFinite(n)&&n>0?n:d; };
  let m; let axis=String(s.axis||"z").toLowerCase();
  const segs=(d)=>Math.max(24,Math.min(128,Math.round(d*2.2)));
  if(k==="cylinder"||k==="hole"||k==="rod"||k==="tube"){ const d=num(s.d,10); m=Manifold.cylinder(num(s.h,10),d/2,d/2,segs(d),true); }
  else if(k==="cone"||k==="frustum"||k==="countersink"){ const d1=num(s.d1||s.d,10), d2=Number(s.d2)>0?Number(s.d2):0; m=Manifold.cylinder(num(s.h,10),d1/2,d2/2,segs(d1),true); }
  else if(k==="hex"||k==="nut"){ const d=num(s.d,10); m=Manifold.cylinder(num(s.h,5),d/2,d/2,6,true); }
  else if(k==="sphere"||k==="ball"){ const d=num(s.d,10); m=Manifold.sphere(d/2,segs(d)); axis="z"; }
  else if(k==="torus"||k==="ring"){ const D=num(s.d,20), t=num(s.tube,3); const cs=CrossSection.circle(t/2,32).translate([D/2,0]); m=Manifold.revolve(cs,96); axis="z"; }
  else if(k==="wedge"||k==="ramp"){ const sz=Array.isArray(s.size)?s.size.map(v=>num(v,10)):[20,20,10]; const y=sz[1], z=sz[2];
    // the ramp's profile in (depth, height), high side toward -y, extruded across the width (x)
    const poly=[[z/2,-y/2],[z/2,y/2],[-z/2,-y/2]];
    m=Manifold.extrude(CrossSection.ofPolygons([poly],"NonZero"),sz[0],0,0,[1,1],true).rotate([0,90,0]); axis="z"; }
  else { const b=Array.isArray(s.size)?s.size.map(v=>num(v,10)):[10,10,10]; m=Manifold.cube([b[0],b[1],b[2]],true); axis="z"; }
  if(axis==="x") m=m.rotate([0,90,0]); else if(axis==="y") m=m.rotate([90,0,0]);
  const r=Array.isArray(s.rot)?s.rot:[0,0,0]; if(r.some(v=>Number(v))) m=m.rotate([Number(r[0])||0,Number(r[1])||0,Number(r[2])||0]);
  const at=Array.isArray(s.at)?s.at:[0,0,0]; m=m.translate([Number(at[0])||0,Number(at[1])||0,Number(at[2])||0]);
  return m;
}

// Every body: join the adds, then remove the cuts. Returns plain arrays the viewer can draw.
export async function solidify(spec){
  const M=await engine(); const { Manifold } = M;
  const out=[]; let minZ=Infinity;
  for(const bd of (spec&&spec.bodies)||[]){
    const items=(bd.items||bd.parts||[]); const adds=[], cuts=[];
    for(const s of items){ try{ (s.op==="cut"?cuts:adds).push(shape(M,s)); }catch(e){} }
    if(!adds.length) continue;
    let solid=Manifold.union(adds);
    if(cuts.length){ const c=Manifold.union(cuts); const r=solid.subtract(c); solid.delete(); c.delete(); solid=r; }
    adds.forEach(a=>{ try{ a.delete(); }catch(e){} }); cuts.forEach(a=>{ try{ a.delete(); }catch(e){} });
    if(solid.isEmpty()){ solid.delete(); continue; }
    const mesh=solid.getMesh(); const np=mesh.numProp, vp=mesh.vertProperties, tv=mesh.triVerts;
    const n=vp.length/np, pos=new Array(n*3);
    for(let i=0;i<n;i++){ pos[i*3]=+vp[i*np].toFixed(4); pos[i*3+1]=+vp[i*np+1].toFixed(4); pos[i*3+2]=+vp[i*np+2].toFixed(4); if(vp[i*np+2]<minZ) minZ=vp[i*np+2]; }
    out.push({name:String(bd.name||("Part "+(out.length+1))).slice(0,60),color:bd.color||null,pos,idx:Array.from(tv),volume:solid.volume(),status:String(solid.status&&solid.status().value!=null?solid.status().value:solid.status&&solid.status())});
    solid.delete();
  }
  // whatever was designed, it goes on the bed: lowest point at z = 0
  if(Number.isFinite(minZ)&&Math.abs(minZ)>1e-6) out.forEach(b=>{ for(let i=2;i<b.pos.length;i+=3) b.pos[i]=+(b.pos[i]-minZ).toFixed(4); });
  return {bodies:out};
}

// ── SIZES YOU CAN CHANGE. Formulas in the design ("width/2-6") are worked out from the slider values.
//    Only names, numbers, + - * / and brackets are allowed - nothing else is ever evaluated.
export function evalFormula(str,vals){
  const src=String(str).trim(); if(!/^[A-Za-z0-9_+\-*/(). ]+$/.test(src)) return NaN;
  let bad=false; const ex=src.replace(/[A-Za-z_][A-Za-z0-9_]*/g,(nm)=>{ if(Object.prototype.hasOwnProperty.call(vals,nm)) return "("+Number(vals[nm])+")"; bad=true; return "0"; });
  if(bad) return NaN; try{ const v=Function("\"use strict\";return ("+ex+");")(); return Number.isFinite(v)?v:NaN; }catch(e){ return NaN; }
}
export function resolvePart(part,values){
  const vals={}; const P=(part&&part.params)||{}; for(const k of Object.keys(P)) vals[k]=values&&Number.isFinite(Number(values[k]))?Number(values[k]):P[k].value;
  const fix=(v)=>{ if(typeof v==="string"){ const n=Number(v); if(v.trim()!==""&&Number.isFinite(n)) return n; const r=evalFormula(v,vals); return Number.isFinite(r)?r:0; } if(Array.isArray(v)) return v.map(fix); return v; };
  const out=JSON.parse(JSON.stringify(part||{}));
  (out.bodies||[]).forEach(bd=>{ (bd.items||[]).forEach(it=>{ for(const k of ["size","at","rot","d","h","d1","d2","tube"]) if(k in it) it[k]=fix(it[k]); }); });
  out.values=vals; return out;
}
