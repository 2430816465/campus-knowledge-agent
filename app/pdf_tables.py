"""Bounded PDF grid evidence with independent per-cell text verification.

No OCR, database writes, column-role guesses, or concatenated quote creation.
"""
from hashlib import sha256
from io import BytesIO
import math
import re


def compact(value):
    return re.sub(r'\s+', '', value)


def verify_cell(text, independent_text):
    # Equality, not a page-wide bag of words or an approximate fuzzy match.
    return bool(compact(text)) and compact(text) == compact(independent_text)


def extract_grids(payload, expected_sha256, pages, *, max_cells=5000):
    if not isinstance(payload,bytes) or len(payload)>25*1024*1024:
        raise ValueError('PDF byte budget exceeded')
    if sha256(payload).hexdigest()!=expected_sha256:
        raise ValueError('Original SHA mismatch')
    if (not isinstance(pages,(list,tuple)) or not 1<=len(pages)<=20
            or any(type(p) is not int or p<1 for p in pages) or len(set(pages))!=len(pages)):
        raise ValueError('Require 1..20 distinct one-based pages')
    if type(max_cells) is not int or not 1<=max_cells<=10000:
        raise ValueError('Cell budget must be 1..10000')
    import pdfplumber
    import pypdfium2
    result={'schema':1,'sha256':expected_sha256,'pages_requested':list(pages),
            'tables':[],'unsupported_pages':[],'cell_slots':0,'nonempty_cells':0,'verified_cells':0,
            'verification':'pdfplumber grid text equals PDFium text inside same cell bounds; whitespace only',
            'teacher_reviewed':False,'semantic_correctness_proven':False}
    with pdfplumber.open(BytesIO(payload)) as source:
        if len(source.pages)>300 or max(pages)>len(source.pages):
            raise ValueError('PDF page budget or range exceeded')
        pdf=pypdfium2.PdfDocument(payload)
        try:
            for number in pages:
                page=source.pages[number-1].dedupe_chars(extra_attrs=())
                original=pdf[number-1]
                try:
                    width,height=original.get_size()
                    media=tuple(page.mediabox)
                    crop=tuple(page.cropbox) if page.cropbox else media
                    if (page.rotation or original.get_rotation() or crop!=media or media[:2]!=(0,0)
                            or abs(page.width-width)>.1 or abs(page.height-height)>.1):
                        result['unsupported_pages'].append({'page':number,'reason':'rotated_or_offset_coordinate_system'})
                        continue
                    tables=page.find_tables()
                    if len(tables)>20:raise ValueError('Table budget exceeded')
                    textpage=original.get_textpage()
                    try:
                        for table_index,table in enumerate(tables,1):
                            matrix=table.extract()
                            grid={'page':number,'table':table_index,'bbox':list(table.bbox),'rows':[]}
                            for row_index,row in enumerate(table.rows,1):
                                cells=[]
                                for column,box in enumerate(row.cells,1):
                                    result['cell_slots']+=1
                                    if result['cell_slots']>max_cells:raise ValueError('Cell budget exceeded')
                                    if box is None:
                                        cells.append({'column':column,'text':None,'bbox':None,'verified':False,'status':'missing_or_merged_cell'})
                                        continue
                                    value=matrix[row_index-1][column-1] or ''
                                    x0,top,x1,bottom=box
                                    if (not all(math.isfinite(v) for v in box) or not (0<=x0<x1<=width+.1 and 0<=top<bottom<=height+.1)):
                                        raise ValueError('Invalid table cell bounds')
                                    literal=textpage.get_text_bounded(x0,height-bottom,x1,height-top)
                                    verified=verify_cell(value,literal)
                                    if compact(value):result['nonempty_cells']+=1
                                    if verified:result['verified_cells']+=1
                                    cells.append({'column':column,'text':value,'independent_text':literal,
                                        'bbox':list(box),'verified':verified,
                                        'status':'verified' if verified else 'text_mismatch' if compact(value) else 'empty_cell'})
                                grid['rows'].append({'row':row_index,'cells':cells,
                                    'complete_verified_rectangle':bool(cells) and all(c['verified'] for c in cells)})
                            result['tables'].append(grid)
                    finally:textpage.close()
                finally:original.close()
        finally:pdf.close()
    return result
