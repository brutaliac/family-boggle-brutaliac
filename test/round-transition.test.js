'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function extract(start,end){const a=html.indexOf(start);return html.slice(a,html.indexOf(end,a));}
function setup(){
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{classList:{toggle(k,on){on?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)},
        firstElementChild:{style:{}},attrs:{},toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;}});
    }
    return elements.get(id);
  };
  const calls=[];
  const ctx={S:{phase:'play',game:{duration:90,results:null},name:'You',opt:{duration:90,shared:'count'}},$,lastTick:99,
    fmt:left=>String(Math.ceil(left/1000)),sfx:{tick:final=>calls.push(final)},
    chatSet:()=>calls.push('chat closed'),setOpen:()=>{},rxClose:()=>{},send:()=>calls.push('start'),render:()=>{}};
  vm.createContext(ctx);
  vm.runInContext(extract('function resultsLoading(){','let lastPhase=null')+extract('function startRound(){','/* ---------- board ---------- */'),ctx);
  return {ctx,$,calls};
}
test('countdown warns at 15 seconds, intensifies at 5, and resets for a new round',()=>{
  const {ctx,$,calls}=setup(),hud=$('#v-play .hud');
  ctx.updateClock(16000);assert.equal(hud.classList.contains('time-warning'),false);
  ctx.updateClock(15000);assert.equal(hud.classList.contains('time-warning'),true);
  assert.equal(hud.classList.contains('time-critical'),false);
  ctx.updateClock(5000);ctx.updateClock(4800);
  assert.equal(hud.classList.contains('time-critical'),true);
  assert.deepEqual(calls,[false]); // No duplicate tick in the same second.
  ctx.updateClock(90000);
  assert.equal(hud.classList.contains('time-critical'),false);
  assert.equal(hud.classList.contains('time-warning'),false);
  assert.equal($('#bar').firstElementChild.style.width,'100%');
});
test('all app and dialog controls lock while scoring, reject a new round, and unlock when scores arrive',()=>{
  const {ctx,$,calls}=setup();
  ctx.S.phase='done';ctx.S.viewLobby=true;ctx.syncScoringLock();
  for(const id of ['#app','#settings','#chat','#rxpop'])assert.equal($(id).inert,true);
  assert.equal(ctx.S.viewLobby,false);
  assert.equal($('#v-results').attrs['aria-busy'],'true');
  ctx.startRound();assert.equal(calls.includes('start'),false);
  ctx.S.game.results=[];ctx.syncScoringLock();
  for(const id of ['#app','#settings','#chat','#rxpop'])assert.equal($(id).inert,false);
  assert.equal($('#v-results').attrs['aria-busy'],'false');
  ctx.startRound();assert.equal(calls.includes('start'),true);
  assert.equal($('#round-announcement').textContent,'Results are ready.');
});
test('the final board stays visible but inert during its fade, then yields to results; cancellation restores it',()=>{
  const play={hidden:false,inert:false,classList:{add(){},remove(){}}};
  const timers=new Map();let next=0,renders=0,reduced=false;
  const ctx={S:{game:{id:'round'}},$:()=>play,reduceMotion:()=>reduced,updateClock:()=>{},render:()=>renders++,
    setTimeout(fn,ms){assert.equal(ms,300);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(ctx);
  vm.runInContext(extract('let boardExit=null;','function render(){'),ctx);
  assert.equal(ctx.fadeBoardOut(),true);
  assert.equal(play.hidden,false);assert.equal(play.inert,true);
  ctx.fadeBoardOut();assert.equal(timers.size,1); // Score updates must not restart the fade.
  timers.get(1)();
  assert.equal(play.hidden,true);assert.equal(play.inert,false);assert.equal(renders,1);
  play.hidden=false;ctx.fadeBoardOut();ctx.cancelBoardExit();
  assert.equal(play.hidden,false);assert.equal(play.inert,false);assert.equal(timers.has(2),false);
  reduced=true;assert.equal(ctx.fadeBoardOut(),false);
});
