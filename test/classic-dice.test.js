'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const dice = ['AEANEG', 'AHSPCO', 'ASPFFK', 'OBJOAB', 'IOTMUC', 'RYVDEL', 'LREIXD', 'EIUNES',
  'WNGEEH', 'LNHNRZ', 'TSTIYD', 'OWTOAT', 'ERTTYL', 'TOESSI', 'TERWHV', 'NUIHMQ'];
function section(start, end) {
  const offset = server.indexOf(start);
  assert.ok(offset >= 0 && server.indexOf(end, offset) > offset);
  return server.slice(offset, server.indexOf(end, offset));
}

test('all six faces match the supplied classic dice, rolling each die once', () => {
  for (let face = 0; face < 6; face++) {
    const limits = [];
    const ctx = { crypto: { randomInt(n) {
      limits.push(n);
      // Leave the dice in their original order, then select the given face.
      return limits.length <= 15 ? n - 1 : face;
    } } };
    vm.createContext(ctx);
    vm.runInContext(section('const DICE =', '/* ---------- dictionary') + '\nresult = rollBoard();', ctx);
    assert.deepEqual(Array.from(ctx.result), dice.map(die => die[face] === 'Q' ? 'qu' : die[face].toLowerCase()));
    assert.deepEqual(limits, [...Array.from({ length: 15 }, (_, i) => 16 - i), ...Array(16).fill(6)]);
  }
});

test('shuffling changes positions while keeping exactly one roll from every die', () => {
  let calls = 0;
  const ctx = { crypto: { randomInt() { calls++; return 0; } } };
  vm.createContext(ctx);
  vm.runInContext(section('const DICE =', '/* ---------- dictionary') + '\nresult = rollBoard();', ctx);
  const firstFaces = dice.map(die => die[0].toLowerCase());
  assert.deepEqual(Array.from(ctx.result), [...firstFaces.slice(1), firstFaces[0]]);
  assert.equal(calls, 31);
});

test('Qu occupies one tile, requires the U, and counts as two letters in scoring', () => {
  const ctx = { WORDSET: new Set(['queen', 'qat', 'ququ', 'qu']) };
  vm.createContext(ctx);
  vm.runInContext(section('const NB =', 'function analyze') +
    section('const ptsFor =', '/* ---------- all-time stats'), ctx);
  const board = ['qu', 'e', 'e', 'n', 'a', 't', 'x', 'x', ...Array(8).fill('x')];
  assert.equal(ctx.traceable(board, 'queen'), true);
  assert.equal(ctx.scoreWords(board, ['queen']), 3); // Five letters across four tiles.
  assert.equal(ctx.traceable(board, 'qat'), false); // Qu cannot supply a bare Q.
  assert.equal(ctx.traceable(board, 'ququ'), false); // A tile cannot be reused.
  assert.equal(ctx.scoreWords(board, ['qu']), 0); // Still below the three-letter minimum.
});
