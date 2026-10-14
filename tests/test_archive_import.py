import copy
import hashlib

import cv2
import numpy as np
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import app.ingest as ingest
import scripts.import_school_archive as importer
from app.db import Base, Document, Chunk, Audit
from app.school_archive import SchoolArchive


@pytest.fixture
def archive_store(tmp_path, monkeypatch):
    (tmp_path / 'raw').mkdir()
    monkeypatch.setattr(ingest, 'DATA', tmp_path)
    monkeypatch.setattr(ingest, 'fetch', lambda *a, **k: pytest.fail('Import must not fetch HTTP.'))
    monkeypatch.setattr(ingest, 'embeddings', lambda *a, **k: pytest.fail('Embedding must remain opt-in.'))
    engine = create_engine('sqlite:///' + (tmp_path / 'business.sqlite3').as_posix())
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    archive = SchoolArchive(tmp_path / 'archive')
    def add(url, content, mime='text/html', parent=None, old_state=None):
        digest = hashlib.sha256(content).hexdigest()
        (archive.directory / 'blobs' / digest).write_bytes(content)
        archive.enqueue(url, '归档标题', parent, 1 if parent else 0, 'img' if parent else 'link')
        archive.db.execute("UPDATE urls SET state='fetched',final_url=?,sha256=?,mime=?,import_state=? WHERE url=?",
                           (url, digest, mime, old_state, url))
        archive.db.commit()
        return digest
    try:
        yield archive, factory, add
    finally:
        archive.close()
        engine.dispose()


def image_bytes():
    ok, encoded = cv2.imencode('.png', np.zeros((20, 40, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def source_html(body, header_image=False):
    return (f'<html><h1>南京晓庄学院班车时刻表</h1><div>发布时间：2026-10-08</div>'
            f'{"<img src=/logo.png>" if header_image else ""}'
            f'<div class="wp_articlecontent">{body}</div></html>').encode()


def mock_ocr(monkeypatch):
    calls = []
    def ocr(image):
        calls.append(image.shape)
        return [[[[0, 0], [30, 0], [30, 10], [0, 10]], '方山校区班车发车时间为08:00。', .98]]
    monkeypatch.setattr(ingest, 'local_ocr', ocr)
    return calls


def test_image_priority_imports_body_image_before_unrelated_article(archive_store, monkeypatch):
    archive, factory, add = archive_store
    unrelated = 'https://www.njxzc.edu.cn/a/page.htm'
    page = 'https://www.njxzc.edu.cn/z/page.htm'
    image = 'https://www.njxzc.edu.cn/z/body.png'
    add(unrelated, source_html('<p>这个无关网页正文足够长，应在本批次图片之后处理。</p>'))
    add(page, source_html('<img src="/z/body.png">'))
    add(image, image_bytes(), 'image/png', page)
    calls = mock_ocr(monkeypatch)
    with factory() as session:
        report = importer.import_archive(archive.db, session, archive.directory, limit=2, images_first=True)
        assert session.scalar(select(Document).where(Document.source_url == image)) is not None
        assert session.scalar(select(Document).where(Document.source_url == unrelated)) is None
        assert report['processing_policy'] == 'images_then_pdf_word_v1'
        assert report['event_resource_states']['image:imported'] == 1
        assert len(calls) == 1
        importer.import_archive(archive.db, session, archive.directory, limit=2, images_first=True)
        assert len(calls) == 1  # pending selection never re-OCRs an imported image


def test_retry_image_only_article_keeps_html_and_ocr_provenance(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page = 'https://www.njxzc.edu.cn/notice/page.htm'
    image = 'https://www.njxzc.edu.cn/table.png'
    page_hash = add(page, source_html('<p><img src="/table.png"></p>', True), old_state='not_searchable')
    image_hash = add(image, image_bytes(), 'image/png', page, 'not_searchable')
    add('https://www.njxzc.edu.cn/logo.png', image_bytes(), 'image/png', page, 'not_searchable')
    ocr_calls = mock_ocr(monkeypatch)
    with factory() as session:
        before = importer.import_archive(archive.db, session, archive.directory)
        assert before['import_attempts_this_run'] == 0
        result = importer.import_archive(archive.db, session, archive.directory, retry_states=['not_searchable'])
        docs = session.scalars(select(Document)).all()
        assert len(docs) == 2
        html_doc = next(d for d in docs if d.source_url == page)
        image_doc = next(d for d in docs if d.source_url == image)
        assert html_doc.status == 'parse_failed'
        assert html_doc.sha256 == page_hash
        assert image_doc.parent_id == html_doc.id
        assert image_doc.title == html_doc.title == '南京晓庄学院班车时刻表'
        assert image_doc.published_at == html_doc.published_at == '2026-10-08'
        assert image_doc.sha256 == image_hash
        assert image_doc.status == 'pending_review'
        assert any(page in warning for warning in image_doc.warnings)
        assert any('OCR' in warning for warning in image_doc.warnings)
        chunk = session.scalar(select(Chunk).where(Chunk.document_id == image_doc.id))
        assert chunk.location == 'OCR 框 1 / 置信度 0.980 xy=0,0;30,0;30,10;0,10'
        assert chunk.text == '方山校区班车发车时间为08:00。'
        audit = session.scalar(select(Audit).where(Audit.action == 'archive_body_image'))
        assert audit.changes['source_page_sha256'] == page_hash
        assert audit.changes['image_sha256'] == image_hash
        assert result['teacher_publication_performed'] is False
        assert result['embedding_requested'] is False
    assert len(ocr_calls) == 1


def test_header_image_is_not_ocr_even_with_img_edge(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page = 'https://www.njxzc.edu.cn/notice.htm'
    add(page, source_html('<p>这是一份内容充足的公开通知，相关事项请以正式通知原文为准。</p>', True))
    add('https://www.njxzc.edu.cn/logo.png', image_bytes(), 'image/png', page)
    calls = mock_ocr(monkeypatch)
    with factory() as session:
        importer.import_archive(archive.db, session, archive.directory)
        assert len(session.scalars(select(Document)).all()) == 1
    assert not calls
    row = archive.db.execute("SELECT import_state,import_error FROM urls WHERE url LIKE '%logo.png'").fetchone()
    assert row['import_state'] == 'not_searchable'
    assert 'decorative' in row['import_error']


def test_existing_published_documents_are_never_edited(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page, image = 'https://www.njxzc.edu.cn/a.htm', 'https://www.njxzc.edu.cn/table.png'
    page_hash = add(page, source_html('<p><img src="/table.png"></p>'), old_state='not_searchable')
    image_hash = add(image, image_bytes(), 'image/png', page, 'not_searchable')
    with factory() as session:
        parent = Document(id='reviewed-page', title='教师核验标题', source_url=page, sha256=page_hash,
                          raw_name='old.html', mime='.html', visibility='public', kind='knowledge', status='published',
                          published_at='2026-10-07', warnings=['人工核验记录'], attachments=[{'url': image, 'status': 'teacher-confirmed'}])
        child = Document(id='reviewed-image', title='教师核验图片', source_url=image, sha256=image_hash,
                         raw_name='old.png', mime='.png', visibility='public', kind='policy', status='published',
                         warnings=['教师确认'], published_at='2026-10-06')
        session.add_all([parent, child]); session.commit()
        before = [{c.name: copy.deepcopy(getattr(d, c.name)) for c in Document.__table__.columns} for d in (parent, child)]
        monkeypatch.setattr(importer, 'ingest_bytes', lambda *a, **k: pytest.fail('Existing documents must bypass mutable ingest duplicate handling.'))
        importer.import_archive(archive.db, session, archive.directory, retry_states=['not_searchable'])
        session.expire_all()
        after = [{c.name: copy.deepcopy(getattr(d, c.name)) for c in Document.__table__.columns} for d in (parent, child)]
        assert before == after


def test_withdrawn_article_does_not_reintroduce_image(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page, image = 'https://www.njxzc.edu.cn/a.htm', 'https://www.njxzc.edu.cn/table.png'
    digest = add(page, source_html('<p><img src="/table.png"></p>'), old_state='not_searchable')
    add(image, image_bytes(), 'image/png', page, 'not_searchable')
    calls = mock_ocr(monkeypatch)
    with factory() as session:
        session.add(Document(id='withdrawn-page', title='撤回通知', source_url=page, sha256=digest,
                             raw_name='old.html', mime='.html', visibility='public', kind='knowledge', status='withdrawn'))
        session.commit()
        importer.import_archive(archive.db, session, archive.directory, retry_states=['not_searchable'])
        assert len(session.scalars(select(Document)).all()) == 1
        assert session.get(Document, 'withdrawn-page').status == 'withdrawn'
    assert not calls
    assert archive.db.execute('SELECT import_state FROM urls WHERE url=?', (image,)).fetchone()[0] == 'blocked'


def test_limit_allows_image_import_on_next_run(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page, image = 'https://www.njxzc.edu.cn/a.htm', 'https://www.njxzc.edu.cn/table.png'
    add(page, source_html('<p><img src="/table.png"></p>'))
    add(image, image_bytes(), 'image/png', page)
    calls = mock_ocr(monkeypatch)
    with factory() as session:
        assert importer.import_archive(archive.db, session, archive.directory, limit=1)['import_attempts_this_run'] == 1
        assert not calls
        assert importer.import_archive(archive.db, session, archive.directory, limit=1)['import_attempts_this_run'] == 1
        assert len(calls) == 1
        assert len(session.scalars(select(Document)).all()) == 2


def test_xls_is_delegated_locally_with_embedding_off(archive_store, monkeypatch):
    archive, factory, add = archive_store
    url = 'https://www.njxzc.edu.cn/list.xls'
    digest = add(url, b'legacy xls bytes', 'application/vnd.ms-excel')
    calls = []
    def fake_ingest(session, content, filename, source, visibility, kind, parent_id, embed):
        calls.append((content, filename, source, embed))
        doc = Document(id='xls-doc', title=filename, source_url=source, sha256=digest,
                       raw_name='xls.raw', mime='.xls', visibility=visibility, kind=kind, status='pending_review')
        session.add(doc); session.commit()
        return doc, False
    monkeypatch.setattr(importer, 'ingest_bytes', fake_ingest)
    with factory() as session:
        importer.import_archive(archive.db, session, archive.directory)
    assert calls == [(b'legacy xls bytes', '归档标题.xls', url, False)]


def test_retry_cannot_select_reviewed_or_withdrawn_states(archive_store):
    archive, factory, _ = archive_store
    with factory() as session:
        with pytest.raises(ValueError, match='Only not_searchable and failed'):
            importer.import_archive(archive.db, session, archive.directory, retry_states=['imported', 'withdrawn'])


def test_image_provenance_failure_rolls_back_new_image_and_can_retry(archive_store, monkeypatch):
    archive, factory, add = archive_store
    page, image = 'https://www.njxzc.edu.cn/a.htm', 'https://www.njxzc.edu.cn/table.png'
    add(page, source_html('<p><img src="/table.png"></p>'))
    add(image, image_bytes(), 'image/png', page)
    mock_ocr(monkeypatch)
    original_audit = importer.Audit
    monkeypatch.setattr(importer, 'Audit', lambda **kwargs: (_ for _ in ()).throw(RuntimeError('provenance write failed')))
    with factory() as session:
        importer.import_archive(archive.db, session, archive.directory)
        assert len(session.scalars(select(Document)).all()) == 1
        assert session.scalar(select(Document).where(Document.source_url == image)) is None
        assert archive.db.execute('SELECT import_state FROM urls WHERE url=?', (image,)).fetchone()[0] == 'failed'
        monkeypatch.setattr(importer, 'Audit', original_audit)
        importer.import_archive(archive.db, session, archive.directory, retry_states=['failed'])
        doc = session.scalar(select(Document).where(Document.source_url == image))
        assert doc.parent_id is not None
        assert doc.published_at == '2026-10-08'


@pytest.mark.parametrize('tag', ['pdfsrc', 'object', 'embed', 'iframe'])
def test_embedded_only_article_keeps_existing_parent_and_attachment_times(archive_store, monkeypatch, tag):
    archive, factory, add = archive_store
    page, pdf = 'http://www.njxzc.edu.cn/e0/a0/c89a57504/page.htm', 'http://www.njxzc.edu.cn/_upload/bus.pdf'
    original_name = '南京晓庄学院班车时刻表（2023年9月25日起试行）.pdf'
    markup = {
        'pdfsrc': f'<div pdfsrc="/_upload/bus.pdf" sudyfile-attr="{{\'title\':\'{original_name}\'}}"></div>',
        'object': f'<object data="/_upload/bus.pdf" title="{original_name}"></object>',
        'embed': f'<embed src="/_upload/bus.pdf" title="{original_name}">',
        'iframe': f'<iframe src="/_upload/bus.pdf" title="{original_name}"></iframe>',
    }[tag]
    html = (f'<h1>南京晓庄学院班车时刻表</h1><div>发布时间：2024-08-30</div>'
            f'<div class="wp_articlecontent">{markup}</div>').encode()
    page_hash = add(page, html, old_state='not_searchable')
    pdf_hash = add(pdf, b'archived pdf fixture', 'application/pdf', page)
    archive.db.execute('UPDATE edges SET relation=? WHERE child=?', (tag, pdf)); archive.db.commit()
    original_parse = ingest.parse
    def parse(content, suffix, source_url=None):
        if suffix == '.pdf':
            return None, None, None, [('第 1 页 / 段落 1', '班车时刻表（2023年9月25日起试行），发车时间08:00。')], [], []
        return original_parse(content, suffix, source_url)
    monkeypatch.setattr(ingest, 'parse', parse)
    with factory() as session:
        parent = Document(id='original-parent', title='南京晓庄学院班车时刻表', source_url=page,
                          sha256=page_hash, raw_name='original.html', mime='.html', visibility='public',
                          kind='knowledge', status='parse_failed', error='原HTML没有文本，保持原记录', published_at='2024-08-30')
        session.add(parent); session.commit()
        importer.import_archive(archive.db, session, archive.directory, retry_states=['not_searchable'])
        doc = session.scalar(select(Document).where(Document.source_url == pdf))
        assert doc.parent_id == parent.id
        assert doc.published_at == '2024-08-30'
        assert doc.sha256 == pdf_hash
        assert parent.title in doc.title and original_name in doc.title
        assert any('不能据此推定当前仍在执行' in warning for warning in doc.warnings)
        assert parent.status == 'parse_failed' and parent.error == '原HTML没有文本，保持原记录'
        chunk = session.scalar(select(Chunk).where(Chunk.document_id == doc.id))
        assert chunk.location == '第 1 页 / 段落 1'
        assert '2023年9月25日起试行' in chunk.text
        audit = session.scalar(select(Audit).where(Audit.action == 'archive_article_attachment'))
        assert audit.changes['original_attachment_name'] == original_name
        assert audit.changes['source_page_sha256'] == page_hash


def test_embedded_file_outside_article_does_not_make_empty_body_searchable():
    html = b'<object data="/outside.pdf"></object><div class="wp_articlecontent"></div>'
    assert importer.article_info(html, 'https://www.njxzc.edu.cn/a.htm', 'Empty') is None
