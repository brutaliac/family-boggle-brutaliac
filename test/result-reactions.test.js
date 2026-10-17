'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}
test('clicking a named custom reaction adds it as the current user and preserves other reactions',()=>{
  const other={from:'Alex',fromId:'alex',toId:'sam',key:'cat'};
  const S={connected:true,meId:'you',name:'Taylor',game:{results:[],fx:[other]}};
  const sent=[],bursts=[];
  const ctx=vm.createContext({S,FX:[{k:'cat',n:'Dancing cat'},{k:'joe',n:'Joe Cool'}],
    send:m=>sent.push(m),rxClose(){},renderResults(){},fxBurst:(...args)=>bursts.push(args),fxFace:d=>d.k,
    h(tag,props,...children){return {tag,...props,children,handlers:{},append(n){this.children.push(n);},addEventListener(k,fn){this.handlers[k]=fn;}};}});
  vm.runInContext(section('function fxMine(', 'let fxHeldAt=')+section('function fxChips(', '/* ---------- chat ---------- */'),ctx);
  const chip=ctx.fxChips('sam').children[0];
  assert.equal(chip.tag,'button');assert.equal(chip.children[1].text,'Alex');
  let stopped=false;
  chip.handlers.click({stopPropagation(){stopped=true;}});
  assert(stopped);assert.equal(sent[0].t,'burst');assert.equal(sent[0].key,'cat');assert.equal(sent[0].to,'sam');
  assert.equal(S.game.fx.length,2);assert.equal(S.game.fx[0],other);
  assert.equal(S.game.fx[1].from,'Taylor');assert.equal(S.game.fx[1].fromId,'you');assert.equal(S.game.fx[1].key,'cat');
  assert.equal(bursts.length,1);
  const mine=ctx.fxChips('sam').children.find(x=>x.class.includes('mine'));
  assert.equal(mine.children[1].text,'You');assert.equal(mine['aria-pressed'],'true');
  mine.handlers.click({stopPropagation(){}});
  assert.equal(S.game.fx.length,1);assert.equal(S.game.fx[0],other);
  ctx.fxReact('sam','joe');
  ctx.fxChips('sam').children[0].handlers.click({stopPropagation(){}});
  assert.equal(S.game.fx.length,2);assert.equal(S.game.fx[1].key,'cat');
});
