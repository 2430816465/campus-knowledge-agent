"""Import archived articles and their supported attachments without HTTP requests.

Body images use local OCR. Source HTML remains a separate document even when it
contains only an image. Existing business documents are reused without edits.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, ROOT
from app.db import Session, Document, Audit, timestamp
from app.ingest import ingest_bytes, uid
from app.school_archive import normalize_url, scope_reason, linked_resources

ARTICLE_SELECTOR = '.wp_articlecontent,.Article_Content,.article-content'
IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp'}
ATTACHMENT_SUFFIXES = {'.pdf', '.docx', '.xlsx', '.xls', '.txt', '.csv'}
RETRY_STATES = {'not_searchable', 'failed'}


class _StagedIngestSession:
    """Keep ingest and new-document provenance in one caller transaction."""
    def __init__(self, session):
        self.session = session

    def __getattr__(self, name):
        return getattr(self.session, name)

    def commit(self):
        self.session.flush()


def archived_content(archive_dir, row):
    content = (Path(archive_dir) / 'blobs' / row['sha256']).read_bytes()
    if hashlib.sha256(content).hexdigest() != row['sha256']:
        raise ValueError('Archive blob does not match its recorded SHA256.')
    return content


def article_info(content, url, fallback_title):
    soup = BeautifulSoup(content, 'html.parser')
    body = soup.select_one(ARTICLE_SELECTOR)
    if body is None:
        return None
    heading = soup.select_one('.arti_title,.Article_Title,.article-title,h1')
    title = heading.get_text(' ', strip=True) if heading else fallback_title
    images = []
    for image in body.select('img[src]'):
        image_url = normalize_url(image.get('src'), url)
        if image_url and not scope_reason(image_url) and image_url not in images:
            images.append(image_url)
    attachments = [resource for resource in linked_resources(body, url)
                   if resource['relation'] in ('a', 'pdfsrc', 'object', 'embed', 'iframe')
                   and not scope_reason(resource['url'])
                   and Path(urlsplit(resource['url']).path).suffix.lower() in ATTACHMENT_SUFFIXES]
    if len(body.get_text(' ', strip=True)) < 20 and not images and not attachments:
        return None
    kind = 'notice' if re.search('竞赛|大赛|挑战杯|数学建模', title) and re.search('报名|通知|选拔|章程', title) else 'knowledge'
    return {'title': title, 'kind': kind, 'images': images, 'attachments': attachments}


def row_url(row):
    return row['final_url'] or row['url']


def existing_document(session, row):
    return session.scalar(select(Document).where(
        Document.sha256 == row['sha256'], Document.source_url == row_url(row),
        Document.visibility == 'public'))


def article_parent(db, archive_dir, image_row, attachment=False):
    """Confirm the image is in a real article body, not merely a page edge."""
    image_urls = {image_row['url'], row_url(image_row)}
    parents = db.execute('''SELECT DISTINCT u.* FROM urls u JOIN edges e
        ON (e.parent=u.url OR e.parent=u.final_url)
        WHERE e.child IN (?,?) AND e.relation IN ('img','a','pdfsrc','object','embed','iframe') AND u.state='fetched'
        ORDER BY u.depth,u.url''', (image_row['url'], row_url(image_row))).fetchall()
    for parent in parents:
        if 'html' not in (parent['mime'] or '').lower():
            continue
        info = article_info(archived_content(archive_dir, parent), row_url(parent), parent['title'] or parent['label'])
        urls = [resource['url'] for resource in info['attachments']] if attachment and info else info['images'] if info else []
        if info and image_urls.intersection(urls):
            return parent, info
    return None, None


def import_archive(db, session, archive_dir, limit=100, embed=False, retry_states=(), on_event=None, *, selected_urls=None, images_first=False):
    retry_states = set(retry_states)
    if retry_states - RETRY_STATES:
        raise ValueError('Only not_searchable and failed imports may be selected for retry.')
    placeholders = ','.join('?' for _ in retry_states)
    predicate = 'import_state IS NULL' + (f' OR import_state IN ({placeholders})' if retry_states else '')
    rows = db.execute(f"SELECT * FROM urls WHERE state='fetched' AND ({predicate}) ORDER BY depth,priority DESC,url", tuple(sorted(retry_states))).fetchall()
    if selected_urls is not None:
        selected_urls = set(selected_urls)
        rows = [row for row in rows if row['url'] in selected_urls]
    if images_first:
        from scripts.parse_priority import prioritize
        rows = prioritize(rows)
    events, handled, attempts = [], set(), 0

    def mark(row, state, error=None, doc=None, **details):
        db.execute('UPDATE urls SET import_state=?,import_error=?,document_id=? WHERE url=?',
                   (state, error, doc.id if doc else None, row['url']))
        db.commit()
        handled.add(row['url'])
        event = {'url': row_url(row), 'title': doc.title if doc else row['title'],
                 'document_id': doc.id if doc else None, 'state': state, 'error': error, **details}
        if doc or state == 'failed':
            events.append(event)
            if on_event:
                on_event(event)
        return event

    def import_record(row, title, kind, parent=None, body_image=False, source_attachment=False, attachment_label=None):
        nonlocal attempts
        if attempts >= limit:
            return None
        attempts += 1
        try:
            doc = existing_document(session, row)
            reused = doc is not None
            if not reused:
                content = archived_content(archive_dir, row)
                suffix = '.html' if 'html' in (row['mime'] or '').lower() else Path(urlsplit(row_url(row)).path).suffix.lower()
                # Link only the new child after ingest: ingest's attachment
                # helper must not edit an already reviewed parent document.
                doc, duplicate = ingest_bytes(_StagedIngestSession(session), content, title + suffix, row_url(row),
                                              'public', kind, None, embed)
                if duplicate:
                    # A concurrent importer may have inserted after our lookup.
                    # Discard ingest's checked_at update as well.
                    session.rollback()
                    doc = existing_document(session, row)
                    reused = True
                else:
                    if parent:
                        doc.parent_id = parent.id
                    if parent and source_attachment:
                        doc.title = parent.title + (' / ' + attachment_label if attachment_label and attachment_label != parent.title else '')
                        doc.published_at = parent.published_at
                        doc.warnings = list(dict.fromkeys((doc.warnings or []) + [
                            f'官网正文附件：来源页面 {parent.source_url}；父文档 {parent.id}；原附件名称 {attachment_label or row["label"] or "未标注"}。',
                            '发布日期继承来源网页；网页发布日期、附件内实施日期与当前有效性须分别核对，不能据此推定当前仍在执行。']))
                        session.add(Audit(id=uid(), action='archive_article_attachment', entity_id=doc.id, changes={
                            'source_page_url': parent.source_url, 'source_page_sha256': parent.sha256,
                            'parent_document_id': parent.id, 'attachment_url': doc.source_url,
                            'attachment_sha256': doc.sha256, 'original_attachment_name': attachment_label}))
                    if body_image:
                        doc.title = parent.title
                        doc.published_at = parent.published_at
                        doc.warnings = list(dict.fromkeys((doc.warnings or []) + [
                            f'官网通知正文图片：来源页面 {parent.source_url}；父文档 {parent.id}。',
                            '标题和发布日期继承来源通知；本图片由本地OCR提取，日期、人数和资格须核对原图。']))
                        session.add(Audit(id=uid(), action='archive_body_image', entity_id=doc.id, changes={
                            'source_page_url': parent.source_url, 'source_page_sha256': parent.sha256,
                            'parent_document_id': parent.id, 'image_url': doc.source_url,
                            'image_sha256': doc.sha256, 'ocr_review_required': True}))
                    session.commit()
            state = 'imported' if doc.status in ('pending_review', 'published') else doc.status
            mark(row, state, doc.error, doc, reused_existing_document=reused,
                 source_page_url=parent.source_url if body_image or source_attachment else None,
                 source_page_document_id=parent.id if body_image or source_attachment else None)
            return doc
        except Exception as exc:
            session.rollback()
            mark(row, 'failed', f'{type(exc).__name__}: {str(exc)[:250]}')
            return None

    def import_body_image(image_row, parent):
        if parent.status in ('withdrawn', 'superseded'):
            mark(image_row, 'blocked', 'Source article is withdrawn or superseded; no automatic OCR reintroduction.')
            return
        suffix = Path(urlsplit(row_url(image_row)).path).suffix.lower()
        if suffix not in IMAGE_SUFFIXES:
            mark(image_row, 'not_searchable', 'Body image format is archived but not supported for local OCR.')
            return
        kind = parent.kind if parent.kind != 'notice' else 'policy'
        import_record(image_row, parent.title, kind, parent, body_image=True)

    def import_article_attachment(row, parent, label):
        if parent.status in ('withdrawn', 'superseded'):
            mark(row, 'blocked', 'Source article is withdrawn or superseded; attachment remains archived only.')
            return
        kind = parent.kind if parent.kind != 'notice' else 'policy'
        import_record(row, parent.title, kind, parent, source_attachment=True, attachment_label=label)

    for row in rows:
        if attempts >= limit:
            break
        if row['url'] in handled:
            continue
        url, suffix = row_url(row), Path(urlsplit(row_url(row)).path).suffix.lower()
        try:
            if 'html' in (row['mime'] or '').lower():
                info = article_info(archived_content(archive_dir, row), url, row['title'] or row['label'])
                if info is None:
                    mark(row, 'not_searchable', 'No substantial explicit article body or body images; navigation remains archived only.')
                    continue
                parent = import_record(row, info['title'], info['kind'])
                if parent:
                    for image_url in info['images']:
                        image_row = db.execute("SELECT * FROM urls WHERE state='fetched' AND (url=? OR final_url=?) ORDER BY url LIMIT 1", (image_url, image_url)).fetchone()
                        if image_row and image_row['url'] not in handled:
                            import_body_image(image_row, parent)
                    for resource in info['attachments']:
                        attachment = db.execute("SELECT * FROM urls WHERE state='fetched' AND (url=? OR final_url=?) ORDER BY url LIMIT 1", (resource['url'], resource['url'])).fetchone()
                        if attachment and attachment['url'] not in handled:
                            import_article_attachment(attachment, parent, resource['label'])
            elif suffix in IMAGE_SUFFIXES:
                source_row, info = article_parent(db, archive_dir, row)
                if source_row is None:
                    mark(row, 'not_searchable', 'Image is not confirmed inside an archived explicit article body; no decorative-image OCR.')
                    continue
                parent = existing_document(session, source_row)
                if parent is None:
                    parent = import_record(source_row, info['title'], info['kind'])
                if parent:
                    import_body_image(row, parent)
            elif suffix in ATTACHMENT_SUFFIXES:
                source_row, info = article_parent(db, archive_dir, row, attachment=True)
                if source_row is not None:
                    parent = existing_document(session, source_row)
                    if parent is None:
                        parent = import_record(source_row, info['title'], info['kind'])
                    if parent:
                        resource = next(item for item in info['attachments'] if item['url'] in (row['url'], url))
                        import_article_attachment(row, parent, resource['label'])
                    continue
                parent_row = db.execute('SELECT document_id FROM urls WHERE url=? OR final_url=? LIMIT 1',
                                        (row['parent'], row['parent'])).fetchone() if row['parent'] else None
                parent = session.get(Document, parent_row['document_id']) if parent_row and parent_row['document_id'] else None
                if parent is None and row['parent']:
                    parent = session.scalar(select(Document).where(Document.source_url == row['parent'], Document.visibility == 'public'))
                if parent and parent.status in ('withdrawn', 'superseded'):
                    mark(row, 'blocked', 'Source article is withdrawn or superseded; attachment remains archived only.')
                    continue
                kind = parent.kind if parent and parent.kind != 'notice' else 'policy'
                import_record(row, row['title'] or row['label'] or Path(urlsplit(url).path).name, kind, parent)
            else:
                mark(row, 'not_searchable', 'Archived resource; parser unavailable here. Legacy DOC requires the separate local conversion step.')
        except Exception as exc:
            session.rollback()
            mark(row, 'failed', f'{type(exc).__name__}: {str(exc)[:250]}')
    from scripts.parse_priority import POLICY, resource_group
    groups = {row_url(row): resource_group(row) for row in rows}
    event_groups = {}
    for event in events:
        group = groups.get(event['url'], 'associated_parent_or_resource')
        key = group + ':' + event['state']
        event_groups[key] = event_groups.get(key, 0) + 1
    return {'checked_at': timestamp(), 'import_attempts_this_run': attempts, 'events': events,
            'processing_policy': POLICY if images_first else 'depth_priority',
            'event_resource_states': event_groups,
            'import_states': {r[0]: r[1] for r in db.execute("SELECT COALESCE(import_state,'pending'),COUNT(*) FROM urls WHERE state='fetched' GROUP BY import_state")},
            'embedding_requested': embed, 'retry_states': sorted(retry_states),
            'teacher_publication_performed': False,
            'note': 'Only archived bytes were used. Existing documents were reused without editing; OCR is unreviewed. Unsupported resources remain explicitly archived only.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--embed', action='store_true')
    parser.add_argument('--retry-states', nargs='+', choices=sorted(RETRY_STATES), default=[],
                        help='Recheck prior unsupported/failed archive items without rewriting existing business documents.')
    args = parser.parse_args()
    if args.limit < 1:
        parser.error('--limit must be positive')
    from scripts.sync_school_archive import PipelineLock
    # The independent parser owns this same lock for its entire bounded run.
    # It never takes the crawler lock or the pipeline lock.
    with PipelineLock(DATA / 'school-archive/business-import.lock'), sqlite3.connect(
            DATA / 'school-archive/frontier.sqlite3', timeout=30) as db:
        db.row_factory = sqlite3.Row
        with Session() as session:
            report = import_archive(db, session, DATA / 'school-archive', args.limit, args.embed, args.retry_states,
                                    on_event=lambda event: print(json.dumps(event, ensure_ascii=False), flush=True))
        (ROOT / 'reports/school-archive-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({k: v for k, v in report.items() if k != 'events'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
