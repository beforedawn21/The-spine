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

// cannon-es: pure JavaScript physics, no WASM, no async init. Bundled as a plain script that
// attaches to window.CANNON so generated code can simply use it.
try {
  if (existsSync("node_modules/cannon-es/dist/cannon-es.js")) {
    writeFileSync(".cannon-entry.js", 'import * as CANNON from "cannon-es";\nif (typeof window !== "undefined") window.CANNON = CANNON;\n');
    execSync("npx esbuild .cannon-entry.js --bundle --format=iife --minify --outfile=public/cannon.min.js --legal-comments=none", { stdio: "inherit" });
    try { unlinkSync(".cannon-entry.js"); } catch (e) {}
    console.log("[copy-engines] built public/cannon.min.js");
  } else {
    console.warn("[copy-engines] cannon-es not found - keeping the committed public/cannon.min.js");
  }
} catch (e) {
  console.warn("[copy-engines] cannon build failed, keeping the committed file:", e.message);
}

// three.js add-ons (GLTFLoader, RoomEnvironment, OrbitControls). These live in three/examples,
// are ES modules, and import bare "three" - so they are bundled with that one specifier mapped
// to the already-loaded global. DRACOLoader is deliberately excluded: it resolves paths from
// import.meta.url at load time, which is empty in a classic script, and throws.
// The committed public/three-addons.js is left alone if this cannot run.
console.log("[copy-engines] note: public/three-addons.js is committed pre-built");

console.log("[copy-engines] done");
