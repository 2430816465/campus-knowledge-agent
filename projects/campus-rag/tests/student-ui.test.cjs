const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.handlers={};this.dataset={};this.value='';this.checked=true;this.disabled=false;this.scrollTop=0;this.scrollHeight=100;this.className='';this.textContent='';}
  appendChild(child){child.parent=this;this.children.push(child);return child;}
  replaceChildren(...children){this.children.forEach(child=>child.parent=null);this.children=[];children.forEach(child=>this.appendChild(child));}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  querySelector(selector){return this.children.find(child=>selector==='.chat-hint'&&child.className==='chat-hint')||null;}
  cloneNode(deep){const child=new Element(this.tag);Object.assign(child,{className:this.className,textContent:this.textContent,dataset:{...this.dataset}});if(deep)this.children.forEach(item=>child.appendChild(item.cloneNode(true)));return child;}
  addEventListener(type,handler){this.handlers[type]=handler;}
  getBoundingClientRect(){return {top:0};}
  focus(){this.focused=true;}
}
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const answer={answer:'报名条件请核对原文。',sources:[],document_ids:['document-a'],context_question:'2026年秋季普通话报名条件',elapsed_seconds:1,query_time:'2026-10-13',followup_questions:[]};
async function setup(){
  const elements={},listeners={},requests=[];
  const el=id=>elements[id]||(elements[id]=new Element());
  const hint=new Element();hint.className='chat-hint';hint.textContent='欢迎向晓庄提问';
  const shortcut=new Element('button');shortcut.dataset={question:'档案查询如何办理？',campus:'true'};hint.appendChild(shortcut);el('chat-log').appendChild(hint);
  let respond=()=>json(answer),opens=0;
  const sandbox={
    document:{getElementById:el,createElement:tag=>new Element(tag),addEventListener:(type,handler)=>{listeners[type]=handler;}},
    window:{campusAssistant:{open(){opens++;}},campusFollowups:()=>null,campusChatTurn(log,role,text){const turn=log.appendChild(new Element()),box=turn.appendChild(new Element());box.textContent=text;return {turn,box};}},
    URL,URLSearchParams,FormData:class{*[Symbol.iterator](){}},location:{origin:'https://example.test'},alert(){},
    fetch:async(path,options={})=>{
      if(path==='/api/chat'){requests.push(JSON.parse(options.body));return respond();}
      if(path==='/api/health')return json({chat_ready:true,embedding_ready:true});
      if(path==='/api/coverage')return json({documents:1,searchable:1,published:0,scope:'公开资料'});
      return json({items:[],total:0});
    }
  };
  const context=vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('app/static/student.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {el,context,listeners,requests,get opens(){return opens;},respondWith(fn){respond=fn;},submit(question){el('question').value=question;return el('chat-form').handlers.submit({preventDefault(){}});},newChat(){el('new-chat').handlers.click();}};
}

test('new conversation clears only chat scope, restores the welcome content and preserves web preference',async()=>{
  const s=await setup();s.el('allow-web-search').checked=false;s.el('chat-competition').value='event-a';
  await s.submit('普通话报名条件');await s.submit('还需要什么材料');
  assert.equal(s.requests[1].history[0].question,answer.context_question);
  vm.runInContext("context='event-a'",s.context);
  s.newChat();
  assert.equal(s.el('chat-log').children.length,1);
  assert.equal(s.el('chat-log').children[0].textContent,'欢迎向晓庄提问');
  assert.equal(s.el('chat-competition').value,'');assert.equal(s.el('question').value,'');
  assert.equal(vm.runInContext('context',s.context),null);assert.equal(s.el('allow-web-search').checked,false);
  assert.equal(s.el('question').focused,true);assert.equal(s.el('chat-log').scrollTop,0);
  await s.submit('档案查询如何办理');
  assert.deepEqual(s.requests[2].history,[]);assert.equal(s.requests[2].competition_id,null);assert.equal(s.requests[2].web_search,false);
});

test('restored welcome shortcuts remain usable through delegated events',async()=>{
  const s=await setup();await s.submit('普通话');s.newChat();
  const shortcut=s.el('chat-log').children[0].children[0];s.el('chat-competition').value='event-a';
  s.listeners.click({target:{closest:selector=>selector==='[data-question]'?shortcut:null}});
  assert.equal(s.el('question').value,'档案查询如何办理？');assert.equal(s.el('chat-competition').value,'');assert.equal(s.opens,1);
});

test('in-flight request disables new conversation and cannot be cleared until it finishes',async()=>{
  const s=await setup();let release;s.respondWith(()=>new Promise(resolve=>{release=resolve;}));
  const pending=s.submit('普通话报名条件');
  assert.equal(s.el('ask').disabled,true);assert.equal(s.el('new-chat').disabled,true);
  const turns=s.el('chat-log').children.length;s.newChat();assert.equal(s.el('chat-log').children.length,turns);
  release(json(answer));await pending;
  assert.equal(s.el('ask').disabled,false);assert.equal(s.el('new-chat').disabled,false);
  s.newChat();assert.equal(s.el('chat-log').children[0].className,'chat-hint');
});

test('HTML gateway errors are read once and translated without displaying HTML',async t=>{
  const s=await setup();
  for(const [status,message] of [[401,'登录已失效'],[403,'没有访问权限'],[429,'提问较频繁'],[502,'暂时连接不上'],[503,'暂时繁忙']]){
    await t.test(String(status),async()=>{
      const response=new Response('<html><h1>Bad Gateway</h1></html>',{status});let reads=0;
      const read=response.text.bind(response);response.text=()=>{reads++;return read();};s.context.fetch=async()=>response;
      await assert.rejects(s.context.api('/test'),error=>error.message.includes(message)&&!error.message.includes('<html>'));
      assert.equal(reads,1);
    });
  }
});

test('existing Chinese API detail takes priority, malformed or HTML detail uses a safe fallback',async()=>{
  const s=await setup();
  s.context.fetch=async()=>new Response(JSON.stringify({detail:'本次请求尚未完成，请稍后重试。'}),{status:429});
  await assert.rejects(s.context.api('/test'),/本次请求尚未完成/);
  s.context.fetch=async()=>new Response(JSON.stringify({detail:'<h1>Bad Gateway</h1>'}),{status:502});
  await assert.rejects(s.context.api('/test'),/服务暂时连接不上/);
  s.context.fetch=async()=>new Response('not JSON',{status:500});
  await assert.rejects(s.context.api('/test'),/请求失败，请稍后重试（HTTP 500）/);
});

test('failed chat restores both controls and preserves the typed question for retry',async()=>{
  const s=await setup();s.respondWith(()=>new Response('<html>Bad Gateway</html>',{status:502}));
  await s.submit('普通话报名条件');
  const turns=s.el('chat-log').children;assert.equal(turns[1].children[0].textContent,'查询失败：服务暂时连接不上，请稍后重试。');
  assert.equal(s.el('question').value,'普通话报名条件');assert.equal(s.el('ask').disabled,false);assert.equal(s.el('new-chat').disabled,false);
});
