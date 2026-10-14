const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  const ask={disabled:false},chosen=[];
  const document={getElementById:()=>ask,createElement:tag=>({tag,children:[],attrs:{},handlers:{},appendChild(x){this.children.push(x);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.handlers[k]=f;}})};
  const window={};
  vm.runInNewContext(fs.readFileSync('app/static/followups.js','utf8'),{window,document});
  return {ask,chosen,render:rows=>window.campusFollowups(rows,row=>chosen.push(row))};
}
test('renders accessible question buttons as literal text, capped at three',()=>{
  const s=setup(),group=s.render([{question:'<img onerror=alert(1)>',competition_id:null},...Array(4).fill({question:'问题'})]);
  assert.equal(group.attrs['aria-label'],'你是否想问');assert.equal(group.children.length,4);
  assert.equal(group.children[1].textContent,'<img onerror=alert(1)>');assert.equal(group.children[1].type,'button');
});
test('click retains selected answer scope and refuses concurrent submission',()=>{
  const s=setup(),item={question:'这个赛事报名有哪些要求？',competition_id:'event-1'},group=s.render([item]);
  s.ask.disabled=true;group.children[1].handlers.click();assert.equal(s.chosen.length,0);
  s.ask.disabled=false;group.children[1].handlers.click();assert.equal(s.chosen[0],item);
});
test('old and new response groups keep separate callbacks',()=>{
  const s=setup(),one=s.render([{question:'档案',competition_id:null}]),two=s.render([{question:'组队',competition_id:'event-2'}]);
  two.children[1].handlers.click();one.children[1].handlers.click();assert.deepEqual(s.chosen.map(x=>x.question),['组队','档案']);
});
test('missing or malformed suggestions produce no empty section',()=>{
  const s=setup();assert.equal(s.render(undefined),null);assert.equal(s.render([{question:2},{question:''}]),null);
});
