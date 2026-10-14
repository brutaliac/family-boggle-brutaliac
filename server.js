"use strict";
/*
 * Family Boggle server.
 * Serves the game page and keeps one shared game per room over WebSockets.
 * Everyone who opens the same link (same ?room=) plays the same board.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const COUNTDOWN_MS = Number(process.env.BOGGLE_COUNTDOWN_MS) || 3000;
const MIN_SECONDS = Number(process.env.BOGGLE_MIN_SECONDS) || 60;
const FORCE_SECONDS = Number(process.env.BOGGLE_FORCE_SECONDS) || 0; // test hook only
const GRACE_MS = 1500; // words sent just after the buzzer still count

const DICE = ["AAEEGN", "ELRTTY", "AOOTTW", "ABBJOO", "EHRTVW", "CIMOTU", "DISTTY", "EIOSST",
  "DELRVY", "ACHOPS", "HIMNQU", "EEINSU", "EEGHNW", "AFFKPS", "HLNNRZ", "DEILRX"];
const rnd = (n) => crypto.randomInt(n);
function rollBoard() {
  const d = DICE.slice();
  for (let i = 15; i > 0; i--) { const j = rnd(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d.map((s) => { const f = s[rnd(6)]; return f === "Q" ? "qu" : f.toLowerCase(); });
}

/* ---------- dictionary (same list the page uses to check words) ---------- */
const MIN_WORDS = process.env.BOGGLE_MIN_WORDS !== undefined ? Number(process.env.BOGGLE_MIN_WORDS) : 50;
const MIN_LONG = process.env.BOGGLE_MIN_LONG !== undefined ? Number(process.env.BOGGLE_MIN_LONG) : 7; // at least one word this long (0 = off)
const WORDS = [];
{
  const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  const packed = html.match(/PACKED="([^"]+)"/)[1];
  let prev = "";
  for (const m of packed.matchAll(/([0-9A-F])([a-z]+)/g)) {
    const w = prev.slice(0, parseInt(m[1], 16)) + m[2];
    WORDS.push(w); prev = w;
  }
}
const WORDSET = new Set(WORDS);
function hasPrefix(p) {
  let lo = 0, hi = WORDS.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (WORDS[mid] < p) lo = mid + 1; else hi = mid; }
  return lo < WORDS.length && WORDS[lo].startsWith(p);
}
const NB = [];
for (let i = 0; i < 16; i++) {
  const r = i >> 2, c = i & 3, a = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4) a.push(rr * 4 + cc);
  }
  NB.push(a);
}
function analyze(b) {
  const out = new Set(), used = new Array(16).fill(false);
  let longest = 0;
  function go(i, pre) {
    const p = pre + b[i];
    if (!hasPrefix(p)) return;
    used[i] = true;
    if (p.length >= 3 && WORDSET.has(p)) { out.add(p); if (p.length > longest) longest = p.length; }
    for (const j of NB[i]) if (!used[j]) go(j, p);
    used[i] = false;
  }
  for (let i = 0; i < 16; i++) go(i, "");
  return { count: out.size, longest };
}
const countWords = (b) => analyze(b).count;
const boardOk = (b) => { const a = analyze(b); return a.count >= MIN_WORDS && a.longest >= MIN_LONG; };
// keep rolling until the board has at least MIN_WORDS words, one of them MIN_LONG+ letters long
function newBoard() {
  let b = rollBoard();
  for (let tries = 0; tries < 2000 && !boardOk(b); tries++) b = rollBoard();
  return b;
}

/* ---------- rooms ---------- */
const rooms = new Map();
function getRoom(name) {
  let r = rooms.get(name);
  if (!r) { r = { name, game: null, players: new Map(), touched: Date.now() }; rooms.set(name, r); }
  r.touched = Date.now();
  return r;
}
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
const endOf = (g) => g.startAt + g.duration * 1000;
function phaseOf(r, now = Date.now()) {
  const g = r.game;
  if (!g) return "lobby";
  if (now < g.startAt) return "count";
  if (now < endOf(g)) return "play";
  return "done";
}

function snapshotFor(r, viewer) {
  const now = Date.now();
  const g = r.game;
  const showWords = !!g && now >= endOf(g);
  const list = [];
  for (const p of r.players.values()) {
    const inRound = !!g && p.gid === g.id;
    if (!p.name) continue;
    if (!p.ws && !inRound) continue;
    list.push({
      id: p.id, name: p.name, online: !!p.ws, gid: inRound ? g.id : null,
      n: inRound ? p.words.length : 0,
      words: inRound && showWords ? p.words : undefined,
    });
  }
  return {
    t: "state", now, meId: viewer.id, game: g, players: list,
    me: { gid: viewer.gid, words: viewer.gid && g && viewer.gid === g.id ? viewer.words : [] },
  };
}
function broadcast(r) {
  for (const p of r.players.values()) {
    if (p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(snapshotFor(r, p))); } catch (e) { /* ignore */ } }
  }
}
function finalize(r, g) {
  if (r.game !== g || g.results) return;
  g.results = [...r.players.values()].filter((p) => p.gid === g.id)
    .map((p) => ({ name: p.name || "Player", words: p.words.slice() }));
  broadcast(r);
}

function sanitizeWords(arr) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(arr)) return out;
  for (const w of arr) {
    if (typeof w !== "string" || !/^[a-z]{3,16}$/.test(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length >= 400) break;
  }
  return out;
}

function handle(r, ws, m) {
  if (m.t === "hello") {
    const key = String(m.key || "").slice(0, 64);
    if (!key) return;
    let p = r.players.get(key);
    if (!p) { p = { id: crypto.randomBytes(5).toString("hex"), key, name: "", ws: null, gid: null, words: [] }; r.players.set(key, p); }
    if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch (e) { /* ignore */ } }
    p.ws = ws; ws.player = p;
    p.name = cleanName(m.name) || p.name;
    const ph = phaseOf(r);
    if (r.game && (ph === "count" || ph === "play") && p.gid !== r.game.id) { p.gid = r.game.id; p.words = []; }
    broadcast(r);
    return;
  }
  const p = ws.player;
  if (!p) return;
  if (m.t === "name") { p.name = cleanName(m.name) || p.name; broadcast(r); return; }
  if (m.t === "start") {
    const ph = phaseOf(r);
    if (ph !== "lobby" && ph !== "done") return;
    if (!p.name) return;
    const duration = FORCE_SECONDS || Math.max(MIN_SECONDS, Math.min(600, Math.round(Number(m.duration)) || 90));
    const shared = "count"; // shared words always score for everyone
    const now = Date.now();
    const g = {
      id: crypto.randomBytes(5).toString("hex"), board: newBoard(), createdAt: now,
      startAt: now + COUNTDOWN_MS, duration, shared, hostName: p.name, results: null,
    };
    r.game = g;
    for (const q of r.players.values()) { q.gid = q.ws ? g.id : null; q.words = []; }
    broadcast(r);
    setTimeout(() => finalize(r, g), endOf(g) + GRACE_MS + 50 - now);
    return;
  }
  if (m.t === "words") {
    const g = r.game;
    const now = Date.now();
    if (!g || p.gid !== g.id || now < g.startAt || now > endOf(g) + GRACE_MS) return;
    const incoming = sanitizeWords(m.words);
    const merged = incoming.slice();
    for (const w of p.words) if (!merged.includes(w)) merged.push(w);
    p.words = merged.slice(0, 400);
    broadcast(r);
  }
}

/* ---------- http ---------- */
const PUBLIC = path.join(__dirname, "public");
const files = {};
function load(name, type) {
  const buf = fs.readFileSync(path.join(PUBLIC, name));
  files["/" + name] = { type, buf, gz: zlib.gzipSync(buf, { level: 9 }) };
}
load("index.html", "text/html; charset=utf-8");
load("manifest.webmanifest", "application/manifest+json");
load("icon.png", "image/png");
files["/"] = files["/index.html"];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); res.end("ok"); return; }
  const f = files[url.pathname];
  if (!f) { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); return; }
  const headers = { "content-type": f.type, "cache-control": f.type.startsWith("image") ? "public, max-age=86400" : "no-cache" };
  if (/\bgzip\b/.test(req.headers["accept-encoding"] || "") && !f.type.startsWith("image")) {
    headers["content-encoding"] = "gzip"; headers["content-length"] = f.gz.length;
    res.writeHead(200, headers); res.end(f.gz);
  } else { headers["content-length"] = f.buf.length; res.writeHead(200, headers); res.end(f.buf); }
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 20000 });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const name = (url.searchParams.get("room") || "family").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "family";
  const r = getRoom(name);
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    r.touched = Date.now();
    handle(r, ws, m);
  });
  ws.on("close", () => {
    const p = ws.player;
    if (p && p.ws === ws) { p.ws = null; broadcast(r); }
  });
  ws.on("error", () => {});
});

// keep connections alive (and detect dropped ones, such as phones on hospital Wi-Fi)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignore */ }
  }
}, 25000);
// forget rooms nobody has touched for a day
setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [k, r] of rooms) if (r.touched < cutoff && ![...r.players.values()].some((p) => p.ws)) rooms.delete(k);
}, 3600 * 1000);

server.listen(PORT, () => console.log("Family Boggle listening on port " + PORT));
