"""只修正未审核的同段多日期候选，不覆盖任何已确认字段。"""
import re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Candidate,Audit
from app.ingest import uid
with Session() as s:
    changed=[]
    for c in s.scalars(select(Candidate).where(Candidate.status=='pending',Candidate.field.in_(['internal_deadline','organizer_deadline']))):
        text=re.sub(r'(\d)\s+(\d)(?=\s*日)',r'\1\2',c.quote)
        if len(re.findall(r'\d{1,2}\s*月\s*\d{1,2}\s*日',text))>1 and c.value.get('precision')!='ambiguous':
            before=c.value;c.value={'text':c.quote,'precision':'ambiguous','timezone':'Asia/Shanghai','reason':'同段存在多个日期，需分别核对开始与截止'}
            changed.append(c.id);s.add(Audit(id=uid(),action='repair_ambiguous_date',entity_id=c.id,changes={'before':before,'after':c.value}))
    s.commit();print('已将多日期候选改为待辨认：'+str(len(changed)))
