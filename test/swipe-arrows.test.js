'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function swipeArrowPath('), html.indexOf('function buildBoard(')) +
  html.slice(html.indexOf('const SWIPE_ARROWS='), html.indexOf('let swipeFrame=')) +
  ';globalThis.settings=SWIPE_ARROWS;', ctx);
function rect(x,y,size) {
  return {left:x-size/2,top:y-size/2,width:size,height:size,layoutWidth:size/1.04};
}
function points(d) {
  assert(!d.includes('NaN'));
  return [...d.matchAll(/[ML](-?[\d.]+(?:e[+-]?\d+)?),(-?[\d.]+(?:e[+-]?\d+)?)/g)].map(m=>[Number(m[1]),Number(m[2])]);
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
test('swipe arrowheads and shafts retain their CSS-pixel size across resolutions',()=>{
  for(const size of [44,64,90,110])for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,ux=Math.cos(angle),uy=Math.sin(angle);
    const style=ctx.settings[i%2?'corner':'side'];
    const p=points(ctx.swipeArrowPath(rect(0,0,size),rect(ux*(size+8),uy*(size+8),size),style));
    assert.equal(p.length,7);
    assert(Math.abs(distance(p[0],p[3])-8)<1e-8);
    assert(Math.abs(distance(p[4],p[6])-20)<1e-8);
    const base=[(p[4][0]+p[6][0])/2,(p[4][1]+p[6][1])/2];
    assert(Math.abs(distance(base,p[5])-style.tip)<1e-8);
  }
});
test('saved arrow placement rotates consistently in all four side and corner directions',()=>{
  for(const diagonal of [false,true]) {
    const style=ctx.settings[diagonal?'corner':'side'];
    const angle=diagonal?Math.PI/4:0;
    const base=points(ctx.swipeArrowPath(rect(0,0,82),rect(Math.cos(angle)*100,Math.sin(angle)*100,82),style));
    for(let turn=1;turn<4;turn++){
      const rotation=turn*Math.PI/2,c=Math.cos(rotation),s=Math.sin(rotation);
      const actual=points(ctx.swipeArrowPath(rect(0,0,82),rect(Math.cos(angle+rotation)*100,Math.sin(angle+rotation)*100,82),style));
      base.forEach(([x,y],i)=>{
        assert(Math.abs(actual[i][0]-(x*c-y*s))<1e-6);
        assert(Math.abs(actual[i][1]-(x*s+y*c))<1e-6);
      });
    }
  }
});
