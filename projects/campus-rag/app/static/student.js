const $ = id => document.getElementById(id);
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = url => {try {const u=new URL(url,location.origin);return ['http:','https:'].includes(u.protocol)?escapeHTML(u.href):'#';}catch{return '#';}};
const statusNames={unknown:'截止时间未核实',start_unknown:'开始时间未核实',open:'报名中',closed:'已截止',not_started:'尚未开始',deadline_day_unknown:'截止当天时刻未知',deadline_boundary_unknown:'截止边界需核实'};
let offset=0,total=0,items=[],context=null,history=[];
async function api(path,options={}){
  const r=await fetch(path,options);
  if(!r.ok){
    const raw=await r.text();let body;try{body=JSON.parse(raw);}catch{}
    const detail=typeof body?.detail==='string'?body.detail.trim():'';
    const fallback={401:'登录已失效，请刷新页面后重新登录。',403:'当前账号没有访问权限，请确认登录账号。',429:'提问较频繁，请稍等片刻再试。',502:'服务暂时连接不上，请稍后重试。',503:'服务暂时繁忙，请稍后重试。'};
    throw Error(detail&&!/<\/?[a-z][^>]*>/i.test(detail)?detail:(fallback[r.status]||`请求失败，请稍后重试（HTTP ${r.status}）。`));
  }
  return r.json();
}
const initialChatHint=$('chat-log').querySelector('.chat-hint')?.cloneNode(true);
function setChatBusy(busy){
  $('ask').disabled=busy;$('ask').textContent=busy?'正在查阅资料…':'查阅并回答';
  if($('new-chat'))$('new-chat').disabled=busy;
}
function startNewChat(){
  if($('ask').disabled)return;
  history=[];context=null;$('chat-competition').value='';$('question').value='';
  const log=$('chat-log');log.replaceChildren();
  if(initialChatHint)log.appendChild(initialChatHint.cloneNode(true));
  log.scrollTop=0;$('question').focus({preventScroll:true});
}
$('new-chat')?.addEventListener('click',startNewChat);
function jsonPost(body){return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
function dateValue(field){return field?.value?escapeHTML(field.value.replace('T',' ').replace(':00+08:00',''))+(field.precision==='date'?'（仅日期）':''):'未核实';}
function editionLabel(c){return c.record_kind==='catalog'?`${c.catalog_year||'未知年度'}目录收录 · 赛事年度${c.year??'未知'}`:`赛事年度${c.year??'未知'}`;}
async function load(){
  const params=new URLSearchParams();for(const [k,v] of new FormData($('filters')))if(v)params.set(k,v);params.set('offset',offset);params.set('limit','10');
  $('competition-list').innerHTML='<p>正在查询校园信息…</p>';
  try{const result=await api('/api/campus-information?'+params);items=result.items;total=result.total;$('result-count').textContent=`合并重复后共 ${total} 条校园信息 · 发布时间从新到旧`;
    $('competition-list').innerHTML=items.length?items.map(d=>`<article class="competition-item"><div><h3>${escapeHTML(d.title)}</h3><div class="meta"><span>${escapeHTML(({notice:'通知与活动',policy:'制度与办事',catalog:'目录资料'})[d.kind]||'校园资料')}</span><span>${escapeHTML(d.publisher||'发布单位未标注')}</span><span>发布时间：${escapeHTML(d.published_at||'未知')}</span><span class="status ${d.status==='published'?'verified':'pending'}">${d.status==='published'?'教师已审核发布':'原文待教师审核'}</span></div><p class="small">${d.sources.length>1?`相同内容合并 ${d.sources.length} 个来源；`:""}${d.related.length?`附 ${d.related.length} 份图片或附件`:""}</p><div class="actions"><button class="quiet" data-information="${escapeHTML(d.id)}">查看资料内容</button>${d.source_url?`<a href="${safeLink(d.source_url)}" target="_blank" rel="noopener noreferrer">查看官网原文</a>`:''}</div></div></article>`).join(''):'<div class="empty"><h3>当前条件下没有可查阅的资料</h3><p>可清除筛选重新查询。未收录不代表官网不存在。</p></div>';
    $('pages').textContent=`${total?Math.floor(offset/10)+1:0} / ${Math.ceil(total/10)} 页`;$('prev').disabled=offset===0;$('next').disabled=offset+10>=total;
  }catch(e){$('competition-list').textContent=e.message;}
}
async function informationDetail(id){
 try{const result=await api('/api/documents/'+encodeURIComponent(id)+'/chunks');const d=result.document;
 $('detail-content').innerHTML=`<h2>${escapeHTML(d.title)}</h2><p>发布时间：${escapeHTML(d.published_at||'未知')} · ${d.status==='published'?'教师已审核发布':'原文待教师审核'}</p><p class="warning">历史资料须核对适用时间，具体要求以官网原文为准。</p>${result.chunks.map(c=>`<p class="small">${escapeHTML(c.location)}</p><p class="information-text">${escapeHTML(c.text)}</p>`).join('')||'<p>暂无可展示正文，请查看官网原文。</p>'}`;
 const item=items.find(x=>x.id===id)||items.flatMap(x=>x.related||[]).find(x=>x.id===id);
 const extra=document.createElement('section');extra.className='source-resources';
 const sources=item?.sources||[];
 extra.innerHTML=`<h3>原网页与附件</h3>${d.source_url?`<a class="resource-web" href="${safeLink(d.source_url)}" target="_blank" rel="noopener noreferrer">原网页：${escapeHTML(d.title)}</a>`:''}${sources.length>1?`<h3>相同内容的官网来源</h3>${sources.map(x=>`<p>${x.source_url?`<a href="${safeLink(x.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(x.source_url)}</a>`:escapeHTML(x.title)} · ${x.status==='published'?'教师已审核发布':'原文待教师审核'}</p>`).join('')}`:''}${item?.related?.length?`<h4>正文图片与附件</h4>${item.related.map(x=>`<p>${escapeHTML(x.title)} <button class="quiet" data-related="${escapeHTML(x.id)}">查看内容</button> ${x.source_url?`<a href="${safeLink(x.source_url)}" target="_blank" rel="noopener noreferrer" class="resource-attachment">附件原件</a>`:''}</p>`).join('')}`:''}`;
 $('detail-content').insertBefore(extra,$('detail-content').querySelector('.information-text')?.previousElementSibling||null);
 if(!$('detail').open)$('detail').showModal();}catch(e){alert(e.message);}
}
$('detail-content').addEventListener('click',e=>{const button=e.target.closest('[data-related]');if(button)informationDetail(button.dataset.related);});
async function detail(id){try{const c=await api('/api/competitions/'+id);$('detail-content').innerHTML=`<h2>${escapeHTML(c.name)}</h2><p class="warning">${escapeHTML(statusNames[c.registration_status])}。关键字段与完整资格须核对来源。</p><p><a href="${safeLink(c.source.source_url)}" target="_blank" rel="noopener noreferrer">打开官方通知</a> · <a href="/api/documents/${c.source.id}/download">下载保存的原始文件</a></p><div class="detail-field"><strong>已确认字段</strong><pre>${escapeHTML(JSON.stringify(c.fields,null,2))}</pre></div><h3>候选与支持原文</h3>${c.candidates.filter(v=>v.status!=='rejected').map(v=>`<div class="detail-field"><strong>${escapeHTML(v.label)} · ${escapeHTML(v.status==='confirmed'?'已确认':'待核实')}</strong><pre>${escapeHTML(JSON.stringify(v.value))}</pre><p>${escapeHTML(v.quote)}</p></div>`).join('')||'<p>暂无候选，需导入适用通知。</p>'}<details><summary>查看完整抽取正文</summary><div id="full-text"></div></details>`;const doc=await api('/api/documents/'+c.source.id+'/chunks');$('full-text').innerHTML=doc.chunks.map(x=>`<p class="small">${escapeHTML(x.location)}</p><p>${escapeHTML(x.text)}</p>`).join('');attachEligibility(c);$('detail').showModal();}catch(e){alert(e.message);}}
$('competition-list').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.information)informationDetail(button.dataset.information);if(button.dataset.detail)detail(button.dataset.detail);if(button.dataset.consult){context=button.dataset.consult;$('chat-competition').value=context;window.campusAssistant.open();}});
$('filters').addEventListener('submit',e=>{e.preventDefault();offset=0;load();});$('reset').onclick=()=>{$('filters').reset();offset=0;load();};$('prev').onclick=()=>{offset=Math.max(0,offset-10);load();};$('next').onclick=()=>{offset+=10;load();};$('close-detail').onclick=()=>$('detail').close();
document.addEventListener('click',e=>{const button=e.target.closest('[data-question]');if(!button||$('ask').disabled)return;$('question').value=button.dataset.question;if(button.dataset.campus)$('chat-competition').value='';window.campusAssistant.open();});
$('chat-form').addEventListener('submit',async e=>{e.preventDefault();const question=$('question').value.trim();if(!question||$('ask').disabled)return;const selected=$('chat-competition').value||null;const userTurn=window.campusChatTurn($('chat-log'),'user',question);$('chat-log').querySelector('.chat-hint')?.remove();setChatBusy(true);const {turn,box}=window.campusChatTurn($('chat-log'),'assistant','正在检索并核对原文…');const chat=$('chat-log');chat.scrollTop+=userTurn.turn.getBoundingClientRect().top-chat.getBoundingClientRect().top-12;let sourceReply=false;try{const result=await api('/api/chat',jsonPost({question,competition_id:selected,history,web_search:$('allow-web-search')?.checked!==false}));const answerView=window.campusAnswerView?.(box,result)||false;sourceReply=answerView||window.campusSourceAnswer?.(box,result)||false;if(!sourceReply)box.textContent=result.answer;const sources=document.createElement('div');sources.className='source-block';sources.innerHTML=(sourceReply&&!answerView?`<details><summary>查看 ${result.sources.length} 段原文的位置与来源</summary>`:'')+(answerView?[]:result.sources).map((s,i)=>`<p>[${i+1}] <a href="${safeLink(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.title)}</a><br>${s.context?`适用章节：${escapeHTML(s.context.replace(/\n/g," / "))}<br>`:""}${escapeHTML(s.location)} · 发布 ${escapeHTML(s.published_at||'日期未知')} · 版本 ${s.version}</p>`).join('')+(sourceReply&&!answerView?'</details>':'')+`<p>${escapeHTML(result.warnings?.join('；')||'')}<br>本次查询：${escapeHTML(result.query_time)} · ${result.elapsed_seconds} 秒</p>`;turn.appendChild(sources);history=[...history,{competition_id:result.competition_id||selected,document_ids:result.document_ids||[],question:result.context_question||result.resolved_question||question}].slice(-30);$('question').value='';const replyHistory=history.map(row=>({...row,document_ids:[...row.document_ids]}));const suggestions=window.campusFollowups(result.followup_questions,item=>{history=replyHistory.map(row=>({...row,document_ids:[...row.document_ids]}));$('chat-competition').value=item.competition_id||'';$('question').value=item.question;$('chat-form').requestSubmit();});if(suggestions)turn.appendChild(suggestions);}catch(err){box.textContent='查询失败：'+err.message;}finally{setChatBusy(false);if(sourceReply){const chat=$('chat-log');chat.scrollTop+=userTurn.turn.getBoundingClientRect().top-chat.getBoundingClientRect().top-12;}else $('chat-log').scrollTop=$('chat-log').scrollHeight;}});
$('feedback-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/feedback',jsonPost({message:$('feedback-message').value}));$('feedback-status').textContent='已保存在本机，等待教师查看';$('feedback-message').value='';}catch(err){$('feedback-status').textContent=err.message;}});
api('/api/health').then(h=>{$('health').textContent=h.chat_ready&&h.embedding_ready?'本地问答服务可用':'模型服务待恢复；可以先查看资料';}).catch(e=>{$('health').textContent=e.message;});
api('/api/coverage').then(c=>{$('coverage').textContent=`已导入 ${c.documents} 份公开资料，${c.searchable} 份可检索，教师已发布 ${c.published} 份。${c.scope}`;if(c.archive){const a=c.archive;$('archive-progress').textContent=`采集快照：已归档 ${a.states?.fetched||0} 个网址，${a.unique_blobs||0} 份去重内容；待抓取 ${a.states?.pending||0} 个网址。${new Date(a.checked_at).toLocaleString('zh-CN')} 更新。登录系统、不可达页面及未解析附件不计作已完成。`;}}).catch(e=>{$('coverage').textContent='资料范围加载失败：'+e.message;});
api('/api/competitions?limit=100').then(fillCompetitionOptions).catch(()=>{$('chat-competition').title='赛事列表暂未加载，请稍后刷新；仍可自动查找';});load();

async function fillCompetitionOptions(first){
 const all=[...first.items];let next=all.length;
 while(next<first.total){const page=await api('/api/competitions?limit=100&offset='+next);if(!page.items.length)break;all.push(...page.items);next+=page.items.length;}
 $('chat-competition').innerHTML='<option value="">自动查找校园资料</option>'+all.map(x=>`<option value="${x.competition_id}">${escapeHTML(x.name)}</option>`).join('');
}
function attachEligibility(c){
 const section=document.createElement('section');section.innerHTML=`<h3>核对个人报名条件</h3><p>结果分为已满足、不满足、还缺条件；未核实规则不会默认通过。</p><form id="eligibility-form"><div class="advanced-grid"><label>学院<input name="college"></label><label>专业<input name="major"></label><label>学段<select name="education"><option value="">未填写</option><option>本科生</option><option>研究生</option></select></label><label>年级<input name="grade" placeholder="如2024级"></label><label>团队人数<input name="team_size" type="number" min="1" max="100"></label></div><button class="quiet">核对已确认规则</button><p id="eligibility-result" aria-live="polite"></p></form>`;
 $('detail-content').appendChild(section);
 $('eligibility-form').onsubmit=async e=>{e.preventDefault();const data={};for(const [k,v] of new FormData(e.target))if(v)data[k]=k==='team_size'?Number(v):v;try{const r=await api('/api/competitions/'+c.competition_id+'/eligibility',jsonPost(data));$('eligibility-result').textContent=({met:'已满足已核实条件',not_met:'存在明确不满足条件',need_information:'还缺条件或规则需核实'})[r.status]+'。'+[...r.satisfied,...r.unmet,...r.missing].join('；');}catch(err){$('eligibility-result').textContent=err.message;}};
}
