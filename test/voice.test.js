'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { WebSocket } = require('ws');

test('room voice signaling lifecycle and isolation', async t => {
  const port = await new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
  const data = mkdtempSync(path.join(tmpdir(), 'boggle-voice-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_DIR: data, GITHUB_TOKEN: '', VOICE_ICE_SERVERS: '[{"urls":"stun:example.test:3478"}]',
      VOICE_TURN_URLS: 'turn:relay.example.test:3478', VOICE_TURN_SECRET: 'test-only-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const clients = [];
  t.after(async () => {
    for (const c of clients) c.ws.terminate();
    server.kill('SIGTERM');
    await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    rmSync(data, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server startup timed out')), 10000);
    server.stdout.on('data', d => { if (d.toString().includes('listening')) { clearTimeout(timer); resolve(); } });
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error('server exited: ' + code)); });
  });
  async function client(room, name, key = Math.random().toString(36)) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw)));
    const c = { ws, messages, send: m => ws.send(JSON.stringify(m)), async next(type, predicate = () => true) {
      for (let i = 0; i < 100; i++) {
        const index = messages.findIndex(m => m.t === type && predicate(m));
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(r => setTimeout(r, 10));
      }
      throw new Error('missing ' + type);
    } };
    clients.push(c);
    await new Promise(resolve => ws.once('open', resolve));
    c.send({ t: 'hello', key, name });
    c.id = (await c.next('state')).meId;
    await c.next('voice-roster');
    return c;
  }
  async function join(c) {
    c.send({ t: 'voice-join' });
    const ready = await c.next('voice-ready');
    assert.equal(ready.iceServers[0].urls, 'stun:example.test:3478');
    const turn = ready.iceServers[1];
    assert.equal(turn.urls[0], 'turn:relay.example.test:3478');
    assert.equal(turn.credential, crypto.createHmac('sha1', 'test-only-secret').update(turn.username).digest('base64'));
    assert.ok(Number(turn.username.split(':')[0]) > Date.now() / 1000 + 86000);
    assert.equal(JSON.stringify(ready).includes('test-only-secret'), false);
    c.session = ready.session;
    await c.next('voice-roster', m => m.peers.some(p => p.id === c.id));
  }
  const a = await client('alpha', 'Alice');
  const b = await client('alpha', 'Bob');
  const outsider = await client('beta', 'Carol');
  const unnamed = await client('alpha', '');
  unnamed.send({ t: 'voice-join' });
  assert.match((await unnamed.next('voice-error')).message, /name/);
  await join(a); await join(b); await join(outsider);
  const offer = { type: 'offer', sdp: 'test offer' };
  const signal = (from, to, extra = {}) => from.send({ t: 'voice-signal', to: to.id, session: from.session, toSession: to.session, description: offer, ...extra });
  signal(a, b);
  assert.equal((await b.next('voice-signal')).from, a.id);
  signal(a, outsider); // Must not route across rooms even when IDs and sessions are known.
  signal(unnamed, b);
  signal(a, b, { session: 'stale-session' });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(outsider.messages.some(m => m.t === 'voice-signal'), false);
  assert.equal(b.messages.some(m => m.t === 'voice-signal'), false);
  a.send({ t: 'voice-mute', muted: true });
  assert.equal((await b.next('voice-roster', m => m.peers.some(p => p.id === a.id && p.muted))).peers.find(p => p.id === a.id).muted, true);
  a.send({ t: 'voice-leave' });
  await b.next('voice-roster', m => !m.peers.some(p => p.id === a.id));
  const old = a.session;
  await join(a);
  assert.notEqual(a.session, old);
  signal(b, a, { toSession: old });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(a.messages.some(m => m.t === 'voice-signal'), false);
  a.ws.close();
  await b.next('voice-roster', m => !m.peers.some(p => p.id === a.id));
  // Replacement tabs remove voice from the previous connection.
  const d = await client('alpha', 'Dan', 'same-browser'); await join(d);
  await client('alpha', 'Dan', 'same-browser');
  await b.next('voice-roster', m => !m.peers.some(p => p.id === d.id));
  // Eight participants fit; a ninth gets an explicit error.
  for (let i = 0; i < 8; i++) await join(await client('capacity', 'Player ' + i));
  const ninth = await client('capacity', 'Ninth');
  ninth.send({ t: 'voice-join' });
  assert.match((await ninth.next('voice-error')).message, /full/);
  const js = await fetch(`http://127.0.0.1:${port}/voice.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});
