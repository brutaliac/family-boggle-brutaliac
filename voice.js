/* Room voice is opt-in. No microphone access until Join is clicked. */
'use strict';
window.createRoomVoice = function ({ send, getState }) {
  const $ = id => document.getElementById(id);
  const peers = new Map();
  let roster = [], stream = null, session = null, iceServers = [], muted = false;
  let busy = false, generation = 0, notice = '', joinTimer = null;

  function render() {
    const joined = !!session;
    $('voice-join').hidden = joined;
    $('voice-join').disabled = busy;
    $('voice-join').textContent = busy ? 'Joining…' : 'Join voice';
    $('voice-mute').hidden = !joined;
    $('voice-mute').textContent = muted ? 'Unmute mic' : 'Mute mic';
    $('voice-mute').setAttribute('aria-pressed', String(muted));
    $('voice-leave').hidden = !joined && !busy;
    $('voice-status').textContent = notice || (joined ? (muted ? 'Your microphone is muted.' : 'Your microphone is on.') :
      'Talk with people in this room. Your mic stays off until you join.');
    const list = $('voice-people');
    list.replaceChildren();
    for (const p of roster) {
      const item = document.createElement('li');
      const self = p.id === getState().meId;
      const peer = peers.get(p.id);
      const state = self ? 'you' : !joined ? 'in voice' : peer?.pc.connectionState === 'connected' ? 'connected' :
        peer?.pc.connectionState === 'failed' ? 'connection failed — leave and rejoin' : 'connecting';
      item.textContent = p.name + ' · ' + state + (p.muted ? ' · mic muted' : '');
      list.append(item);
    }
    $('voice-count').textContent = roster.length ? roster.length + '/8 in voice' : 'No one in voice yet';
    $('voice-resume').hidden = ![...peers.values()].some(p => p.blocked);
  }

  function closePeer(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    clearTimeout(p.disconnectTimer);
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    p.pc.close();
    p.audio.pause(); p.audio.srcObject = null; p.audio.remove();
  }
  function leave(message = '', notify = true) {
    generation++; clearTimeout(joinTimer);
    if (notify && (stream || session)) send({ t: 'voice-leave' });
    session = null; busy = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    for (const id of [...peers.keys()]) closePeer(id);
    notice = message; render();
  }
  async function play(p) {
    try { await p.audio.play(); p.blocked = false; }
    catch { if (peers.get(p.id) === p) p.blocked = true; }
    render();
  }
  function signal(p, data) {
    if (peers.get(p.id) !== p || !session) return;
    send({ t: 'voice-signal', to: p.id, session, toSession: p.session, ...data });
  }
  function enqueue(p, task) {
    p.queue = p.queue.then(async () => {
      if (peers.get(p.id) === p && session) await task();
    }).catch(() => {
      if (peers.get(p.id) === p) {
        notice = 'A voice connection failed. Leave and rejoin to retry.'; render();
      }
    });
  }
  function makePeer(remote) {
    const pc = new RTCPeerConnection({ iceServers });
    const audio = document.createElement('audio');
    audio.autoplay = true; audio.setAttribute('playsinline', '');
    $('voice-audio').append(audio);
    const p = { id: remote.id, session: remote.session, pc, audio, candidates: [], queue: Promise.resolve(), blocked: false };
    peers.set(p.id, p);
    stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => { if (e.candidate) signal(p, { candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      play(p);
    };
    pc.onconnectionstatechange = () => {
      clearTimeout(p.disconnectTimer);
      if (pc.connectionState === 'disconnected') {
        p.disconnectTimer = setTimeout(() => {
          if (peers.get(p.id) === p && pc.connectionState === 'disconnected') {
            notice = 'A voice connection dropped. Leave and rejoin to retry.'; render();
          }
        }, 10000);
      }
      render();
    };
    // Exactly one offerer per pair avoids simultaneous-offer collisions.
    if (getState().meId < p.id) enqueue(p, async () => {
      await pc.setLocalDescription(await pc.createOffer());
      signal(p, { description: pc.localDescription.toJSON() });
    });
    return p;
  }
  function reconcile() {
    if (!session || !stream) return;
    const others = roster.filter(p => p.id !== getState().meId);
    for (const [id, p] of peers) if (!others.some(q => q.id === id && q.session === p.session)) closePeer(id);
    for (const p of others) if (!peers.has(p.id)) makePeer(p);
  }
  async function join() {
    if (busy || session) return;
    const state = getState();
    if (!state.connected) { notice = 'Reconnect to the game before joining voice.'; render(); return; }
    if (!state.name.trim()) { notice = 'Enter your name before joining voice.'; render(); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      notice = 'Voice needs HTTPS and a browser that supports microphone access.'; render(); return;
    }
    busy = true; notice = ''; render();
    const attempt = ++generation;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (attempt !== generation) { mic.getTracks().forEach(t => t.stop()); return; }
      if (!getState().connected) { mic.getTracks().forEach(t => t.stop()); leave('Connection lost. Join voice again once connected.'); return; }
      stream = mic; muted = false;
      mic.getAudioTracks().forEach(t => { t.onended = () => leave('Microphone disconnected. Join again to retry.'); });
      send({ t: 'voice-join', muted });
      joinTimer = setTimeout(() => leave('Could not join voice. Please try again.'), 10000);
    } catch (e) {
      if (attempt !== generation) return;
      leave(e.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser, then join again.' :
        e.name === 'NotFoundError' ? 'No microphone found. Connect one, then join again.' : 'Could not open your microphone. Check your microphone and try again.');
    }
  }
  function message(m) {
    if (m.t === 'voice-roster') {
      roster = Array.isArray(m.peers) ? m.peers : [];
      try { reconcile(); } catch { leave('Could not create the voice connection. Try joining again.'); }
      render();
    } else if (m.t === 'voice-ready') {
      if (!stream || !busy) return;
      clearTimeout(joinTimer); session = m.session; iceServers = m.iceServers; busy = false;
      // The server sends a fresh roster immediately after this acknowledgment.
      render();
    } else if (m.t === 'voice-error') {
      leave(m.message);
    } else if (m.t === 'voice-signal' && session && m.toSession === session) {
      const p = peers.get(m.from);
      if (!p || p.session !== m.session) return;
      enqueue(p, async () => {
        if (m.description) {
          await p.pc.setRemoteDescription(m.description);
          for (const c of p.candidates.splice(0)) await p.pc.addIceCandidate(c);
          if (m.description.type === 'offer') {
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            signal(p, { description: p.pc.localDescription.toJSON() });
          }
        } else if (m.candidate) {
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.candidate);
          else if (p.candidates.length < 100) p.candidates.push(m.candidate);
        }
      });
    }
  }
  $('voice-join').addEventListener('click', join);
  $('voice-leave').addEventListener('click', () => leave());
  $('voice-mute').addEventListener('click', () => {
    if (!stream || !session) return;
    muted = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    send({ t: 'voice-mute', muted }); notice = ''; render();
  });
  $('voice-resume').addEventListener('click', () => { for (const p of peers.values()) play(p); });
  window.addEventListener('pagehide', () => leave('', true));
  render();
  return { message, disconnected() { const active = !!stream || busy; roster = []; leave(active ? 'Connection lost. Join voice again once connected.' : '', false); } };
};
