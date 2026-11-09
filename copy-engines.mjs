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

// FFmpeg (the film joiner). Loaded from unpkg, the joiner could never start: the library makes a
// background worker from a second file next to itself, and browsers refuse to make a worker from
// another site's file. Served from this site, it works. Copied at build time so nothing this
// large (the engine is about 32MB) is ever uploaded by hand.
copy("node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js", "public/ffmpeg/ffmpeg.js");
copy("node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js", "public/ffmpeg/814.ffmpeg.js");
copy("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js", "public/ffmpeg/ffmpeg-core.js");
copy("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm", "public/ffmpeg/ffmpeg-core.wasm");

// The video engine is FFmpeg, licensed under the GNU GPL. Anyone who serves it must say so and
// point to its source. This notice sits beside the files, at thespine.cloud/ffmpeg/NOTICE.txt.
try {
  mkdirSync("public/ffmpeg", { recursive: true });
  writeFileSync("public/ffmpeg/NOTICE.txt", [
    "The Spine's film joiner and video editor run FFmpeg in the browser, unmodified.",
    "",
    "ffmpeg-core.js / ffmpeg-core.wasm  -  @ffmpeg/core 0.12.10 (FFmpeg compiled to WebAssembly)",
    "  Licence: GNU General Public License, version 2 or later - https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
    "  Source:  https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10  (build scripts and the FFmpeg and library",
    "           versions it is built from)   FFmpeg itself: https://ffmpeg.org/download.html",
    "",
    "ffmpeg.js / 814.ffmpeg.js  -  @ffmpeg/ffmpeg 0.12.15, MIT licence - https://github.com/ffmpegwasm/ffmpeg.wasm",
    "",
    "FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.",
    "",
    "WRITTEN OFFER FOR SOURCE CODE",
    "For at least three years from the last day we distribute this software, Beforedawn will give anyone",
    "who asks a complete machine-readable copy of the corresponding source code for the GPL-licensed parts",
    "above (FFmpeg and the libraries @ffmpeg/core 0.12.10 is built from), including the build scripts, for",
    "a charge no more than our cost of physically performing the distribution - or free, as a download link.",
    "Ask: support@thespine.cloud, subject \"FFmpeg source request\". This offer is valid for anyone in",
    "receipt of this information.",
    "",
  ].join("\n"));
  console.log("[copy-engines] wrote: public/ffmpeg/NOTICE.txt");
} catch (e) { console.warn("[copy-engines] notice not written:", e.message); }

// AR AND SCANS (batch 7): USDZExporter (put a world in your room with the iPhone's own AR viewer),
// GLTFExporter, and PLYLoader (open a 3D scan). Bundled as a classic script that attaches to the
// THREE already on the page - "three" is mapped to that global, never a second copy.
try {
  writeFileSync(".three-ar-entry.js",
    'import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";\n' +
    'import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";\n' +
    'import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";\n' +
    'import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";\n' +
    'const T = window.THREE; if (T) { T.USDZExporter = USDZExporter; T.GLTFExporter = GLTFExporter; T.PLYLoader = PLYLoader; T.SkeletonUtils = SkeletonUtils; }\n');
  writeFileSync(".three-global.cjs", "module.exports = window.THREE;\n");
  const esbuild = await import("esbuild");
  await esbuild.build({ entryPoints: [".three-ar-entry.js"], bundle: true, format: "iife", minify: true, outfile: "public/three-ar.js", legalComments: "none",
    plugins: [{ name: "three-global", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: process.cwd() + "/.three-global.cjs" })); } }] });
  try { unlinkSync(".three-ar-entry.js"); unlinkSync(".three-global.cjs"); } catch (e) {}
  console.log("[copy-engines] built public/three-ar.js");
} catch (e) { console.warn("[copy-engines] AR add-ons not built, keeping the committed file:", e.message); }

// ── BATCH 14 · ON-DEVICE TOOLS. All copied from npm at build time into public/ai/, so nothing
// here is ever uploaded by hand (every file is still under 25 MB). Each one runs on the phone:
// free, private, no key, works offline once loaded.
//   Moonshine tiny (speech to text, English, MIT) + the ONNX runtime it was built against
copy("node_modules/@moonshine-ai/moonshine-js/dist/model/tiny/quantized/encoder_model.onnx", "public/ai/moonshine/model/tiny/quantized/encoder_model.onnx");
copy("node_modules/@moonshine-ai/moonshine-js/dist/model/tiny/quantized/decoder_model_merged.onnx", "public/ai/moonshine/model/tiny/quantized/decoder_model_merged.onnx");
copy("node_modules/ort122/dist/ort-wasm-simd-threaded.jsep.wasm", "public/ai/ort/ort-wasm-simd-threaded.jsep.wasm");
copy("node_modules/ort122/dist/ort-wasm-simd-threaded.jsep.mjs", "public/ai/ort/ort-wasm-simd-threaded.jsep.mjs");
//   Tesseract (read text from a photo of a page, Apache-2.0) + English text data
copy("node_modules/tesseract.js/dist/worker.min.js", "public/ai/tesseract/worker.min.js");
for (const v of ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"]) copy("node_modules/tesseract.js-core/" + v + ".wasm.js", "public/ai/tesseract/" + v + ".wasm.js");
copy("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "public/ai/tesseract/lang/eng.traineddata.gz");
//   Basic Pitch (hum a tune -> notes, Spotify, Apache-2.0)
copy("node_modules/@spotify/basic-pitch/model/model.json", "public/ai/basic-pitch/model.json");
copy("node_modules/@spotify/basic-pitch/model/group1-shard1of1.bin", "public/ai/basic-pitch/group1-shard1of1.bin");
//   Paged.js (print-ready documents: page numbers, contents page, running headers, MIT)
copy("node_modules/pagedjs/dist/paged.polyfill.min.js", "public/ai/paged.polyfill.min.js");
//   Rapier (real physics for worlds and games, Apache-2.0) as a classic script that sets window.RAPIER
try {
  if (existsSync("node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs")) {
    writeFileSync(".rapier-entry.js", 'import RAPIER from "@dimforge/rapier3d-compat";\nif (typeof window !== "undefined") window.RAPIER = RAPIER;\n');
    execSync("npx esbuild .rapier-entry.js --bundle --format=iife --minify --outfile=public/ai/rapier.min.js --legal-comments=none", { stdio: "inherit" });
    try { unlinkSync(".rapier-entry.js"); } catch (e) {}
    console.log("[copy-engines] built public/ai/rapier.min.js");
  } else console.warn("[copy-engines] rapier not found");
} catch (e) { console.warn("[copy-engines] rapier build failed:", e.message); }
