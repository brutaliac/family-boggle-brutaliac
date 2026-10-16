'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(getMic) {
  const elements = new Map();
  const element = () => ({ hidden: false, children: [], handlers: {}, textContent: '',
    addEventListener(k, fn) { this.handlers[k] = fn; }, setAttribute() {},
    replaceChildren() { this.children = []; }, append(x) { this.children.push(x); },
    pause() {}, remove() { this.removed = true; }, async play() {},
  });
  const sent = [], tracks = [];
  const makeMic = () => {
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  const pcs = [];
  class PC {
    constructor() { this.connectionState = 'new'; this.remoteDescription = null; this.candidates = []; pcs.push(this); }
    addTrack() {} close() { this.closed = true; }
    async createOffer() { return { type: 'offer', sdp: 'offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
    async setLocalDescription(d) { this.localDescription = { ...d, toJSON() { return d; } }; }
    async setRemoteDescription(d) { this.remoteDescription = d; }
    async addIceCandidate(c) { this.candidates.push(c); }
  }
  const state = { meId: 'alice', connected: true, name: 'Alice' };
  const ctx = { window: { isSecureContext: true, RTCPeerConnection: PC, addEventListener() {} },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    navigator: { mediaDevices: { getUserMedia: () => getMic ? getMic(makeMic) : Promise.resolve(makeMic()) } },
    RTCPeerConnection: PC, setTimeout, clearTimeout, MediaStream: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'voice.js'), 'utf8'), ctx);
  const voice = ctx.window.createRoomVoice({ send: m => sent.push(m), getState: () => state });
  return { voice, sent, tracks, pcs, elements, state, click: id => elements.get(id).handlers.click() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('browser voice joins only on click, queues ICE, mutes tracks, and cleans up on disconnect', async () => {
  const s = setup();
  assert.equal(s.tracks.length, 0);
  await s.click('voice-join');
  assert.equal(s.sent.at(-1).t, 'voice-join');
  s.voice.message({ t: 'voice-ready', session: 'local', iceServers: [] });
  s.voice.message({ t: 'voice-roster', peers: [{ id: 'alice', name: 'Alice', session: 'local' }, { id: 'bob', name: 'Bob', session: 'remote' }] });
  await settle();
  assert.equal(s.pcs.length, 1);
  assert.equal(s.sent.find(m => m.description)?.description.type, 'offer');
  const incoming = data => s.voice.message({ t: 'voice-signal', from: 'bob', session: 'remote', toSession: 'local', ...data });
  incoming({ candidate: { candidate: 'candidate' } });
  await settle();
  assert.equal(s.pcs[0].candidates.length, 0);
  incoming({ description: { type: 'answer', sdp: 'answer' } });
  await settle();
  assert.equal(s.pcs[0].candidates.length, 1);
  await s.click('voice-mute');
  assert.equal(s.tracks[0].enabled, false);
  await s.click('voice-mute');
  assert.equal(s.tracks[0].enabled, true);
  s.voice.disconnected();
  assert.equal(s.tracks[0].stopped, true);
  assert.equal(s.pcs[0].closed, true);
  assert.equal(s.elements.get('voice-join').hidden, false);
  assert.match(s.elements.get('voice-status').textContent, /Connection lost/);
});

test('canceling a pending permission request stops a microphone granted later', async () => {
  let grant;
  const s = setup(makeMic => new Promise(resolve => { grant = () => resolve(makeMic()); }));
  const joining = s.click('voice-join');
  await s.click('voice-leave');
  grant(); await joining;
  assert.equal(s.tracks[0].stopped, true);
  assert.equal(s.sent.some(m => m.t === 'voice-join'), false);
});

test('microphone denial and server rejection restore Join and release tracks', async () => {
  const denied = setup(() => Promise.reject({ name: 'NotAllowedError' }));
  await denied.click('voice-join');
  assert.match(denied.elements.get('voice-status').textContent, /denied/);
  assert.equal(denied.elements.get('voice-join').disabled, false);
  const s = setup();
  await s.click('voice-join');
  s.voice.message({ t: 'voice-error', message: 'Voice is full (8 people).' });
  assert.equal(s.tracks[0].stopped, true);
  assert.match(s.elements.get('voice-status').textContent, /full/);
});
