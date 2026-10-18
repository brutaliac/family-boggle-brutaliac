'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sudoku = require('../sudoku-engine');
const source = fs.readFileSync(path.join(__dirname, '..', 'sudoku.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'sudoku.html'), 'utf8');
const key = 'family-boggle-sudoku-v1';

// Minimal DOM surface: exercise the shipped controller and engine together.
class Element {
  constructor(tagName = 'BUTTON') {
    this.tagName = tagName; this.children = []; this.attrs = {}; this.dataset = {};
    this.listeners = {}; this.open = false; this.hidden = false; this.value = '';
    this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name, event = {}) { for (const fn of this.listeners[name] || []) fn(event); this['on' + name]?.(event); }
  click() { if (!this.disabled) this.dispatch('click'); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
}
function setup(saved, denied = false) {
  let now = 0;
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const get = id => { assert.ok(elements.has(id), 'missing HTML element ' + id); return elements.get(id); };
  get('difficulty').tagName = 'SELECT'; get('difficulty').value = 'Medium';
  const document = new Element('DOCUMENT');
  document.hidden = false; document.documentElement = new Element('HTML');
  document.createElement = tag => new Element(tag.toUpperCase()); document.getElementById = get;
  const data = new Map(saved === undefined ? [] : [[key, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  const localStorage = { getItem(k) { if (denied) throw Error('unavailable'); return data.get(k) ?? null; },
    setItem(k, v) { if (denied) throw Error('unavailable'); data.set(k, v); } };
  const intervals = [], window = new Element('WINDOW'); window.Sudoku = Sudoku;
  const context = { window, document, localStorage, location: { search: '?room=my-family' }, URLSearchParams,
    performance: { now: () => now }, matchMedia: () => ({ matches: false }), setInterval: (fn, ms) => intervals.push({ fn, ms }) };
  vm.runInNewContext(source, context, { filename: 'sudoku.js' });
  return { get, document, window, read: () => JSON.parse(data.get(key)),
    tick(ms) { now += ms; for (const item of intervals) if (item.ms === 1000) item.fn(); },
    key(k) { document.dispatch('keydown', { key: k, target: { tagName: 'BUTTON' }, preventDefault() {} }); },
    setHidden(hidden) { document.hidden = hidden; document.dispatch('visibilitychange'); } };
}

test('touch/keyboard entry, pencil notes and undo use the actual board controller', () => {
  const c = setup(), first = c.read(), index = first.values.findIndex(v => !v), n = first.solution[index];
  assert.equal(c.get('board').children.length, 81); assert.equal(c.get('pad').children.length, 9);
  c.get('board').children[index].click(); c.get('pad').children[n - 1].click();
  assert.equal(c.read().values[index], n);
  c.get('undo').click(); assert.equal(c.read().values[index], 0);
  c.key('n'); c.key(String(n)); assert.equal(c.read().notes[index], 1 << (n - 1));
  c.get('erase').click(); assert.equal(c.read().notes[index], 0);
  c.get('undo').click(); assert.equal(c.read().notes[index], 1 << (n - 1));
  c.get('board').children[8].click(); c.key('ArrowRight'); assert.equal(c.get('board').children[8].attrs['aria-pressed'], 'true');
  assert.equal(c.get('back').href, '/?room=my-family');
});

test('pause hides values, blocks all edits and hints, and excludes paused/background time', () => {
  const c = setup(), first = c.read(), index = first.values.findIndex(v => !v);
  c.tick(1500); c.get('pause').click(); const paused = c.read();
  assert.equal(paused.elapsedMs, 1500); assert.equal(paused.paused, true);
  assert.equal(c.get('board').inert, true);
  assert.ok(c.get('board').children.every(b => b.attrs['aria-label'].endsWith('hidden')));
  c.key('1'); c.get('hint').click(); c.get('undo').click(); c.tick(3000);
  assert.deepEqual(c.read().values, first.values); assert.equal(c.read().hintsUsed, 0);
  c.get('resume').click(); c.tick(1000); c.setHidden(true); c.tick(20000); c.setHidden(false); c.tick(500);
  c.get('back').click();
  assert.equal(c.read().elapsedMs, 3000);
  assert.equal(c.read().values[index], 0);
});

test('difficulty selection and canceled New puzzle preserve progress; confirmation replaces it', () => {
  const c = setup(), before = c.read();
  c.get('difficulty').value = 'Hard'; c.get('difficulty').dispatch('change');
  assert.equal(c.read().difficulty, 'Medium');
  c.get('new').click(); c.get('cancelNew').click(); assert.deepEqual(c.read().puzzle, before.puzzle);
  c.get('new').click(); c.get('confirmNew').click();
  assert.equal(c.read().difficulty, 'Hard'); assert.equal(c.read().elapsedMs, 0);
  assert.equal(c.get('board').inert, false); assert.equal(c.get('undo').disabled, true);
});

test('a final hint completes once, freezes time, persists completion and reloads correctly', () => {
  const g = Sudoku.createGame('Easy'), index = g.puzzle.findIndex(v => !v);
  g.values = g.solution.slice(); g.values[index] = 0; g.elapsedMs = 12000;
  const c = setup(g); c.get('hint').click();
  assert.equal(c.read().completed, true); assert.equal(c.read().hintsUsed, 1);
  assert.equal(c.get('completeDialog').open, true);
  assert.match(c.get('completeDescription').textContent, /1 hint/);
  c.tick(5000); c.get('back').click(); assert.equal(c.read().elapsedMs, 12000);
  const reloaded = setup(c.read()); assert.equal(reloaded.get('pause').disabled, true);
});

test('invalid saved data and denied browser storage still leave a playable board', () => {
  const corrupt = setup('{bad json'); assert.equal(corrupt.get('board').children.length, 81);
  const denied = setup(undefined, true); assert.equal(denied.get('pad').children.length, 9);
  assert.match(denied.get('status').textContent, /Saving is unavailable/);
  denied.get('hint').click(); assert.match(denied.get('status').textContent, /Saving is unavailable/);
});
