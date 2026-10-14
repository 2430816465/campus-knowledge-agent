"""Read-only paired benchmark: current generation versus complete source lookup.

Runs real model calls through the ordinary shared compute gate. No outer batch
lock, business writes, policy constants, credential output or service restart.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.orm import Session
from app.db import engine
import app.campus_qa as qa
import app.source_lookup as lookup

QUESTIONS = [
    '2026年秋季普通话考试报名有哪些要求？',
    '普通话什么时候报名？',
    '档案查询如何办理？',
    '线上档案查询需要到校办理吗？',
    '档案查询需要提交什么材料？',
    '申诉期间学校是否停止执行原决定？',
    '学生申诉委员会收到书面申诉后多久作出复查结论？',
    '学生申请国家励志奖学金需要哪些条件？',
]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default='reports/source-lookup-comparison.json')
    parser.add_argument('--rounds',type=int,default=2)
    args=parser.parse_args()
    if not 1 <= args.rounds <= 3:
        parser.error('rounds must be between 1 and 3')
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    original_model, original_lookup=qa.model_generate, lookup.source_lookup
    current=[]
    records=[]
    def recorded(messages, *, response_schema):
        start=time.perf_counter()
        response=original_model(messages,response_schema=response_schema)
        current.append({key:response.get(key) for key in (
            'eval_count','prompt_eval_count','eval_duration','prompt_eval_duration','load_duration','total_duration')}
            | {'seconds':time.perf_counter()-start,'raw':response['message']['content'],
               'messages':messages,'schema':response_schema})
        return response
    try:
        qa.model_generate=recorded
        lookup.source_lookup=lambda *a:None
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as conn:
            conn.exec_driver_sql('SET TRANSACTION READ ONLY')
            with Session(conn) as session:
                qa.campus_answer(session,QUESTIONS[0],datetime.now().astimezone())
                now=datetime.now().astimezone()
                for question in QUESTIONS:
                    case={'question':question,'samples':[]}
                    records.append(case)
                    for index in range(args.rounds):
                        for phase in (('before','after') if index % 2 == 0 else ('after','before')):
                            lookup.source_lookup=original_lookup if phase=='after' else lambda *a:None
                            current.clear()
                            start=time.perf_counter()
                            result=qa.campus_answer(session,question,now)
                            sample={'phase':phase,'round':index+1,'query_time':now.isoformat(),
                                    'seconds':time.perf_counter()-start,'generation':list(current),'result':result}
                            case['samples'].append(sample)
                            output.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
                            print(json.dumps({'question':question,'phase':phase,'round':index+1,
                                'seconds':round(sample['seconds'],3),'calls':len(current),
                                'sources':len(result.get('sources',[])),'mode':result['mode']},ensure_ascii=False),flush=True)
    finally:
        qa.model_generate,lookup.source_lookup=original_model,original_lookup


if __name__=='__main__':
    main()
