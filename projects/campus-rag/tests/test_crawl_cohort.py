import hashlib
import json
import sqlite3

import pytest
from app.crawl_cohort import freeze, load, observe, target_urls
from app.school_archive import SchoolArchive


BASE = 'https://www.njxzc.edu.cn/'


def setup_archive(path):
    archive = SchoolArchive(path)
    for name in ('old.htm','second.htm'):
        archive.enqueue(BASE+name)
    archive.db.commit()
    archive.close()
    return path/'frontier.sqlite3'


def test_freeze_readonly_exclusive_and_tamper_detection(tmp_path):
    frontier = setup_archive(tmp_path/'archive')
    before = hashlib.sha256(frontier.read_bytes()).hexdigest()
    cohort_path = tmp_path/'cohort.json'
    original = freeze(frontier,cohort_path)
    assert original['target_count'] == 2
    assert load(cohort_path)['rows'] == original['rows']
    assert hashlib.sha256(frontier.read_bytes()).hexdigest() == before
    with pytest.raises(FileExistsError):
        freeze(frontier,cohort_path)
    original['rows'][0]['url'] = BASE+'tampered.htm'
    cohort_path.write_text(json.dumps(original),encoding='utf-8')
    with pytest.raises(ValueError,match='identity'):
        load(cohort_path)


def test_missing_archive_no_empty_database_created(tmp_path):
    with pytest.raises(sqlite3.OperationalError):
        freeze(tmp_path/'archive/missing.sqlite3', tmp_path/'cohort.json')
    assert not (tmp_path/'archive/missing.sqlite3').exists()


def test_report_classifies_failures_and_separates_new_links(tmp_path):
    frontier = setup_archive(tmp_path/'archive')
    cohort = freeze(frontier,tmp_path/'cohort.json')
    with sqlite3.connect(frontier) as c:
        c.execute("UPDATE urls SET state='failed',attempts=1,error='HTTP 404' WHERE url=?",(BASE+'old.htm',))
        c.execute("UPDATE urls SET state='deferred',attempts=1,error='robots_unavailable' WHERE url=?",(BASE+'second.htm',))
        c.execute("INSERT INTO urls(url,state) VALUES(?,'pending')",(BASE+'new.htm',))
    report = observe(frontier,cohort)
    assert report['bounded_pass_classified']
    assert report['attempted_since_baseline'] == 2
    assert report['target_states'] == {'failed':1,'deferred':1}
    assert report['new_urls_since_baseline'] == 1
    assert report['failure_reasons'] == {'HTTP 404':1,'robots_unavailable':1}
    assert not report['full_school_coverage_proven']
    with sqlite3.connect(frontier) as c:
        c.execute('DELETE FROM urls WHERE url=?',(BASE+'old.htm',))
    assert observe(frontier,cohort)['unresolved_count'] == 1


def test_crawler_fixed_membership_resume_empty_and_default(tmp_path,monkeypatch):
    import app.school_archive as module
    frontier = setup_archive(tmp_path/'archive')
    cohort = freeze(frontier,tmp_path/'cohort.json')
    calls = []
    def fetch(url,guard=None):
        calls.append(url)
        return b'<a href="new.htm">new notice</a>', 'text/html',url
    monkeypatch.setattr(module,'fetch',fetch)
    with SchoolArchive(frontier.parent) as archive:
        archive.run(1,0,cohort_urls=target_urls(cohort))
    with SchoolArchive(frontier.parent) as archive:
        archive.run(20,0,cohort_urls=target_urls(cohort))
        assert len(calls) == 2
        assert archive.db.execute('SELECT state FROM urls WHERE url=?',(BASE+'new.htm',)).fetchone()[0] == 'pending'
        assert observe(frontier,cohort)['bounded_pass_classified']
        archive.run(20,0,cohort_urls=[])
        assert len(calls) == 2
        with pytest.raises(ValueError):
            archive.run(20,0,retry_failed=True,cohort_urls=[])
        archive.run(1,0)
        assert len(calls) == 3


def test_freeze_refuses_archive_write(tmp_path):
    frontier = setup_archive(tmp_path/'archive')
    with pytest.raises(ValueError):
        freeze(frontier,frontier.parent/'cohort.json')
