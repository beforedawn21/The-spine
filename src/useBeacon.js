// ═══════════════════════════════════════════════════════════════════════════════════════════
//  "A SPINE PRODUCT IS BEING USED" - for things that leave the app (batch 15).
//  A game, tool or page someone downloads carries a tiny counter. Each time it is opened, and the
//  first time it is touched, it notes that on that phone - with the day, and whether the phone was
//  offline. When the phone is online the notes go to The Spine (Vercel logs it; Brain Stem counts it)
//  and are cleared. Only the KIND of product is sent - never who, never a name, never what is in it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const KINDS = ["Game", "Tool", "App", "Page", "World", "Story", "File"];

export function kindFor(k) {
  const s = String(k || "").toLowerCase();
  if (/game|arcade|adventure|phaser|puzzle/.test(s)) return "Game";
  if (/world|vr|xr|3d/.test(s)) return "World";
  if (/story|book|comic/.test(s)) return "Story";
  if (/tool|calc|tracker|util/.test(s)) return "Tool";
  if (/app|site|web|landing/.test(s)) return "App";
  if (/page|doc|slide|deck/.test(s)) return "Page";
  return "File";
}

function siteUrl() {
  try { if (/^https:\/\//.test(location.origin) && !/localhost|127\.0\.0\.1/.test(location.hostname)) return location.origin; } catch (e) {}
  return "https://thespine.cloud";
}

export function beaconScript(kind, site) {
  const K = KINDS.includes(kind) ? kind : kindFor(kind);
  const S = JSON.stringify(String(site || siteUrl()).replace(/\/$/, "") + "/api/usage");
  return '<script data-spine-beacon>/* The Spine counts that this was opened and used - only the kind of thing it is, never who or what is in it. */\n'
    + '(function(){try{var S=' + S + ',K=' + JSON.stringify(K) + ',Q="spine.dl.q",q={},dev="",LS=null;'
    + 'try{LS=window.localStorage;q=JSON.parse(LS.getItem(Q)||"{}")||{};dev=LS.getItem("spine.dl.dev")||"";}catch(e){LS=null;}'
    + 'if(!dev){dev="f"+Math.random().toString(36).slice(2,12)+Date.now().toString(36);try{LS&&LS.setItem("spine.dl.dev",dev);}catch(e){}}'
    + 'var off=function(){return navigator.onLine===false;};'
    + 'var day=function(){var x=new Date();return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2);};'
    + 'var keep=function(){try{LS&&LS.setItem(Q,JSON.stringify(q));}catch(e){}};'
    + 'var add=function(what){var e=off()?"Offline · Downloaded "+K.toLowerCase()+" "+what:"Downloaded · "+K+" "+what;var k=day()+"|"+e;q[k]=(q[k]||0)+1;keep();};'
    + 'var send=function(){if(off())return;var days={},n=0;for(var k in q){var i=k.indexOf("|");if(i<0)continue;var d=k.slice(0,i);(days[d]=days[d]||{})[k.slice(i+1)]=q[k];n++;}if(!n)return;'
    + 'var b=JSON.stringify({op:"ping",device:dev,days:days}),ok=false;'
    + 'try{ok=!!(navigator.sendBeacon&&navigator.sendBeacon(S,new Blob([b],{type:"text/plain"})));}catch(e){}'
    + 'if(!ok){try{fetch(S,{method:"POST",mode:"no-cors",keepalive:true,headers:{"Content-Type":"text/plain"},body:b});ok=true;}catch(e){}}'
    + 'if(ok){q={};keep();}};'
    + 'add("opened");var used=false;document.addEventListener("pointerdown",function(){if(used)return;used=true;add("used");},true);'
    + 'window.addEventListener("online",function(){setTimeout(send,1500);});'
    + 'document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")send();});'
    + 'setTimeout(send,4000);}catch(e){}})();</' + 'script>';
}

// Add the counter to a downloaded page. Text that is not a web page, or already has it, is left alone.
export function withUseBeacon(html, kind, site) {
  const s = String(html || "");
  if (!/<(html|body|script|div|canvas)\b/i.test(s) || /data-spine-beacon/.test(s)) return s;
  const tag = beaconScript(kind, site);
  const i = s.toLowerCase().lastIndexOf("</body");                     // the last one: a script may mention "</body>" earlier
  return i >= 0 ? s.slice(0, i) + tag + "\n" + s.slice(i) : s + "\n" + tag;
}
