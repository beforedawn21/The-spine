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

// Phaser 4 (2D engine) - still ships a UMD build that defines window.Phaser, so a straight copy.
copy("node_modules/phaser/dist/phaser.min.js", "public/phaser.min.js");

// Three.js: from r150 onward there is NO three.min.js - the UMD build was removed and the library
// ships as ES modules only. Everything here loads three with a plain <script> tag inside sandboxed
// iframes, where ES modules are awkward, so we BUILD our own classic-script bundle at deploy time.
// If the build step is unavailable for any reason we leave the committed public/three.min.js alone
// rather than overwriting a working engine with nothing.
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
try {
  if (existsSync("node_modules/three/build/three.module.js")) {
    writeFileSync(".three-entry.js", 'export * from "three";\n');
    execSync("npx esbuild .three-entry.js --bundle --format=iife --global-name=THREE --minify --outfile=public/three.min.js", { stdio: "inherit" });
    try { unlinkSync(".three-entry.js"); } catch (e) {}
    console.log("[copy-engines] built public/three.min.js as a classic script");
  } else if (existsSync("node_modules/three/build/three.min.js")) {
    // older three that still ships UMD
    copy("node_modules/three/build/three.min.js", "public/three.min.js");
  } else {
    console.warn("[copy-engines] three not found - keeping the committed public/three.min.js");
  }
} catch (e) {
  console.warn("[copy-engines] three build failed, keeping the committed file:", e.message);
}

console.log("[copy-engines] done");
