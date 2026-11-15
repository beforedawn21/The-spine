// ============================================================================
//  GAME INTENT (batch 16) - build exactly the game that was asked for.
//
//  A person asked for tic-tac-toe and got a 3D character walking about. The
//  reasons: the last game that worked was handed over as an example whatever
//  it was, the chosen engine could be "3D adventure" for a board game, and
//  famous names used to describe QUALITY were read as a genre to blend in.
//  This file reads what kind of game was asked for, picks a sensible engine
//  when the chosen one cannot make it, writes the "build exactly this" rules,
//  and checks the finished code against the request before anyone plays it.
// ============================================================================

// Well-known classics, described by their rules so the builder never guesses.
// Names here are generic game names, not anyone's brand.
export const CLASSICS = [
  { re: /\b(tic[\s-]*tac[\s-]*toe|noughts?\s*(and|&|n)\s*crosses|x'?s\s*(and|&|n)\s*o'?s)\b/i, name: "tic-tac-toe", kind: "board",
    rules: "a 3 by 3 grid; two players take turns placing X and O; three in a row (across, down or diagonal) wins; a full grid with no line is a draw. Offer 'vs computer' (an opponent that blocks and takes wins, with an easy/hard choice) and 'two players on one phone'." },
  { re: /\bconnect[\s-]*(four|4)\b|\bfour in a row\b/i, name: "connect four", kind: "board",
    rules: "a 7 column by 6 row upright grid; players drop discs that fall to the lowest empty spot in a column; four in a row in any direction wins; full board is a draw." },
  { re: /\b(checkers|draughts)\b/i, name: "checkers", kind: "board",
    rules: "8x8 board, 12 pieces each on dark squares, diagonal moves forward, jumps capture and must be taken, multi-jumps, reaching the far row crowns a king that moves both ways; no pieces or no moves loses." },
  { re: /\bchess\b/i, name: "chess", kind: "board",
    rules: "full chess rules: all six pieces, castling, en passant, promotion, check, checkmate and stalemate; highlight legal moves; a computer opponent." },
  { re: /\b(reversi|othello)\b/i, name: "reversi", kind: "board",
    rules: "8x8 board starting with four discs in the centre; a move must outflank and flips every straight line of the opponent's discs; pass when no move; most discs at the end wins." },
  { re: /\b(gomoku|five in a row)\b/i, name: "five in a row", kind: "board", rules: "15x15 grid, take turns placing stones, five in a row wins." },
  { re: /\bmancala\b/i, name: "mancala", kind: "board", rules: "two rows of six pits with four seeds each and a store at each end; sow seeds anticlockwise, extra turn when the last seed lands in your store, capture across when landing in an empty pit on your side." },
  { re: /\bdots?\s*(and|&)\s*boxes\b/i, name: "dots and boxes", kind: "board", rules: "a grid of dots; players take turns drawing one line; closing a box scores it and gives another turn; most boxes wins." },
  { re: /\bbattleships?\b/i, name: "sea battle", kind: "board", rules: "each side hides ships on a 10x10 grid; take turns calling squares; hit, miss and sunk are shown; sink every ship to win." },
  { re: /\b(snakes?\s*(and|&)\s*ladders|chutes\s*(and|&)\s*ladders)\b/i, name: "snakes and ladders", kind: "board", rules: "a 10x10 numbered board; roll a die and move; ladders climb, snakes slide; first to 100 wins." },
  { re: /\bludo\b/i, name: "ludo", kind: "board", rules: "four colours, four tokens each; a six brings a token out; race round the board, landing on an opponent sends it home; get all four home to win." },
  { re: /\bbackgammon\b/i, name: "backgammon", kind: "board", rules: "standard backgammon: 24 points, two dice, hitting blots, the bar, bearing off." },
  { re: /\bdomino(es)?\b/i, name: "dominoes", kind: "board", rules: "a double-six set; match ends; draw when stuck; first to play all tiles wins the round." },
  { re: /\bminesweeper\b|\bmine\s*sweep/i, name: "mine finder", kind: "puzzle", rules: "a grid with hidden mines; tap to reveal, numbers count neighbouring mines, long-press to flag; the first tap is always safe; clear every safe square to win." },
  { re: /\bsudoku\b/i, name: "sudoku", kind: "puzzle", rules: "a 9x9 grid of 3x3 boxes; fill so every row, column and box has 1-9 once; generated puzzles with a unique answer at easy/medium/hard; pencil marks and mistakes check." },
  { re: /\b2048\b/i, name: "2048", kind: "puzzle", rules: "4x4 grid; swipe to slide all tiles; equal tiles merge and double; a new 2 or 4 appears each move; reach 2048." },
  { re: /\b(sliding|15)[\s-]*puzzle\b/i, name: "sliding puzzle", kind: "puzzle", rules: "a 4x4 frame with 15 numbered tiles and one gap; slide tiles to put them in order; always a solvable shuffle." },
  { re: /\bjigsaw\b/i, name: "jigsaw", kind: "puzzle", rules: "a picture cut into pieces that drag and snap into place." },
  { re: /\b(solitaire|klondike|patience)\b/i, name: "solitaire", kind: "card", rules: "Klondike: seven tableau piles, stock and waste, four foundations built up by suit from ace; build down in alternating colours; tap to auto-move." },
  { re: /\bblackjack\b|\b21\b.*\bcards?\b/i, name: "blackjack", kind: "card", rules: "player vs dealer, hit or stand, dealer stands on 17, aces count 1 or 11, blackjack pays 3:2, play money only." },
  { re: /\b(crazy\s*eights?|go\s*fish|war|snap|old\s*maid|rummy|hearts|spades)\b.*\bcard/i, name: "card game", kind: "card", rules: "the named card game with its real rules." },
  { re: /\bpoker\b/i, name: "poker", kind: "card", rules: "Texas hold'em with play chips only, against computer players, correct hand rankings." },
  { re: /\b(memory|matching|concentration)\s*(game|cards|match)\b|\bmatch(ing)?\s*pairs\b/i, name: "memory match", kind: "card", rules: "face-down cards in pairs; flip two at a time; matched pairs stay up; finish in as few moves as possible." },
  { re: /\bhangman\b/i, name: "hangman", kind: "word", rules: "guess a hidden word letter by letter; each wrong letter adds to the drawing; six wrong loses." },
  { re: /\bwordle\b|\bfive[\s-]*letter word\b|\bguess the word\b/i, name: "five-letter word guess", kind: "word", rules: "six tries to guess a five-letter word; each letter turns green (right spot), yellow (in the word) or grey; an on-screen keyboard shows used letters." },
  { re: /\bword\s*search\b/i, name: "word search", kind: "word", rules: "a letter grid with hidden words across, down and diagonal; drag to circle a word; a list ticks off found words." },
  { re: /\bcrossword\b/i, name: "crossword", kind: "word", rules: "a numbered grid with across and down clues; tap a square to type; check and reveal." },
  { re: /\b(trivia|quiz)\b/i, name: "quiz", kind: "quiz", rules: "multiple-choice questions, a score, a timer bar, right/wrong feedback and a results screen." },
  { re: /\bsnake\b(?!s?\s*(and|&)\s*ladders)/i, name: "snake", kind: "arcade", rules: "a snake moves on a grid, swipe to turn, eating food grows it, hitting a wall or itself ends the game." },
  { re: /\bpong\b/i, name: "paddle tennis", kind: "arcade", rules: "two paddles and a ball; drag your paddle; first to 7 wins; a computer paddle that can be beaten." },
  { re: /\b(breakout|brick\s*breaker|arkanoid)\b/i, name: "brick breaker", kind: "arcade", rules: "a paddle bounces a ball into rows of bricks; clear them all; lives and power-ups." },
  { re: /\b(tetris|falling\s*blocks?)\b/i, name: "falling blocks", kind: "arcade", rules: "seven four-square shapes fall into a 10x20 well; move, rotate and drop; full rows clear; speed rises. Use an original name and look." },
  { re: /\bflappy\b/i, name: "tap to fly", kind: "arcade", rules: "tap to flap upward against gravity through gaps in moving pipes; one hit ends the run." },
  { re: /\b(pac[\s-]*man|maze\s*chase)\b/i, name: "maze chase", kind: "arcade", rules: "eat every dot in a maze while four chasers hunt you; power pellets turn them; original look and names." },
  { re: /\b(space\s*invaders|alien\s*shooter)\b/i, name: "invader shooter", kind: "arcade", rules: "rows of descending invaders, a ship that slides and shoots, shields, waves; original look." },
  { re: /\basteroids\b/i, name: "rock blaster", kind: "arcade", rules: "a ship that turns and thrusts in space, rocks that split when shot, screen wrap." },
  { re: /\bfrogger\b|\bcross the road\b/i, name: "road crosser", kind: "arcade", rules: "hop across lanes of traffic and a river of logs to reach home." },
  { re: /\bwhack[\s-]*a[\s-]*mole\b/i, name: "whack-a-mole", kind: "arcade", rules: "moles pop from holes; tap them before they hide; a timer and speed-up." },
  { re: /\bsimon\s*says\b|\bsimon\b.*\bcolou?rs?\b/i, name: "colour memory", kind: "arcade", rules: "four coloured pads light in a growing sequence the player repeats." },
  { re: /\brock[\s,]*paper[\s,]*scissors\b/i, name: "rock paper scissors", kind: "arcade", rules: "choose rock, paper or scissors against the computer; best of five." },
  { re: /\bmahjong\b/i, name: "tile matching", kind: "puzzle", rules: "mahjong solitaire: free matching tiles are removed in pairs from a stacked layout." },
];

const KIND_WORDS = [
  ["card", /\b(deck[\s-]*build(er|ing)|trading card|collectible card|tcg|ccg|card battler|spades|hearts|rummy|gin rummy|go fish|uno-like|crazy eights|baccarat|cribbage|euchre|bridge card)\b/i],
  ["board", /\b(tabletop|dice game|yahtzee|five dice|monopoly-like|property trading|mahjong|shogi|xiangqi|nine men'?s morris|hex game|go board|board game)\b/i],
  ["board", /\bboard\s*game\b|\b(grid|turn[\s-]*based)\b.*\b(two|2)\s*players?\b/i],
  ["card", /\bcard\s*game\b|\bdeck of cards\b/i],
  ["puzzle", /\bpuzzle\b|\bbrain\s*teaser\b|\blogic\s*game\b|\bmatch[\s-]*3\b/i],
  ["word", /\bword\s*game\b|\bspelling\b|\banagram/i],
  ["quiz", /\btrivia\b|\bquiz\b/i],
  ["racing", /\b(race|racing|kart|drift|car\s*game)\b/i],
  ["sports", /\b(soccer|football|basketball|tennis|golf|baseball|hockey|bowling|pool|billiards|darts|boxing|skate)\b/i],
  ["platformer", /\bplatform(er)?\b|\bside[\s-]*scroll/i],
  ["shooter", /\bshoot(er|ing|-?em-?up)\b|\bshmup\b|\bfps\b/i],
  ["fighting", /\bfighting\s*game\b|\bbrawler\b|\bbeat[\s-]*'?em[\s-]*up\b/i],
  ["rhythm", /\brhythm\b|\bmusic\s*game\b|\bdance\s*game\b|\bguitar\b.*\bgame\b/i],
  ["strategy", /\b(tower\s*defen[cs]e|strategy|rts|turn[\s-]*based\s*tactics)\b/i],
  ["sim", /\b(sim|simulator|simulation|tycoon|farm(ing)?\s*game|city\s*builder|idle\s*game|clicker|pet\s*game)\b/i],
  ["runner", /\b(endless\s*runner|runner)\b/i],
  ["highend", /\b(open[\s-]*world|fps|first[\s-]*person|third[\s-]*person|battle royale|mmo|souls[\s-]*like|realistic|photo[\s-]*real|aaa|triple[\s-]*a|console[\s-]*(quality|game)|pc game|high[\s-]*(end|performance|fidelity)|unreal|next[\s-]*gen)\b/i],
  ["platformer", /\b(metroidvania)\b/i],
  ["sim", /\b(sandbox|survival craft|crafting game|life sim|management game)\b/i],
  ["strategy", /\b(roguelike|rogue-like|auto[\s-]*battler|4x|grand strategy|card tactics)\b/i],
  ["adventure", /\b(adventure|rpg|role[\s-]*play|quest|story[\s-]*driven|open[\s-]*world|explore|exploration|chapters?|survival\s*horror|stealth|mission|dungeon)\b/i],
];

// Famous games people name: they want THAT kind of game, made original. Maps the name to the
// kind of game and its style so the right engine and design are used.
export const FAMOUS = [
  [/call of duty|\bcod\b|battlefield|counter[\s-]*strike|valorant|\bhalo\b|doom\b/i, "highend", "a fast first-person military shooter: aim-down-sights, recoil, cover, squads, missions or arena matches"],
  [/fortnite|pubg|apex legends|warzone|battle royale/i, "highend", "a battle royale: drop in, loot, a shrinking zone, last one standing"],
  [/\b007\b|james bond|mission impossible|hitman|splinter cell|metal gear/i, "adventure", "a spy action game: stealth, gadgets, infiltration, chases and a villain's plot, glamorous locations"],
  [/resident evil|silent hill|the last of us|dead space|outlast/i, "adventure", "a survival-horror game: scarce ammo, locked doors and keys, puzzles, tense exploration, monsters"],
  [/harry potter|hogwarts/i, "adventure", "a magic-school adventure: spells, classes, secret corridors, a mystery to solve"],
  [/\bzelda\b|elden ring|dark souls|skyrim|the witcher/i, "adventure", "an action-adventure RPG: exploration, sword combat, dungeons, items that open new paths"],
  [/grand theft auto|\bgta\b|red dead|saints row/i, "highend", "an open-world crime/action game: a city to roam, vehicles, missions, wanted levels"],
  [/minecraft|terraria|roblox/i, "sim", "a sandbox: gather, craft and build in a block world, day/night, survival"],
  [/\bmario\b(?!\s*kart)|sonic|celeste|hollow knight|mega ?man/i, "platformer", "a platformer: run and jump through levels, enemies to stomp, secrets and a goal flag"],
  [/mario ?kart|crash team|need for speed|forza|gran turismo|rocket league/i, "racing", "a racing game: tracks, drifting, boosts and rivals"],
  [/fifa|\bea ?fc\b|madden|nba 2k|pes\b|wii sports/i, "sports", "a sports game of that sport with real rules and a computer opponent"],
  [/pok[eé]mon/i, "adventure", "a creature-collecting RPG: catch creatures, turn-based battles, a journey across regions"],
  [/street fighter|tekken|mortal kombat|smash bros/i, "fighting", "a fighting game: two fighters, combos, specials, rounds"],
  [/candy crush|bejeweled|match[\s-]*3/i, "puzzle", "a match-3 puzzle: swap to line up three, cascades, special pieces, levels with goals"],
  [/among us|werewolf|mafia game/i, "strategy", "a social deduction game: hidden roles, tasks, voting someone out"],
  [/clash royale|clash of clans|plants vs\.? zombies|bloons/i, "strategy", "a tower-defence / strategy game: place defences, waves, upgrades"],
  [/stardew|animal crossing|harvest moon|the sims/i, "sim", "a cosy life/farming sim: grow, build, befriend, seasons"],
  [/guitar hero|beat saber|dance dance|just dance/i, "rhythm", "a rhythm game: hit notes to the beat"],
  [/subway surfers|temple run/i, "runner", "an endless runner: three lanes, jump, slide, coins"],
  [/hearthstone|magic the gathering|slay the spire|balatro/i, "card", "a card battler / deckbuilder: build a deck, play cards with costs and effects, beat opponents"],
  [/\buno\b/i, "card", "a match-the-colour-or-number shedding card game with action cards (original name and look)"],
  [/monopoly/i, "board", "a property-trading board game: roll, buy, build, rent (original name and board)"],
  [/\btetris\b/i, "arcade", "falling four-square blocks that clear full rows"],
];
export function famousStyle(text) { const t = String(text || ""); for (const [re, kind, style] of FAMOUS) { const m = t.match(re); if (m) return { name: m[0], kind, style }; } return null; }

// What is being asked for. Never guesses beyond the words: "open" means "decide from the words".
export function gameIntent(text) {
  const t = String(text || "");
  const words = t.trim().split(/\s+/).length;
  const story = KIND_WORDS[KIND_WORDS.length - 1][1].test(t);
  for (const c of CLASSICS) {
    const m = t.match(c.re); if (!m) continue;
    // "a dungeon quest with a snake boss" is not the game of snake: in a long story request a
    // classic's name only counts when it sits right next to the word game or play.
    if (story && words > 14) {
      const at = m.index, near = t.slice(Math.max(0, at - 24), at + m[0].length + 24);
      if (!/(game|play|playing)/i.test(near)) continue;
    }
    return { kind: c.kind, name: c.name, rules: c.rules, classic: true };
  }
  const fam = famousStyle(t); if (fam) return { kind: fam.kind, name: "", rules: "", classic: false, famous: fam.name, style: fam.style };
  for (const [k, re] of KIND_WORDS) if (re.test(t)) return { kind: k, name: "", rules: "", classic: false };
  return { kind: "open", name: "", rules: "", classic: false };
}

const FLAT_KINDS = ["board", "card", "puzzle", "word", "quiz", "arcade"];
const SAYS_3D = /\b3[\s-]?d\b|\bthree[\s-]?dimension|\bfirst[\s-]?person\b|\bthird[\s-]?person\b/i;

// The engine to use. Only ever steps DOWN from a mismatch (a board game on the story
// engine); it never upgrades a simple request into something bigger.
export function modeFor(intent, chosen, text) {
  const t = String(text || "");
  const kind = intent && intent.kind;
  if (chosen === "adventure" && kind !== "adventure" && kind !== "open") {
    if (!FLAT_KINDS.includes(kind)) return { mode: "3d", note: "This isn't a story adventure, so I built it as a 3D " + kind + " game instead of the chapter-by-chapter story engine." };
    return { mode: "runtime", note: (intent.name ? cap(intent.name) + " is a " : "This is a ") + label(kind) + ", so I built it as one - not a 3D story. Pick 3D game if you want it in 3D." };
  }
  // an open request on an engine the person chose themselves keeps their choice
  if (chosen === "3d" && FLAT_KINDS.includes(kind) && !SAYS_3D.test(t)) {
    return { mode: chosen, note: "" }; // they picked 3D: keep it, the brief keeps the real rules
  }
  return { mode: chosen, note: "" };
}
function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function label(kind) {
  return ({ board: "board game", card: "card game", puzzle: "puzzle game", word: "word game", quiz: "quiz", arcade: "classic arcade game" })[kind] || "game";
}

// The rules every game build gets, on top of its engine's brief.
export function exactBrief(intent, text) {
  const i = intent || gameIntent(text);
  let s = "\n\nBUILD EXACTLY WHAT WAS ASKED - this overrides any example above.";
  if (i.classic) {
    s += " The person asked for " + i.name.toUpperCase() + ". That is a " + label(i.kind) + ": " + i.rules
      + " Build THAT game with those real rules, playable and finishable. Do NOT add a walking hero, a character to steer, enemies, a story, levels, a 3D world, weapons or anything else they did not ask for. Polish means: a beautiful clean board or table, smooth animation, satisfying sounds, clear turn and score display, a proper win / lose / draw screen and a one-tap rematch.";
  } else if (FLAT_KINDS.includes(i.kind)) {
    s += " This is a " + label(i.kind) + ". Keep it that kind of game. Do not turn it into an action game, add a character to walk around, or add a story unless they asked for one.";
  } else if (i.kind !== "open") {
    s += " This is a " + i.kind + " game. Keep it that genre.";
  } else {
    s += " Build the game their words describe. If the words name a known game, use its real rules.";
  }
  const fam = famousStyle(text);
  if (fam) s += " The person named " + fam.name + ": they want THAT kind of game - " + fam.style + ". Build exactly that style of game, completely original (no names, characters, places, logos or story from it).";
  s += " Build only what this request asks for. Never mix in a genre, setting or character from anywhere else (other requests, examples, earlier games) - if they named one famous game, make that kind; if they named several and asked for a mix, mix exactly those. Do not assume; when unsure, build the plainest reading of the request.";
  return s;
}

// The design step gets the same steer.
export function exactDesignNote(intent) {
  const i = intent || { kind: "open" };
  return " BUILD EXACTLY THE GAME ASKED - never change its genre."
    + (i.classic ? " It is " + i.name + " (" + label(i.kind) + "): " + i.rules + " No characters, story or enemies unless asked." : "")
    + " If they name a famous game they want that kind of game (made original); never add genres or settings they did not ask for.";
}

// A past working game is only shown as an example when it is the same kind of game.
export function sameKind(a, b) {
  const x = gameIntent(a).kind, y = gameIntent(b).kind;
  if (x === "open" || y === "open") return false;
  if (FLAT_KINDS.includes(x) && FLAT_KINDS.includes(y)) return x === y;
  return x === y;
}

// The check after building: does the code actually make what was asked?
export const MATCH_SYS = "You check whether a game's code builds what the person asked for. Read the request and the code. Return ONLY JSON: {\"match\":true|false,\"problem\":\"one plain sentence of what is wrong, or empty\"}. match is false when the code makes a different kind of game (for example a character walking around when a board game was asked), skips the core rules, or blends in settings, characters or stories nobody asked for. Small style choices are fine.";

export function matchPrompt(ask, code, intent) {
  const i = intent || gameIntent(ask);
  return "REQUEST: " + String(ask || "").slice(0, 1200)
    + (i.classic ? "\nTHIS IS: " + i.name + " - " + i.rules : "")
    + "\n\nCODE:\n" + String(code || "").slice(0, 14000);
}

export function readMatch(text) {
  try {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return { match: j.match !== false, problem: String(j.problem || "").slice(0, 300) };
  } catch (e) { return null; }
}

// Code-level tell-tales that a board/card/puzzle request came back as an action game.
export function obviousMismatch(intent, code) {
  const c = String(code || "");
  if (!intent || !FLAT_KINDS.includes(intent.kind)) return "";
  const action = /Adventure\.(playerSetup|enemy)\b|SpineGame\.character\(|\bplayer\.(vx|vy)\b|\bjump\s*\(/.test(c);
  if (action && intent.classic) return "It built an action game with a character instead of " + intent.name + ".";
  return "";
}

// The engine that fits each kind of game, when the person hasn't picked one themselves.
// Simple, rule-based games run on the built-in engine (most reliable on a phone); richer 2D
// action on Phaser; anything that is 3D by nature, high-end or says 3D on the 3D engine; long
// story games on the adventure engine.
export function recommendedMode(intent, text) {
  const t = String(text || ""); const k = intent && intent.kind;
  if (intent && intent.famous) { if (k === "adventure") return "adventure"; if (/minecraft|roblox/i.test(intent.famous)) return "3d"; }
  if (SAYS_3D.test(t) && !FLAT_KINDS.includes(k)) return "3d";
  if (k === "highend" || k === "racing") return "3d";
  if (k === "adventure") return /\b(story|chapters?|quest|rpg|explore|mission|mystery|horror|haunt|spy|detective|dungeon)\b/i.test(t) ? "adventure" : "3d";
  if (["platformer", "shooter", "fighting", "strategy", "sim", "runner", "rhythm", "sports"].includes(k)) return SAYS_3D.test(t) ? "3d" : "2d";
  return "runtime";
}

// What a great version of each kind needs, so the builder aims at the genre's real craft.
export const GENRE_CRAFT = {
  board: "a crisp board with clear squares/points, legal-move highlights, animated moves, turn indicator, undo, a computer opponent with easy/normal/hard (minimax or good heuristics), two players on one phone, win/draw detection and a rematch",
  card: "a real deck model (shuffle with a fair random shuffle, deal animation, fan of cards in hand, drag or tap to play), the exact rules and scoring of the named game, computer players that follow the rules, a round summary and a running score; cards drawn crisply in code (suits, pips, faces) at any size",
  puzzle: "generated puzzles that always have a solution, difficulty levels, hints, undo, a timer and best times, satisfying feedback",
  word: "a proper word list built into the code, an on-screen keyboard, letter feedback, streaks and a shareable result",
  quiz: "varied real questions, a timer bar, instant feedback with the right answer, a results screen",
  arcade: "tight controls that feel great on a phone, rising difficulty, juice (screen shake, particles, sounds), lives and a high score",
  platformer: "responsive running and jumping (coyote time, jump buffering, variable jump height), a camera that follows smoothly, several handcrafted levels with checkpoints, enemies with patterns, collectibles",
  shooter: "smooth aiming that works with thumbs and a controller, enemy waves with distinct behaviours, power-ups, hit feedback, bosses",
  racing: "a track with corners worth learning, a car that grips and drifts believably, computer racers, laps and a lap timer, a position display, a speed sense (camera FOV, motion lines)",
  sports: "the sport's real rules in a simplified form, a computer opponent, a scoreboard and a match clock",
  fighting: "two fighters with light/heavy attacks, blocking, specials, health bars, rounds and a computer opponent",
  strategy: "clear unit roles, resource economy, a readable map, an enemy that plans, and a win condition",
  sim: "a loop of grow-build-earn with clear goals, upgrades and a calm, readable interface",
  rhythm: "notes timed to a beat made in code, timing windows (perfect/good/miss), combo and score",
  runner: "automatic running with swipe or tap lanes/jumps, obstacles that ramp up, coins, distance score",
  highend: "the most polished 3D the phone can run: physically based materials, good lighting and shadows from one key light, fog and post effects, a smooth third- or first-person camera, controller support, 60 frames a second by keeping draw calls low",
  adventure: "a strong opening, clear objectives, exploration, puzzles, characters who talk, and rising stakes",
};
export function craftNote(intent) { const c = intent && GENRE_CRAFT[intent.kind]; return c ? " WHAT A GREAT " + String(intent.kind).toUpperCase() + " GAME NEEDS: " + c + "." : ""; }
