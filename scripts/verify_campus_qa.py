"""Real public-campus retrieval/API checks; development and new cases stay separate."""
import argparse
import json
import re
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from sqlalchemy import select
from app.db import Session, Chunk, Document, timestamp
from app.config import ROOT
from app.campus_qa import campus_retrieve

DEVELOPMENT = [
    ('线上档案查询需要到校办理吗？', ['无需到校']),
    ('档案查询日常业务受理后多久返回电子材料？', ['5个工作日']),
    ('寒暑假档案查询周几办理？', ['周四']),
    ('学校章程规定的校训和校风是什么？', ['教学做合一', '教人求真']),
    ('学校章程规定学生可以提出申诉吗？', ['申诉']),
    ('2026年秋季普通话测试收费多少？', ['25元']),
    ('2026年秋季普通话报名起止时间是什么？', ['10月12日', '10月14日']),
    ('2026年9月军训封闭管理涉及哪些场地？', ['北操场', '南操场']),
]
# Written from archived originals before first execution; never include these
# scores in development-regression counts if subsequently used for tuning.
FRESH = [
    ('2026年秋季普通话测试缴费成功后还能退款吗？', ['不予退款']),
    ('2026年秋季普通话报名名额是不限人数吗？', ['额满即止']),
    ('2026年秋季普通话测试纸质证书遗失后能补办吗？', ['不予补办']),
    ('档案查询的纸质材料快递要由谁下单？', ['自行下单']),
    ('寒暑假提交档案查询，收到邮件后一周内会有什么结果？', ['一周内']),
    ('学校章程中的英文名称和简称是什么？', ['Nanjing', 'NJXZU']),
    ('档案查询在平时和寒暑假的电子材料办理时效有什么区别？', ['5个工作日', '一周内']),
    ('线上档案查询申请材料中需要毕业证书吗？', ['毕业证书']),
]

def normalize(text):
    return re.sub(r'\s+', '', text).lower()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--set', choices=['development', 'fresh'], default='development')
    parser.add_argument('--models', action='store_true')
    args = parser.parse_args()
    cases = FRESH if args.set == 'fresh' else DEVELOPMENT
    events = []
    with Session() as session, httpx.Client(timeout=180, trust_env=False) as client:
        for question, expected in cases:
            started = time.perf_counter()
            hits = campus_retrieve(session, question)
            top = ''.join(normalize(r['text']) for r in hits[:4])
            event = {'question':question, 'expected_source_markers':expected,
                     'retrieval_top4_pass':all(normalize(w) in top for w in expected),
                     'top4':[{'text':r['text'], 'title':r['title'], 'url':r['url'], 'score':r['score']} for r in hits[:4]]}
            if args.models:
                retries = 0
                while True:
                    response = client.post('http://127.0.0.1:8008/api/chat', json={'question':question})
                    if response.status_code != 429 or retries >= 5:
                        break
                    retries += 1
                    print(json.dumps({'status':'rate_limited','wait_seconds':15,'retry':retries}),flush=True)
                    time.sleep(15)
                response.raise_for_status()
                result = response.json()
                quotes = ''.join(normalize(r.get('quote','')) for r in result['sources'])
                valid = True
                for row in result['sources']:
                    chunk = session.get(Chunk, row['id'])
                    doc = session.get(Document, row['document_id'])
                    valid &= bool(chunk and doc and row['quote'] in chunk.text and doc.visibility == 'public'
                                  and doc.status in ('pending_review','published') and row['url'] == doc.source_url)
                event.update(result=result, source_literal_pass=valid, rate_limit_retries=retries,
                             answer_pass=bool(result['sources']) and valid
                             and result['mode'] in ('grounded_explanation','local_model_evidence')
                             and all(normalize(w) in quotes for w in expected))
            event['elapsed_seconds'] = round(time.perf_counter()-started,3)
            events.append(event)
            print(json.dumps({'question':question, 'retrieval_top4_pass':event['retrieval_top4_pass'],
                              'answer_pass':event.get('answer_pass'), 'elapsed_seconds':event['elapsed_seconds']},ensure_ascii=False),flush=True)
    report = {'checked_at':timestamp(), 'set':args.set, 'cases':len(events),
              'case_status':'development regression; first unseen run is preserved separately',
              'retrieval_top4_passed':sum(e['retrieval_top4_pass'] for e in events),
              'models_called':args.models, 'answer_passed':sum(e.get('answer_pass',False) for e in events),
              'teacher_gold_standard':False, 'all_school_accuracy_claim':False, 'events':events}
    report['measure'] = 'Expected markers in exact source quotes plus successful mode; this does not establish semantic answer accuracy.'
    filename = f'campus-{args.set}-' + ('answers' if args.models else 'retrieval') + '.json'
    (ROOT/'reports'/filename).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'events'},ensure_ascii=False))

if __name__ == '__main__':
    main()
