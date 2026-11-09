// ============================================================================
//  3D BLUEPRINT - a real, printable part from a written design.
//  Reads window.__part (shapes in millimetres, z up, sitting on the print bed),
//  joins and cuts them into watertight solids, shows them as a blueprint or as
//  printed plastic, checks they will print, and exports STL, 3MF and OBJ.
// ============================================================================
(function(){
  var SPEC=window.__part||{bodies:[]}; var THREE=window.THREE;
  var el=function(id){ return document.getElementById(id); };
  var renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  el("stage").appendChild(renderer.domElement); renderer.toneMapping=THREE.ACESFilmicToneMapping;
  var scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(38,1,1,20000);
  var hemi=new THREE.HemisphereLight(0xdbe8ff,0x223344,1.4); scene.add(hemi); var key=new THREE.DirectionalLight(0xffffff,2.6); key.position.set(300,500,400); scene.add(key); var fill=new THREE.DirectionalLight(0x9fc0ff,0.9); fill.position.set(-400,200,-300); scene.add(fill);
  // ── the solids arrive already built (Manifold, in the app): closed meshes in millimetres, z up.
  //    Print space (x, y, z-up) becomes three's space (x, z-up -> y, -y -> z).
  var bodies=[], group=new THREE.Group(); scene.add(group);
  var bpMat=new THREE.MeshStandardMaterial({color:0x8fb8e8,roughness:0.6,metalness:0.05,transparent:true,opacity:0.55,side:THREE.DoubleSide});
  var colours=["#d9dde3","#e8a33c","#4f8fd8","#5fb37a","#d85a5a"];
  var MESH=window.__partMesh||{bodies:[]};
  (MESH.bodies||[]).forEach(function(bd,i){ try{
    var P=bd.pos, n=P.length/3, arr=new Float32Array(P.length); for(var k=0;k<n;k++){ arr[k*3]=P[k*3]; arr[k*3+1]=P[k*3+2]; arr[k*3+2]=-P[k*3+1]; }
    var solid=new THREE.BufferGeometry(); solid.setAttribute("position",new THREE.BufferAttribute(arr,3)); solid.setIndex(bd.idx);
    var g=solid.toNonIndexed(); g.computeVertexNormals();                       // flat shading for display
    var realMat=new THREE.MeshStandardMaterial({color:new THREE.Color(bd.color||colours[i%colours.length]),roughness:0.55,metalness:0.0});
    var m=new THREE.Mesh(g,realMat); m.userData={name:bd.name||("Part "+(i+1)),real:realMat,solid:solid};
    var edges=new THREE.LineSegments(new THREE.EdgesGeometry(g,22),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.9})); m.add(edges); m.userData.edges=edges;
    group.add(m); bodies.push({mesh:m,spec:bd,home:new THREE.Vector3()}); }catch(e){ window.__partErr=String(e&&e.message||e); } });
  window.__bodies=bodies;
  // ── look: blueprint or printed plastic
  var grid=new THREE.GridHelper(400,40,0x6f9bd0,0x2c5584); grid.material.transparent=true; grid.material.opacity=0.5; scene.add(grid);
  var look="blueprint"; function setLook(l){ look=l; bodies.forEach(function(b){ b.mesh.material=l==="blueprint"?bpMat:b.mesh.userData.real; b.mesh.userData.edges.visible=l==="blueprint"; });
    scene.background=new THREE.Color(l==="blueprint"?"#0d2c52":"#16181d"); grid.visible=true; grid.material.opacity=l==="blueprint"?0.55:0.18; el("bLook").textContent=l==="blueprint"?"Show as printed":"Show as blueprint"; }
  // ── measurements of the whole thing
  var box=new THREE.Box3(); bodies.forEach(function(b){ box.expandByObject(b.mesh); }); if(box.isEmpty()) box.set(new THREE.Vector3(-10,0,-10),new THREE.Vector3(10,10,10));
  var size=box.getSize(new THREE.Vector3()), mid=box.getCenter(new THREE.Vector3());
  grid.position.y=box.min.y; var gs=Math.max(size.x,size.z)*2.2; grid.scale.setScalar(gs/400);
  function volumeOf(g){ var p=g.attributes.position, idx=g.index, v=0, a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(); var n=idx?idx.count:p.count;
    for(var i=0;i<n;i+=3){ a.fromBufferAttribute(p,idx?idx.getX(i):i); b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1); c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2); v+=a.dot(b.clone().cross(c))/6; } return Math.abs(v); }
  function watertight(g){ var w=g, idx=w.index; if(!idx) return {ok:false,open:-1}; var E={}, bad=0; for(var i=0;i<idx.count;i+=3){ var t=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)]; for(var k=0;k<3;k++){ var a=t[k], b=t[(k+1)%3]; var key=a<b?a+"_"+b:b+"_"+a; E[key]=(E[key]||0)+1; } }
    for(var e in E) if(E[e]!==2) bad++; return {ok:bad===0,open:bad,welded:w}; }
  var checks=bodies.map(function(b){ var wt=watertight(b.mesh.userData.solid); return {name:b.mesh.userData.name,volume:volumeOf(b.mesh.userData.solid),water:wt.ok,open:wt.open,welded:b.mesh.userData.solid}; });
  window.__partChecks=checks.map(function(c){ return {name:c.name,volume:c.volume,watertight:c.water,open:c.open}; });
  var vol=checks.reduce(function(s,c){ return s+c.volume; },0)/1000; // cm3
  var dims=[size.x,size.z,size.y]; // print x, y, z
  var thin=1e9; (SPEC.bodies||[]).forEach(function(bd){ (bd.items||bd.parts||[]).forEach(function(s){ if((s.op||"add")==="cut") return; var m=s.size?Math.min.apply(null,s.size):Math.min(s.d||1e9,s.h||1e9); if(m<thin) thin=m; }); });
  var printers=[["Bambu Lab A1 / P1S / X1",256,256,256],["Prusa MK4",250,210,220],["Creality Ender 3",220,220,250],["Prusa MINI / Bambu A1 mini",180,180,180]];
  var fits=printers.filter(function(pr){ var d=dims.slice().sort(function(a,b){return b-a;}), q=pr.slice(1).sort(function(a,b){return b-a;}); return d[0]<=q[0]&&d[1]<=q[1]&&d[2]<=q[2]; }).map(function(pr){ return pr[0]; });
  var mat=String(SPEC.material||"PLA").toUpperCase(); var dens={PLA:1.24,PETG:1.27,ABS:1.04,ASA:1.07,TPU:1.21,NYLON:1.14}[mat]||1.24; var infill=(SPEC.infill!=null?SPEC.infill:20)/100;
  // a part is roughly its shell plus its infill; good enough for a weight and a time estimate
  var area=0; checks.forEach(function(c){ var p=c.welded&&c.welded.attributes.position, idx=c.welded&&c.welded.index; if(!p||!idx) return; var a=new THREE.Vector3(),b=new THREE.Vector3(),cc=new THREE.Vector3(); for(var i=0;i<idx.count;i+=3){ a.fromBufferAttribute(p,idx.getX(i)); b.fromBufferAttribute(p,idx.getX(i+1)); cc.fromBufferAttribute(p,idx.getX(i+2)); area+=b.clone().sub(a).cross(cc.clone().sub(a)).length()/2; } });
  var shellCm3=Math.min(vol,area*1.2/1000), used=shellCm3+(vol-shellCm3)*infill, grams=used*dens, minutes=Math.max(4,used/0.45+(dims[2]/0.2)*0.02); // ~0.45 cm3 a minute is a typical real average for a modern printer at 0.2 mm layers, travel included
  window.__partReport={size:dims.map(function(d){ return +d.toFixed(2); }),volumeCm3:+vol.toFixed(2),grams:+grams.toFixed(1),minutes:Math.round(minutes),fits:fits,watertight:checks.every(function(c){ return c.water; }),thinnest:thin<1e8?thin:null,material:mat,infill:Math.round(infill*100)};
  var R=window.__partReport; var tick=function(b){ return b?"<b class=g>✓</b>":"<b class=r>✕</b>"; };
  el("report").innerHTML="<div><span>Size</span>"+R.size.map(function(d){ return d.toFixed(1); }).join(" × ")+" mm</div><div><span>Material</span>"+R.material+" · "+R.infill+"% infill</div><div><span>Uses about</span>"+R.grams+" g · ~"+(R.minutes>=60?Math.floor(R.minutes/60)+" h "+(R.minutes%60)+" min":R.minutes+" min")+"</div>"
    +"<div><span>Solid & closed</span>"+tick(R.watertight)+(R.watertight?" ready for any slicer":" needs repair in the slicer")+"</div><div><span>Fits</span>"+(R.fits.length?R.fits.join(", "):"<b class=r>too big for common printers - split it</b>")+"</div>"
    +(R.thinnest!=null&&R.thinnest<1.2?"<div><span>Watch out</span><b class=r>a wall is "+R.thinnest+" mm - thinner than 1.2 mm prints weakly</b></div>":"")+(SPEC.notes?"<div><span>Print tips</span>"+String(SPEC.notes).replace(/[<>]/g,"")+"</div>":"");
  el("dims").textContent=R.size.map(function(d){ return d.toFixed(1); }).join(" × ")+" mm";
  // ── camera: drag to turn, pinch or wheel to zoom
  var yaw=0.8, pitch=0.55, dist=Math.max(size.x,size.y,size.z)*2.4+30, target=mid.clone();
  function place(){ camera.position.set(target.x+dist*Math.cos(pitch)*Math.sin(yaw),target.y+dist*Math.sin(pitch),target.z+dist*Math.cos(pitch)*Math.cos(yaw)); camera.lookAt(target); }
  var c=renderer.domElement, drag=null, pinch=0; c.style.touchAction="none";
  c.addEventListener("pointerdown",function(e){ drag={x:e.clientX,y:e.clientY}; c.setPointerCapture(e.pointerId); spin=false; });
  c.addEventListener("pointermove",function(e){ if(!drag) return; yaw-=(e.clientX-drag.x)*0.008; pitch=Math.max(-1.4,Math.min(1.45,pitch+(e.clientY-drag.y)*0.006)); drag={x:e.clientX,y:e.clientY}; });
  c.addEventListener("pointerup",function(){ drag=null; }); c.addEventListener("wheel",function(e){ dist*=Math.exp(e.deltaY*0.001); e.preventDefault(); },{passive:false});
  c.addEventListener("touchmove",function(e){ if(e.touches.length===2){ var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); if(pinch) dist*=pinch/d; pinch=d; drag=null; } },{passive:true}); c.addEventListener("touchend",function(){ pinch=0; });
  var spin=true;
  // ── pull apart, and cut through
  var exploded=0; function explode(k){ exploded=k; bodies.forEach(function(b,i){ var bb=new THREE.Box3().setFromObject(b.mesh); var cc=bb.getCenter(new THREE.Vector3()).sub(b.mesh.position); var d=cc.sub(mid); if(d.length()<1e-3) d.set(0,i,0); b.mesh.position.copy(d.normalize().multiplyScalar(k*Math.max(size.x,size.y,size.z)*0.3)); }); }
  renderer.localClippingEnabled=true; var plane=new THREE.Plane(new THREE.Vector3(-1,0,0),1e5); function cut(on){ renderer.clippingPlanes=on?[plane]:[]; plane.constant=on?mid.x:1e5; window.__cutOn=on; el("bCut").classList.toggle("on",on); }
  // ── exports
  function trisPrint(){ var out=[]; bodies.forEach(function(b){ var g=b.mesh.geometry, p=g.attributes.position, idx=g.index, n=idx?idx.count:p.count; var m=b.mesh.matrixWorld; var v=new THREE.Vector3();
      for(var i=0;i<n;i++){ v.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(m); out.push(v.x,-v.z,v.y-box.min.y); } }); return out; }
  function stl(){ var t=trisPrint(), N=t.length/9, buf=new ArrayBuffer(84+N*50), dv=new DataView(buf); var head="The Spine 3D blueprint"; for(var k=0;k<80;k++) dv.setUint8(k,k<head.length?head.charCodeAt(k):32); dv.setUint32(80,N,true);
    for(var f=0;f<N;f++){ var o=84+f*50, q=f*9; var ux=t[q+3]-t[q],uy=t[q+4]-t[q+1],uz=t[q+5]-t[q+2],vx=t[q+6]-t[q],vy=t[q+7]-t[q+1],vz=t[q+8]-t[q+2]; var nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
      dv.setFloat32(o,nx/l,true); dv.setFloat32(o+4,ny/l,true); dv.setFloat32(o+8,nz/l,true); for(var j=0;j<9;j++) dv.setFloat32(o+12+j*4,t[q+j],true); dv.setUint16(o+48,0,true); } return new Uint8Array(buf); }
  function obj(){ var s="# The Spine 3D blueprint, millimetres, z up\n", base=1; checks.forEach(function(c,bi){ var w=c.welded; if(!w) return; var p=w.attributes.position, idx=w.index, m=bodies[bi].mesh.matrixWorld, v=new THREE.Vector3(); s+="o "+String(c.name).replace(/\s+/g,"_")+"\n";
      for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(m); s+="v "+v.x.toFixed(4)+" "+(-v.z).toFixed(4)+" "+(v.y-box.min.y).toFixed(4)+"\n"; } for(var k=0;k<idx.count;k+=3) s+="f "+(idx.getX(k)+base)+" "+(idx.getX(k+1)+base)+" "+(idx.getX(k+2)+base)+"\n"; base+=p.count; }); return new TextEncoder().encode(s); }
  // 3MF - the format Bambu Studio, PrusaSlicer, OrcaSlicer and Cura prefer: a small zip, written here
  var CRC=(function(){ var t=new Uint32Array(256); for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
  function crc32(u8){ var c=0xFFFFFFFF; for(var i=0;i<u8.length;i++) c=CRC[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
  function zip(files){ var parts=[], central=[], off=0, enc=new TextEncoder(); files.forEach(function(f){ var name=enc.encode(f.name), data=f.data, crc=crc32(data);
      var h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0,true); h.setUint16(8,0,true); h.setUint16(10,0,true); h.setUint16(12,0x21,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
      parts.push(new Uint8Array(h.buffer),name,data);
      var cd=new DataView(new ArrayBuffer(46)); cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0,true); cd.setUint16(10,0,true); cd.setUint16(12,0,true); cd.setUint16(14,0x21,true); cd.setUint32(16,crc,true); cd.setUint32(20,data.length,true); cd.setUint32(24,data.length,true); cd.setUint16(28,name.length,true); cd.setUint16(30,0,true); cd.setUint16(32,0,true); cd.setUint16(34,0,true); cd.setUint16(36,0,true); cd.setUint32(38,0,true); cd.setUint32(42,off,true);
      central.push(new Uint8Array(cd.buffer),name); off+=30+name.length+data.length; });
    var cdSize=central.reduce(function(s,a){ return s+a.length; },0); var end=new DataView(new ArrayBuffer(22)); end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true); end.setUint32(12,cdSize,true); end.setUint32(16,off,true);
    var all=parts.concat(central,[new Uint8Array(end.buffer)]), len=all.reduce(function(s,a){ return s+a.length; },0), out=new Uint8Array(len), p=0; all.forEach(function(a){ out.set(a,p); p+=a.length; }); return out; }
  function threeMF(){ var enc=new TextEncoder(); var objs="", items=""; checks.forEach(function(c,bi){ var w=c.welded; if(!w) return; var p=w.attributes.position, idx=w.index, m=bodies[bi].mesh.matrixWorld, v=new THREE.Vector3(), vs=[], ts=[];
      for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(m); vs.push('<vertex x="'+v.x.toFixed(4)+'" y="'+(-v.z).toFixed(4)+'" z="'+(v.y-box.min.y).toFixed(4)+'"/>'); }
      for(var k=0;k<idx.count;k+=3) ts.push('<triangle v1="'+idx.getX(k)+'" v2="'+idx.getX(k+1)+'" v3="'+idx.getX(k+2)+'"/>');
      objs+='<object id="'+(bi+1)+'" name="'+String(c.name).replace(/[<>&"]/g,"")+'" type="model"><mesh><vertices>'+vs.join("")+'</vertices><triangles>'+ts.join("")+'</triangles></mesh></object>'; items+='<item objectid="'+(bi+1)+'"/>'; });
    var model='<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">'+String(SPEC.name||"Part").replace(/[<>&]/g,"")+'</metadata><metadata name="Application">The Spine</metadata><resources>'+objs+'</resources><build>'+items+'</build></model>';
    return zip([{name:"[Content_Types].xml",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')},
      {name:"_rels/.rels",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')},
      {name:"3D/3dmodel.model",data:enc.encode(model)}]); }
  function send(u8,ext,type){ var name=String(SPEC.name||"spine-part").replace(/[^\w\- ]/g,"").slice(0,40)||"spine-part"; var s="", CH=0x8000; for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH));
    var msg=el("msg"); msg.textContent="Saving "+name+"."+ext+"..."; return (window.Spine&&window.Spine.export?window.Spine.export({name:name+"."+ext,type:type,base64:btoa(s)}):Promise.resolve(null)).then(function(r){ msg.textContent=r?("Saved "+name+"."+ext+" - open it in your slicer"):"Could not save the file here"; return r; }); }
  window.__partExport={stl:function(){ explode(0); return send(stl(),"stl","model/stl"); },"3mf":function(){ explode(0); return send(threeMF(),"3mf","model/3mf"); },obj:function(){ explode(0); return send(obj(),"obj","text/plain"); },raw:{stl:stl,threeMF:threeMF,obj:obj}};
  el("bStl").onclick=window.__partExport.stl; el("b3mf").onclick=window.__partExport["3mf"]; el("bObj").onclick=window.__partExport.obj;
  el("bLook").onclick=function(){ setLook(look==="blueprint"?"real":"blueprint"); }; el("bCut").onclick=function(){ cut(!window.__cutOn); };
  el("bApart").style.display=bodies.length>1?"":"none"; el("bApart").onclick=function(){ explode(exploded>0?0:1); };
  el("bAr").onclick=function(){ try{ if(window.Spine&&window.Spine.ar){ var g=group.clone(); g.scale.setScalar(0.001); window.Spine.ar(g); } }catch(e){} };
  el("bRep").onclick=function(){ var o=el("report").classList.toggle("open"); el("bRep").classList.toggle("on",o); };
  if(window.innerWidth>=560){ el("report").classList.add("open"); el("bRep").classList.add("on"); }
  window.__partExplode=explode; window.__partCut=cut; window.__partLook=setLook;
  function resize(){ var w=el("stage").clientWidth, h=el("stage").clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); } window.addEventListener("resize",resize); resize(); setLook("blueprint");
  (function loop(){ requestAnimationFrame(loop); if(spin&&!drag) yaw+=0.004; place(); renderer.render(scene,camera); })();
  if(!bodies.length) el("msg").textContent=window.__partErr?("The model could not be built: "+window.__partErr):"No solid parts in this design.";
  window.__partReady=true;
})();
