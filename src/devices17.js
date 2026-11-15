// ============================================================================
//  DEVICES (batch 17) - things The Spine can now reach, free and with no key:
//  the TV (AirPlay / Chromecast), Bluetooth heart-rate straps, receipt and
//  label printers (Bluetooth or USB), USB/HID controllers and button boxes,
//  screen recording on a computer, and a colour picker on a computer.
//  A leg asks; The Spine shows the person what it wants and why, and only
//  connects when they tap Connect (browsers require that tap anyway).
//  iPhone's browser blocks Bluetooth, USB and HID for every website - where a
//  device can't be reached, the person is told plainly.
// ============================================================================

export const DEVICE_INFO = {
  heart: { title: "Heart-rate strap", why: "to show your heart rate live", supported: () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice) },
  printer: { title: "Receipt or label printer", why: "to print on your Bluetooth or USB receipt/label printer", supported: () => !!((navigator.bluetooth && navigator.bluetooth.requestDevice) || (navigator.serial && navigator.serial.requestPort)) },
  hid: { title: "USB controller or button box", why: "to use your controller's buttons and knobs", supported: () => !!(navigator.hid && navigator.hid.requestDevice) },
  screen: { title: "Screen recording", why: "to record your screen", supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) },
  color: { title: "Colour picker", why: "to pick a colour from anywhere on your screen", supported: () => typeof window.EyeDropper === "function" },
};
export function notHere(kind) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const t = (DEVICE_INFO[kind] || {}).title || "This device";
  return ios ? t + " can't connect from an iPhone or iPad - Apple's browser blocks it for every website. It works in Chrome on Android or on a computer." : t + " isn't available in this browser - try Chrome or Edge on a computer or Android phone.";
}

// ── TV: AirPlay on Apple, Chromecast / Remote Playback in Chrome ──
export function canCast(video) { return !!(video && (video.webkitShowPlaybackTargetPicker || (video.remote && video.remote.prompt))); }
export async function castVideo(video) {
  if (!video) return "No video to send.";
  try { if (video.webkitShowPlaybackTargetPicker) { video.webkitShowPlaybackTargetPicker(); return ""; } } catch (e) {}
  try { if (video.remote && video.remote.prompt) { await video.remote.prompt(); return ""; } } catch (e) { if (e && e.name === "NotFoundError") return "No TV or speaker found on your Wi-Fi."; if (e && e.name !== "AbortError") return "Couldn't reach a TV: " + (e.message || e.name); return ""; }
  return "This browser can't send video to a TV. On iPhone use AirPlay from Safari; on Android or a computer use Chrome.";
}

// ── HEART RATE (standard Bluetooth Heart Rate service) ──
export function parseHeartRate(dv) { const flags = dv.getUint8(0); return flags & 1 ? dv.getUint16(1, true) : dv.getUint8(1); }
export async function connectHeart(onBpm) {
  const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
  const srv = await (await dev.gatt.connect()).getPrimaryService("heart_rate");
  const ch = await srv.getCharacteristic("heart_rate_measurement"); await ch.startNotifications();
  ch.addEventListener("characteristicvaluechanged", (e) => { try { onBpm(parseHeartRate(e.target.value)); } catch (err) {} });
  return { name: dev.name || "Heart-rate strap", stop: () => { try { ch.stopNotifications(); dev.gatt.disconnect(); } catch (e) {} } };
}

// ── RECEIPT / LABEL PRINTERS (ESC/POS) ──
const ESC = 0x1b, GS = 0x1d;
export function escpos(lines, o) {
  const enc = new TextEncoder(); const out = [ESC, 0x40]; // init
  for (const l of lines || []) {
    const it = typeof l === "string" ? { text: l } : l || {};
    out.push(ESC, 0x61, it.align === "center" ? 1 : it.align === "right" ? 2 : 0); // align
    out.push(ESC, 0x45, it.bold ? 1 : 0); // bold
    out.push(GS, 0x21, it.big ? 0x11 : 0x00); // double size
    for (const b of enc.encode(String(it.text || "").replace(/[^\x20-\x7e\n]/g, "?"))) out.push(b);
    out.push(0x0a);
  }
  out.push(0x0a, 0x0a, 0x0a); if (!o || o.cut !== false) out.push(GS, 0x56, 0x42, 0x00); // feed and cut
  return new Uint8Array(out);
}
const BLE_PRINTER = [["000018f0-0000-1000-8000-00805f9b34fb", "00002af1-0000-1000-8000-00805f9b34fb"], ["e7810a71-73ae-499d-8c15-faa9aef0c3f2", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f"], ["49535343-fe7d-4ae5-8fa9-9fafd205e455", "49535343-8841-43f4-a8d4-ecbe34729bb3"]];
let printerConn = null;
export async function connectPrinter(prefer) {
  if (printerConn) return printerConn;
  if ((prefer === "usb" || !navigator.bluetooth) && navigator.serial) {
    const port = await navigator.serial.requestPort(); await port.open({ baudRate: 9600 }); const w = port.writable.getWriter();
    printerConn = { name: "USB printer", write: async (bytes) => { await w.write(bytes); } }; return printerConn;
  }
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_PRINTER.map((x) => x[0]) });
  const gatt = await dev.gatt.connect(); let ch = null;
  for (const [s, c] of BLE_PRINTER) { try { ch = await (await gatt.getPrimaryService(s)).getCharacteristic(c); break; } catch (e) {} }
  if (!ch) throw new Error("That printer didn't offer a print channel The Spine knows.");
  printerConn = { name: dev.name || "Bluetooth printer", write: async (bytes) => { for (let i = 0; i < bytes.length; i += 180) { const part = bytes.slice(i, i + 180); if (ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part); } } };
  return printerConn;
}
export async function printReceipt(lines, o) { const p = await connectPrinter(o && o.via); await p.write(escpos(lines, o)); return { ok: true, printer: p.name }; }

// ── USB / HID controllers and button boxes ──
export async function connectHid(onReport) {
  const [dev] = await navigator.hid.requestDevice({ filters: [] }); if (!dev) throw new Error("No device chosen.");
  if (!dev.opened) await dev.open();
  dev.addEventListener("inputreport", (e) => { try { onReport({ reportId: e.reportId, data: Array.from(new Uint8Array(e.data.buffer)) }); } catch (err) {} });
  return { name: dev.productName || "Controller", stop: () => { try { dev.close(); } catch (e) {} } };
}

// ── SCREEN RECORDING (computer) ──
export async function recordScreen(seconds, onStop) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  const type = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "";
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" }); res(blob); try { onStop && onStop(blob); } catch (e) {} }; });
  stream.getVideoTracks()[0].addEventListener("ended", () => { try { rec.state !== "inactive" && rec.stop(); } catch (e) {} });
  rec.start(1000); if (seconds) setTimeout(() => { try { rec.state !== "inactive" && rec.stop(); } catch (e) {} }, Math.min(600, seconds) * 1000);
  return { stop: () => { try { rec.state !== "inactive" && rec.stop(); } catch (e) {} }, done };
}

// ── COLOUR PICKER (computer) ──
export async function pickColor() { const r = await new window.EyeDropper().open(); return r && r.sRGBHex; }
