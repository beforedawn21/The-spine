// ════════════════════════════════════════════════════════════════════════════
//  THE SPINE · LIVE VOICE IN A ROOM (batch 14)
//  People visiting a world together (or playing adventure co-op) can talk.
//  The world itself runs in a locked-down frame that browsers never let near a
//  microphone, so the voice lives here, in The Spine: the frame only says
//  "start", "stop", "who's here". Voices go phone to phone (WebRTC); the room
//  only carries the short hand-shake. Free STUN only - no relay server - so a
//  few strict mobile networks can't connect; everyone else talks directly.
// ════════════════════════════════════════════════════════════════════════════
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
export const VOICE_TYPES = /^(rtc|voice-on|voice-off|voice-here)$/;

export function createVoice({ me, send, onChange }) {
  const V = { on: false, stream: null, pcs: {}, audios: {}, me, muted: false };
  const changed = () => { try { onChange && onChange(V); } catch (e) {} };
  const drop = (id) => { const pc = V.pcs[id]; if (pc) { try { pc.close(); } catch (e) {} delete V.pcs[id]; } const a = V.audios[id]; if (a) { try { a.srcObject = null; a.remove(); } catch (e) {} delete V.audios[id]; } changed(); };
  const make = (id) => {
    drop(id); const pc = new RTCPeerConnection({ iceServers: ICE }); V.pcs[id] = pc;
    if (V.stream) V.stream.getAudioTracks().forEach((t) => pc.addTrack(t, V.stream)); else pc.addTransceiver("audio", { direction: "recvonly" });
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: "rtc", id: V.me, to: id, ice: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => {
      let a = V.audios[id];
      if (!a) { a = document.createElement("audio"); a.autoplay = true; a.setAttribute("playsinline", ""); a.dataset.voicePeer = id; a.style.display = "none"; document.body.appendChild(a); V.audios[id] = a; }
      a.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]); const pl = a.play(); if (pl && pl.catch) pl.catch(() => {}); changed();
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" && V.pcs[id] === pc) { drop(id); return; } changed(); }; // a phone that vanished without a goodbye
    return pc;
  };
  const offer = (id) => { const pc = make(id); pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => send({ t: "rtc", id: V.me, to: id, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription })).catch(() => {}); };
  // exactly one side of each pair makes the offer: the smaller id
  V.link = (id) => { if (!id || id === V.me) return; if (V.me < id) offer(id); else make(id); };
  V.drop = drop;
  V.onMsg = (m) => {
    if (!m || m.id === V.me) return false;
    if (m.t === "voice-on") { V.link(m.id); if (V.on) send({ t: "voice-here", id: V.me, to: m.id }); return true; }
    if (m.t === "voice-here") { if (m.to === V.me && !V.pcs[m.id]) V.link(m.id); return true; }
    if (m.t === "voice-off") { drop(m.id); if (V.on && !m.gone) V.link(m.id); return true; } // gone = they left the room: just hang up
    if (m.t !== "rtc" || m.to !== V.me) return false;
    let pc = V.pcs[m.id];
    if (m.sdp) {
      if (m.sdp.type === "offer") {
        if (!pc || pc.signalingState !== "stable" || pc.remoteDescription) pc = make(m.id);
        pc.setRemoteDescription(m.sdp).then(() => pc.createAnswer()).then((a) => pc.setLocalDescription(a))
          .then(() => send({ t: "rtc", id: V.me, to: m.id, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription })).catch(() => {});
      } else if (pc) pc.setRemoteDescription(m.sdp).catch(() => {});
    } else if (m.ice && pc) pc.addIceCandidate(m.ice).catch(() => {});
    return true;
  };
  V.start = async (peers) => {
    if (V.on) return { on: true };
    try { V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return { on: false, error: "The microphone isn't available." }; }
    V.on = true; Object.keys(V.pcs).forEach(drop); (peers || []).forEach((id) => V.link(id)); send({ t: "voice-on", id: V.me }); changed(); return { on: true };
  };
  V.stop = (quiet, gone) => { if (V.stream) V.stream.getTracks().forEach((t) => t.stop()); V.stream = null; const was = V.on; V.on = false; Object.keys(V.pcs).forEach(drop); if ((was || gone) && !quiet) send(gone ? { t: "voice-off", id: V.me, gone: true } : { t: "voice-off", id: V.me }); changed(); };
  V.end = () => { V.stop(false, true); }; // leaving the room: tell the others to hang up, not to re-dial
  V.mute = (m) => { if (V.stream) V.stream.getAudioTracks().forEach((t) => { t.enabled = !m; }); V.muted = !!m; changed(); };
  V.live = () => Object.keys(V.pcs).filter((k) => V.pcs[k].connectionState === "connected").length;
  V.status = () => ({ on: V.on, live: V.live(), muted: V.muted, hearing: Object.keys(V.audios).length });
  return V;
}
