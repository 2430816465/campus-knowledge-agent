"""Read-only live model/source checks for automatic and selected public events."""
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.config import ROOT

BASE = 'http://127.0.0.1:8008'
MATH = 'f6749c9f-973c-4630-85c3-52dcdfae0c36'
MARKET = 'f59400c3-2ffb-4e01-895c-7b6571907864'
AI = 'feb1ec62-4999-40ac-9c9c-c122a0c4516a'
CASES = [
    (MATH, '五一数学建模竞赛参赛费用多少钱？', ['每支参赛队伍参赛费用 100 元。']),
    (MATH, '五一数学建模竞赛允许跨专业组队吗？', ['鼓励学生跨专业组队']),
    (MATH, '五一数学建模竞赛2026年比赛从什么时候开始到什么时候结束？', ['2026 年 5 月 1 日 10:00 至 2026 年 5 月 4 日 12:00']),
    (MARKET, '第十七届市场调查与分析大赛本科组报名费多少钱？', ['本科组和专科组参赛报名费（含网考费）30元/人']),
    (MARKET, '第十七届市场调查与分析大赛专科组本科组报名截止日期？', ['2026年10月31日24:00']),
    ('438fb4ce-c26a-4db1-84b8-c2151dc42027', '职业规划大赛就业赛道主题陈述几分钟？', ['主题陈述（6分钟）']),
    (AI, '人工智能应用场景创新挑战赛高校种子组指导教师最多几人？', ['指导教 师不超过 2 人']),
    (AI, '人工智能应用场景创新挑战赛有哪些参赛组别？', ['高校种子组 、企业 初创组、 OPC / 个人组']),
]


def post_chat(client, payload):
    # Respect the live service's ordinary rate limit; never disable it for tests.
    for attempt in range(13):
        response = client.post(BASE + '/api/chat', json=payload)
        if response.status_code != 429:
            response.raise_for_status()
            return response
        if attempt == 0:
            print('Live request rate limit reached; waiting for its normal window.', flush=True)
        time.sleep(5)
    response.raise_for_status()


def main():
    results = []
    with httpx.Client(timeout=150, trust_env=False) as client:
        health = client.get(BASE + '/api/health').json()
        assert health['database'] == 'postgresql' and health['chat_ready']
        checks = [(comp, question, expected, 'automatic') for comp, question, expected in CASES]
        checks += [(comp, question, expected, 'selected') for comp, question, expected in CASES if comp == AI]
        checks += [(MATH, '那可以跨专业组队吗？', ['鼓励学生跨专业组队'], 'follow_up')]
        for comp, question, expected, scope in checks:
            payload = {'question': question}
            if scope == 'selected':
                payload['competition_id'] = comp
            if scope == 'follow_up' or '就业赛道' in question:
                payload['history'] = [{'competition_id': MATH, 'question': '五一数学建模费用？'}]
            response = post_chat(client, payload)
            answer = response.json()
            verified = []
            for source in answer.get('sources', []):
                raw = client.get(BASE + '/api/documents/' + source['document_id'] + '/chunks')
                raw.raise_for_status()
                valid = any(c['id'] == source['id'] and source['quote'] in c['text'] for c in raw.json()['chunks'])
                assert valid and source['url'].startswith('https://') and source['location']
                verified.append(source['id'])
            expected_present = all(text in answer['answer'] for text in expected)
            wrong_quantity = '指导教师最多几人' in question and '每位指导教师可指导2个不同参赛项目' in answer['answer']
            passed = (answer['mode'] == 'local_model_evidence' and bool(verified) and expected_present
                      and answer.get('competition_id') == comp and not wrong_quantity)
            results.append({'question': question, 'scope': scope, 'competition_id': comp, 'expected_literals': expected,
                            'expected_present': expected_present, 'source_quotes_verified': verified,
                            'wrong_quantity_quote_present': wrong_quantity,
                            'passed': passed, 'response': answer})
            print(json.dumps({'question': question, 'scope': scope, 'passed': passed, 'mode': answer['mode'],
                              'sources': len(verified), 'seconds': answer['elapsed_seconds']}, ensure_ascii=False), flush=True)
        negatives = []
        for payload in [
            {'question': '2027年五一数学建模校内报名截止时间？', 'competition_id': MATH, 'year': 2027},
            {'question': '2027年五一数学建模校内报名截止时间？'},
            {'question': '第24届五一数学建模报名截止时间？'},
            {'question': '第24届五一数学建模报名截止时间？', 'competition_id': MATH},
            {'question': '五一数学建模和职业规划大赛什么时候报名？'},
        ]:
            response = post_chat(client, payload)
            negative = response.json()
            negatives.append({'request': payload, 'passed': negative['mode'] == 'insufficient_evidence' and negative['sources'] == [], 'response': negative})
    report = {'checked_at': datetime.now().astimezone().isoformat(), 'health': health,
              'passed': all(row['passed'] for row in results) and all(row['passed'] for row in negatives),
              'questions': len(results), 'successful_literal_answers': sum(r['passed'] for r in results),
              'unique_question_wordings': len({row['question'] for row in results}),
              'answers': results, 'negative_checks': negatives,
              'limits': ['Eleven live requests on public-source fixtures; not teacher-approved policy or school-wide answer accuracy.',
                         'No teacher review/publication or data changes were performed.',
                         'All retrieval fixtures have been used in development; independent coverage remains to be measured.']}
    (ROOT / 'reports/student-answer-acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('passed', 'questions', 'successful_literal_answers')}, ensure_ascii=False))
    if not report['passed']:
        raise SystemExit('Live answer gate failed; inspect the saved actual responses')


if __name__ == '__main__':
    main()
