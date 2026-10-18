'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sudoku-engine');

function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function singles(puzzle, allowHidden) {
  const board = puzzle.slice();
  for (;;) {
    let changed = false;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const candidates = S.candidates(board, i);
      if (candidates.length === 1) { board[i] = candidates[0]; changed = true; }
    }
    if (changed) continue;
    if (allowHidden) for (const unit of S.units) for (const n of S.digits) {
      if (unit.some(i => board[i] === n)) continue;
      const places = unit.filter(i => S.candidates(board, i).includes(n));
      if (places.length === 1) { board[places[0]] = n; changed = true; }
    }
    if (!changed) return board.every(Boolean);
  }
}

test('every difficulty produces distinct, valid, uniquely solvable puzzles', () => {
  for (const difficulty of ['Easy', 'Medium', 'Hard']) {
    const puzzles = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const p = S.createPuzzle(difficulty, random(seed));
      puzzles.add(p.puzzle.join(''));
      assert.equal(S.analyze(p.puzzle).count, 1);
      assert.equal(S.consistent(p.solution), true);
      assert.equal(p.solution.every(Boolean), true);
      assert.ok(p.puzzle.every((n, i) => !n || n === p.solution[i]));
      assert.equal(singles(p.puzzle, false), difficulty === 'Easy');
      assert.equal(singles(p.puzzle, true), difficulty !== 'Hard');
    }
    assert.equal(puzzles.size, 12);
  }
});

test('solver rejects invalid boards and distinguishes multiple solutions', () => {
  assert.equal(S.analyze(Array(81).fill(0)).count, 2);
  const invalid = Array(81).fill(0); invalid[0] = invalid[1] = 1;
  assert.equal(S.analyze(invalid).count, 0);
  assert.equal(S.analyze([1, 2, 3]).count, 0);
  assert.throws(() => S.createPuzzle('Unknown'));
});

test('givens, paused games, and completed games cannot be edited', () => {
  const g = S.createGame('Easy', random(7));
  const fixed = g.puzzle.findIndex(Boolean), empty = g.puzzle.findIndex(v => !v);
  assert.equal(S.apply(g, fixed, 0), false);
  g.paused = true;
  assert.equal(S.apply(g, empty, 1), false);
  g.paused = false; g.completed = true;
  assert.equal(S.apply(g, empty, 1), false);
  assert.equal(S.restore(g, S.snapshot(g)), false);
  assert.equal(S.apply(g, -1, 1), false);
  assert.equal(S.apply(g, empty, 10), false);
});

test('notes toggle, clear on entry, remove peer candidates, and undo restores all marks', () => {
  const g = S.createGame('Easy', random(12));
  const i = g.puzzle.findIndex(v => !v), n = g.solution[i];
  const peer = S.peers[i].find(j => !g.puzzle[j]);
  assert.equal(S.apply(g, i, n, true), true);
  assert.equal(g.notes[i], 1 << (n - 1));
  S.apply(g, i, n, true); assert.equal(g.notes[i], 0);
  S.apply(g, peer, n, true);
  const before = S.snapshot(g);
  S.apply(g, i, n);
  assert.equal(g.notes[peer], 0);
  assert.equal(S.apply(g, i, 2, true), false); // Notes do not erase a filled value.
  assert.equal(S.restore(g, before), true);
  assert.equal(g.values[i], 0);
  assert.equal(g.notes[peer], 1 << (n - 1));
});

test('hints target wrong entries and completion requires the actual solution', () => {
  const g = S.createGame('Easy', random(21)), i = g.puzzle.findIndex(v => !v);
  S.apply(g, i, g.solution[i] % 9 + 1);
  assert.equal(S.hintIndex(g, i), i);
  for (let j = 0; j < 81; j++) if (!g.puzzle[j]) S.apply(g, j, g.solution[j]);
  assert.equal(g.completed, true);
  assert.equal(S.hintIndex(g, i), -1);
});

test('saved games restore notes, wrong entries, hints, elapsed time and pause; ignore forged completion', () => {
  const g = S.createGame('Hard', random(17)), empty = g.puzzle.findIndex(v => !v);
  S.apply(g, empty, g.solution[empty] % 9 + 1, true);
  g.elapsedMs = 123456; g.hintsUsed = 2; g.paused = true;
  const serialized = JSON.parse(JSON.stringify(g)); serialized.completed = true;
  const restored = S.readSaved(serialized);
  assert.deepEqual(restored.notes, g.notes);
  assert.equal(restored.elapsedMs, 123456);
  assert.equal(restored.hintsUsed, 2);
  assert.equal(restored.paused, true);
  assert.equal(restored.completed, false);
  for (const mutate of [
    s => { s.puzzle.fill(0); },
    s => { s.values[s.puzzle.findIndex(Boolean)] = 0; },
    s => { s.solution[0] = s.solution[1]; },
    s => { s.notes[0] = -1; },
    s => { s.elapsedMs = -5; },
    s => { s.hintsUsed = 'two'; },
    s => { s.paused = 'no'; },
    s => { s.difficulty = '__proto__'; },
    s => { s.version = 99; },
  ]) {
    const value = JSON.parse(JSON.stringify(g)); mutate(value);
    assert.equal(S.readSaved(value), null);
  }
});
