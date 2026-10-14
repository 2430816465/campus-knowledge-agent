const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(hash='') {
  const elements={}, listeners={}, timers=[];
  for(const id of ['campus-pet','consult','pet-close','pet-drag-handle','question','ask']) elements[id]={
    id,hidden:id==='consult',dataset:{state:'idle'},style:{},attrs:{},handlers:{},disabled:false,
    addEventListener(n,f){this.handlers[n]=f;},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},
    getBoundingClientRect(){return {left:parseFloat(this.style.left)||600,top:parseFloat(this.style.top)||400,width:this.id==='consult'?400:100,height:this.id==='consult'?500:100};},
    setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}
  };
  const link={addEventListener(n,f){this[n]=f;}};
  let mutation;
  const context={window:{addEventListener(n,f){listeners[n]=f;}},document:{documentElement:{clientWidth:1000},getElementById:id=>elements[id],querySelectorAll:()=>[link],querySelector:()=>null,addEventListener(n,f){listeners[n]=f;}},location:{hash},innerWidth:1000,innerHeight:800,setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},MutationObserver:class{constructor(f){mutation=f;}observe(){}}};
  vm.runInNewContext(fs.readFileSync('app/static/pet-widget.js','utf8'),context);
  const event=(x=650,y=450)=>({button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null}});
  return {e:elements,context,listeners,timers,link,mutation:()=>mutation(),event};
}
test('click opens accessible dialog, waves, focuses input, then idles',()=>{const {e,timers}=setup();e['campus-pet'].handlers.click();assert.equal(e.consult.hidden,false);assert.equal(e['campus-pet'].attrs['aria-expanded'],'true');assert.equal(e['campus-pet'].dataset.state,'wave');assert.equal(e.question.focused,true);timers.at(-1)();assert.equal(e['campus-pet'].dataset.state,'idle');});
test('close preserves dialog contents and restores launcher focus',()=>{const {e}=setup();e['campus-pet'].handlers.click();e['pet-close'].handlers.click();assert.equal(e.consult.hidden,true);assert.equal(e['campus-pet'].focused,true);});
test('busy and completed requests switch thinking and idle',()=>{const s=setup();s.e.ask.disabled=true;s.mutation();assert.equal(s.e['campus-pet'].dataset.state,'thinking');s.e.ask.disabled=false;s.mutation();assert.equal(s.e['campus-pet'].dataset.state,'idle');});
test('drag clamps launcher to viewport and suppresses accidental open',()=>{const {e,event}=setup();const p=e['campus-pet'];p.handlers.pointerdown(event());p.handlers.pointermove(event(-1000,-1000));p.handlers.pointerup(event());p.handlers.click();assert.equal(p.style.left,'8px');assert.equal(p.style.top,'8px');assert.equal(e.consult.hidden,true);p.handlers.pointerdown(event());p.handlers.pointerup(event());p.handlers.click();assert.equal(e.consult.hidden,false);});
test('header drag clamps panel without toggling it',()=>{const {e,event}=setup();e['campus-pet'].handlers.click();const h=e['pet-drag-handle'];h.handlers.pointerdown(event());h.handlers.pointermove(event(5000,5000));h.handlers.pointerup(event());assert.equal(e.consult.style.left,'592px');assert.equal(e.consult.style.top,'292px');assert.equal(e.consult.hidden,false);});
test('Escape closes panel; hash and navigation links open it',()=>{const s=setup('#consult');assert.equal(s.e.consult.hidden,false);s.listeners.keydown({key:'Escape'});assert.equal(s.e.consult.hidden,true);s.link.click({preventDefault(){}});assert.equal(s.e.consult.hidden,false);});
test('pointercancel releases drag and next click still works',()=>{const {e,event}=setup();const p=e['campus-pet'];p.handlers.pointerdown(event());p.handlers.pointermove(event(800,600));p.handlers.pointercancel(event());p.handlers.pointerdown(event());p.handlers.pointerup(event());p.handlers.click();assert.equal(e.consult.hidden,false);});
test('resize reclamps manually positioned panel',()=>{const s=setup();s.e['campus-pet'].handlers.click();s.e.consult.style.left='900px';s.e.consult.style.top='700px';s.listeners.resize();assert.equal(s.e.consult.style.left,'592px');assert.equal(s.e.consult.style.top,'292px');});
