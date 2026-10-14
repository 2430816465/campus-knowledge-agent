"""Windows Python: finite read-only paired generation benchmark, not a blind accuracy test."""
import sys,json,time,argparse
from pathlib import Path
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy.orm import Session
from app.db import engine
import app.campus_qa as qa
from app.qa_response import RESPONSE_SCHEMA
original=qa.model_generate
from app.generation_prompt import focused_messages as compact
current=[]
def run(messages,phase):
    effective=compact(messages) if phase=='after' else messages
    start=time.perf_counter();r=original(effective,response_schema=RESPONSE_SCHEMA)
    current.append({k:r.get(k) for k in ('eval_count','prompt_eval_count','load_duration','eval_duration','prompt_eval_duration','total_duration')}|{'seconds':time.perf_counter()-start,'raw':r['message']['content'],'messages':effective})
    return r
questions=['学校的校训是什么？','学校英文名称是什么？','申诉期间学校是否停止执行原决定？','学生申诉委员会收到书面申诉后多久作出复查结论？','2026年秋季普通话什么时候报名？','学生申请国家励志奖学金需要哪些条件？']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output",default="reports/generation-final-comparison.json")
args=parser.parse_args()
records=[]
with engine.connect().execution_options(isolation_level='REPEATABLE READ') as conn:
    conn.exec_driver_sql('SET TRANSACTION READ ONLY')
    with Session(conn) as session:
        qa.generate=lambda messages:run(messages,"before")
        qa.campus_answer(session,questions[0],datetime.now().astimezone())
        now=datetime.now().astimezone()
        for question in questions:
            samples=[]
            for phase in (('before','after','after','before') if any(k in question for k in ('校训','英文名称')) else ('before','after')):
                qa.generate=lambda messages:run(messages,phase)
                current.clear();start=time.perf_counter();result=qa.campus_answer(session,question,now)
                sample={'phase':phase,'seconds':time.perf_counter()-start,'generation':list(current),'result':result}
                samples.append(sample)
                print(json.dumps({'question':question,'phase':phase,'seconds':round(sample['seconds'],3),'tokens':[x['eval_count'] for x in current],'mode':result['mode']},ensure_ascii=False),flush=True)
            records.append({'question':question,'samples':samples})
            Path(args.output).write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
