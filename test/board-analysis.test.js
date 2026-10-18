'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const board = ['d', 'b', 'p', 's', 'e', 'e', 'e', 'e', 'r', 'r', 'r', 'r', 'x', 'x', 'x', 'x'];
function setup(words) {
  const ctx = { WORDS: words.slice().sort(), WORDSET: new Set(words),
    MIN_WORDS: 1, MIN_LONG: 0, MIN_ER: 3, ER_SOFT: 0, rnd: () => 999 };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function hasPrefix('), source.indexOf('// keep rolling')) +
    '\nthis.accepts = boardOk;', ctx);
  return ctx;
}

test('multiple paths to one -er word cannot satisfy the three-word board filter', () => {
  const ctx = setup(['deer']);
  const result = ctx.analyze(board);
  assert.equal(result.count, 1);
  assert.equal(result.longest, 4);
  assert.equal(result.er, 1);
  assert.equal(ctx.accepts(board), false);
});

test('three distinct -er words satisfy the filter despite duplicate paths', () => {
  const ctx = setup(['beer', 'deer', 'peer', 'see']);
  const result = ctx.analyze(board);
  assert.equal(result.count, 4);
  assert.equal(result.longest, 4);
  assert.equal(result.er, 3);
  assert.equal(ctx.accepts(board), true);
});

test('finding an existing word on another path still explores longer words', () => {
  const ctx = setup(['see', 'seer']);
  const result = ctx.analyze(board);
  assert.equal(result.count, 2);
  assert.equal(result.longest, 4);
  assert.equal(result.er, 1);
});
