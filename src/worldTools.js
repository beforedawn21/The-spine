// ============================================================================
//  WORLD TOOLS - in every world, for every kind of person.
//  A preschooler taps things and hears their names. A student takes a quiz.
//  A teacher runs a guided lesson. An engineer measures, cuts it open, pulls
//  it apart, X-rays it and downloads the model. Anyone with a headset walks
//  around inside it with the thumbsticks.
//  Added to the world's More menu; costs nothing until it is used.
// ============================================================================
(function(){
  var W=window.SpineWorld; if(!W||W._tools) return; W._tools=true;
  var T=function(){ return window.THREE; };
  var CSS=".wt-panel{position:fixed;left:10px;right:10px;bottom:12px;z-index:30;max-height:72vh;overflow:auto;-webkit-overflow-scrolling:touch;background:rgba(14,16,22,.92);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:12px;font:500 12px Manrope,sans-serif;color:#fff;max-width:520px;margin:0 auto;backdrop-filter:blur(8px)}"
    +".wt-panel h5{margin:0 0 6px;font:700 9px Manrope;letter-spacing:.14em;text-transform:uppercase;color:#e8c98a}.wt-panel p{margin:4px 0;line-height:1.5}.wt-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}"
    +".wt-panel button{font-family:Manrope,system-ui,sans-serif!important;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font:700 11.5px Manrope;padding:0 12px}.wt-panel button.pri{background:#B8935A;color:#12100e;border:none}"
    +".wt-panel input[type=range]{width:100%}.wt-read{position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:30;background:rgba(8,10,14,.82);border:1px solid rgba(232,201,138,.5);border-radius:10px;padding:6px 12px;font:800 15px 'JetBrains Mono',monospace;color:#e8c98a;pointer-events:none}"
    +".wt-q{margin:8px 0}.wt-q b{display:block;margin-bottom:5px}.wt-q button{display:block;width:100%;text-align:left;margin:4px 0}.wt-q button.right{background:rgba(90,200,140,.35)}.wt-q button.wrong{background:rgba(220,80,80,.35)}";
  var st=document.createElement("style"); st.textContent=CSS; document.head.appendChild(st);
  function panel(title,html){ close(); var p=document.createElement("div"); p.className="wt-panel"; p.id="__wtp"; p.innerHTML="<h5>"+title+"</h5>"+html+"<div class='wt-row'><button data-x>Done</button></div>"; document.body.appendChild(p);
    p.querySelector("[data-x]").onclick=function(){ close(); }; return p; }
  function close(){ var p=document.getElementById("__wtp"); if(p){ if(p._off) try{ p._off(); }catch(e){} p.remove(); } var r=document.getElementById("__wtr"); if(r) r.remove(); }
  function meshes(){ var out=[]; W.scene.traverse(function(o){ if((o.isMesh||o.isInstancedMesh)&&o.visible&&!(o.userData&&o.userData.noFrame)&&!o.userData.__wt) out.push(o); }); return out; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function labels(){ var L=[]; try{ (W._labels||[]).forEach(function(l){ if(l.el&&l.el.textContent) L.push(l.el.textContent); }); }catch(e){} W.scene.traverse(function(o){ var n=o.userData&&(o.userData.label||o.userData.name); if(n) L.push(String(n)); }); return L.filter(function(x,i,a){ return a.indexOf(x)===i; }).slice(0,40); }
  // who is watching - changes how things are explained
  W.audience=W.audience||(window.__spineAudience||"everyone");
  var AUD={kids:"a curious five-year-old: very short sentences, everyday words, one fun fact, warm and playful",students:"a school student: clear, accurate, one key idea and why it matters",teachers:"a teacher planning a lesson: accurate, with the key concept, a common misconception, and a question to ask the class",experts:"an engineer or specialist: precise, technical, with real figures, units and mechanisms",everyone:"a curious adult: clear and engaging, a couple of real details"};

  // ── MEASURE: tap two points, read the distance
  W.measure=function(){
    var t=T(), pts=[], marks=[], line=null; var p=panel("Measure","<p>Tap two points on the world. The distance shows at the top.</p>");
    var rd=document.createElement("div"); rd.className="wt-read"; rd.id="__wtr"; rd.textContent="Tap the first point"; document.body.appendChild(rd);
    var ray=new t.Raycaster(), v=new t.Vector2();
    var tap=function(e){ var c=W.renderer.domElement, r=c.getBoundingClientRect(), pt=e.changedTouches?e.changedTouches[0]:e; v.x=((pt.clientX-r.left)/r.width)*2-1; v.y=-((pt.clientY-r.top)/r.height)*2+1;
      W.camera.updateMatrixWorld(); ray.setFromCamera(v,W.camera); var hit=ray.intersectObjects(meshes(),true)[0]; if(!hit) return;
      if(pts.length>=2){ pts=[]; marks.forEach(function(m){ W.scene.remove(m); }); marks=[]; if(line){ W.scene.remove(line); line=null; } }
      pts.push(hit.point.clone()); var m=new t.Mesh(new t.SphereGeometry(0.04,12,10),new t.MeshBasicMaterial({color:0xe8c98a,depthTest:false})); m.renderOrder=999; m.userData.__wt=true; m.position.copy(hit.point); W.scene.add(m); marks.push(m);
      if(pts.length===2){ var g=new t.BufferGeometry().setFromPoints(pts); line=new t.Line(g,new t.LineBasicMaterial({color:0xe8c98a,depthTest:false})); line.renderOrder=999; line.userData.__wt=true; W.scene.add(line);
        var d=pts[0].distanceTo(pts[1]); W._lastMeasure=d; rd.textContent=(d<1?(d*100).toFixed(1)+" cm":d.toFixed(2)+" m")+"  ·  "+(d*3.28084).toFixed(2)+" ft"; }
      else rd.textContent="Now tap the second point"; };
    var c=W.renderer.domElement; c.addEventListener("click",tap); c.addEventListener("touchend",tap);
    p._off=function(){ c.removeEventListener("click",tap); c.removeEventListener("touchend",tap); marks.forEach(function(m){ W.scene.remove(m); }); if(line) W.scene.remove(line); };
    W._measureTap=function(x,y){ tap({clientX:x,clientY:y}); };
    return p;
  };
  // ── CUT IT OPEN: a slicing plane that moves through the world
  W.section=function(){
    var t=T(); W.renderer.localClippingEnabled=true; var b=new t.Box3(); meshes().forEach(function(m){ try{ b.expandByObject(m); }catch(e){} });
    var axis="x"; var plane=new t.Plane(new t.Vector3(-1,0,0),b.max.x); W.renderer.clippingPlanes=[plane];
    var p=panel("Cut it open","<p>Slide to cut through it and see inside.</p><input type=range min=0 max=1000 value=1000 id=__wts><div class='wt-row'><button data-a=x>Side</button><button data-a=y>Top</button><button data-a=z>Front</button></div>");
    var set=function(k){ var lo=b.min[axis], hi=b.max[axis]; var pos=lo+(hi-lo)*k; var n=new t.Vector3(axis==="x"?-1:0,axis==="y"?-1:0,axis==="z"?-1:0); plane.set(n,pos); W._sectionAt=pos; };
    p.querySelector("#__wts").oninput=function(e){ set(e.target.value/1000); };
    p.querySelectorAll("[data-a]").forEach(function(btn){ btn.onclick=function(){ axis=btn.getAttribute("data-a"); set(p.querySelector("#__wts").value/1000); }; });
    p._off=function(){ W.renderer.clippingPlanes=[]; }; W._sectionSet=set; set(1); return p;
  };
  // ── X-RAY: see through every surface
  W.xray=function(on){ var was=!!W._xrayOn; on=on==null?!was:!!on; W._xrayOn=on;
    meshes().forEach(function(m){ var mats=Array.isArray(m.material)?m.material:[m.material]; mats.forEach(function(mt){ if(!mt) return;
      if(on){ if(mt.userData.__x==null) mt.userData.__x={o:mt.opacity,t:mt.transparent,w:mt.wireframe,d:mt.depthWrite}; mt.transparent=true; mt.opacity=0.28; mt.depthWrite=false; }
      else if(mt.userData.__x){ var s=mt.userData.__x; mt.opacity=s.o; mt.transparent=s.t; mt.depthWrite=s.d; mt.userData.__x=null; } mt.needsUpdate=true; }); }); return on; };
  // ── PULL IT APART: every part moves out from the middle
  W.explode=function(){ var t=T(); var b=new t.Box3(); var parts=[]; W.scene.children.forEach(function(o){ if(o.isLight||o.isCamera||(o.userData&&o.userData.noFrame)||o.userData.__wt) return; try{ var bb=new t.Box3().setFromObject(o); if(bb.isEmpty()) return; b.union(bb); parts.push({o:o,home:o.position.clone(),c:bb.getCenter(new t.Vector3())}); }catch(e){} });
    var mid=b.getCenter(new t.Vector3()); var p=panel("Pull it apart","<p>Slide to separate the parts and see how it fits together.</p><input type=range min=0 max=1000 value=0 id=__wte>");
    var set=function(k){ parts.forEach(function(q){ var d=q.c.clone().sub(mid); q.o.position.copy(q.home).addScaledVector(d,k*1.2); }); };
    p.querySelector("#__wte").oninput=function(e){ set(e.target.value/1000); }; p._off=function(){ set(0); }; W._explodeSet=set; W._explodeParts=parts.length; return p; };
  // ── QUIZ ME, at the right level for whoever is watching
  W.quiz=function(){ var p=panel("Quiz","<p>Writing questions about this world...</p>");
    if(!window.Spine||!window.Spine.json){ p.querySelector("p").textContent="Quizzes need The Spine."; return p; }
    var topic=(document.title||"this place")+". Things in it: "+labels().join(", ");
    window.Spine.json("Write a 4-question multiple-choice quiz about: "+topic+". Pitch it for "+AUD[W.audience||"everyone"]+". Each question has 3 options and exactly one is correct. Be factually accurate.",{questions:[{q:"",options:["","",""],answer:0,why:""}]}).then(function(r){
      var qs=r&&r.questions; if(!qs||!qs.length){ p.querySelector("p").textContent="Could not write a quiz just now."; return; } var score=0, done=0;
      p.querySelector("p").outerHTML=qs.map(function(q,i){ return "<div class='wt-q' data-q='"+i+"'><b>"+(i+1)+". "+esc(q.q)+"</b>"+(q.options||[]).map(function(o,j){ return "<button data-o='"+j+"'>"+esc(o)+"</button>"; }).join("")+"<p class='why' style='display:none'></p></div>"; }).join("")+"<p id='__wtscore'></p>";
      p.querySelectorAll(".wt-q").forEach(function(qe){ var q=qs[+qe.getAttribute("data-q")]; qe.querySelectorAll("[data-o]").forEach(function(btn){ btn.onclick=function(){ if(qe._done) return; qe._done=true; done++; var j=+btn.getAttribute("data-o"), right=j===Number(q.answer);
        if(right) score++; btn.classList.add(right?"right":"wrong"); var c=qe.querySelectorAll("[data-o]")[Number(q.answer)]; if(c) c.classList.add("right"); var w=qe.querySelector(".why"); w.style.display="block"; w.textContent=q.why||"";
        if(done===qs.length){ p.querySelector("#__wtscore").textContent="You got "+score+" of "+qs.length+(score===qs.length?" - perfect!":"."); try{ window.Spine.emit&&window.Spine.emit("quiz",{world:document.title,score:score,of:qs.length}); }catch(e){} } }; }); }); }); return p; };
  // ── EXPLAIN WHAT I'M LOOKING AT
  W.explain=function(){ var p=panel("What am I looking at?","<p>Thinking...</p>"); var t=T(); var ray=new t.Raycaster(); ray.setFromCamera(new t.Vector2(0,0),W.camera); var hit=ray.intersectObjects(meshes(),true)[0];
    var name=""; var o=hit&&hit.object; while(o&&!name){ name=(o.userData&&(o.userData.label||o.userData.name))||o.name||""; o=o.parent; }
    var ask="In this 3D world called '"+(document.title||"a world")+"', the person is looking at "+(name?"'"+name+"'":"the middle of the view")+". Nearby labels: "+labels().slice(0,12).join(", ")+". Explain what they are looking at for "+AUD[W.audience||"everyone"]+". Three sentences at most.";
    var go=window.Spine&&(window.Spine.ask||window.Spine.fast); if(!go){ p.querySelector("p").textContent=name||"Nothing named here."; return p; }
    Promise.resolve(window.Spine.ask(ask)).then(function(r){ var tx=typeof r==="string"?r:(r&&r.text)||name||"Nothing named here."; p.querySelector("p").textContent=tx; try{ if(!W._muted) W.say?W.say(tx):window.Spine.speak(tx); }catch(e){} }); return p; };
  // ── GUIDED STOPS: fly the camera to a spot, look at something, say something
  W.visit=function(at,look,say,seconds){ try{ var t=T(); var to=new t.Vector3(at[0],at[1],at[2]); var tmp=new t.PerspectiveCamera(); tmp.position.copy(to); if(look) tmp.lookAt(new t.Vector3(look[0],look[1],look[2]));
      W._fly={from:W.camera.position.clone(),to:to,fq:W.camera.quaternion.clone(),tq:tmp.quaternion.clone(),t:0,dur:Math.max(0.3,seconds||1.8)}; W._touched=true;
      var e=new t.Euler().setFromQuaternion(tmp.quaternion,"YXZ"); setTimeout(function(){ W._yaw=e.y; W._pitch=e.x; },(seconds||1.8)*1000); if(say&&W.say) W.say(say); }catch(e){} return W; };
  // a whole lesson or tour: [{at:[x,y,z],look:[x,y,z],say:'...'}], one after another, paced by the words
  W.lesson=function(stops,onDone){ var i=0; W._lessonOn=true; var next=function(){ if(!W._lessonOn) return; if(i>=stops.length){ W._lessonOn=false; if(onDone) try{ onDone(); }catch(e){} return; } var s=stops[i++]; W.visit(s.at,s.look,s.say,s.seconds);
      setTimeout(next,Math.max(3500,String(s.say||"").length*65+1800)); }; next(); return {stop:function(){ W._lessonOn=false; }}; };
  W.setAudience=function(a){ if(AUD[a]) W.audience=a; return W.audience; };
  // ── DOWNLOAD THE MODEL: GLB for any 3D app, STL for a 3D printer, USDZ for iPhone AR
  W.stl=function(){ var t=T(); var tris=[]; W.scene.updateMatrixWorld(true); meshes().forEach(function(m){ if(m.isInstancedMesh) return; var g=m.geometry; if(!g||!g.attributes||!g.attributes.position) return; var pos=g.attributes.position, idx=g.index, a=new t.Vector3(), b=new t.Vector3(), c=new t.Vector3();
      var n=idx?idx.count:pos.count; for(var i=0;i<n;i+=3){ var i0=idx?idx.getX(i):i, i1=idx?idx.getX(i+1):i+1, i2=idx?idx.getX(i+2):i+2; a.fromBufferAttribute(pos,i0).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos,i1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos,i2).applyMatrix4(m.matrixWorld); tris.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z); } });
    var N=tris.length/9, buf=new ArrayBuffer(84+N*50), dv=new DataView(buf); for(var k=0;k<80;k++) dv.setUint8(k,32); dv.setUint32(80,N,true);
    for(var f=0;f<N;f++){ var o=84+f*50, q=f*9; // metres -> millimetres, and y-up -> z-up for printers
      var P=function(j){ return [tris[q+j*3]*1000,-tris[q+j*3+2]*1000,tris[q+j*3+1]*1000]; }; var A=P(0),B=P(1),C=P(2); var ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2]; var nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
      dv.setFloat32(o,nx/l,true); dv.setFloat32(o+4,ny/l,true); dv.setFloat32(o+8,nz/l,true); [A,B,C].forEach(function(V,vi){ dv.setFloat32(o+12+vi*12,V[0],true); dv.setFloat32(o+16+vi*12,V[1],true); dv.setFloat32(o+20+vi*12,V[2],true); }); dv.setUint16(o+48,0,true); }
    return {bytes:buf,triangles:N}; };
  function send(name,type,buf){ try{ if(window.Spine&&window.Spine.export){ var u8=new Uint8Array(buf), s="", CH=0x8000; for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH)); return window.Spine.export({name:name,type:type,base64:btoa(s)}); } }catch(e){} return Promise.resolve(null); }
  W.download=function(fmt){ var name=String(document.title||"spine-world").replace(/[^\w\- ]/g,"").slice(0,40)||"spine-world";
    if(fmt==="stl"){ var r=W.stl(); return send(name+".stl","model/stl",r.bytes); }
    if(fmt==="usdz"){ return window.Spine&&window.Spine.ar?window.Spine.ar(W.scene):Promise.resolve(null); }
    return new Promise(function(res){ var go=function(){ try{ new (T().GLTFExporter)().parse(W.scene,function(glb){ send(name+".glb","model/gltf-binary",glb).then(res); },function(){ res(null); },{binary:true,onlyVisible:true}); }catch(e){ res(null); } };
      if(T().GLTFExporter) go(); else { var sc=document.createElement("script"); sc.src=(window.__spineOrigin||(location.ancestorOrigins&&location.ancestorOrigins[0])||"")+"/three-ar.js"; sc.onload=go; sc.onerror=function(){ res(null); }; document.head.appendChild(sc); } }); };

  // ════════════════════════════════════════════════════════════════════════
  //  HEADSETS. Entering VR used to be a button that called nothing. Now: a
  //  proper session, a body to move (the camera rides a dolly, which is how
  //  WebXR lets you travel), left stick to walk, right stick to snap-turn,
  //  trigger to walk forward, and the floor where your real floor is.
  // ════════════════════════════════════════════════════════════════════════
  W._enterXR=function(mode){
    try{ if(!navigator.xr||!W.renderer) return Promise.resolve(false); if(W._xrSession){ try{ W._xrSession.end(); }catch(e){} return Promise.resolve(false); }
      W.renderer.xr.enabled=true; try{ W.renderer.xr.setReferenceSpaceType("local-floor"); }catch(e){}
      return navigator.xr.requestSession(mode||"immersive-vr",{optionalFeatures:["local-floor","bounded-floor","hand-tracking","layers"]}).then(function(sess){
        W._xrSession=sess; W._xrRig(); W.renderer.xr.setSession(sess); try{ document.body.classList.add("in-xr"); }catch(e){} var sh=document.getElementById("__sheet"); if(sh) sh.remove();
        sess.addEventListener("end",function(){ W._xrSession=null; try{ document.body.classList.remove("in-xr"); }catch(e){} W._xrUnrig(); });
        // LOOK AND PINCH (batch 14). On Apple Vision Pro (and any headset with "transient-pointer"
        // input) a pinch arrives as a session select: look at the floor and pinch to go there,
        // look at something named and pinch to hear what it is.
        sess.addEventListener("select",function(ev){ try{ var src=ev.inputSource; if(!src||src.targetRayMode!=="transient-pointer") return;
          var rs=W.renderer.xr.getReferenceSpace(); var pose=ev.frame&&rs?ev.frame.getPose(src.targetRaySpace,rs):null; if(!pose) return;
          var t=T(), m=new t.Matrix4().fromArray(pose.transform.matrix); if(W._dolly){ W._dolly.updateMatrixWorld(true); m.premultiply(W._dolly.matrixWorld); }
          var o=new t.Vector3().setFromMatrixPosition(m), d=new t.Vector3(0,0,-1).transformDirection(m); W._xrPinchAt(o,d); }catch(e){} });
        return true; }).catch(function(){ return false; });
    }catch(e){ return Promise.resolve(false); } };
  W._xrRig=function(){ var t=T(); if(W._dolly) return; var d=new t.Group(); d.name="__dolly"; d.userData.__wt=true; d.userData.noFrame=true;
    d.position.set(W.camera.position.x,0,W.camera.position.z); var e=new t.Euler().setFromQuaternion(W.camera.quaternion,"YXZ"); d.rotation.y=e.y;
    W.scene.add(d); d.add(W.camera); W.camera.position.set(0,0,0); W.camera.rotation.set(0,0,0); W._dolly=d; W._snapReady=true;
    try{ for(var i=0;i<2;i++){ var c=W.renderer.xr.getController(i); c.addEventListener("selectstart",function(){ W._xrFwd=true; }); c.addEventListener("selectend",function(){ W._xrFwd=false; }); d.add(c);
      var ray=new t.Line(new t.BufferGeometry().setFromPoints([new t.Vector3(),new t.Vector3(0,0,-1)]),new t.LineBasicMaterial({color:0xe8c98a})); ray.scale.z=4; c.add(ray); } }catch(e){} };
  W._xrPinchAt=function(origin,dir){ var t=T(); var rc=new t.Raycaster(origin,dir.clone().normalize(),0.05,60); var hits=rc.intersectObjects(meshes(),false); var h=hits[0]; if(!h) return null;
    var lab=null; for(var o=h.object;o&&!lab;o=o.parent) lab=o.userData&&(o.userData.label||o.userData.name)||null;
    var n=h.face&&h.face.normal?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;
    if(n&&n.y>0.7&&W._dolly){ W._dolly.position.x=h.point.x; W._dolly.position.z=h.point.z; W._dolly.position.y=h.point.y; return {moved:true,x:h.point.x,z:h.point.z}; }
    if(lab){ W.toast&&W.toast(String(lab)); try{ window.Spine&&window.Spine.speak&&window.Spine.speak(String(lab)); }catch(e){} return {label:String(lab)}; }
    return {hit:true}; };
  W._xrUnrig=function(){ var d=W._dolly; if(!d) return; var p=new (T().Vector3)(); W.camera.getWorldPosition(p); d.remove(W.camera); W.scene.remove(d); W.camera.position.copy(p); W._dolly=null; };
  W._xrMove=function(dt){ var s=W._xrSession, d=W._dolly; if(!s||!d) return; var lx=0,ly=0,rx=0;
    try{ for(var i=0;i<s.inputSources.length;i++){ var src=s.inputSources[i], g=src.gamepad; if(!g||!g.axes) continue; var ax=g.axes.length>=4?2:0;
      if(src.handedness==="left"){ lx=g.axes[ax]||0; ly=g.axes[ax+1]||0; } else if(src.handedness==="right"){ rx=g.axes[ax]||0; } } }catch(e){}
    if(W._xrFwd) ly=-1;
    var cam=W.renderer.xr.getCamera(), q=new (T().Quaternion)(); cam.getWorldQuaternion(q); var f=new (T().Vector3)(0,0,-1).applyQuaternion(q), r=new (T().Vector3)(1,0,0).applyQuaternion(q); f.y=0; r.y=0; f.normalize(); r.normalize();
    var sp=(W._speed||2.0)*dt; if(Math.abs(ly)>0.15) d.position.addScaledVector(f,-ly*sp); if(Math.abs(lx)>0.15) d.position.addScaledVector(r,lx*sp);
    if(Math.abs(rx)>0.6&&W._snapReady){ d.rotation.y-=Math.sign(rx)*Math.PI/6; W._snapReady=false; } else if(Math.abs(rx)<0.3) W._snapReady=true; };
  // the world's own loop calls every onFrame - this rides along and only does anything in a headset
  W.onFrame&&W.onFrame(function(t,dt){ try{ if(W._xrSession) W._xrMove(dt||0.016); }catch(e){} });
  // keep the older bar buttons using the same entry
  var _init=W._initXR; W._initXR=function(){ try{ _init&&_init.call(W); }catch(e){} };

  // ════════════════════════════════════════════════════════════════════════
  //  VISIT WITH FRIENDS (batch 13). Share a four-letter code; everyone in the
  //  room sees everyone else as a figure with their name, can bring the group
  //  to where they stand, and the host's guided lesson moves the whole class.
  // ════════════════════════════════════════════════════════════════════════
  if(!W.toast) W.toast=function(msg){ try{ var d=document.createElement("div"); d.style.cssText="position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:40;background:rgba(14,16,22,.92);color:#fff;border:1px solid rgba(232,201,138,.5);border-radius:999px;padding:8px 14px;font:600 12px Manrope,sans-serif;pointer-events:none"; d.textContent=String(msg); document.body.appendChild(d); setTimeout(function(){ d.remove(); },2600); }catch(e){} };
  // ════════════════════════════════════════════════════════════════════════
  //  TALK WHILE YOU VISIT (batch 14). Live voice between everyone in a room,
  //  phone to phone (WebRTC). The room only carries the hand-shake; the voices go
  //  directly between phones. Works for world visits and adventure co-op alike.
  //  Free STUN only (no relay server), so a few strict mobile networks can't connect.
  // ════════════════════════════════════════════════════════════════════════
  W.voiceChat=function(room,meId,onChange){
    // The world can't open a microphone (browsers forbid it in a locked frame), so The Spine
    // holds the voice line; this is the world's remote control for it. Everyone in the room
    // hears from the start; Talk switches only your own microphone.
    var S=window.Spine, name=room&&room.name, V={on:false,me:meId,_live:0,_hearing:0,pcs:{}}, timer=null;
    var changed=function(){ try{ onChange&&onChange(V); }catch(e){} };
    var take=function(r){ if(!r) return; var was=V.on+"|"+V._live+"|"+V._hearing; V.on=!!r.on; V._live=r.live||0; V._hearing=r.hearing||0; if(was!==V.on+"|"+V._live+"|"+V._hearing) changed(); };
    var poll=function(){ if(timer) return; timer=setInterval(function(){ if(!S||!S.talk) return; S.talk({op:"listen",room:name,me:V.me}).then(take); },1000); };
    V.listen=function(){ if(!S||!S.talk||!name) return Promise.resolve(false); poll(); return S.talk({op:"listen",room:name,me:V.me}).then(function(r){ take(r); return true; }); };
    V.start=function(peers){ if(!S||!S.talk||!name) return Promise.resolve(false); poll(); return S.talk({op:"start",room:name,me:V.me,peers:peers||[]}).then(function(r){ if(r&&r.error&&W.toast) W.toast(r.error); take(r); return V.on; }); };
    V.stop=function(){ V.on=false; if(S&&S.talk&&name) S.talk({op:"stop",room:name}).then(take); changed(); };
    V.close=function(){ clearInterval(timer); timer=null; V.on=false; V._live=0; if(S&&S.talk&&name) S.talk({op:"end",room:name}); };
    V.onMsg=function(){ return true; };
    V.link=function(id){ if(S&&S.talk) S.talk({op:"peer",room:name,id:id}); };
    V.drop=function(id){ if(S&&S.talk) S.talk({op:"drop",room:name,id:id}); };
    V.mute=function(m){ if(S&&S.talk) S.talk({op:"mute",room:name,muted:!!m}); };
    V.live=function(){ return V._live; };
    V.hearing=function(){ return V._hearing; };
    return V; };

  W.friends={on:false,room:null,code:null,me:null,others:{},sendT:0};
  var FCOL=[0xe8a05a,0x5ab8e8,0x7ed48a,0xd47ec4,0xe8d45a,0x8a7ee8];
  function friendFigure(name,i){ var t=T(), g=new t.Group(); g.userData.__wt=true; g.userData.noFrame=true;
    var mat=new t.MeshStandardMaterial({color:FCOL[i%FCOL.length],roughness:.6});
    var body=new t.Mesh(new t.CapsuleGeometry?new t.CapsuleGeometry(0.22,0.7,6,12):new t.CylinderGeometry(0.22,0.22,1.1,12),mat); body.position.y=-0.75; g.add(body);
    var head=new t.Mesh(new t.SphereGeometry(0.17,16,12),new t.MeshStandardMaterial({color:0xf2d4b8,roughness:.7})); head.position.y=-0.12; g.add(head);
    var nose=new t.Mesh(new t.ConeGeometry(0.05,0.12,8),mat); nose.rotation.x=-Math.PI/2; nose.position.set(0,-0.12,-0.2); g.add(nose);
    var c=document.createElement("canvas"); c.width=256; c.height=64; var x=c.getContext("2d"); x.fillStyle="rgba(10,12,18,.75)"; x.fillRect(0,0,256,64); x.fillStyle="#fff"; x.font="600 30px sans-serif"; x.textAlign="center"; x.fillText(String(name||"Friend").slice(0,14),128,43);
    var sp=new t.Sprite(new t.SpriteMaterial({map:new t.CanvasTexture(c),depthTest:false})); sp.scale.set(0.9,0.22,1); sp.position.y=0.25; sp.renderOrder=998; g.add(sp);
    g.traverse(function(o){ o.userData.__wt=true; o.userData.noFrame=true; }); W.scene.add(g); return g; }
  W.friends.start=function(code,name){ var S=window.Spine; if(!S||!S.room) return false; var F=W.friends;
    F.room=S.room("world:"+code); /* the shared code alone decides the room: titles can differ between phones */ F.code=code; F.on=true; F.me={id:Math.random().toString(36).slice(2,8),name:String(name||"Friend").slice(0,14)};
    F.vc=W.voiceChat(F.room,F.me.id,function(){ F.bar(); });
    F.ready=false; F.room.on(function(m){ try{ F._in(m); }catch(e){} }); Promise.resolve(F.room.ready).then(function(){ F.ready=true; F.room.send({t:"hi",id:F.me.id,name:F.me.name}); if(F.vc) F.vc.listen(); }); W.toast&&W.toast("In the room - code "+code); F.bar(); return true; };
  W.friends._in=function(m){ var F=W.friends; if(!m||!m.id||m.id===F.me.id) return; if(F.vc&&/^(rtc|voice-on|voice-off|voice-here)$/.test(m.t)){ F.vc.onMsg(m); return; } var t=T(), o=F.others[m.id];
    if(!o&&(m.t==="hi"||m.t==="pos")){ var n=Object.keys(F.others).length; o=F.others[m.id]={name:m.name||"Friend",fig:friendFigure(m.name,n+1),to:null,yaw:0,seen:Date.now()}; if(m.t==="hi"){ F.room.send({t:"hi",id:F.me.id,name:F.me.name}); W.toast&&W.toast((m.name||"A friend")+" joined"); if(F.vc&&F.vc.on){ F.vc.link(m.id); } } F.bar(); }
    if(!o) return; o.seen=Date.now();
    if(m.t==="pos"){ o.to=new t.Vector3(m.x,m.y,m.z); o.yaw=m.yaw||0; }
    if(m.t==="come"&&W.visit){ W.visit([m.x+0.8,m.y,m.z+0.8],[m.x,m.y-0.3,m.z],(m.name||"Your friend")+" brought everyone here.",1.6); }
    if(m.t==="stop"&&W.visit){ W.visit(m.at,m.look,m.say,m.seconds); }
    if(m.t==="bye"){ W.scene.remove(o.fig); delete F.others[m.id]; if(F.vc) F.vc.drop(m.id); F.bar(); } };
  W.friends.leave=function(){ var F=W.friends; if(!F.on) return; try{ if(F.vc) F.vc.close(); }catch(e){} try{ F.room.send({t:"bye",id:F.me.id}); F.room.leave(); }catch(e){} Object.keys(F.others).forEach(function(k){ W.scene.remove(F.others[k].fig); }); F.others={}; F.on=false; var b=document.getElementById("__wtf"); if(b) b.remove(); };
  W.friends.bar=function(){ var F=W.friends, b=document.getElementById("__wtf"); if(!F.on){ if(b) b.remove(); return; }
    if(!b){ b=document.createElement("div"); b.id="__wtf"; b.style.cssText="position:fixed;left:10px;top:60px;z-index:29;background:rgba(14,16,22,.85);color:#fff;border:1px solid rgba(232,201,138,.5);border-radius:12px;padding:6px 10px;font:600 11.5px Manrope,sans-serif;display:flex;gap:8px;align-items:center"; document.body.appendChild(b); }
    var n=Object.keys(F.others).length; b.innerHTML="<span>Room "+F.code+" · "+(n?n+" with you":"waiting for friends")+"</span><button data-c style='min-height:30px;border-radius:8px;border:0;background:#B8935A;color:#12100e;font:700 11px Manrope;padding:0 8px'>Bring everyone here</button><button data-v style='min-height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:"+(F.vc&&F.vc.on?"#7ed48a":"none")+";color:"+(F.vc&&F.vc.on?"#12100e":"#fff")+";font:700 11px Manrope;padding:0 8px'>"+(F.vc&&F.vc.on?"\uD83C\uDF99 Talking"+(F.vc.live()?" ("+F.vc.live()+")":""):"\uD83C\uDF99 Talk")+"</button><button data-l style='min-height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:none;color:#fff;font:700 11px Manrope;padding:0 8px'>Leave</button>";
    b.querySelector("[data-c]").onclick=function(){ var p=W.camera.getWorldPosition(new (T().Vector3)()); F.room.send({t:"come",id:F.me.id,name:F.me.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)}); W.toast&&W.toast("Bringing everyone to you"); };
    b.querySelector("[data-l]").onclick=function(){ F.leave(); };
    b.querySelector("[data-v]").onclick=function(){ if(!F.vc) return; if(F.vc.on) F.vc.stop(); else F.vc.start(Object.keys(F.others)); }; };
  W.friends.tick=function(dt){ var F=W.friends; if(!F.on||!F.ready) return; F.sendT-=dt;
    if(F.sendT<=0){ F.sendT=0.12; var p=W.camera.getWorldPosition(new (T().Vector3)()), e=new (T().Euler)().setFromQuaternion(W.camera.getWorldQuaternion(new (T().Quaternion)()),"YXZ"); F.room.send({t:"pos",id:F.me.id,name:F.me.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2),yaw:+e.y.toFixed(2)}); }
    var now=Date.now(); Object.keys(F.others).forEach(function(k){ var o=F.others[k]; if(now-o.seen>20000){ W.scene.remove(o.fig); delete F.others[k]; F.bar(); return; } if(o.to){ o.fig.position.lerp(o.to,Math.min(1,dt*8)); o.fig.rotation.y+=(o.yaw-o.fig.rotation.y)*Math.min(1,dt*8); } }); };
  W.onFrame&&W.onFrame(function(t,dt){ try{ W.friends.tick(dt||0.016); }catch(e){} });
  W.friends.menu=function(){ var code=Math.random().toString(36).slice(2,6).toUpperCase().replace(/[^A-Z]/g,"K");
    var p=panel("Visit with friends","<p>Your friends open this same world on their own phone, tap More, then Visit with friends, and type your code. You will see each other walking around, and a guided lesson you start moves everyone.</p><div class='wt-row'><input data-n placeholder='Your name' maxlength=14 style='flex:1;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;padding:0 10px'></div><div class='wt-row'><button class='pri' data-h>Start a room - code "+code+"</button></div><div class='wt-row'><input data-c maxlength=4 placeholder='Friend’s code' style='flex:1;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;padding:0 10px;text-transform:uppercase'><button data-j>Join</button></div>");
    var nm=function(){ return String(p.querySelector("[data-n]").value||"").trim()||"Friend"; };
    p.querySelector("[data-h]").onclick=function(){ if(W.friends.on) W.friends.leave(); W.friends.start(code,nm()); close(); };
    p.querySelector("[data-j]").onclick=function(){ var v=String(p.querySelector("[data-c]").value||"").trim().toUpperCase(); if(v.length!==4) return; if(W.friends.on) W.friends.leave(); W.friends.start(v,nm()); close(); }; return p; };
  // the host's lesson moves the whole room
  var _visit=W.visit; W.lessonVisit=function(at,look,say,seconds){ _visit(at,look,say,seconds); if(W.friends.on) try{ W.friends.room.send({t:"stop",id:W.friends.me.id,at:at,look:look,say:say,seconds:seconds}); }catch(e){} };
  var _lesson=W.lesson; W.lesson=function(stops,onDone){ var vv=W.visit; W.visit=W.lessonVisit; var h=_lesson(stops,function(){ W.visit=vv; onDone&&onDone(); }); var st=h.stop; h.stop=function(){ W.visit=vv; st(); }; return h; };

  // ════════════════════════════════════════════════════════════════════════
  //  A GUIDED LESSON, RECORDED AS A VIDEO (batch 13). The Spine plans a tour
  //  of the named things in the world, pitched for whoever it is for, flies
  //  the camera from stop to stop, reads each part aloud, captions it, and
  //  records the lot into a video you can save, send or play to a class.
  // ════════════════════════════════════════════════════════════════════════
  function tourStops(){ var t=T(), out=[], seen={}; W.scene.updateMatrixWorld(true);
    W.scene.traverse(function(o){ var n=o.userData&&(o.userData.label||o.userData.name); if(!n||seen[n]||o.userData.__wt) return; var b=new t.Box3().setFromObject(o); if(b.isEmpty()) return; seen[n]=1; var c=b.getCenter(new t.Vector3()), sz=b.getSize(new t.Vector3()).length(); out.push({name:String(n),c:c,size:Math.max(0.3,sz)}); });
    if(!out.length){ var B=new t.Box3(); meshes().forEach(function(m){ B.expandByObject(m); }); if(B.isEmpty()) return []; var c=B.getCenter(new t.Vector3()), r=Math.max(1,B.getSize(new t.Vector3()).length()*0.6);
      for(var k=0;k<4;k++){ var a=k/4*Math.PI*2; out.push({name:"view "+(k+1),c:c,size:r,ang:a}); } }
    return out.slice(0,6).map(function(s,i){ var d=s.size*1.4+1.2, a=s.ang!=null?s.ang:(Math.atan2(W.camera.position.x-s.c.x,W.camera.position.z-s.c.z)+i*0.5);
      return {name:s.name,at:[+(s.c.x+Math.sin(a)*d).toFixed(2),+(s.c.y+s.size*0.35+0.4).toFixed(2),+(s.c.z+Math.cos(a)*d).toFixed(2)],look:[+s.c.x.toFixed(2),+s.c.y.toFixed(2),+s.c.z.toFixed(2)]}; }); }
  W.recordLesson=function(){ var p=panel("Record a guided lesson","<p>The Spine plans a short tour of this world for "+esc(({kids:"little kids",students:"students",teachers:"a class",experts:"experts",everyone:"everyone"})[W.audience]||"everyone")+", flies to each part, explains it out loud with captions, and records it as a video.</p><p class='wt-st'></p><div class='wt-row'><button class='pri' data-go>Plan and record</button><label style='display:flex;gap:6px;align-items:center'><input type=checkbox data-v checked> Studio voice (uses your voice allowance)</label></div>");
    var stE=p.querySelector(".wt-st"); var say=function(t){ stE.textContent=t; };
    p.querySelector("[data-go]").onclick=function(){ var stops=tourStops(); if(!stops.length){ say("There is nothing in the world to tour yet."); return; } var useVoice=p.querySelector("[data-v]").checked; this.disabled=true; say("Writing the lesson...");
      var S=window.Spine; if(!S||!S.json){ say("Lessons need The Spine."); return; }
      S.json("Write a short guided lesson touring "+(document.title||"this world")+", for "+AUD[W.audience||"everyone"]+". Stops, in this order: "+stops.map(function(s){ return s.name; }).join(", ")+". One or two sentences per stop (under 40 words), accurate, never invent facts. Add a one-sentence welcome and a one-sentence wrap-up.",{intro:"",stops:[{name:"",say:""}],outro:""}).then(function(r){
        if(!r||!r.stops){ say("Couldn't write the lesson just now."); return; }
        var plan=stops.map(function(s,i){ return {at:s.at,look:s.look,say:String((r.stops[i]&&r.stops[i].say)||s.name)}; }); if(r.intro) plan[0].say=r.intro+" "+plan[0].say; if(r.outro) plan[plan.length-1].say+=" "+r.outro;
        close(); W._recordPlan(plan,useVoice); }); }; return p; };
  W._recordPlan=function(plan,useVoice){ var S=window.Spine, cv=W.renderer.domElement, out=document.createElement("canvas"), x=out.getContext("2d"); var cap="";
    out.width=Math.min(1280,cv.width); out.height=Math.round(out.width*cv.height/cv.width); if(out.height%2) out.height++;
    var AC=window.AudioContext||window.webkitAudioContext, ac=AC?new AC():null, dest=ac?ac.createMediaStreamDestination():null;
    var draw=function(){ try{ x.drawImage(cv,0,0,out.width,out.height); if(cap){ var fs=Math.round(out.height/24); x.font="600 "+fs+"px sans-serif"; x.textAlign="center"; var words=cap.split(" "), lines=[], ln=""; words.forEach(function(w){ var tt=ln?ln+" "+w:w; if(x.measureText(tt).width>out.width*0.86){ lines.push(ln); ln=w; } else ln=tt; }); if(ln) lines.push(ln); lines=lines.slice(-3);
        var h=lines.length*fs*1.3+fs*0.6, y0=out.height-h-fs*0.8; x.fillStyle="rgba(0,0,0,.72)"; x.fillRect(out.width*0.05,y0,out.width*0.9,h); x.fillStyle="#fff"; lines.forEach(function(l,i){ x.fillText(l,out.width/2,y0+fs*1.15+i*fs*1.3); }); } }catch(e){} };
    var _r=W.renderer.render; W.renderer.render=function(a,b){ _r.call(W.renderer,a,b); if(W._recOn) draw(); };
    var tracks=out.captureStream(30).getVideoTracks(); if(dest) tracks=tracks.concat(dest.stream.getAudioTracks());
    var type=["video/mp4;codecs=avc1","video/mp4","video/webm;codecs=vp9,opus","video/webm"].find(function(t){ return window.MediaRecorder&&MediaRecorder.isTypeSupported(t); })||"";
    var rec; try{ rec=new MediaRecorder(new MediaStream(tracks),type?{mimeType:type}:undefined); }catch(e){ W.toast&&W.toast("This browser can't record video."); W.renderer.render=_r; return; }
    var chunks=[]; rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    var badge=document.createElement("div"); badge.style.cssText="position:fixed;right:10px;top:60px;z-index:31;background:#c0392b;color:#fff;font:700 11px Manrope,sans-serif;padding:5px 10px;border-radius:999px"; badge.textContent="● Recording lesson"; document.body.appendChild(badge);
    var voiceFor=function(t){ if(!useVoice||!S||!S.voice||!ac) return Promise.resolve(null); return Promise.resolve(S.voice(t)).then(function(u){ if(!u) return null; return fetch(u).then(function(r){ return r.arrayBuffer(); }).then(function(b){ return ac.decodeAudioData(b); }); }).catch(function(){ return null; }); };
    var wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
    // fetch every voice line first, so the recording has no gaps while it waits on the network
    Promise.all(plan.map(function(s){ return voiceFor(s.say); })).then(function(bufs){
      W._recOn=true; try{ ac&&ac.resume(); }catch(e){} rec.start(250); var i=0;
      var step=function(){ if(i>=plan.length){ return wait(900).then(finish); } var s=plan[i], b=bufs[i]; i++; cap=s.say; (W.lessonVisit||W.visit)(s.at,s.look,null,1.6);
        var ms=Math.max(3200,String(s.say).length*62+1400);
        if(b&&ac){ var src=ac.createBufferSource(); src.buffer=b; src.connect(dest); try{ src.connect(ac.destination); }catch(e){} src.start(ac.currentTime+1.2); ms=Math.max(ms,b.duration*1000+1900); }
        else if(!useVoice){ try{ S&&S.speak&&S.speak(s.say); }catch(e){} }
        return wait(ms).then(step); };
      var finish=function(){ W._recOn=false; cap=""; rec.onstop=function(){ W.renderer.render=_r; badge.remove(); var bl=new Blob(chunks,{type:(type||"video/webm").split(";")[0]}); var ext=/mp4/.test(type)?"mp4":"webm";
          bl.arrayBuffer().then(function(ab){ var u8=new Uint8Array(ab), s="", CH=0x8000; for(var k=0;k<u8.length;k+=CH) s+=String.fromCharCode.apply(null,u8.subarray(k,k+CH));
            var nm=String(document.title||((document.querySelector(".e-t")||{}).textContent)||"Spine world").replace(/[^\w\- ]/g,"").trim().slice(0,40)||"Spine world"; W._lastLesson={bytes:u8.length,type:bl.type,seconds:0};
            if(S&&S.export) S.export({name:nm+" - lesson."+ext,type:bl.type,base64:btoa(s)}); W.toast&&W.toast("Lesson recorded - saving the video"); }); try{ ac&&ac.close(); }catch(e){} }; rec.stop(); };
      return step(); }); };

  // ── THE MORE MENU GETS THE TOOLS
  var _more=W._openMore;
  W._openMore=function(){ _more.call(W); var sh=document.getElementById("__sheet"); if(!sh) return;
    var close=sh.querySelector(".w-close"); var add=function(icon,label,note,fn){ var r=document.createElement("button"); r.type="button"; r.className="w-row"; r.innerHTML="<i>"+icon+"</i><b></b><u></u>"; r.querySelector("b").textContent=label; r.querySelector("u").textContent=note||"";
      r.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); try{ sh.remove(); fn(); }catch(e){} }; sh.insertBefore(r,close); return r; };
    var h=document.createElement("h4"); h.textContent="Explore and learn"; sh.insertBefore(h,close);
    var who=add("☺","Explaining for: "+({kids:"little kids",students:"students",teachers:"teachers",experts:"experts",everyone:"everyone"}[W.audience]||"everyone"),"change",function(){ var o=["everyone","kids","students","teachers","experts"]; W.audience=o[(o.indexOf(W.audience)+1)%o.length]; W._openMore(); });
    add("?","What am I looking at?","explains it",W.explain);
    add("✓","Quiz me","4 questions",W.quiz);
    add("↔","Measure","tap two points",W.measure);
    add("✂","Cut it open","see inside",W.section);
    add("◌","X-ray",W._xrayOn?"on":"off",function(){ W.xray(); });
    add("✥","Pull it apart","exploded view",W.explode);
    add("\u25CF","Record a guided lesson","as a video \u00b7 captions",W.recordLesson);
    add("\u263A","Visit with friends",W.friends.on?("room "+W.friends.code):"share a code",W.friends.menu);
    var h3=document.createElement("h4"); h3.textContent="Play"; sh.insertBefore(h3,close);
    add("\u25B6","Play it as a game","instant \u00b7 free",function(){ try{ if(window.Adventure&&window.Adventure.quickGame) window.Adventure.quickGame(); }catch(e){} });
    add("\u2605","Make a full story game from it","chapters \u00b7 3D adventure",function(){ try{ var L=labels().slice(0,12).join(", "); window.Spine&&window.Spine.open&&window.Spine.open("game","A 3D adventure set in "+(document.title||"this world")+(L?". It has: "+L:"")+".",{mode:"adventure"}); }catch(e){} });
    var h2=document.createElement("h4"); h2.textContent="Take it with you"; sh.insertBefore(h2,close);
    add("⬇","Download the 3D model","GLB · any 3D app",function(){ W.download("glb"); });
    add("⬇","Download for a 3D printer","STL · millimetres",function(){ W.download("stl"); });
    add("◎","View in your room on iPhone","AR Quick Look",function(){ W.download("usdz"); });
  };
})();
