/* Sudoku rules and state, shared by the browser and Node tests. No network. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seeds = {
    Easy: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    Medium: '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
    Hard: '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
  };
  const units = [];
  for (let r = 0; r < 9; r++) units.push(digits.map((_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(digits.map((_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) units.push(digits.map((_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3));
  const peers = Array.from({ length: 81 }, (_, i) =>
    [...new Set(units.filter(u => u.includes(i)).flat())].filter(j => j !== i));
  const boardArray = a => Array.isArray(a) && a.length === 81 && a.every(v => Number.isInteger(v) && v >= 0 && v <= 9);
  function consistent(board) {
    return boardArray(board) && board.every((v, i) => !v || !peers[i].some(j => board[j] === v));
  }
  function candidates(board, i) {
    return board[i] ? [] : digits.filter(n => !peers[i].some(j => board[j] === n));
  }
  function analyze(board, limit = 2) {
    if (!consistent(board)) return { count: 0, solution: null };
    const work = board.slice();
    let count = 0, solution = null;
    function search() {
      let index = -1, options = null;
      for (let i = 0; i < 81; i++) {
        if (work[i]) continue;
        const a = candidates(work, i);
        if (!a.length) return;
        if (!options || a.length < options.length) { index = i; options = a; }
        if (a.length === 1) break;
      }
      if (index < 0) { count++; solution = work.slice(); return; }
      for (const n of options) {
        work[index] = n; search();
        if (count >= limit) break;
      }
      work[index] = 0;
    }
    search();
    return { count, solution };
  }
  function shuffle(a, random) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function createPuzzle(difficulty = 'Medium', random = Math.random) {
    if (!Object.hasOwn(seeds, difficulty)) throw new Error('Unknown Sudoku difficulty');
    // Digit permutations, rows within bands, columns within stacks, band/stack
    // permutations, and transposition preserve both uniqueness and solving logic.
    const order = () => shuffle([0, 1, 2], random).flatMap(b => shuffle([0, 1, 2], random).map(n => b * 3 + n));
    const rows = order(), cols = order(), mapping = [0, ...shuffle(digits, random)];
    const transpose = random() < 0.5;
    const puzzle = Array.from({ length: 81 }, (_, i) => {
      let r = rows[Math.floor(i / 9)], c = cols[i % 9];
      if (transpose) [r, c] = [c, r];
      return mapping[Number(seeds[difficulty][r * 9 + c])];
    });
    const result = analyze(puzzle);
    if (result.count !== 1) throw new Error('Sudoku must have exactly one solution');
    return { difficulty, puzzle, solution: result.solution };
  }
  function createGame(difficulty = 'Medium', random = Math.random) {
    const puzzle = createPuzzle(difficulty, random);
    return { version: 1, ...puzzle, values: puzzle.puzzle.slice(), notes: Array(81).fill(0),
      elapsedMs: 0, paused: false, completed: false, hintsUsed: 0 };
  }
  function isComplete(game) { return game.values.every((v, i) => v === game.solution[i]); }
  function conflict(game, i) {
    return !!game.values[i] && peers[i].some(j => game.values[j] === game.values[i]);
  }
  function apply(game, i, n, noteMode = false) {
    if (!Number.isInteger(i) || i < 0 || i >= 81 || !Number.isInteger(n) || n < 0 || n > 9 ||
      game.paused || game.completed || game.puzzle[i]) return false;
    if (noteMode && n) {
      if (game.values[i]) return false;
      game.notes[i] ^= 1 << (n - 1);
    } else {
      if (game.values[i] === n && !game.notes[i]) return false;
      game.values[i] = n; game.notes[i] = 0;
      if (n) for (const j of peers[i]) game.notes[j] &= ~(1 << (n - 1));
    }
    game.completed = isComplete(game);
    return true;
  }
  function hintIndex(game, selected) {
    if (Number.isInteger(selected) && selected >= 0 && selected < 81 && !game.puzzle[selected] && game.values[selected] !== game.solution[selected]) return selected;
    return game.values.findIndex((v, i) => !game.puzzle[i] && v !== game.solution[i]);
  }
  function snapshot(game) { return { values: game.values.slice(), notes: game.notes.slice() }; }
  function restore(game, state) {
    if (game.paused || game.completed) return false;
    game.values = state.values.slice(); game.notes = state.notes.slice();
    return true;
  }
  function readSaved(value) {
    if (!value || value.version !== 1 || !Object.hasOwn(seeds, value.difficulty) ||
      !boardArray(value.puzzle) || !boardArray(value.values) || !boardArray(value.solution) ||
      !value.solution.every(Boolean) || !consistent(value.solution) ||
      !value.puzzle.some(Boolean) || !value.puzzle.some(v => !v) ||
      !value.puzzle.every((v, i) => !v || (v === value.solution[i] && v === value.values[i])) ||
      !Array.isArray(value.notes) || value.notes.length !== 81 ||
      !value.notes.every(v => Number.isInteger(v) && v >= 0 && v <= 511) ||
      !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs > 31536000000 ||
      !Number.isSafeInteger(value.hintsUsed) || value.hintsUsed < 0 || typeof value.paused !== 'boolean') return null;
    const solved = analyze(value.puzzle);
    if (solved.count !== 1 || !solved.solution.every((v, i) => v === value.solution[i])) return null;
    const game = { version: 1, difficulty: value.difficulty, puzzle: value.puzzle.slice(), solution: value.solution.slice(),
      values: value.values.slice(), notes: value.notes.map((v, i) => value.values[i] ? 0 : v),
      elapsedMs: value.elapsedMs, paused: value.paused, hintsUsed: value.hintsUsed };
    game.completed = isComplete(game);
    return game;
  }
  return { digits, units, peers, candidates, consistent, analyze, createPuzzle, createGame,
    isComplete, conflict, apply, hintIndex, snapshot, restore, readSaved };
});
