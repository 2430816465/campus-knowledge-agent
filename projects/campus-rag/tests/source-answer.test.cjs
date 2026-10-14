const test = require('node:test');
const assert = require('node:assert/strict');
const {renderSourceAnswer} = require('../app/static/source-answer.js');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';}
  appendChild(child){this.children.push(child);return child;}
}
global.document={createElement: tag=>new Element(tag)};
const response=(changes={})=>({mode:'verified_source_lookup',lookup_notice:'核对范围',
  source_sections:[{title:'通知',published_at:'2026-10-09',text:'完整条件；但例外保留。'},
                   {title:'旧通知',text:'另一版本，不合并。'}],...changes});
test('whole notices remain independent expandable sections, first open',()=>{
  const box=new Element('div');
  assert.equal(renderSourceAnswer(box,response()),true);
  const sections=box.children.filter(x=>x.tag==='details');
  assert.equal(sections.length,2);
  assert.equal(sections[0].open,true);
  assert.equal(sections[1].open,false);
  assert.equal(sections[0].children[1].textContent,'完整条件；但例外保留。');
  assert.equal(sections[1].children[1].textContent,'另一版本，不合并。');
});
test('ambiguous annual notice does not open a historical version as the answer',()=>{
  const box=new Element('div');
  renderSourceAnswer(box,response({lookup_needs_version:true}));
  assert.ok(box.children.filter(x=>x.tag==='details').every(s=>!s.open));
});
test('titles and source text are rendered as text, never markup',()=>{
  const box=new Element('div');
  renderSourceAnswer(box,response({source_sections:[{title:'<img onerror=alert(1)>',text:'<script>secret()</script>'}]}));
  const section=box.children.find(x=>x.tag==='details');
  assert.ok(section.children[0].textContent.includes('<img onerror=alert(1)>'));
  assert.equal(section.children[1].textContent,'<script>secret()</script>');
  assert.ok(section.children.every(x=>x.innerHTML===undefined));
});
test('ordinary model answers and malformed sections retain normal text renderer',()=>{
  for(const changes of [{mode:'grounded_explanation'},{source_sections:[]},{source_sections:[null]},
      {source_sections:[{title:'notice',text:5}]}]){
    const box=new Element('div');box.textContent='unchanged';
    assert.equal(renderSourceAnswer(box,response(changes)),false);
    assert.equal(box.textContent,'unchanged');
    assert.equal(box.children.length,0);
  }
});
