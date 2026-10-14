"""Read-only image OCR coverage; missing geometry is a gap, not OCR failure.

No original decoding, inference, embedding, archive update or business writes.
"""
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg'}
QUAD = re.compile(r' xy=(\d+,\d+;\d+,\d+;\d+,\d+;\d+,\d+)$')


def image_url(row):
    if 'html' in (row['mime'] or '').lower():
        return False
    return Path(urlsplit(row['final_url'] or row['url']).path).suffix.lower() in IMAGE_SUFFIXES


def image_health(document, locations):
    if document is None:
        return {'gaps': ['not_linked_to_business_document'], 'ocr_chunks': 0,
                'coordinate_chunks': 0, 'coordinate_missing_chunks': 0}
    ocr = [loc for loc in locations if 'OCR' in (loc or '')]
    geometry = sum(bool(QUAD.search(loc)) for loc in ocr)
    gaps = []
    if not ocr:
        gaps.append('no_ocr_text_chunks')
    if len(ocr) > geometry:
        gaps.append('legacy_or_missing_box_coordinates')
    if document['status'] not in ('pending_review', 'published'):
        gaps.append('document_status_' + document['status'])
    if document['visibility'] != 'public':
        gaps.append('not_public')
    if not document['parent_id']:
        gaps.append('missing_notice_parent_link')
    if any(re.search(r'待\s*OCR|截断|未识别到文字', w) for w in document['warnings'] or []):
        gaps.append('explicit_ocr_recovery_warning')
    return {'gaps': gaps, 'ocr_chunks': len(ocr), 'coordinate_chunks': geometry,
            'coordinate_missing_chunks': len(ocr) - geometry}


def main():
    from sqlalchemy import select
    from app.config import DATA
    from app.db import Session, Document, Chunk, timestamp
    from scripts.downloaded_inventory import classification
    from scripts.sync_school_archive import atomic_json
    with sqlite3.connect((DATA/'school-archive/frontier.sqlite3').as_uri()+'?mode=ro', uri=True, timeout=30) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(r) for r in db.execute("SELECT url,final_url,mime,sha256,document_id,import_state,import_error FROM urls WHERE state='fetched'") if image_url(r)]
    ids = sorted({r['document_id'] for r in rows if r['document_id']})
    documents, locations = {}, defaultdict(list)
    # Bound each query and avoid fetching chunk text/vectors or ORM whole documents.
    with Session() as session:
        for start in range(0, len(ids), 200):
            batch = ids[start:start+200]
            for d in session.execute(select(Document.id, Document.status, Document.visibility,
                    Document.parent_id, Document.warnings).where(Document.id.in_(batch))):
                documents[d.id] = dict(d._mapping)
            for c in session.execute(select(Chunk.document_id, Chunk.location).where(Chunk.document_id.in_(batch))):
                locations[c.document_id].append(c.location)
    checked = timestamp()
    folder = DATA/'processing-inventories'
    folder.mkdir(exist_ok=True)
    name = checked.replace(':', '').replace('+', '_')+'.images'
    manifest, recovery = folder/(name+'.jsonl'), folder/(name+'.recovery.jsonl')
    categories, gaps = Counter(), Counter()
    unique = {}
    excluded = {'archive_only_nonbody_image'}
    with manifest.open('x', encoding='utf-8') as output, recovery.open('x', encoding='utf-8') as failed:
        for row in rows:
            doc = documents.get(row['document_id'])
            category = classification(row, doc)
            health = image_health(doc, locations.get(row['document_id'], []))
            # Deliberately archived decorative images need no OCR recovery.
            if category in excluded:
                health['gaps'] = []
            if not (DATA/'school-archive/blobs'/row['sha256']).is_file():
                health['gaps'].append('archive_original_missing')
            item = {**row, 'processing_category': category, **health}
            categories[category] += 1
            gaps.update(health['gaps'])
            if doc:
                unique[row['document_id']] = health
            line = json.dumps(item, ensure_ascii=False)+'\n'
            output.write(line)
            if health['gaps']:
                failed.write(line)
    report = {'checked_at': checked, 'image_url_records': len(rows),
        'unique_image_documents': len(unique), 'url_processing_categories': dict(categories),
        'gap_url_counts': dict(gaps),
        'unique_document_ocr_chunks': sum(h['ocr_chunks'] for h in unique.values()),
        'unique_document_coordinate_chunks': sum(h['coordinate_chunks'] for h in unique.values()),
        'unique_document_coordinate_missing_chunks': sum(h['coordinate_missing_chunks'] for h in unique.values()),
        'manifest': str(manifest), 'recovery_manifest': str(recovery),
        'business_writes': False, 'archive_writes': False, 'model_or_ocr_calls': 0,
        'limits': ['URL and business snapshots are not atomic; active downloads/imports may change counts.',
                  'Coordinate suffix presence is only a coverage check, not geometry/content validation.',
                  'Missing coordinates do not mean text is missing; existing citations were not rewritten.',
                  'This audit covers standalone archived image URLs, not all embedded Word/PDF images.',
                  'Original presence is checked; bytes/hash and OCR character accuracy not reverified.']}
    atomic_json(ROOT/'reports/image-ocr-inventory.json', report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
