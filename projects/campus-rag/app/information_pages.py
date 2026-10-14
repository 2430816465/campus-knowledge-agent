"""PostgreSQL directory pagination after exact-content grouping in SQL.

Only current-page metadata crosses the database boundary. Bodies, vectors and
permission decisions are never cached. SQLite keeps the reference algorithm.
"""
from collections import defaultdict
from sqlalchemy import text

FIELDS = ('id', 'title', 'source_url', 'publisher', 'published_at', 'status', 'kind', 'version')

# Length-prefixed UTF-8 text, sorted by location/text, preserves the reference
# algorithm's chunk boundaries. Hash only same-title/date candidates, not the
# entire corpus. SHA-256 is built into PostgreSQL; no extension/schema changes.
CTE = """
WITH filtered AS MATERIALIZED (
 SELECT id,title,source_url,publisher,published_at,status,kind,version,sha256,parent_id
 FROM documents
 WHERE visibility='public' AND status IN ('pending_review','published')
   AND (:q = '' OR title LIKE :pattern ESCAPE '/')
   AND (:year = '' OR published_at LIKE :year_pattern)
   AND (NOT :verified OR status='published')
), roots AS MATERIALIZED (
 SELECT d.* FROM filtered d
 WHERE NOT EXISTS (SELECT 1 FROM filtered p WHERE p.id=d.parent_id
                    AND p.id<>d.id AND coalesce(p.parent_id,'')='')
), duplicates AS (
 SELECT title,coalesce(published_at,'') AS day FROM roots
 GROUP BY title,coalesce(published_at,'') HAVING count(*)>1
), digests AS (
 SELECT c.document_id,
 encode(sha256(convert_to(string_agg(octet_length(convert_to(c.text,'UTF8'))::text
         || ':' || c.text, '' ORDER BY c.location COLLATE "C",c.text COLLATE "C"),'UTF8')),'hex') AS digest
 FROM chunks c JOIN roots r ON r.id=c.document_id
 JOIN duplicates d ON r.title=d.title AND coalesce(r.published_at,'')=d.day
 GROUP BY c.document_id
), keyed AS MATERIALIZED (
 SELECT r.*,CASE WHEN h.digest IS NOT NULL THEN 'text' ELSE 'raw' END AS body_kind,
        coalesce(h.digest,nullif(r.sha256,''),r.id) AS body_key
 FROM roots r LEFT JOIN digests h ON h.document_id=r.id
), ranked AS MATERIALIZED (
 SELECT *,first_value(id) OVER (PARTITION BY title,coalesce(published_at,''),body_kind,body_key
           ORDER BY (status='published') DESC,id COLLATE "C") AS representative
 FROM keyed
), stats AS (
 SELECT (SELECT count(*) FROM filtered) AS matched_documents,
        (SELECT count(*) FROM roots) AS roots,
        (SELECT count(*) FROM ranked WHERE id=representative) AS total
), page AS MATERIALIZED (
 SELECT * FROM ranked WHERE id=representative
 ORDER BY coalesce(published_at,'') COLLATE "C" DESC,id COLLATE "C"
 LIMIT :limit OFFSET :offset
), members AS (
 SELECT r.* FROM ranked r JOIN page p ON p.id=r.representative
), page_rows AS (
 SELECT m.representative AS page_id,false AS child,m.id,m.title,m.source_url,m.publisher,
        m.published_at,m.status,m.kind,m.version,m.sha256
 FROM members m
 UNION ALL
 SELECT m.representative,true,c.id,c.title,c.source_url,c.publisher,c.published_at,
        c.status,c.kind,c.version,c.sha256
 FROM members m JOIN filtered c ON c.parent_id=m.id
 WHERE coalesce(m.parent_id,'')='' AND c.id<>m.id
)
SELECT s.*,r.* FROM stats s LEFT JOIN page_rows r ON true
"""


def postgres_information_page(session, q='', year=None, verified=False, offset=0, limit=10):
    pattern = '%' + q.replace('/', '//').replace('%', '/%').replace('_', '/_') + '%'
    rows = session.execute(text(CTE), {'q': q, 'pattern': pattern, 'year':str(year or ''),
        'year_pattern': str(year)+'-%', 'verified': verified, 'offset':offset, 'limit':limit}).mappings().all()
    stats = rows[0]
    groups, children = defaultdict(list), defaultdict(list)
    for row in rows:
        if row['id'] is None:
            continue
        target = children if row['child'] else groups
        target[row['page_id']].append(dict(row))
    items = []
    for representative, sources in groups.items():
        sources.sort(key=lambda d:(d['status']!='published',d['id']))
        item = {k:sources[0][k] for k in FIELDS}
        item['sources'] = [{k:d[k] for k in FIELDS} for d in sources]
        related_groups = defaultdict(list)
        for child in children[representative]:
            related_groups[(child['title'],child['published_at'] or '',child['sha256'] or child['id'])].append(child)
        item['related'] = []
        for group in related_groups.values():
            group.sort(key=lambda d:(d['status']!='published',d['id']))
            related = {k:group[0][k] for k in FIELDS}
            related['sources'] = [{k:d[k] for k in FIELDS} for d in group]
            item['related'].append(related)
        item['related'].sort(key=lambda d:d['id'])
        items.append(item)
    items.sort(key=lambda d:d['id'])
    items.sort(key=lambda d:d['published_at'] or '',reverse=True)
    return {'total':stats['total'], 'items':items, 'matched_documents':stats['matched_documents'],
        'merged_duplicates':stats['roots']-stats['total'],
        'nested_documents':stats['matched_documents']-stats['roots'],
        'order':'published_at_desc_unknown_last'}
