// Runs during the Vercel build (before vite build).
// Copies the game engine files from node_modules into /public so games can load them
// from the site's own domain (e.g. thespine.cloud/phaser.min.js) - no external CDN needed.
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

function copy(from, to) {
  try {
    if (!existsSync(from)) {
      console.warn("[copy-engines] source missing:", from);
      return;
    }
    const dir = dirname(to);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    copyFileSync(from, to);
    console.log("[copy-engines] copied:", to);
  } catch (e) {
    console.warn("[copy-engines] failed:", from, "->", to, e.message);
  }
}

// Phaser 3 (2D engine) - UMD build that defines window.Phaser
copy("node_modules/phaser/dist/phaser.min.js", "public/phaser.min.js");
// Three.js r149 (3D engine) - UMD build that defines window.THREE
copy("node_modules/three/build/three.min.js", "public/three.min.js");

console.log("[copy-engines] done");
