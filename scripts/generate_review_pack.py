"""生成100题候选及来源/字段审核清单；未经老师审核不标作金标准。"""
import csv,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Competition,Document,Candidate,Chunk
from app.config import ROOT
from app.tools import search_competitions,doc_dict
AT='2026-10-09T14:00:00+08:00'
questions=[]
with Session() as s:
    pairs=s.execute(select(Competition,Document).join(Document).where(Document.kind=='notice',Document.visibility=='public',Document.status=='pending_review')).all()
    directory=s.execute(select(Competition,Document).join(Document).where(Document.kind=='catalog')).all()
    def add(group,question,comp=None,doc=None,field=None,profile=None,query=None):
        proof=[]
        if comp:
            candidates=s.scalars(select(Candidate).where(Candidate.competition_id==comp.id,Candidate.field==field)).all() if field else []
            for c in candidates:
                chunk=s.get(Chunk,c.chunk_id);proof.append({'candidate_value':c.value,'quote':c.quote,'location':chunk.location,'document_id':chunk.document_id,'candidate_id':c.id,'review_status':c.status})
        questions.append({'id':f'Q{len(questions)+1:03d}','group':group,'question':question,'student_conditions':profile or {},'fixed_query_time':AT,'competition_id':comp.id if comp else None,'source_url':doc.source_url if doc else None,'evidence_candidates':proof,'query':query,'expected_ids_from_current_unverified_database':([x['competition_id'] for x in search_competitions(s,**query,limit=10000,at=AT)['items']] if query is not None else None),'expected_answer_status':'需要教师核验关键值与适用范围；不可编造未收录规则','human_reviewed':False,'gold_standard':False})
    temporal=['校内截止与主办方截止分别是什么？','报名入口与校内办理方式是什么？','在固定查询日是否还能报名，哪些时间依据缺失？','原文未写具体截止时刻时，能否补为23:59？']
    for n in range(20):
        comp,doc=pairs[n%len(pairs)];add('时间与入口',comp.name+'：'+temporal[n//len(pairs)%len(temporal)],comp,doc,'registration' if n%4==1 else 'internal_deadline')
    qualifiers=['本科生是否符合学段限制？','跨专业组队是否有依据？','一年级学生可以参加吗？','三人团队是否符合人数规则？']
    for n in range(20):
        comp,doc=pairs[n%len(pairs)];add('资格',comp.name+'：'+qualifiers[n//len(pairs)%4],comp,doc,'team_size' if n%4==3 else 'eligibility',{'education':'本科生','grade':'2026级','team_size':3})
    procedures=['需要准备哪些材料？','作品提交和报名的流程是什么？','通知与附件是否都已覆盖，哪些内容还需核实？']
    for n in range(15):
        comp,doc=pairs[n%len(pairs)];add('材料流程',comp.name+'：'+procedures[n//len(pairs)%3],comp,doc,'materials')
    queries=[{}, {'registration':'open'},{'registration':'closed'},{'registration':'unknown'},{'year':2026},{'year':2025},{'education':'本科生'},{'education':'研究生'},{'team_size':3},{'recognition':'一类A'},{'recognition':'二类A'},{'q':'数学建模'},{'before':'2026-10-09'},{'after':'2026-10-09'},{'verified':True}]
    for query in queries:add('全量筛选','按条件完整分页列举已收录记录：'+json.dumps(query,ensure_ascii=False),query=query)
    for comp,doc in directory[:10]:add('校内认定',comp.name+'在2026分类目录中如何列示？这是否足以证明当届可报名或奖励可申领？',comp,doc,'recognition')
    cases=['2027年五一数学建模竞赛报名时间是什么？','从未收录的火星创新杯是否能报名？','历史通知能否直接用作当届报名依据？','机器人集训通知标题2026与正文2025冲突，应如何核实？','目录收录年份是否等于赛事举办年份？','附件未解析完成能否说明没有资格限制？','未找到收费条款是否等于免费？','缺少校内报名截止时能否直接采用主办方日期？','来源失效后应显示什么状态？','老师还没有确认认定类别时能否直接获得学分？']
    for q in cases:add('缺资料历史冲突',q)
    for n in range(10):
        comp,doc=pairs[n%len(pairs)];add('多轮简称工具',comp.name+'：先问材料，再追问“那截止时间呢？”；更换年度或赛事后需重新查证。',comp,doc,'internal_deadline')
    assert len(questions)==100
    (ROOT/'reports/acceptance-candidates.json').write_text(json.dumps({'human_verified':False,'gold_standard':False,'count':100,'questions':questions},ensure_ascii=False,indent=2),encoding='utf-8')
    with (ROOT/'reports/review-fields.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f);writer.writerow(['候选ID','赛事','字段','候选值','原文','位置','官网','审核状态'])
        for c,comp,chunk,doc in s.execute(select(Candidate,Competition,Chunk,Document).join(Competition,Candidate.competition_id==Competition.id).join(Chunk,Candidate.chunk_id==Chunk.id).join(Document,Chunk.document_id==Document.id).where(Document.kind!='news')):
            writer.writerow([c.id,comp.name,c.field,json.dumps(c.value,ensure_ascii=False),c.quote,chunk.location,doc.source_url,c.status])
    docs=s.scalars(select(Document)).all()
    (ROOT/'reports/source-inventory.json').write_text(json.dumps([doc_dict(d) for d in docs],ensure_ascii=False,indent=2),encoding='utf-8')
print('已生成100题候选、字段审核CSV和完整来源清单；未经人工核验。')
