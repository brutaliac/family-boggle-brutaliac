/* Room voice is opt-in. No microphone access until Join is clicked. */
'use strict';
window.renderVoiceMic = function (button, muted) {
  button.setAttribute('aria-pressed', String(muted));
  button.setAttribute('aria-label', muted ? 'Unmute microphone' : 'Mute microphone');
  button.title = muted ? 'Unmute microphone' : 'Mute microphone';
  if (muted) button.setAttribute('data-speaking', 'false');
};
// Analyse locally without connecting to speakers or retaining microphone samples.
window.createVoiceActivityMonitor = function (stream, onActivity) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return () => {};
  let context, source, timer;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    try { source?.disconnect(); } catch {}
    if (context) { try { Promise.resolve(context.close()).catch(() => {}); } catch {} }
    onActivity(false);
  };
  try {
    context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let lastActive = 0;
    const sample = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      if (rms > .025) lastActive = Date.now();
      onActivity(lastActive > 0 && Date.now() - lastActive < 240);
    };
    Promise.resolve(context.resume()).catch(() => {});
    timer = setInterval(sample, 80);
    return stop;
  } catch { stop(); return () => {}; }
};
// Names are the current room identity; use consistent initials until profile images exist.
// One placeholder style keeps a person's preview consistent across both menus and the stack.
window.createProfilePreview = function (person) {
  const avatar = document.createElement('span');
  const name = String(person.name || 'Player');
  const palette = ['#c9e2d4', '#e6d3ef', '#f2dbb5', '#c6dced', '#eed0cc', '#d7ddba'];
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  avatar.className = 'profile-preview';
  avatar.textContent = name.trim().split(/\s+/u).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toUpperCase();
  avatar.setAttribute('style', '--avatar-bg:' + palette[hash % palette.length]);
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
};
window.renderVoiceAvatars = function (people) {
  const empty = people.length === 0;
  const members = document.getElementById('voice-members');
  const placeholder = document.getElementById('voice-empty');
  if (members) { members.hidden = empty; if (empty) members.open = false; }
  if (placeholder) placeholder.hidden = !empty;
  const stack = document.getElementById('voice-avatars');
  stack.replaceChildren();
  stack.setAttribute('style', '--voice-columns:' + Math.max(1, Math.min(5, people.length)));
  for (const person of people) {
    const avatar = window.createProfilePreview(person);
    const name = String(person.name || 'Player');
    avatar.className = 'voice-avatar' + (person.muted ? ' is-muted' : '');
    avatar.title = name + (person.muted ? ' · muted' : ' · mic on');
    stack.append(avatar);
  }
  document.getElementById('voice-count').textContent = String(people.length);
  document.getElementById('voice-members-toggle').setAttribute('aria-label', people.length + (people.length === 1 ? ' person' : ' people') + ' in voice. Show participants.');
};
window.createVoicePersonRow = function (person, state, self = false) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'voice-person-name';
  name.textContent = String(person.name || 'Player') + (self ? ' (you)' : '');
  item.append(window.createProfilePreview(person), name);
  const icon = (label, kind, paths) => {
    const node = document.createElement('span');
    node.className = 'voice-person-status ' + kind;
    node.title = label;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
    node.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    item.append(node);
  };
  if (state === 'connected') icon('Connected', 'is-connected', '<path d="M3 8.5a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15.5a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>');
  else if (state === 'in voice') icon('In voice', '', '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>');
  else if (state.startsWith('connection failed')) icon('Connection failed. Leave and rejoin to retry.', 'is-failed', '<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17v.1"/>');
  else icon('Connecting', 'is-pending', '<circle cx="12" cy="12" r="8" stroke-dasharray="30 20"/>');
  icon(person.muted ? 'Microphone muted' : 'Microphone on', person.muted ? 'is-muted' : 'is-connected', '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>' + (person.muted ? '<path d="M3 3l18 18" stroke-width="2.5"/>' : ''));
  return item;
};
window.createRoomVoice = function ({ send, getState }) {
  const $ = id => document.getElementById(id);
  const peers = new Map();
  let roster = [], stream = null, session = null, iceServers = [], muted = false;
  let busy = false, generation = 0, notice = '', joinTimer = null;
  let stopActivity = () => {};

  function render() {
    const joined = !!session;
    $('voice-join').hidden = joined;
    $('voice-join').disabled = busy;
    $('voice-join').textContent = busy ? 'Joining…' : 'Join Voice';
    $('voice-mute').hidden = !joined;
    window.renderVoiceMic($('voice-mute'), muted);
    if (!joined) $('voice-mute').setAttribute('data-speaking', 'false');
    $('voice-leave').hidden = !joined && !busy;
    $('voice-status').textContent = notice;
    $('voice-status').hidden = !$('voice-status').textContent;
    const list = $('voice-people');
    list.replaceChildren();
    for (const p of roster) {
      const self = p.id === getState().meId;
      const peer = peers.get(p.id);
      const state = self ? 'connected' : !joined ? 'in voice' : peer?.pc.connectionState === 'connected' ? 'connected' :
        peer?.pc.connectionState === 'failed' ? 'connection failed — leave and rejoin' : 'connecting';
      list.append(window.createVoicePersonRow(p, state, self));
    }
    window.renderVoiceAvatars(roster);
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
    stopActivity(); stopActivity = () => {};
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
      stopActivity = window.createVoiceActivityMonitor(mic, speaking => {
        $('voice-mute').setAttribute('data-speaking', String(!!session && !muted && speaking));
      });
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
