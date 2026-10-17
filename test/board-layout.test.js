'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function between(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
function node() {
  return { children:[], dataset:{}, append(child) { this.children.push(child); },
    set textContent(value) { this.children = []; this.text = value; },
    get firstChild() { return this.children[0]; }, setAttribute() {} };
}
function setup() {
  const mini = node(), main = node(), elements=new Map([['#mini',mini]]);
  const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  const ctx = { S:{ myWords:[] }, boardEl:main, inp:{ value:'' },
    $:get, ss:() => null, update() {}, drawPath() {}, setMsg() {}, nextBox() {},
    h(tag, props, child) { const n = node(); Object.assign(n, props); if (child) n.append(child); return n; },
    document:{ createElementNS:node } };
  vm.createContext(ctx);
  vm.runInContext('let board=[],boardRoundId=null,dice=[],traceEl=null,miniFor=null,miniBoardKey=null,miniWord=null,reviewLongestLength=0;\n' +
    between('function onState(m){', '/* ---------- players ---------- */') +
    between('function boardCell(t){', 'function drawPath(){') +
    between('function buildMini(){', 'function showMini(w){') +
    between('function renderResults(){', '/* ---------- lobby link'), ctx);
  const state = (id, board, results = null) => ctx.onState({ now:Date.now(), game:{id,board,results}, me:{gid:id,words:[]} });
  const letters = el => el.children.filter(n => n.class === 'cell').map(n => n.firstChild.text);
  return { ctx, state, mini, main, letters, get };
}
test('results preserve every played tile, including Qu, across state updates and the next round', () => {
  const s = setup();
  const tiles = ['qu','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
  s.state('round-one', tiles); s.ctx.buildBoard();
  const played = s.letters(s.main);
  tiles.reverse(); // Later payload mutations must not change the displayed round.
  s.state('round-one', tiles, []); s.ctx.buildMini();
  assert.deepEqual(s.letters(s.mini), played);
  assert.equal(played[0], 'Qu');
  s.ctx.buildMini(); assert.equal(s.mini.children.length, 16);
  s.state('round-two', tiles); s.ctx.buildBoard(); s.ctx.buildMini();
  assert.deepEqual(s.letters(s.mini), s.letters(s.main));
  assert.notDeepEqual(s.letters(s.mini), played);
});

test('a second round replaces the cached review board before scores finish loading', () => {
  const s=setup();
  const first=['s','t','a','r','e','n','o','t','l','i','s','e','d','a','r','p'];
  const second=['qu','i','c','k','b','r','o','w','n','f','o','x','j','u','m','p'];
  s.state('first',first,[]);s.ctx.buildMini();
  assert.equal(s.letters(s.mini).join(''),'STARENOTLISEDARP');
  s.get('#review-selected').textContent='STALE WORD';
  // No results yet: the state update itself must invalidate the old board.
  s.state('second',second,null);
  const current=s.letters(s.mini);
  assert.equal(current[0],'Qu');
  assert.deepEqual(current,second.map(t=>t==='qu'?'Qu':t.toUpperCase()));
  s.ctx.renderResults();
  assert.deepEqual(s.letters(s.mini),current);
  assert.equal(s.get('#review-selected').text,'');
  assert.equal(s.get('#review-selected').hidden,true);
  assert.equal(s.get('#review-caption').hidden,true);
  // Scoring messages cannot replace the board actually played.
  s.state('second',first,[]);
  assert.deepEqual(s.letters(s.mini),current);
});
