import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest
from scripts.parse_downloaded import snapshot_frontier, reconcile
from scripts.sync_school_archive import PipelineLock, PipelineBusyError


def frontier(path):
    with sqlite3.connect(path) as db:
        db.execute('''CREATE TABLE urls(url TEXT PRIMARY KEY,sha256 TEXT,state TEXT,
            import_state TEXT,import_error TEXT,document_id TEXT,attempts INTEGER)''')
        db.execute("INSERT INTO urls VALUES('a','old','fetched',NULL,NULL,NULL,3)")


def test_snapshot_read_only_and_reconcile_import_columns_only(tmp_path):
    source=tmp_path/'live.sqlite3'; snap=tmp_path/'snapshot.sqlite3';frontier(source)
    snapshot_frontier(source,snap)
    with sqlite3.connect(snap) as db:
        db.execute("UPDATE urls SET import_state='imported',document_id='d'")
    assert reconcile(source,snap,{'a':('old',None,None,None)})=={'import_rows_reconciled':1,'source_or_result_changed':0}
    with sqlite3.connect(source) as db:
        assert db.execute('SELECT sha256,state,attempts,import_state,document_id FROM urls').fetchone()==('old','fetched',3,'imported','d')
    assert reconcile(source,snap,{'a':('old',None,None,None)})['source_or_result_changed']==1


@pytest.mark.parametrize('change', ["sha256='new'", "state='fetching'", "import_state='blocked'", "document_id='teacher-doc'"])
def test_changed_source_or_result_is_not_overwritten(tmp_path,change):
    source=tmp_path/'live.sqlite3'; snap=tmp_path/'snapshot.sqlite3';frontier(source)
    snapshot_frontier(source,snap)
    with sqlite3.connect(snap) as db:db.execute("UPDATE urls SET import_state='imported',document_id='d'")
    with sqlite3.connect(source) as db:db.execute('UPDATE urls SET '+change)
    with sqlite3.connect(source) as db:before=db.execute('SELECT * FROM urls').fetchall()
    assert reconcile(source,snap,{'a':('old',None,None,None)})['source_or_result_changed']==1
    with sqlite3.connect(source) as db:assert db.execute('SELECT * FROM urls').fetchall()==before


def test_independent_import_lock_excludes_second_parser(tmp_path):
    with PipelineLock(tmp_path/'business-import.lock'):
        with pytest.raises(PipelineBusyError):
            with PipelineLock(tmp_path/'business-import.lock'):pass
        with PipelineLock(tmp_path/'crawler.lock'):pass


@pytest.mark.skipif(os.name!='nt',reason='Windows hard committed-memory limit proof')
def test_windows_child_memory_limit_is_enforced():
    code='''from scripts.parse_downloaded import limit_memory
budget=limit_memory(512)
try:
    data=bytearray(600*1024*1024)
except MemoryError:
    print('hard-budget-enforced')
else:
    raise AssertionError('budget not enforced')
'''
    r=subprocess.run([sys.executable,'-c',code],capture_output=True,text=True,timeout=30)
    assert r.returncode==0,r.stderr
    assert 'hard-budget-enforced' in r.stdout


def test_ingest_preserves_existing_corrupt_original(tmp_path,monkeypatch):
    from app import ingest
    class Session:
        def scalar(self,*args):return None
    raw=tmp_path/'raw';raw.mkdir();data=b'actual original'
    path=raw/(hashlib.sha256(data).hexdigest()+'.txt');path.write_bytes(b'prior bytes')
    monkeypatch.setattr(ingest,'DATA',tmp_path)
    with pytest.raises(ValueError,match='retained without overwrite'):
        ingest.ingest_bytes(Session(),data,'a.txt',embed=False)
    assert path.read_bytes()==b'prior bytes'
