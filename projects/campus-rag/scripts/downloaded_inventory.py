"""Read-only processing and recovery manifest; download is not searchability."""
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import DATA,ROOT
from app.db import Session,Document,Chunk,timestamp
from sqlalchemy import select,func


def classification(row, doc):
    state=row['import_state'] or 'pending'
    if state=='imported':
        if not doc:return 'broken_document_link'
        return 'searchable_unreviewed' if doc['status']=='pending_review' else 'published' if doc['status']=='published' else doc['status']
    if state=='not_searchable':
        error=row['import_error'] or ''
        if 'navigation' in error:return 'archive_only_navigation_or_shell'
        if 'decorative' in error:return 'archive_only_nonbody_image'
        return 'unsupported_or_unresolved_format'
    return state


def main():
    with Session() as s:
        docs={d.id:{'sha256':d.sha256,'status':d.status,'mime':d.mime,'visibility':d.visibility,
                     'warnings':d.warnings,'error':d.error,'source_url':d.source_url,'parent_id':d.parent_id}
              for d in s.scalars(select(Document))}
        chunks=s.scalar(select(func.count()).select_from(Chunk))
        embedded=s.scalar(select(func.count()).select_from(Chunk).where(Chunk.vector.is_not(None)))
        by_format=Counter((d['mime'],d['visibility'],d['status']) for d in docs.values())
    path=DATA/'school-archive/frontier.sqlite3'
    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=30) as a:
        a.row_factory=sqlite3.Row
        rows=[dict(r) for r in a.execute("SELECT url,final_url,sha256,mime,import_state,import_error,document_id,parent FROM urls WHERE state='fetched'")]
        relation_counts=dict(a.execute('SELECT relation,count(*) FROM edges GROUP BY relation'))
        histories=[dict(r) for r in a.execute('SELECT url,sha256,final_url,mime FROM fetch_history')]
    sha_counts=Counter(r['sha256'] for r in rows)
    counts=Counter(); formats=Counter(); recovery=Counter()
    folder=DATA/'processing-inventories';folder.mkdir(exist_ok=True)
    checked=timestamp();name=checked.replace(':','').replace('+','_')
    manifest=folder/(name+'.jsonl');failures=folder/(name+'.recovery.jsonl')
    blobs=DATA/'school-archive/blobs'
    retained={p.name:p for p in blobs.iterdir() if p.is_file()}
    current_by_sha={};history_by_sha={};business_by_sha={}
    for r in rows:current_by_sha.setdefault(r['sha256'],[]).append(r)
    for r in histories:history_by_sha.setdefault(r['sha256'],[]).append(r)
    for did,d in docs.items():business_by_sha.setdefault(d['sha256'],[]).append({'id':did,**d})
    with manifest.open('w',encoding='utf-8') as out,failures.open('w',encoding='utf-8') as failed:
        for row in rows:
            doc=docs.get(row['document_id']);category=classification(row,doc)
            suffix='.html' if 'html' in (row['mime'] or '').lower() else Path(urlsplit(row['final_url'] or row['url']).path).suffix.lower() or 'no_suffix'
            counts[category]+=1;formats[(suffix,category)]+=1
            item={**row,'processing_category':category,'format':suffix,'same_content_url_count':sha_counts[row['sha256']],
                  'business':doc,'original_retention_policy':'keep_original',
                  'original_presence':'present' if row['sha256'] in retained else 'missing',
                  'original_hash_rechecked_this_inventory':False}
            line=json.dumps(item,ensure_ascii=False)+'\n';out.write(line)
            if category not in ('searchable_unreviewed','published','archive_only_navigation_or_shell','archive_only_nonbody_image'):
                failed.write(line);recovery[category]+=1
    blob_manifest=folder/(name+'.blobs.jsonl');blob_recovery=folder/(name+'.blobs.recovery.jsonl')
    blob_counts=Counter()
    with blob_manifest.open('w',encoding='utf-8') as out,blob_recovery.open('w',encoding='utf-8') as failed:
        for sha,path in sorted(retained.items()):
            linked=current_by_sha.get(sha,[])
            states=sorted({classification(r,docs.get(r['document_id'])) for r in linked})
            category=('current_frontier' if linked else 'historical_or_unlinked') if re.fullmatch('[0-9a-f]{64}',sha) else 'unexpected_blob_filename'
            blob_counts[category]+=1
            item={'sha256':sha,'path':str(path),'original_presence':'present','hash_rechecked':False,
                  'processing_category':category,'current_source_states':states,
                  'current_source_urls':[r['url'] for r in linked],
                  'historical_sources':history_by_sha.get(sha,[]),'business_documents':business_by_sha.get(sha,[])}
            line=json.dumps(item,ensure_ascii=False)+'\n';out.write(line)
            if not linked or any(v not in ('searchable_unreviewed','published','archive_only_navigation_or_shell','archive_only_nonbody_image') for v in states):
                failed.write(line)
    report={'checked_at':checked,'fetched_url_records':len(rows),'unique_content_hashes':len(sha_counts),
            'duplicate_content_url_records':len(rows)-len(sha_counts),'processing_categories':dict(counts),
            'formats_and_processing':[{'format':k[0],'state':k[1],'count':v} for k,v in sorted(formats.items())],
            'business_documents':len(docs),'business_chunks':chunks,'embedded_chunks':embedded,
            'documents_by_format_visibility_status':[{'format':k[0],'visibility':k[1],'status':k[2],'count':v} for k,v in sorted(by_format.items())],
            'archive_link_relations':relation_counts,'manifest':str(manifest),'recoverable_manifest':str(failures),
            'recovery_categories':dict(recovery),'full_school_coverage_proven':False,'teacher_publication_performed':False,
            'retained_blob_files':len(retained),'blob_categories':dict(blob_counts),
            'blob_manifest':str(blob_manifest),'blob_recovery_manifest':str(blob_recovery),
            'current_sha_missing_blob':sum(sha not in retained for sha in sha_counts),
            'limits':['Two stores are read at different instants, not a cross-database atomic snapshot.',
                      'One SHA can have different source URLs; aliases retained in archive and business provenance.',
                      'Parseable does not prove every embedded object or OCR character was recovered.',
                      'Navigation and decorative images are archived-only, not answerable facts.',
                      'Blob presence is a filesystem observation, not SHA verification or content completeness.',
                      'Historical/unlinked originals have a separate recovery manifest and are not counted as searchable.']}
    (ROOT/'reports/downloaded-processing-inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('formats_and_processing','documents_by_format_visibility_status')},ensure_ascii=False))


if __name__=='__main__':main()
