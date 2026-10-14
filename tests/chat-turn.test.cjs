const test = require('node:test');
const assert = require('node:assert/strict');
const {createChatTurn} = require('../app/static/chat-turn.js');
class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.attributes={}; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key,value) { this.attributes[key]=value; }
}
global.document={createElement:tag=>new Element(tag)};
test('question and complete assistant turn have distinct roles and alignment hooks',()=>{
  const log=new Element('div');
  const user=createChatTurn(log,'user','2026年第一学期');
  const assistant=createChatTurn(log,'assistant','检索中');
  const sources=new Element('section'), followups=new Element('nav');
  assistant.turn.appendChild(sources); assistant.turn.appendChild(followups);
  assert.equal(log.children.length,2);
  assert.equal(user.turn.className,'chat-turn chat-turn-user');
  assert.equal(assistant.turn.className,'chat-turn chat-turn-assistant');
  assert.equal(user.turn.attributes['aria-label'],'你');
  assert.equal(assistant.turn.attributes['aria-label'],'晓庄助手');
  assert.ok(assistant.turn.children.includes(sources)&&assistant.turn.children.includes(followups));
  assert.ok(!user.turn.children.includes(sources));
});
test('questions remain literal text',()=>{
  const {box}=createChatTurn(new Element('div'),'user','<img onerror=alert(1)>');
  assert.equal(box.textContent,'<img onerror=alert(1)>');
  assert.equal(box.innerHTML,undefined);
});
