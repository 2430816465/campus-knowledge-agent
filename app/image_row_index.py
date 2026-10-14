"""Small derived index of visually verified image cells, never teacher approval.

Records must be bound to an exact original SHA and same-row cell rectangles.
This does not infer table relations from OCR order or automatically build rows.
"""
import json
import re
from pathlib import Path
from difflib import SequenceMatcher

from .source_scope import eligibility
from .table_index import live_metadata

METHOD = 'visually_verified_image_cells'


def cache_path():
    from .config import DATA
    return DATA / 'image-row-index' / 'verified.json'


def records(path=None):
    path = Path(path or cache_path())
    if not path.exists():
        return []
    if path.stat().st_size > 2_000_000:
        raise ValueError('Image row index exceeds read budget')
    rows = json.loads(path.read_text('utf-8'))
    if not isinstance(rows, list) or len(rows) > 1000:
        raise ValueError('Invalid image row inventory')
    for row in rows:
        if (row.get('verification') != 'original_visual_same_row'
                or not re.fullmatch('[0-9a-f]{64}', row['sha256'])
                or not isinstance(row['row'], int) or row['row'] < 1
                or not all(type(row[k]) is int and 0 < row[k] <= 25000 for k in ('width','height'))
                or not 2 <= len(row['cells']) <= 12):
            raise ValueError('Unverified image row')
        for cell in row['cells']:
            if not cell['header'] or not cell['text'] or len(cell['text']) > 300:
                raise ValueError('Empty or overlong image cell')
            for key in ('bbox', 'header_bbox'):
                x,y,right,bottom = cell[key]
                if not (all(type(v) is int for v in cell[key])
                        and 0 <= x < right <= row['width']
                        and 0 <= y < bottom <= row['height']):
                    raise ValueError('Invalid image cell coordinates')
            if (cell['bbox'][::2] != cell['header_bbox'][::2]
                    or cell['header_bbox'][3] > cell['bbox'][1]):
                raise ValueError('Header is not aligned above its cell')
        boxes = [c['bbox'] for c in row['cells']]
        if max(b[1] for b in boxes) >= min(b[3] for b in boxes):
            raise ValueError('Cells are not in the same row')
        if any(a[2] > b[0] for a,b in zip(boxes, boxes[1:])):
            raise ValueError('Image columns overlap or are out of order')
    if len({(r['sha256'], r['source_url'], r['row']) for r in rows}) != len(rows):
        raise ValueError('Duplicate image row identity')
    return rows


def row_text(row):
    return '\n'.join(c['header'] + '：' + c['text'] for c in row['cells'])


def retrieve_image_rows(session, question, lexical, document_ids=None, limit=6):
    if session is None:
        return []
    from .campus_qa import requested_years
    metadata = live_metadata(session)
    topics = {r['document_id'] for r in lexical}
    years = requested_years(question)
    result = []
    for row in records():
        # First column is a visually checked exact entity, never fuzzy inferred.
        if row['cells'][0]['text'] not in question or not any(
                c['header'] in question for c in row['cells'][1:]):
            continue
        for identity, doc in metadata.items():
            if (not doc or doc['sha256'] != row['sha256']
                    or doc['source_url'] != row['source_url']
                    or doc['kind'] not in ('knowledge','policy','notice')
                    or (document_ids is not None and identity not in document_ids)):
                continue
            # A short OCR label can be filtered out of lexical candidates.
            # Admit it only when the user literally names a substantial span
            # of its notice title; the entity and field still must match.
            title = re.sub(r'\s+', '', doc['title'].split(' / ')[0])
            if identity not in topics and max((b.size for b in SequenceMatcher(
                    None, question, title, autojunk=False).get_matching_blocks()), default=0) < 8:
                continue
            scope = eligibility(identity, metadata)
            if not scope['eligible'] or (years and not years.intersection(scope['effective_years'])):
                continue
            result.append({**doc, 'document_id':identity,
                'id':f"image-row:{row['sha256']}:{row['row']}:{identity}",
                'url':doc['source_url'], 'text':row_text(row), 'context':'',
                'location':f"图片原图 / 第{row['row']}数据行（逐列核验；原图像素坐标）",
                'image_row':row, 'quote_method':METHOD, 'score':1.0,'identity_score':1.0,
                'warnings':list(doc['warnings'] or [])+[
                    '图片单元格及同行关系已对照原图核验；按列展示，非连续原文句子，未经教师审核。'],
                'supporting_chunks':[], 'context_chunks':[]})
    return result[:limit]


def revalidate_image_row(row, metadata):
    doc = metadata.get(row['document_id'])
    if not doc or not eligibility(row['document_id'], metadata)['eligible']:
        return False
    if doc.get('kind') not in ('knowledge','policy','notice'):
        return False
    if any(doc.get(k) != row.get(r) for k,r in [('sha256','sha256'),('title','title'),
            ('source_url','url'),('published_at','published_at'),('version','version')]):
        return False
    stored = row.get('image_row')
    return bool(stored in records() and row.get('text') == row_text(stored)
        and row.get('quote') == row_text(stored)
        and row['id'] == f"image-row:{stored['sha256']}:{stored['row']}:{row['document_id']}"
        and stored['source_url'] == row['url'] and stored['sha256'] == row['sha256'])


def direct_contact(question, evidence):
    """Copy one verified contact field only; never resolve ambiguity or policy."""
    if re.search(r'为什么|能否|是否|如果|假如|不是|不要|比较|区别|全部|所有|还是|报名时间|截止时间|提交时间|条件|材料|流程|联系人|地址|哪天', question):
        return None
    if not re.search(r'联系电话(?:是|为)?(?:什么|多少|哪个|[？?])', question):
        return None
    rows = [r for r in evidence if r.get('quote_method') == METHOD]
    if len(rows) != 1:
        return None
    row = rows[0]
    fields = row['image_row']['cells']
    values = [c['text'] for c in fields if c['header'] == '联系电话']
    if len(values) != 1 or not re.fullmatch(r'[0-9+()（） -]{6,30}', values[0]):
        return None
    return row, fields[0]['text'] + '，联系电话：' + values[0] + '。'
