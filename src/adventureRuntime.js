// ============================================================================
//  SPINE ADVENTURE ENGINE
//  Console-style 3D adventure games on top of the SpineWorld renderer.
//  A hero you control, a chase camera, solid walls, enemies that see, hear,
//  hunt and find their way round corners, combat, keys and doors, puzzles,
//  quests, talking characters, cutscenes, chapters and saves.
//  Everything is built from code: nothing has to download for a game to run.
//  It is inert until something calls Adventure.* - a world that never uses it
//  pays nothing.
// ============================================================================
(function(){
  if(window.Adventure) return;
  var A = window.Adventure = window.SpineAdventure = {};
  var W = function(){ return window.SpineWorld; };
  var T = function(){ return window.THREE; };
  var clamp=function(v,a,b){ return v<a?a:(v>b?b:v); };
  var lerp=function(a,b,k){ return a+(b-a)*k; };
  var damp=function(a,b,l,dt){ return lerp(a,b,1-Math.exp(-l*dt)); };
  var angDiff=function(a,b){ var d=b-a; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return d; };
  var rnd=function(a,b){ return a+Math.random()*(b-a); };
  var uid=0; var nid=function(p){ uid++; return (p||"o")+uid; };
  A._clamp=clamp; A._lerp=lerp; A._damp=damp; A._angDiff=angDiff;

  // ── STATE THAT SURVIVES CHAPTERS ──
  A.state = { chapter:1, health:100, maxHealth:100, inventory:[], flags:{}, kills:0, secrets:0, deaths:0,
              playSeconds:0, ammo:{}, mana:100, notes:[], choices:[], story:"" };
  A.cfg = { title:"", genre:"action", view:"third", difficulty:"normal", quality:null, voices:"phone" };
  A._handlers = {};
  A.on=function(name,fn){ (A._handlers[name]=A._handlers[name]||[]).push(fn); return A; };
  A._emit=function(name,data){
    var L=A._handlers[name]||[]; for(var i=0;i<L.length;i++){ try{ L[i](data); }catch(e){} }
    try{ if(window.Spine&&window.Spine.emit&&/^(kill|pickup|chapter|death|quest|door|secret)$/.test(name)) window.Spine.emit("adventure:"+name,data==null?null:(typeof data==="object"?JSON.parse(JSON.stringify(data,function(k,v){ return (v&&v.isObject3D)?undefined:v; })):data)); }catch(e){}
  };
  A.flag=function(k,v){ if(v===undefined) return A.state.flags[k]; A.state.flags[k]=v; return A; };

  // ════════════════════════════════════════════════════════════════════════
  //  SOLID THINGS. Every wall, crate and pillar is an oriented box on the
  //  ground plane with a bottom and a top. Fast, exact enough for a phone,
  //  and it never lets a hero slip through a wall the way mesh rays can.
  // ════════════════════════════════════════════════════════════════════════
  A._solids=[]; A._grid={}; A._gridDirty=true; A._ramps=[]; A._grounds=[]; A._floorY=0;
  var CELL=4;
  function obbFromMesh(o){
    var t=T(); o.updateMatrixWorld(true);
    var g=o.geometry;
    if(g&&o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh){
      if(!g.boundingBox) g.computeBoundingBox();
      var bb=g.boundingBox, c=new t.Vector3(), s=new t.Vector3(), q=new t.Quaternion(), p=new t.Vector3();
      o.matrixWorld.decompose(p,q,s);
      bb.getCenter(c); var cw=c.clone().applyMatrix4(o.matrixWorld);
      var e=new t.Euler().setFromQuaternion(q,"YXZ");
      var wb=new t.Box3().setFromObject(o);
      return { cx:cw.x, cz:cw.z, hx:Math.abs((bb.max.x-bb.min.x)/2*s.x), hz:Math.abs((bb.max.z-bb.min.z)/2*s.z), rot:e.y, y0:wb.min.y, y1:wb.max.y };
    }
    var b=new t.Box3().setFromObject(o); if(b.isEmpty()) return null;
    return { cx:(b.min.x+b.max.x)/2, cz:(b.min.z+b.max.z)/2, hx:(b.max.x-b.min.x)/2, hz:(b.max.z-b.min.z)/2, rot:0, y0:b.min.y, y1:b.max.y };
  }
  A._addBox=function(cx,cz,hx,hz,rot,y0,y1,ref){
    var s={id:nid("s"),cx:cx,cz:cz,hx:Math.max(0.01,hx),hz:Math.max(0.01,hz),rot:rot||0,y0:y0,y1:y1,ref:ref||null,on:true};
    s.c=Math.cos(s.rot); s.s=Math.sin(s.rot); s.r=Math.sqrt(s.hx*s.hx+s.hz*s.hz);
    A._solids.push(s); A._gridDirty=true; A._navDirty=true; return s;
  };
  // Make anything solid. Pass a mesh or group; groups are boxed as a whole.
  A.solid=function(o,opts){
    try{
      if(!o) return null; opts=opts||{};
      if(opts.each&&o.children&&o.children.length){ var out=[]; o.traverse(function(m){ if(m.isMesh){ var r=A.solid(m); if(r) out.push(r);} }); return out; }
      var b=obbFromMesh(o); if(!b) return null;
      var s=A._addBox(b.cx,b.cz,b.hx+(opts.pad||0),b.hz+(opts.pad||0),b.rot,b.y0,b.y1,o);
      o.userData.solid=s; return s;
    }catch(e){ return null; }
  };
  A.unsolid=function(s){ if(!s) return; if(s.isObject3D) s=s.userData.solid; if(!s) return; s.on=false; A._gridDirty=true; A._navDirty=true; };
  A.ground=function(mesh){ if(mesh){ A._grounds.push(mesh); mesh.userData.noFrame=true; } return mesh; };
  function rebuildGrid(){
    A._grid={}; for(var i=0;i<A._solids.length;i++){ var s=A._solids[i]; if(!s.on) continue;
      var x0=Math.floor((s.cx-s.r)/CELL), x1=Math.floor((s.cx+s.r)/CELL), z0=Math.floor((s.cz-s.r)/CELL), z1=Math.floor((s.cz+s.r)/CELL);
      for(var x=x0;x<=x1;x++) for(var z=z0;z<=z1;z++){ var k=x+","+z; (A._grid[k]=A._grid[k]||[]).push(s); } }
    A._gridDirty=false;
  }
  function near(x,z,r){
    if(A._gridDirty) rebuildGrid();
    var out=[], seen={}, x0=Math.floor((x-r)/CELL), x1=Math.floor((x+r)/CELL), z0=Math.floor((z-r)/CELL), z1=Math.floor((z+r)/CELL);
    for(var gx=x0;gx<=x1;gx++) for(var gz=z0;gz<=z1;gz++){ var L=A._grid[gx+","+gz]; if(!L) continue;
      for(var i=0;i<L.length;i++){ var s=L[i]; if(s.on&&!seen[s.id]){ seen[s.id]=1; out.push(s); } } }
    return out;
  }
  A._nearSolids=near;
  // world <-> box space
  function toLocal(s,x,z){ var dx=x-s.cx, dz=z-s.cz; return [dx*s.c-dz*s.s, dx*s.s+dz*s.c]; }
  function toWorldDir(s,lx,lz){ return [lx*s.c+lz*s.s, -lx*s.s+lz*s.c]; }
  A._toLocal=toLocal; A._toWorldDir=toWorldDir;
  // Push a standing circle out of everything solid at its height. Returns the corrected [x,z].
  A._collide=function(x,z,r,feet,height,ignore){
    for(var pass=0;pass<3;pass++){
      var L=near(x,z,r+1), moved=false;
      for(var i=0;i<L.length;i++){ var s=L[i]; if(s===ignore) continue;
        if(s.y1<=feet+0.38||s.y0>=feet+height) continue;      // can step onto it, or it is overhead
        var l=toLocal(s,x,z), qx=clamp(l[0],-s.hx,s.hx), qz=clamp(l[1],-s.hz,s.hz);
        var dx=l[0]-qx, dz=l[1]-qz, d2=dx*dx+dz*dz;
        if(d2>=r*r) continue;
        var px,pz;
        if(d2>1e-9){ var d=Math.sqrt(d2), k=(r-d)/d; px=dx*k; pz=dz*k; }
        else { // centre inside the box: leave by the nearest face
          var ex=s.hx-Math.abs(l[0]), ez=s.hz-Math.abs(l[1]);
          if(ex<ez){ px=(l[0]>=0?1:-1)*(ex+r); pz=0; } else { px=0; pz=(l[1]>=0?1:-1)*(ez+r); }
        }
        var w=toWorldDir(s,px,pz); x+=w[0]; z+=w[1]; moved=true;
      }
      if(!moved) break;
    }
    return [x,z];
  };
  // The highest floor under a point that a person standing at fromY could be on.
  A.groundAt=function(x,z,fromY){
    var best=A._noFloor?-1e9:A._floorY; var top=(fromY==null?1e9:fromY+0.45);
    var L=near(x,z,0.5);
    for(var i=0;i<L.length;i++){ var s=L[i]; if(s.y1>top||s.y1<=best) continue;
      var l=toLocal(s,x,z); if(Math.abs(l[0])<=s.hx&&Math.abs(l[1])<=s.hz) best=s.y1; }
    for(var j=0;j<A._ramps.length;j++){ var rp=A._ramps[j], l2=toLocal(rp,x,z);
      if(Math.abs(l2[0])<=rp.hx&&Math.abs(l2[1])<=rp.hz){ var k=clamp((l2[1]+rp.hz)/(2*rp.hz),0,1); var h=lerp(rp.ya,rp.yb,k); if(h<=top&&h>best) best=h; } }
    if(A._grounds.length){
      try{ var t=T(); A._ray=A._ray||new t.Raycaster(); A._ray.set(new t.Vector3(x,(fromY==null?200:fromY+2),z),new t.Vector3(0,-1,0)); A._ray.far=400;
        var hits=A._ray.intersectObjects(A._grounds,true); for(var h2=0;h2<hits.length;h2++){ var y=hits[h2].point.y; if(y<=top&&y>best){ best=y; break; } } }catch(e){}
    }
    return best;
  };
  // Does a straight line at height y pass through anything solid?
  A.blocked=function(ax,az,bx,bz,y,skip){
    var mx=(ax+bx)/2, mz=(az+bz)/2, half=Math.sqrt((bx-ax)*(bx-ax)+(bz-az)*(bz-az))/2;
    var L=near(mx,mz,half+1);
    for(var i=0;i<L.length;i++){ var s=L[i]; if(s===skip) continue; if(y!=null&&(y<s.y0||y>s.y1)) continue;
      var a=toLocal(s,ax,az), b=toLocal(s,bx,bz), dx=b[0]-a[0], dz=b[1]-a[1], t0=0, t1=1;
      var ok=true, P=[-dx,dx,-dz,dz], Q=[a[0]+s.hx, s.hx-a[0], a[1]+s.hz, s.hz-a[1]];
      for(var k=0;k<4;k++){ if(Math.abs(P[k])<1e-9){ if(Q[k]<0){ ok=false; break; } } else { var r=Q[k]/P[k]; if(P[k]<0){ if(r>t1){ok=false;break;} if(r>t0)t0=r; } else { if(r<t0){ok=false;break;} if(r<t1)t1=r; } } }
      if(ok&&t0<=t1) return t0;
    }
    return -1;
  };

  // ════════════════════════════════════════════════════════════════════════
  //  FINDING THE WAY. A walkable grid laid over the level, A* across it, and
  //  the path pulled tight so enemies take the corner instead of a staircase.
  // ════════════════════════════════════════════════════════════════════════
  A._nav=null; A._navDirty=true;
  A._buildNav=function(){
    var mnx=1e9,mnz=1e9,mxx=-1e9,mxz=-1e9, any=false;
    for(var i=0;i<A._solids.length;i++){ var s=A._solids[i]; if(!s.on) continue; any=true;
      mnx=Math.min(mnx,s.cx-s.r); mxx=Math.max(mxx,s.cx+s.r); mnz=Math.min(mnz,s.cz-s.r); mxz=Math.max(mxz,s.cz+s.r); }
    var P=A.player&&A.player.pos; if(P){ mnx=Math.min(mnx,P.x-20); mxx=Math.max(mxx,P.x+20); mnz=Math.min(mnz,P.z-20); mxz=Math.max(mxz,P.z+20); any=true; }
    if(!any){ A._nav=null; return; }
    mnx-=3; mnz-=3; mxx+=3; mxz+=3;
    var cs=0.5; while((mxx-mnx)/cs*(mxz-mnz)/cs>48000) cs*=1.25;
    var nx=Math.ceil((mxx-mnx)/cs), nz=Math.ceil((mxz-mnz)/cs), cells=new Uint8Array(nx*nz), gy=new Float32Array(nx*nz);
    var R=0.32;
    for(var z=0;z<nz;z++) for(var x=0;x<nx;x++){
      var wx=mnx+(x+0.5)*cs, wz=mnz+(z+0.5)*cs, g=A.groundAt(wx,wz,(P?P.y:0)+0.6), bad=0;
      if(g<-1e8){ bad=1; }
      else { var L=near(wx,wz,R+0.5);
        for(var j=0;j<L.length;j++){ var s2=L[j]; if(s2.y1<=g+0.45||s2.y0>=g+1.6) continue;
          var l=toLocal(s2,wx,wz); if(Math.abs(l[0])<=s2.hx+R&&Math.abs(l[1])<=s2.hz+R){ bad=1; break; } } }
      cells[z*nx+x]=bad; gy[z*nx+x]=g;
    }
    A._nav={x0:mnx,z0:mnz,cs:cs,nx:nx,nz:nz,cells:cells,gy:gy}; A._navDirty=false;
  };
  function navCell(n,x,z){ return [Math.floor((x-n.x0)/n.cs), Math.floor((z-n.z0)/n.cs)]; }
  // the nearest open cell - on the same level as refG when given, so a goal on a table top
  // or a wall top is moved to the floor beside it rather than making the path impossible
  function nearestFree(n,c,refG){
    var okc=function(x,z){ if(x<0||z<0||x>=n.nx||z>=n.nz) return false; var i=z*n.nx+x; return !n.cells[i]&&(refG==null||Math.abs(n.gy[i]-refG)<0.6); };
    if(okc(c[0],c[1])) return c;
    for(var r=1;r<10;r++) for(var dz=-r;dz<=r;dz++) for(var dx=-r;dx<=r;dx++){ var x=c[0]+dx, z=c[1]+dz; if(okc(x,z)) return [x,z]; }
    return null;
  }
  A.path=function(from,to){
    if(A._navDirty||!A._nav) A._buildNav();
    var n=A._nav; if(!n) return [[to.x,to.z]];
    var a=nearestFree(n,navCell(n,from.x,from.z),A.groundAt(from.x,from.z,(from.y||0)+0.3)); if(!a) return null; var b=nearestFree(n,navCell(n,to.x,to.z),n.gy[a[1]*n.nx+a[0]]); if(!b) return null;
    var N=n.nx*n.nz, si=a[1]*n.nx+a[0], gi=b[1]*n.nx+b[0];
    var gs=new Float32Array(N); gs.fill(1e9); var came=new Int32Array(N); came.fill(-1); var closed=new Uint8Array(N);
    var heap=[], push=function(i,f){ heap.push([f,i]); var k=heap.length-1; while(k>0){ var p=(k-1)>>1; if(heap[p][0]<=heap[k][0]) break; var t=heap[p]; heap[p]=heap[k]; heap[k]=t; k=p; } },
        pop=function(){ var top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; var k=0; for(;;){ var l=2*k+1, r=l+1, m=k; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===k) break; var t=heap[m]; heap[m]=heap[k]; heap[k]=t; k=m; } } return top; };
    var bx=b[0], bz=b[1], h=function(i){ var x=i%n.nx, z=(i/n.nx)|0, dx=Math.abs(x-bx), dz=Math.abs(z-bz); return (dx+dz)+(1.4142-2)*Math.min(dx,dz); };
    gs[si]=0; push(si,h(si)); var steps=0, found=false;
    var D=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
    while(heap.length&&steps<20000){ steps++;
      var cur=pop()[1]; if(cur===gi){ found=true; break; } if(closed[cur]) continue; closed[cur]=1;
      var cx=cur%n.nx, cz=(cur/n.nx)|0;
      for(var d=0;d<8;d++){ var x=cx+D[d][0], z=cz+D[d][1]; if(x<0||z<0||x>=n.nx||z>=n.nz) continue; var ni=z*n.nx+x; if(n.cells[ni]||closed[ni]) continue;
        if(D[d][2]>1&&(n.cells[cz*n.nx+x]||n.cells[z*n.nx+cx])) continue;            // no cutting corners
        if(Math.abs(n.gy[ni]-n.gy[cur])>0.6) continue;                               // no climbing walls
        var g=gs[cur]+D[d][2]; if(g<gs[ni]){ gs[ni]=g; came[ni]=cur; push(ni,g+h(ni)); } }
    }
    if(!found) return null;
    var pts=[], i=gi; while(i!==-1&&i!==si){ pts.push([n.x0+((i%n.nx)+0.5)*n.cs, n.z0+(((i/n.nx)|0)+0.5)*n.cs]); i=came[i]; }
    pts.reverse(); pts.push([to.x,to.z]);
    // pull it tight
    var out=[], ax=from.x, az=from.z, k=0;
    while(k<pts.length){ var far=k; for(var j=pts.length-1;j>k;j--){ if(A.blocked(ax,az,pts[j][0],pts[j][1],(from.y||0)+0.9)<0&&clearPath(ax,az,pts[j][0],pts[j][1])){ far=j; break; } }
      out.push(pts[far]); ax=pts[far][0]; az=pts[far][1]; k=far+1; }
    return out;
  };
  // a fat line check against the nav grid, so a pulled path never scrapes a wall corner
  function clearPath(ax,az,bx,bz){ var n=A._nav; if(!n) return true; var d=Math.sqrt((bx-ax)*(bx-ax)+(bz-az)*(bz-az)), steps=Math.ceil(d/(n.cs*0.5));
    for(var i=1;i<steps;i++){ var x=ax+(bx-ax)*i/steps, z=az+(bz-az)*i/steps, c=navCell(n,x,z); if(c[0]<0||c[1]<0||c[0]>=n.nx||c[1]>=n.nz) return false; if(n.cells[c[1]*n.nx+c[0]]) return false; }
    return true; }

  // ════════════════════════════════════════════════════════════════════════
  //  CHARACTERS. Built from smooth shapes with a real joint hierarchy, and
  //  animated in code: idle breathing, walk, run, crouch, swing, shoot, cast,
  //  flinch and fall. A zombie shambles, a guard marches, a wraith floats.
  //  A downloaded rigged model (GLB) can replace the body when one is given.
  // ════════════════════════════════════════════════════════════════════════
  var PALETTES={
    hero:{skin:"#c8957a",hair:"#2b1d14",top:"#3d4a5c",bottom:"#26282e",accent:"#b8935a",shoe:"#1c1a18"},
    zombie:{skin:"#7d8a6a",hair:"#2a2a22",top:"#4a4238",bottom:"#30302a",accent:"#5a1d1a",shoe:"#1c1a18"},
    guard:{skin:"#b98a6e",hair:"#1d1a17",top:"#2e3640",bottom:"#262a30",accent:"#111418",shoe:"#121212"},
    mage:{skin:"#d6a88a",hair:"#3a2716",top:"#3b2a5a",bottom:"#2a1f40",accent:"#d9b25c",shoe:"#20180f"},
    wraith:{skin:"#9fb7c9",hair:"#c7d6e2",top:"#5d7387",bottom:"#3c4c5a",accent:"#a8e3ff",shoe:"#000000"},
    robot:{skin:"#8e98a3",hair:"#3a4048",top:"#5c6670",bottom:"#40474f",accent:"#ff5a3c",shoe:"#2a2f35"},
    villager:{skin:"#c79a7c",hair:"#5a3b22",top:"#6b5a3c",bottom:"#4a3d2c",accent:"#a04a2c",shoe:"#2a1d12"}
  };
  // words in a description that set colours, so 'a woman in a red coat with black hair' looks like that
  var COLORS={red:"#8f2a24",crimson:"#7a1c22",scarlet:"#9b2420",blue:"#2b4a7a",navy:"#1f2a44",green:"#2f5a3a",olive:"#56603a",
    black:"#18181b",white:"#d9d6cf",grey:"#6a6d72",gray:"#6a6d72",brown:"#5b3a24",tan:"#a3825a",gold:"#b8923e",golden:"#b8923e",silver:"#a9adb3",
    purple:"#4a2f6a",violet:"#5a3a8a",yellow:"#b89a2a",orange:"#b8622a",pink:"#b86a86",teal:"#2a6a6a",beige:"#b8a888",khaki:"#8a7f5a",
    blonde:"#c8a860",blond:"#c8a860",ginger:"#a0502a",auburn:"#7a3a22",dark:"#232326",pale:"#e2c4b0",tanned:"#a06f50"};
  function readLook(desc,base){
    var p=JSON.parse(JSON.stringify(base)); var d=" "+String(desc||"").toLowerCase()+" ";
    var m;
    var re=/\b([a-z]+)\s+(hair|coat|jacket|suit|robe|cloak|dress|shirt|top|trousers|pants|skirt|armou?r|uniform|hood|boots|eyes|skin|cape|vest)\b/g;
    while((m=re.exec(d))){ var c=COLORS[m[1]]; if(!c) continue; var w=m[2];
      if(w==="hair") p.hair=c; else if(/coat|jacket|suit|robe|cloak|dress|shirt|top|armou?r|uniform|hood|cape|vest/.test(w)) p.top=c;
      else if(/trousers|pants|skirt/.test(w)) p.bottom=c; else if(w==="boots") p.shoe=c; else if(w==="skin") p.skin=c; }
    if(/\b(pale)\b/.test(d)) p.skin=COLORS.pale; if(/\bdark[- ]skinned|\bblack (man|woman)\b/.test(d)) p.skin="#6b4430";
    if(/\bblonde?\b/.test(d)&&!/blonde? (coat|jacket)/.test(d)) p.hair=COLORS.blonde; if(/\bred[- ]?head|ginger\b/.test(d)) p.hair=COLORS.ginger;
    if(/\b(grey|gr[ae]y|white|silver)[- ]haired\b|\bold\b|\belderly\b/.test(d)) p.hair="#bcbab4";
    return p;
  }
  function std(color,rough,metal,extra){ var t=T(); var o={color:new t.Color(color),roughness:rough==null?0.7:rough,metalness:metal||0}; if(extra) for(var k in extra) o[k]=extra[k]; return new t.MeshStandardMaterial(o); }
  function cap(r,len,mat,seg){ var t=T(); var g=new t.CapsuleGeometry(r,len,seg||10,seg?seg*2:20); var m=new t.Mesh(g,mat); m.castShadow=true; return m; }
  function pivot(parent,x,y,z){ var g=new (T().Group)(); g.position.set(x,y,z); parent.add(g); return g; }

  // kind: hero | zombie | guard | mage | wraith | robot | villager | beast | brute
  A.makeCharacter=function(o){
    o=o||{}; var t=T(); var kind=o.kind||"hero";
    var base=PALETTES[kind==="brute"?"zombie":kind==="beast"?"zombie":kind]||PALETTES.hero;
    var col=readLook(o.look,base); if(o.colors) for(var k in o.colors) col[k]=o.colors[k];
    var desc=String(o.look||"").toLowerCase();
    var root=new t.Group(); root.name=o.name||kind; var body=new t.Group(); root.add(body);
    var scale=o.scale||(kind==="brute"?1.45:kind==="beast"?1:1)*(/\b(child|kid|small)\b/.test(desc)?0.75:/\b(giant|huge|tall)\b/.test(desc)?1.2:1);
    body.scale.setScalar(scale);
    var skinM=std(col.skin,0.62,0,kind==="wraith"?{transparent:true,opacity:0.55,emissive:new t.Color(col.accent),emissiveIntensity:0.6}:(kind==="robot"?{metalness:0.85,roughness:0.35}:null));
    var topM=std(col.top,kind==="robot"?0.35:0.82,kind==="robot"?0.8:0,kind==="wraith"?{transparent:true,opacity:0.6,emissive:new t.Color(col.top),emissiveIntensity:0.35}:null);
    var botM=std(col.bottom,0.85,kind==="robot"?0.8:0,kind==="wraith"?{transparent:true,opacity:0.5}:null);
    var hairM=std(col.hair,0.55); var shoeM=std(col.shoe,0.5,0.1); var accM=std(col.accent,0.45,0.35);
    var eyeM=std(kind==="zombie"||kind==="brute"?"#d8d2a0":kind==="wraith"||kind==="robot"?col.accent:"#f2f0ea",0.3,0,(kind==="zombie"||kind==="wraith"||kind==="robot"||kind==="brute")?{emissive:new t.Color(kind==="zombie"||kind==="brute"?"#b8a040":col.accent),emissiveIntensity:kind==="zombie"?0.6:1.6}:null);
    var J={};
    if(kind==="beast"){
      // four legs, a long body, a head that lunges
      J.hips=pivot(body,0,0.62,0);
      var torso=cap(0.26,0.8,skinM,8); torso.rotation.x=Math.PI/2; J.hips.add(torso);
      J.head=pivot(J.hips,0,0.12,-0.62); var hd=cap(0.17,0.26,skinM,8); hd.rotation.x=Math.PI/2; hd.position.z=-0.12; J.head.add(hd);
      [-1,1].forEach(function(sx){ var e=new t.Mesh(new t.SphereGeometry(0.035,10,8),eyeM); e.position.set(sx*0.09,0.07,-0.2); J.head.add(e);
        var ear=new t.Mesh(new t.ConeGeometry(0.05,0.14,8),skinM); ear.position.set(sx*0.09,0.17,-0.04); J.head.add(ear); });
      J.legs=[]; [[-0.17,-0.4],[0.17,-0.4],[-0.17,0.4],[0.17,0.4]].forEach(function(p){ var hp=pivot(J.hips,p[0],0,p[1]); var lg=cap(0.07,0.42,skinM,6); lg.position.y=-0.3; hp.add(lg); J.legs.push(hp); });
      J.tail=pivot(J.hips,0,0.05,0.55); var tl=cap(0.04,0.4,skinM,6); tl.rotation.x=-1.0; tl.position.set(0,0.12,0.15); J.tail.add(tl);
    } else {
      var fem=/\b(woman|girl|she|her|female|lady|witch|queen|princess)\b/.test(desc);
      J.hips=pivot(body,0,0.94,0);
      var pelvis=cap(fem?0.17:0.16,0.1,botM); pelvis.rotation.z=Math.PI/2; pelvis.scale.set(1,1,0.75); J.hips.add(pelvis);
      J.spine=pivot(J.hips,0,0.08,0);
      var torsoM=topM; var chest=cap(fem?0.165:0.19,0.3,torsoM); chest.position.y=0.27; chest.scale.set(1.08,1,0.7); J.spine.add(chest);
      J.neck=pivot(J.spine,0,0.55,0); var nk=cap(0.055,0.06,skinM,6); nk.position.y=0.03; J.neck.add(nk);
      J.head=pivot(J.neck,0,0.1,0);
      var skull=new t.Mesh(new t.SphereGeometry(0.115,32,24),skinM); skull.scale.set(0.92,1.06,1.0); skull.position.y=0.08; skull.castShadow=true; J.head.add(skull);
      var jaw=new t.Mesh(new t.SphereGeometry(0.09,24,16),skinM); jaw.scale.set(0.95,0.7,0.95); jaw.position.set(0,0.0,-0.02); J.head.add(jaw);
      var nose=new t.Mesh(new t.ConeGeometry(0.018,0.05,8),skinM); nose.rotation.x=-Math.PI/2; nose.position.set(0,0.07,-0.115); J.head.add(nose);
      [-1,1].forEach(function(sx){ var e=new t.Mesh(new t.SphereGeometry(0.017,12,10),eyeM); e.position.set(sx*0.04,0.1,-0.098); J.head.add(e);
        var brow=new t.Mesh(new t.BoxGeometry(0.045,0.01,0.012),hairM); brow.position.set(sx*0.042,0.132,-0.1); brow.rotation.z=-sx*0.12; J.head.add(brow); });
      // hair, hats and hoods
      var hairStyle=o.hair||(/\bbald\b/.test(desc)?"none":/\blong hair|ponytail|braid/.test(desc)||fem?"long":"short");
      if(kind==="robot") hairStyle="none";
      if(hairStyle!=="none"){ var hc=new t.Mesh(new t.SphereGeometry(0.122,32,20,0,Math.PI*2,0,Math.PI*0.55),hairM); hc.position.y=0.09; hc.rotation.x=-0.25; hc.scale.set(0.97,1.05,1.07); J.head.add(hc);
        if(hairStyle==="long"){ var lh=cap(0.1,0.22,hairM,8); lh.position.set(0,-0.03,0.07); lh.scale.set(1.05,1,0.55); J.head.add(lh); } }
      if(/\b(hood|hooded|cloak)\b/.test(desc)||kind==="wraith"){ var hood=new t.Mesh(new t.SphereGeometry(0.15,24,16,0,Math.PI*2,0,Math.PI*0.62),topM); hood.position.set(0,0.08,0.02); hood.rotation.x=-0.45; J.head.add(hood); }
      if(/\b(helmet|soldier|knight)\b/.test(desc)||kind==="guard"){ var hm=new t.Mesh(new t.SphereGeometry(0.135,24,16,0,Math.PI*2,0,Math.PI*0.5),std(kind==="guard"?"#2a2f33":"#8a9096",0.4,0.7)); hm.position.y=0.1; J.head.add(hm); }
      if(/\b(hat|fedora|witch|wizard)\b/.test(desc)){ var brim=new t.Mesh(new t.CylinderGeometry(0.2,0.2,0.012,32),accM.clone()); brim.material.color.set(col.hair==="#bcbab4"?"#2a2a2e":"#1d1b1a"); brim.position.y=0.18; J.head.add(brim);
        var crown=/\b(witch|wizard)\b/.test(desc)?new t.Mesh(new t.ConeGeometry(0.11,0.34,24),brim.material):new t.Mesh(new t.CylinderGeometry(0.1,0.11,0.12,24),brim.material); crown.position.y=/\b(witch|wizard)\b/.test(desc)?0.35:0.24; J.head.add(crown); }
      if(/\b(glasses|spectacles)\b/.test(desc)){ [-1,1].forEach(function(sx){ var lens=new t.Mesh(new t.TorusGeometry(0.026,0.004,6,20),std("#1a1a1a",0.3,0.8)); lens.position.set(sx*0.042,0.1,-0.112); J.head.add(lens); }); }
      // arms
      J.arms=[];
      [-1,1].forEach(function(sx){
        var sh=pivot(J.spine,sx*(fem?0.2:0.235),0.45,0);
        var up=cap(0.055,0.2,topM); up.position.y=-0.15; sh.add(up);
        var el=pivot(sh,0,-0.29,0); var lo=cap(0.047,0.19,kind==="zombie"?skinM:topM); lo.position.y=-0.13; el.add(lo);
        var hand=new t.Mesh(new t.SphereGeometry(0.052,16,12),skinM); hand.scale.set(0.85,1.1,0.6); hand.position.y=-0.29; el.add(hand);
        var grip=pivot(el,0,-0.31,-0.02);
        J.arms.push({sh:sh,el:el,grip:grip,side:sx});
      });
      // legs
      J.legs=[];
      [-1,1].forEach(function(sx){
        var hp=pivot(J.hips,sx*0.1,-0.04,0);
        var th=cap(0.075,0.3,botM); th.position.y=-0.21; hp.add(th);
        var kn=pivot(hp,0,-0.43,0); var sn=cap(0.062,0.3,botM); sn.position.y=-0.2; kn.add(sn);
        var ft=new t.Mesh(new t.BoxGeometry(0.1,0.07,0.24),shoeM); ft.position.set(0,-0.42,-0.05); kn.add(ft);
        J.legs.push({hp:hp,kn:kn,side:sx});
      });
      // clothing silhouettes
      var outfit=o.outfit||(/\b(robe|gown|dress)\b/.test(desc)||kind==="mage"||kind==="wraith"?"robe":/\b(coat|trench|cloak|duster)\b/.test(desc)?"coat":/\b(armou?r|knight|plate)\b/.test(desc)?"armor":/\b(suit|tuxedo|tux)\b/.test(desc)?"suit":"plain");
      if(outfit==="robe"||outfit==="coat"){ var len=outfit==="robe"?0.84:0.62; var skirt=new t.Mesh(new t.CylinderGeometry(0.2,outfit==="robe"?0.36:0.3,len,32,1,true),std(col.top,0.85,0,{side:t.DoubleSide,transparent:kind==="wraith",opacity:kind==="wraith"?0.55:1})); skirt.position.y=0.12-len/2; skirt.castShadow=true; J.hips.add(skirt); J.skirt=skirt; if(outfit==="robe"&&kind!=="mage") J.legs.forEach(function(l){ l.hp.visible=kind!=="wraith"; }); if(kind==="wraith") J.legs.forEach(function(l){ l.hp.visible=false; }); }
      if(outfit==="armor"){ var plate=new t.Mesh(new t.SphereGeometry(0.22,24,16,0,Math.PI*2,0,Math.PI*0.6),std("#9aa1a8",0.3,0.85)); plate.position.set(0,0.3,-0.02); plate.scale.set(1,1.1,0.8); J.spine.add(plate);
        [-1,1].forEach(function(sx){ var pad=new t.Mesh(new t.SphereGeometry(0.09,16,12,0,Math.PI*2,0,Math.PI*0.5),plate.material); pad.position.set(sx*0.24,0.47,0); J.spine.add(pad); }); }
      if(outfit==="suit"){ var tie=new t.Mesh(new t.BoxGeometry(0.035,0.2,0.01),accM); tie.position.set(0,0.36,-0.135); J.spine.add(tie);
        var shirt=new t.Mesh(new t.BoxGeometry(0.08,0.12,0.008),std("#e6e3dc",0.8)); shirt.position.set(0,0.42,-0.13); J.spine.add(shirt); }
      if(/\b(belt|holster|utility)\b/.test(desc)||kind==="guard"){ var belt=new t.Mesh(new t.TorusGeometry(0.17,0.022,8,32),std("#1b1714",0.6,0.2)); belt.rotation.x=Math.PI/2; belt.scale.set(1,0.75,1); belt.position.y=0.06; J.hips.add(belt); }
      if(/\b(backpack|pack)\b/.test(desc)){ var bp=new t.Mesh(new t.BoxGeometry(0.26,0.32,0.14),std("#4a4030",0.8)); bp.position.set(0,0.3,0.16); J.spine.add(bp); }
      if(/\b(scarf)\b/.test(desc)){ var sc=new t.Mesh(new t.TorusGeometry(0.07,0.03,8,20),accM); sc.rotation.x=Math.PI/2; sc.position.y=0.02; J.neck.add(sc); }
      if(kind==="zombie"||kind==="brute"){ J.spine.rotation.x=0.25; J.head.rotation.z=0.18; }
    }
    root.traverse(function(m){ if(m.isMesh){ m.castShadow=true; m.receiveShadow=false; } });
    var C={ root:root, body:body, J:J, kind:kind, col:col, phase:Math.random()*6, act:null, actT:0, actDur:0, held:null, dead:false, deadT:0, flinch:0, crouch:0, scale:scale, height:1.75*scale, model:null };
    C.hold=function(item){ A._hold(C,item); return C; };
    C.play=function(name,dur){ C.act=name; C.actT=0; C.actDur=dur||(name==="swing"?0.42:name==="shoot"?0.22:name==="cast"?0.5:name==="hit"?0.3:0.4); };
    C.animate=function(dt,speed,run){ A._animate(C,dt,speed,run); };
    if(o.weapon) C.hold(o.weapon);
    if(o.model) A._swapModel(C,o.model);
    return C;
  };

  // things in hand
  A._hold=function(C,item){
    var t=T(); var J=C.J; if(!J.arms) return;
    var g=J.arms[1].grip; if(C.held){ try{ g.remove(C.held); }catch(e){} C.held=null; }
    var it=String(item||"").toLowerCase(); if(!it||it==="fists"||it==="none") return;
    var grp=new t.Group(), metal=std("#2a2c30",0.35,0.85), wood=std("#5a3b22",0.75), glow;
    if(/pistol|gun|revolver|handgun|silenced/.test(it)){ var b=new t.Mesh(new t.BoxGeometry(0.035,0.05,0.2),metal); b.position.set(0,0.02,-0.08); grp.add(b); var hnd=new t.Mesh(new t.BoxGeometry(0.03,0.1,0.045),metal); hnd.position.set(0,-0.03,0); hnd.rotation.x=0.25; grp.add(hnd);
      if(/silenc/.test(it)){ var sl=new t.Mesh(new t.CylinderGeometry(0.014,0.014,0.12,12),metal); sl.rotation.x=Math.PI/2; sl.position.set(0,0.025,-0.24); grp.add(sl); } }
    else if(/rifle|shotgun|smg|carbine/.test(it)){ var bb=new t.Mesh(new t.BoxGeometry(0.04,0.07,0.55),metal); bb.position.set(0,0.03,-0.2); grp.add(bb); var st=new t.Mesh(new t.BoxGeometry(0.035,0.09,0.2),wood); st.position.set(0,-0.01,0.12); grp.add(st); }
    else if(/wand|staff/.test(it)){ var len=/staff/.test(it)?1.3:0.34; var w=new t.Mesh(new t.CylinderGeometry(0.008,0.013,len,10),wood); w.rotation.x=Math.PI/2; w.position.z=-len/2+0.05; grp.add(w);
      glow=new t.Mesh(new t.SphereGeometry(0.018,10,8),new t.MeshBasicMaterial({color:new t.Color("#ffd27a")})); glow.position.z=-len+0.05; grp.add(glow); }
    else if(/sword|blade|katana|machete/.test(it)){ var bl=new t.Mesh(new t.BoxGeometry(0.012,0.06,0.85),std("#c9ced4",0.2,0.95)); bl.position.z=-0.5; grp.add(bl); var gd=new t.Mesh(new t.BoxGeometry(0.16,0.025,0.03),std("#b8923e",0.3,0.8)); gd.position.z=-0.06; grp.add(gd); }
    else if(/knife|dagger/.test(it)){ var kb=new t.Mesh(new t.BoxGeometry(0.01,0.035,0.2),std("#c9ced4",0.2,0.95)); kb.position.z=-0.13; grp.add(kb); }
    else if(/torch|flashlight|lantern/.test(it)){ var fl=new t.Mesh(new t.CylinderGeometry(0.02,0.026,0.18,14),metal); fl.rotation.x=Math.PI/2; fl.position.z=-0.06; grp.add(fl); }
    else if(/axe|hammer|club|bat|pipe|crowbar/.test(it)){ var hdl=new t.Mesh(new t.CylinderGeometry(0.016,0.016,0.6,10),wood); hdl.rotation.x=Math.PI/2; hdl.position.z=-0.25; grp.add(hdl); var hdd=new t.Mesh(new t.BoxGeometry(0.06,0.14,0.08),metal); hdd.position.set(0,0.05,-0.52); grp.add(hdd); }
    else { var gen=new t.Mesh(new t.BoxGeometry(0.06,0.06,0.12),metal); grp.add(gen); }
    grp.traverse(function(m){ if(m.isMesh) m.castShadow=true; });
    g.add(grp); C.held=grp; C.heldKind=it; C.heldTip=glow||null;
  };

  // the animation itself - every pose is computed, so there is nothing to download
  A._animate=function(C,dt,speed,run){
    var J=C.J; if(!J) return;
    if(C.mixer){ A._animateModel(C,dt,speed,run); return; }
    var sp=Math.min(1,speed/(run?5.5:2.2)); var z=C.kind==="zombie"||C.kind==="brute";
    C.phase+=dt*(speed>0.05?(run?10.5:6.6)*(z?0.65:1):1.4);
    var ph=C.phase, s=Math.sin(ph), c=Math.cos(ph);
    if(C.dead){ C.deadT=Math.min(1,C.deadT+dt*1.7); var e=1-Math.pow(1-C.deadT,3);
      C.body.rotation.x=-e*Math.PI/2*(C.fallDir||1); C.body.position.y=e*0.18; if(J.arms) J.arms.forEach(function(a){ a.sh.rotation.x=lerp(a.sh.rotation.x,-2.6,dt*5); }); return; }
    if(C.kind==="beast"){
      J.legs.forEach(function(l,i){ l.rotation.x=Math.sin(ph*1.2+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*0.7*sp; });
      J.hips.position.y=0.62+Math.abs(Math.sin(ph*1.2))*0.06*sp; J.tail.rotation.y=Math.sin(ph*0.7)*0.4;
      J.head.rotation.x=C.act==="swing"?-0.4*Math.sin(Math.PI*C.actT/C.actDur):Math.sin(ph*0.5)*0.05;
      if(C.act){ C.actT+=dt; if(C.actT>=C.actDur) C.act=null; } return;
    }
    var cr=C.crouch=damp(C.crouch,C.wantCrouch?1:0,10,dt);
    // legs
    J.legs.forEach(function(l){ var o=l.side>0?0:Math.PI, k=Math.sin(ph+o);
      l.hp.rotation.x=-k*(run?0.85:0.55)*sp - cr*0.9; l.kn.rotation.x=Math.max(0,Math.sin(ph+o+1.6))*(run?1.25:0.75)*sp + cr*1.5; });
    J.hips.position.y=(0.94-cr*0.32)+(Math.abs(c)*0.045*sp)+(sp<0.1?Math.sin(C.phase*0.5)*0.004:0);
    var lean=(run?0.22:0.06)*sp+cr*0.3+(z?0.28:0);
    J.spine.rotation.x=lean; J.spine.rotation.y=s*0.12*sp; J.hips.rotation.y=-s*0.08*sp;
    J.head.rotation.x=-lean*0.6+(C.kind==="zombie"?Math.sin(C.phase*0.9)*0.1:0);
    // arms
    var aim=C.aiming;
    J.arms.forEach(function(a){ var o=a.side>0?Math.PI:0, k=Math.sin(ph+o);
      var sx=k*(run?0.9:0.5)*sp, ex=-(0.15+(run?0.9:0.35)*sp*(0.5+0.5*Math.sin(ph+o+1)));
      if(z){ sx=-1.35+Math.sin(ph+o)*0.15; ex=-0.15; }
      if(C.kind==="wraith"){ sx=-0.6+Math.sin(C.phase*0.8+o)*0.2; ex=-0.4; }
      if(aim&&(a.side>0||/rifle|shotgun|staff/.test(C.heldKind||""))){ sx=-1.45-(J.spine.rotation.x); ex=-0.05; }
      a.sh.rotation.x=damp(a.sh.rotation.x,sx,14,dt); a.el.rotation.x=damp(a.el.rotation.x,ex,14,dt);
      a.sh.rotation.z=a.side*(0.08+(z?0.1:0)); });
    if(C.kind==="wraith"){ C.body.position.y=0.25+Math.sin(C.phase*0.6)*0.08; }
    // actions on top
    if(C.act){ C.actT+=dt; var k2=clamp(C.actT/C.actDur,0,1), arc=Math.sin(Math.PI*k2), R=J.arms[1];
      if(C.act==="swing"){ R.sh.rotation.x=lerp(-2.4,0.4,k2); R.sh.rotation.z=0.5*arc; R.el.rotation.x=-0.3; J.spine.rotation.y=lerp(0.55,-0.55,k2); }
      else if(C.act==="shoot"){ R.sh.rotation.x=-1.5-0.25*arc; R.el.rotation.x=-0.05+0.2*arc; }
      else if(C.act==="cast"){ J.arms.forEach(function(a){ a.sh.rotation.x=-1.5+0.2*arc; a.el.rotation.x=-0.1; }); J.spine.rotation.x-=0.15*arc; }
      else if(C.act==="hit"){ J.spine.rotation.x-=0.35*arc; J.head.rotation.x-=0.3*arc; }
      else if(C.act==="grab"){ J.arms.forEach(function(a){ a.sh.rotation.x=-1.5; a.el.rotation.x=-0.2*arc; }); }
      else if(C.act==="roll"){ C.body.rotation.x=-Math.PI*2*k2; C.body.position.y=-0.5*arc; }
      if(C.actT>=C.actDur){ C.act=null; C.body.rotation.x=0; C.body.position.y=0; } }
    if(C.heldTip&&C.heldTip.material){ C.heldTip.scale.setScalar(1+Math.sin(C.phase*3)*0.25); }
  };

  // a downloaded rigged model (GLB). The coded body stays until it arrives, and comes back if it fails.
  A._swapModel=function(C,url){
    try{
      var go=function(){ var L=new (T().GLTFLoader)(); L.load(url,function(g){
        try{ var m=g.scene; var b=new (T().Box3)().setFromObject(m), h=(b.max.y-b.min.y)||1; m.scale.setScalar(1.75*C.scale/h); m.position.y=-b.min.y*m.scale.y;
          m.rotation.y=Math.PI; m.traverse(function(x){ if(x.isMesh){ x.castShadow=true; x.frustumCulled=false; } });
          C.body.visible=false; C.root.add(m); C.model=m; C.mixer=new (T().AnimationMixer)(m); C.clips={};
          (g.animations||[]).forEach(function(cl){ var n=cl.name.toLowerCase(), key=/idle|stand/.test(n)?"idle":/run|sprint/.test(n)?"run":/walk/.test(n)?"walk":/punch|attack|slash|swing|sword/.test(n)?"swing":/shoot|gun|fire/.test(n)?"shoot":/death|die|dead/.test(n)?"die":/hit|hurt|damage|recieve|receive/.test(n)?"hit":/jump/.test(n)?"jump":null;
            if(key&&!C.clips[key]) C.clips[key]=C.mixer.clipAction(cl); });
          C.cur=null;
        }catch(e){} },undefined,function(){}); };
      if(T().GLTFLoader) go(); else if(window.__spineExtras) window.__spineExtras({models:true},function(){ if(T().GLTFLoader) go(); });
    }catch(e){}
  };
  A._animateModel=function(C,dt,speed,run){
    var want=C.dead?"die":(C.act&&C.clips[C.act])?C.act:(speed>3.5&&C.clips.run)?"run":(speed>0.2&&C.clips.walk)?"walk":"idle";
    if(!C.clips[want]) want="idle";
    if(C.cur!==want&&C.clips[want]){ var a=C.clips[want]; a.reset(); if(want==="die"){ a.setLoop(T().LoopOnce); a.clampWhenFinished=true; } a.fadeIn(0.18).play(); if(C.clips[C.cur]) C.clips[C.cur].fadeOut(0.18); C.cur=want; }
    if(C.act){ C.actT+=dt; if(C.actT>=C.actDur) C.act=null; }
    C.mixer.update(dt);
  };

  // ════════════════════════════════════════════════════════════════════════
  //  BUILDING A LEVEL. Rooms with doorways, corridors, stairs, props, lamps.
  //  Everything is solid where it should be, lit properly, and textured with
  //  a real scanned material when one is asked for by name.
  // ════════════════════════════════════════════════════════════════════════
  A._mats={};
  // 'oak floorboards' -> a placeholder colour now, a scanned PBR material when it arrives
  A.mat=function(spec,repeat){
    var t=T(); if(spec&&spec.isMaterial) return spec;
    var s=String(spec||"#777");
    if(/^#|^rgb/.test(s)) return std(s,0.8);
    var key=s+"|"+(repeat||2); if(A._mats[key]) return A._mats[key];
    var guess=/wood|oak|plank|floorboard/.test(s)?"#5e4630":/marble|white/.test(s)?"#cfcac0":/brick/.test(s)?"#7a4a3a":/metal|steel|iron/.test(s)?"#6a6e74":/concrete|cement/.test(s)?"#7d7b77":/stone|rock|cobble/.test(s)?"#6f6a62":/tile/.test(s)?"#8e8a80":/carpet|rug/.test(s)?"#5a2a2a":/grass|moss/.test(s)?"#3d5a2a":/dirt|mud|soil/.test(s)?"#4a3a2a":/wallpaper|plaster/.test(s)?"#8a7a62":"#7a7570";
    var m=std(guess,0.8); A._mats[key]=m;
    try{ var Wd=W(); if(Wd&&Wd.pbr) Promise.resolve(Wd.pbr(s,{repeat:repeat||2})).then(function(r){ try{ if(r&&r.isMaterial){ ["map","normalMap","roughnessMap","aoMap"].forEach(function(k){ if(r[k]){ m[k]=r[k]; } }); if(r.map) m.color.set("#ffffff"); m.roughness=r.roughness!=null?r.roughness:m.roughness; m.needsUpdate=true; } }catch(e){} }).catch(function(){}); }catch(e){}
    return m;
  };
  function addMesh(geo,mat,x,y,z,opts){ var t=T(); var m=new t.Mesh(geo,mat); m.position.set(x,y,z); if(opts&&opts.rot) m.rotation.y=opts.rot; m.receiveShadow=true; m.castShadow=!(opts&&opts.noShadow); W().scene.add(m); return m; }
  A.box=function(x,z,w,d,h,opts){ opts=opts||{}; var y=(opts.y||0); var m=addMesh(new (T().BoxGeometry)(w,h,d),A.mat(opts.material||opts.color||"#6a6560",opts.repeat),x,y+h/2,z,opts);
    if(opts.solid!==false) A.solid(m); if(opts.floor) m.userData.noFrame=true; return m; };
  A.wall=function(x1,z1,x2,z2,opts){ opts=opts||{}; var dx=x2-x1, dz=z2-z1, L=Math.sqrt(dx*dx+dz*dz)||0.1, h=opts.height||3, th=opts.thick||0.2;
    var m=addMesh(new (T().BoxGeometry)(L,h,th),A.mat(opts.material||"plaster wall",opts.repeat||Math.max(1,Math.round(L/3))),(x1+x2)/2,(opts.y||0)+h/2,(z1+z2)/2,{rot:-Math.atan2(dz,dx)});
    A.solid(m); return m; };
  A.floor=function(x,z,w,d,opts){ opts=opts||{}; var t=T(); var g=new t.PlaneGeometry(w,d); var m=new t.Mesh(g,A.mat(opts.material||"stone floor",opts.repeat||Math.max(1,Math.round(Math.max(w,d)/3))));
    m.rotation.x=-Math.PI/2; m.position.set(x,(opts.y||0)+0.001,z); m.receiveShadow=true; m.userData.noFrame=true; W().scene.add(m);
    if(opts.y) A._addBox(x,z,w/2,d/2,0,opts.y-0.2,opts.y,m); return m; };
  // A room: four walls with gaps for doorways, a floor, an optional ceiling and its own light.
  // doors: [{side:'n'|'s'|'e'|'w', at:0.5 (fraction along the wall), width:1.4}]
  A.room=function(o){
    o=o||{}; var at=o.at||[0,0], cx=at[0], cz=at[1], sz=o.size||[8,8], w=sz[0], d=sz[1], h=o.height||3.2, y=o.y||0;
    var g={walls:[],floor:null,ceiling:null,lights:[]};
    g.floor=A.floor(cx,cz,w,d,{material:o.floor||"old oak floorboards",y:y});
    if(y>0) A._addBox(cx,cz,w/2,d/2,0,y-0.2,y,g.floor);
    var sides={n:[[cx-w/2,cz-d/2],[cx+w/2,cz-d/2]], s:[[cx-w/2,cz+d/2],[cx+w/2,cz+d/2]], w:[[cx-w/2,cz-d/2],[cx-w/2,cz+d/2]], e:[[cx+w/2,cz-d/2],[cx+w/2,cz+d/2]]};
    var doors=o.doors||[];
    Object.keys(sides).forEach(function(k){
      if(o.open&&o.open.indexOf(k)>=0) return;
      var a=sides[k][0], b=sides[k][1], len=(k==="n"||k==="s")?w:d;
      var gaps=doors.filter(function(dr){ return dr.side===k; }).map(function(dr){ var c=(dr.at==null?0.5:dr.at)*len, hw=(dr.width||1.4)/2; return [c-hw,c+hw]; }).sort(function(p,q){ return p[0]-q[0]; });
      var cur=0; var seg=function(s0,s1){ if(s1-s0<0.05) return; var p0=[lerp(a[0],b[0],s0/len),lerp(a[1],b[1],s0/len)], p1=[lerp(a[0],b[0],s1/len),lerp(a[1],b[1],s1/len)]; g.walls.push(A.wall(p0[0],p0[1],p1[0],p1[1],{height:h,material:o.walls||"aged plaster wall",y:y})); };
      gaps.forEach(function(gp){ seg(cur,gp[0]); // lintel over the doorway
        var lh=h-(gp.h||2.3); if(lh>0.05){ var p0=[lerp(a[0],b[0],gp[0]/len),lerp(a[1],b[1],gp[0]/len)], p1=[lerp(a[0],b[0],gp[1]/len),lerp(a[1],b[1],gp[1]/len)];
          var lin=addMesh(new (T().BoxGeometry)(Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),lh,0.2),A.mat(o.walls||"aged plaster wall"),(p0[0]+p1[0])/2,y+h-lh/2,(p0[1]+p1[1])/2,{rot:-Math.atan2(p1[1]-p0[1],p1[0]-p0[0])}); A.solid(lin); }
        cur=gp[1]; });
      seg(cur,len);
    });
    if(o.ceiling!==false){ var t=T(); var cg=new t.Mesh(new t.PlaneGeometry(w,d),A.mat(o.ceilingMaterial||"#4a4540")); cg.rotation.x=Math.PI/2; cg.position.set(cx,y+h,cz); cg.userData.noFrame=true; cg.receiveShadow=true; W().scene.add(cg); g.ceiling=cg; }
    if(o.light!==false){ var lo=o.light||{}; g.lights.push(A.lamp([cx,y+h-0.35,cz],{color:lo.color||"#ffd9a8",intensity:lo.intensity,flicker:lo.flicker,kind:o.ceiling===false?"none":"ceiling",range:Math.max(w,d)*1.3})); }
    return g;
  };
  A.corridor=function(from,to,o){ o=o||{}; var wd=o.width||2, dx=to[0]-from[0], dz=to[1]-from[1], L=Math.hypot(dx,dz), nx=-dz/L*wd/2, nz=dx/L*wd/2;
    A.floor((from[0]+to[0])/2,(from[1]+to[1])/2,1,1,{}).geometry.dispose();
    var t=T(); var fl=new t.Mesh(new t.PlaneGeometry(L,wd),A.mat(o.floor||"worn stone tiles",Math.max(1,Math.round(L/2)))); fl.rotation.x=-Math.PI/2; fl.rotation.z=Math.atan2(-dz,dx); fl.position.set((from[0]+to[0])/2,(o.y||0)+0.002,(from[1]+to[1])/2); fl.receiveShadow=true; fl.userData.noFrame=true; W().scene.add(fl);
    A.wall(from[0]+nx,from[1]+nz,to[0]+nx,to[1]+nz,{height:o.height||3,material:o.walls}); A.wall(from[0]-nx,from[1]-nz,to[0]-nx,to[1]-nz,{height:o.height||3,material:o.walls});
    var n=Math.max(1,Math.floor(L/7)); for(var i=0;i<n;i++){ var k=(i+0.5)/n; A.lamp([lerp(from[0],to[0],k),(o.y||0)+(o.height||3)-0.3,lerp(from[1],to[1],k)],{color:o.lightColor||"#ffcf98",flicker:o.flicker,kind:"ceiling",range:8}); }
    return fl; };
  // a sloped walkway or staircase from height ya to yb along its length
  A.stairs=function(o){ o=o||{}; var t=T(); var at=o.at||[0,0], w=o.width||2, len=o.length||4, ya=o.from||0, yb=o.to||3, rot=o.rot||0, steps=Math.max(3,Math.round(Math.abs(yb-ya)/0.18));
    var grp=new t.Group(); grp.position.set(at[0],0,at[1]); grp.rotation.y=rot; var mat=A.mat(o.material||"worn stone steps");
    for(var i=0;i<steps;i++){ var hgt=ya+(yb-ya)*(i+1)/steps; var st=new t.Mesh(new t.BoxGeometry(w,Math.max(0.05,hgt-Math.min(ya,yb)+0.02),len/steps),mat); st.position.set(0,(hgt+Math.min(ya,yb))/2,-len/2+len*(i+0.5)/steps); st.castShadow=true; st.receiveShadow=true; grp.add(st); }
    W().scene.add(grp);
    var rp={cx:at[0],cz:at[1],hx:w/2,hz:len/2,rot:rot,ya:ya,yb:yb}; rp.c=Math.cos(rot); rp.s=Math.sin(rot);
    // stored so that local -z is the 'from' end
    rp.ya=yb; rp.yb=ya; A._ramps.push(rp); A._navDirty=true; return grp; };

  // ── LIGHT. Lamps flicker, candles gutter, and only the nearest few are switched on, so a
  //    mansion with forty lamps still runs on a phone.
  A._lamps=[];
  A.lamp=function(at,o){ o=o||{}; var t=T(); var col=new t.Color(o.color||"#ffcf9a");
    var L=new t.PointLight(col,o.intensity!=null?o.intensity:6,o.range||10,1.6); L.position.set(at[0],at[1],at[2]); W().scene.add(L);
    var bulb=null; if(o.kind!=="none"){ var kind=o.kind||"bulb";
      if(kind==="candle"){ bulb=new t.Group(); var wax=new t.Mesh(new t.CylinderGeometry(0.03,0.035,0.18,12),std("#e8dfcc",0.6)); wax.position.y=-0.09; bulb.add(wax); var fl=new t.Mesh(new t.SphereGeometry(0.022,10,8),new t.MeshBasicMaterial({color:col})); fl.scale.y=1.8; fl.position.y=0.03; bulb.add(fl); }
      else if(kind==="torch"){ bulb=new t.Group(); var st=new t.Mesh(new t.CylinderGeometry(0.03,0.04,0.5,10),std("#3a2a1a",0.8)); st.position.y=-0.25; bulb.add(st); var fl2=new t.Mesh(new t.ConeGeometry(0.07,0.22,12),new t.MeshBasicMaterial({color:new t.Color("#ffb347")})); fl2.position.y=0.06; bulb.add(fl2); }
      else { bulb=new t.Group(); var sh=new t.Mesh(new t.ConeGeometry(0.22,0.18,24,1,true),std("#2a2622",0.5,0.6,{side:t.DoubleSide})); sh.position.y=0.06; bulb.add(sh); var bl=new t.Mesh(new t.SphereGeometry(0.06,14,10),new t.MeshBasicMaterial({color:col})); bulb.add(bl);
        if(kind==="ceiling"){ var cord=new t.Mesh(new t.CylinderGeometry(0.006,0.006,0.3,6),std("#111",0.5)); cord.position.y=0.3; bulb.add(cord); } }
      bulb.position.copy(L.position); W().scene.add(bulb); }
    var rec={light:L,bulb:bulb,base:L.intensity,flicker:o.flicker==null?(o.kind==="candle"||o.kind==="torch"?0.25:0):(o.flicker===true?0.6:o.flicker),ph:Math.random()*10,on:true,broken:!!o.broken};
    A._lamps.push(rec); return rec; };
  A._updateLamps=function(dt,t){
    var P=A.player&&A.player.pos; var maxOn=A._q.lights;
    if(P&&(!A._lampT||t-A._lampT>0.4)){ A._lampT=t;
      var sorted=A._lamps.slice().sort(function(a,b){ return a.light.position.distanceToSquared(P)-b.light.position.distanceToSquared(P); });
      for(var i=0;i<sorted.length;i++) sorted[i].light.visible=sorted[i].on&&i<maxOn; }
    for(var j=0;j<A._lamps.length;j++){ var l=A._lamps[j]; if(!l.light.visible) continue;
      var f=l.flicker?(1-l.flicker*0.5+l.flicker*0.5*Math.sin(t*13+l.ph)*Math.sin(t*7.3+l.ph*2)):1;
      if(l.broken&&Math.sin(t*2.1+l.ph)>0.85) f*=Math.random()<0.5?0.05:1;
      l.light.intensity=l.base*f; }
  };

  // ── PROPS. Named things built from shapes: solid, lit, varied.
  A.prop=function(kind,at,o){
    o=o||{}; var t=T(); var k=String(kind||"crate").toLowerCase(); var g=new t.Group(); var r=o.rot||0; var solid=o.solid!==false;
    var wood=A.mat(o.material||"dark varnished wood"), metal=std("#4a4d52",0.4,0.8), cloth=std(o.color||"#5a2a2a",0.9), stone=A.mat("rough stone");
    var add=function(geo,mat,x,y,z){ var m=new t.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; g.add(m); return m; };
    if(/crate|box/.test(k)){ var s=o.size||0.9; add(new t.BoxGeometry(s,s,s),A.mat("wooden crate planks",1),0,s/2,0); }
    else if(/barrel/.test(k)){ add(new t.CylinderGeometry(0.38,0.38,1.0,24),wood,0,0.5,0); [0.15,0.85].forEach(function(y){ add(new t.TorusGeometry(0.385,0.02,6,28),metal,0,y,0).rotation.x=Math.PI/2; }); }
    else if(/table|desk/.test(k)){ var w=o.w||1.6, d=o.d||0.9; add(new t.BoxGeometry(w,0.06,d),wood,0,0.76,0); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p){ add(new t.BoxGeometry(0.07,0.74,0.07),wood,p[0]*(w/2-0.06),0.37,p[1]*(d/2-0.06)); }); }
    else if(/chair/.test(k)){ add(new t.BoxGeometry(0.46,0.05,0.46),wood,0,0.46,0); add(new t.BoxGeometry(0.46,0.5,0.05),wood,0,0.72,0.21); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p){ add(new t.BoxGeometry(0.04,0.46,0.04),wood,p[0]*0.2,0.23,p[1]*0.2); }); solid=o.solid===true; }
    else if(/shel|bookcase/.test(k)){ var bw=o.w||1.8; add(new t.BoxGeometry(bw,2.2,0.4),wood,0,1.1,0); for(var s2=0;s2<4;s2++){ for(var b=0;b<Math.floor(bw/0.07);b++){ if(Math.random()<0.15) continue; var hh=rnd(0.2,0.3); var bk=add(new t.BoxGeometry(0.055,hh,0.26),std(["#5a2a22","#2a3a4a","#3a4a2a","#6a5a3a","#2a2a2a"][b%5],0.85),-bw/2+0.08+b*0.07,0.15+s2*0.52+hh/2,-0.06); bk.rotation.z=rnd(-0.06,0.06); } } }
    else if(/bed/.test(k)){ add(new t.BoxGeometry(1.5,0.45,2.1),wood,0,0.22,0); add(new t.BoxGeometry(1.4,0.18,2.0),cloth,0,0.52,0); add(new t.BoxGeometry(1.5,1.1,0.08),wood,0,0.55,-1.05); }
    else if(/pillar|column/.test(k)){ var ph=o.height||3.2; add(new t.CylinderGeometry(0.28,0.32,ph,32),A.mat(o.material||"white marble"),0,ph/2,0); add(new t.BoxGeometry(0.75,0.18,0.75),stone,0,0.09,0); add(new t.BoxGeometry(0.75,0.18,0.75),stone,0,ph-0.09,0); }
    else if(/statue/.test(k)){ add(new t.BoxGeometry(0.9,1,0.9),stone,0,0.5,0); var fig=A.makeCharacter({look:o.look||"robed figure",kind:"hero",colors:{skin:"#8a8680",hair:"#8a8680",top:"#8a8680",bottom:"#8a8680",shoe:"#8a8680",accent:"#8a8680"}}); fig.root.position.y=1; fig.root.scale.setScalar(1.15); g.add(fig.root); }
    else if(/car|vehicle/.test(k)){ var paint=std(o.color||"#1d2a3a",0.25,0.7); add(new t.BoxGeometry(1.9,0.6,4.4),paint,0,0.55,0); add(new t.BoxGeometry(1.7,0.55,2.2),std("#151a20",0.1,0.6),0,1.1,0.2); [[-1,-1.4],[1,-1.4],[-1,1.4],[1,1.4]].forEach(function(p){ var wh=add(new t.CylinderGeometry(0.36,0.36,0.26,20),std("#111",0.8),p[0]*0.92,0.36,p[1]); wh.rotation.z=Math.PI/2; });
      add(new t.BoxGeometry(0.3,0.12,0.04),new t.MeshBasicMaterial({color:"#fff3c8"}),-0.6,0.62,-2.21); add(new t.BoxGeometry(0.3,0.12,0.04),new t.MeshBasicMaterial({color:"#fff3c8"}),0.6,0.62,-2.21); }
    else if(/tree/.test(k)){ var th=o.height||rnd(4,7); add(new t.CylinderGeometry(0.12,0.26,th*0.6,12),A.mat("tree bark"),0,th*0.3,0); for(var f=0;f<5;f++){ add(new t.IcosahedronGeometry(rnd(0.9,1.5),1),std(o.color||["#2f4a26","#3a5a2a","#2a4022"][f%3],0.9),rnd(-0.6,0.6),th*0.6+rnd(0,1.4),rnd(-0.6,0.6)); } }
    else if(/rock|boulder/.test(k)){ var rk=add(new t.DodecahedronGeometry(o.size||rnd(0.6,1.4),1),stone,0,(o.size||1)*0.5,0); rk.scale.y=rnd(0.6,0.9); rk.rotation.y=rnd(0,3); }
    else if(/fence|railing/.test(k)){ var fw=o.w||4; add(new t.BoxGeometry(fw,0.06,0.06),metal,0,1.0,0); add(new t.BoxGeometry(fw,0.06,0.06),metal,0,0.5,0); for(var p2=0;p2<=fw/0.5;p2++) add(new t.BoxGeometry(0.04,1.1,0.04),metal,-fw/2+p2*0.5,0.55,0); }
    else if(/chest|trunk/.test(k)){ add(new t.BoxGeometry(0.9,0.5,0.55),wood,0,0.25,0); var lid=add(new t.CylinderGeometry(0.275,0.275,0.9,20,1,false,0,Math.PI),wood,0,0.5,0); lid.rotation.z=Math.PI/2; add(new t.BoxGeometry(0.1,0.12,0.04),std("#b8923e",0.3,0.8),0,0.45,-0.29); }
    else if(/computer|terminal|console|monitor/.test(k)){ add(new t.BoxGeometry(1.2,0.75,0.6),metal,0,0.375,0); var scr=add(new t.BoxGeometry(0.6,0.42,0.04),new t.MeshBasicMaterial({color:new t.Color(o.color||"#3ad0a0")}),0,1.05,0); scr.userData.screen=true; add(new t.BoxGeometry(0.66,0.48,0.03),std("#111",0.4),0,1.05,0.03); }
    else if(/cabinet|locker|wardrobe/.test(k)){ add(new t.BoxGeometry(0.9,1.9,0.55),/locker/.test(k)?metal:wood,0,0.95,0); add(new t.BoxGeometry(0.02,1.7,0.02),std("#111",0.5),0,0.95,-0.28); }
    else if(/painting|portrait|picture/.test(k)){ var pw=o.w||1, phh=o.h||1.3; add(new t.BoxGeometry(pw+0.12,phh+0.12,0.05),std("#6a4f22",0.4,0.7),0,1.7,0); var cv=add(new t.PlaneGeometry(pw,phh),std(o.color||"#3a3028",0.9),0,1.7,-0.03); cv.rotation.y=Math.PI;
      if(o.image&&window.Spine&&window.Spine.image) window.Spine.image(o.image,{}).then(function(u){ try{ var src=u&&(u.url||u.dataUrl||u); if(typeof src==="string"){ new t.TextureLoader().load(src,function(tx){ tx.colorSpace=t.SRGBColorSpace; cv.material.map=tx; cv.material.color.set("#fff"); cv.material.needsUpdate=true; }); } }catch(e){} }).catch(function(){}); solid=false; }
    else if(/plant|pot/.test(k)){ add(new t.CylinderGeometry(0.22,0.16,0.4,16),std("#7a4a32",0.8),0,0.2,0); for(var lf=0;lf<7;lf++){ var leaf=add(new t.SphereGeometry(0.18,10,8),std("#2e5a2a",0.8),rnd(-0.2,0.2),0.55+rnd(0,0.4),rnd(-0.2,0.2)); leaf.scale.set(1,0.5,0.6); } solid=false; }
    else if(/coffin|grave|tomb/.test(k)){ add(new t.BoxGeometry(0.8,0.6,2.0),/coffin/.test(k)?wood:stone,0,0.3,0); if(!/coffin/.test(k)) add(new t.BoxGeometry(0.8,1.0,0.15),stone,0,0.5,-1.0); }
    else if(/cauldron/.test(k)){ add(new t.SphereGeometry(0.45,24,16,0,Math.PI*2,Math.PI*0.35,Math.PI*0.65),std("#1b1b1d",0.5,0.6),0,0.5,0); var brew=add(new t.CircleGeometry(0.38,24),new t.MeshBasicMaterial({color:new t.Color(o.color||"#5aff9a")}),0,0.62,0); brew.rotation.x=-Math.PI/2; }
    else { add(new t.BoxGeometry(0.8,0.8,0.8),wood,0,0.4,0); }
    g.position.set(at[0],o.y||0,at[1]); g.rotation.y=r; if(o.scale) g.scale.setScalar(o.scale);
    W().scene.add(g); if(solid) A.solid(g.children.length===1?g.children[0]:g,{}); g.userData.kind=k; return g;
  };
  // scatter many of a kind around a centre without overlapping the path
  A.scatter=function(kind,n,center,radius,o){ var out=[]; for(var i=0;i<n;i++){ var a=Math.random()*Math.PI*2, rr=Math.sqrt(Math.random())*(radius||10); out.push(A.prop(kind,[center[0]+Math.cos(a)*rr,center[1]+Math.sin(a)*rr],Object.assign({rot:Math.random()*6.28},o||{}))); } return out; };

  // ════════════════════════════════════════════════════════════════════════
  //  THE LOOK. One word sets lighting, fog, colour grade, grain, music and
  //  the hero's torch: horror, spy, magic, action, mystery, scifi, fantasy.
  // ════════════════════════════════════════════════════════════════════════
  var LOOKS={
    horror:{fog:"#07080a",fogD:0.085,amb:0.08,exposure:0.85,grade:"contrast(1.12) saturate(0.7) brightness(0.95)",grain:0.11,vig:0.85,torch:true,music:{tension:0.7,energy:0.2,bpm:70,root:50},bloom:0.6},
    spy:{fog:"#0d1520",fogD:0.018,amb:0.35,exposure:1.0,grade:"contrast(1.08) saturate(0.85) hue-rotate(-6deg)",grain:0.04,vig:0.5,torch:false,music:{tension:0.45,energy:0.5,bpm:112,root:52},bloom:0.7},
    magic:{fog:"#1a1426",fogD:0.03,amb:0.45,exposure:1.08,grade:"contrast(1.04) saturate(1.15) sepia(0.08)",grain:0.03,vig:0.45,torch:false,music:{tension:0.25,energy:0.35,bpm:84,root:57},bloom:1.1},
    fantasy:{fog:"#9fb3c4",fogD:0.012,amb:0.6,exposure:1.1,grade:"saturate(1.1)",grain:0.02,vig:0.35,torch:false,music:{tension:0.2,energy:0.45,bpm:92,root:55},bloom:0.8},
    mystery:{fog:"#141618",fogD:0.04,amb:0.25,exposure:0.95,grade:"contrast(1.1) saturate(0.6) sepia(0.15)",grain:0.07,vig:0.7,torch:true,music:{tension:0.5,energy:0.25,bpm:76,root:53},bloom:0.6},
    scifi:{fog:"#05101a",fogD:0.025,amb:0.3,exposure:1.0,grade:"contrast(1.1) saturate(1.05) hue-rotate(8deg)",grain:0.03,vig:0.5,torch:true,music:{tension:0.45,energy:0.45,bpm:100,root:48},bloom:1.2},
    action:{fog:"#7a8a99",fogD:0.01,amb:0.6,exposure:1.05,grade:"contrast(1.1) saturate(1.12)",grain:0.02,vig:0.35,torch:false,music:{tension:0.4,energy:0.7,bpm:128,root:52},bloom:0.7}
  };
  A.look=function(genre,o){
    o=o||{}; var t=T(), Wd=W(); var g=String(genre||"action").toLowerCase();
    if(/horror|zombie|survival|haunt|scary/.test(g)) g="horror"; else if(/spy|stealth|agent|heist|espionage/.test(g)) g="spy"; else if(/magic|wizard|witch|spell|school of/.test(g)) g="magic";
    else if(/sci|space|cyber|future/.test(g)) g="scifi"; else if(/myster|detective|noir/.test(g)) g="mystery"; else if(/fantasy|knight|dragon|medieval/.test(g)) g="fantasy"; else if(!LOOKS[g]) g="action";
    var L=Object.assign({},LOOKS[g],o); A.cfg.genre=g; A._lookCfg=L;
    try{ Wd.scene.fog=new t.FogExp2(new t.Color(L.fog),L.fogD); if(!Wd.scene.background||Wd.scene.background.isColor) Wd.scene.background=new t.Color(L.fog); }catch(e){}
    try{ if(!A._amb){ A._amb=new t.HemisphereLight(0xbfd2ff,0x1a1612,L.amb); Wd.scene.add(A._amb); } else A._amb.intensity=L.amb; }catch(e){}
    try{ Wd.renderer.toneMappingExposure=L.exposure; Wd._autoExposed=true; }catch(e){}
    try{ if(Wd._bloom&&Wd._bloom.strength!=null) Wd._bloom.strength=L.bloom*0.55; }catch(e){}
    A._applyGrade(); if(L.torch&&A.player&&A.player.torch==null) A.flashlight(true);
    try{ if(A._music) A._music.set(L.music); }catch(e){}
    return A;
  };
  A._applyGrade=function(){ var L=A._lookCfg||LOOKS.action, q=A._q||{};
    try{ var c=W().renderer.domElement; c.style.filter=q.grade?L.grade:""; }catch(e){}
    var g=document.getElementById("__advGrain"), v=document.getElementById("__advVig");
    if(g) g.style.opacity=q.grain?String(L.grain):"0"; if(v) v.style.opacity=String(L.vig); };
  // ── QUALITY. Phones get a lighter mix automatically; the pause menu can change it.
  A._qPresets={low:{pr:1,shadows:false,fx:false,lights:4,grade:false,grain:false,far:60,name:"Smooth"},medium:{pr:1.5,shadows:false,fx:true,lights:6,grade:true,grain:true,far:90,name:"Balanced"},high:{pr:2,shadows:true,fx:true,lights:8,grade:true,grain:true,far:140,name:"Cinematic"}};
  A.quality=function(level){
    if(!level){ var ua=navigator.userAgent||"", phone=/iPhone|Android.+Mobile/.test(ua), mem=navigator.deviceMemory||4; level=phone?(mem>=6?"medium":"low"):"high"; }
    A.cfg.quality=level; A._q=A._qPresets[level]||A._qPresets.medium;
    try{ var Wd=W(); Wd._prMax=A._q.pr; Wd._pr=Math.min(Wd._pr||1,A._q.pr); Wd.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,Wd._pr)); Wd.renderer.shadowMap.enabled=A._q.shadows||!!(A._lookCfg&&A._lookCfg.torch);
      if(!A._q.fx){ Wd._noAutoFx=true; Wd._fxBroken=true; } else { Wd._fxBroken=false; Wd._noAutoFx=false; }
      if(Wd.camera){ Wd.camera.far=A._q.far*2; Wd.camera.updateProjectionMatrix(); } }catch(e){}
    A._applyGrade(); return A;
  };
  A._q=A._qPresets.medium;
  // the hero's torch: a real shadow-casting spotlight on the high setting
  A.flashlight=function(on){
    var t=T(); var P=A.player; if(!P) { A._wantTorch=on!==false; return A; }
    if(on===false){ if(P.torch){ P.torch.visible=false; } P.torchOn=false; return A; }
    if(!P.torch){ var s=new t.SpotLight(0xfff1d6,38,26,0.42,0.45,1.4); s.castShadow=!!(A._q&&A._q.shadows); s.shadow.mapSize.set(1024,1024); s.shadow.bias=-0.0006; s.shadow.camera.near=0.2;
      W().scene.add(s); W().scene.add(s.target); P.torch=s; }
    P.torch.visible=true; P.torchOn=true; return A;
  };

  // ════════════════════════════════════════════════════════════════════════
  //  THE HERO
  // ════════════════════════════════════════════════════════════════════════
  var WEAPONS={
    fists:{kind:"melee",dmg:12,range:1.4,arc:1.6,cd:0.45,sound:"swing"},
    knife:{kind:"melee",dmg:28,range:1.5,arc:1.4,cd:0.38,sound:"slash",silent:true},
    sword:{kind:"melee",dmg:40,range:2.1,arc:2.0,cd:0.55,sound:"slash"},
    axe:{kind:"melee",dmg:48,range:1.9,arc:1.6,cd:0.75,sound:"slash"},
    pipe:{kind:"melee",dmg:30,range:1.8,arc:1.6,cd:0.6,sound:"swing"},
    pistol:{kind:"gun",dmg:34,range:28,cd:0.32,clip:12,noise:16,sound:"shot",spread:0.02},
    silenced:{kind:"gun",dmg:40,range:26,cd:0.38,clip:10,noise:3,sound:"silenced",spread:0.015},
    shotgun:{kind:"gun",dmg:90,range:11,cd:0.9,clip:6,noise:22,sound:"shotgun",spread:0.09},
    rifle:{kind:"gun",dmg:45,range:40,cd:0.14,clip:30,noise:22,sound:"shot",spread:0.03},
    wand:{kind:"spell",dmg:30,range:24,cd:0.42,mana:8,noise:6,sound:"spell",color:"#ffd27a"},
    staff:{kind:"spell",dmg:44,range:26,cd:0.6,mana:12,noise:8,sound:"spell",color:"#8fd0ff"}
  };
  A.weaponInfo=function(name){ var n=String(name||"fists").toLowerCase(); for(var k in WEAPONS) if(n.indexOf(k)>=0) return Object.assign({name:k},WEAPONS[k]); if(/gun|revolver|handgun/.test(n)) return Object.assign({name:"pistol"},WEAPONS.pistol); if(/blade|katana|machete/.test(n)) return Object.assign({name:"sword"},WEAPONS.sword); if(/bat|club|crowbar|hammer/.test(n)) return Object.assign({name:"pipe"},WEAPONS.pipe); return Object.assign({name:"fists"},WEAPONS.fists); };
  A.player=null;
  A.hero=A.makePlayer=function(o){ return A.playerSetup(o); };
  A.playerSetup=function(o){
    A._gameOn(); o=o||{}; var t=T();
    if(A.player&&A.player.char){ try{ W().scene.remove(A.player.char.root); }catch(e){} }
    var at=o.at||A._spawn||[0,0,4];
    var C=A.makeCharacter({look:o.look||"a determined hero in a dark jacket",kind:o.kind||"hero",colors:o.colors,hair:o.hair,outfit:o.outfit,model:o.model,weapon:null});
    W().scene.add(C.root);
    var P={char:C,pos:new t.Vector3(at[0],at.length>2?at[1]:0,at.length>2?at[2]:at[1]),vel:new t.Vector3(),vy:0,yaw:o.face!=null?o.face*Math.PI/180:Math.PI,
      speed:o.speed||3.6,onGround:true,inv:0,aiming:false,cd:0,noise:0,torch:null,torchOn:false,name:o.name||"You",weapons:[],weapon:null,clip:{},reload:0};
    if(at.length===2) P.pos.y=A.groundAt(P.pos.x,P.pos.z,50);
    A.player=P; A.state.maxHealth=o.health||A.state.maxHealth||100; if(!A._carried) A.state.health=A.state.maxHealth;
    A._camYaw=P.yaw; A._camPitch=-0.12;
    var carried=(A.state.weaponNames||[]).slice();
    var ws=o.weapons||(o.weapon?[o.weapon]:(carried.length?[]:["fists"])); ws.forEach(function(w){ A.giveWeapon(w,true); });
    carried.forEach(function(w){ A.giveWeapon(w,true); });
    A.equip(o.weapon||(carried.length?carried[carried.length-1]:P.weapons[0]));
    if(o.ammo!=null) A.state.ammo[A.weaponInfo(P.weapon).name]=o.ammo;
    if(o.flashlight||A._wantTorch||(A._lookCfg&&A._lookCfg.torch&&o.flashlight!==false)) A.flashlight(true);
    A.view(o.view||A.cfg.view||"third");
    // the 'hero light': films and games light the lead separately so they never go to silhouette
    try{ if(!A._heroLight){ A._heroLight=new t.PointLight(0xffe2c4,2.2,5,1.6); W().scene.add(A._heroLight); } }catch(e){}
    A._checkpoint=null; A.checkpoint(); A._navDirty=true;
    return P;
  };
  A.giveWeapon=function(w,quiet){ var P=A.player; if(!P) return; var info=A.weaponInfo(w); if(P.weapons.indexOf(info.name)<0) P.weapons.push(info.name);
    A.state.weaponNames=P.weapons.slice(); if(info.clip&&P.clip[info.name]==null) P.clip[info.name]=info.clip; if(info.kind==="gun"&&A.state.ammo[info.name]==null) A.state.ammo[info.name]=info.clip*2;
    if(!quiet){ A.toast("New weapon: "+info.name); A.equip(info.name); } A._hudDirty=true; };
  A.equip=function(w){ var P=A.player; if(!P) return; var info=A.weaponInfo(w); P.weapon=info.name; P.wInfo=info; A._hold(P.char,info.name==="silenced"?"silenced pistol":info.name); A._hudDirty=true; };
  A.view=function(v){ A.cfg.view=v==="first"?"first":"third"; if(A.player) A.player.char.root.visible=A.cfg.view!=="first"; return A; };
  A.heal=function(n){ A.state.health=Math.min(A.state.maxHealth,A.state.health+(n||25)); A._hudDirty=true; };
  A.damagePlayer=function(n,from){
    var P=A.player; if(!P||A._dead||P.inv>0||A._cut) return;
    var mult=A.cfg.difficulty==="easy"?0.5:A.cfg.difficulty==="hard"?1.5:1; n=n*mult;
    A.state.health-=n; P.inv=0.45; P.char.play("hit"); A._hudDirty=true; A.sfx("hurt"); A._hurtFx=1;
    A.shake(0.25,180); try{ (window.__spineTap||function(v){navigator.vibrate&&navigator.vibrate(v);})(40); }catch(e){}
    if(from){ var dx=P.pos.x-from.x, dz=P.pos.z-from.z, d=Math.hypot(dx,dz)||1; P.vel.x+=dx/d*3; P.vel.z+=dz/d*3; }
    if(A.state.health<=0){ A.state.health=0; A._die(); }
  };
  A._die=function(){ var P=A.player; A._dead=true; P.char.dead=true; P.char.fallDir=1; A.state.deaths++; A.sfx("death"); A._emit("death",{chapter:A.state.chapter});
    setTimeout(function(){ A._showDeath(); },1400); };
  A.checkpoint=function(at){ var P=A.player; if(!P) return; A._checkpoint={pos:P.pos.clone(),yaw:P.yaw,health:Math.max(A.state.health,A.state.maxHealth*0.6),
      inv:JSON.stringify(A.state.inventory),ammo:JSON.stringify(A.state.ammo),flags:JSON.stringify(A.state.flags)}; if(at) A.toast("Progress saved"); A._autosave(); };
  A.respawn=function(){ var P=A.player, c=A._checkpoint; if(!P||!c) return; P.pos.copy(c.pos); P.yaw=c.yaw; P.vel.set(0,0,0); P.vy=0; A.state.health=c.health;
    try{ A.state.inventory=JSON.parse(c.inv); A.state.ammo=JSON.parse(c.ammo); }catch(e){}
    P.char.dead=false; P.char.deadT=0; P.char.body.rotation.set(0,0,0); P.char.body.position.y=0; A._dead=false; P.inv=2;
    A.enemies.forEach(function(e){ if(!e.dead){ e.pos.copy(e.home); e.state=e.behaviour==="hunt"?"idle":e.behaviour; e.alert=0; e.health=e.maxHealth; e.path=null; } });
    A._hudDirty=true; A._hideDeath(); A._emit("respawn",{}); };

  // ════════════════════════════════════════════════════════════════════════
  //  ENEMIES. They see in a cone, hear gunshots and running feet, grow
  //  suspicious before they commit, chase round corners, attack, flinch,
  //  fall and drop things. A boss gets a health bar across the top.
  // ════════════════════════════════════════════════════════════════════════
  A.enemies=[];
  var ETYPES={
    zombie:{health:70,speed:1.25,run:2.2,damage:14,sight:14,fov:2.6,hear:1.0,reach:1.3,cd:1.1,behaviour:"hunt",kind:"zombie",sound:"groan"},
    guard:{health:60,speed:1.6,run:3.6,damage:9,sight:18,fov:1.9,hear:1.0,reach:1.2,cd:0.8,behaviour:"patrol",kind:"guard",ranged:true,sound:"guard"},
    soldier:{health:80,speed:1.6,run:3.8,damage:11,sight:22,fov:1.9,hear:1.0,reach:1.2,cd:0.6,behaviour:"patrol",kind:"guard",ranged:true,sound:"guard"},
    beast:{health:45,speed:2.4,run:6.0,damage:12,sight:16,fov:3.2,hear:1.5,reach:1.4,cd:0.8,behaviour:"hunt",kind:"beast",sound:"growl"},
    wraith:{health:55,speed:1.5,run:3.0,damage:16,sight:15,fov:3.6,hear:0.6,reach:1.5,cd:1.2,behaviour:"hunt",kind:"wraith",sound:"wail",phase:true},
    brute:{health:260,speed:1.1,run:2.6,damage:30,sight:16,fov:2.4,hear:1.0,reach:1.9,cd:1.6,behaviour:"hunt",kind:"brute",sound:"growl"},
    dark_mage:{health:70,speed:1.4,run:2.8,damage:14,sight:20,fov:2.2,hear:1.0,reach:1.3,cd:1.3,behaviour:"guard",kind:"mage",caster:true,sound:"wail"},
    robot:{health:110,speed:1.3,run:3.0,damage:12,sight:24,fov:1.6,hear:0.8,reach:1.3,cd:0.5,behaviour:"patrol",kind:"robot",ranged:true,sound:"beep"}
  };
  function etype(k){ k=String(k||"zombie").toLowerCase(); if(ETYPES[k]) return ETYPES[k]; if(/zomb|ghoul|undead|infected|walker/.test(k)) return ETYPES.zombie; if(/guard|agent|thug|henchm|merc/.test(k)) return ETYPES.guard;
    if(/soldier|trooper/.test(k)) return ETYPES.soldier; if(/dog|wolf|hound|beast|creature/.test(k)) return ETYPES.beast; if(/ghost|wraith|spirit|phantom|spectre/.test(k)) return ETYPES.wraith;
    if(/brute|giant|troll|tyrant|ogre|monster/.test(k)) return ETYPES.brute; if(/mage|sorcer|warlock|witch|wizard|cultist/.test(k)) return ETYPES.dark_mage; if(/robot|drone|android|mech/.test(k)) return ETYPES.robot; return ETYPES.zombie; }
  A.enemy=function(o){
    A._ensure(); o=o||{}; var t=T(); var ty=etype(o.type||o.kind);
    var at=o.at||[0,0,0]; var pos=new t.Vector3(at[0],0,at.length>2?at[2]:at[1]); pos.y=A.groundAt(pos.x,pos.z,(at.length>2?at[1]:0)+3);
    var C=A.makeCharacter({look:o.look||"",kind:ty.kind,colors:o.colors,scale:o.scale,weapon:o.weapon||(ty.ranged?"rifle":null),model:o.model});
    W().scene.add(C.root);
    var hp=(o.health||ty.health)*(o.boss?3:1);
    var E={id:o.id||nid("e"),name:o.name||"",char:C,pos:pos,home:pos.clone(),yaw:(o.face||0)*Math.PI/180,type:ty,health:hp,maxHealth:hp,speed:o.speed||ty.speed,run:o.run||ty.run,damage:o.damage||ty.damage,
      sight:o.sight||ty.sight,fov:ty.fov,behaviour:o.behaviour||ty.behaviour,state:"idle",alert:0,patrol:o.patrol||null,pi:0,path:null,pathT:0,cd:rnd(0.3,1),boss:!!o.boss,drops:o.drops||null,
      ranged:o.ranged!=null?o.ranged:!!ty.ranged,caster:!!ty.caster,hurt:0,dead:false,deadT:0,lastSeen:null,moan:rnd(2,8),onDeath:o.onDeath||null,ambushR:o.ambush?(o.ambushRange||5):0};
    if(E.behaviour==="ambush"||E.ambushR){ E.behaviour="hunt"; E.ambushR=E.ambushR||5; C.root.visible=false; E.state="hidden"; }
    C.root.position.copy(pos); C.root.rotation.y=E.yaw;
    if(A.state.flags["dead:"+E.id]){ E.dead=true; C.root.visible=false; }
    A.enemies.push(E); if(E.boss){ A._boss=E; A._hudDirty=true; } return E;
  };
  A.boss=function(o){ o=o||{}; o.boss=true; return A.enemy(o); };
  A.horde=function(type,n,center,radius,o){ var out=[]; for(var i=0;i<n;i++){ var a=Math.random()*6.28, r=Math.sqrt(Math.random())*(radius||6); out.push(A.enemy(Object.assign({type:type,at:[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r],face:rnd(0,360)},o||{}))); } return out; };
  A.noise=function(x,z,radius){ A.enemies.forEach(function(e){ if(e.dead) return; var d=Math.hypot(e.pos.x-x,e.pos.z-z); if(d<radius*e.type.hear){ e.alert=Math.max(e.alert,d<radius*0.5?1:0.7); e.lastSeen=new (T().Vector3)(x,0,z); if(e.state!=="hidden") e.state=e.alert>=1?"chase":"search"; } }); };
  function canSee(e,P){
    var dx=P.pos.x-e.pos.x, dz=P.pos.z-e.pos.z, d=Math.hypot(dx,dz); var sight=e.sight*(A.player.char.wantCrouch?0.6:1)*(A._lookCfg&&A._lookCfg.fogD>0.06&&!A.player.torchOn?0.7:1);
    if(d>sight) return 0; var fwd=Math.atan2(-Math.sin(e.yaw),-Math.cos(e.yaw)); var ang=Math.abs(angDiff(Math.atan2(dx,dz),Math.atan2(-Math.sin(e.yaw),-Math.cos(e.yaw))));
    if(e.state!=="chase"&&ang>e.fov/2&&d>2) return 0; if(A.blocked(e.pos.x,e.pos.z,P.pos.x,P.pos.z,e.pos.y+1.5)>=0) return 0; return 1-d/sight*0.7; }
  A._updateEnemies=function(dt,t){
    var P=A.player; if(!P) return;
    for(var i=0;i<A.enemies.length;i++){ var e=A.enemies[i], C=e.char;
      if(e.dead){ if(C.root.visible){ e.deadT+=dt; C.animate(dt,0,false); if(e.deadT>9){ C.root.visible=false; } } continue; }
      var dx=P.pos.x-e.pos.x, dz=P.pos.z-e.pos.z, dist=Math.hypot(dx,dz);
      if(dist>70&&e.state!=="chase"){ continue; }
      if(e.state==="hidden"){ if(dist<e.ambushR){ e.state="chase"; e.alert=1; C.root.visible=true; A.sfx("scare"); A.scare&&A.scare(0.5); } else continue; }
      e.cd-=dt; e.hurt=Math.max(0,e.hurt-dt); var see=A._dead?0:canSee(e,P);
      // awareness: suspicious first, then committed
      if(see>0){ e.alert=Math.min(1,e.alert+dt*(0.6+see*2.6)*(e.behaviour==="hunt"?2.2:1)); e.lastSeen=P.pos.clone(); }
      else if(e.state!=="chase") e.alert=Math.max(0,e.alert-dt*0.15);
      if(dist<2.2&&!P.char.wantCrouch&&!A._dead) { e.alert=Math.min(1,e.alert+dt*1.5); e.lastSeen=P.pos.clone(); }
      if(e.alert>=1&&e.state!=="chase"&&!A._dead){ e.state="chase"; A._spotted(e); }
      else if(e.alert>0.35&&e.state!=="chase"&&e.state!=="search") e.state="search";
      if(e.state==="chase"&&see<=0&&e.lastSeen&&Math.hypot(e.lastSeen.x-e.pos.x,e.lastSeen.z-e.pos.z)<1&&e.behaviour!=="hunt"){ e.state="search"; e.alert=0.8; }
      if(A._dead&&e.state==="chase"){ e.state="idle"; }
      var target=null, speed=0, run=false;
      if(e.state==="chase"&&!A._dead){ target=see>0?P.pos:(e.lastSeen||P.pos); speed=e.run; run=true; }
      else if(e.state==="search"&&e.lastSeen){ target=e.lastSeen; speed=e.speed; if(Math.hypot(target.x-e.pos.x,target.z-e.pos.z)<0.8){ e.searchT=(e.searchT||0)+dt; e.yaw+=dt*1.2; if(e.searchT>4){ e.state=e.behaviour==="patrol"?"patrol":"idle"; e.alert=0.2; e.searchT=0; } target=null; } }
      else if(e.behaviour==="patrol"&&e.patrol&&e.patrol.length){ var pp=e.patrol[e.pi%e.patrol.length]; target={x:pp[0],z:pp[1]}; speed=e.speed*0.8; if(Math.hypot(pp[0]-e.pos.x,pp[1]-e.pos.z)<0.6){ e.pi++; } }
      else if(e.state==="idle"&&e.behaviour==="hunt"&&e.type.kind==="zombie"){ e.wander=(e.wander||0)-dt; if(e.wander<=0){ e.wander=rnd(3,7); e.wt={x:e.home.x+rnd(-3,3),z:e.home.z+rnd(-3,3)}; } target=e.wt; speed=e.speed*0.5; }
      // attack
      var inReach=dist<e.type.reach+0.35*(C.scale||1);
      if(e.state==="chase"&&!A._dead){
        if((e.ranged||e.caster)&&see>0&&dist<16&&dist>2.2){ speed=dist>9?speed:0; if(e.cd<=0){ e.cd=e.type.cd*rnd(1,1.8); A._enemyShoot(e); } }
        else if(inReach){ speed=0; if(e.cd<=0){ e.cd=e.type.cd; C.play("swing",0.5); (function(en){ setTimeout(function(){ if(!en.dead&&Math.hypot(A.player.pos.x-en.pos.x,A.player.pos.z-en.pos.z)<en.type.reach+0.6) A.damagePlayer(en.damage,en.pos); },230); })(e); A.sfx(e.type.sound==="growl"?"growl":"swing",e.pos); } }
      }
      // move
      if(target&&speed>0&&e.hurt<=0){
        var tx=target.x, tz=target.z;
        var direct=A.blocked(e.pos.x,e.pos.z,tx,tz,e.pos.y+0.9)<0;
        if(!direct){ e.pathT-=dt; if(!e.path||e.pathT<=0){ e.path=A.path(e.pos,{x:tx,z:tz,y:target.y||0}); e.pathT=0.6+Math.random()*0.3; } if(e.path&&e.path.length){ var wp=e.path[0]; if(Math.hypot(wp[0]-e.pos.x,wp[1]-e.pos.z)<0.45) e.path.shift(); if(e.path.length){ tx=e.path[0][0]; tz=e.path[0][1]; } } }
        else e.path=null;
        var mx=tx-e.pos.x, mz=tz-e.pos.z, md=Math.hypot(mx,mz);
        if(md>0.05){ var want=Math.atan2(-mx,-mz); e.yaw+=angDiff(e.yaw,want)*Math.min(1,dt*7); var sp=Math.min(speed,md/dt);
          e.pos.x+=Math.sin(e.yaw)*-sp*dt; e.pos.z+=Math.cos(e.yaw)*-sp*dt; e.moving=sp; } else e.moving=0;
      } else { e.moving=damp(e.moving||0,0,8,dt); if(e.state==="chase"&&see>0){ e.yaw+=angDiff(e.yaw,Math.atan2(-dx,-dz))*Math.min(1,dt*8); } }
      // keep apart from each other and out of walls
      for(var j=0;j<A.enemies.length;j++){ var o2=A.enemies[j]; if(o2===e||o2.dead) continue; var sx=e.pos.x-o2.pos.x, sz=e.pos.z-o2.pos.z, sd=Math.hypot(sx,sz); if(sd<0.7&&sd>0.001){ e.pos.x+=sx/sd*(0.7-sd)*0.5; e.pos.z+=sz/sd*(0.7-sd)*0.5; } }
      if(!e.type.phase){ var cc=A._collide(e.pos.x,e.pos.z,0.32*(C.scale||1),e.pos.y,1.7*(C.scale||1)); e.pos.x=cc[0]; e.pos.z=cc[1]; }
      e.pos.y=damp(e.pos.y,A.groundAt(e.pos.x,e.pos.z,e.pos.y),12,dt);
      if(dist<0.6&&!A._dead){ P.pos.x+=dx/(dist||1)*0.05; P.pos.z+=dz/(dist||1)*0.05; }
      C.root.position.copy(e.pos); C.root.rotation.y=e.yaw; C.aiming=e.state==="chase"&&(e.ranged||e.caster)&&see>0;
      C.animate(dt,e.moving||0,run);
      e.moan-=dt; if(e.moan<=0){ e.moan=rnd(4,10); if(dist<18) A.sfx(e.type.sound,e.pos); }
    }
    if(A._boss&&A._boss.dead) { A._boss=null; A._hudDirty=true; }
  };
  A._spotted=function(e){ A.sfx(e.type.kind==="guard"||e.type.kind==="robot"?"alert":"growl",e.pos); A._emit("spotted",{id:e.id});
    if(e.type.kind==="guard"||e.type.kind==="robot"){ A.enemies.forEach(function(o){ if(!o.dead&&o!==e&&Math.hypot(o.pos.x-e.pos.x,o.pos.z-e.pos.z)<12){ o.alert=Math.max(o.alert,0.9); o.lastSeen=A.player.pos.clone(); if(o.state!=="hidden") o.state="chase"; } }); } };
  A._enemyShoot=function(e){ var P=A.player; e.char.play(e.caster?"cast":"shoot");
    var from=new (T().Vector3)(e.pos.x,e.pos.y+1.35*(e.char.scale||1),e.pos.z), to=new (T().Vector3)(P.pos.x,P.pos.y+1.2,P.pos.z);
    if(e.caster){ A._spawnBolt(from,to,"enemy",e.damage,"#c06aff"); A.sfx("spell",e.pos); return; }
    var d=from.distanceTo(to), miss=Math.random()<clamp(d/30+(P.char.wantCrouch?0.25:0)+(Math.hypot(P.vel.x,P.vel.z)>3?0.2:0),0.15,0.85);
    var end=miss?to.clone().add(new (T().Vector3)(rnd(-1.2,1.2),rnd(-0.5,0.8),rnd(-1.2,1.2))):to; A._tracer(from,end,"#ffd9a0"); A.sfx("shot",e.pos);
    if(!miss) A.damagePlayer(e.damage,e.pos); else A._burst(end,"spark",6); };
  A.hurtEnemy=function(e,dmg,dir,opts){
    if(!e||e.dead) return; opts=opts||{}; var sneak=e.state!=="chase"&&e.alert<0.5&&opts.melee;
    if(sneak){ dmg*=5; A.toast(A.cfg.genre==="spy"?"Silent takedown":"Sneak attack"); }
    e.health-=dmg; e.hurt=0.18; e.char.play("hit"); e.alert=1; if(e.state!=="hidden") e.state="chase"; e.lastSeen=A.player.pos.clone();
    var p=e.pos.clone(); p.y+=1.2*(e.char.scale||1); A._burst(p,e.type.kind==="robot"?"spark":e.type.kind==="wraith"?"magic":"blood",12,dir); A._damageNumber(p,Math.round(dmg));
    A.sfx("hit",e.pos); if(dir){ e.pos.x+=dir.x*0.25; e.pos.z+=dir.z*0.25; }
    if(e.health<=0) A._killEnemy(e,dir); A._hudDirty=true;
  };
  A._killEnemy=function(e,dir){ e.dead=true; e.health=0; e.char.dead=true; e.char.fallDir=1; A.state.kills++; A.state.flags["dead:"+e.id]=1; A.sfx("death",e.pos);
    A.hitStop(70);
    if(e.drops){ (Array.isArray(e.drops)?e.drops:[e.drops]).forEach(function(d,i){ var it=typeof d==="string"?{name:d}:d; A.item(Object.assign({at:[e.pos.x+i*0.4,e.pos.z+0.3],auto:/ammo|health|herb|potion|mana/i.test(it.name||it.kind||"")},it)); }); }
    else if(Math.random()<0.35&&A.player&&A.player.wInfo&&A.player.wInfo.kind==="gun") A.item({name:"Ammo",kind:"ammo",at:[e.pos.x,e.pos.z],amount:6,auto:true});
    if(e.onDeath) try{ e.onDeath(e); }catch(x){} A._emit("kill",{id:e.id,name:e.name,boss:e.boss});
    if(e.boss) A.toast((e.name||"The boss")+" is down"); };

  // ── THE HERO'S ATTACK. Phones get gentle aim help: the nearest enemy in front is the target.
  A.attack=function(){
    var P=A.player; if(!P||A._dead||A._cut||A._ui) return; if(P.cd>0||P.reload>0) return; var w=P.wInfo||A.weaponInfo("fists");
    if(w.kind!=="melee") P.yaw=A._camYaw;          // shoot where the camera looks
    var fwd=new (T().Vector3)(-Math.sin(P.yaw),0,-Math.cos(P.yaw));
    var tgt=A._aimTarget(w.kind==="melee"?w.range+0.6:w.range, w.kind==="melee"?w.arc:0.5);
    // phone help: anything already on top of you gets turned to, even from the side
    if(!tgt) tgt=A._aimTarget(w.kind==="melee"?w.range+0.6:5,Math.PI);
    if(tgt){ var tx=tgt.pos.x-P.pos.x, tz=tgt.pos.z-P.pos.z; P.yaw=Math.atan2(-tx,-tz); fwd.set(-Math.sin(P.yaw),0,-Math.cos(P.yaw)); }
    P.cd=w.cd;
    if(w.kind==="melee"){ P.char.play("swing"); A.sfx(w.sound);
      setTimeout(function(){ A.enemies.forEach(function(e){ if(e.dead||e.state==="hidden") return; var dx=e.pos.x-P.pos.x, dz=e.pos.z-P.pos.z, d=Math.hypot(dx,dz); if(d>w.range+0.4*(e.char.scale||1)) return;
        var ang=Math.abs(angDiff(Math.atan2(-dx,-dz),P.yaw)); if(ang>w.arc/2) return; A.hurtEnemy(e,w.dmg,new (T().Vector3)(dx/d,0,dz/d),{melee:true}); A.shake(0.12,90); });
        A._smash(P.pos,fwd,w.range); },150);
      A.noise(P.pos.x,P.pos.z,w.silent?1.5:4); return; }
    if(w.kind==="gun"){ var clip=P.clip[w.name]||0; if(clip<=0){ A.reload(); return; } P.clip[w.name]=clip-1; P.char.play("shoot"); A.sfx(w.sound); A._hudDirty=true;
      var from=new (T().Vector3)(P.pos.x,P.pos.y+1.35,P.pos.z).addScaledVector(fwd,0.5), end; var hit=null, bestD=w.range;
      var aimDir=tgt?new (T().Vector3)(tgt.pos.x-from.x,tgt.pos.y+1.1*(tgt.char.scale||1)-from.y,tgt.pos.z-from.z).normalize():fwd.clone();
      aimDir.x+=rnd(-w.spread,w.spread); aimDir.y+=rnd(-w.spread,w.spread)*0.5; aimDir.normalize();
      var wallT=A.blocked(from.x,from.z,from.x+aimDir.x*w.range,from.z+aimDir.z*w.range,from.y); if(wallT>=0) bestD=wallT*w.range;
      A.enemies.forEach(function(e){ if(e.dead||e.state==="hidden") return; var ex=e.pos.x-from.x, ez=e.pos.z-from.z, along=ex*aimDir.x+ez*aimDir.z; if(along<0||along>bestD) return;
        var px=from.x+aimDir.x*along, pz=from.z+aimDir.z*along, off=Math.hypot(e.pos.x-px,e.pos.z-pz); if(off<0.45*(e.char.scale||1)+(w.name==="shotgun"?0.5:0)){ bestD=along; hit=e; } });
      end=from.clone().addScaledVector(aimDir,bestD); A._tracer(from,end,"#fff0c0"); A._muzzle(from);
      if(hit) A.hurtEnemy(hit,w.dmg*(w.name==="shotgun"?clamp(1.3-bestD/w.range,0.3,1.3):1),aimDir); else A._burst(end,"spark",8);
      A.shake(w.name==="shotgun"?0.3:0.1,90); A.noise(P.pos.x,P.pos.z,w.noise); return; }
    if(w.kind==="spell"){ if(A.state.mana<w.mana){ A.toast("Not enough magic"); A.sfx("empty"); P.cd=0.3; return; } A.state.mana-=w.mana; P.char.play("cast"); A.sfx("spell"); A._hudDirty=true;
      var f2=new (T().Vector3)(P.pos.x,P.pos.y+1.35,P.pos.z).addScaledVector(fwd,0.6); var to2=tgt?new (T().Vector3)(tgt.pos.x,tgt.pos.y+1.1,tgt.pos.z):f2.clone().addScaledVector(fwd,w.range);
      A._spawnBolt(f2,to2,"player",w.dmg,w.color); A.noise(P.pos.x,P.pos.z,w.noise); }
  };
  A._aimTarget=function(range,arc){ var P=A.player, best=null, bs=1e9; A.enemies.forEach(function(e){ if(e.dead||e.state==="hidden") return; var dx=e.pos.x-P.pos.x, dz=e.pos.z-P.pos.z, d=Math.hypot(dx,dz); if(d>range) return;
      var ang=Math.abs(angDiff(Math.atan2(-dx,-dz),P.yaw)); if(ang>arc) return; if(A.blocked(P.pos.x,P.pos.z,e.pos.x,e.pos.z,P.pos.y+1.3)>=0) return; var sc=d+ang*4; if(sc<bs){ bs=sc; best=e; } }); return best; };
  A.reload=function(){ var P=A.player, w=P&&P.wInfo; if(!w||w.kind!=="gun"||P.reload>0) return; var have=A.state.ammo[w.name]||0; if(have<=0){ A.toast("No ammo"); A.sfx("empty"); P.cd=0.4; return; }
    P.reload=1.1; A.sfx("reload"); setTimeout(function(){ var need=w.clip-(P.clip[w.name]||0), take=Math.min(need,A.state.ammo[w.name]||0); P.clip[w.name]=(P.clip[w.name]||0)+take; A.state.ammo[w.name]-=take; A._hudDirty=true; },1000); };
  A.dodge=function(){ var P=A.player; if(!P||A._dead||A._cut||P.dodgeT>0) return; P.dodgeT=0.45; P.inv=Math.max(P.inv,0.4); P.char.play("roll",0.45); A.sfx("swing");
    var m=A._moveVec||{x:0,z:0}; var dirx=m.x, dirz=m.z; if(Math.hypot(dirx,dirz)<0.1){ dirx=-Math.sin(P.yaw); dirz=-Math.cos(P.yaw); } var l=Math.hypot(dirx,dirz); P.vel.x=dirx/l*8; P.vel.z=dirz/l*8; };
  A.crouch=function(on){ var P=A.player; if(!P) return; P.char.wantCrouch=on==null?!P.char.wantCrouch:!!on; A._hudDirty=true; };
  // smash breakables in front of a swing
  A._breakables=[];
  A.breakable=function(obj,o){ o=o||{}; A._breakables.push({obj:obj,hp:o.hp||1,drops:o.drops||null,secret:o.secret}); return obj; };
  A._smash=function(pos,fwd,range){ for(var i=A._breakables.length-1;i>=0;i--){ var b=A._breakables[i], p=b.obj.position; var dx=p.x-pos.x, dz=p.z-pos.z, d=Math.hypot(dx,dz); if(d>range+0.6) continue;
      if(dx*fwd.x+dz*fwd.z<0) continue; b.hp--; if(b.hp>0) continue; A._burst(new (T().Vector3)(p.x,p.y+0.4,p.z),"debris",18); A.sfx("break",p); A.unsolid(b.obj.userData.solid||(b.obj.children[0]&&b.obj.children[0].userData.solid)); b.obj.visible=false;
      if(b.drops) (Array.isArray(b.drops)?b.drops:[b.drops]).forEach(function(d){ A.item(Object.assign({at:[p.x,p.z]},typeof d==="string"?{name:d}:d)); }); A._breakables.splice(i,1); } };

  // ════════════════════════════════════════════════════════════════════════
  //  BOLTS, TRACERS, PARTICLES, FLOATING NUMBERS
  // ════════════════════════════════════════════════════════════════════════
  A._bolts=[];
  A._spawnBolt=function(from,to,who,dmg,color){ var t=T(); var g=new t.Group(); var core=new t.Mesh(new t.SphereGeometry(0.09,12,10),new t.MeshBasicMaterial({color:new t.Color(color||"#ffd27a")}));
    var halo=new t.Sprite(A._glowMat(color)); halo.scale.set(0.7,0.7,0.7); g.add(core); g.add(halo); g.position.copy(from); W().scene.add(g);
    var dir=to.clone().sub(from).normalize(); A._bolts.push({g:g,vel:dir.multiplyScalar(who==="player"?22:12),who:who,dmg:dmg,life:2.2,color:color}); };
  A._glowMat=function(color){ var t=T(); A._glowTex=A._glowTex||(function(){ var c=document.createElement("canvas"); c.width=c.height=64; var x=c.getContext("2d"); var gr=x.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,"rgba(255,255,255,1)"); gr.addColorStop(0.3,"rgba(255,255,255,.5)"); gr.addColorStop(1,"rgba(255,255,255,0)"); x.fillStyle=gr; x.fillRect(0,0,64,64); return new t.CanvasTexture(c); })();
    return new t.SpriteMaterial({map:A._glowTex,color:new t.Color(color||"#ffd27a"),blending:t.AdditiveBlending,depthWrite:false,transparent:true}); };
  A._updateBolts=function(dt){ for(var i=A._bolts.length-1;i>=0;i--){ var b=A._bolts[i]; b.life-=dt; var p=b.g.position, nx=p.x+b.vel.x*dt, ny=p.y+b.vel.y*dt, nz=p.z+b.vel.z*dt, hit=false;
      if(A.blocked(p.x,p.z,nx,nz,p.y)>=0||ny<A.groundAt(nx,nz,ny)) hit=true;
      if(!hit&&b.who==="player"){ for(var j=0;j<A.enemies.length;j++){ var e=A.enemies[j]; if(e.dead||e.state==="hidden") continue; if(Math.hypot(e.pos.x-nx,e.pos.z-nz)<0.55*(e.char.scale||1)&&ny>e.pos.y&&ny<e.pos.y+2*(e.char.scale||1)){ A.hurtEnemy(e,b.dmg,b.vel.clone().normalize()); hit=true; break; } } }
      if(!hit&&b.who==="enemy"&&A.player){ var P=A.player; if(Math.hypot(P.pos.x-nx,P.pos.z-nz)<0.5&&ny>P.pos.y&&ny<P.pos.y+1.9){ A.damagePlayer(b.dmg,p); hit=true; } }
      p.set(nx,ny,nz); A._burst(p,"trail",1,null,b.color);
      if(hit||b.life<=0){ A._burst(p,"magic",14,null,b.color); W().scene.remove(b.g); A._bolts.splice(i,1); } } };
  A._tracer=function(a,b,color){ var t=T(); var g=new t.BufferGeometry().setFromPoints([a,b]); var l=new t.Line(g,new t.LineBasicMaterial({color:new t.Color(color||"#fff0c0"),transparent:true,opacity:0.9})); W().scene.add(l); setTimeout(function(){ W().scene.remove(l); g.dispose(); },60); };
  A._muzzle=function(p){ var t=T(); var s=new t.Sprite(A._glowMat("#ffcf7a")); s.position.copy(p); s.scale.set(0.6,0.6,0.6); W().scene.add(s); var L=new t.PointLight(0xffc070,8,6); L.position.copy(p); W().scene.add(L); setTimeout(function(){ W().scene.remove(s); W().scene.remove(L); },55); };
  // one pooled particle system for everything: blood, sparks, dust, magic
  A._parts=null;
  function initParts(){ var t=T(), N=700; var g=new t.BufferGeometry(); var pos=new Float32Array(N*3), col=new Float32Array(N*3); g.setAttribute("position",new t.BufferAttribute(pos,3)); g.setAttribute("color",new t.BufferAttribute(col,3));
    var m=new t.PointsMaterial({size:0.09,vertexColors:true,transparent:true,depthWrite:false,map:null,sizeAttenuation:true}); var pts=new t.Points(g,m); pts.frustumCulled=false; W().scene.add(pts);
    A._parts={pts:pts,pos:pos,col:col,vel:new Float32Array(N*3),life:new Float32Array(N),grav:new Float32Array(N),n:N,i:0}; }
  A._burst=function(p,kind,count,dir,color){ if(!A._parts) initParts(); var P=A._parts, t=T(); var c=new t.Color(color||(kind==="blood"?"#5a0d0d":kind==="spark"?"#ffd27a":kind==="debris"?"#6a5038":kind==="dust"?"#8a8070":"#cfa8ff"));
    for(var k=0;k<count;k++){ var i=P.i=(P.i+1)%P.n; P.pos[i*3]=p.x; P.pos[i*3+1]=p.y; P.pos[i*3+2]=p.z; var sp=kind==="trail"?0.2:kind==="blood"?2.4:3.5;
      P.vel[i*3]=rnd(-1,1)*sp+(dir?dir.x*2:0); P.vel[i*3+1]=rnd(0,1)*sp*(kind==="trail"?0.2:1); P.vel[i*3+2]=rnd(-1,1)*sp+(dir?dir.z*2:0);
      P.life[i]=kind==="trail"?0.35:rnd(0.4,0.9); P.grav[i]=kind==="magic"||kind==="trail"?-0.5:9; var sh=rnd(0.7,1.2); P.col[i*3]=c.r*sh; P.col[i*3+1]=c.g*sh; P.col[i*3+2]=c.b*sh; } };
  A._updateParts=function(dt){ var P=A._parts; if(!P) return; for(var i=0;i<P.n;i++){ if(P.life[i]<=0) continue; P.life[i]-=dt; if(P.life[i]<=0){ P.pos[i*3+1]=-999; continue; }
      P.vel[i*3+1]-=P.grav[i]*dt; P.pos[i*3]+=P.vel[i*3]*dt; P.pos[i*3+1]+=P.vel[i*3+1]*dt; P.pos[i*3+2]+=P.vel[i*3+2]*dt; }
    P.pts.geometry.attributes.position.needsUpdate=true; P.pts.geometry.attributes.color.needsUpdate=true; };
  A._damageNumber=function(p,n){ var el=document.createElement("div"); el.className="adv-dmg"; el.textContent=n; document.body.appendChild(el); var t0=performance.now(), v=p.clone();
    (function step(){ var k=(performance.now()-t0)/700; if(k>=1){ el.remove(); return; } var q=v.clone(); q.y+=k*0.8; q.project(W().camera); el.style.left=((q.x*0.5+0.5)*innerWidth)+"px"; el.style.top=((-q.y*0.5+0.5)*innerHeight)+"px"; el.style.opacity=String(1-k); requestAnimationFrame(step); })(); };

  // ════════════════════════════════════════════════════════════════════════
  //  ITEMS, DOORS, THINGS TO USE, ZONES, KEYPADS, CHECKPOINTS, EXITS
  // ════════════════════════════════════════════════════════════════════════
  A.items=[]; A.usables=[];
  function itemMesh(it){ var t=T(); var g=new t.Group(); var k=(it.kind||it.name||"").toLowerCase(); var gold=std("#d4a74a",0.25,0.9);
    if(/key/.test(k)){ var ring=new t.Mesh(new t.TorusGeometry(0.07,0.02,8,20),gold); ring.position.x=-0.1; g.add(ring); var sh=new t.Mesh(new t.BoxGeometry(0.22,0.025,0.025),gold); sh.position.x=0.06; g.add(sh); var tooth=new t.Mesh(new t.BoxGeometry(0.03,0.06,0.025),gold); tooth.position.set(0.15,-0.03,0); g.add(tooth); }
    else if(/ammo|bullet|shell/.test(k)){ var bx=new t.Mesh(new t.BoxGeometry(0.22,0.12,0.14),std("#3a4a2a",0.7)); g.add(bx); }
    else if(/health|herb|med|potion|first.?aid|bandage/.test(k)){ var v=new t.Mesh(new t.CylinderGeometry(0.06,0.08,0.18,14),std(/herb/.test(k)?"#3a8a3a":"#c03a3a",0.2,0,{transparent:true,opacity:0.85,emissive:new t.Color(/herb/.test(k)?"#1a5a1a":"#5a0a0a"),emissiveIntensity:0.6})); g.add(v); }
    else if(/mana|magic|crystal|gem/.test(k)){ var c=new t.Mesh(new t.OctahedronGeometry(0.12,0),std("#6ab0ff",0.1,0.2,{emissive:new t.Color("#2a6aff"),emissiveIntensity:1.2})); g.add(c); }
    else if(/note|letter|diary|page|file|map|document/.test(k)){ var pg=new t.Mesh(new t.BoxGeometry(0.22,0.005,0.3),std("#e9e1c8",0.9)); pg.rotation.x=-0.3; g.add(pg); }
    else if(/pistol|gun|rifle|shotgun|wand|sword|knife|staff|axe|weapon/.test(k)||it.weapon){ var tmp=A.makeCharacter({kind:"hero"}); A._hold(tmp,it.weapon||it.name); if(tmp.held){ tmp.held.parent.remove(tmp.held); tmp.held.rotation.y=Math.PI/2; g.add(tmp.held); } }
    else { var orb=new t.Mesh(new t.IcosahedronGeometry(0.1,1),std(it.color||"#d4a74a",0.3,0.6,{emissive:new t.Color(it.color||"#7a5a1a"),emissiveIntensity:0.5})); g.add(orb); }
    var glow=new t.Sprite(A._glowMat(/health|herb/.test(k)?"#ff8080":/key|gold/.test(k)?"#ffd27a":"#a0d8ff")); glow.scale.set(0.55,0.55,0.55); glow.material.opacity=0.45; g.add(glow);
    return g; }
  A.item=function(o){ A._ensure(); o=o||{}; var at=o.at||[0,0]; var y=(at.length>2?at[1]:A.groundAt(at[0],at[at.length-1],50))+0.55;
    var it={id:o.id||("i:"+(o.name||"item")+":"+Math.round(at[0]*10)+":"+Math.round(at[at.length-1]*10)),name:o.name||"Item",kind:o.kind||o.name||"item",amount:o.amount||1,text:o.text||o.note||"",desc:o.desc||"",
      weapon:o.weapon||(/^(pistol|silenced|shotgun|rifle|wand|staff|sword|knife|axe|pipe)/i.test(o.kind||"")?o.kind:null),auto:o.auto,onPick:o.onPick||o.on||null,secret:!!o.secret,heal:o.heal,quest:o.quest||null};
    if(A.state.flags["got:"+it.id]) return null;
    var m=itemMesh(it); m.position.set(at[0],y,at[at.length-1]); W().scene.add(m); it.mesh=m; it.baseY=y; A.items.push(it); return it; };
  A._pick=function(it){ var k=(it.kind||"").toLowerCase(), n=it.name;
    A.state.flags["got:"+it.id]=1; W().scene.remove(it.mesh); A.items.splice(A.items.indexOf(it),1); A.sfx("pickup");
    if(it.weapon){ A.giveWeapon(it.weapon); }
    else if(/ammo|bullet|shell/.test(k)){ var w=!A.player?"pistol":A.player.wInfo&&A.player.wInfo.kind==="gun"?A.player.wInfo.name:(A.player.weapons.filter(function(x){ return WEAPONS[x]&&WEAPONS[x].kind==="gun"; })[0]||"pistol"); A.state.ammo[w]=(A.state.ammo[w]||0)+(it.amount>1?it.amount:8); A.toast("+"+(it.amount>1?it.amount:8)+" ammo"); }
    else if(/health|herb|med|first.?aid|bandage/.test(k)&&it.auto!==false&&A.state.health<A.state.maxHealth){ A.heal(it.heal||35); A.toast("Health restored"); }
    else if(/mana|magic/.test(k)){ A.state.mana=Math.min(100,A.state.mana+40); A.toast("Magic restored"); }
    else { A.state.inventory.push({name:n,kind:it.kind,text:it.text,desc:it.desc,id:it.id,heal:it.heal}); A.toast("Picked up: "+n);
      if(it.text){ A.state.notes.push({name:n,text:it.text}); A.read(n,it.text); } }
    if(it.secret){ A.state.secrets++; A.toast("Secret found"); A._emit("secret",{name:n}); }
    if(it.quest) A.complete(it.quest);
    A._hudDirty=true; A._emit("pickup",{name:n,kind:it.kind}); if(it.onPick) try{ it.onPick(it); }catch(e){} };
  A.has=function(name){ var n=String(name).toLowerCase(); return A.state.inventory.some(function(i){ return String(i.name).toLowerCase()===n; }); };
  A.give=function(name,o){ A.state.inventory.push(Object.assign({name:name,kind:"item"},o||{})); A.toast("Received: "+name); A._hudDirty=true; };
  A.take=function(name){ var n=String(name).toLowerCase(); for(var i=0;i<A.state.inventory.length;i++){ if(String(A.state.inventory[i].name).toLowerCase()===n){ A.state.inventory.splice(i,1); A._hudDirty=true; return true; } } return false; };
  // anything the hero can walk up to and use
  A.interact=function(o){ A._ensure(); o=o||{}; var at=o.at||[0,0]; var u={id:o.id||nid("u"),x:at[0],z:at[at.length-1],y:at.length>2?at[1]:null,r:o.radius||1.6,label:o.label||"Use",on:o.on||function(){},once:!!o.once,needs:o.needs||null,locked:o.lockedText||null,used:false,enabled:true,obj:o.obj||null};
    A.usables.push(u); return u; };
  A.door=function(o){
    A._ensure(); o=o||{}; var t=T(); var at=o.at||[0,0], w=o.width||1.3, h=o.height||2.3, rot=(o.rot||0)*Math.PI/180;
    var frame=new t.Group(); frame.position.set(at[0],o.y||0,at[1]); frame.rotation.y=rot; W().scene.add(frame);
    var wood=A.mat(o.material||"dark varnished wood"); var hinge=new t.Group(); hinge.position.set(-w/2,0,0); frame.add(hinge);
    var leaf=new t.Mesh(new t.BoxGeometry(w,h,0.08),wood); leaf.position.set(w/2,h/2,0); leaf.castShadow=true; hinge.add(leaf);
    var knob=new t.Mesh(new t.SphereGeometry(0.04,10,8),std("#c9a24a",0.3,0.9)); knob.position.set(w-0.12,1.0,-0.07); hinge.add(knob);
    if(o.locked){ var lk=new t.Mesh(new t.BoxGeometry(0.1,0.14,0.05),std("#8a7a4a",0.4,0.8)); lk.position.set(w-0.12,1.15,-0.08); hinge.add(lk); }
    var solid=A._addBox(at[0],at[1],w/2,0.08,rot,o.y||0,(o.y||0)+h,leaf);
    var D={id:o.id||("d:"+Math.round(at[0]*10)+":"+Math.round(at[1]*10)),hinge:hinge,solid:solid,open:false,locked:o.locked||null,to:o.to||null,openT:0,label:o.label||"Door",onOpen:o.onOpen||null};
    var u=A.interact({at:[at[0],at[1]],radius:1.8,label:o.label?("Open "+o.label):"Open door",on:function(){ A._openDoor(D,u); }});
    D.use=u; if(A.state.flags["open:"+D.id]){ D.locked=null; A._openDoor(D,u,true); } return D;
  };
  A._openDoor=function(D,u,quiet){
    if(D.open) return; if(D.locked&&D.locked!==true&&!A.has(D.locked)){ if(!quiet){ A.sfx("locked"); A.toast("Locked. You need: "+D.locked); } return; }
    if(D.locked===true){ if(!quiet){ A.sfx("locked"); A.toast("It will not open from this side"); } return; }
    if(D.locked&&!quiet){ A.toast("Used: "+D.locked); if(!/master|skeleton/i.test(D.locked)) A.take(D.locked); }
    D.open=true; D.locked=null; A.state.flags["open:"+D.id]=1; A.unsolid(D.solid); if(u){ u.enabled=false; } if(!quiet) A.sfx("door"); A._doorAnims=A._doorAnims||[]; A._doorAnims.push(D); A._emit("door",{id:D.id});
    if(D.onOpen) try{ D.onOpen(D); }catch(e){} if(D.to){ A.finishChapter(); } };
  A.unlock=function(D){ if(D){ D.locked=null; } };
  A.zone=function(o){ A._ensure(); o=o||{}; var at=o.at||[0,0], s=o.size||[3,3]; var z={x:at[0],z:at[1],hw:s[0]/2,hd:s[1]/2,once:o.once!==false,on:o.on||function(){},inside:false,done:false,leave:o.leave||null}; A._zones.push(z); return z; };
  A._zones=[];
  A.keypad=function(o){ o=o||{}; var t=T(); var at=o.at||[0,0]; var pad=new t.Mesh(new t.BoxGeometry(0.22,0.32,0.05),std("#2a2d30",0.4,0.7)); pad.position.set(at[0],(o.y||0)+1.3,at[1]); pad.rotation.y=(o.rot||0)*Math.PI/180; W().scene.add(pad);
    var scr=new t.Mesh(new t.PlaneGeometry(0.16,0.06),new t.MeshBasicMaterial({color:new t.Color("#3ad0a0")})); scr.position.set(0,0.1,-0.03); scr.rotation.y=Math.PI; pad.add(scr);
    var u=A.interact({at:at,label:o.label||"Use keypad",on:function(){ A._keypadUI(String(o.code||"0000"),function(ok){ if(ok){ scr.material.color.set("#5aff7a"); u.enabled=false; A.sfx("chime"); if(o.on) o.on(); } else { scr.material.color.set("#ff3a3a"); A.sfx("locked"); setTimeout(function(){ scr.material.color.set("#3ad0a0"); },600); } },o.hint); }}); return u; };
  A.exit=function(o){ o=o||{}; var at=o.at||[0,0]; var s=o.size||[2.5,2.5]; var t=T();
    var beacon=new t.Mesh(new t.CylinderGeometry(Math.min(s[0],s[1])/2,Math.min(s[0],s[1])/2,0.05,32),new t.MeshBasicMaterial({color:new t.Color("#b8935a"),transparent:true,opacity:0.35})); beacon.position.set(at[0],A.groundAt(at[0],at[1],50)+0.03,at[1]); W().scene.add(beacon); A._exitBeacon=beacon;
    return A.zone({at:at,size:s,on:function(){ if(o.needs&&!A.has(o.needs)){ A.toast(o.lockedText||("You still need: "+o.needs)); return; } A.finishChapter(o.text); },once:false}); };
  A.secret=function(o){ o=Object.assign({secret:true,name:"Hidden relic"},o||{}); return A.item(o); };

  // ════════════════════════════════════════════════════════════════════════
  //  PLAYING IT. Thumb stick on the left, look by dragging on the right,
  //  buttons for attack, use, dodge and crouch. Keyboard, mouse and game
  //  controllers work too. The camera rides over the shoulder and never
  //  goes through a wall.
  // ════════════════════════════════════════════════════════════════════════
  var CSS=".adv-ui{position:fixed;inset:0;z-index:6;pointer-events:none;font-family:Manrope,system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none}"
   +".adv-ui *{box-sizing:border-box}.adv-zone{position:absolute;top:0;bottom:0;pointer-events:auto;touch-action:none}#advL{left:0;width:45%}#advR{right:0;width:55%}"
   +".adv-stick{position:absolute;width:118px;height:118px;border-radius:50%;border:1.5px solid rgba(255,255,255,.28);background:rgba(10,12,16,.22);display:none;transform:translate(-50%,-50%)}"
   +".adv-knob{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(255,255,255,.55)}"
   +".adv-btns{position:absolute;right:14px;bottom:18px;width:178px;height:178px;pointer-events:none}"
   +".adv-b{position:absolute;pointer-events:auto;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);background:rgba(12,14,20,.45);color:#fff;font:700 10.5px Manrope,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;touch-action:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}"
   +".adv-b:active,.adv-b.on{background:rgba(184,147,90,.65)}#advAtk{width:78px;height:78px;right:0;bottom:0;font-size:12px}#advUse{width:60px;height:60px;right:88px;bottom:4px}#advDodge{width:52px;height:52px;right:6px;bottom:90px}#advCrouch{width:46px;height:46px;right:72px;bottom:74px}#advSwap{width:44px;height:44px;right:118px;bottom:118px;font-size:9px}"
   +"#advUse.hint{background:rgba(126,212,168,.55);border-color:#7ed4a8}"
   +".adv-top{position:absolute;left:12px;right:12px;top:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}"
   +".adv-hp{width:150px}.adv-bar{height:7px;border-radius:5px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:4px}.adv-bar>i{display:block;height:100%;background:linear-gradient(90deg,#c0392b,#e8735a);border-radius:5px;transition:width .2s}"
   +".adv-bar.mana>i{background:linear-gradient(90deg,#3a6ad8,#8fd0ff)}.adv-lbl{font:700 8.5px Manrope,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#d8c9a8}"
   +".adv-obj{max-width:52%;background:rgba(8,10,14,.5);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:7px 10px;font:500 11px/1.4 Manrope,sans-serif;backdrop-filter:blur(6px)}.adv-obj b{display:block;font:700 8.5px Manrope;letter-spacing:.12em;color:#7ed4a8;text-transform:uppercase;margin-bottom:2px}.adv-obj .dn{opacity:.55;text-decoration:line-through}"
   +".adv-menu{pointer-events:auto;display:flex;gap:6px}.adv-menu button{width:38px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(10,12,16,.5);color:#fff;font:700 13px Manrope}"
   +".adv-wpn{position:absolute;right:16px;bottom:206px;text-align:right;font:700 11px Manrope;text-shadow:0 1px 6px #000}.adv-wpn small{display:block;font:600 9px Manrope;color:#c9d2dd}"
   +".adv-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);background:rgba(8,10,14,.72);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 14px;font:600 12px Manrope;opacity:0;transition:opacity .25s;white-space:nowrap}"
   +".adv-sub{position:absolute;left:8%;right:8%;bottom:26%;text-align:center;font:500 14px/1.45 Manrope;text-shadow:0 2px 8px #000,0 0 2px #000}.adv-sub b{color:#e8c98a}"
   +".adv-eye{position:absolute;left:50%;top:58px;transform:translateX(-50%);width:44px;height:6px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden;display:none}.adv-eye>i{display:block;height:100%;background:#ffcf5a}"
   +".adv-boss{position:absolute;left:15%;right:15%;top:56px;display:none;text-align:center;font:400 15px 'Instrument Serif',Georgia,serif}.adv-boss .adv-bar{height:8px}.adv-boss .adv-bar>i{background:linear-gradient(90deg,#7a1a2a,#d84a5a)}"
   +".adv-hurt{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(140,0,0,.65));opacity:0}"
   +".adv-panel{position:absolute;inset:0;background:rgba(5,6,9,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:18px;z-index:3}"
   +".adv-card{width:min(420px,100%);max-height:88vh;overflow:auto;background:rgba(20,22,28,.94);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:18px}.adv-card h3{margin:0 0 4px;font:400 22px 'Instrument Serif',Georgia,serif}.adv-card p{font:400 12.5px/1.6 Manrope;color:#d6d2ca;white-space:pre-wrap}"
   +".adv-card .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.adv-card button{flex:1;min-width:120px;min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font:700 12px Manrope;cursor:pointer}.adv-card button.pri{background:#B8935A;color:#12100e;border:none}"
   +".adv-inv{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.adv-inv div{aspect-ratio:1;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;text-align:center;font:600 9.5px/1.25 Manrope;padding:4px;cursor:pointer}"
   +".adv-dlg{position:absolute;left:10px;right:10px;bottom:12px;pointer-events:auto;background:rgba(14,16,22,.9);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;z-index:3;max-width:560px;margin:0 auto}.adv-dlg .who{font:700 9px Manrope;letter-spacing:.14em;text-transform:uppercase;color:#e8c98a}.adv-dlg .say{font:400 13.5px/1.55 Manrope;margin:6px 0 10px;min-height:40px}"
   +".adv-dlg .ch{display:flex;flex-direction:column;gap:6px}.adv-dlg .ch button{text-align:left;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:600 12px Manrope;padding:8px 11px}.adv-dlg .typ{display:flex;gap:6px;margin-top:6px}.adv-dlg input{flex:1;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:#fff;padding:0 10px;font:500 13px Manrope}"
   +".adv-box{position:absolute;left:0;right:0;height:0;background:#000;transition:height .5s;z-index:2}.adv-box.t{top:0}.adv-box.b{bottom:0}.adv-ui.cut .adv-box{height:11vh}.adv-ui.cut .adv-zone,.adv-ui.cut .adv-btns,.adv-ui.cut .adv-wpn,.adv-ui.cut .adv-hp{opacity:0;pointer-events:none}"
   +".adv-skip{position:absolute;right:12px;bottom:calc(11vh + 10px);pointer-events:auto;display:none;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.4);color:#fff;font:700 11px Manrope;padding:8px 12px;z-index:4}.adv-ui.cut .adv-skip{display:block}"
   +".adv-mark{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #e8c98a;border-radius:50%;display:none;box-shadow:0 0 10px rgba(232,201,138,.6)}.adv-mark i{position:absolute;top:20px;left:50%;transform:translateX(-50%);font:700 9px Manrope;color:#e8c98a;white-space:nowrap;font-style:normal;text-shadow:0 1px 4px #000}"
   +".adv-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.adv-pad button{min-height:50px;font-size:18px}.adv-code{font:700 26px 'JetBrains Mono',monospace;text-align:center;letter-spacing:.3em;margin:6px 0;min-height:34px}"
   +".adv-dmg{position:fixed;z-index:7;transform:translate(-50%,-50%);font:800 15px Manrope;color:#ffe2a8;text-shadow:0 2px 6px #000;pointer-events:none}"
   +"#__advGrain{position:fixed;inset:-50%;z-index:5;pointer-events:none;opacity:0;mix-blend-mode:overlay;animation:advgr .5s steps(4) infinite}#__advVig{position:fixed;inset:0;z-index:5;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,.85));opacity:0}"
   +"@keyframes advgr{0%{transform:translate(0,0)}25%{transform:translate(-5%,3%)}50%{transform:translate(4%,-4%)}75%{transform:translate(-3%,-2%)}}"
   +"@media (prefers-reduced-motion:reduce){#__advGrain{animation:none}}body.adv-game #__row,body.adv-game #__hint,body.adv-game #__top,body.adv-game #__dock,body.adv-game #__more,body.adv-game #__motion,body.adv-game #__stick,body.adv-game #__spinb,body.adv-game #__spinmark,body.adv-game #__sheet,body.adv-game #__xrbar,body.adv-game #__narr{display:none!important}"
   +".adv-ui.visitor .adv-zone,.adv-ui.visitor #advAtk,.adv-ui.visitor #advDodge,.adv-ui.visitor #advCrouch,.adv-ui.visitor #advSwap,.adv-ui.visitor .adv-hp,.adv-ui.visitor .adv-wpn,.adv-ui.visitor #advInvB,.adv-ui.visitor #advPauseB{display:none}"
   +".adv-ui.visitor #advUse{display:none;bottom:120px;right:6px}.adv-ui.visitor #advUse.hint{display:flex;width:auto;min-width:64px;padding:0 14px;border-radius:14px}.adv-ui.visitor .adv-top{top:64px}";
  function $(id){ return document.getElementById(id); }
  A._buildUI=function(){
    if($("advUI")) return; var st=document.createElement("style"); st.textContent=CSS; document.head.appendChild(st);
    var gr=document.createElement("div"); gr.id="__advGrain"; try{ var c=document.createElement("canvas"); c.width=c.height=128; var x=c.getContext("2d"), d=x.createImageData(128,128); for(var i=0;i<d.data.length;i+=4){ var v=Math.random()*255; d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255; } x.putImageData(d,0,0); gr.style.backgroundImage="url("+c.toDataURL()+")"; }catch(e){}
    document.body.appendChild(gr); var vg=document.createElement("div"); vg.id="__advVig"; document.body.appendChild(vg);
    var u=document.createElement("div"); u.className="adv-ui"+(A._game?"":" visitor"); u.id="advUI";
    u.innerHTML='<div class="adv-hurt" id="advHurt"></div><div class="adv-box t"></div><div class="adv-box b"></div>'
      +'<div class="adv-zone" id="advL"><div class="adv-stick" id="advStick"><div class="adv-knob" id="advKnob"></div></div></div><div class="adv-zone" id="advR"></div>'
      +'<div class="adv-top"><div class="adv-hp" id="advHp"><div class="adv-lbl">Health</div><div class="adv-bar"><i id="advHpBar"></i></div><div class="adv-bar mana" id="advManaW" style="display:none"><i id="advMana"></i></div></div>'
      +'<div class="adv-obj" id="advObj" style="display:none"></div><div class="adv-menu"><button id="advInvB" aria-label="Inventory">&#9636;</button><button id="advPauseB" aria-label="Pause">II</button></div></div>'
      +'<div class="adv-eye" id="advEye"><i id="advEyeBar"></i></div><div class="adv-boss" id="advBoss"><span id="advBossN"></span><div class="adv-bar"><i id="advBossBar"></i></div></div>'
      +'<div class="adv-mark" id="advMark"><i id="advMarkT"></i></div>'
      +'<div class="adv-wpn" id="advWpn"></div><div class="adv-btns"><button class="adv-b" id="advAtk">ATTACK</button><button class="adv-b" id="advUse">USE</button><button class="adv-b" id="advDodge">DODGE</button><button class="adv-b" id="advCrouch">SNEAK</button><button class="adv-b" id="advSwap">SWAP</button></div>'
      +'<div class="adv-toast" id="advToast"></div><div class="adv-sub" id="advSub"></div><button class="adv-skip" id="advSkip">Skip &rsaquo;</button><div id="advLayer"></div>';
    document.body.appendChild(u); A._ui=null;
    var press=function(id,fn){ var b=$(id); var h=function(e){ e.preventDefault(); e.stopPropagation(); A._audioWake(); fn(); }; b.addEventListener("touchstart",h,{passive:false}); b.addEventListener("mousedown",h); };
    press("advAtk",function(){ A._holdAtk=true; A.attack(); }); ["touchend","mouseup","touchcancel"].forEach(function(ev){ $("advAtk").addEventListener(ev,function(){ A._holdAtk=false; }); });
    press("advUse",function(){ A.activate(); }); press("advDodge",function(){ A.dodge(); }); press("advCrouch",function(){ A.crouch(); }); press("advSwap",function(){ A.swapWeapon(); });
    press("advInvB",function(){ A.inventory(); }); press("advPauseB",function(){ A.pause(); }); press("advSkip",function(){ A._skipCut=true; });
    // left stick
    var L=$("advL"), stick=$("advStick"), knob=$("advKnob"), sid=null, sx=0, sy=0;
    L.addEventListener("touchstart",function(e){ A._audioWake(); var t=e.changedTouches[0]; sid=t.identifier; sx=t.clientX; sy=t.clientY; stick.style.display="block"; stick.style.left=sx+"px"; stick.style.top=sy+"px"; A._stick={x:0,y:0}; e.preventDefault(); },{passive:false});
    L.addEventListener("touchmove",function(e){ for(var i=0;i<e.changedTouches.length;i++){ var t=e.changedTouches[i]; if(t.identifier!==sid) continue; var dx=t.clientX-sx, dy=t.clientY-sy, d=Math.hypot(dx,dy), m=46; if(d>m){ dx=dx/d*m; dy=dy/d*m; } knob.style.transform="translate("+dx+"px,"+dy+"px)"; A._stick={x:dx/m,y:dy/m,run:d>m*0.98}; } e.preventDefault(); },{passive:false});
    var end=function(e){ for(var i=0;i<e.changedTouches.length;i++){ if(e.changedTouches[i].identifier===sid){ sid=null; A._stick=null; stick.style.display="none"; knob.style.transform=""; } } };
    L.addEventListener("touchend",end); L.addEventListener("touchcancel",end);
    // right side drags the camera; a quick tap attacks
    var R=$("advR"), rid=null, rx=0, ry=0, rt=0, rmoved=false;
    R.addEventListener("touchstart",function(e){ A._audioWake(); var t=e.changedTouches[0]; rid=t.identifier; rx=t.clientX; ry=t.clientY; rt=performance.now(); rmoved=false; e.preventDefault(); },{passive:false});
    R.addEventListener("touchmove",function(e){ for(var i=0;i<e.changedTouches.length;i++){ var t=e.changedTouches[i]; if(t.identifier!==rid) continue; var dx=t.clientX-rx, dy=t.clientY-ry; if(Math.abs(dx)+Math.abs(dy)>4) rmoved=true; A._camYaw-=dx*0.0075; A._camPitch=clamp(A._camPitch-dy*0.005,-0.9,0.55); rx=t.clientX; ry=t.clientY; A._lookT=performance.now(); } e.preventDefault(); },{passive:false});
    R.addEventListener("touchend",function(e){ for(var i=0;i<e.changedTouches.length;i++){ if(e.changedTouches[i].identifier===rid){ rid=null; if(!rmoved&&performance.now()-rt<220) A.attack(); } } });
    // mouse: drag anywhere on the right to look
    var md=false; R.addEventListener("mousedown",function(e){ md=true; rx=e.clientX; ry=e.clientY; A._audioWake(); }); window.addEventListener("mouseup",function(){ md=false; });
    window.addEventListener("mousemove",function(e){ if(!md) return; A._camYaw-=(e.clientX-rx)*0.006; A._camPitch=clamp(A._camPitch-(e.clientY-ry)*0.004,-0.9,0.55); rx=e.clientX; ry=e.clientY; A._lookT=performance.now(); });
    A._keys={}; window.addEventListener("keydown",function(e){ if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName)) return; var k=e.key.toLowerCase(); A._keys[k]=true; A._audioWake();
      if(k===" "||k==="f"){ A.attack(); e.preventDefault(); } else if(k==="e") A.activate(); else if(k==="q") A.dodge(); else if(k==="c") A.crouch(); else if(k==="r") A.reload(); else if(k==="i"||k==="tab"){ A.inventory(); e.preventDefault(); } else if(k==="escape"||k==="p") A.pause(); else if(k==="1"||k==="2"||k==="3"||k==="4"){ var w=A.player&&A.player.weapons[+k-1]; if(w) A.equip(w); } else if(k==="x") A.swapWeapon(); });
    window.addEventListener("keyup",function(e){ A._keys[e.key.toLowerCase()]=false; });
  };
  A.swapWeapon=function(){ var P=A.player; if(!P||P.weapons.length<2) return; var i=P.weapons.indexOf(P.weapon); A.equip(P.weapons[(i+1)%P.weapons.length]); A.sfx("reload"); };
  A.toast=function(text){ var el=$("advToast"); if(!el) return; el.textContent=String(text); el.style.opacity="1"; clearTimeout(A._toastT); A._toastT=setTimeout(function(){ el.style.opacity="0"; },2200); };
  A._hud=function(){ var P=A.player; if(!P||!$("advHpBar")){ A._hudDirty=false; A._renderObjective(); return; } A._hudDirty=false;
    $("advHpBar").style.width=(100*A.state.health/A.state.maxHealth)+"%";
    var w=P.wInfo||{}; $("advManaW").style.display=w.kind==="spell"?"block":"none"; $("advMana").style.width=A.state.mana+"%";
    $("advWpn").innerHTML=(w.name?w.name.charAt(0).toUpperCase()+w.name.slice(1):"")+(w.kind==="gun"?"<small>"+(P.clip[w.name]||0)+" / "+(A.state.ammo[w.name]||0)+(P.reload>0?" · reloading":"")+"</small>":w.kind==="spell"?"<small>magic "+Math.round(A.state.mana)+"</small>":"");
    $("advSwap").style.display=P.weapons.length>1?"flex":"none"; $("advCrouch").classList.toggle("on",!!P.char.wantCrouch);
    $("advAtk").textContent=w.kind==="gun"?"FIRE":w.kind==="spell"?"CAST":"ATTACK";
    var b=A._boss; $("advBoss").style.display=b&&!b.dead&&b.state==="chase"?"block":"none"; if(b){ $("advBossN").textContent=b.name||"Boss"; $("advBossBar").style.width=(100*b.health/b.maxHealth)+"%"; }
    A._renderObjective(); };

  // ── THE HERO MOVES
  A._moveVec={x:0,z:0};
  A._updatePlayer=function(dt){
    var P=A.player; if(!P){ A._visitorNear(); return; } var C=P.char;
    P.cd=Math.max(0,P.cd-dt); P.inv=Math.max(0,P.inv-dt); P.dodgeT=Math.max(0,(P.dodgeT||0)-dt); if(P.reload>0){ P.reload-=dt; if(P.reload<=0) A._hudDirty=true; }
    if(P.wInfo&&P.wInfo.kind==="spell"&&A.state.mana<100){ A.state.mana=Math.min(100,A.state.mana+dt*3); if(Math.random()<0.05) A._hudDirty=true; }
    var ix=0, iz=0, run=false;
    if(!A._dead&&!A._cut&&!A._ui){
      if(A._stick){ ix=A._stick.x; iz=A._stick.y; run=!!A._stick.run; }
      var k=A._keys||{}; if(k.w||k.arrowup) iz-=1; if(k.s||k.arrowdown) iz+=1; if(k.a||k.arrowleft) ix-=1; if(k.d||k.arrowright) ix+=1; if(k.shift) run=true;
      var gp=A._pad(); if(gp){ if(Math.abs(gp.lx)>0.18) ix=gp.lx; if(Math.abs(gp.ly)>0.18) iz=gp.ly; run=run||Math.hypot(gp.lx,gp.ly)>0.9; A._camYaw-=gp.rx*dt*2.6; A._camPitch=clamp(A._camPitch-gp.ry*dt*1.8,-0.9,0.55); }
    }
    var mag=Math.min(1,Math.hypot(ix,iz)); var cy=A._camYaw; A._fwdish=iz<-0.5&&Math.abs(ix)<0.45;
    var mx=(ix*Math.cos(cy)+iz*Math.sin(cy)), mz=(-ix*Math.sin(cy)+iz*Math.cos(cy)); A._moveVec={x:mx,z:mz};
    var sp=P.speed*(run&&!C.wantCrouch?1.75:1)*(C.wantCrouch?0.5:1)*(P.reload>0?0.8:1)*mag;
    if(P.dodgeT>0){ P.pos.x+=P.vel.x*dt; P.pos.z+=P.vel.z*dt; P.vel.multiplyScalar(Math.pow(0.02,dt)); }
    else { var tvx=mag>0.05?mx/Math.max(mag,0.001)*sp:0, tvz=mag>0.05?mz/Math.max(mag,0.001)*sp:0; P.vel.x=damp(P.vel.x,tvx,12,dt); P.vel.z=damp(P.vel.z,tvz,12,dt); P.pos.x+=P.vel.x*dt; P.pos.z+=P.vel.z*dt; }
    var hs=Math.hypot(P.vel.x,P.vel.z);
    if(hs>0.3&&P.dodgeT<=0&&!(A._holdAtk&&P.wInfo&&P.wInfo.kind!=="melee")) P.yaw+=angDiff(P.yaw,Math.atan2(-P.vel.x,-P.vel.z))*Math.min(1,dt*12);
    if(A.cfg.view==="first") P.yaw=A._camYaw;
    var c=A._collide(P.pos.x,P.pos.z,0.33,P.pos.y,1.75); P.pos.x=c[0]; P.pos.z=c[1];
    var g=A.groundAt(P.pos.x,P.pos.z,P.pos.y);
    if(P.pos.y>g+0.05){ P.vy-=18*dt; P.pos.y+=P.vy*dt; if(P.pos.y<=g){ P.pos.y=g; P.vy=0; } } else { P.pos.y=damp(P.pos.y,g,20,dt); P.vy=0; }
    if(P.pos.y<-40){ A.damagePlayer(999); }
    // footsteps make noise, running makes more
    P.stepT=(P.stepT||0)-dt*hs; if(P.stepT<=0&&hs>0.5){ P.stepT=run?1.6:1.3; A.sfx("step"); if(!C.wantCrouch) A.noise(P.pos.x,P.pos.z,run?7:3); }
    if(A._holdAtk&&P.wInfo&&P.wInfo.name==="rifle") A.attack();
    C.aiming=!!(A._holdAtk&&P.wInfo&&P.wInfo.kind!=="melee");
    C.root.position.copy(P.pos); C.root.rotation.y=P.yaw; C.animate(dt,hs,run);
    if(P.inv>0&&!A._dead) C.root.visible=A.cfg.view!=="first"&&(Math.floor(P.inv*20)%2===0||P.inv>1.5); else C.root.visible=A.cfg.view!=="first";
    // nearest usable thing
    var best=null, bd=1e9; for(var i=0;i<A.usables.length;i++){ var u=A.usables[i]; if(!u.enabled) continue; var d=Math.hypot(u.x-P.pos.x,u.z-P.pos.z); if(d<u.r&&d<bd){ bd=d; best=u; } }
    for(var j=0;j<A.items.length;j++){ var it=A.items[j]; var d2=Math.hypot(it.mesh.position.x-P.pos.x,it.mesh.position.z-P.pos.z);
      if(d2<1.1&&it.auto!==false&&(it.auto||/ammo|health|herb|mana|potion/i.test(it.kind))){ A._pick(it); j--; continue; }
      if(d2<1.5&&d2<bd){ bd=d2; best={label:"Pick up "+it.name,item:it}; } }
    A._near=best; var ub=$("advUse"); if(ub){ var lbl=best?String(best.label).split(" ")[0].toUpperCase().slice(0,7):"USE"; if(ub.textContent!==lbl) ub.textContent=lbl; ub.classList.toggle("hint",!!best); }
    // zones
    for(var z=0;z<A._zones.length;z++){ var Z=A._zones[z]; if(Z.done) continue; var inside=Math.abs(P.pos.x-Z.x)<Z.hw&&Math.abs(P.pos.z-Z.z)<Z.hd;
      if(inside&&!Z.inside){ Z.inside=true; if(Z.once) Z.done=true; try{ Z.on(); }catch(e){} } else if(!inside&&Z.inside){ Z.inside=false; if(Z.leave) try{ Z.leave(); }catch(e){} } }
    // torch follows the camera's aim
    if(P.torch&&P.torchOn){ var cam=W().camera; var fwd=new (T().Vector3)(); cam.getWorldDirection(fwd); P.torch.position.set(P.pos.x,P.pos.y+1.45,P.pos.z).addScaledVector(fwd,0.3).add(new (T().Vector3)(fwd.z*0.25,0,-fwd.x*0.25)); P.torch.target.position.copy(P.torch.position).addScaledVector(fwd,8); P.torch.target.updateMatrixWorld(); }
    A.state.health=Math.min(A.state.maxHealth,A.state.health); A._hurtFx=Math.max(0,(A._hurtFx||0)-dt*1.6); var hu=$("advHurt"); if(hu) hu.style.opacity=String(Math.max(A._hurtFx,A.state.health<30?0.35+0.15*Math.sin(performance.now()/180):0));
    if(A.state.health<30&&!A._dead){ A._beatT=(A._beatT||0)-dt; if(A._beatT<=0){ A._beatT=0.9; A.sfx("heartbeat"); } }
  };
  // no hero (a world, not a game): the camera is the visitor, and USE shows its full words
  A._visitorNear=function(){ var cam=W()&&W().camera; if(!cam) return; var x=cam.position.x, z=cam.position.z, best=null, bd=1e9;
    for(var i=0;i<A.usables.length;i++){ var u=A.usables[i]; if(!u.enabled) continue; var d=Math.hypot(u.x-x,u.z-z); if(d<u.r+1.2&&d<bd){ bd=d; best=u; } }
    for(var j=0;j<A.items.length;j++){ var it=A.items[j]; var d2=Math.hypot(it.mesh.position.x-x,it.mesh.position.z-z); if(d2<2.4&&d2<bd){ bd=d2; best={label:"Pick up "+it.name,item:it}; } }
    A._near=best; var ub=$("advUse"); if(ub){ var l=best?String(best.label).slice(0,26):""; if(ub.textContent!==l) ub.textContent=l; ub.classList.toggle("hint",!!best); }
    for(var z2=0;z2<A._zones.length;z2++){ var Z=A._zones[z2]; if(Z.done) continue; var inside=Math.abs(x-Z.x)<Z.hw&&Math.abs(z-Z.z)<Z.hd; if(inside&&!Z.inside){ Z.inside=true; if(Z.once) Z.done=true; try{ Z.on(); }catch(e){} } else if(!inside&&Z.inside){ Z.inside=false; } } };
  A.activate=A["use"]=function(){ if(A._ui||A._cut||A._dead) return; var n=A._near; if(!n) return; if(n.item){ if(A.player) A.player.char.play("grab",0.4); A._pick(n.item); return; }
    if(n.needs&&!A.has(n.needs)){ A.sfx("locked"); A.toast(n.locked||("You need: "+n.needs)); return; }
    if(A.player) A.player.char.play("grab",0.4); if(n.once){ n.enabled=false; } try{ n.on(n); }catch(e){} };
  A._pad=function(){ try{ var g=navigator.getGamepads&&navigator.getGamepads(); if(!g) return null; for(var i=0;i<g.length;i++){ var p=g[i]; if(!p||!p.connected) continue; var b=function(n){ return p.buttons[n]&&p.buttons[n].pressed; };
      var st=A._padPrev||{}; var now={a:b(0),b:b(1),x:b(2),y:b(3),rt:b(7)||b(5),lb:b(4),st:b(9),sel:b(8)};
      if(now.rt&&!st.rt) A.attack(); if(now.x&&!st.x) A.attack(); if(now.a&&!st.a) A.activate(); if(now.b&&!st.b) A.dodge(); if(now.y&&!st.y) A.swapWeapon(); if(now.lb&&!st.lb) A.crouch(); if(now.st&&!st.st) A.pause(); if(now.sel&&!st.sel) A.inventory();
      A._holdAtk=A._holdAtk||now.rt; A._padPrev=now; return {lx:p.axes[0]||0,ly:p.axes[1]||0,rx:p.axes[2]||0,ry:p.axes[3]||0}; } }catch(e){} return null; };
  // ── THE CAMERA
  A._updateCamera=function(dt){
    var P=A.player, cam=W().camera; if(!P||A._cut) return; var t=T();
    // the camera drifts behind the hero only when she runs forward - strafing must not spin the view
    var moving=Math.hypot(P.vel.x,P.vel.z)>0.6&&A._fwdish; if(A.cfg.view!=="first"&&moving&&(!A._lookT||performance.now()-A._lookT>1600)) A._camYaw+=angDiff(A._camYaw,P.yaw)*Math.min(1,dt*0.9);
    var crouch=P.char.crouch||0, head=new t.Vector3(P.pos.x,P.pos.y+1.68-crouch*0.45,P.pos.z);
    if(A.cfg.view==="first"){ cam.position.copy(head); cam.rotation.set(0,0,0,"YXZ"); cam.rotation.order="YXZ"; cam.rotation.y=A._camYaw; cam.rotation.x=A._camPitch; A._applyShake(cam,dt); return; }
    var aim=P.char.aiming, dist=aim?2.0:3.1, side=aim?0.62:0.68;
    var dir=new t.Vector3(Math.sin(A._camYaw)*Math.cos(A._camPitch),-Math.sin(A._camPitch),Math.cos(A._camYaw)*Math.cos(A._camPitch));
    var right=new t.Vector3(Math.cos(A._camYaw),0,-Math.sin(A._camYaw));
    var pivotP=head.clone().addScaledVector(right,side);
    var want=pivotP.clone().addScaledVector(dir,dist);
    var hit=A.blocked(pivotP.x,pivotP.z,want.x,want.z,want.y); if(hit>=0){ want=pivotP.clone().addScaledVector(dir,Math.max(0.35,dist*hit-0.25)); }
    var ceil=A._ceilingOver?A._ceilingOver(want):null; var floorY=A.groundAt(want.x,want.z,want.y)+0.25; if(want.y<floorY) want.y=floorY;
    A._camPos=A._camPos||want.clone(); A._camPos.x=damp(A._camPos.x,want.x,18,dt); A._camPos.y=damp(A._camPos.y,want.y,18,dt); A._camPos.z=damp(A._camPos.z,want.z,18,dt);
    cam.position.copy(A._camPos); var look=pivotP.clone().addScaledVector(dir,-6); cam.lookAt(look); A._applyShake(cam,dt);
    if(A._heroLight){ A._heroLight.position.copy(A._camPos).lerp(head,0.45); A._heroLight.position.y+=0.35; A._heroLight.intensity=(A.cfg.genre==="horror"?1.6:2.4); }
    if(cam.fov!==(aim?58:68)){ cam.fov=damp(cam.fov,aim?58:68,10,dt); cam.updateProjectionMatrix(); }
  };
  A._applyShake=function(cam,dt){ if(A._shk&&A._shk.t>0){ A._shk.t-=dt; var k=A._shk.p*(A._shk.t/A._shk.d); cam.position.x+=rnd(-k,k)*0.3; cam.position.y+=rnd(-k,k)*0.3; } };
  A.shake=function(p,ms){ A._shk={p:p||0.3,t:(ms||250)/1000,d:(ms||250)/1000}; };
  A.scare=function(p){ A.shake(p||0.6,400); var hu=$("advHurt"); A._hurtFx=Math.max(A._hurtFx||0,0.4); try{ (window.__spineTap||function(v){navigator.vibrate&&navigator.vibrate(v);})([30,40,60]); }catch(e){} };
  // waypoint marker for the current objective
  A.waypoint=function(at){ A._wp=at?{x:at[0],z:at[at.length-1],y:at.length>2?at[1]:null}:null; return A; };
  A._updateMarker=function(){ var m=$("advMark"); if(!m) return; if(!A._wp||A._cut||!A.player){ m.style.display="none"; return; }
    var t=T(); var p=new t.Vector3(A._wp.x,(A._wp.y!=null?A._wp.y:A.groundAt(A._wp.x,A._wp.z,50))+1.2,A._wp.z); var d=p.distanceTo(A.player.pos); if(d<2){ m.style.display="none"; return; }
    p.project(W().camera); var behind=p.z>1; var x=(p.x*0.5+0.5)*innerWidth, y=(-p.y*0.5+0.5)*innerHeight; if(behind){ x=innerWidth-x; y=innerHeight-30; }
    m.style.display="block"; m.style.left=clamp(x,24,innerWidth-24)+"px"; m.style.top=clamp(y,80,innerHeight-40)+"px"; $("advMarkT").textContent=Math.round(d)+" m"; };

  // ════════════════════════════════════════════════════════════════════════
  //  STORY TOOLS: objectives and quests, reading, talking, cutscenes
  // ════════════════════════════════════════════════════════════════════════
  A._quests=[];
  A.objective=function(text,at){ A._obj={title:"Objective",steps:[{text:String(text),done:false}]}; if(at) A.waypoint(at); A._hudDirty=true; return A; };
  A.quest=function(title,steps,at){ var q={title:title||"Quest",steps:(steps||[]).map(function(s){ return typeof s==="string"?{text:s,done:false}:Object.assign({done:false},s); })}; A._quests.push(q); A._obj=q; if(at) A.waypoint(at);
    var first=q.steps[0]; if(first&&first.at) A.waypoint(first.at); A._hudDirty=true; A.toast("New quest: "+q.title); A.sfx("chime"); return q; };
  A.complete=function(match){ var q=A._obj; if(!q) return; var m=String(match||"").toLowerCase(), hit=null;
    q.steps.forEach(function(s){ if(!hit&&!s.done&&(!m||String(s.id||"").toLowerCase()===m||String(s.text).toLowerCase().indexOf(m)>=0)) hit=s; }); if(!hit&&!m) hit=q.steps.filter(function(s){ return !s.done; })[0];
    if(!hit) return; hit.done=true; A.sfx("chime"); var next=q.steps.filter(function(s){ return !s.done; })[0]; if(next&&next.at) A.waypoint(next.at); else if(!next) A.waypoint(null);
    if(!next){ A.toast(q.title+" complete"); A._emit("quest",{title:q.title}); } A._hudDirty=true; };
  A._renderObjective=function(){ var el=$("advObj"); if(!el) return; var q=A._obj; if(!q){ el.style.display="none"; return; } el.style.display="block";
    el.innerHTML="<b>"+esc(q.title)+"</b>"+q.steps.slice(0,4).map(function(s){ return '<div class="'+(s.done?"dn":"")+'">'+(s.done?"&#10003; ":"&#9675; ")+esc(s.text)+"</div>"; }).join(""); };
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  A._panel=function(html,onClose){ var L=$("advLayer"); if(!L) return null; A._ui=true; var p=document.createElement("div"); p.className="adv-panel"; p.innerHTML='<div class="adv-card">'+html+'</div>'; L.appendChild(p);
    p.close=function(){ try{ p.remove(); }catch(e){} if(!L.querySelector(".adv-panel:not(.adv-titlecard),.adv-dlg")) A._ui=null; if(onClose) onClose(); }; return p; };
  A.read=function(title,text){ var p=A._panel("<h3>"+esc(title)+"</h3><p>"+esc(text)+'</p><div class="row"><button class="pri" data-x>Close</button><button data-sp>Read aloud</button></div>');
    p.querySelector("[data-x]").onclick=function(){ try{ speechSynthesis.cancel(); }catch(e){} p.close(); }; p.querySelector("[data-sp]").onclick=function(){ A._speak(String(text),"Narrator"); }; return p; };
  A.inventory=function(){ if(A._ui||A._cut) return; var inv=A.state.inventory, P=A.player;
    var p=A._panel("<h3>Inventory</h3><p style='margin:0;color:#a8b0bd'>"+(P?P.weapons.length+" weapon"+(P.weapons.length>1?"s":"")+" · ":"")+Math.round(A.state.health)+" health</p><div class='adv-inv'>"
      +(P?P.weapons.map(function(w){ return "<div data-w='"+w+"' style='border-color:"+(w===P.weapon?"#B8935A":"")+"'>"+esc(w)+(A.state.ammo[w]!=null?"<br>"+((P.clip[w]||0)+A.state.ammo[w]):"")+"</div>"; }).join(""):"")
      +inv.map(function(it,i){ return "<div data-i='"+i+"'>"+esc(it.name)+"</div>"; }).join("")+"</div><p id='advInvD' style='min-height:20px'></p><div class='row'><button class='pri' data-x>Back to the game</button></div>");
    p.querySelectorAll("[data-w]").forEach(function(b){ b.onclick=function(){ A.equip(b.getAttribute("data-w")); p.close(); }; });
    p.querySelectorAll("[data-i]").forEach(function(b){ b.onclick=function(){ var it=inv[+b.getAttribute("data-i")]; var d=p.querySelector("#advInvD"); d.innerHTML=esc(it.desc||it.text||it.name)+(/health|herb|med|potion|bandage/i.test(it.kind||it.name)?' <button data-use style="min-height:34px;margin-top:6px">Use</button>':"")+(it.text?' <button data-rd style="min-height:34px;margin-top:6px">Read</button>':"");
      var ub=d.querySelector("[data-use]"); if(ub) ub.onclick=function(){ A.heal(it.heal||35); A.take(it.name); p.close(); A.toast("Health restored"); }; var rb=d.querySelector("[data-rd]"); if(rb) rb.onclick=function(){ p.close(); A.read(it.name,it.text); }; }; });
    p.querySelector("[data-x]").onclick=function(){ p.close(); }; };
  A.pause=function(){ if(A._ui) return; A._paused=true;
    var p=A._panel("<h3>Paused</h3><p style='margin:0;color:#a8b0bd'>Chapter "+A.state.chapter+(A.cfg.chapterTitle?" · "+esc(A.cfg.chapterTitle):"")+"</p><div class='row'><button class='pri' data-r>Resume</button><button data-s>Save game</button></div>"
      +"<div class='row'><button data-q>Picture: "+(A._q.name||"Balanced")+"</button><button data-v>View: "+(A.cfg.view==="first"?"First person":"Over the shoulder")+"</button></div><div class='row'><button data-vo>Voices: "+({off:"Off",phone:"Phone",studio:"Studio"}[A.cfg.voices]||"Phone")+"</button><button data-d>Difficulty: "+A.cfg.difficulty+"</button></div>"
      +"<div class='row'><button data-c>Restart from checkpoint</button><button data-h>How to play</button></div>",function(){ A._paused=false; });
    var q=function(s){ return p.querySelector(s); };
    q("[data-r]").onclick=function(){ p.close(); }; q("[data-s]").onclick=function(){ A._autosave(true); A.toast("Game saved"); p.close(); };
    q("[data-q]").onclick=function(){ var order=["low","medium","high"]; A.quality(order[(order.indexOf(A.cfg.quality)+1)%3]); p.close(); A.pause(); };
    q("[data-v]").onclick=function(){ A.view(A.cfg.view==="first"?"third":"first"); p.close(); A.pause(); };
    q("[data-vo]").onclick=function(){ var o=["phone","studio","off"]; A.cfg.voices=o[(o.indexOf(A.cfg.voices)+1)%3]; p.close(); A.pause(); };
    q("[data-d]").onclick=function(){ var o=["easy","normal","hard"]; A.cfg.difficulty=o[(o.indexOf(A.cfg.difficulty)+1)%3]; p.close(); A.pause(); };
    q("[data-c]").onclick=function(){ p.close(); A.respawn(); };
    q("[data-h]").onclick=function(){ p.close(); A.read("How to play","Left thumb: move (push all the way to run).\nRight side: drag to look, tap to attack.\nUSE: open doors, pick things up, talk.\nDODGE: roll out of the way.\nSNEAK: crouch - quieter and harder to see. Attacking someone who has not seen you is a takedown.\nSWAP: change weapon.\n\nKeyboard: WASD move, Shift run, mouse drag to look, Space attack, E use, Q dodge, C sneak, R reload, I inventory, Esc pause.\nGame controller: left stick move, right stick look, RT or X attack, A use, B dodge, Y swap, LB sneak."); }; };
  A._showDeath=function(){ var p=A._panel("<h3>"+(A.cfg.genre==="horror"?"You did not make it.":"You were defeated.")+"</h3><p>"+(A.state.deaths>2?"Tip: sneak past what you cannot fight, and look for health in drawers and shelves.":"Back to the last checkpoint?")+"</p><div class='row'><button class='pri' data-r>Try again</button><button data-e>Make it easier</button></div>");
    p.querySelector("[data-r]").onclick=function(){ p.close(); A.respawn(); }; p.querySelector("[data-e]").onclick=function(){ A.cfg.difficulty="easy"; p.close(); A.respawn(); }; A._deathP=p; };
  A._hideDeath=function(){ if(A._deathP){ try{ A._deathP.close(); }catch(e){} A._deathP=null; } };
  A._keypadUI=function(code,done,hint){ var cur=""; var p=A._panel("<h3>Keypad</h3>"+(hint?"<p style='margin:0'>"+esc(hint)+"</p>":"")+"<div class='adv-code' id='advCode'>&nbsp;</div><div class='adv-pad'>"+[1,2,3,4,5,6,7,8,9,"C",0,"OK"].map(function(n){ return "<button data-n='"+n+"'>"+n+"</button>"; }).join("")+"</div><div class='row'><button data-x>Step away</button></div>");
    var show=function(){ p.querySelector("#advCode").textContent=cur||" "; };
    p.querySelectorAll("[data-n]").forEach(function(b){ b.onclick=function(){ var n=b.getAttribute("data-n"); A.sfx("tick"); if(n==="C") cur=""; else if(n==="OK"){ var ok=cur===code; p.close(); done(ok); return; } else if(cur.length<code.length+2) cur+=n; show(); }; });
    p.querySelector("[data-x]").onclick=function(){ p.close(); }; };
  // talking
  A._speak=function(text,who,opts){ var v=A.cfg.voices; if(v==="off") return Promise.resolve(); var S=window.Spine;
    if(v==="studio"&&S&&S.voice){ return S.voice(String(text),{character:who}).then(function(r){ var u=r&&(r.url||r.audioUrl||r); if(typeof u==="string"){ var a=new Audio(u); a.play().catch(function(){}); return new Promise(function(res){ a.onended=res; a.onerror=res; }); } return A._phoneSpeak(text,who); }).catch(function(){ return A._phoneSpeak(text,who); }); }
    return A._phoneSpeak(text,who); };
  A._phoneSpeak=function(text,who){ return new Promise(function(res){ try{ var u=new SpeechSynthesisUtterance(String(text)); var h=0; for(var i=0;i<String(who||"").length;i++) h=(h*31+String(who).charCodeAt(i))|0;
      var vs=speechSynthesis.getVoices().filter(function(v){ return /^en/i.test(v.lang); }); if(vs.length) u.voice=vs[Math.abs(h)%vs.length]; u.pitch=0.8+(Math.abs(h)%5)*0.1; u.rate=0.98; u.onend=res; u.onerror=res; speechSynthesis.speak(u); setTimeout(res,Math.min(14000,400+String(text).length*70)); }catch(e){ res(); } }); };
  A.say=function(who,text,ms){ var el=$("advSub"); if(!el) return Promise.resolve(); el.innerHTML=(who?"<b>"+esc(who)+":</b> ":"")+esc(text); clearTimeout(A._subT);
    var dur=ms||Math.max(2200,String(text).length*62); var sp=A._speak(text,who); A._subT=setTimeout(function(){ el.innerHTML=""; },dur); return Promise.all([sp,new Promise(function(r){ setTimeout(r,Math.min(dur,1800)); })]); };
  // A character you can talk to: fixed lines answer instantly and free; anything typed or spoken goes to their AI mind.
  A.npcs=[];
  A.npc=function(o){ A._ensure(); o=o||{}; var t=T(); var at=o.at||[0,0]; var C=A.makeCharacter({look:o.look||"",kind:o.kind||"villager",colors:o.colors,weapon:o.holding||null,model:o.model});
    var pos=new t.Vector3(at[0],A.groundAt(at[0],at[1],50),at[1]); C.root.position.copy(pos); C.root.rotation.y=(o.face||0)*Math.PI/180; W().scene.add(C.root); A.solid(C.root,{pad:-0.2});
    var N={name:o.name||"Stranger",persona:o.persona||"a local who knows this place",greet:o.greet||"...",topics:o.topics||o.lines||[],gives:o.gives||null,quest:o.quest||null,char:C,pos:pos,talked:0,mind:null,onTalk:o.onTalk||null,yaw:C.root.rotation.y};
    N.use=A.interact({at:at,radius:2,label:"Talk to "+N.name,on:function(){ A.talk(N); }}); A.npcs.push(N); return N; };
  A.talk=function(N){ if(A._ui) return; var L=$("advLayer"); A._ui=true; var d=document.createElement("div"); d.className="adv-dlg"; L.appendChild(d);
    var P=A.player; if(P){ var dx=P.pos.x-N.pos.x, dz=P.pos.z-N.pos.z; N.char.root.rotation.y=Math.atan2(-dx,-dz); P.yaw=Math.atan2(dx,dz); }
    try{ if(!N.mind&&window.Spine&&window.Spine.npc) N.mind=window.Spine.npc(N.name,N.persona+". You are in a "+(A.cfg.genre||"adventure")+" game called "+(A.cfg.title||"this story")+". Never mention being an AI."); }catch(e){}
    var line=function(text){ d.querySelector(".say").textContent=text; A._speak(text,N.name); };
    var close=function(){ try{ speechSynthesis.cancel(); }catch(e){} d.remove(); if(!L.querySelector(".adv-panel:not(.adv-titlecard),.adv-dlg")) A._ui=null; N.char.root.rotation.y=N.yaw;
      if(N.talked>0&&N.gives&&!A.state.flags["gave:"+N.name]){ A.state.flags["gave:"+N.name]=1; var g=typeof N.gives==="string"?{name:N.gives}:N.gives; if(g.weapon) A.giveWeapon(g.weapon); else A.give(g.name,g); }
      if(N.talked>0&&N.quest) A.complete(N.quest); if(N.onTalk) try{ N.onTalk(N); }catch(e){} };
    d.innerHTML='<div class="who">'+esc(N.name)+'</div><div class="say"></div><div class="ch"></div><div class="typ"><input placeholder="Say something..." enterkeyhint="send"><button class="adv-b" style="position:static;width:44px;height:40px;border-radius:10px" data-m aria-label="Speak">&#127908;</button></div><div class="ch" style="margin-top:6px"><button data-bye>Goodbye</button></div>';
    line(N.talked?(N.again||"Back again?"):N.greet); N.talked++;
    var ch=d.querySelector(".ch"); N.topics.forEach(function(tp){ var b=document.createElement("button"); b.textContent=tp.ask||tp; b.onclick=function(){ N.talked++; if(tp.answer){ line(tp.answer); if(tp.gives&&!A.state.flags["gave:"+N.name+":"+(tp.ask||tp)]){ A.state.flags["gave:"+N.name+":"+(tp.ask||tp)]=1; A.give(tp.gives); } if(tp.flag) A.flag(tp.flag,true); if(tp.complete) A.complete(tp.complete); } else ask(tp.ask||tp); b.remove(); }; ch.appendChild(b); });
    var inp=d.querySelector("input");
    var ask=function(q){ if(!q) return; d.querySelector(".say").textContent="..."; if(!N.mind){ line(N.fallback||"I have nothing more to say."); return; } var r=N.mind.say(String(q)); Promise.resolve(r).then(function(t2){ line(t2||"..."); }); };
    inp.addEventListener("keydown",function(e){ if(e.key==="Enter"){ ask(inp.value.trim()); inp.value=""; } });
    d.querySelector("[data-m]").onclick=function(){ if(window.Spine&&window.Spine.listen) window.Spine.listen(8000).then(function(t2){ if(t2) ask(t2); }); };
    d.querySelector("[data-bye]").onclick=close; };
  // CUTSCENES: shots with a camera, a line and a speaker; the hero cannot be hurt and the person can skip
  A.cutscene=function(shots){ var u=$("advUI"); A._cut=true; A._skipCut=false; if(u) u.classList.add("cut"); var t=T(), cam=W().camera; var i=0;
    return new Promise(function(done){
      var next=function(){ if(A._skipCut||i>=shots.length){ A._cut=false; if(u) u.classList.remove("cut"); var sb=$("advSub"); if(sb) sb.innerHTML=""; try{ speechSynthesis.cancel(); }catch(e){} done(); return; }
        var s=shots[i++]; var from=cam.position.clone(), fq=cam.quaternion.clone(); var to=s.cam?new t.Vector3(s.cam[0],s.cam[1],s.cam[2]):from.clone(); var lk=s.look?new t.Vector3(s.look[0],s.look[1],s.look[2]):null;
        var tmp=new t.PerspectiveCamera(); tmp.position.copy(to); if(lk) tmp.lookAt(lk); else tmp.quaternion.copy(fq); var tq=tmp.quaternion.clone(); var dur=(s.move||1.2), t0=performance.now();
        (function fly(){ if(A._skipCut){ next(); return; } var k=Math.min(1,(performance.now()-t0)/1000/dur), e=k<0.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; cam.position.lerpVectors(from,to,e); cam.quaternion.slerpQuaternions(fq,tq,e); if(k<1) requestAnimationFrame(fly); })();
        if(s.do) try{ s.do(); }catch(e){}
        var wait=s.say?A.say(s.who||"",s.say,s.ms):new Promise(function(r){ setTimeout(r,s.ms||1500); });
        Promise.resolve(wait).then(function(){ setTimeout(next,s.pause||250); }); };
      next(); }); };
  A.title=function(main,sub){ var p=A._panel("<p style='margin:0;font:700 9px Manrope;letter-spacing:.2em;color:#d8c9a8;text-transform:uppercase'>"+esc(sub||("Chapter "+A.state.chapter))+"</p><h3 style='font-size:30px;margin-top:6px'>"+esc(main)+"</h3>");
    p.style.background="rgba(0,0,0,.55)"; p.style.pointerEvents="none"; p.classList.add("adv-titlecard"); if(!document.querySelector("#advLayer .adv-panel:not(.adv-titlecard),#advLayer .adv-dlg")) A._ui=null;
    setTimeout(function(){ p.style.transition="opacity .8s"; p.style.opacity="0"; setTimeout(function(){ p.close(); },850); },2400); };

  // ════════════════════════════════════════════════════════════════════════
  //  SOUND. All synthesised on the phone: no files, no cost.
  // ════════════════════════════════════════════════════════════════════════
  A._audioWake=function(){ try{ if(!A._ac){ var AC=window.AudioContext||window.webkitAudioContext; A._ac=new AC(); A._out=A._ac.createGain(); A._out.gain.value=0.6; A._out.connect(A._ac.destination);
      var L=A._lookCfg; if(window.Spine&&window.Spine.soundtrack&&!A._music&&A.cfg.music!==false){ A._music=window.Spine.soundtrack(Object.assign({volume:0.12},L?L.music:{})); } }
    if(A._ac.state==="suspended") A._ac.resume(); }catch(e){} };
  function noiseBuf(ac,sec){ var b=ac.createBuffer(1,ac.sampleRate*sec,ac.sampleRate), d=b.getChannelData(0); for(var i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; }
  A.sfx=function(name,at){ var ac=A._ac; if(!ac) return; try{
    var vol=1; if(at&&A.player){ var d=Math.hypot(at.x-A.player.pos.x,at.z-A.player.pos.z); vol=clamp(1-d/26,0,1); if(vol<=0.02) return; }
    var now=ac.currentTime, g=ac.createGain(); g.connect(A._out);
    var env=function(a,dur,peak){ g.gain.setValueAtTime(0.0001,now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak*vol),now+a); g.gain.exponentialRampToValueAtTime(0.0001,now+dur); };
    var osc=function(type,f0,f1,dur){ var o=ac.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,now); if(f1) o.frequency.exponentialRampToValueAtTime(f1,now+dur); o.connect(g); o.start(now); o.stop(now+dur+0.05); return o; };
    var nz=function(dur,freq,q,type){ var s=ac.createBufferSource(); s.buffer=A._nb||(A._nb=noiseBuf(ac,1.2)); var f=ac.createBiquadFilter(); f.type=type||"bandpass"; f.frequency.value=freq; f.Q.value=q||1; s.connect(f); f.connect(g); s.start(now); s.stop(now+dur); return s; };
    switch(name){
      case "shot": env(0.002,0.35,0.9); nz(0.35,1400,0.6,"lowpass"); osc("square",160,40,0.12); break;
      case "shotgun": env(0.002,0.6,1); nz(0.6,900,0.5,"lowpass"); osc("square",120,30,0.2); break;
      case "silenced": env(0.002,0.12,0.4); nz(0.12,2600,1.5); break;
      case "slash": case "swing": env(0.01,0.22,0.35); nz(0.22,name==="slash"?3200:1600,2); break;
      case "hit": env(0.002,0.18,0.6); nz(0.12,500,1); osc("sine",120,60,0.15); break;
      case "hurt": env(0.005,0.3,0.5); osc("sawtooth",220,110,0.28); break;
      case "death": env(0.01,0.8,0.4); osc("sawtooth",180,50,0.8); break;
      case "spell": env(0.01,0.5,0.35); osc("sine",880,1760,0.25); osc("triangle",440,1320,0.45); break;
      case "pickup": env(0.005,0.35,0.3); osc("sine",660,0,0.1); (function(){ var o=ac.createOscillator(); o.frequency.value=990; o.connect(g); o.start(now+0.09); o.stop(now+0.3); })(); break;
      case "chime": env(0.01,0.9,0.25); osc("sine",784,0,0.9); osc("sine",1175,0,0.9); break;
      case "door": env(0.05,0.9,0.3); osc("sawtooth",90,140,0.8); nz(0.8,300,4); break;
      case "locked": env(0.002,0.15,0.4); nz(0.1,1800,6); osc("square",300,280,0.08); break;
      case "step": env(0.002,0.09,0.12*(A.player&&A.player.char.wantCrouch?0.4:1)); nz(0.08,A.cfg.genre==="horror"?380:600,1.5); break;
      case "groan": env(0.2,1.4,0.35); osc("sawtooth",95+Math.random()*30,70,1.3); nz(1.3,400,3); break;
      case "growl": env(0.05,0.9,0.4); osc("sawtooth",70,55,0.9); nz(0.9,250,2); break;
      case "wail": env(0.3,1.6,0.25); osc("sine",620,380,1.5); osc("sine",631,390,1.5); break;
      case "guard": case "alert": env(0.01,0.35,0.35); osc("square",880,0,0.12); (function(){ var o=ac.createOscillator(); o.type="square"; o.frequency.value=660; o.connect(g); o.start(now+0.15); o.stop(now+0.3); })(); break;
      case "beep": env(0.01,0.2,0.2); osc("square",1200,900,0.15); break;
      case "heartbeat": env(0.01,0.25,0.5); osc("sine",55,40,0.15); (function(){ var o=ac.createOscillator(); o.frequency.value=48; var g2=ac.createGain(); g2.gain.setValueAtTime(0.0001,now+0.22); g2.gain.exponentialRampToValueAtTime(0.4,now+0.24); g2.gain.exponentialRampToValueAtTime(0.0001,now+0.42); o.connect(g2); g2.connect(A._out); o.start(now+0.2); o.stop(now+0.45); })(); break;
      case "scare": env(0.005,1.2,0.6); osc("sawtooth",400,1200,0.4); nz(1.1,2000,0.7); break;
      case "reload": env(0.002,0.4,0.3); nz(0.05,2500,4); (function(){ var s=ac.createBufferSource(); s.buffer=A._nb; s.connect(g); s.start(now+0.3); s.stop(now+0.36); })(); break;
      case "empty": env(0.002,0.06,0.3); nz(0.05,3000,8); break;
      case "break": env(0.002,0.6,0.6); nz(0.6,700,0.8); break;
      case "tick": env(0.002,0.05,0.2); osc("square",1500,0,0.03); break;
      default: env(0.01,0.2,0.2); osc("sine",440,0,0.2); }
  }catch(e){} };
  A.music=function(o){ A._audioWake(); try{ if(A._music) A._music.set(typeof o==="string"?(LOOKS[o]||LOOKS.action).music:o); }catch(e){} return A; };

  // ════════════════════════════════════════════════════════════════════════
  //  CHAPTERS AND SAVES. A long game is a story plan plus chapters. Chapter 1
  //  arrives with the game; while it is being played, the next one is being
  //  written in the background through the bridge (Spine.chapter). Health,
  //  weapons, the backpack, choices and flags carry across.
  // ════════════════════════════════════════════════════════════════════════
  A.plan=window.__advPlan||null;
  A.setup=function(o){ A._gameOn(); o=o||{}; A.cfg.title=o.title||A.cfg.title||(A.plan&&A.plan.title)||document.title||"Adventure";
    if(o.chapter) A.state.chapter=o.chapter; A.cfg.chapterTitle=o.chapterTitle||o.subtitle||A._chapterTitle(A.state.chapter);
    if(o.difficulty) A.cfg.difficulty=o.difficulty; if(o.view) A.cfg.view=o.view; if(o.spawn) A._spawn=o.spawn; if(o.noFloor) A._noFloor=true; if(o.floorY!=null) A._floorY=o.floorY;
    A.look(o.genre||o.look||(A.plan&&A.plan.genre)||"action"); if(o.quality) A.quality(o.quality);
    if(o.music===false) A.cfg.music=false;
    try{ document.title=A.cfg.title; }catch(e){}
    if(!o.noTitle) setTimeout(function(){ A.title(A.cfg.chapterTitle||A.cfg.title,"Chapter "+A.state.chapter+" · "+A.cfg.title); },400);
    A._prefetch(); return A; };
  A._chapterTitle=function(n){ try{ var c=A.plan&&A.plan.chapters&&A.plan.chapters[n-1]; return c?(c.title||""):""; }catch(e){ return ""; } };
  A._summary=function(){ return { chapter:A.state.chapter, health:Math.round(A.state.health), inventory:A.state.inventory.map(function(i){ return i.name; }), weapons:(A.player?A.player.weapons:[]),
      flags:Object.keys(A.state.flags).filter(function(k){ return !/^(dead|got|open|gave):/.test(k); }).slice(0,30), kills:A.state.kills, secrets:A.state.secrets, choices:A.state.choices.slice(-10), story:A.state.story }; };
  A._prefetch=function(){ var n=A.state.chapter+1; var total=A.plan&&A.plan.chapters?A.plan.chapters.length:0; if(total&&n>total) return;
    if(A._next&&A._next.n===n) return; A._next={n:n,code:null,pending:true};
    try{ if(!window.Spine||!window.Spine.chapter){ A._next.pending=false; return; }
      window.Spine.chapter(n,A.plan,A._summary()).then(function(r){ if(!A._next||A._next.n!==n) return; A._next.pending=false; A._next.code=r&&(r.code||r.text)||null; A._next.error=r&&r.reason||null; }).catch(function(){ if(A._next) A._next.pending=false; }); }catch(e){ A._next.pending=false; } };
  A.finishChapter=function(text){ if(A._finishing) return; A._finishing=true; A._emit("chapter",{done:A.state.chapter}); A.sfx("chime"); A._autosave(true);
    var total=A.plan&&A.plan.chapters?A.plan.chapters.length:0; var last=total&&A.state.chapter>=total;
    var mins=Math.round(A.state.playSeconds/60);
    var p=A._panel("<p style='margin:0;font:700 9px Manrope;letter-spacing:.2em;color:#7ed4a8;text-transform:uppercase'>"+(last?"The end":"Chapter "+A.state.chapter+" complete")+"</p><h3>"+esc(last?(A.plan&&A.plan.ending)||A.cfg.title:(A.cfg.chapterTitle||A.cfg.title))+"</h3>"
      +"<p>"+esc(text||(last?"You finished the story.":"The story goes on."))+"\n\n"+A.state.kills+" defeated · "+A.state.secrets+" secrets · "+mins+" min played</p><div class='row' id='advNextRow'></div>");
    var row=p.querySelector("#advNextRow");
    var render=function(){ if(last){ row.innerHTML="<button class='pri' data-a>Play again from chapter 1</button>"; row.querySelector("[data-a]").onclick=function(){ A._wipeSave(); location.reload(); }; return; }
      var nx=A._next;
      if(nx&&nx.code){ row.innerHTML="<button class='pri' data-c>Continue to chapter "+(A.state.chapter+1)+"</button>"; row.querySelector("[data-c]").onclick=function(){ p.close(); A._finishing=false; A.loadChapter(nx.n,nx.code); }; }
      else if(nx&&nx.pending){ row.innerHTML="<button disabled>Writing chapter "+(A.state.chapter+1)+"...</button>"; setTimeout(render,1200); }
      else { row.innerHTML="<button class='pri' data-r>Write the next chapter</button><button data-s>Save and stop here</button>"+(nx&&nx.error?"<p style='flex-basis:100%;margin:6px 0 0;color:#e8a0a0'>"+esc(nx.error)+"</p>":"");
        row.querySelector("[data-r]").onclick=function(){ A._next=null; A._prefetch(); render(); }; row.querySelector("[data-s]").onclick=function(){ A._autosave(true); A.toast("Saved. Open the game again to continue."); }; } };
    render(); };
  // swap in a new chapter without reloading: clear the stage, keep the hero's state
  A.loadChapter=function(n,code){
    var Wd=W(), t=T(); A.state.chapter=n; A.state.story=(A.state.story+" ").slice(-1500);
    var keep=[]; try{ Wd.scene.children.slice().forEach(function(o){ Wd.scene.remove(o); o.traverse&&o.traverse(function(m){ try{ if(m.geometry) m.geometry.dispose(); }catch(e){} }); }); }catch(e){}
    Wd.scene.fog=null; Wd.scene.background=null; Wd.scene.environment=null; Wd._frames=[A._frame]; Wd.clearButtons&&Wd.clearButtons(); Wd.clearLabels&&Wd.clearLabels();
    A._solids=[]; A._grid={}; A._gridDirty=true; A._ramps=[]; A._grounds=[]; A._lamps=[]; A.enemies=[]; A.items=[]; A.usables=[]; A._zones=[]; A.npcs=[]; A._bolts=[]; A._breakables=[]; A._quests=[]; A._obj=null; A._wp=null; A._boss=null; A._parts=null; A._amb=null; A._heroLight=null; A._doorAnims=[]; A._nav=null; A._navDirty=true; A._next=null; A._noFloor=false; A._floorY=0;
    A._carried=true; var keepW=A.player?A.player.weapons.slice():[]; A.state.weaponNames=keepW; A.player=null;
    try{ new Function("SpineWorld","THREE","Adventure",String(code))(Wd,t,A); }catch(e){ A._chapterFailed(n,e); return; }
    if(!A.player) A.playerSetup({});
    try{ Wd._frameScene=function(){}; }catch(e){}
    try{ Wd._fitShadows&&Wd._fitShadows(); }catch(e){}
    A._autosave(true); A._hudDirty=true;
  };
  A._chapterFailed=function(n,e){ var p=A._panel("<h3>Chapter "+n+" did not load</h3><p>"+esc(String(e&&e.message||e).slice(0,200))+"</p><div class='row'><button class='pri' data-r>Write it again</button></div>");
    p.querySelector("[data-r]").onclick=function(){ p.close(); A.state.chapter=n-1; A._next=null; try{ window.Spine&&window.Spine.chapter&&window.Spine.chapter(n,A.plan,Object.assign(A._summary(),{rewrite:true})).then(function(r){ if(r&&r.code) A.loadChapter(n,r.code); }); }catch(x){} }; };
  A._saveKey=function(){ return "adv:"+String((A.plan&&A.plan.title)||A.cfg.title||"game").slice(0,60); };
  A._autosave=function(force){ try{ if(!window.Spine||!window.Spine.save) return; var now=Date.now(); if(!force&&A._lastSave&&now-A._lastSave<15000) return; A._lastSave=now;
      var s=JSON.parse(JSON.stringify(A.state)); s.at=now; s.pos=A.player?[A.player.pos.x,A.player.pos.y,A.player.pos.z]:null; s.cfg={difficulty:A.cfg.difficulty,view:A.cfg.view,voices:A.cfg.voices,quality:A.cfg.quality};
      window.Spine.save(A._saveKey(),s); }catch(e){} };
  A._wipeSave=function(){ try{ window.Spine&&window.Spine.save&&window.Spine.save(A._saveKey(),null); }catch(e){} };
  // On start: if there is a save from a later chapter, offer to carry on from it
  A._offerContinue=function(){ try{ if(!window.Spine||!window.Spine.load||A._offered) return; A._offered=true;
      window.Spine.load(A._saveKey()).then(function(s){ if(!s||!s.chapter) return; if(s.cfg){ for(var k in s.cfg) if(s.cfg[k]) A.cfg[k]=s.cfg[k]; }
        if(s.chapter<=A.state.chapter){ ["inventory","flags","ammo","notes","kills","secrets","deaths","playSeconds","mana","choices","story"].forEach(function(k){ if(s[k]!=null) A.state[k]=s[k]; }); if(s.weaponNames&&A.player) s.weaponNames.forEach(function(w){ A.giveWeapon(w,true); }); A._hudDirty=true; return; }
        var p=A._panel("<h3>Welcome back</h3><p>You reached chapter "+s.chapter+(A._chapterTitle(s.chapter)?" - "+esc(A._chapterTitle(s.chapter)):"")+".</p><div class='row'><button class='pri' data-c>Continue chapter "+s.chapter+"</button><button data-n>Start over</button></div>");
        p.querySelector("[data-n]").onclick=function(){ A._wipeSave(); p.close(); };
        p.querySelector("[data-c]").onclick=function(){ var b=p.querySelector("[data-c]"); b.disabled=true; b.textContent="Opening chapter "+s.chapter+"...";
          window.Spine.chapter(s.chapter,A.plan,Object.assign(A._summary(),{resume:true})).then(function(r){ if(!r||!r.code){ b.disabled=false; b.textContent="Could not open it. Try again"; return; } p.close();
            ["inventory","flags","ammo","notes","kills","secrets","deaths","playSeconds","mana","choices","story","health","maxHealth","weaponNames"].forEach(function(k){ if(s[k]!=null) A.state[k]=s[k]; }); A.loadChapter(s.chapter,r.code); }); }; }).catch(function(){}); }catch(e){} };
  A.choose=function(question,options){ return new Promise(function(res){ var p=A._panel("<h3>"+esc(question)+"</h3><div class='row' style='flex-direction:column'>"+options.map(function(o,i){ return "<button data-i='"+i+"'>"+esc(o)+"</button>"; }).join("")+"</div>");
    p.querySelectorAll("[data-i]").forEach(function(b){ b.onclick=function(){ var o=options[+b.getAttribute("data-i")]; A.state.choices.push(question+" -> "+o); p.close(); res(o); }; }); }); };
  A.remember=function(line){ A.state.story=(A.state.story+" "+String(line)).slice(-1500); };

  // ════════════════════════════════════════════════════════════════════════
  //  THE LOOP
  // ════════════════════════════════════════════════════════════════════════
  A._frame=function(t,dt){
    try{
      dt=Math.min(dt||0.016,0.05); if(A._ui&&!A._cut){ A._updateLamps(0,t); return; }
      if(A._hitStop>0){ A._hitStop-=dt; dt*=0.05; }
      A.state.playSeconds+=dt;
      if(A._navDirty&&A.player&&!A._navBuilding){ A._navBuilding=true; setTimeout(function(){ try{ A._buildNav(); }catch(e){} A._navBuilding=false; },30); }
      A._updatePlayer(dt); A._updateEnemies(dt,t); A._updateBolts(dt); A._updateParts(dt); A._updateLamps(dt,t); A._updateCamera(dt); A._updateMarker();
      for(var i=0;i<A.items.length;i++){ var it=A.items[i]; it.mesh.rotation.y+=dt*1.6; it.mesh.position.y=it.baseY+Math.sin(t*2.2+i)*0.06; }
      if(A._doorAnims) for(var d=A._doorAnims.length-1;d>=0;d--){ var D=A._doorAnims[d]; D.openT=Math.min(1,D.openT+dt*1.4); D.hinge.rotation.y=-1.75*(1-Math.pow(1-D.openT,3)); if(D.openT>=1) A._doorAnims.splice(d,1); }
      // stealth meter: how close anyone is to spotting you
      var eye=document.getElementById("advEye"); if(eye){ var mx=0; for(var e=0;e<A.enemies.length;e++){ var en=A.enemies[e]; if(!en.dead&&en.state!=="chase"&&en.state!=="hidden") mx=Math.max(mx,en.alert); } eye.style.display=mx>0.05?"block":"none"; document.getElementById("advEyeBar").style.width=(mx*100)+"%"; }
      // music follows the danger
      if(A._music&&(!A._musT||t-A._musT>1)){ A._musT=t; var chasing=A.enemies.some(function(x){ return !x.dead&&x.state==="chase"; }); var L=(A._lookCfg||{}).music||{}; try{ A._music.set({tension:chasing?Math.min(1,(L.tension||0.4)+0.35):(L.tension||0.4),energy:chasing?Math.min(1,(L.energy||0.4)+0.35):(L.energy||0.4)}); }catch(x){} }
      if(A._hudDirty||(!A._hudT||t-A._hudT>0.5)){ A._hudT=t; A._hud(); }
      if(!A._saveT||t-A._saveT>30){ A._saveT=t; A._autosave(); }
      if(A._onUpdate) for(var u=0;u<A._onUpdate.length;u++){ try{ A._onUpdate[u](dt,t); }catch(x){} }
    }catch(err){ if(!A._loopErr){ A._loopErr=true; try{ console.error(err); }catch(x){} } }
  };
  A.onUpdate=function(fn){ (A._onUpdate=A._onUpdate||[]).push(fn); return A; };
  A.hitStop=function(ms){ A._hitStop=(ms||80)/1000; };
  A._ensure=function(){
    if(A._ready) return; var Wd=W(); if(!Wd||!Wd.scene) throw new Error("The 3D engine is not running yet");
    A._ready=true; A._buildUI(); if(!A.cfg.quality) A.quality();
    Wd.onFrame(A._frame); try{ Wd.renderer.shadowMap.enabled=true; }catch(e){}
  };
  // A GAME takes the camera and spawns a hero. A WORLD that only borrows people, doors and quests
  // stays a world: you still look and walk the usual way, and USE appears beside things.
  A._gameOn=function(){ if(A._game) return; A._ensure(); A._game=true; var Wd=W(); Wd._camLocked=true; Wd._noFrame=true; Wd._frameScene=function(){};
    try{ document.body.classList.add("adv-game"); var u=document.getElementById("advUI"); if(u) u.classList.remove("visitor"); }catch(e){}
    try{ Wd.camera.near=0.05; Wd.camera.far=A._q.far*2; Wd.camera.fov=68; Wd.camera.updateProjectionMatrix(); }catch(e){}
    setTimeout(function(){ if(!A.player) A.playerSetup({}); A._offerContinue(); A._audioWake(); },60); };
  // test hooks (used by the automated checks; harmless otherwise)
  A._debug={ step:function(n,dt){ dt=dt||0.05; for(var i=0;i<n;i++){ A._dbgT=(A._dbgT||performance.now()/1000)+dt; A._frame(A._dbgT,dt); } return A._debug.state(); }, teleport:function(x,z){ if(A.player){ A.player.pos.set(x,A.groundAt(x,z,50),z); } }, killAll:function(){ A.enemies.forEach(function(e){ if(!e.dead) A._killEnemy(e); }); }, state:function(){ return { hp:A.state.health, ch:A.state.chapter, pos:A.player?[+A.player.pos.x.toFixed(2),+A.player.pos.y.toFixed(2),+A.player.pos.z.toFixed(2)]:null, enemies:A.enemies.map(function(e){ return {id:e.id,state:e.state,hp:Math.round(e.health),dead:e.dead,pos:[+e.pos.x.toFixed(2),+e.pos.z.toFixed(2)]}; }), inv:A.state.inventory.map(function(i){ return i.name; }), solids:A._solids.length, quest:A._obj&&A._obj.steps.map(function(s){ return (s.done?"x ":"o ")+s.text; }) }; } };
})();

// ============================================================================
//  BATCH 12 - feel. Real animated characters and recorded sounds from free
//  packs, comfort settings, a first-time tutorial, chapter art with
//  "Previously on...", an automatic play-test, two players, and any world
//  turned into a game in one tap.
// ============================================================================
(function(){
  var A=window.Adventure; if(!A||A._plus) return; A._plus=true;
  var W=function(){ return window.SpineWorld; }, T=function(){ return window.THREE; };
  var clamp=A._clamp, damp=A._damp, angDiff=A._angDiff;
  var $=function(id){ return document.getElementById(id); };
  var esc=function(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); };
  var testing=function(){ return !!window.__advPlaytest; };

  // ════════════════════════════════════════════════════════════════════════
  //  1. REAL CHARACTERS. KayKit (CC0): nine rigged characters sharing one
  //  skeleton and 29 animations, delivered through the bridge from the site.
  //  The coded body shows at once; the real one takes over when it arrives.
  // ════════════════════════════════════════════════════════════════════════
  A.loadPack=function(){
    if(A._packP) return A._packP;
    A._packP=new Promise(function(res){
      var S=window.Spine; if(testing()||!S||!S.pack||!S.engine){ res(null); return; }
      Promise.all([S.engine("models"),S.engine("ar")]).then(function(){
        if(!T().__spineRealAddons||!T().SkeletonUtils) return null; return S.pack("characters"); })
      .then(function(r){ if(!r||!r.buffer){ res(null); return; }
        try{ new (T().GLTFLoader)().parse(r.buffer,"",function(g){ var sc={}; (g.scenes||[]).forEach(function(s){ sc[s.name]=s; }); var cl={}; (g.animations||[]).forEach(function(c){ cl[c.name]=c; });
          A._pack={scenes:sc,clips:cl}; res(A._pack); },function(){ res(null); }); }catch(e){ res(null); } })
      .catch(function(){ res(null); });
    });
    return A._packP;
  };
  // which packed character suits this description, or null to keep the coded one (modern clothes)
  A._packFor=function(o){
    var k=o.kind||"hero", d=String(o.look||"").toLowerCase(), g=A.cfg.genre, w=String(o.weapon||"").toLowerCase();
    if(o.model&&/^pack:/.test(o.model)) return o.model.slice(5);
    if(o.pack===false||(o.model&&!/^pack:/.test(o.model))) return null;
    var fantasy=g==="fantasy"||g==="magic";
    if(/skelet|undead|bones|lich/.test(d)||((k==="zombie"||k==="brute")&&fantasy)) return /archer|rogue|bow/.test(d)?"skeleton_rogue":(/mage|caster|lich/.test(d)?"skeleton_mage":(/warrior|armou?r|brute|giant/.test(d)||k==="brute"?"skeleton_warrior":"skeleton_minion"));
    if(k==="mage"&&fantasy) return "mage";
    if(k==="zombie"||k==="wraith"||k==="robot"||k==="beast") return null;
    var isFantasyLook=/knight|wizard|witch|mage|sorcer|rogue|barbarian|warrior|archer|elf|dwarf|paladin|ranger|thief|viking|adventurer/.test(d);
    if(!fantasy&&!isFantasyLook) return null;
    if(/wizard|witch|mage|sorcer/.test(d)||/wand|staff/.test(w)) return "mage";
    if(/hood|thief|assassin|ranger/.test(d)) return "rogue_hooded";
    if(/rogue|archer|elf/.test(d)||/knife|dagger/.test(w)) return "rogue";
    if(/barbarian|viking|dwarf/.test(d)||/axe/.test(w)) return "barbarian";
    return "knight";
  };
  var WEAPON_NODE=/sword|shield|axe|staff|wand|dagger|knife|crossbow|bow|quiver|spellbook|mug|smoke|throwable|arrow|blade/i;
  A._usePack=function(C,name){
    A.loadPack().then(function(P){
      try{ if(!P||!P.scenes[name]||C._packed) return; var t=T();
        var m=t.SkeletonUtils.clone(P.scenes[name]); m.traverse(function(x){ if(x.isMesh){ x.castShadow=true; x.frustumCulled=false; } });
        var b=new t.Box3().setFromObject(m), h=(b.max.y-b.min.y)||1; var target=(C.kind==="brute"?2.4:1.78)*(C.scale||1);
        m.scale.setScalar(target/h); m.position.y=-b.min.y*m.scale.y; m.rotation.y=Math.PI;          // KayKit faces +z; the engine faces -z
        C.weaponNodes=[]; m.traverse(function(x){ if(x!==m&&WEAPON_NODE.test(x.name||"")&&!x.isBone){ C.weaponNodes.push(x); x.visible=false; } });
        m.traverse(function(x){ if(/^handslot\.r$/i.test(x.name||"")) C.handR=x; if(/^handslot\.l$/i.test(x.name||"")) C.handL=x; });
        C.body.visible=false; C.root.add(m); C.model=m; C._packed=name; C.mixer=new t.AnimationMixer(m); C.packClips=P.clips; C.cur=null; C.acts={};
        if(C.heldKind) A._packHold(C,C.heldKind);
      }catch(e){}
    });
  };
  // weapons: the character's own sword or staff when it has one, otherwise ours in its hand
  A._packHold=function(C,item){
    var it=String(item||"").toLowerCase(); (C.weaponNodes||[]).forEach(function(n){ n.visible=false; }); if(C._packHeld){ try{ C._packHeld.parent.remove(C._packHeld); }catch(e){} C._packHeld=null; }
    if(!it||it==="fists"||it==="none") return;
    var want=/sword|blade|katana|machete/.test(it)?/^1H_Sword$|sword/i:/axe/.test(it)?/axe/i:/staff/.test(it)?/staff/i:/wand/.test(it)?/wand/i:/knife|dagger/.test(it)?/dagger|knife/i:/bow|crossbow/.test(it)?/crossbow|bow/i:null;
    var found=want&&(C.weaponNodes||[]).filter(function(n){ return want.test(n.name); })[0];
    if(found){ found.visible=true; var p=found.parent; while(p&&p!==C.model){ p.visible=true; p=p.parent; } return; }
    if(!C.handR) return;
    var tmp=A.makeCharacter({kind:"hero",pack:false}); A._hold(tmp,it); if(!tmp.held) return;
    var g=tmp.held; g.parent.remove(g); var inv=1/((C.model&&C.model.scale.x)||1); g.scale.setScalar(inv*0.95); g.rotation.set(-Math.PI/2,0,0); C.handR.add(g); C._packHeld=g;
  };
  var _hold=A._hold; A._hold=function(C,item){ _hold(C,item); if(C&&C.model&&C._packed){ C.heldKind=String(item||"").toLowerCase(); A._packHold(C,item); } };
  var _make=A.makeCharacter; A.makeCharacter=function(o){ var C=_make(o); try{ var nm=(o&&!o.model)||(o&&/^pack:/.test(o.model||""))?A._packFor(o||{}):null; if(nm) A._usePack(C,nm); }catch(e){} return C; };
  // animation: loops for standing, walking and running; one-shots for every action, then back
  var ONE={swing:null,shoot:null,cast:["Spellcast_Shoot"],hit:["Hit_A"],roll:["Dodge_Forward"],grab:["PickUp","Interact"],cheer:["Cheer"],awaken:["Awaken"],die:["Death_A"]};
  function clipFor(C,act){
    var w=C.heldKind||"";
    if(act==="swing") return /axe|hammer|club/.test(w)?["2H_Melee_Attack_Chop"]:(/sword|knife|dagger|pipe|blade|crowbar/.test(w)?["1H_Melee_Attack_Slice_Diagonal","1H_Melee_Attack_Stab"]:["Unarmed_Melee_Attack_Punch_A","1H_Melee_Attack_Stab"]);
    if(act==="shoot") return /rifle|shotgun|crossbow|staff/.test(w)?["2H_Ranged_Shoot","1H_Ranged_Shoot"]:(/wand/.test(w)?["Spellcast_Shoot"]:["1H_Ranged_Shoot"]);
    return ONE[act]||null;
  }
  function action(C,names,loop){ if(!names) return null; for(var i=0;i<names.length;i++){ var n=names[i]; if(C.acts[n]) return C.acts[n]; var cl=C.packClips[n]; if(cl){ var a=C.mixer.clipAction(cl); if(!loop){ a.setLoop(T().LoopOnce,1); a.clampWhenFinished=true; } C.acts[n]=a; return a; } } return null; }
  var _animModel=A._animateModel;
  A._animateModel=function(C,dt,speed,run){
    if(!C._packed) return _animModel(C,dt,speed,run);
    var base=C.dead?"die":(speed>3.2?"run":speed>0.25?"walk":(C.aiming?"combat":"idle"));
    var names={idle:["Idle","Unarmed_Idle"],combat:["Idle_Combat","Idle"],walk:["Walking_A"],run:["Running_A"],die:["Death_A"]}[base];
    if(C.act&&C.act!==C._lastAct&&!C.dead){ var oa=action(C,clipFor(C,C.act),false); if(oa){ oa.reset(); oa.timeScale=C.act==="hit"?1.4:1.15; oa.fadeIn(0.08).play(); if(C._curA&&C._curA!==oa) C._curA.fadeOut(0.08); C._oneA=oa; } C._lastAct=C.act; }
    if(C.act){ C.actT+=dt; if(C.actT>=C.actDur){ C.act=null; } }
    if(!C.act){ C._lastAct=null; }
    var busy=C._oneA&&C._oneA.isRunning()&&C._oneA.time<C._oneA.getClip().duration*0.92;
    if(!busy){ var a=action(C,names,base!=="die"); if(a&&a!==C._curA){ a.reset(); a.fadeIn(0.2).play(); if(C._curA) C._curA.fadeOut(0.2); if(C._oneA&&C._oneA!==a) C._oneA.fadeOut(0.15); C._oneA=null; C._curA=a; }
      if(a&&base==="walk") a.timeScale=clamp(speed/1.9,0.6,1.6); if(a&&base==="run") a.timeScale=clamp(speed/5.2,0.8,1.4); }
    C.mixer.update(dt);
  };
  // people you can talk to breathe, shift and stand naturally instead of freezing in place
  A.onUpdate(function(dt){ for(var i=0;i<A.npcs.length;i++){ try{ A.npcs[i].char.animate(dt,0,false); }catch(e){} } });
  // in a world: people standing, sitting or cheering, no conversation needed
  A.person=function(o){ A._ensure(); o=o||{}; var t=T(); var at=o.at||[0,0]; var C=A.makeCharacter({look:o.look||"",kind:o.kind||"villager",colors:o.colors,weapon:o.holding||null});
    C.root.position.set(at[0],A.groundAt(at[0],at[1],50),at[1]); C.root.rotation.y=(o.face||0)*Math.PI/180; W().scene.add(C.root);
    var mood=String(o.anim||"idle").toLowerCase(); A.onUpdate(function(dt){ if(C._packed&&mood!=="idle"&&mood!=="walk"){ var a=action(C,mood==="sit"?["Sit_Chair_Idle"]:mood==="cheer"?["Cheer"]:["Idle"],true); if(a&&a!==C._curA){ a.reset().play(); if(C._curA) C._curA.stop(); C._curA=a; } C.mixer.update(dt); return; } C.animate(dt,0,false); });
    return C; };

  // ════════════════════════════════════════════════════════════════════════
  //  2. RECORDED SOUNDS (Kenney, CC0) for steps, landing, pickups, breaking,
  //  reloads and sci-fi weapons. Everything else keeps the synthesised set.
  // ════════════════════════════════════════════════════════════════════════
  var SPR={step:[0,0.32],land:[0.47,0.053],hit:[0.673,0.146],death:[0.969,1.0],pickup:[2.119,0.284],"break":[2.553,0.418],reload:[3.121,0.415],enemy_swing:[3.686,0.516],blaster:[4.352,0.6],blaster_fast:[5.102,0.438],jump:[5.689,0.434],fall:[6.273,0.139]};
  A.loadSounds=function(){ if(A._sndP) return A._sndP; var S=window.Spine; if(testing()||!S||!S.pack||!A._ac){ return Promise.resolve(null); }
    A._sndP=S.pack("sounds").then(function(r){ if(!r||!r.buffer) return null; return new Promise(function(res){ try{ A._ac.decodeAudioData(r.buffer.slice(0),function(b){ A._sprite=b; res(b); },function(){ res(null); }); }catch(e){ res(null); } }); }).catch(function(){ return null; });
    return A._sndP; };
  function spriteName(name,at){ var sci=A.cfg.genre==="scifi"; if(name==="step"||name==="pickup"||name==="break"||name==="reload") return name;
    if(sci&&name==="shot") return "blaster"; if(sci&&(name==="hit"||name==="death")) return name; if(at&&name==="swing"&&sci) return "enemy_swing"; return null; }
  var _sfx=A.sfx; A.sfx=function(name,at){
    var ac=A._ac, sp=A._sprite, k=sp&&spriteName(name,at), seg=k&&SPR[k];
    if(!ac||!seg) return _sfx(name,at);
    try{ var vol=1; if(at&&A.player){ var d=Math.hypot(at.x-A.player.pos.x,at.z-A.player.pos.z); vol=clamp(1-d/26,0,1); if(vol<=0.02) return; }
      if(name==="step"&&A.player&&A.player.char.wantCrouch) vol*=0.35;
      var src=ac.createBufferSource(); src.buffer=sp; src.playbackRate.value=name==="step"?(0.92+Math.random()*0.16):1; var g=ac.createGain(); g.gain.value=vol*(name==="step"?0.55:0.9); src.connect(g); g.connect(A._out);
      src.start(ac.currentTime,seg[0]+0.026,seg[1]); }catch(e){ _sfx(name,at); } };
  var _wake=A._audioWake; A._audioWake=function(){ _wake(); try{ if(A._ac&&!A._sndP) A.loadSounds(); }catch(e){} };

  // ════════════════════════════════════════════════════════════════════════
  //  5. COMFORT. Left-handed controls, one-thumb play, subtitle size, aim
  //  help and colour-blind friendly colours. Kept with the person's saves,
  //  so they follow them to their other devices.
  // ════════════════════════════════════════════════════════════════════════
  A.comfort={hand:"right",oneThumb:false,subs:"medium",aim:"normal",colourBlind:false,art:true};
  var CCSS=".adv-ui.lefty #advL{left:auto;right:0}.adv-ui.lefty #advR{right:auto;left:0}.adv-ui.lefty .adv-btns{right:auto;left:14px}.adv-ui.lefty #advAtk{right:auto;left:0}.adv-ui.lefty #advUse{right:auto;left:88px}.adv-ui.lefty #advDodge{right:auto;left:6px}.adv-ui.lefty #advCrouch{right:auto;left:72px}.adv-ui.lefty #advSwap{right:auto;left:118px}.adv-ui.lefty .adv-wpn{right:auto;left:16px;text-align:left}"
    +".adv-ui.subs-small .adv-sub{font-size:12px}.adv-ui.subs-large .adv-sub{font-size:19px}.adv-ui.subs-large .adv-dlg .say{font-size:17px}"
    +".adv-ui.cb .adv-bar>i{background:linear-gradient(90deg,#1f6fd1,#5fb0ff)!important}.adv-ui.cb .adv-hurt{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(230,140,0,.6))!important}.adv-ui.cb #advUse.hint{background:rgba(255,170,40,.6);border-color:#ffb030}"
    +".adv-tut{position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:4;pointer-events:auto;background:rgba(14,16,22,.9);border:1px solid #e8c98a;border-radius:12px;padding:9px 12px;font:600 12.5px Manrope,sans-serif;max-width:86%;text-align:center}.adv-tut small{display:block;font-weight:500;color:#a8b0bd;margin-top:3px}.adv-tut button{margin-top:6px;background:none;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;font:700 10px Manrope;padding:4px 9px}"
    +".adv-pulse{animation:advp 1s ease-in-out infinite}@keyframes advp{0%,100%{box-shadow:0 0 0 0 rgba(232,201,138,.0)}50%{box-shadow:0 0 0 8px rgba(232,201,138,.55)}}@media (prefers-reduced-motion:reduce){.adv-pulse{animation:none;box-shadow:0 0 0 3px #e8c98a}}"
    +".adv-prev{position:absolute;inset:0;z-index:5;pointer-events:auto;display:flex;align-items:flex-end;background:#05060a center/cover no-repeat}.adv-prev .in{width:100%;padding:22px 18px 26px;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.88) 35%)}.adv-prev b{font:700 9px Manrope;letter-spacing:.2em;color:#d8c9a8;text-transform:uppercase}.adv-prev p{font:400 14px/1.55 Manrope;margin:8px 0 12px;max-width:640px}.adv-prev button{background:#B8935A;color:#12100e;border:none;border-radius:10px;font:700 12px Manrope;padding:10px 16px}";
  function applyComfort(){ var u=$("advUI"); if(!u) return; var c=A.comfort; u.classList.toggle("lefty",c.hand==="left"); u.classList.toggle("cb",!!c.colourBlind); u.classList.remove("subs-small","subs-large"); if(c.subs!=="medium") u.classList.add("subs-"+c.subs); }
  A.setComfort=function(k,v){ A.comfort[k]=v; applyComfort(); try{ window.Spine&&window.Spine.save&&window.Spine.save("shared:adv:comfort",A.comfort); }catch(e){} return A.comfort; };
  var _build=A._buildUI; A._buildUI=function(){ _build(); var st=document.createElement("style"); st.textContent=CCSS; document.head.appendChild(st);
    try{ if(window.Spine&&window.Spine.load&&!testing()) window.Spine.load("shared:adv:comfort").then(function(c){ if(c&&typeof c==="object"){ for(var k in c) if(k in A.comfort) A.comfort[k]=c[k]; applyComfort(); } }).catch(function(){}); }catch(e){} applyComfort(); };
  // aim help follows the setting
  var _aim=A._aimTarget; A._aimTarget=function(range,arc){ var a=A.comfort.aim; var k=a==="off"?0.3:a==="strong"?1.8:1; return _aim(range,arc>=Math.PI?(a==="off"?0.0001:arc):arc*k); };
  // one-thumb: the hero attacks by itself when something is in reach in front
  A.onUpdate(function(dt){ var P=A.player; if(!P||!A.comfort.oneThumb||A._dead||A._ui||A._cut) return; var w=P.wInfo||{}; if(P.cd>0||P.reload>0) return;
    var r=w.kind==="melee"?(w.range||1.5)+0.5:Math.min(w.range||12,14); var t=_aim(r,0.8); if(t) A.attack(); });
  A.comfortMenu=function(){ var c=A.comfort; var row=function(k,label,opts){ return "<div class='row'><span style='flex-basis:100%;font:700 9px Manrope;letter-spacing:.12em;text-transform:uppercase;color:#a8b0bd'>"+label+"</span>"+opts.map(function(o){ return "<button data-k='"+k+"' data-v='"+o[0]+"' class='"+(String(c[k])===String(o[0])?"pri":"")+"'>"+o[1]+"</button>"; }).join("")+"</div>"; };
    var p=A._panel("<h3>Comfort</h3>"+row("hand","Controls",[["right","Right-handed"],["left","Left-handed"]])+row("oneThumb","One-thumb play (attacks by itself)",[["false","Off"],["true","On"]])+row("aim","Aim help",[["off","Off"],["normal","Normal"],["strong","Strong"]])
      +row("subs","Subtitles",[["small","Small"],["medium","Medium"],["large","Large"]])+row("colourBlind","Colour-blind friendly",[["false","Off"],["true","On"]])+row("art","Chapter art (uses image allowance)",[["true","On"],["false","Off"]])+"<div class='row'><button class='pri' data-x>Done</button></div>");
    p.querySelectorAll("[data-k]").forEach(function(b){ b.onclick=function(){ var k=b.getAttribute("data-k"), v=b.getAttribute("data-v"); A.setComfort(k,v==="true"?true:v==="false"?false:v); p.close(); A.comfortMenu(); }; });
    p.querySelector("[data-x]").onclick=function(){ p.close(); }; return p; };
  var _pause=A.pause; A.pause=function(){ _pause(); var L=$("advLayer"); var card=L&&L.querySelector(".adv-panel:last-child .adv-card"); if(!card) return;
    var r=document.createElement("div"); r.className="row"; r.innerHTML="<button data-cf>Comfort settings</button><button data-co>"+(A.coop.on?"Two players: on":"Play with a friend")+"</button>"; card.appendChild(r);
    r.querySelector("[data-cf]").onclick=function(){ L.querySelector(".adv-panel:last-child").close(); A.comfortMenu(); };
    r.querySelector("[data-co]").onclick=function(){ L.querySelector(".adv-panel:last-child").close(); A.coop.menu(); }; };

  // ════════════════════════════════════════════════════════════════════════
  //  6. FIRST-TIME TUTORIAL: five quick steps, each waits for the person to do it.
  // ════════════════════════════════════════════════════════════════════════
  A.tutorial=function(force){
    if(A._tut||testing()) return; var steps=[
      {t:"Drag on the left side to walk",s:"Push all the way to run",el:"advL",done:function(st){ return A.player&&A.player.pos.distanceTo(st.p)>1.2; }},
      {t:"Drag on the right side to look around",s:"Tap there to attack",el:"advR",done:function(st){ return Math.abs(angDiff(st.yaw,A._camYaw))>0.6; }},
      {t:"Tap "+(($("advAtk")||{}).textContent||"ATTACK")+" to attack",s:"Hold it with a rifle",el:"advAtk",done:function(st){ return A._tutAttacked; }},
      {t:"Tap SNEAK to crouch",s:"Quieter and harder to see. Attack someone who hasn't seen you for a takedown.",el:"advCrouch",done:function(){ return A.player&&A.player.char.wantCrouch; }},
      {t:"Walk up to things and tap USE",s:"Doors, people, notes and items. The marker shows where to go next.",el:"advUse",done:function(st){ return st.t>6; }}];
    var go=function(){ var box=document.createElement("div"); box.className="adv-tut"; ($("advUI")||document.body).appendChild(box); A._tut={i:0,box:box};
      var show=function(){ var s=steps[A._tut.i]; document.querySelectorAll(".adv-pulse").forEach(function(e){ e.classList.remove("adv-pulse"); }); if(!s){ box.innerHTML="You're ready."; setTimeout(function(){ box.remove(); },1600); A._tut.done=true; try{ window.Spine.save("shared:adv:tutorial",true); }catch(e){} if(A.player&&A.player.char.wantCrouch) A.crouch(false); return; }
        box.innerHTML=esc(s.t)+"<small>"+esc(s.s)+"</small><button data-sk>Skip the tutorial</button>"; box.querySelector("[data-sk]").onclick=function(){ A._tut.i=99; show(); };
        var el=$(s.el); if(el) el.classList.add("adv-pulse"); A._tut.st={p:A.player?A.player.pos.clone():new (T().Vector3)(),yaw:A._camYaw,t:0}; };
      A._tut.show=show; show(); };
    if(force){ go(); return; }
    try{ if(window.Spine&&window.Spine.load) window.Spine.load("shared:adv:tutorial").then(function(v){ if(!v) go(); }).catch(go); else go(); }catch(e){ go(); }
  };
  var _attack=A.attack; A.attack=function(){ A._tutAttacked=true; return _attack.apply(A,arguments); };
  A.onUpdate(function(dt){ var tu=A._tut; if(!tu||tu.done||!tu.st) return; tu.st.t+=dt; var s=[0,1,2,3,4][tu.i]; var list=tu.box&&tu.box.isConnected; if(!list) return;
    var stepsDone=[function(st){ return A.player&&A.player.pos.distanceTo(st.p)>1.2; },function(st){ return Math.abs(angDiff(st.yaw,A._camYaw))>0.6; },function(){ return A._tutAttacked; },function(){ return A.player&&A.player.char.wantCrouch; },function(st){ return st.t>6||!!A._usedOnce; }];
    if(tu.i<5&&stepsDone[tu.i](tu.st)){ tu.i++; A._tutAttacked=false; tu.show(); } });
  var _activate=A.activate; A.activate=A["use"]=function(){ A._usedOnce=true; return _activate.apply(A,arguments); };

  // ════════════════════════════════════════════════════════════════════════
  //  4. CHAPTER ART AND "PREVIOUSLY ON...". A cover is painted for the next
  //  chapter while this one is played; chapter 2 onwards opens with a recap.
  // ════════════════════════════════════════════════════════════════════════
  A.coverFor=function(n){ var S=window.Spine; if(testing()||!A.comfort.art||!S||!S.image||!A.plan||!A.plan.chapters) return Promise.resolve(null); var ch=A.plan.chapters[n-1]; if(!ch) return Promise.resolve(null);
    var prompt="Cinematic video game key art, no text, no logos, no letters: "+(A.plan.genre||"adventure")+" mood, "+(A.plan.setting||"")+". Chapter scene: "+(ch.place||"")+" - "+(ch.goal||"")+". Dramatic lighting, wide shot, painterly, original characters.";
    return S.image(prompt,{character:(A.plan.hero&&A.plan.hero.name)||undefined}).then(function(r){ var u=r&&(r.url||r.dataUrl||r); return typeof u==="string"?u:null; }).catch(function(){ return null; }); };
  var _prefetch=A._prefetch; A._prefetch=function(){ if(testing()||!A.plan||!A.plan.chapters) return; _prefetch(); var nx=A._next; if(nx&&!nx.coverAsked){ nx.coverAsked=true; A.coverFor(nx.n).then(function(u){ if(A._next===nx) nx.cover=u; }); } };
  A.previously=function(n,cover){
    if(testing()) return Promise.resolve(); var p=A.plan||{}, chs=p.chapters||[], prev=chs[n-2]||{};
    var lines=[]; if(prev.title) lines.push("Last time, in "+prev.title+": "+(prev.twist||prev.goal||"")+"."); var ch=A.state.choices.slice(-1)[0]; if(ch) lines.push("You chose: "+ch.split(" -> ").pop()+".");
    if(A.state.story) lines.push(A.state.story.slice(-220)); var cur=chs[n-1]||{}; lines.push("Now: "+(cur.title||("Chapter "+n))+(cur.goal?" - "+cur.goal:"")+".");
    var text=lines.join(" ").replace(/\s+/g," ").trim();
    return new Promise(function(done){ var u=$("advUI")||document.body; var d=document.createElement("div"); d.className="adv-prev"; if(cover) d.style.backgroundImage="url("+JSON.stringify(cover).slice(1,-1)+")";
      d.innerHTML="<div class='in'><b>Previously</b><p>"+esc(text)+"</p><button>Play chapter "+n+"</button></div>"; u.appendChild(d); A._ui=true;
      var fin=function(){ try{ speechSynthesis.cancel(); }catch(e){} d.remove(); if(!document.querySelector("#advLayer .adv-panel:not(.adv-titlecard),#advLayer .adv-dlg")) A._ui=null; done(); };
      d.querySelector("button").onclick=fin; A._speak(text,"Narrator"); }); };
  var _load=A.loadChapter; A.loadChapter=function(n,code){ var cover=A._next&&A._next.n===n?A._next.cover:null; A._zoneExit=[]; A._doors=[]; A._keypads=[]; A._tutAttacked=false; _load(n,code); if(n>=2) A.previously(n,cover); };
  var _finish=A.finishChapter; A.finishChapter=function(text){ _finish(text); var nx=A._next; var card=document.querySelector("#advLayer .adv-panel:last-child .adv-card"); if(!card||!nx) return;
    var put=function(){ if(nx.cover&&!card.querySelector("img.adv-cover")){ var im=document.createElement("img"); im.className="adv-cover"; im.src=nx.cover; im.alt="Chapter "+nx.n+" cover"; im.style.cssText="width:100%;border-radius:10px;margin:6px 0 2px;display:block"; card.insertBefore(im,card.querySelector("#advNextRow")); } };
    put(); var iv=setInterval(function(){ if(!card.isConnected){ clearInterval(iv); return; } put(); if(nx.cover) clearInterval(iv); },1000); };

  // ════════════════════════════════════════════════════════════════════════
  //  3. THE PLAY-TEST. A bot checks the level before anyone plays it: the
  //  hero is not in a wall, nobody is waiting at the spawn, every key is
  //  reachable before its door, a keypad's code is written somewhere, and
  //  the exit can be reached. The app fixes the chapter if it fails.
  // ════════════════════════════════════════════════════════════════════════
  A._zoneExit=[]; var _exit=A.exit; A.exit=function(o){ var z=_exit(o); if(z){ z.exit=true; z.needs=(o&&o.needs)||null; A._zoneExit.push(z); } return z; };
  var _door=A.door; A.door=function(o){ var D=_door(o); A._doors=A._doors||[]; A._doors.push(D); D.key=(o&&o.locked&&o.locked!==true)?String(o.locked):null; D.oneWay=o&&o.locked===true; D.toNext=!!(o&&o.to); return D; };
  var _keypad=A.keypad; A.keypad=function(o){ var u=_keypad(o); A._keypads=A._keypads||[]; A._keypads.push({code:String((o&&o.code)||""),at:(o&&o.at)||[0,0]}); return u; };
  function flood(fromX,fromZ){ A._buildNav(); var n=A._nav; if(!n) return null; var cx=Math.floor((fromX-n.x0)/n.cs), cz=Math.floor((fromZ-n.z0)/n.cs);
    var seen=new Uint8Array(n.nx*n.nz), q=[]; var start=-1; for(var r=0;r<6&&start<0;r++) for(var dz=-r;dz<=r&&start<0;dz++) for(var dx=-r;dx<=r;dx++){ var x=cx+dx, z=cz+dz; if(x>=0&&z>=0&&x<n.nx&&z<n.nz&&!n.cells[z*n.nx+x]){ start=z*n.nx+x; break; } }
    if(start<0) return {n:n,seen:seen}; seen[start]=1; q.push(start);
    while(q.length){ var c=q.pop(), x0=c%n.nx, z0=(c/n.nx)|0; for(var d=0;d<4;d++){ var x1=x0+[1,-1,0,0][d], z1=z0+[0,0,1,-1][d]; if(x1<0||z1<0||x1>=n.nx||z1>=n.nz) continue; var i=z1*n.nx+x1; if(seen[i]||n.cells[i]) continue; if(Math.abs(n.gy[i]-n.gy[c])>0.6) continue; seen[i]=1; q.push(i); } }
    return {n:n,seen:seen}; }
  function reach(F,x,z){ var n=F.n; var cx=Math.floor((x-n.x0)/n.cs), cz=Math.floor((z-n.z0)/n.cs); for(var r=0;r<5;r++) for(var dz=-r;dz<=r;dz++) for(var dx=-r;dx<=r;dx++){ var xx=cx+dx, zz=cz+dz; if(xx>=0&&zz>=0&&xx<n.nx&&zz<n.nz&&F.seen[zz*n.nx+xx]) return true; } return false; }
  A.playtest=function(){
    var P=A.player, problems=[], notes=[]; if(!P) return {ok:false,problems:["There is no hero - Adventure.playerSetup was never called."]};
    var c=A._collide(P.pos.x,P.pos.z,0.33,P.pos.y,1.75); if(Math.hypot(c[0]-P.pos.x,c[1]-P.pos.z)>0.08) problems.push("The hero starts inside a wall or prop at ["+P.pos.x.toFixed(1)+","+P.pos.z.toFixed(1)+"] - move playerSetup's 'at' into open floor.");
    A.enemies.forEach(function(e){ if(!e.dead&&e.state!=="hidden"&&Math.hypot(e.pos.x-P.pos.x,e.pos.z-P.pos.z)<4) problems.push("An enemy ("+(e.name||e.type.kind)+") is within 4 m of the start - give the player a moment."); });
    var doors=(A._doors||[]).filter(function(D){ return !D.open; }), have={}, saved=doors.map(function(D){ return D.solid.on; });
    var exits=A._zoneExit.slice(); (A._doors||[]).forEach(function(D){ if(D.toNext) exits.push({x:D.use.x,z:D.use.z,door:D}); });
    if(!exits.length) problems.push("There is no way to finish the chapter - add Adventure.exit({...}) or a door with to:'next'.");
    var guard=0, F=null, progress=true;
    while(progress&&guard++<12){ progress=false; F=flood(P.pos.x,P.pos.z); if(!F) break;
      A.items.forEach(function(it){ if(!have[it.name]&&reach(F,it.mesh.position.x,it.mesh.position.z)){ have[it.name]=true; progress=true; } });
      A.npcs.forEach(function(N){ if(!reach(F,N.pos.x,N.pos.z)) return; var gv=[]; if(N.gives) gv.push(typeof N.gives==="string"?N.gives:N.gives.name); (N.topics||[]).forEach(function(tp){ if(tp&&tp.gives) gv.push(tp.gives); }); gv.forEach(function(g){ if(g&&!have[g]){ have[g]=true; progress=true; } }); });
      A.enemies.forEach(function(e){ if(e.drops&&reach(F,e.pos.x,e.pos.z)) (Array.isArray(e.drops)?e.drops:[e.drops]).forEach(function(d){ var nm=typeof d==="string"?d:d&&d.name; if(nm&&!have[nm]){ have[nm]=true; progress=true; } }); });
      doors.forEach(function(D){ if(D.solid.on&&!D.oneWay&&(!D.key||have[D.key])&&reach(F,D.use.x,D.use.z)){ D.solid.on=false; A._gridDirty=true; A._navDirty=true; progress=true; } });
    }
    F=flood(P.pos.x,P.pos.z);
    var anyExit=exits.some(function(e){ return F&&reach(F,e.x,e.z)&&(!e.needs||have[e.needs]); });
    if(exits.length&&!anyExit){ var blockers=doors.filter(function(D){ return D.solid.on; }).map(function(D){ return D.key?("the door at ["+D.use.x.toFixed(1)+","+D.use.z.toFixed(1)+"] needs '"+D.key+"' but "+(have[D.key]?"it is reached too late":"no reachable item, person or enemy gives it")):(D.oneWay?"a one-way door":"a door"); });
      problems.push("The exit cannot be reached"+(blockers.length?": "+blockers.join("; "):" - a wall or prop blocks the way (leave doorways open, check room doors line up).")+"."); }
    A.items.forEach(function(it){ if(F&&!reach(F,it.mesh.position.x,it.mesh.position.z)) notes.push("'"+it.name+"' can never be reached."); });
    var written=[]; A.items.forEach(function(it){ if(it.text) written.push(it.text); }); A.npcs.forEach(function(N){ written.push(N.greet||""); (N.topics||[]).forEach(function(tp){ if(tp&&tp.answer) written.push(tp.answer); }); });
    (A._keypads||[]).forEach(function(k){ if(k.code&&written.join(" ").indexOf(k.code)<0) problems.push("The keypad code "+k.code+" is not written in any note or conversation, so nobody could know it."); });
    doors.forEach(function(D,i){ D.solid.on=saved[i]; }); A._gridDirty=true; A._navDirty=true;
    if(!A._obj) notes.push("No quest or objective is shown.");
    return {ok:problems.length===0,problems:problems,notes:notes};
  };
  var _gameOn=A._gameOn; A._gameOn=function(){ _gameOn(); if(testing()&&!A._ptScheduled){ A._ptScheduled=true; setTimeout(function(){ var r; try{ r=A.playtest(); }catch(e){ r={ok:false,problems:["The play-test crashed: "+(e&&e.message||e)]}; } try{ parent.postMessage({__spineAdvTest:true,report:r},"*"); }catch(e){} },700); }
    else if(!testing()&&!A._tutScheduled){ A._tutScheduled=true; setTimeout(function(){ if(A.state.chapter===1) A.tutorial(); },2600); } };

  // ════════════════════════════════════════════════════════════════════════
  //  10. TWO PLAYERS. One phone hosts (its enemies are the real ones); the
  //  friend joins with a four-letter code and sees the same fight.
  // ════════════════════════════════════════════════════════════════════════
  A.coop={on:false,role:null,code:null,room:null,remote:null,sendT:0,menu:null};
  A.coop.start=function(role,code,roomImpl){
    var S=window.Spine; var R=roomImpl||(S&&S.room?S.room("adv:"+code):null); if(!R) return false;
    A.coop.on=true; A.coop.role=role; A.coop.code=code; A.coop.room=R; A._guest=role==="guest";
    // live voice (batch 14): the two players can talk, phone to phone, through the same room
    var Wv=W(); A.coop.vc=Wv&&Wv.voiceChat?Wv.voiceChat(R,role,function(){ A.coop._talkUi(); }):null;
    R.on(function(m){ try{ A.coop._in(m); }catch(e){} }); Promise.resolve(R.ready).then(function(){ R.send({t:"hello",role:role}); if(A.coop.vc&&A.coop.vc.listen) A.coop.vc.listen(); }); A.toast(role==="host"?"Hosting - code "+code:"Joined "+code); A.coop._talkUi(); return true; };
  A.coop._talkUi=function(){ var b=document.getElementById("advTalk"); if(!A.coop.on||!A.coop.vc){ if(b) b.remove(); return; }
    if(!b){ b=document.createElement("button"); b.id="advTalk"; b.style.cssText="position:fixed;left:10px;top:calc(56px + env(safe-area-inset-top));z-index:60;min-height:36px;border-radius:999px;border:1px solid rgba(255,255,255,.35);font:700 12px Manrope,sans-serif;padding:0 12px";
      b.onclick=function(e){ e.stopPropagation(); var v=A.coop.vc; if(v.on) v.stop(); else v.start([A.coop.role==="host"?"guest":"host"]); }; document.body.appendChild(b); }
    var v=A.coop.vc; b.textContent=v.on?"\uD83C\uDF99 Talking"+(v.live()?"":" ..."):"\uD83C\uDF99 Talk"; b.style.background=v.on?"#7ed48a":"rgba(10,12,16,.6)"; b.style.color=v.on?"#12100e":"#fff"; };
  A.coop._avatar=function(){ if(A.coop.remote) return A.coop.remote; var C=A.makeCharacter({look:(A.plan&&A.plan.hero&&A.plan.hero.look)||"friend in a green jacket",kind:"hero",colors:{top:"#2f6a4a"}}); W().scene.add(C.root); A.coop.remote={char:C,pos:new (T().Vector3)(),yaw:0,to:null,speed:0}; return A.coop.remote; };
  A.coop._in=function(m){ if(!m||!m.t) return; var t=T(); if(A.coop.vc&&/^(rtc|voice-on|voice-off|voice-here)$/.test(m.t)){ A.coop.vc.onMsg(m); return; }
    if(m.t==="pos"){ var r=A.coop._avatar(); r.to=new t.Vector3(m.x,m.y,m.z); r.toYaw=m.yaw; r.speed=m.s||0; if(m.a) r.char.play(m.a); return; }
    if(m.t==="hit"&&!A._guest){ var e=A.enemies.filter(function(x){ return x.id===m.id; })[0]; if(e) A.hurtEnemy(e,Number(m.dmg)||10,null,{}); return; }
    if(m.t==="world"&&A._guest){ (m.e||[]).forEach(function(s){ var e=A.enemies.filter(function(x){ return x.id===s[0]; })[0]; if(!e) return; e.net={x:s[1],z:s[2],yaw:s[3]}; e.state=s[4]; e.health=s[5]; if(s[6]&&!e.dead) A._killEnemy(e); }); return; }
    if(m.t==="dmg"&&A._guest){ A.damagePlayer(Number(m.n)||5); return; }
    if(m.t==="chapter"&&A._guest&&m.code){ A.loadChapter(m.n,m.code); return; }
    if(m.t==="hello"&&A.coop.vc&&A.coop.vc.on){ var other=A.coop.role==="host"?"guest":"host"; A.coop.vc.link(other); }
    if(m.t==="hello"&&A.coop.role==="host"){ A.toast("Your friend joined"); A.coop._avatar(); } };
  A.coop._tick=function(dt){ if(!A.coop.on||!A.player) return; var P=A.player, r=A.coop.remote; A.coop.sendT-=dt;
    if(A.coop.sendT<=0){ A.coop.sendT=0.1; A.coop.room.send({t:"pos",x:+P.pos.x.toFixed(2),y:+P.pos.y.toFixed(2),z:+P.pos.z.toFixed(2),yaw:+P.yaw.toFixed(2),s:+Math.hypot(P.vel.x,P.vel.z).toFixed(2),a:P.char.act||null});
      if(A.coop.role==="host"){ A.coop._wt=(A.coop._wt||0)+1; if(A.coop._wt%2===0) A.coop.room.send({t:"world",e:A.enemies.map(function(e){ return [e.id,+e.pos.x.toFixed(2),+e.pos.z.toFixed(2),+e.yaw.toFixed(2),e.state,Math.round(e.health),e.dead?1:0]; })}); } }
    if(r&&r.to){ r.pos.lerp(r.to,1-Math.exp(-12*dt)); r.yaw+=angDiff(r.yaw,r.toYaw||0)*Math.min(1,dt*10); r.char.root.position.copy(r.pos); r.char.root.rotation.y=r.yaw; r.char.animate(dt,r.speed,r.speed>3); }
    if(A._guest) A.enemies.forEach(function(e){ if(e.net&&!e.dead){ e.pos.x=damp(e.pos.x,e.net.x,10,dt); e.pos.z=damp(e.pos.z,e.net.z,10,dt); e.yaw+=angDiff(e.yaw,e.net.yaw)*Math.min(1,dt*10); e.char.root.position.copy(e.pos); e.char.root.rotation.y=e.yaw; e.char.animate(dt,e.state==="chase"?3:0.5,e.state==="chase"); } }); };
  A.onUpdate(function(dt){ A.coop._tick(dt); });
  // a guest's enemies are the host's: the guest does not run its own AI, and its hits go to the host
  var _ue=A._updateEnemies; A._updateEnemies=function(dt,t){ if(A._guest) return; var r=A.coop.remote;
    if(r&&r.to&&A.player){ // hunt whichever player is closer: swap the hero for the friend for enemies nearer to them
      var P=A.player, real=P.pos.clone(); var near=A.enemies.filter(function(e){ return !e.dead&&e.pos.distanceTo(r.pos)<e.pos.distanceTo(real); });
      if(near.length){ var others=A.enemies.filter(function(e){ return near.indexOf(e)<0; }); var keep=A.enemies; A.enemies=others; _ue(dt,t); A.enemies=near; P.pos.copy(r.pos); var hp=A.state.health, dmgTo=A.damagePlayer; A.damagePlayer=function(n){ A.coop.room&&A.coop.room.send({t:"dmg",n:n}); }; try{ _ue(dt,t); }finally{ A.damagePlayer=dmgTo; P.pos.copy(real); A.state.health=hp; A.enemies=keep; } return; } }
    _ue(dt,t); };
  var _hurt=A.hurtEnemy; A.hurtEnemy=function(e,dmg,dir,opts){ if(A._guest&&A.coop.room){ A.coop.room.send({t:"hit",id:e.id,dmg:dmg}); var p=e.pos.clone(); p.y+=1.2; A._burst(p,"spark",8); A._damageNumber(p,Math.round(dmg)); return; } return _hurt(e,dmg,dir,opts); };
  var _lc=A.loadChapter; A.loadChapter=function(n,code){ _lc(n,code); if(A.coop.on&&A.coop.role==="host") try{ A.coop.room.send({t:"chapter",n:n,code:code}); }catch(e){} };
  A.coop.menu=function(){ var code=Math.random().toString(36).slice(2,6).toUpperCase().replace(/[^A-Z]/g,"X");
    var p=A._panel("<h3>Play with a friend</h3><p>Your friend opens this same game on their phone, taps Play with a friend, then Join, and types your code. Both of you fight the same enemies.</p><div class='row'><button class='pri' data-h>Host - my code is "+code+"</button></div><div class='row'><input data-c maxlength=4 placeholder='Friend\u2019s code' style='flex:1;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;padding:0 10px;font:700 15px Manrope;letter-spacing:.2em;text-transform:uppercase'><button data-j>Join</button></div><div class='row'><button data-x>Back</button></div>");
    p.querySelector("[data-h]").onclick=function(){ p.close(); A.coop.start("host",code); };
    p.querySelector("[data-j]").onclick=function(){ var v=String(p.querySelector("[data-c]").value||"").trim().toUpperCase(); if(v.length!==4) return; p.close(); A.coop.start("guest",v); };
    p.querySelector("[data-x]").onclick=function(){ p.close(); }; };

  // ════════════════════════════════════════════════════════════════════════
  //  11. ANY WORLD BECOMES A GAME. Instant and free: its shapes become solid,
  //  a hero arrives where you stand, relics are hidden around, guardians
  //  wake, and a way out opens when all three are found.
  // ════════════════════════════════════════════════════════════════════════
  A.quickGame=function(o){
    o=o||{}; var Wd=W(), t=T(); if(!Wd||!Wd.scene) return false; if(A._game) return false;
    var title=String(document.title||"this place"); var sci=/space|station|robot|future|cyber|mars|ship|lab/i.test(title), spooky=/haunt|crypt|cave|tomb|ghost|night|dark|dungeon/i.test(title);
    A.setup({title:title,chapter:1,chapterTitle:"Play "+title,genre:o.genre||(sci?"scifi":spooky?"horror":"fantasy"),noTitle:false});
    // the world's own shapes become solid; huge shells and floors are left as they are
    Wd.scene.updateMatrixWorld(true); Wd.scene.traverse(function(m){ if(!m.isMesh||m.userData.solid||m.userData.noFrame||m.isSkinnedMesh) return; if(m.material&&m.material.side===t.BackSide) return;
      try{ var b=new t.Box3().setFromObject(m), s=b.getSize(new t.Vector3()); if(s.y<0.25||Math.max(s.x,s.z)>40||Math.max(s.x,s.z)<0.3) return; A.solid(m); }catch(e){} });
    var cam=Wd.camera.position; A.playerSetup({at:[cam.x,cam.z],face:0,look:o.look||"adventurer in a travelling cloak",weapon:sci?"pistol":"sword",weapons:sci?["pistol"]:["sword"],ammo:60,flashlight:spooky});
    A._buildNav(); var n=A._nav, F=flood(cam.x,cam.z), spots=[];
    if(n&&F){ for(var i=0;i<n.nx*n.nz;i+=7){ if(F.seen[i]){ var x=n.x0+((i%n.nx)+0.5)*n.cs, z=n.z0+(((i/n.nx)|0)+0.5)*n.cs; var d=Math.hypot(x-cam.x,z-cam.z); if(d>6&&d<60) spots.push([x,z,d]); } } }
    if(spots.length<6){ for(var k=0;k<12;k++){ var a=k/12*Math.PI*2, r=10+k; spots.push([cam.x+Math.cos(a)*r,cam.z+Math.sin(a)*r,r]); } }
    spots.sort(function(){ return Math.random()-0.5; });
    var relic=["Sun relic","Moon relic","Star relic"], got=0;
    A.quest("Find the three relics",relic.map(function(nm,i){ return {text:"Find the "+nm,id:nm.toLowerCase(),at:[spots[i][0],spots[i][1]]}; }).concat([{text:"Reach the gate of light",id:"gate"}]));
    relic.forEach(function(nm,i){ A.item({name:nm,kind:"gem",at:[spots[i][0],spots[i][1]],quest:nm.toLowerCase(),onPick:function(){ got++; if(got===3){ var far=spots.slice(3).sort(function(p,q){ return q[2]-p[2]; })[0]||spots[3]; A.exit({at:[far[0],far[1]],size:[3,3],text:"You carried the relics out of "+title+"."}); A.waypoint([far[0],far[1]]); A.say("","The gate of light has opened."); } }}); });
    var foes=sci?"robot":spooky?"wraith":"skeleton"; for(var j=3;j<Math.min(spots.length,9);j++) A.enemy({type:foes==="skeleton"?"zombie":foes,look:foes==="skeleton"?"skeleton warrior":"",at:[spots[j][0],spots[j][1]],behaviour:"patrol",patrol:[[spots[j][0],spots[j][1]],[spots[j][0]+3,spots[j][1]+2]]});
    A.item({name:"Healing herb",kind:"herb",at:[spots[1][0]+1.5,spots[1][1]]}); return true; };
})();
