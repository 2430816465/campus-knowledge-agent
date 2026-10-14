"""小型一次性页面增量：保留原页面、添加可追溯字段录入和资格检查。"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'app'/'static'
p=root/'admin.html';text=p.read_text(encoding='utf-8')
if 'candidate-form' not in text:
    form='''<section class="admin-panel admin-wide"><h2>补充未抽取的关键字段</h2><p>先选赛事与证据片段，再按字段模板录入。保存为待审核候选；依据须来自该通知或附件。</p>
<form id="candidate-form"><label>赛事<select id="candidate-comp" required></select></label><label>证据片段<select id="candidate-chunk" required></select></label><label>支持原文<textarea id="candidate-quote" rows="3" required maxlength="1000"></textarea></label><label>字段<select id="candidate-field"></select></label><label>候选值<textarea id="candidate-value" rows="4" required></textarea></label><label>依据说明<input id="candidate-note" maxlength="1000"></label><button type="submit">保存待审核候选</button></form></section>'''
    text=text.replace('<section id="review-section"',form+'<section id="review-section"')
    p.write_text(text,encoding='utf-8')
p=root/'student.js';text=p.read_text(encoding='utf-8')
text=text.replace("<h3>待核实候选与支持原文</h3>${c.candidates.map", "<h3>候选与支持原文</h3>${c.candidates.filter(v=>v.status!=='rejected').map")
text=text.replace("const doc=await api('/api/documents/'+c.source.id+'/chunks');", "const doc=await api('/api/documents/'+c.source.id+'/chunks');")
text=text.replace("$('detail').showModal();", "attachEligibility(c);$('detail').showModal();")
old="$('chat-competition').innerHTML='<option value=\"\">自动查找</option>'+list.items.map(x=>`<option value=\"${x.competition_id}\">${escapeHTML(x.name)}</option>`).join('');"
new="fillCompetitionOptions(list);"
text=text.replace(old,new)
if 'function attachEligibility' not in text:
    text+='''
async function fillCompetitionOptions(first){
 const all=[...first.items];let next=all.length;
 while(next<first.total){const page=await api('/api/competitions?limit=100&offset='+next);if(!page.items.length)break;all.push(...page.items);next+=page.items.length;}
 $('chat-competition').innerHTML='<option value="">自动查找</option>'+all.map(x=>`<option value="${x.competition_id}">${escapeHTML(x.name)}</option>`).join('');
}
function attachEligibility(c){
 const section=document.createElement('section');section.innerHTML=`<h3>核对个人报名条件</h3><p>结果分为已满足、不满足、还缺条件；未核实规则不会默认通过。</p><form id="eligibility-form"><div class="advanced-grid"><label>学院<input name="college"></label><label>专业<input name="major"></label><label>学段<select name="education"><option value="">未填写</option><option>本科生</option><option>研究生</option></select></label><label>年级<input name="grade" placeholder="如2024级"></label><label>团队人数<input name="team_size" type="number" min="1" max="100"></label></div><button class="quiet">核对已确认规则</button><p id="eligibility-result" aria-live="polite"></p></form>`;
 $('detail-content').appendChild(section);
 $('eligibility-form').onsubmit=async e=>{e.preventDefault();const data={};for(const [k,v] of new FormData(e.target))if(v)data[k]=k==='team_size'?Number(v):v;try{const r=await api('/api/competitions/'+c.competition_id+'/eligibility',jsonPost(data));$('eligibility-result').textContent=({met:'已满足已核实条件',not_met:'存在明确不满足条件',need_information:'还缺条件或规则需核实'})[r.status]+'。'+[...r.satisfied,...r.unmet,...r.missing].join('；');}catch(err){$('eligibility-result').textContent=err.message;}};
}
'''
p.write_text(text,encoding='utf-8')
