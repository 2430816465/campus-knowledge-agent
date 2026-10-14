"""Source-backed held-out evaluation primitives; no semantic accuracy claims."""
import hashlib
import json
import re
from pathlib import Path


def normalize(value):
    return re.sub(r'\s+', '', value).casefold()


def load_bank(path):
    payload = Path(path).read_bytes()
    bank = json.loads(payload)
    cases, sources = bank['cases'], bank['sources']
    if not cases or len(cases) > 500 or len(sources) > 100:
        raise ValueError('finite bank required')
    ids, questions = set(), set()
    for case in cases:
        question = normalize(case['question'])
        if not question or question in questions or case['id'] in ids:
            raise ValueError('duplicate/empty case')
        ids.add(case['id']); questions.add(question)
        if case['expectation'] not in ('answerable', 'insufficient'):
            raise ValueError('unknown expectation')
        if not case.get('standard_answer') or not case.get('facts'):
            raise ValueError('standard answer and source facts required even for boundary cases')
        for fact in case['facts']:
            if fact['source_id'] not in sources or len(normalize(fact['anchor'])) < 4:
                raise ValueError('invalid source fact')
    return bank, hashlib.sha256(payload).hexdigest()


def original_segments(raw_root, source):
    root = Path(raw_root).resolve()
    path = (root / source['raw_name']).resolve()
    if path.parent != root or path.stat().st_size > 25 * 1024 * 1024:
        raise ValueError('original path/size outside evaluation budget')
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != source['sha256']:
        raise ValueError('original SHA mismatch')
    if path.suffix.lower() == '.html':
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(payload, 'html.parser', from_encoding='utf-8')
        body = soup.select_one('.wp_articlecontent, .Article_Content, .article-content, #content')
        if body is None:
            raise ValueError('no article body; navigation is not evidence')
        for tag in body.select('script, style'):
            tag.decompose()
        return [body.get_text(' ', strip=True)]
    if path.suffix.lower() == '.pdf':
        import pypdfium2
        pdf = pypdfium2.PdfDocument(payload)
        try:
            if len(pdf) > 300:
                raise ValueError('PDF page budget exceeded')
            pages = []
            for i in range(len(pdf)):
                page = pdf[i]
                textpage = page.get_textpage()
                try:
                    pages.append(textpage.get_text_bounded())
                finally:
                    textpage.close(); page.close()
            return pages
        finally:
            pdf.close()
    raise ValueError('unsupported original format')


def audit_bank(bank, raw_root, metadata, chunks_by_document):
    from .source_scope import eligibility
    originals, report = {}, []
    for identity, source in bank['sources'].items():
        live = metadata.get(identity, {})
        if (live.get('sha256') != source['sha256'] or live.get('source_url') != source['source_url']
                or live.get('raw_name') != source['raw_name']
                or not eligibility(identity, metadata)['eligible']):
            raise ValueError('changed/ineligible source: ' + identity)
        originals[identity] = [normalize(s) for s in original_segments(raw_root, source)]
    for case in bank['cases']:
        facts = []
        for fact in case['facts']:
            identity, anchor = fact['source_id'], normalize(fact['anchor'])
            pages = [i+1 for i, s in enumerate(originals[identity]) if anchor in s]
            chunks = [c['id'] for c in chunks_by_document.get(identity, []) if anchor in normalize(c['text'])]
            if not pages or not chunks:
                raise ValueError('unverified raw/chunk anchor: ' + case['id'] + ': ' + fact['anchor'])
            facts.append({**fact, 'original_segments_1based': pages, 'chunk_ids': chunks})
        report.append({'id': case['id'], 'facts': facts})
    return report


def evidence_measure(case, hits):
    matched = [any(row['document_id'] == fact['source_id']
                   and normalize(fact['anchor']) in normalize(row['text']) for row in hits)
               for fact in case['facts']]
    return {'fact_evidence_found': matched,
            'all_expected_evidence_found': all(matched) if case['expectation'] == 'answerable' else None,
            'answer_correct': None, 'manual_review_required': True}


def verified_window_evidence(hits, current_chunks, *, complete_chunks=None):
    """Score immutable contiguous evidence; cross-page needs a full DB snapshot.

    current_chunks comes from a fresh, read-only DB query, not the retrieval
    dictionaries. No joining across fragments to manufacture an anchor match.
    """
    from .evidence_windows import LOCATION, END, NEW_RULE
    output, seen = [], set()
    for hit in hits[:4]:
        pieces = hit.get('supporting_chunks') or []
        if pieces:
            if len(pieces) > 8 or len({p['id'] for p in pieces}) != len(pieces):
                raise ValueError('invalid evidence window size/identity')
            if hit['id'] not in {p['id'] for p in pieces}:
                raise ValueError('window excludes anchor chunk')
            positions = []
            for piece in pieces:
                pos = LOCATION.fullmatch(piece.get('location') or '')
                if not pos or int(pos[3]) != 1 or len(piece['text']) > 200:
                    raise ValueError('invalid evidence window location/length')
                positions.append((int(pos[1]), int(pos[2])))
            same_page = len({p[0] for p in positions}) == 1
            if sum(len(p['text'].strip()) for p in pieces) > 700:
                raise ValueError('evidence window crosses a page/gap/budget')
            if same_page:
                if any(b[1] != a[1] + 1 for a,b in zip(positions,positions[1:])):
                    raise ValueError('evidence window crosses a page/gap/budget')
            else:
                if complete_chunks is None or len({p[0] for p in positions})!=2:
                    raise ValueError('cross-page window requires complete document snapshot')
                boundaries=0
                for index,(a,b) in enumerate(zip(positions,positions[1:])):
                    if a[0]==b[0] and b[1]==a[1]+1:
                        continue
                    boundaries+=1
                    left,right=pieces[index]['text'].strip(),pieces[index+1]['text'].strip()
                    actual_positions=[]
                    for chunk in complete_chunks.values():
                        pos=LOCATION.fullmatch(chunk.get('location') or '')
                        if chunk['document_id']==hit['document_id'] and pos and int(pos[1])==a[0]:
                            actual_positions.append((int(pos[2]),int(pos[3])))
                    if (b!=(a[0]+1,1) or not actual_positions or max(actual_positions)!=(a[1],1)
                            or not 20<=len(left)<=200 or not 12<=len(right)<=200
                            or END.search(left) or NEW_RULE.match(right)
                            or re.match(r'^(?:附件|目录|南京晓庄学院|第\s*\d+\s*页)',right)):
                        raise ValueError('unproven cross-page window boundary')
                if boundaries!=1:
                    raise ValueError('invalid cross-page window order')
        for piece in [hit] + pieces:
            actual = current_chunks.get(piece['id'])
            if (not actual or actual['document_id'] != hit['document_id']
                    or actual['text'] != piece['text']
                    or actual.get('location') != piece.get('location')):
                raise ValueError('changed or fabricated retrieval evidence')
            if actual['id'] not in seen:
                seen.add(actual['id']); output.append(actual)
    return output


def read_journal(path, bank_sha, code_version):
    path = Path(path)
    if not path.exists():
        return [], set()
    lines = path.read_text(encoding='utf-8').splitlines()
    rows = [json.loads(line) for line in lines]  # reject truncated records, never silently skip
    if (not rows or rows[0].get('bank_sha256') != bank_sha
            or rows[0].get('code_version') != code_version):
        raise ValueError('resume bank/code mismatch')
    events = rows[1:]
    done = {row['id'] for row in events}
    if len(done) != len(events):
        raise ValueError('duplicate journal case')
    return events, done
