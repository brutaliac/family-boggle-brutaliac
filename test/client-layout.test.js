'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('active rounds block pinch and double-click zoom while allowing ordinary scrolling', () => {
  const start = html.indexOf('function preventPlayZoom(e){');
  const ctx = { S:{ phase:'play' } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start, html.indexOf("\n['gesturestart'", start)), ctx);
  function blocked(type, extra = {}) {
    let prevented = false;
    ctx.preventPlayZoom({ type, cancelable:true, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  }
  assert.equal(blocked('touchstart', { touches:[{}, {}] }), true);
  assert.equal(blocked('gesturestart'), true);
  assert.equal(blocked('dblclick'), true);
  assert.equal(blocked('wheel', { ctrlKey:true }), true);
  assert.equal(blocked('touchmove', { touches:[{}] }), false);
  assert.equal(blocked('wheel'), false);
  ctx.S.phase = 'lobby';
  assert.equal(blocked('touchstart', { touches:[{}, {}] }), false);
});
function functionSource(name, end) {
  const start = html.indexOf('function ' + name + '(){');
  return html.slice(start, html.indexOf(end, start));
}
test('long words fit the entry and recover normal size on resize, backspace, and clear', () => {
  const inp = { clientWidth:160, value:'', scrollLeft:99,
    style:{ removeProperty() { delete this.fontSize; } } };
  const ctx = { inp, wordMeasure:{ measureText(text) { return { width:text.length * 15 }; } },
    getComputedStyle:() => ({ fontSize:'24px', fontStyle:'normal', fontWeight:'800',
      fontFamily:'sans-serif', letterSpacing:'1.92px', paddingLeft:'12px', paddingRight:'12px' }) };
  vm.createContext(ctx);
  vm.runInContext(functionSource('fitWordText', '\nif(window.ResizeObserver)'), ctx);
  inp.value = 'LONGERWORDHERE'; ctx.fitWordText();
  assert.ok(parseFloat(inp.style.fontSize) < 24);
  assert.ok(inp.value.length * 16.92 * parseFloat(inp.style.fontSize) / 24 <= 132);
  inp.clientWidth = 400; ctx.fitWordText(); assert.equal(inp.style.fontSize, undefined);
  inp.clientWidth = 160; inp.value = 'WORDS'; ctx.fitWordText(); assert.equal(inp.style.fontSize, undefined);
  inp.value = ''; ctx.fitWordText(); assert.equal(inp.style.fontSize, undefined);
  assert.equal(inp.scrollLeft, 0);
});
test('mobile boards fill the width even when keyboard height changes, and recover after desktop resizing', () => {
  const boardEl = { style:{ width:'180px' }, parentElement:{ clientWidth:369 },
    getBoundingClientRect:() => ({ top:400 }) };
  const ctx = { boardEl, window:{ innerWidth:401, innerHeight:870, scrollY:0 },
    $:() => ({ hidden:false }), document:{ documentElement:{} },
    getComputedStyle:() => ({ paddingBottom:'0' }) };
  vm.createContext(ctx);
  vm.runInContext(functionSource('fitBoard', "\naddEventListener('resize',fitBoard)"), ctx);
  for (const height of [870, 500, 300]) {
    ctx.window.innerHeight = height; ctx.fitBoard(); assert.equal(boardEl.style.width, '100%');
  }
  ctx.window.innerWidth = 1000; ctx.window.innerHeight = 700; ctx.fitBoard();
  assert.equal(boardEl.style.width, '290px');
  ctx.window.innerWidth = 401; ctx.fitBoard(); assert.equal(boardEl.style.width, '100%');
});
