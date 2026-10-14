"""Read-only archive diagnostics; never changes review or import states."""
import hashlib
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup

ARTICLE_SELECTOR = '.wp_articlecontent,.Article_Content,.article-content'
FILE_SUFFIXES = {'.pdf','.doc','.docx','.xls','.xlsx','.png','.jpg','.jpeg','.webp','.txt','.csv'}


def body_resources(body, page_url):
    """Literal official body links only; no JS, viewer inference, HTTP or DNS."""
    found = set()
    for selector, attribute in [('a[href]','href'),('[pdfsrc]','pdfsrc'),('object[data]','data'),
                                 ('embed[src]','src'),('iframe[src]','src'),('img[src]','src')]:
        for node in body.select(selector):
            raw = node.get(attribute, '')
            if not isinstance(raw, str) or not raw.strip():
                continue
            try:
                parsed = urlsplit(urljoin(page_url, raw.strip()))
                host = (parsed.hostname or '').lower()
                if (parsed.scheme not in ('http','https') or parsed.username or parsed.password
                        or not (host == 'njxzc.edu.cn' or host.endswith('.njxzc.edu.cn'))
                        or parsed.port not in (None,80,443)
                        or Path(parsed.path).suffix.lower() not in FILE_SUFFIXES):
                    continue
                found.add(urlunsplit((parsed.scheme,parsed.netloc,parsed.path,parsed.query,'')))
            except ValueError:
                continue
    return sorted(found)


def audit_failures(frontier, blob_root, *, limit=100, max_blob_bytes=20*1024*1024):
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1 <= limit <= 5000:
        raise ValueError('Finite limit must be between 1 and 5000.')
    frontier, blob_root = Path(frontier).resolve(), Path(blob_root).resolve()
    counts, suffixes, resources = Counter(), Counter(), Counter()
    samples, sample_counts = [], Counter()
    # mode=ro and query_only, no ORM initialization, queue recovery or lock probe.
    with sqlite3.connect(frontier.as_uri()+'?mode=ro',uri=True,timeout=10) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        total = connection.execute("SELECT count(*) FROM urls WHERE import_state='parse_failed'").fetchone()[0]
        rows = connection.execute("SELECT url,final_url,mime,sha256,document_id FROM urls WHERE import_state='parse_failed' ORDER BY url LIMIT ?",(limit,)).fetchall()
        known = {}
        for row in connection.execute('SELECT url,final_url,state,import_state,document_id FROM urls'):
            for key in (row['url'],row['final_url']):
                if key:
                    known.setdefault(key,[]).append(dict(row))
        for row in rows:
            url = row['final_url'] or row['url']
            suffix = Path(urlsplit(url).path).suffix.lower() or '(none)'
            suffixes[suffix] += 1
            identity = row['sha256'] or ''
            category, child_states = 'non_html_requires_format_inspection', Counter()
            if not re.fullmatch(r'[0-9a-f]{64}',identity):
                category = 'invalid_blob_identity'
            else:
                path = blob_root / identity
                if path.is_symlink() or not path.is_file() or path.resolve().parent != blob_root:
                    category = 'missing_or_unsafe_blob'
                elif path.stat().st_size > max_blob_bytes:
                    category = 'blob_exceeds_audit_budget'
                elif 'html' in (row['mime'] or '').lower():
                    content = path.read_bytes()
                    if hashlib.sha256(content).hexdigest() != identity:
                        category = 'blob_hash_mismatch'
                    else:
                        soup = BeautifulSoup(content,'html.parser')
                        body = soup.select_one(ARTICLE_SELECTOR)
                        if body is None:
                            category = 'html_no_article_container'
                        else:
                            for node in body.select('script,style,nav,footer'):
                                node.decompose()
                            links = body_resources(body,url)
                            length = len(body.get_text(' ',strip=True))
                            if length >= 20:
                                category = 'html_substantial_text_requires_parser_review'
                            elif links:
                                category = 'html_source_shell_with_literal_resources'
                                for link in links:
                                    candidates = known.get(link,[])
                                    if not candidates:
                                        child_states['untracked_literal_resource'] += 1
                                    elif any(x['import_state']=='imported' and x['document_id'] for x in candidates):
                                        child_states['archive_record_imported'] += 1
                                    else:
                                        states = {(x['import_state'] or 'pending_import') if x['state']=='fetched' else x['state'] for x in candidates}
                                        child_states['/'.join(sorted(states))] += 1
                            else:
                                category = 'html_empty_without_supported_literal_resource'
            counts[category] += 1
            resources.update(child_states)
            if len(samples) < 24 and sample_counts[category] < 3:
                sample_counts[category] += 1
                samples.append({'document_id':row['document_id'],'sha256':identity,'suffix':suffix,
                                'category':category,'archive_resource_states':dict(child_states)})
    return {'checked_at':datetime.now(timezone.utc).isoformat(),'read_only_archive':True,
            'parse_failed_records_at_snapshot':total,'audited':len(rows),'limit':limit,
            'remaining_not_audited':max(0,total-len(rows)),'categories':dict(counts),
            'audited_suffixes':dict(suffixes),'literal_resource_states':dict(resources),'samples':samples,
            'review_states_modified':False,'http_or_ocr_or_embedding_requests':0,
            'scope_note':'Source shells have no own answer text. Imported child URL state is not proof of business ancestry, teacher approval or current applicability. No failures relabelled or retried.'}
