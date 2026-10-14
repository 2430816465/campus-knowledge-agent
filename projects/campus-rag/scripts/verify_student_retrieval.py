"""Read-only comparison of real public-source recall before/after ranking changes.

The 20 math questions and eight other-notice questions are now development
regressions, not independent or teacher-approved answer gold standards.
"""
import argparse
import importlib.util
import json
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app import rag
from app.config import ROOT, DATA, EMBED_MODEL
from app.db import Session, Document, Chunk
from scripts.verify_dify_retrieval import CASES

MATH_COMP = 'f6749c9f-973c-4630-85c3-52dcdfae0c36'
MATH_DOC = '3493f684-cdec-4c35-9530-76f83005bbea'
TRANSFER = [
    ('人工智能应用场景创新挑战赛高校种子组指导教师最多几人？', 'feb1ec62-4999-40ac-9c9c-c122a0c4516a', 'd84c05e0-c569-4bcf-b834-c61f7fa8c8b2', '指导教 师不超过 2 人'),
    ('人工智能应用场景创新挑战赛有哪些参赛组别？', 'feb1ec62-4999-40ac-9c9c-c122a0c4516a', 'd84c05e0-c569-4bcf-b834-c61f7fa8c8b2', '高校种子组 、企业 初创组、 OPC / 个人组'),
    ('iCAN创新赛道和创业赛道可以同时报名吗？', '8fba5e13-75ac-4ae0-b329-0368aed5d3be', '623d35fe-4ef1-4f3a-9b50-93516bb5d949', '不可同时报名创新赛道和创业赛道'),
    ('职业规划大赛成长赛道哪些年级可以参加？', '438fb4ce-c26a-4db1-84b8-c2151dc42027', 'd1327cd1-8c42-4420-ac49-3f3f7f956371', '成长赛道参赛对象我校24级、25级在校学生。'),
    ('职业规划大赛就业赛道主题陈述几分钟？', '438fb4ce-c26a-4db1-84b8-c2151dc42027', '159caa07-beda-4602-9e0d-74f66591dcbd', '主题陈述（6分钟）'),
    ('第十七届市场调查与分析大赛每个团队由几名学生组成？', 'f59400c3-2ffb-4e01-895c-7b6571907864', '260038c6-fea7-4000-b589-309db386dd87', '每个团队由3-5名学生组成'),
    ('第十七届市场调查与分析大赛本科组报名费多少钱？', 'f59400c3-2ffb-4e01-895c-7b6571907864', '260038c6-fea7-4000-b589-309db386dd87', '本科组和专科组参赛报名费（含网考费）30元/人'),
    ('第十七届市场调查与分析大赛专科组本科组报名截止日期？', 'f59400c3-2ffb-4e01-895c-7b6571907864', 'b82a7cca-9788-4990-b8e2-246a517c8da2', '专科组、本科组报名截止日期为：2026年10月31日24:00。'),
]


def fixtures():
    return ([{'group': 'math_development', 'question': q, 'competition_id': MATH_COMP,
              'document_id': MATH_DOC, 'literal': quote} for _, q, quote in CASES] +
            [{'group': 'other_notices_transfer', 'question': q, 'competition_id': comp,
              'document_id': doc, 'literal': quote} for q, comp, doc, quote in TRANSFER])


def summarize(rows):
    return {group + '/' + scope: {
        'questions': len(selected := [r for r in rows if r['group'] == group and r['scope'] == scope]),
        'recall_at_3': sum(r['rank'] is not None and r['rank'] <= 3 for r in selected),
        'recall_at_6': sum(r['rank'] is not None for r in selected),
    } for group in ('math_development', 'other_notices_transfer') for scope in ('selected', 'global')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-zip', type=Path, required=True)
    args = parser.parse_args()
    # Load only saved owned Python source, not another project's executable.
    path = args.baseline_zip.resolve()
    if not path.is_relative_to((DATA / 'code-backups').resolve()):
        raise ValueError('Baseline must be an owned source backup')
    with zipfile.ZipFile(path) as archive:
        code = archive.read('app/rag.py')
    baseline_file = path.parent / 'rag_baseline.py'
    baseline_file.write_bytes(code)
    spec = importlib.util.spec_from_file_location('app.rag_baseline', baseline_file)
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)
    # Same real query vector in both algorithms and scopes; cache is run-local.
    actual_embed = rag.embeddings
    vectors = {}
    def cached_embed(texts):
        key = tuple(texts)
        if key not in vectors:
            vectors[key] = actual_embed(texts)
        return vectors[key]
    baseline.embeddings = rag.embeddings = cached_embed
    before, after = [], []
    source_proofs = {}
    try:
        with Session() as session:
            for case in fixtures():
                doc = session.get(Document, case['document_id'])
                if not doc or doc.visibility != 'public' or doc.status not in ('pending_review', 'published'):
                    raise ValueError('Fixture source unavailable/public scope changed')
                chunks = session.scalars(select(Chunk).where(Chunk.document_id == doc.id)).all()
                if not any(case['literal'] in chunk.text for chunk in chunks):
                    raise ValueError('Fixture quote absent from actual source: ' + case['question'])
                source_proofs[doc.id] = {'url': doc.source_url, 'title': doc.title, 'sha256': doc.sha256,
                                       'version': doc.version, 'review_status': doc.status}
                for scope in ('selected', 'global'):
                    for module, target in ((baseline, before), (rag, after)):
                        started = time.perf_counter()
                        hits, warnings = module.retrieve(session, case['question'], competition_id=case['competition_id'] if scope == 'selected' else None)
                        if warnings:
                            raise RuntimeError('Real embedding required; no silent lexical fallback in this comparison')
                        rank = next((i + 1 for i, hit in enumerate(hits) if hit['document_id'] == doc.id and case['literal'] in hit['text']), None)
                        target.append({**case, 'scope': scope, 'rank': rank,
                                       'seconds': round(time.perf_counter() - started, 3),
                                       'hits': [{'id': h['id'], 'document_id': h['document_id'], 'location': h['location'],
                                                 'score': h['score'], 'text': h['text']} for h in hits]})
                print(json.dumps({'question': case['question'], 'before_selected': before[-2]['rank'],
                                  'after_selected': after[-2]['rank'], 'after_global': after[-1]['rank']}, ensure_ascii=False), flush=True)
    finally:
        rag.embeddings = actual_embed
    b, a = summarize(before), summarize(after)
    regressions = [{'question': old['question'], 'scope': old['scope'], 'before': old['rank'], 'after': new['rank']}
                   for old, new in zip(before, after)
                   if old['rank'] is not None and old['rank'] <= 3 and (new['rank'] is None or new['rank'] > 3)]
    report = {'checked_at': datetime.now().astimezone().isoformat(), 'embedding_model': EMBED_MODEL,
              'passed': a['math_development/selected']['recall_at_3'] == 20 and
                        a['other_notices_transfer/selected']['recall_at_3'] == 8 and
                        a['math_development/global']['recall_at_3'] >= 20 and
                        a['other_notices_transfer/global']['recall_at_3'] >= 8 and not regressions,
              'baseline_source_zip': str(path), 'sources': source_proofs,
              'before_summary': b, 'after_summary': a, 'top3_regressions': regressions,
              'before': before, 'after': after,
              'limits': ['Public-source literal recall only; no teacher rule approval or generated-answer accuracy.',
                         'All 28 questions have now been used in development; not an independent or school-wide benchmark.',
                         'Both ranking versions use identical real query vectors; timings are not throughput measurements.']}
    (ROOT / 'reports/student-retrieval.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('passed', 'before_summary', 'after_summary', 'top3_regressions')}, ensure_ascii=False, indent=2))
    if not report['passed']:
        raise SystemExit('Ranking gate failed; inspect and fix or restore before deployment')


if __name__ == '__main__':
    main()
