"""Resumably convert archived public DOC files with the existing local Word helper.

Original bytes and their hash remain authoritative. DOCX is a derived local
copy, never described as an original school attachment. Nothing is published.
The core accepts a store/converter so tests never need Word or a live database.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import BadZipFile, ZipFile


def checked_at():
    return datetime.now(timezone.utc).isoformat()


def source_url(row):
    return row.get('final_url') or row['url']


def is_archived_doc(row):
    return (row.get('state') == 'fetched'
            and Path(urlsplit(source_url(row)).path).suffix.lower() in ('.doc','.docx'))


def validate_docx(path):
    if not path.is_file() or not path.stat().st_size:
        raise ValueError('Word did not produce a nonempty DOCX file')
    try:
        with ZipFile(path) as archive:
            if 'word/document.xml' not in archive.namelist() or '[Content_Types].xml' not in archive.namelist():
                raise ValueError('Converted file is not a Word DOCX package')
            if archive.testzip() is not None:
                raise ValueError('Converted DOCX package failed its CRC check')
    except BadZipFile as exc:
        raise ValueError('Converted file is not a valid DOCX package') from exc


def word_convert(helper, original_path, output_path):
    # The existing helper disables macros and opens the source read-only.
    result = subprocess.run([
        'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(helper),
        '-InputFile', str(original_path), '-OutputFile', str(output_path),
    ], timeout=90, capture_output=True)
    if result.returncode:
        # Accept only a fixed diagnostic code, never Office debug text, paths,
        # document contents or exception messages in the persistent report.
        stderr = result.stderr.decode('ascii', errors='ignore') if isinstance(result.stderr, bytes) else (result.stderr or '')
        match = re.search(r'(?m)^CAMPUS_WORD_ERROR\|stage=(resolve|create|open|save|close|quit)\|hresult=(0x[0-9A-F]{8})\s*$', stderr)
        diagnostic = f'; stage={match[1]}; hresult={match[2]}' if match else '; diagnostic=unavailable'
        raise RuntimeError(f'Local Word helper exited with code {result.returncode}' + diagnostic)


def converted_copy(digest, original_path, output_dir, helper, converter):
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / (digest + '.docx')
    if output_path.exists():
        validate_docx(output_path)
        return output_path
    temporary = output_dir / (digest + '.' + uuid.uuid4().hex + '.partial.docx')
    try:
        converter(helper, original_path, temporary)
        validate_docx(temporary)
        temporary.replace(output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return output_path


def original_word_copy(digest, content, output_dir):
    """Keep a hash-verified .doc extension for Word's format detection."""
    output_dir.mkdir(parents=True, exist_ok=True)
    original = output_dir / (digest + '.original.doc')
    if original.exists():
        if hashlib.sha256(original.read_bytes()).hexdigest() != digest:
            raise ValueError('Local original DOC copy has a different hash')
        return original
    temporary = output_dir / (digest + '.' + uuid.uuid4().hex + '.original.partial.doc')
    try:
        temporary.write_bytes(content)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != digest:
            raise ValueError('Original DOC copy failed its SHA256 check')
        temporary.replace(original)
    finally:
        if temporary.exists():
            temporary.unlink()
    return original


def convert_row(row, store, archive_dir, output_dir, helper, embed=False, converter=word_convert):
    """Return one durable-state event; a failed row never aborts the batch."""
    event = {'url': row['url'], 'source_url': source_url(row), 'checked_at': checked_at(),
             'original_sha256': row.get('sha256'), 'state': 'failed',
             'original_document_id': None, 'converted_document_id': None,
             'converted_sha256': None, 'error': None}
    original = None
    try:
        if not is_archived_doc(row):
            event['state'] = 'skipped'
            return event
        digest = row.get('sha256') or ''
        if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('Archive is missing a valid SHA256 blob identifier')
        original_path = Path(archive_dir) / 'blobs' / digest
        content = original_path.read_bytes()
        if hashlib.sha256(content).hexdigest() != digest:
            raise ValueError('Archived DOC hash does not match its original blob')
        declared_suffix=Path(urlsplit(source_url(row)).path).suffix.lower()
        from app.file_formats import office_package_suffix
        native_suffix = office_package_suffix(content,declared_suffix)
        if declared_suffix=='.docx' and not native_suffix:
            from app.file_formats import legacy_word_package
            if not legacy_word_package(content):
                raise ValueError('DOCX is not a verified legacy Word package')
            event.update(processing_method='mislabeled_legacy_word_conversion',detected_suffix='.doc',
                         declared_suffix=declared_suffix,original_bytes_changed=False)
        original = store.ensure_original(row, content)
        event['original_document_id'] = original.id
        if native_suffix:
            native = store.parse_native_original(original,content,native_suffix)
            usable=store.is_usable(native)
            state='native_parsed' if usable else ('partial_parse' if native.status=='partial_parse' else 'native_parse_failed')
            event.update(state=state,converted_document_id=native.id,
                         converted_sha256=native.sha256,processing_method='native_ooxml_parse',
                         detected_suffix=native_suffix,word_invoked=False,original_bytes_changed=False)
            if state=='partial_parse':
                event['error']='Native package parsing incomplete; retained chunks and warnings require review'
            elif not usable:event['error']=f'Native package is not searchable ({native.status})'
            return event
        derived = store.find_conversion(original)
        if derived is not None and derived.status=='partial_parse' and hasattr(store,'repair_conversion_images'):
            derived=store.repair_conversion_images(derived)
            if derived.status=='partial_parse':
                event.update(state='conversion_parse_failed',converted_document_id=derived.id,
                    converted_sha256=derived.sha256,reused=True,word_invoked=False,
                    error='Derived DOCX parsing incomplete; retained chunks and warnings require review')
                return event
        if derived is not None and store.is_usable(derived):
            store.record_reuse(original, derived, row)
            event.update(state='converted', converted_document_id=derived.id,
                         converted_sha256=derived.sha256, reused=True)
            return event
        # A complete local package survives crashes after Word but before ingest.
        word_input = original_word_copy(digest, content, Path(output_dir))
        output_path = converted_copy(digest, word_input, Path(output_dir), helper, converter)
        converted_content = output_path.read_bytes()
        converted_digest = hashlib.sha256(converted_content).hexdigest()
        if declared_suffix=='.docx':
            # Word may take time; recheck source and fresh ancestor permissions
            # before ingesting a derivative, including concurrent review edits.
            original=store.ensure_original(row,content)
        if derived is None or derived.sha256 != converted_digest:
            derived = store.ingest_conversion(original, converted_content, embed=embed)
        event.update(converted_document_id=derived.id, converted_sha256=derived.sha256)
        usable = store.is_usable(derived)
        if usable and getattr(derived, 'source_url', None) == original.source_url:
            store.record_reuse(original, derived, row)
        else:
            store.record_conversion(original, derived, row)
        if usable:
            event['state'] = 'converted'
        else:
            event.update(state='conversion_parse_failed',
                         error=f'Derived DOCX is not searchable ({derived.status}): {derived.error or "parsing incomplete; inspect retained chunks and warnings"}')
    except Exception as exc:
        store.rollback()
        event.update(state='conversion_failed', error=f'{type(exc).__name__}: {str(exc)[:300]}')
        if original is not None:
            try:
                store.record_failure(original, event['error'])
            except Exception as audit_exc:
                store.rollback()
                event['error'] += f'; failure audit also failed: {type(audit_exc).__name__}'
    return event


class BusinessStore:
    """Business database adapter; imported only by an explicitly invoked CLI."""
    def __init__(self, session):
        from sqlalchemy import select
        from app.db import Document, Chunk, Audit
        from app.ingest import ingest_bytes, uid, link_attachment
        self.session, self.select = session, select
        self.Document, self.Chunk, self.Audit = Document, Chunk, Audit
        self.ingest_bytes, self.uid, self.link_attachment = ingest_bytes, uid, link_attachment

    def parent(self, row):
        if not row.get('parent'):
            return None
        return self.session.scalar(self.select(self.Document).where(
            self.Document.source_url == row['parent'], self.Document.visibility == 'public'
        ).order_by(self.Document.version.desc()))

    def is_usable(self, doc):
        return (doc.visibility == 'public' and doc.status in ('pending_review', 'published')
                and self.session.scalar(self.select(self.Chunk.id).where(
                    self.Chunk.document_id == doc.id).limit(1)) is not None)

    def already_imported(self, row):
        doc = self.session.get(self.Document, row.get('document_id')) if row.get('document_id') else None
        return doc is not None and self.is_usable(doc)

    def parse_native_original(self, original, content, detected_suffix):
        """Repair an unparsed source in-place; preserve identity and teacher authority."""
        from sqlalchemy import select
        from app.ingest import parse
        from app.source_scope import eligibility
        from app.file_formats import office_package_suffix
        declared_suffix=original.mime
        if declared_suffix not in ('.doc','.docx') or detected_suffix!=office_package_suffix(content,declared_suffix) or detected_suffix not in ('.docx','.xlsx'):
            raise ValueError('Native format detection mismatch')
        doc=self.session.scalar(select(self.Document).where(self.Document.id==original.id)
            .with_for_update().execution_options(populate_existing=True))
        self.review_guard(doc)
        if doc is None or doc.visibility!='public' or doc.mime!=declared_suffix or hashlib.sha256(content).hexdigest()!=doc.sha256:
            raise ValueError('Native parse source no longer matches')
        def check_ancestors():
            metadata={r.id:dict(r._mapping) for r in self.session.execute(select(
                self.Document.id,self.Document.parent_id,self.Document.visibility,self.Document.status))}
            # Only testing ancestor access; no temporary change to business state.
            metadata[doc.id]={**metadata[doc.id],'status':'pending_review'}
            if not eligibility(doc.id,metadata)['eligible']:
                raise ValueError('Native parse ancestor not public/allowed')
        check_ancestors()
        if self.is_usable(doc):
            return doc  # New original already parsed by ingest; do not reparse reviewed data.
        if doc.status=='partial_parse' and self.session.scalar(select(self.Chunk.id).where(
                self.Chunk.document_id==doc.id).limit(1)):
            # Native partial evidence is not an empty legacy Word failure.
            # DOCX image recovery appends only verified new OCR blocks; XLSX
            # partial data remains intact for a separate format-specific repair.
            return self.repair_docx_images(doc,content) if detected_suffix=='.docx' and doc.mime=='.docx' else doc
        if doc.status!='parse_failed' or self.session.scalar(select(self.Chunk.id).where(self.Chunk.document_id==doc.id).limit(1)):
            raise ValueError('Native repair requires failed source without existing chunks')
        _,_,_,blocks,warnings,_=parse(content,declared_suffix,doc.source_url)
        if not blocks:raise ValueError('Native package contains no searchable text')
        check_ancestors()
        chunks=[self.Chunk(id=self.uid(),document_id=doc.id,text=text,location=location)
                for location,text in blocks if text.strip()]
        if not chunks:raise ValueError('Native package contains no searchable rows')
        self.session.add_all(chunks)
        doc.status='partial_parse' if any('截断' in w or '待 OCR' in w for w in warnings) else 'pending_review'
        doc.error=None
        doc.warnings=list(dict.fromkeys((doc.warnings or [])+warnings))
        self.session.add(self.Audit(id=self.uid(),action='archive_native_format_parse',entity_id=doc.id,
            changes={'original_sha256':doc.sha256,'declared_suffix':declared_suffix,'detected_suffix':detected_suffix,
                'source_url':doc.source_url,'chunks_created':len(chunks),'original_bytes_changed':False,
                'existing_chunks_replaced':False,'word_invoked':False,'embedding_requested':False,
                'teacher_publication_performed':False}))
        self.session.commit()
        return doc

    @staticmethod
    def review_guard(doc):
        if doc is not None and doc.status in ('withdrawn', 'superseded'):
            raise ValueError(f'Review boundary: {doc.status} document cannot be reintroduced')

    def repair_conversion_images(self, derived):
        from app.config import DATA
        if derived.raw_name!=derived.sha256+'.docx':
            raise ValueError('Unexpected derived raw identity')
        return self.repair_docx_images(derived,(DATA/'raw'/derived.raw_name).read_bytes())

    def repair_docx_images(self, original, content):
        """Add only newly parsed image chunks; never replace any prior evidence."""
        from app.ingest import parse
        from app.source_scope import eligibility
        from app.file_formats import office_package_suffix
        if office_package_suffix(content,'.docx')!='.docx':
            raise ValueError('Image repair requires native DOCX')
        doc=self.session.scalar(self.select(self.Document).where(self.Document.id==original.id)
            .with_for_update().execution_options(populate_existing=True))
        self.review_guard(doc)
        if (doc is None or doc.mime!='.docx' or doc.visibility!='public'
                or hashlib.sha256(content).hexdigest()!=doc.sha256):
            raise ValueError('Image repair source mismatch')
        def ancestors():
            metadata={r.id:dict(r._mapping) for r in self.session.execute(self.select(
                self.Document.id,self.Document.parent_id,self.Document.visibility,self.Document.status))}
            metadata[doc.id]={**metadata[doc.id],'status':'pending_review'}
            if not eligibility(doc.id,metadata)['eligible']:
                raise ValueError('Image repair ancestor not public/allowed')
        ancestors()
        if self.is_usable(doc):return doc
        if doc.status!='partial_parse':
            raise ValueError('Image repair requires partial unreviewed document')
        existing=list(self.session.scalars(self.select(self.Chunk).where(self.Chunk.document_id==doc.id)
            .execution_options(populate_existing=True)))
        if not existing:raise ValueError('Image repair requires retained text chunks')
        _,_,_,blocks,warnings,_=parse(content,'.docx',doc.source_url)
        pairs={(c.location,c.text) for c in existing}
        parsed={(loc,text) for loc,text in blocks if text.strip()}
        if not pairs<=parsed:
            raise ValueError('Image repair would change existing evidence')
        added=[]
        for location,text in blocks:
            if text.strip() and (location,text) not in pairs:
                if not location.startswith('Word 图像 ') or 'OCR' not in location:
                    raise ValueError('Image repair cannot add or reinterpret body text')
                added.append(self.Chunk(id=self.uid(),document_id=doc.id,text=text,location=location))
                pairs.add((location,text))
        # Warnings have no ownership column: prefixes cannot prove that a note
        # belongs to the parser. Preserve historical diagnostics and teacher
        # notes; only a separate review may resolve remaining partial status.
        combined=list(dict.fromkeys((doc.warnings or [])+warnings))
        status='partial_parse' if any('待 OCR' in w or '截断' in w for w in combined) else 'pending_review'
        ancestors()
        if not added and combined==(doc.warnings or []) and status==doc.status:return doc
        self.session.add_all(added)
        doc.warnings=combined;doc.status=status
        self.session.add(self.Audit(id=self.uid(),action='archive_docx_image_repair',entity_id=doc.id,
            changes={'source_sha256':doc.sha256,'new_image_chunks':len(added),'retained_chunks':len(existing),
                'existing_chunks_replaced':False,'original_bytes_changed':False,'word_invoked':False,
                'embedding_requested':False,'teacher_publication_performed':False,'status':status}))
        self.session.commit()
        return doc

    def ensure_original(self, row, content):
        url = source_url(row)
        declared_suffix=Path(urlsplit(url).path).suffix.lower()
        native_suffix=None
        if declared_suffix=='.docx':
            from app.file_formats import legacy_word_package,office_package_suffix
            native_suffix=office_package_suffix(content,declared_suffix)
            if hashlib.sha256(content).hexdigest()!=row.get('sha256') or not (native_suffix in ('.docx','.xlsx') or legacy_word_package(content)):
                raise ValueError('Mislabeled Word source content mismatch')
        parent = self.parent(row)
        self.review_guard(parent)
        if row.get('parent'):
            # A declared notification must never silently become a root when
            # its public business record is missing. Validate the entire chain
            # before ingest_bytes can commit any original or searchable text.
            if parent is None:
                raise ValueError('Archive attachment parent not imported/public; checkpoint retained')
            from app.source_scope import eligibility
            metadata={r.id:dict(r._mapping) for r in self.session.execute(self.select(
                self.Document.id,self.Document.parent_id,self.Document.visibility,self.Document.status))}
            probe='archive-parent-check'
            while probe in metadata:
                probe+='-'
            metadata[probe]={'id':probe,'parent_id':parent.id,
                             'visibility':'public','status':'pending_review'}
            if not eligibility(probe,metadata)['eligible']:
                raise ValueError('Archive attachment parent chain not public/allowed; checkpoint retained')
        if row.get('document_id'):
            self.review_guard(self.session.get(self.Document, row['document_id']))
        existing = self.session.scalar(self.select(self.Document).where(
            self.Document.sha256 == row['sha256'], self.Document.source_url == url,
            self.Document.mime == declared_suffix, self.Document.visibility == 'public')
            .execution_options(populate_existing=True))
        if existing is not None:
            self.review_guard(existing)
            if declared_suffix=='.docx' and native_suffix is None:
                # Only repair an already imported failed original. Never
                # reinterpret reviewed DOCX or replace any existing chunks.
                reusable=self.find_conversion(existing) if existing.status=='converted' else None
                if (existing.status!='parse_failed' and not (reusable is not None and self.is_usable(reusable))) or self.session.scalar(self.select(self.Chunk.id).where(
                        self.Chunk.document_id==existing.id).limit(1)) is not None:
                    raise ValueError('Mislabeled Word requires failed original without chunks')
                from app.source_scope import eligibility
                metadata={r.id:dict(r._mapping) for r in self.session.execute(self.select(
                    self.Document.id,self.Document.parent_id,self.Document.visibility,self.Document.status))}
                metadata[existing.id]={**metadata[existing.id],'status':'pending_review'}
                if not eligibility(existing.id,metadata)['eligible']:
                    raise ValueError('Mislabeled Word ancestor not public/allowed')
            # ingest_bytes' duplicate path mutates checked_at and attachments.
            # Reuse any existing original without invoking that path.
            return existing
        if declared_suffix=='.docx':
            raise ValueError('Mislabeled Word requires existing public original')
        label = row.get('label') or row.get('title') or Path(urlsplit(url).path).name
        title = f'{parent.title} / {label}' if parent and label != parent.title else label
        kind = parent.kind if parent and parent.kind != 'notice' else 'policy'
        original, _ = self.ingest_bytes(self.session, content, title + '.doc', url=url,
                                       visibility='public', kind=kind,
                                       parent_id=None, embed=False)
        original.parent_id = parent.id if parent else None
        if parent:
            original.published_at = original.published_at or parent.published_at
            original.publisher = original.publisher or parent.publisher
        # Do not mutate the original SHA256, MIME or raw bytes.
        self.session.add(self.Audit(id=self.uid(), action='archive_doc_original', entity_id=original.id,
                                   changes={'archive_url': row['url'], 'source_url': url,
                                            'original_sha256': original.sha256,
                                            'parent_document_id': original.parent_id}))
        self.session.commit()
        return original

    def find_conversion(self, original):
        audits = self.session.scalars(self.select(self.Audit).where(
            self.Audit.action.in_(['local_word_conversion', 'archive_doc_conversion'])
        ).order_by(self.Audit.at.desc()))
        for audit in audits:
            change = audit.changes or {}
            if (change.get('original_id') == original.id
                    and change.get('original_sha256') == original.sha256):
                derived = self.session.get(self.Document, audit.entity_id)
                if derived and derived.mime == '.docx' and derived.source_url == original.source_url:
                    self.review_guard(derived)
                    return derived
        return None

    def ingest_conversion(self, original, content, embed=False):
        digest = hashlib.sha256(content).hexdigest()
        # Recover the interval after ingest committed but before the audit did.
        existing = self.session.scalar(self.select(self.Document).where(
            self.Document.sha256 == digest, self.Document.mime == '.docx',
            self.Document.visibility == 'public',
            (self.Document.source_url == original.source_url) | self.Document.source_url.is_(None)
        ))
        if existing:
            self.review_guard(existing)
            if existing.status == 'published' and existing.source_url != original.source_url:
                raise ValueError('Review boundary: published DOCX cannot be reassigned to a different source')
            return existing
        # Critical: ingest_bytes chooses its parser from URL suffix. Passing the
        # original .doc URL here would select the legacy parser again.
        doc, _ = self.ingest_bytes(self.session, content, original.title + '（旧Word本地转换副本）.docx',
                                  url=None, visibility='public', kind=original.kind,
                                  parent_id=None, embed=embed)
        return doc

    def record_reuse(self, original, derived, row):
        """A usable existing derivative is fully read-only, including parent links."""
        self.review_guard(original)
        self.review_guard(derived)
        self.review_guard(self.session.get(self.Document, original.parent_id) if original.parent_id else None)
        self.session.add(self.Audit(id=self.uid(), action='archive_doc_reuse', entity_id=derived.id,
                                   changes={'original_id': original.id, 'original_sha256': original.sha256,
                                            'converted_sha256': derived.sha256, 'archive_url': row['url'],
                                            'read_only_reuse': True}))
        self.session.commit()

    def record_conversion(self, original, derived, row):
        self.review_guard(original)
        self.review_guard(derived)
        parent = self.session.get(self.Document, original.parent_id) if original.parent_id else None
        self.review_guard(parent)
        usable = self.is_usable(derived)
        if derived.status == 'published':
            self.record_reuse(original, derived, row)
            return
        derived.source_url = original.source_url
        derived.parent_id = original.parent_id
        derived.published_at = original.published_at
        derived.publisher = original.publisher
        derived.title = original.title + '（旧Word本地转换副本）'
        derived.warnings = list(dict.fromkeys((derived.warnings or []) + [
            f'本文件由已安装的Microsoft Word禁宏、只读打开后本地转换；原Word文档ID={original.id}；'
            '非官网原始DOCX，须核对版式与内容；日期沿用父通知或原件记录，不代表另行确认适用年度。']))
        if usable and original.status != 'published':
            original.status = 'converted'
            original.error = '原DOC保留；可检索的本地派生DOCX文档ID=' + derived.id
        elif original.status == 'converted':
            original.status = 'parse_failed'
            original.error = '本地派生DOCX解析未完成；原DOC不可直接检索'
        if parent and parent.status != 'published':
            parent.attachments = [
                {**attachment, 'document_id': original.id, 'converted_document_id': derived.id,
                 'status': 'converted' if usable else derived.status}
                if attachment.get('url') == original.source_url else attachment
                for attachment in parent.attachments]
        self.session.add(self.Audit(id=self.uid(), action='archive_doc_conversion', entity_id=derived.id,
                                   changes={'original_id': original.id, 'original_sha256': original.sha256,
                                            'converted_sha256': derived.sha256, 'source_url': original.source_url,
                                            'archive_url': row['url'], 'status': derived.status,
                                            'searchable': usable, 'macros_disabled': True,
                                            'read_only_source': True, 'derived_copy': True}))
        self.session.commit()

    def record_failure(self, original, error):
        self.session.add(self.Audit(id=self.uid(), action='archive_doc_conversion_failed',
                                   entity_id=original.id,
                                   changes={'original_sha256': original.sha256, 'error': error}))
        self.session.commit()

    def rollback(self):
        self.session.rollback()


def save_frontier_event(frontier, event):
    frontier.execute('''INSERT INTO doc_conversions
        (url,original_sha256,state,attempts,original_document_id,converted_document_id,converted_sha256,checked_at,error)
        VALUES (?,?,?,1,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET
        original_sha256=excluded.original_sha256,state=excluded.state,
        attempts=CASE WHEN doc_conversions.original_sha256=excluded.original_sha256
            THEN doc_conversions.attempts+1 ELSE 1 END,
        original_document_id=excluded.original_document_id,converted_document_id=excluded.converted_document_id,
        converted_sha256=excluded.converted_sha256,checked_at=excluded.checked_at,error=excluded.error''',
        (event['url'], event['original_sha256'], event['state'], event['original_document_id'],
         event['converted_document_id'], event['converted_sha256'], event['checked_at'], event['error']))
    success = event['state'] in ('converted','native_parsed')
    frontier.execute('UPDATE urls SET import_state=?,import_error=?,document_id=COALESCE(?,document_id) WHERE url=?',
                     ('imported' if success else event['state'], event['error'],
                      event['converted_document_id'] if success else event['original_document_id'], event['url']))
    frontier.commit()


def run_batch(rows, store, archive_dir, output_dir, helper, limit=10, embed=False,
              converter=word_convert, persist=lambda _: None):
    events = []
    for row in rows:
        if len(events) >= limit:
            break
        if not is_archived_doc(row):
            continue
        if store.already_imported(row):
            continue
        if Path(urlsplit(source_url(row)).path).suffix.lower()=='.docx':
            from app.file_formats import CFB_MAGIC
            digest=row.get('sha256') or ''
            if len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest):
                continue
            # Only inspect the signature here. Full hash, stream and permission
            # validation occurs in convert_row before Word can be invoked.
            try:
                with (Path(archive_dir)/'blobs'/digest).open('rb') as stream:
                    signature=stream.read(8)
                    if signature!=CFB_MAGIC and not signature.startswith(b'PK\x03\x04'):continue
            except OSError:
                continue
        event = convert_row(row, store, archive_dir, output_dir, helper, embed, converter)
        persist(event)
        events.append(event)
    return events


def conversion_candidates(frontier, max_attempts=3, retry_failed=False):
    """Bound automatic retries per URL and original hash, retaining failures."""
    return [dict(row) for row in frontier.execute('''SELECT u.* FROM urls u
        LEFT JOIN doc_conversions c ON c.url=u.url WHERE u.state='fetched'
        AND NOT (COALESCE(c.state,'') IN ('converted','native_parsed') AND c.original_sha256=u.sha256)
        AND (? OR c.url IS NULL OR c.original_sha256!=u.sha256 OR c.attempts<?)
        ORDER BY CASE WHEN c.original_sha256=u.sha256 THEN 0 ELSE 1 END,
                 CASE WHEN c.original_sha256=u.sha256 THEN c.attempts ELSE 0 END,
                 u.depth,u.priority DESC,u.url''', (retry_failed, max_attempts))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--embed', action='store_true', help='Explicitly request local embedding; off by default')
    parser.add_argument('--max-attempts', type=int, default=3, help='Automatic attempts per URL and original SHA, default 3')
    parser.add_argument('--retry-failed', action='store_true', help='Explicit bounded retry of entries at the automatic attempt limit')
    args = parser.parse_args()
    if not 1 <= args.limit <= 500 or not 1 <= args.max_attempts <= 10:
        parser.error('--limit must be 1..500 and --max-attempts 1..10')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.config import DATA, ROOT
    from app.db import Session
    archive_dir = DATA / 'school-archive'
    if not (archive_dir / 'frontier.sqlite3').is_file():
        parser.error('No existing school archive frontier.sqlite3; refusing to create an empty frontier')
    with sqlite3.connect(archive_dir / 'frontier.sqlite3', timeout=30) as frontier:
        frontier.row_factory = sqlite3.Row
        frontier.execute('''CREATE TABLE IF NOT EXISTS doc_conversions (
            url TEXT PRIMARY KEY,original_sha256 TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL,
            original_document_id TEXT,converted_document_id TEXT,converted_sha256 TEXT,checked_at TEXT,error TEXT)''')
        frontier.commit()
        rows = conversion_candidates(frontier, args.max_attempts, args.retry_failed)
        exhausted = frontier.execute('''SELECT count(*) FROM urls u JOIN doc_conversions c ON c.url=u.url
            WHERE u.state='fetched' AND c.original_sha256=u.sha256 AND c.state NOT IN ('converted','native_parsed')
            AND c.attempts>=?''', (args.max_attempts,)).fetchone()[0]
        with Session() as session:
            events = run_batch(rows, BusinessStore(session), archive_dir, DATA / 'converted',
                               ROOT / 'scripts/convert_doc.ps1', args.limit, args.embed,
                               persist=lambda event: save_frontier_event(frontier, event))
    report = {'checked_at': checked_at(), 'attempts': len(events),
              'converted': sum(event['state'] == 'converted' for event in events),
              'native_parsed': sum(event['state'] == 'native_parsed' for event in events),
              'failed': sum(event['state'] not in ('converted','native_parsed') for event in events),
              'embedding_requested': args.embed, 'teacher_publication_performed': False,
              'automatic_attempt_limit': args.max_attempts, 'explicit_retry_requested': args.retry_failed,
              'previously_exhausted_url_records': exhausted,
              'events': events}
    (ROOT / 'reports/archive-doc-conversion.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    # Failures were recorded and all selected rows were attempted. Expose the
    # nonzero status to callers instead of reporting a misleading clean batch.
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.config import DATA
    from scripts.sync_school_archive import PipelineLock
    with PipelineLock(DATA / 'school-archive/business-import.lock'):
        raise SystemExit(main())
