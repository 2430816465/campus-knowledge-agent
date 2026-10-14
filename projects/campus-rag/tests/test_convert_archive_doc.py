"""Conversion tests use fake Word, fake business ingestion and fake frontier.

No project config/secrets, Microsoft Word or live database is loaded.
"""
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from zipfile import ZipFile
from copy import deepcopy
import pytest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/convert_archive_doc.py'
SPEC = importlib.util.spec_from_file_location('convert_archive_doc', SCRIPT)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def package(path, text='学校公开附件正文'):
    with ZipFile(path, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', '<document>' + text + '</document>')


class FakeStore:
    def __init__(self, status='pending_review'):
        self.status, self.originals, self.derived, self.calls = status, {}, {}, []

    def already_imported(self, row):
        return row.get('document_id') == 'already-searchable'

    def ensure_original(self, row, content):
        self.calls.append(('original', row['url']))
        digest = hashlib.sha256(content).hexdigest()
        if digest not in self.originals:
            self.originals[digest] = SimpleNamespace(id='original-' + digest, sha256=digest,
                source_url=module.source_url(row), status='parse_failed', error='Old DOC unsupported')
        return self.originals[digest]

    def find_conversion(self, original):
        return self.derived.get(original.id)

    def is_usable(self, derived):
        return derived.status in ('pending_review', 'published')

    def ingest_conversion(self, original, content, embed=False):
        self.calls.append(('ingest', original.id, embed))
        doc = SimpleNamespace(id='derived-' + original.sha256, sha256=hashlib.sha256(content).hexdigest(),
                              status=self.status, error='No parsed text' if self.status == 'parse_failed' else None)
        self.derived[original.id] = doc
        return doc

    def record_conversion(self, original, derived, row):
        self.calls.append(('audit', original.sha256, derived.sha256, self.is_usable(derived)))
        if self.is_usable(derived):
            original.status = 'converted'

    def record_reuse(self, original, derived, row):
        self.calls.append(('reuse', original.id, derived.id))

    def record_failure(self, original, error):
        self.calls.append(('failure', original.id, error))

    def rollback(self):
        self.calls.append(('rollback',))


def archived(tmp_path, content=b'original DOC', name='a.doc'):
    digest = hashlib.sha256(content).hexdigest()
    blobs = tmp_path / 'school-archive/blobs'
    blobs.mkdir(parents=True, exist_ok=True)
    (blobs / digest).write_bytes(content)
    return {'state':'fetched', 'url':'https://www.njxzc.edu.cn/files/' + name,
            'final_url':None, 'sha256':digest, 'document_id':None}


@pytest.mark.parametrize('stderr,expected',[
    (b'CAMPUS_WORD_ERROR|stage=open|hresult=0x800A1066\r\n','stage=open; hresult=0x800A1066'),
    (b'SECRET school document at C:/private/secret.doc','diagnostic=unavailable'),
    (b'CAMPUS_WORD_ERROR|stage=open|hresult=0x800A1066 SECRET','diagnostic=unavailable'),
    (b'CAMPUS_WORD_ERROR|stage=arbitrary|hresult=0x800A1066','diagnostic=unavailable'),
])
def test_word_helper_only_persists_whitelisted_diagnostic_codes(monkeypatch,stderr,expected):
    monkeypatch.setattr(module.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=1,stderr=stderr))
    with pytest.raises(RuntimeError) as error:module.word_convert(Path('helper'),Path('input'),Path('output'))
    assert expected in str(error.value) and 'SECRET' not in str(error.value) and 'private' not in str(error.value)


def conversion_frontier():
    import sqlite3
    db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
    db.execute('CREATE TABLE urls(url TEXT PRIMARY KEY,state TEXT,sha256 TEXT,depth INTEGER,priority INTEGER,import_state TEXT,import_error TEXT,document_id TEXT)')
    db.execute('CREATE TABLE doc_conversions(url TEXT PRIMARY KEY,original_sha256 TEXT,state TEXT,attempts INTEGER,original_document_id TEXT,converted_document_id TEXT,converted_sha256 TEXT,checked_at TEXT,error TEXT)')
    return db


def test_automatic_attempt_limit_retains_failures_and_new_hash_resets_attempts():
    with conversion_frontier() as db:
        for name,attempts,state,digest in [('new',None,None,'a'),('failed',3,'conversion_failed','b'),
                                         ('retry',2,'conversion_failed','c'),('done',3,'converted','d'),
                                         ('changed',3,'conversion_failed','e')]:
            db.execute('INSERT INTO urls VALUES (?,?,?,?,?,?,?,?)',(name,'fetched',digest,0,1,None,None,None))
            if attempts is not None:
                db.execute('INSERT INTO doc_conversions VALUES (?,?,?,?,?,?,?,?,?)',(name,'old' if name=='changed' else digest,state,attempts,None,None,None,None,None))
        assert {r['url'] for r in module.conversion_candidates(db)}=={'new','retry','changed'}
        assert module.conversion_candidates(db)[0]['url']=='retry'
        assert {r['url'] for r in module.conversion_candidates(db,retry_failed=True)}=={'new','failed','retry','changed'}
        event=dict(url='changed',original_sha256='e',state='conversion_failed',original_document_id=None,
                   converted_document_id=None,converted_sha256=None,checked_at='now',error='failure code')
        module.save_frontier_event(db,event)
        assert db.execute("SELECT attempts FROM doc_conversions WHERE url='changed'").fetchone()[0]==1
        module.save_frontier_event(db,event)
        assert db.execute("SELECT attempts FROM doc_conversions WHERE url='changed'").fetchone()[0]==2
        assert db.execute("SELECT attempts FROM doc_conversions WHERE url='failed'").fetchone()[0]==3


def test_success_and_resume_keep_original_hash_and_one_derived_copy(tmp_path):
    row, store, word_calls = archived(tmp_path), FakeStore(), []
    def word(helper, input_file, output_file):
        assert store.calls[0][0] == 'original'
        assert input_file.read_bytes() == b'original DOC'
        assert input_file.name == row['sha256'] + '.original.doc'
        word_calls.append(input_file)
        package(output_file)
    args = (row, store, tmp_path / 'school-archive', tmp_path / 'converted', Path('convert_doc.ps1'))
    first = module.convert_row(*args, converter=word)
    second = module.convert_row(*args, converter=word)
    assert first['state'] == second['state'] == 'converted'
    assert first['original_sha256'] == hashlib.sha256(b'original DOC').hexdigest()
    assert first['converted_document_id'] == second['converted_document_id']
    assert len(word_calls) == len(store.derived) == 1
    assert [call for call in store.calls if call[0] == 'ingest'][0][-1] is False


def test_parse_failure_never_marks_original_or_frontier_imported_and_does_not_duplicate(tmp_path):
    row, store = archived(tmp_path), FakeStore(status='parse_failed')
    calls = []
    def word(helper, input_file, output_file):
        calls.append(True)
        package(output_file)
    args = (row, store, tmp_path / 'school-archive', tmp_path / 'converted', Path('convert_doc.ps1'))
    first = module.convert_row(*args, converter=word)
    second = module.convert_row(*args, converter=word)
    assert first['state'] == second['state'] == 'conversion_parse_failed'
    assert store.originals[row['sha256']].status == 'parse_failed'
    assert first['error'] and len(calls) == len(store.derived) == 1
    frontier = MagicMock()
    module.save_frontier_event(frontier, first)
    update_args = frontier.execute.call_args_list[-1].args[1]
    assert update_args[0] == 'conversion_parse_failed'
    assert update_args[2] == first['original_document_id']


def test_batch_records_each_failure_and_continues_next_doc(tmp_path):
    bad = archived(tmp_path, b'bad DOC', 'bad.doc')
    good = archived(tmp_path, b'good DOC', 'good.doc')
    store, persisted = FakeStore(), []
    def word(helper, input_file, output_file):
        if input_file.read_bytes() == b'bad DOC':
            raise RuntimeError('Word unavailable for this file')
        package(output_file)
    result = module.run_batch([bad, good], store, tmp_path / 'school-archive', tmp_path / 'converted',
                              Path('convert_doc.ps1'), converter=word, persist=persisted.append)
    assert [event['state'] for event in result] == ['conversion_failed', 'converted']
    assert persisted == result and 'Word unavailable' in result[0]['error']
    assert store.originals[bad['sha256']].status == 'parse_failed'


def test_invalid_docx_or_mismatched_archive_is_not_success(tmp_path):
    row, store = archived(tmp_path), FakeStore()
    def invalid_word(helper, input_file, output_file):
        output_file.write_bytes(b'not a DOCX package')
    event = module.convert_row(row, store, tmp_path / 'school-archive', tmp_path / 'converted',
                               Path('helper.ps1'), converter=invalid_word)
    assert event['state'] == 'conversion_failed' and not store.derived
    assert not list((tmp_path / 'converted').glob('*.partial.docx'))
    (tmp_path / 'school-archive/blobs' / row['sha256']).write_bytes(b'tampered DOC')
    event = module.convert_row(row, store, tmp_path / 'school-archive', tmp_path / 'converted',
                               Path('helper.ps1'), converter=invalid_word)
    assert event['state'] == 'conversion_failed' and 'hash does not match' in event['error']


def test_only_fetched_legacy_doc_and_effective_imports_are_skipped(tmp_path):
    row = archived(tmp_path)
    store, called = FakeStore(), []
    def word(helper, input_file, output_file):
        called.append(True)
        package(output_file)
    rows = [{**row, 'state':'failed'}, {**row, 'url':row['url'] + 'x'},
            {**row, 'document_id':'already-searchable'}, row]
    events = module.run_batch(rows, store, tmp_path / 'school-archive', tmp_path / 'converted',
                              Path('helper.ps1'), limit=1, converter=word)
    assert len(events) == len(called) == 1 and events[0]['state'] == 'converted'


def test_ingest_adapter_uses_docx_filename_with_no_doc_url():
    store = object.__new__(module.BusinessStore)
    store.session, store.Document = MagicMock(), MagicMock()
    store.session.scalar.return_value = None
    store.select = MagicMock()
    parsed_doc, calls = SimpleNamespace(id='derived'), []
    def fake_ingest(session, content, filename, **kwargs):
        calls.append((filename, kwargs))
        return parsed_doc, False
    store.ingest_bytes = fake_ingest
    original = SimpleNamespace(title='父通知 / 附件', source_url='https://www.njxzc.edu.cn/a.doc',
                               kind='policy', parent_id='parent')
    assert store.ingest_conversion(original, b'converted bytes') is parsed_doc
    filename, options = calls[0]
    assert filename.endswith('.docx') and options['url'] is None
    assert options['embed'] is False and options['parent_id'] is None


def test_resume_after_ingest_exception_reuses_complete_word_package(tmp_path):
    row, store, word_calls = archived(tmp_path), FakeStore(), []
    real_ingest = store.ingest_conversion
    attempts = []
    def fail_once(original, content, embed=False):
        attempts.append(True)
        if len(attempts) == 1:
            raise RuntimeError('Transient ingestion failure')
        return real_ingest(original, content, embed)
    store.ingest_conversion = fail_once
    def word(helper, input_file, output_file):
        word_calls.append(True)
        package(output_file)
    args = (row, store, tmp_path / 'school-archive', tmp_path / 'converted', Path('helper.ps1'))
    assert module.convert_row(*args, converter=word)['state'] == 'conversion_failed'
    resumed = module.convert_row(*args, converter=word)
    assert resumed['state'] == 'converted' and len(word_calls) == 1
    assert len(store.derived) == 1


def test_metadata_audit_preserves_original_and_failed_derivative_state():
    store = object.__new__(module.BusinessStore)
    store.session = MagicMock()
    store.session.get.return_value = SimpleNamespace(status='pending_review', attachments=[{'url':'https://www.njxzc.edu.cn/a.doc'}])
    store.Document, store.Audit = object(), lambda **kw: SimpleNamespace(**kw)
    store.uid = lambda: 'audit-id'
    store.is_usable = lambda doc: doc.status == 'pending_review'
    original = SimpleNamespace(id='original', sha256='a'*64, status='parse_failed', error='DOC unsupported',
                               title='父通知 / 附件', source_url='https://www.njxzc.edu.cn/a.doc',
                               parent_id='parent', published_at='2026-10-08', publisher='教务处')
    derivative = SimpleNamespace(id='derived', sha256='b'*64, status='parse_failed', warnings=[])
    store.record_conversion(original, derivative, {'url':original.source_url})
    assert original.status == 'parse_failed' and original.sha256 == 'a'*64
    assert derivative.source_url == original.source_url and derivative.published_at == '2026-10-08'
    assert derivative.parent_id == 'parent' and '本地转换副本' in derivative.title
    audit = store.session.add.call_args.args[0]
    assert audit.changes['original_sha256'] == 'a'*64 and audit.changes['searchable'] is False
    assert audit.changes['derived_copy'] is True


def bare_store():
    store = object.__new__(module.BusinessStore)
    store.session, store.Document = MagicMock(), MagicMock()
    store.Audit = lambda **kw: SimpleNamespace(**kw)
    store.uid, store.select = lambda: 'audit', MagicMock()
    store.ingest_bytes = MagicMock()
    return store


def test_existing_published_original_never_enters_mutating_ingest_duplicate_path():
    store = bare_store()
    original = SimpleNamespace(id='original', sha256='a'*64, source_url='https://www.njxzc.edu.cn/a.doc',
                               status='published', checked_at='unchanged', title='Reviewed title')
    store.parent = lambda row: SimpleNamespace(status='published', title='Parent')
    store.session.scalar.return_value = original
    before = deepcopy(vars(original))
    assert store.ensure_original({'url':original.source_url, 'sha256':original.sha256}, b'raw') is original
    assert vars(original) == before and not store.ingest_bytes.called
    assert not store.session.commit.called


@pytest.mark.parametrize('status', ['withdrawn', 'superseded'])
@pytest.mark.parametrize('blocked_subject', ['parent', 'original', 'frontier_document'])
def test_withdrawn_or_superseded_documents_block_new_conversion(status, blocked_subject):
    store = bare_store()
    blocked = SimpleNamespace(id='blocked', status=status)
    store.parent = lambda row: blocked if blocked_subject == 'parent' else None
    store.session.scalar.return_value = blocked if blocked_subject == 'original' else None
    store.session.get.return_value = blocked
    row = {'url':'https://www.njxzc.edu.cn/a.doc', 'sha256':'a'*64}
    if blocked_subject == 'frontier_document':
        row['document_id'] = 'blocked'
    with pytest.raises(ValueError, match='Review boundary'):
        store.ensure_original(row, b'raw')
    assert not store.ingest_bytes.called


def test_published_original_and_parent_are_unchanged_when_new_derivative_is_recorded():
    store = bare_store()
    parent = SimpleNamespace(status='published', checked_at='keep-parent', attachments=[{'url':'https://www.njxzc.edu.cn/a.doc','status':'published'}])
    original = SimpleNamespace(id='original', sha256='a'*64, status='published', error=None,
                               checked_at='keep-original', title='Reviewed original',
                               source_url='https://www.njxzc.edu.cn/a.doc', parent_id='parent',
                               published_at='2026-10-08', publisher='教务处')
    derivative = SimpleNamespace(id='derived', sha256='b'*64, status='pending_review', warnings=[])
    store.session.get.return_value = parent
    store.is_usable = lambda doc: True
    before = deepcopy((vars(original), vars(parent)))
    store.record_conversion(original, derivative, {'url':original.source_url})
    assert (vars(original), vars(parent)) == before
    assert derivative.source_url == original.source_url and derivative.parent_id == 'parent'


def test_existing_usable_derivative_reuse_is_fully_read_only():
    store = bare_store()
    original = SimpleNamespace(id='original', sha256='a'*64, status='parse_failed', parent_id='parent',
                               source_url='https://www.njxzc.edu.cn/a.doc', checked_at='keep-original')
    derivative = SimpleNamespace(id='derived', sha256='b'*64, status='published', checked_at='keep-derived')
    parent = SimpleNamespace(status='published', checked_at='keep-parent', attachments=[{'status':'published'}])
    store.session.get.return_value = parent
    before = deepcopy((vars(original), vars(derivative), vars(parent)))
    store.record_reuse(original, derivative, {'url':original.source_url})
    assert (vars(original), vars(derivative), vars(parent)) == before
    assert store.session.add.call_args.args[0].changes['read_only_reuse'] is True
    assert not store.ingest_bytes.called


def test_existing_published_derivative_record_conversion_only_writes_reuse_audit():
    store = bare_store()
    original = SimpleNamespace(id='original', sha256='a'*64, status='parse_failed', parent_id=None)
    derivative = SimpleNamespace(id='derived', sha256='b'*64, status='published')
    store.is_usable = lambda doc: True
    before = deepcopy((vars(original), vars(derivative)))
    store.record_conversion(original, derivative, {'url':'https://www.njxzc.edu.cn/a.doc'})
    assert (vars(original), vars(derivative)) == before
    assert store.session.add.call_args.args[0].action == 'archive_doc_reuse'


def test_word_helper_keeps_safety_settings_and_passes_com_close_quit_by_reference():
    helper = (SCRIPT.parent / 'convert_doc.ps1').read_text(encoding='utf-8')
    assert '$word.AutomationSecurity=3' in helper
    assert '$word.Documents.Open($inputAbsolute,$false,$true,$false)' in helper
    assert '$document.Close([ref]$saveChanges)' in helper
    assert '$word.Quit([ref]$saveChanges)' in helper
    assert '.Close(0)' not in helper and '.Quit(0)' not in helper
