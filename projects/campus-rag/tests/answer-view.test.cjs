const test=require('node:test');
const assert=require('node:assert/strict');
const {renderAnswerView,safeURL}=require('../app/static/answer-view.js');
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.classList={add:()=>{}};}
  appendChild(child){this.children.push(child);return child;}
}
global.document={createElement:tag=>new Element(tag)};
const flatten=e=>[e,...e.children.flatMap(flatten)];
test('answer, full original and co-located resources have independent typography hooks',()=>{
  const box=new Element('div');
  renderAnswerView(box,{answer_view:{label:'助手回答',paragraphs:['简明结论。'],groups:[{title:'通知',url:'https://example.com',
    quotes:[{ref:1,text:'完整规则，但特殊情况除外。',location:'段落1'}],attachments:[{title:'申请表',url:'https://example.com/form'}]}]}});
  const nodes=flatten(box);
  assert.ok(nodes.some(e=>e.className==='assistant-answer'));
  assert.ok(nodes.some(e=>e.className==='source-quote'&&e.textContent==='完整规则，但特殊情况除外。'));
  const details=nodes.find(e=>e.tag==='details');assert.ok(!details.open);
  const resources=nodes.find(e=>e.className==='source-resources');
  assert.equal(resources.children.filter(e=>e.tag==='a').length,2);
  assert.notEqual(resources.children[1].className,resources.children[2].className);
});
test('model text and attachment titles cannot inject HTML or credential URLs',()=>{
  const box=new Element('div');
  renderAnswerView(box,{answer_view:{label:'助手回答',paragraphs:['<img onerror=x>'],groups:[{title:'<script>x</script>',url:'javascript:x',quotes:[],attachments:[]}]}});
  assert.ok(flatten(box).some(e=>e.textContent==='<img onerror=x>'));
  assert.ok(flatten(box).every(e=>e.innerHTML===undefined));
  assert.equal(safeURL('https://u:p@example.com'),null);
});
test('long replies are collapsed without truncating any condition or exception',()=>{
  const box=new Element('div');const full='必要条件。'.repeat(100)+'但特殊情况除外。';
  renderAnswerView(box,{answer_view:{label:'助手回答',paragraphs:[full],groups:[]}});
  const nodes=flatten(box);const detail=nodes.find(e=>e.className==='complete-answer');
  assert.ok(detail&&!detail.open);
  assert.ok(flatten(detail).some(e=>e.textContent===full));
  assert.ok(nodes.some(e=>e.textContent?.includes('全部条件与例外')));
});
test('visible original URL and provenance distinguish an official page from an unverified search lead',()=>{
  const box=new Element('div');
  renderAnswerView(box,{answer_view:{label:'联网查询',paragraphs:['核验原文'],groups:[
    {title:'官方通知',url:'https://cet.neea.edu.cn/notice',source_type:'official',checked_at:'2026-10-12T00:00:00Z',cached:true,quotes:[]},
    {title:'搜索线索',url:'https://example.com/advice',source_type:'unverified',quotes:[]}]}});
  const nodes=flatten(box);
  assert.ok(nodes.some(e=>e.textContent==='原网址：https://cet.neea.edu.cn/notice'));
  assert.ok(nodes.some(e=>e.textContent?.includes('正文与发布机构未核实')));
  assert.ok(nodes.some(e=>e.textContent?.includes('60秒内缓存')));
});
test('semester interpretation is visible separately from literal policy evidence',()=>{
  const box=new Element('div');
  renderAnswerView(box,{answer_view:{label:'原文摘答',context_note:'按2026—2027学年第一学期理解，即2026年秋季。',paragraphs:['完整报名日期。'],groups:[]}});
  assert.ok(flatten(box).some(e=>e.className==='context-interpretation'&&e.textContent.includes('2026年秋季')));
  assert.ok(flatten(box).some(e=>e.tag==='p'&&e.textContent==='完整报名日期。'));
});
