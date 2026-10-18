/* Single-player Sudoku. Only this device's localStorage is used. */
(() => {
  'use strict';
  const rules = window.Sudoku, $ = id => document.getElementById(id);
  const storageKey = 'family-boggle-sudoku-v1', preferencesKey = 'family-boggle-sudoku-preferences';
  let game, selected = 0, noteMode = false, history = [], conflicts = true;
  let savingAvailable = true, lastTick = performance.now();
  function message(text) {
    $('status').textContent = savingAvailable ? text : 'Saving is unavailable. Keep this tab open to retain your puzzle.';
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      game = rules.readSaved(JSON.parse(raw));
      if (!game) message('Saved puzzle could not be restored. A new puzzle is ready.');
    }
  } catch (_) { message('Saved puzzle could not be restored.'); }
  try {
    const preferences = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
    if (typeof preferences.conflicts === 'boolean') conflicts = preferences.conflicts;
    if (preferences.theme === 'dark' || preferences.theme === 'light') document.documentElement.dataset.theme = preferences.theme;
  } catch (_) { /* Preferences are optional. */ }
  game ||= rules.createGame();
  selected = Math.max(0, game.values.findIndex(v => !v));
  $('difficulty').value = game.difficulty;
  $('conflicts').checked = conflicts;

  // Preserve the room query when returning to Boggle, but never accept a URL
  // supplied by the visitor as the return destination.
  const room = new URLSearchParams(location.search).get('room');
  $('back').href = '/' + (room ? '?' + new URLSearchParams({ room }) : '');
  function running() { return !game.paused && !game.completed && !document.hidden; }
  function syncTime() {
    const now = performance.now();
    if (running()) game.elapsedMs += Math.max(0, now - lastTick);
    lastTick = now;
  }
  function formatTime(ms) {
    const total = Math.floor(ms / 1000), seconds = String(total % 60).padStart(2, '0');
    const minutes = Math.floor(total / 60);
    return (minutes < 60 ? String(minutes).padStart(2, '0') : Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0')) + ':' + seconds;
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(game));
      localStorage.setItem(preferencesKey, JSON.stringify({ conflicts, theme: document.documentElement.dataset.theme || null }));
      savingAvailable = true;
    } catch (_) {
      message('Saving is unavailable. Keep this tab open to retain your puzzle.');
      savingAvailable = false;
    }
  }
  function dialogOpen() { return $('newDialog').open || $('completeDialog').open; }
  function render() {
    const board = $('board');
    board.classList.toggle('paused', game.paused);
    board.inert = game.paused;
    board.setAttribute('aria-label', game.paused ? 'Sudoku board, paused' : 'Sudoku board');
    $('resume').hidden = !game.paused;
    for (let i = 0; i < 81; i++) {
      const button = board.children[i], value = game.values[i];
      const peer = rules.peers[selected].includes(i), same = value && value === game.values[selected];
      button.className = 'cell' + (peer ? ' peer' : '') + (same ? ' same' : '') +
        (!game.puzzle[i] ? ' entered' : '') + (selected === i ? ' selected' : '') +
        (conflicts && rules.conflict(game, i) ? ' error' : '');
      button.tabIndex = selected === i ? 0 : -1;
      button.setAttribute('aria-pressed', String(selected === i));
      let content = value ? String(value) : '';
      if (!value && game.notes[i]) {
        const pencil = document.createElement('span'); pencil.className = 'pencil'; pencil.setAttribute('aria-hidden', 'true');
        for (const n of rules.digits) { const item = document.createElement('span'); item.textContent = game.notes[i] & (1 << (n - 1)) ? n : ''; pencil.append(item); }
        content = pencil;
      }
      button.replaceChildren(content);
      const noteLabel = !value && game.notes[i] ? ', notes ' + rules.digits.filter(n => game.notes[i] & (1 << (n - 1))).join(', ') : '';
      button.setAttribute('aria-label', 'Row ' + (Math.floor(i / 9) + 1) + ', column ' + (i % 9 + 1) + ', ' +
        (game.paused ? 'hidden' : (value || 'empty') + (game.puzzle[i] ? ', given' : '') + noteLabel));
      if (conflicts && rules.conflict(game, i)) button.setAttribute('aria-invalid', 'true');
      else button.removeAttribute('aria-invalid');
    }
    $('notes').classList.toggle('on', noteMode);
    $('notes').setAttribute('aria-pressed', String(noteMode));
    $('noteState').textContent = noteMode ? 'ON' : 'OFF';
    const locked = game.paused || game.completed;
    for (const id of ['notes', 'hint', 'erase']) $(id).disabled = locked || (id === 'erase' && !!game.puzzle[selected]);
    $('undo').disabled = locked || !history.length;
    for (const button of $('pad').children) button.disabled = locked || !!game.puzzle[selected];
    $('timer').textContent = formatTime(game.elapsedMs);
    $('pause').disabled = game.completed;
    $('pause').textContent = game.paused ? '▶' : 'Ⅱ';
    $('pause').setAttribute('aria-label', game.paused ? 'Resume game' : 'Pause game');
    $('pause').title = game.paused ? 'Resume game' : 'Pause game';
  }
  function select(index, focus = false) {
    selected = Math.max(0, Math.min(80, index)); render();
    if (focus) $('board').children[selected].focus({ preventScroll: true });
  }
  function enter(n, useNotes = noteMode, index = selected) {
    if (dialogOpen()) return false;
    syncTime();
    const before = rules.snapshot(game);
    if (!rules.apply(game, index, n, useNotes)) return false;
    selected = index;
    history.push(before); if (history.length > 100) history.shift();
    message(''); render(); save();
    if (game.completed) {
      $('completeDescription').textContent = game.difficulty + ' · ' + formatTime(game.elapsedMs) +
        ' · ' + game.hintsUsed + (game.hintsUsed === 1 ? ' hint' : ' hints');
      $('completeDialog').showModal();
    }
    return true;
  }
  for (let i = 0; i < 81; i++) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.index = i;
    button.addEventListener('click', () => select(i)); $('board').append(button);
  }
  for (const n of rules.digits) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = n;
    button.setAttribute('aria-label', 'Enter ' + n); button.addEventListener('click', () => enter(n)); $('pad').append(button);
  }
  $('erase').onclick = () => enter(0, false);
  $('undo').onclick = () => {
    if (!history.length || game.paused || game.completed || dialogOpen()) return;
    syncTime(); rules.restore(game, history.pop()); render(); save(); message('');
  };
  $('notes').onclick = () => { if (!game.paused && !game.completed) { noteMode = !noteMode; render(); } };
  $('hint').onclick = () => {
    if (game.paused || game.completed || dialogOpen()) return;
    const index = rules.hintIndex(game, selected);
    if (index >= 0) {
      // Increment before enter so the final completion includes this hint.
      game.hintsUsed++;
      if (!enter(game.solution[index], false, index)) game.hintsUsed--;
      else { save(); if (!game.completed) message('Hint added.'); }
    }
  };
  function togglePause() {
    if (game.completed || dialogOpen()) return;
    syncTime(); game.paused = !game.paused; lastTick = performance.now(); render(); save();
  }
  $('pause').onclick = togglePause; $('resume').onclick = togglePause;
  $('conflicts').onchange = () => { conflicts = $('conflicts').checked; render(); save(); };
  $('theme').onclick = () => {
    const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = current === 'dark' ? 'light' : 'dark'; save();
  };
  $('difficulty').onchange = () => {
    message($('difficulty').value === game.difficulty ? '' : $('difficulty').value + ' applies to your next puzzle.');
  };
  function askNew() {
    $('newDescription').textContent = game.completed ? 'Start a new ' + $('difficulty').value.toLowerCase() + ' puzzle?' : 'Replace this puzzle with a new ' + $('difficulty').value.toLowerCase() + ' puzzle?';
    $('newDialog').showModal();
  }
  $('new').onclick = askNew;
  $('cancelNew').onclick = () => $('newDialog').close();
  $('confirmNew').onclick = () => {
    const next = rules.createGame($('difficulty').value);
    game = next; selected = game.values.findIndex(v => !v); noteMode = false; history = [];
    lastTick = performance.now(); $('newDialog').close(); message(''); render(); save();
  };
  $('closeComplete').onclick = () => $('completeDialog').close();
  $('nextPuzzle').onclick = () => { $('completeDialog').close(); askNew(); };
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || dialogOpen() ||
      ['SELECT', 'INPUT', 'TEXTAREA'].includes(event.target.tagName) || game.paused || game.completed) return;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); }
    else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); enter(0, false); }
    else if (event.key.toLowerCase() === 'n') { event.preventDefault(); $('notes').click(); }
    else {
      const row = Math.floor(selected / 9), col = selected % 9;
      const destinations = { ArrowLeft: row * 9 + Math.max(0, col - 1), ArrowRight: row * 9 + Math.min(8, col + 1),
        ArrowUp: Math.max(0, row - 1) * 9 + col, ArrowDown: Math.min(8, row + 1) * 9 + col };
      if (Object.hasOwn(destinations, event.key)) { event.preventDefault(); select(destinations[event.key], true); }
    }
  });
  $('back').addEventListener('click', () => { syncTime(); save(); });
  window.addEventListener('pagehide', () => { syncTime(); save(); });
  document.addEventListener('visibilitychange', () => {
    // Account for the last visible fraction of a second, then exclude time
    // spent in another tab or with the phone locked.
    const now = performance.now();
    if (document.hidden && !game.paused && !game.completed) game.elapsedMs += Math.max(0, now - lastTick);
    lastTick = now; save();
  });
  setInterval(() => { syncTime(); $('timer').textContent = formatTime(game.elapsedMs); }, 1000);
  setInterval(save, 5000);
  render(); save();
})();
