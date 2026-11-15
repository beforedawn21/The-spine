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
//   batch 15: the ONNX runtime itself as one file, for the natural voice (loaded from here, so the
//   app bundle doesn't carry a second 21 MB copy of the engine)
copy("node_modules/ort122/dist/ort.min.mjs", "public/ai/ort/ort.min.mjs");
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

// ── BATCH 15 · PICTURE SAFETY CHECK (NSFWJS, MIT). Runs on the phone before something with
// pictures in it goes on the Market. The npm package carries the model wrapped as JavaScript;
// here it is unwrapped into the ordinary model.json + weights file the engine loads by address.
import { createRequire } from "module";
try {
  const req = createRequire(import.meta.url);
  const dir = "node_modules/nsfwjs/dist/models/mobilenet_v2/";
  if (existsSync(dir + "model.min.js")) {
    const model = req("./" + dir + "model.min.js");
    if (!existsSync("public/ai/nsfw/mobilenet_v2")) mkdirSync("public/ai/nsfw/mobilenet_v2", { recursive: true });
    for (const g of model.weightsManifest || []) for (const p of g.paths) {
      const b64 = req("./" + dir + p + ".min.js");
      writeFileSync("public/ai/nsfw/mobilenet_v2/" + p, Buffer.from(String(b64), "base64"));
    }
    writeFileSync("public/ai/nsfw/mobilenet_v2/model.json", JSON.stringify(model));
    copy("node_modules/nsfwjs/dist/browser/nsfwjs.min.js", "public/ai/nsfw/nsfwjs.min.js");   // TensorFlow.js is inside it
    console.log("[copy-engines] unpacked public/ai/nsfw (picture safety check)");
  } else console.warn("[copy-engines] nsfwjs not found - the picture check stays off");
} catch (e) { console.warn("[copy-engines] picture check not unpacked:", e.message); }

// ── BATCH 15 · MORE ON-PHONE HELPERS, all from npm at build time, every file under 25 MB.
//   Hands (MediaPipe Hands, Google, Apache-2.0): play a game or move a world with your hand.
//   Person cut-out (MediaPipe Selfie Segmentation, Apache-2.0): lift a person out of a photo.
for (const f of ["hands.js", "hands.binarypb", "hands_solution_packed_assets.data", "hands_solution_packed_assets_loader.js",
  "hands_solution_simd_wasm_bin.js", "hands_solution_simd_wasm_bin.wasm", "hands_solution_simd_wasm_bin.data",
  "hands_solution_wasm_bin.js", "hands_solution_wasm_bin.wasm", "hand_landmark_lite.tflite"])   // the lighter model only (modelComplexity 0)
  copy("node_modules/@mediapipe/hands/" + f, "public/ai/hands/" + f);
for (const f of ["selfie_segmentation.js", "selfie_segmentation.binarypb", "selfie_segmentation.tflite", "selfie_segmentation_landscape.tflite",
  "selfie_segmentation_solution_simd_wasm_bin.js", "selfie_segmentation_solution_simd_wasm_bin.wasm", "selfie_segmentation_solution_simd_wasm_bin.data",
  "selfie_segmentation_solution_wasm_bin.js", "selfie_segmentation_solution_wasm_bin.wasm"])
  copy("node_modules/@mediapipe/selfie_segmentation/" + f, "public/ai/selfie/" + f);
//   Memory by meaning (all-MiniLM-L6-v2, Apache-2.0, run by lat.md's small engine, MIT - Vercel Labs).
//   The engine's glue is CommonJS; it is wrapped here as a plain script that sets window.SpineMiniLM.
try {
  const eg = "node_modules/@lat.md/embed/dist/engine.cjs";
  if (existsSync(eg)) {
    const { readFileSync } = await import("fs");
    if (!existsSync("public/ai/minilm")) mkdirSync("public/ai/minilm", { recursive: true });
    writeFileSync("public/ai/minilm/engine.js", "(function(){var exports={};var module={exports:exports};\n" + readFileSync(eg, "utf8") + "\n;window.SpineMiniLM=exports;})();\n");
    copy("node_modules/@lat.md/embed/dist/engine_bg.wasm", "public/ai/minilm/engine_bg.wasm");
    for (const f of ["model.fp16.safetensors", "tokenizer.json", "config.json"]) copy("node_modules/@lat.md/embed-minilm-fp16/model/" + f, "public/ai/minilm/" + f);
    console.log("[copy-engines] built public/ai/minilm (memory by meaning)");
  } else console.warn("[copy-engines] @lat.md/embed not found - memory by meaning stays off");
} catch (e) { console.warn("[copy-engines] memory by meaning not built:", e.message); }
//   Natural voice (Kokoro-82M) is NOT copied: at 92 MB it would be most of the site. Phones fetch it
//   once from the free jsDelivr copy of the npm package, check its fingerprint, and keep it.

// ── BATCH 16 (round 5): more on-phone engines, served from The Spine itself ──────────────────
import { readdirSync } from "fs";
// Harper (grammar and spelling, Apache-2.0): the 20 MB engine and its loaders
try {
  const hd = "node_modules/harper.js/dist/";
  for (const f of readdirSync(hd)) if (/^(index\.js|binary\.js|BinaryModule-[\w-]+\.js|harper_wasm_bg\.wasm)$/.test(f)) copy(hd + f, "public/ai/harper/" + f);
  copy("node_modules/harper.js/LICENSE", "public/ai/harper/LICENSE");
} catch (e) { console.warn("[copy-engines] harper missing:", e.message); }
// KaTeX (maths, MIT): the style sheet and its fonts (the script itself is bundled by Vite)
copy("node_modules/katex/dist/katex.min.css", "public/ai/katex/katex.min.css");
try { for (const f of readdirSync("node_modules/katex/dist/fonts")) if (/\.woff2$/.test(f)) copy("node_modules/katex/dist/fonts/" + f, "public/ai/katex/fonts/" + f); } catch (e) { console.warn("[copy-engines] katex fonts missing"); }
// Real instruments for the Studio: every third note (C, Eb, Gb, A) - the rest are tuned from the nearest
{
  const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]; const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
  const span = (lo, hi) => { const o = []; for (let m = lo; m <= hi; m++) if ([0, 3, 6, 9].includes(m % 12)) o.push(nm(m)); return o; };
  const FL = "node_modules/soundfont-for-samplers/FluidR3_GM/";
  const SET = { guitar: ["acoustic_guitar_nylon", 40, 84], eguitar: ["electric_guitar_clean", 40, 84], ebass: ["electric_bass_finger", 28, 67], strings: ["string_ensemble_1", 36, 96],
    cello: ["cello", 36, 76], flute: ["flute", 60, 96], trumpet: ["trumpet", 52, 84], marimba: ["marimba", 48, 96], epiano: ["electric_piano_1", 36, 96] };
  for (const [k, [dir, lo, hi]] of Object.entries(SET)) for (const n of span(lo, hi)) copy(FL + dir + "-mp3/" + n + ".mp3", "public/ai/instruments/" + k + "/" + n + ".mp3");
  for (const n of ["C2", "D2", "Eb2", "Gb2", "Bb2", "A2", "Db2", "Bb4"]) copy(FL + "standard-mp3/" + n + ".mp3", "public/ai/instruments/drums/" + n + ".mp3");
  // Salamander Grand Piano (CC BY 3.0, Alexander Holm): its files are named with sharps (D#4v8.mp3)
  const SAL = "node_modules/@audio-samples/piano-mp3-velocity8/audio/"; const sharp = { Eb: "D#", Gb: "F#" };
  for (const n of span(21, 108)) { const m = n.match(/^([A-G]b?)(\d)$/); copy(SAL + (sharp[m[1]] || m[1]) + m[2] + "v8.mp3", "public/ai/instruments/piano/" + n + ".mp3"); }
}
// MediaPipe Pose (body tracking) and Face Mesh (face filters), Apache-2.0 - the lighter pose model only
for (const f of ["pose.js", "pose_web.binarypb", "pose_solution_packed_assets.data", "pose_solution_packed_assets_loader.js", "pose_solution_simd_wasm_bin.js", "pose_solution_simd_wasm_bin.wasm",
  "pose_solution_simd_wasm_bin.data", "pose_solution_wasm_bin.js", "pose_solution_wasm_bin.wasm", "pose_landmark_lite.tflite"]) copy("node_modules/@mediapipe/pose/" + f, "public/ai/pose/" + f);
for (const f of ["face_mesh.js", "face_mesh.binarypb", "face_mesh_solution_packed_assets.data", "face_mesh_solution_packed_assets_loader.js", "face_mesh_solution_simd_wasm_bin.js",
  "face_mesh_solution_simd_wasm_bin.wasm", "face_mesh_solution_simd_wasm_bin.data", "face_mesh_solution_wasm_bin.js", "face_mesh_solution_wasm_bin.wasm"]) copy("node_modules/@mediapipe/face_mesh/" + f, "public/ai/facemesh/" + f);
// <model-viewer> (3D and "see it in your room", Apache-2.0) and 3Dmol.js (molecules, BSD-3)
copy("node_modules/@google/model-viewer/dist/model-viewer.min.js", "public/ai/model-viewer/model-viewer.min.js");
copy("node_modules/3dmol/build/3Dmol-min.js", "public/ai/3dmol/3Dmol-min.js");
console.log("[copy-engines] batch 16 engines done");
// BATCH 17 graphics: PixiJS 8 (MIT) for richer 2D, lottie-web (MIT) for animations, and the ESRGAN
// upscaler models (MIT, UpscalerJS) that sharpen a picture on the phone.
copy("node_modules/pixi.js/dist/pixi.min.js", "public/ai/pixi/pixi.min.js");
copy("node_modules/lottie-web/build/player/lottie.min.js", "public/ai/lottie/lottie.min.js");
for (const s of ["x2", "x4"]) for (const f of ["model.json", "group1-shard1of1.bin"]) copy("node_modules/@upscalerjs/esrgan-slim/models/" + s + "/" + f, "public/ai/upscale/" + s + "/" + f);
console.log("[copy-engines] batch 17 engines done");
