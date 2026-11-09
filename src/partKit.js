// ============================================================================
//  PART KIT - what the AI is told to turn a blueprint into a printable 3D part,
//  and the page that shows it (the solid modelling itself is partStudio.js).
// ============================================================================
export const PART_SYS = `You are Spine's mechanical designer. Turn the design into a PRINTABLE 3D part made of simple solids. Return ONLY JSON, no fence, no commentary:
{"name":"short name","material":"PLA|PETG|ABS|ASA|TPU","infill":20,"notes":"orientation on the bed, supports yes/no, layer height, any hardware (e.g. M3 x 10 screws)",
 "bodies":[{"name":"main part","color":"#d9dde3","items":[
   {"shape":"box","size":[x,y,z],"at":[x,y,z],"op":"add"},
   {"shape":"cylinder","d":10,"h":20,"axis":"z","at":[x,y,z],"op":"cut"}
 ]}]}
UNITS: millimetres. Axes: x is width, y is depth, z is up. The bed is z=0: the lowest solid must sit on z=0 ("at" is the CENTRE of each shape, so a 4 mm thick base plate sits at z=2).
SHAPES: box {size:[x,y,z]}; cylinder {d,h,axis:'x'|'y'|'z'}; cone {d1 (bottom),d2 (top),h,axis}; hex {d across corners,h,axis} (nut traps); sphere {d}; torus {d,tube}; wedge {size:[x,y,z]} (a ramp rising toward -y, for stands and gussets). Optional "rot":[rx,ry,rz] in degrees.
OPERATIONS: "add" joins solid; "cut" removes it (holes, slots, pockets, countersinks, cable channels). All adds in a body are joined first, then every cut is removed, so cuts must pass fully through or into the solid they cut (make holes 1 mm longer than the wall).
REAL DESIGN RULES: walls at least 1.6 mm (2.4 mm for load), screw clearance holes M3 = 3.4 mm, M4 = 4.5 mm, M5 = 5.5 mm; heat-set insert holes M3 = 4.0 mm; press-fit clearance 0.2 mm, sliding fit 0.4 mm; avoid overhangs beyond 45 degrees or say supports are needed in notes; fillets are not available, so add small wedges as gussets where strength is needed. Use the real dimensions from the design. If it has several separate printed pieces (a box and its lid), make each a separate body, placed side by side on the bed, not overlapping. Keep it under 40 items per body.
SIZES THE PERSON CAN CHANGE: add "params" with the 2 to 6 dimensions someone would most want to adjust, e.g. "params":{"width":{"value":80,"min":40,"max":200,"step":1,"unit":"mm","label":"Width"},"hole":{"value":3.4,"min":2,"max":8,"step":0.1,"unit":"mm","label":"Screw hole"}}. Then any number in an item may instead be a formula string using those names, e.g. "size":["width",70,5], "at":["width/2-6",15,2.5], "d":"hole". Keep formulas to + - * / and brackets.
HOW TO BUILD IT: add "assembly":["one short step per line - print orientation, inserts, screws, glue, finishing"] and "bom":[{"item":"M3 x 10 mm button-head screw","qty":2,"note":"into heat-set inserts"}] listing everything else needed (hardware, magnets, rubber feet, glue). Use [] when nothing else is needed.`;

export function parsePart(text){
  let t=String(text||"").replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
  const a=t.indexOf("{"), b=t.lastIndexOf("}"); if(a<0||b<a) return null;
  try{
    const p=JSON.parse(t.slice(a,b+1));
    if(p&&Array.isArray(p.parts)&&!p.bodies) p.bodies=[{name:p.name||"part",items:p.parts}];
    if(!p||!Array.isArray(p.bodies)||!p.bodies.length) return null;
    p.bodies=p.bodies.filter(bd=>bd&&Array.isArray(bd.items||bd.parts)&&(bd.items||bd.parts).length).slice(0,8);
    p.bodies.forEach(bd=>{ bd.items=(bd.items||bd.parts).slice(0,60).filter(s=>s&&typeof s==="object"); });
    // the adjustable sizes: sane numbers only
    const params={}; if(p.params&&typeof p.params==="object") for(const k of Object.keys(p.params).slice(0,8)){ if(!/^[A-Za-z_][A-Za-z0-9_]{0,24}$/.test(k)) continue; const q=p.params[k]||{}; const v=Number(q.value);
      if(!Number.isFinite(v)) continue; const mn=Number.isFinite(Number(q.min))?Number(q.min):v/2, mx=Number.isFinite(Number(q.max))?Number(q.max):v*2;
      params[k]={value:v,min:Math.min(mn,v),max:Math.max(mx,v),step:Number(q.step)>0?Number(q.step):(mx-mn>20?1:0.1),unit:String(q.unit||"mm").slice(0,8),label:String(q.label||k).slice(0,30)}; }
    p.params=params;
    p.assembly=Array.isArray(p.assembly)?p.assembly.map(x=>String(x).slice(0,300)).slice(0,20):[];
    p.bom=Array.isArray(p.bom)?p.bom.filter(x=>x&&x.item).map(x=>({item:String(x.item).slice(0,80),qty:Math.max(1,Math.min(999,parseInt(x.qty,10)||1)),note:String(x.note||"").slice(0,120)})).slice(0,30):[];
    return p.bodies.length?p:null;
  }catch(e){ return null; }
}

export const PART_STYLE = "html,body{margin:0;height:100%;background:#0d2c52;color:#fff;font-family:Manrope,system-ui,-apple-system,Helvetica,Arial,sans-serif;overflow:hidden}*{font-family:inherit}#stage{position:absolute;inset:0}#stage canvas{display:block}"
 +"#top{position:absolute;left:10px;right:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}#dims{font:700 12px 'JetBrains Mono',monospace;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 9px;margin-right:auto}"
 +"button{font:700 11px Manrope,system-ui,-apple-system,Helvetica,Arial,sans-serif;color:#fff;background:rgba(10,20,40,.55);border:1px solid rgba(255,255,255,.3);border-radius:9px;min-height:36px;padding:0 11px;cursor:pointer}button.on{background:#B8935A;color:#12100e}"
 +"#bot{position:absolute;left:10px;right:10px;bottom:10px;display:flex;gap:6px;flex-wrap:wrap}#bot .pri{background:#B8935A;color:#12100e;border:none}#msg{position:absolute;left:12px;bottom:56px;font:600 11px Manrope;text-shadow:0 1px 4px #000}"
 +"#report{position:absolute;right:10px;bottom:104px;width:min(320px,calc(100% - 20px));max-height:48%;overflow:auto;background:rgba(8,16,30,.88);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px 12px;font:500 11.5px/1.5 Manrope;display:none}#report.open{display:block}#report div{margin:3px 0}#report span{display:block;font:700 8.5px Manrope;letter-spacing:.12em;text-transform:uppercase;color:#9fc0e8}#report .g{color:#7ed4a8}#report .r{color:#ff9a8a}";
export const PART_BODY = '<div id="stage"></div><div id="top"><span id="dims">-</span><button id="bLook">Show as printed</button><button id="bApart">Pull apart</button><button id="bCut">Cut through</button><button id="bRep">Print check</button></div>'
 +'<div id="report"></div><div id="msg"></div><div id="bot"><button class="pri" id="b3mf">3MF for Bambu / Prusa / Orca</button><button class="pri" id="bStl">STL for any slicer</button><button id="bObj">OBJ</button><button id="bAr">See it in your room</button></div>';
