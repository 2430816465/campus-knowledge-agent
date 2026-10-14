"""Finite resumable formal-wrapper model evaluation; never auto-score semantics."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sqlalchemy import select, text
from app.db import Session, Document, Chunk
from app.evaluation import load_bank, audit_bank, read_journal, evidence_measure
from app.semantic_sources import document_metadata
from app.compute_coordination import Coordinator
from app.model_gate import FileMutex
import app.campus_qa as qa


def append(path, value):
    with path.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())


def evaluate_case(session, case, *, model_generate=None):
    """Observe beneath the formal wrapper so its required schema is preserved."""
    actual = model_generate or qa.model_generate
    calls, deferred = [], []
    def observed(messages, **kwargs):
        if kwargs.get('response_schema') != qa.RESPONSE_SCHEMA:
            raise ValueError('formal response schema missing')
        call = {'messages': messages, 'schema_used': True}
        calls.append(call)
        try:
            result = actual(messages, **kwargs)
        except Exception as exc:
            call['error_type'] = type(exc).__name__
            deferred.append(type(exc).__name__)
            raise
        call['response'] = result
        return result
    with patch('app.campus_qa.model_generate', observed):
        answer = qa.campus_answer(session, case['question'], datetime.now(timezone.utc),
                                  history=case.get('history'), use_model=True)
    quoted = [{**row, 'text':row['quote']} for row in answer['sources']]
    return {'id':case['id'], 'question':case['question'], 'tags':case['tags'],
            'checked_at':datetime.now(timezone.utc).isoformat(), 'answer':answer,
            'calls':calls, 'deferred':bool(deferred),
            'returned_evidence_measure':evidence_measure(case, quoted),
            'semantic_correct':None, 'manual_review_required':True}


def run(bank, digest, version, output, limit):
    journal = output / 'events.jsonl'
    events, done = read_journal(journal, digest, version)
    if not done <= {case['id'] for case in bank['cases']}:
        raise ValueError('unknown journal cases')
    with Session() as session:
        if session.bind.dialect.name == 'postgresql':
            session.execute(text('SET TRANSACTION READ ONLY'))
        metadata = document_metadata(session)
        for row in session.execute(select(Document.id, Document.raw_name, Document.source_url)):
            metadata[row.id].update(raw_name=row.raw_name, source_url=row.source_url)
        chunks = {}
        for row in session.execute(select(Chunk.id,Chunk.document_id,Chunk.text).where(
                Chunk.document_id.in_(bank['sources']))):
            chunks.setdefault(row.document_id, []).append(dict(row._mapping))
        audit = audit_bank(bank, ROOT/'data/raw', metadata, chunks)
    audit_path = output/'source-audit.json'
    if not audit_path.exists():
        audit_path.write_text(json.dumps({'bank_sha256':digest,'facts':audit,
            'teacher_reviewed':False},ensure_ascii=False,indent=2),encoding='utf-8')
    if not journal.exists():
        append(journal, {'bank_sha256':digest, 'code_version':version, 'model_enabled':True,
                         'teacher_gold_standard':False, 'case_count':len(bank['cases'])})
    attempted, pause = 0, None
    for case in bank['cases']:
        if case['id'] in done:
            continue
        if attempted >= limit:
            break
        state = Coordinator().status()
        if state['training_intent_locked'] or state['compute_locked'] or state['quarantine']:
            pause = 'shared_compute_unavailable'
            break
        started = time.monotonic()
        with Session() as session:
            if session.bind.dialect.name == 'postgresql':
                session.execute(text('SET TRANSACTION READ ONLY'))
            event = evaluate_case(session, case)
        event['elapsed_seconds'] = round(time.monotonic()-started, 3)
        attempted += 1
        append(output/'attempts.jsonl', event)
        if event['deferred']:
            pause = 'model_call_error_or_deferred; inspect retained attempt and compute state'
            break
        append(journal, event)
        events.append(event)
        done.add(case['id'])
        if len(done) % 10 == 0:
            print(json.dumps({'completed':len(done),'cases':len(bank['cases'])}), flush=True)
    summary = {'bank_sha256':digest,'code_version':version,'completed':len(done),
        'cases':len(bank['cases']), 'remaining':len(bank['cases'])-len(done),
        'mode_counts':dict(Counter(e['answer']['mode'] for e in events)),
        'completed_case_model_requests':sum(len(e['calls']) for e in events),
        'attempts_file_includes_deferred_calls':True,'pause_reason':pause,
        'source_audit_cases':len(audit),'answer_accuracy':None,
        'semantic_reviews_completed':0,'teacher_gold_standard':False,
        'scope_note':'Real responses, not semantic accuracy. Known reference errata remain; no bank changes.'}
    (output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=True),flush=True)
    return 75 if pause else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank',type=Path,required=True)
    parser.add_argument('--run-id',default=None)
    parser.add_argument('--limit',type=int,default=10)
    args=parser.parse_args(argv)
    if not 1 <= args.limit <= 120:
        parser.error('limit must be 1..120')
    bank,digest=load_bank(args.bank)
    version=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if subprocess.check_output(['git','status','--porcelain','--','app','scripts','tests'],cwd=ROOT,text=True).strip():
        raise ValueError('commit implementation before model evaluation')
    identity=args.run_id or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid4().hex[:12]
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',identity):
        raise ValueError('unsafe run id')
    output=ROOT/'reports/model-evaluation'/identity
    output.mkdir(parents=True,exist_ok=True)
    with FileMutex(output.parent/'evaluation.lock',timeout=0), FileMutex(output/'run.lock',timeout=0):
        return run(bank,digest,version,output,args.limit)


if __name__=='__main__':
    raise SystemExit(main())
