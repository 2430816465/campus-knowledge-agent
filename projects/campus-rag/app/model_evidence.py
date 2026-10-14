"""Bounded coherent model units; public citations remain original DB chunks."""
from .source_versions import valid_record


def prepare_units(evidence, budget=2200):
    units, originals, prompt, omitted = [], {}, [], 0
    groups, contexts = {}, set()
    for row in evidence[:4]:
        parts = row.get('supporting_chunks') or []
        if parts:
            pieces = [{**row,**p,'supporting_chunks':[],'quote':p['text']} for p in parts]
            body = '\n'.join(p['text'] for p in pieces)
            # A continuity window is admitted whole or omitted, never half read.
            if len(pieces)>8 or len(body)>budget:
                omitted += 1
                continue
        else:
            if len(row['text']) > min(900,budget):
                omitted += 1
                continue  # A trailing exception must not be removed from any source.
            body = row['text']
            pieces = [{**row,'quote':body}]
        if not body.strip():
            omitted += 1
            continue
        alias = f'E{len(units)+1}'
        # Context labels are backed by complete, separately located raw chunks.
        # They are citations too, rather than uncited interpretations of scope.
        context_pieces=[{**row,**p,'supporting_chunks':[],'quote':p['text']}
            for p in row.get('context_chunks',[])]
        all_pieces=context_pieces+pieces
        originals[alias]=list({p['id']:p for p in all_pieces}.values())
        unit = {k:v for k,v in {**row,'id':alias,'text':body}.items()
                if k in ('id','text','context','title','published_at','location','sha256','original_version','scope_uncertain')}
        units.append(unit)
        group = groups.setdefault(row['document_id'],f'D{len(groups)+1}')
        item = {'id':alias,'source_group':group,'text':body,'locations':[p.get('location') for p in pieces]}
        if row.get('quote_method')=='verified_pdf_table_cells':
            item['evidence_format'] = '表格按列展示；每行标签来自同表表头，非连续正文句子。只解释该记录，不概括全部项目。'
        if row.get('quote_method')=='visually_verified_image_cells':
            item['evidence_format'] = '图片表格逐格及同行关系已对照该SHA原图核验；按列展示，非连续原文句子。仅回答该行，不推断其他行，未经过教师审核。'
        if any('OCR' in (p.get('location') or '') for p in all_pieces):
            item['evidence_format'] = item.get('evidence_format', '') + ' 图像OCR候选文字；关键字段须原图复核，不得从文字顺序推断箭头、距离对应、表格列或布局关系。'
            if len(pieces)>1:
                item['evidence_format'] += ' 多条OCR是各有位置的邻近候选，不是已核实的连续引文；不得仅凭邻近关系补全规则。'
        if row.get('scope_uncertain'):
            item['scope_uncertain'] = True
            item['scope_note'] = '条款适用范围未确认；前置标题不证明只适用该类别，也不证明各类别通用。引用时必须说明此范围尚未确认。'
        if not any(p['source_group']==group for p in prompt):
            item.update(title=row.get('title','')[:140],published_at=row.get('published_at'))
        original = row.get('original_version')
        if valid_record(original,row.get('sha256')):
            item['original_file_year'] = original['year']
            item['current_validity_verified'] = False
        context = row.get('context','')
        if context and (group,context) not in contexts:
            item['context'] = context[:180]
            contexts.add((group,context))
        prompt.append(item)
        budget -= len(body)
    return units,originals,prompt,omitted


def decode_units(validated, claims, originals):
    selected, seen = [], set()
    for unit in validated:
        for piece in originals[unit['id']]:
            if piece['id'] not in seen:
                selected.append(piece);seen.add(piece['id'])
    explanations = [{**claim,'ids':list(dict.fromkeys(
        piece['id'] for alias in claim['ids'] for piece in originals[alias]))} for claim in claims]
    return selected,explanations
