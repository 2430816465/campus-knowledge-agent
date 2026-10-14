"""Validate isolated page recovery for later review, with no database or I/O.

This is deliberately not an apply interface. Existing failed/partial documents
must not be marked imported simply because an offline extractor produced text.
"""
import copy
import hashlib
import json
import math
import re
from urllib.parse import urlsplit


def stage_page(document, evidence):
    """Bind one immutable evidence page to one current source document."""
    required = ('id', 'sha256', 'source_url', 'parent_id', 'version', 'checked_at', 'status', 'visibility')
    if any(key not in document for key in required):
        raise ValueError('Incomplete document precondition snapshot')
    if document['status'] not in ('parse_failed', 'partial_parse'):
        raise ValueError('Recovery must not alter reviewed or unrelated document states')
    if document['visibility'] not in ('public', 'private'):
        raise ValueError('Unknown access scope')
    sha = document['sha256']
    if not isinstance(sha, str) or not re.fullmatch('[0-9a-f]{64}', sha) or sha != evidence.get('original_sha256'):
        raise ValueError('Original identity mismatch')
    parsed = urlsplit(document['source_url'])
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Invalid public source reference')
    page = evidence.get('original_page')
    if type(page) is not int or page < 1:
        raise ValueError('Original page number required')
    if type(document['version']) is not int or document['version'] < 1:
        raise ValueError('Invalid document version')
    has_boxes = 'boxes' in evidence
    has_text = 'text_layer' in evidence
    if has_boxes == has_text:
        raise ValueError('Exactly one extraction mode required')
    blocks = []
    if has_boxes:
        if evidence.get('coordinate_system') != 'render pixels, origin top-left':
            raise ValueError('OCR coordinate frame required')
        if not isinstance(evidence.get('render_scale'), (int, float)) or not math.isfinite(evidence['render_scale']) or evidence['render_scale'] <= 0:
            raise ValueError('Invalid OCR render scale')
        for index, box in enumerate(evidence['boxes'], 1):
            points, confidence = box.get('box'), box.get('confidence')
            if not isinstance(points, list) or len(points) != 4 or any(not isinstance(p, list) or len(p) != 2 or any(type(x) not in (int, float) or not math.isfinite(x) for x in p) for p in points):
                raise ValueError('OCR quadrilateral required')
            if type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
                raise ValueError('Invalid OCR confidence')
            if not isinstance(box.get('text'), str) or not box['text'].strip():
                raise ValueError('Empty OCR box')
            blocks.append({**copy.deepcopy(box), 'location': f'第 {page} 页 / OCR 框 {index}'})
    else:
        if evidence.get('coordinate_system') != 'PDF points, origin bottom-left' or not isinstance(evidence['text_layer'], str):
            raise ValueError('Text-layer coordinate frame required')
        chars = evidence.get('characters')
        if not isinstance(chars, list) or (evidence['text_layer'].strip() and not chars):
            raise ValueError('Character geometry required')
        for index, char in enumerate(chars):
            box = char.get('box')
            if char.get('index') != index or not isinstance(char.get('text'), str) or not isinstance(box, list) or len(box) != 4 or any(type(x) not in (int, float) or not math.isfinite(x) for x in box) or box[0] > box[2] or box[1] > box[3]:
                raise ValueError('Invalid ordered character geometry')
        # A whole table page is not a verified semantic chunk. Keep geometry
        # for later layout review instead of making cross-cell facts searchable.
    raw = copy.deepcopy(evidence)
    canonical = json.dumps(raw, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    content_key = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    binding = json.dumps({key: document[key] for key in required}, sort_keys=True, separators=(',', ':'))
    return {'schema_version': 1, 'content_key': content_key,
            'staging_key': hashlib.sha256((binding + content_key).encode('utf-8')).hexdigest(),
            'expected_document': copy.deepcopy({key: document[key] for key in required}),
            'original_page': page, 'evidence': raw, 'independent_ocr_blocks': blocks,
            'layout_review_required': has_text, 'review_required': True,
            'production_applicable': False, 'publication_requested': False,
            'warnings': ['Staging does not change parse, review or access status.',
                         'Revalidate source, SHA, version and state under business-import lock before any future apply.',
                         'Do not infer cross-box dates or table relationships.']}
