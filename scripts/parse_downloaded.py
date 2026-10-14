"""Bounded CPU-only archive import, concurrent with download-only collection.

Each batch reads an online SQLite backup. Only import columns are reconciled
with compare-and-swap after business commits. No requests/embedding/publication.
The original and snapshot survive errors. Restart resumes the durable frontier.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.sync_school_archive import PipelineLock, atomic_json


def stamp():
    return datetime.now(timezone.utc).isoformat()


def free_memory_mib():
    if os.name != 'nt':
        return os.sysconf('SC_AVPHYS_PAGES') * os.sysconf('SC_PAGE_SIZE') / 1024**2
    import ctypes as c
    class Memory(c.Structure):
        _fields_=[('length',c.c_ulong),('load',c.c_ulong)]+[(n,c.c_uint64) for n in
            ('total','available','pt','pa','vt','va','extended')]
    m=Memory();m.length=c.sizeof(m)
    if not c.windll.kernel32.GlobalMemoryStatusEx(c.byref(m)):
        raise OSError('Available RAM unknown; no parser child started.')
    return m.available/1024**2


def snapshot_frontier(source, target):
    with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True, timeout=30) as live:
        with sqlite3.connect(target) as snapshot:
            live.backup(snapshot, pages=128, sleep=.02)
            if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Snapshot integrity check failed; live archive unchanged.')


def reconcile(source, snapshot, baseline):
    """A refreshed source or another parser result always wins over our snapshot."""
    updated = conflicts = 0
    with sqlite3.connect(source, timeout=30) as live, sqlite3.connect(snapshot) as parsed:
        parsed.row_factory = sqlite3.Row
        for row in parsed.execute('SELECT url,sha256,import_state,import_error,document_id FROM urls'):
            before = baseline.get(row['url'])
            if before is None or tuple(row[k] for k in ('import_state','import_error','document_id')) == before[1:]:
                continue
            cursor = live.execute('''UPDATE urls SET import_state=?,import_error=?,document_id=?
                WHERE url=? AND state='fetched' AND sha256=?
                AND import_state IS ? AND import_error IS ? AND document_id IS ?''',
                (row['import_state'],row['import_error'],row['document_id'],row['url'],before[0],*before[1:]))
            updated += cursor.rowcount
            conflicts += int(cursor.rowcount == 0)
            live.commit()  # short writes; never retain a download-blocking transaction
    return {'import_rows_reconciled': updated, 'source_or_result_changed': conflicts}


def child(snapshot, limit, urls):
    from app.config import DATA
    from app.db import Session
    from scripts.import_school_archive import import_archive
    with sqlite3.connect(snapshot, timeout=30) as db, Session() as session:
        db.row_factory = sqlite3.Row
        report = import_archive(db, session, DATA/'school-archive', limit, False,
                                selected_urls=urls or None, images_first=True)
    atomic_json(Path(snapshot).with_suffix('.result.json'), report)


def limit_memory(megabytes):
    """Hard per-process committed-memory limit. Refuse unsupported OS, no false cap."""
    if os.name != 'nt':
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (megabytes*1024**2, megabytes*1024**2))
        return None
    import ctypes as c
    from ctypes import wintypes as w
    class Basic(c.Structure):
        _fields_=[('process_time',c.c_int64),('job_time',c.c_int64),('flags',w.DWORD),
                  ('min_ws',c.c_size_t),('max_ws',c.c_size_t),('active',w.DWORD),
                  ('affinity',c.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
    class IO(c.Structure):
        _fields_=[(name,c.c_uint64) for name in ('ro','wo','oo','rt','wt','ot')]
    class Extended(c.Structure):
        _fields_=[('basic',Basic),('io',IO),('process_memory',c.c_size_t),
                  ('job_memory',c.c_size_t),('peak_process',c.c_size_t),('peak_job',c.c_size_t)]
    kernel=c.WinDLL('kernel32',use_last_error=True)
    kernel.CreateJobObjectW.restype=w.HANDLE
    kernel.SetInformationJobObject.argtypes=[w.HANDLE,c.c_int,c.c_void_p,w.DWORD]
    kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE]
    kernel.GetCurrentProcess.restype=w.HANDLE
    handle=kernel.CreateJobObjectW(None,None)
    info=Extended(); info.basic.flags=0x100; info.process_memory=megabytes*1024**2
    if not handle or not kernel.SetInformationJobObject(handle,9,c.byref(info),c.sizeof(info)) or not kernel.AssignProcessToJobObject(handle,kernel.GetCurrentProcess()):
        raise OSError(c.get_last_error(),'Cannot enforce parser memory budget; no import started.')
    return handle  # retain for the child's lifetime


def run(rounds, limit, timeout, memory_mib, urls=(), reserve_mib=3072, *, expected_previous_run=None):
    from app.config import DATA
    archive=DATA/'school-archive'; source=archive/'frontier.sqlite3'
    if not source.is_file():
        raise ValueError('Existing frontier required; refusing to create one.')
    with PipelineLock(archive/'business-import.lock'):
        if expected_previous_run is not None:
            previous = json.loads((ROOT/'reports/downloaded-parse-state.json').read_text('utf-8'))
            if previous['run_id'] != expected_previous_run or previous['status'] not in {
                    'waiting_memory_checkpoint_retained', 'bounded_run_completed', 'downloaded_frontier_classified'}:
                raise ValueError('Parser predecessor changed or is not safely resumable; no run created.')
        run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
        folder=DATA/'parse-runs'/run_id; folder.mkdir(parents=True,exist_ok=False)
        state={'run_id':run_id,'started_at':stamp(),'status':'running','rounds_requested':rounds,
               'limit_per_batch':limit,'timeout_seconds':timeout,'child_memory_mib':memory_mib,
               'parallelism':1,'embedding_requested':False,'publication_performed':False,
               'folder':str(folder),'batches':[]}
        state['reserve_free_memory_mib']=reserve_mib
        def save():
            state['updated_at']=stamp()
            atomic_json(folder/'state.json',state)
            atomic_json(ROOT/'reports/downloaded-parse-state.json',state)
        save()
        try:
            for number in range(1,rounds+1):
                deadline=time.monotonic()+timeout
                while free_memory_mib() < memory_mib+reserve_mib:
                    state['status']='waiting_memory';save()
                    if time.monotonic() >= deadline:
                        state['status']='waiting_memory_checkpoint_retained';save();return state
                    time.sleep(10)
                state['status']='running';save()
                snapshot=folder/f'batch-{number:04d}.sqlite3'
                snapshot_frontier(source,snapshot)
                with sqlite3.connect(snapshot) as db:
                    baseline={r[0]:tuple(r[1:]) for r in db.execute('SELECT url,sha256,import_state,import_error,document_id FROM urls')}
                    remaining=db.execute("SELECT count(*) FROM urls WHERE state='fetched' AND import_state IS NULL").fetchone()[0]
                if not remaining:
                    state['status']='downloaded_frontier_classified';save();break
                args=[sys.executable,__file__,'--child',str(snapshot),'--limit',str(limit),'--memory-mib',str(memory_mib)]
                for url in urls:args+=['--url',url]
                env={**os.environ,'PYTHONIOENCODING':'utf-8','OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
                with snapshot.with_suffix('.stdout.log').open('wb') as out, snapshot.with_suffix('.stderr.log').open('wb') as err:
                    try:
                        result=subprocess.run(args,stdout=out,stderr=err,env=env,timeout=timeout)
                        exitcode=result.returncode
                    except subprocess.TimeoutExpired:
                        exitcode='timeout'  # subprocess.run ends only this owned child
                batch={'round':number,'snapshot':str(snapshot),'exitcode':exitcode,'checked_at':stamp(),**reconcile(source,snapshot,baseline)}
                report_path=snapshot.with_suffix('.result.json')
                if report_path.exists():
                    report=json.loads(report_path.read_text('utf-8'))
                    batch.update({k:v for k,v in report.items() if k!='events'})
                state['batches'].append(batch);save()
                if exitcode != 0:
                    state['status']='failed_child_checkpoint_retained';save();break
                if urls or batch['import_rows_reconciled']==0:
                    state['status']='selected_batch_finished' if urls else 'no_progress_checkpoint_retained';save();break
                time.sleep(1)
            else:
                state['status']='bounded_run_completed';save()
        except BaseException as exc:
            state.update(status='interrupted_checkpoint_retained',error_type=type(exc).__name__);save();raise
        return state


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rounds',type=int,default=64);p.add_argument('--limit',type=int,default=100)
    p.add_argument('--timeout',type=int,default=600);p.add_argument('--memory-mib',type=int,default=1536)
    p.add_argument('--url',action='append',default=[]);p.add_argument('--child',type=Path)
    p.add_argument('--reserve-mib',type=int,default=3072)
    a=p.parse_args()
    if not 1<=a.rounds<=256 or not 1<=a.limit<=500 or not 30<=a.timeout<=1800 or not 512<=a.memory_mib<=2048 or not 512<=a.reserve_mib<=8192:
        p.error('Budget outside supported bounds.')
    if a.child:
        budget=limit_memory(a.memory_mib)
        child(a.child,a.limit,a.url)
    else:
        print(json.dumps(run(a.rounds,a.limit,a.timeout,a.memory_mib,a.url,a.reserve_mib),ensure_ascii=False))


if __name__=='__main__':
    main()
