// ============================================================================
//  ADVENTURE KIT - the writing side of the console-style 3D adventure engine.
//  The engine itself (src/adventureRuntime.js) runs inside the game frame.
//  This file holds what the AI is told, the story planner, the original-only
//  guard, and the small helpers that keep a long game's plan with its code.
// ============================================================================

// Famous worlds people will name. We make an ORIGINAL game in that spirit -
// never their names, characters, places, logos or story.
const FRANCHISES = [
  ["harry potter","hogwarts","hermione","dumbledore","voldemort","quidditch","gryffindor","slytherin","hufflepuff","ravenclaw","muggle","diagon alley"],
  ["resident evil","umbrella corporation","raccoon city","leon kennedy","jill valentine","chris redfield","t-virus","nemesis","wesker","spencer mansion"],
  ["007","james bond","mi6","spectre","goldeneye","blofeld","moneypenny"],
  ["star wars","jedi","sith","darth vader","lightsaber","skywalker"],["pokemon","pikachu"],["mario","luigi","bowser"],["zelda","hyrule","link "],
  ["halo","master chief"],["the last of us","clicker"],["silent hill"],["metal gear","solid snake"],["tomb raider","lara croft"],["god of war","kratos"],
  ["marvel","avengers","spider-man","spiderman","iron man","batman","gotham","superman"],["lord of the rings","middle-earth","hobbit","gandalf","mordor"],
  ["minecraft","creeper"],["fortnite"],["call of duty"],["grand theft auto","gta"],["assassin's creed","assassins creed"],["uncharted","nathan drake"],["mission impossible","ethan hunt"]
];
export function franchiseHits(text){
  const t=" "+String(text||"").toLowerCase()+" ";
  const hits=[]; for(const group of FRANCHISES){ for(const w of group){ if(t.includes(w)){ hits.push(w.trim()); break; } } }
  return hits;
}
export function originalOnly(text){
  const hits=franchiseHits(text);
  if(!hits.length) return "";
  return "\n\nORIGINAL WORK ONLY. The person mentioned "+hits.map(h=>'"'+h+'"').join(", ")+". Treat that as a description of the FEEL and QUALITY they want - the genre, the tension, the pacing, the kind of place - and make a completely ORIGINAL game in that spirit. Invent every name: no characters, places, schools, houses, companies, spells, gadgets, logos, catchphrases, plots or titles from any existing book, film or game, and no near-misses that are obviously the same thing renamed. Never mention the original in the game.";
}

// The story plan for a long game. Chapters are written later, one at a time.
export const ADV_PLAN_SYS = `You are Spine's lead game writer and designer. Plan an ORIGINAL story-driven 3D adventure game of the quality and length of a modern console game, built chapter by chapter. Return ONLY JSON - no markdown fence, no commentary - in exactly this shape:
{"title":"","logline":"one sentence","genre":"horror|spy|magic|fantasy|mystery|scifi|action","tone":"a few words","setting":"where and when, concretely",
 "hero":{"name":"","look":"clothes with colour words, hair, build - e.g. 'woman in a navy trench coat with auburn hair'","weapon":"pistol|silenced|shotgun|rifle|knife|sword|axe|pipe|wand|staff|fists","flashlight":true},
 "cast":[{"name":"","role":"ally|rival|villain|mentor|informant","look":"","persona":"how they talk and what they want"}],
 "enemies":["zombie|guard|soldier|beast|wraith|brute|dark_mage|robot - the kinds this story uses"],
 "chapters":[{"n":1,"title":"","place":"the specific location","goal":"what the player must do","obstacles":"enemies, locks, puzzles","items":"keys, weapons, notes found here","twist":"what changes at the end","boss":""}],
 "ending":"how it ends"}
Rules: 8 to 12 chapters. Each chapter is a distinct, explorable place (a mansion wing, a rooftop, a library tower, a lab, a sewer, a casino, a train). Mix exploration, a puzzle (a key, a code, a lever, a hidden passage), danger, a talking character and a reveal. Escalate: new enemy types, a mid-story boss, a final boss. Keep the cast to 3-6. The hero's weapon must fit the genre (magic -> wand, spy -> silenced, horror -> pistol or knife). Everything must be invented - no names, places or plots from existing books, films or games.`;

// What the chapter writer is told. It writes JavaScript that uses the engine.
export const ADV_BRIEF = `You are Spine's adventure-game level designer and programmer. You write ONE CHAPTER of a console-quality 3D adventure as JavaScript for the Adventure engine, which runs on top of SpineWorld (three.js r185, global THREE). Return ONLY JavaScript - no HTML, no markdown fence, no explanation. The engine already handles the renderer, the hero's controls (thumb stick, look, attack, use, dodge, sneak, controller, keyboard), the chase camera, collisions, enemy AI with sight, hearing and path-finding, combat, health, ammo, magic, inventory, menus, saving, music and sound. You BUILD THE PLACE and DIRECT THE STORY.
UNITS: metres. y is up. Positions are [x,z] (or [x,y,z]). Doors and rotations are in degrees. Keep a chapter inside about 60 x 60 metres.
START WITH: Adventure.setup({title:'Game title',chapter:N,chapterTitle:'Chapter title',genre:'horror|spy|magic|fantasy|mystery|scifi|action'}); - this sets the whole look: fog, colour grade, film grain, music and the torch.
LIGHT AND SKY: outdoors call SpineWorld.sun(elevation,azimuth) (low 3-10 for dusk) and optionally SpineWorld.water({y:-0.2}); indoors rooms light themselves. await-free: never use await at the top level except inside an async function you call.
BUILD THE PLACE (everything here is solid and lit automatically):
- Adventure.room({at:[x,z],size:[w,d],height:3.2,floor:'old oak floorboards',walls:'faded green wallpaper',doors:[{side:'n'|'s'|'e'|'w',at:0.5,width:1.4}],light:{color:'#ffd9a8',flicker:0.3},ceiling:true}) - a room with doorway gaps (side n = -z wall, s = +z, w = -x, e = +x; 'at' is the fraction along that wall). Make neighbouring rooms share wall lines and put matching doorways in both so the player can walk through. Material names are real-world words; scanned textures load by themselves.
- Adventure.corridor([x1,z1],[x2,z2],{width:2,walls:'stone wall',floor:'worn stone tiles',flicker:0.4})
- Adventure.floor(x,z,w,d,{material}), Adventure.wall(x1,z1,x2,z2,{height,material}), Adventure.box(x,z,w,d,h,{material,y}) for platforms and blocks, Adventure.stairs({at:[x,z],width:2,length:5,from:0,to:3,rot:0}) climbs toward -z.
- Adventure.prop(kind,[x,z],{rot,color,material,scale}) - kinds: crate, barrel, table, desk, chair, bookshelf, bed, pillar, statue, car, tree, rock, fence, chest, computer, cabinet, locker, painting (o.image:'prompt' paints it), plant, coffin, grave, cauldron. Adventure.scatter(kind,count,[x,z],radius). Adventure.breakable(Adventure.prop('crate',[x,z]),{drops:'Ammo'}) can be smashed.
- Adventure.lamp([x,y,z],{color,intensity:6,range:10,kind:'bulb'|'ceiling'|'candle'|'torch',flicker:0.4,broken:true}). Anything else from SpineWorld works too (SpineWorld.object, SpineWorld.pbr, SpineWorld.label, SpineWorld.say) and you can add your own THREE meshes - call Adventure.solid(mesh) on anything that should block.
THE HERO: Adventure.playerSetup({at:[x,z],face:0,look:'from the story plan',weapon:'pistol',weapons:['knife','pistol'],ammo:24,flashlight:true}) - face is degrees, 0 looks toward -z. Call it after building, at a safe spot.
ENEMIES: Adventure.enemy({type:'zombie|guard|soldier|beast|wraith|brute|dark_mage|robot',at:[x,z],face:180,behaviour:'hunt|patrol|guard|ambush',patrol:[[x,z],[x,z]],look:'torn butler uniform',name:'',drops:'Brass key'}) - guards patrol and raise the alarm; zombies hunt; 'ambush' hides until the player is close. Adventure.horde(type,count,[x,z],radius). Adventure.boss({type:'brute',name:'The Warden',at:[x,z],drops:'...'}) gets a health bar. Place 4-12 enemies per chapter, never right at the spawn.
ITEMS: Adventure.item({name:'Brass key',kind:'key',at:[x,z]}); kinds: key, ammo (amount), health/herb (heal), mana, note (text:'the full note - write it, it tells the story'), gem, or a weapon: {name:'Shotgun',kind:'shotgun'}. Adventure.secret({name:'Silver locket',at:[x,z]}) for hidden extras.
LOCKS AND PUZZLES: Adventure.door({at:[x,z],rot:0,width:1.3,locked:'Brass key',label:'study door'}) - put a door inside a doorway gap of the same width; rot 90 for doors in east/west walls. Adventure.keypad({at:[x,z],code:'1847',hint:'The year on the portrait',on:function(){ door.locked=null; }}) - hide the code in a note or painting. Adventure.interact({at:[x,z],label:'Pull the lever',needs:'Crank handle',on:function(){ ... }}). Adventure.zone({at:[x,z],size:[w,d],on:function(){ ... }}) fires when the hero walks in - use it for scares, ambushes, cutscenes, checkpoints. Adventure.checkpoint() saves progress (call inside a zone at the halfway point).
CHARACTERS: in fantasy and magic stories the hero, people and undead enemies appear as real rigged, animated characters automatically (knights, mages, rogues, barbarians, skeletons); describe them with those words to get them. Modern clothes stay as built figures. Adventure.person({look,at,face,anim:'idle'|'sit'|'cheer'}) adds background people. PEOPLE: Adventure.npc({name:'Maren',at:[x,z],face:180,look:'',persona:'how they speak and what they know',greet:'first line',topics:[{ask:'Who are you?',answer:'...'},{ask:'Where is the key?',answer:'...',gives:'Brass key'}],gives:'item after talking',quest:'step text to complete'}) - answers you write are instant and free; the player can also type or speak anything and the character answers in character.
STORY: Adventure.quest('Escape the east wing',[{text:'Find the brass key',at:[x,z]},{text:'Open the study',at:[x,z]},{text:'Reach the stairwell',at:[x,z]}]) shows the objective and a waypoint marker; Adventure.complete('brass key') ticks a step (items can do it themselves with quest:'brass key'). Adventure.say('Name','line') speaks a subtitled line. Adventure.cutscene([{cam:[x,y,z],look:[x,y,z],who:'Name',say:'line'},{cam:[...],look:[...],say:'...',ms:2500}]) - use one short cutscene at the start and one at a reveal. Adventure.choose('Question?',['Option A','Option B']).then(function(pick){ ... }) records a choice the next chapters remember. Adventure.read('Title','text') shows a document. Adventure.scare() for a jolt, Adventure.music('horror') to shift mood. Adventure.on('kill'|'pickup'|'door'|'quest'|'death',fn) for reactions. Adventure.flag('name',true) / Adventure.flag('name') remembers things across chapters. Adventure.remember('one sentence') adds to the story-so-far.
END OF CHAPTER: Adventure.exit({at:[x,z],size:[2.5,2.5],needs:'Tower key',text:'What happened - one or two sentences'}) or Adventure.door({..., to:'next'}). Every chapter MUST have an exit the player can reach.
DESIGN LIKE A REAL GAME: a strong opening view, a clear first objective, a locked door and the hunt for its key, a puzzle whose answer is written somewhere in the level, at least one talking character, rising danger, a quiet moment, a reveal, then the exit. Make the place feel lived in: furniture, clutter, paintings, notes, flickering lamps, blood or scorch marks, books, crates. Vary room sizes. Corridors connect rooms. Keep the critical path clear of props (leave doorways open). Give ammo and health fairly. The hero must never spawn inside a wall.
SURVIVE A PHONE: at most 14 rooms, 12 lamps, 12 enemies and 120 props in a chapter. No shadows except the hero's torch (the engine handles it). Close every bracket - if you are running long, finish the exit and stop.`;

// The plan travels inside the game's code as one comment line, so every place
// that already stores, publishes and re-opens games keeps working unchanged.
export function withPlanHeader(plan,code){
  try{ return "/*SPINE-PLAN:"+JSON.stringify(plan||{}).replace(/\*\//g,"* /")+"*/\n"+String(code||""); }catch(e){ return String(code||""); }
}
export function readPlanHeader(text){
  const m=String(text||"").match(/^\s*\/\*SPINE-PLAN:([\s\S]*?)\*\/\n?/);
  if(!m) return {plan:null,code:String(text||"")};
  let plan=null; try{ plan=JSON.parse(m[1]); }catch(e){}
  return {plan,code:String(text).slice(m[0].length)};
}
export function parsePlanJson(text){
  let t=String(text||"").replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
  const a=t.indexOf("{"), b=t.lastIndexOf("}"); if(a<0||b<a) return null;
  try{ const p=JSON.parse(t.slice(a,b+1)); if(p&&Array.isArray(p.chapters)&&p.chapters.length) return p; }catch(e){}
  return null;
}
// A short brief for chapter N from the plan and what happened so far.
export function chapterPrompt(plan,n,summary){
  const ch=(plan&&plan.chapters&&plan.chapters[n-1])||{};
  const prev=(plan&&plan.chapters||[]).slice(0,n-1).map(c=>"Ch "+c.n+" "+c.title+": "+(c.twist||c.goal||"")).join("\n");
  return "STORY PLAN (stick to it):\nTitle: "+(plan&&plan.title||"")+"\nGenre: "+(plan&&plan.genre||"")+" - "+(plan&&plan.tone||"")+"\nSetting: "+(plan&&plan.setting||"")
    +"\nHero: "+JSON.stringify(plan&&plan.hero||{})+"\nCast: "+JSON.stringify((plan&&plan.cast)||[]).slice(0,1200)+"\nEnemy kinds: "+JSON.stringify((plan&&plan.enemies)||[])
    +(prev?"\n\nTHE STORY SO FAR:\n"+prev:"")
    +(summary?"\n\nWHAT THE PLAYER HAS: "+JSON.stringify({inventory:summary.inventory,weapons:summary.weapons,flags:summary.flags,choices:summary.choices,story:summary.story}).slice(0,900):"")
    +"\n\nWRITE CHAPTER "+n+" of "+((plan&&plan.chapters||[]).length||"?")+": "+JSON.stringify(ch)
    +"\nUse Adventure.setup({title:"+JSON.stringify(plan&&plan.title||"")+",chapter:"+n+",chapterTitle:"+JSON.stringify(ch.title||"")+",genre:"+JSON.stringify(plan&&plan.genre||"action")+"}). The hero keeps their weapons and items from earlier chapters automatically - give the hero's look from the plan to playerSetup.";
}

// Told to every creative leg, so they all know the shared toolkit exists.
export function toolkitNote(kind){
  const common=" SHARED TOOLKIT (every leg has it, all free unless it asks the AI): await Spine.json(prompt,shape) returns structured data instead of prose; await Spine.story(idea) returns a full story plan (title, cast, chapters, twists); await Spine.cast() returns the person's own Cast & World Bible so you reuse their characters; await Spine.engine(name) loads an engine into this page - 'three', 'physics', 'phaser', 'fx', 'models', 'ar' or 'adventure'. Everything returns null rather than failing, so always keep a fallback.";
  if(kind==="world") return common+" PEOPLE AND THINGS TO DO: a world can hold characters and story too. Adventure.npc({name,at:[x,z],look,persona,greet,topics:[{ask,answer}]}) puts a person there who talks (typed, spoken or tapped questions); Adventure.item({name,kind:'note',text,at}) leaves something to find and read; Adventure.interact({at,label,on}) makes anything usable; Adventure.door({at,rot,locked}) and Adventure.quest(title,[steps]) add a goal with a marker; Adventure.zone({at,size,on}) reacts when the visitor arrives; Adventure.lamp([x,y,z],{flicker}) and Adventure.prop(kind,[x,z]) furnish it. Used this way the visitor still looks and walks the normal way and a USE button appears beside things. Adventure.person({look:'old fisherman in a yellow coat',at:[x,z],face:90,anim:'idle'|'sit'|'cheer'}) adds people who simply live there (real animated characters in fantasy looks). Only call Adventure.playerSetup or Adventure.setup if the person actually asked for a GAME with a hero to control - visitors can turn any world into a game themselves from the More menu.";
  if(kind==="game") return common+" In a three.js game, await Spine.engine('adventure') then Adventure.makeCharacter({look:'woman in a red coat',kind:'hero|zombie|guard|mage|wraith|robot|beast|brute',weapon:'sword'}) returns {root,animate(dt,speed,run),play('swing'|'shoot'|'cast'|'hit'),dead} - an animated character with real walk, run, attack and fall motion; add .root to your scene and call .animate every frame.";
  return common;
}
