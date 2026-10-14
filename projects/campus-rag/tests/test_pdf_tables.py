from hashlib import sha256
from io import BytesIO
import pytest
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
from app.pdf_tables import extract_grids,verify_cell


def table_pdf(rotate=False):
    writer=PdfWriter();page=writer.add_blank_page(width=300,height=200)
    font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    stream=DecodedStreamObject();stream.set_data(b'0.5 w 20 80 m 280 80 l S 20 120 m 280 120 l S 20 160 m 280 160 l S 20 80 m 20 160 l S 150 80 m 150 160 l S 280 80 m 280 160 l S BT /F1 12 Tf 30 140 Td (ID) Tj 130 0 Td (Type) Tj ET BT /F1 12 Tf 30 100 Td (A01) Tj 130 0 Td (Innovation) Tj ET')
    page[NameObject('/Contents')]=writer._add_object(stream)
    if rotate:page.rotate(90)
    output=BytesIO();writer.write(output);return output.getvalue()


def test_grid_keeps_fields_in_correct_cells_and_second_reader_matches():
    payload=table_pdf();r=extract_grids(payload,sha256(payload).hexdigest(),[1])
    assert r['nonempty_cells']==r['verified_cells']==r['cell_slots']==4
    assert [[c['text'] for c in row['cells']] for row in r['tables'][0]['rows']]==[['ID','Type'],['A01','Innovation']]
    assert all(row['complete_verified_rectangle'] for row in r['tables'][0]['rows'])
    assert r['tables'][0]['rows'][1]['cells'][0]['bbox']!=r['tables'][0]['rows'][1]['cells'][1]['bbox']
    assert not r['semantic_correctness_proven'] and not r['teacher_reviewed']


@pytest.mark.parametrize('pages', [[],[0],[True],[1,1],list(range(1,22))])
def test_page_budget_rejects_invalid_or_repeated_pages(pages):
    payload=table_pdf()
    with pytest.raises(ValueError,match='distinct'):extract_grids(payload,sha256(payload).hexdigest(),pages)


def test_hash_range_cell_budget_and_rotation_fail_closed():
    payload=table_pdf();digest=sha256(payload).hexdigest()
    with pytest.raises(ValueError,match='SHA'):extract_grids(payload,'0'*64,[1])
    with pytest.raises(ValueError,match='range'):extract_grids(payload,digest,[2])
    with pytest.raises(ValueError,match='Cell budget'):extract_grids(payload,digest,[1],max_cells=3)
    rotated=table_pdf(True);r=extract_grids(rotated,sha256(rotated).hexdigest(),[1])
    assert not r['tables'] and r['unsupported_pages'][0]['reason']=='rotated_or_offset_coordinate_system'


def test_same_words_elsewhere_or_reordered_or_duplicated_are_not_verification():
    assert verify_cell('A01 Innovation','A01 \nInnovation')
    assert not verify_cell('A01 Innovation','Innovation A01')
    assert not verify_cell('A01 Innovation','A01 Innovation A01 Innovation')
    assert not verify_cell('','')


def test_source_audit_denies_private_ancestor_before_reading_file(monkeypatch,tmp_path):
    import scripts.audit_pdf_tables as cli
    from tests.test_appeal_retrieval import session_factory,add
    factory=session_factory()
    with factory() as s:
        parent,_=add(s,'parent',['private'])
        parent.visibility='private';s.commit()
        child,_=add(s,'child',['public'],parent_id=parent.id)
    monkeypatch.setattr(cli,'Session',factory);monkeypatch.setattr(cli,'DATA',tmp_path)
    with pytest.raises(ValueError,match='eligible'):cli.audit(child.id,[1])


def test_source_audit_rechecks_fresh_metadata_after_extraction(monkeypatch,tmp_path):
    import scripts.audit_pdf_tables as cli
    from tests.test_appeal_retrieval import session_factory
    payload=table_pdf();raw=tmp_path/'raw';raw.mkdir();(raw/'fixture.pdf').write_bytes(payload)
    source={'raw_name':'fixture.pdf','sha256':sha256(payload).hexdigest(),'title':'test','source_url':'https://jwc.njxzc.edu.cn/a.pdf'}
    calls=[]
    def state(*args):
        calls.append(1)
        return {**source,'source_url':source['source_url'] if len(calls)==1 else 'https://jwc.njxzc.edu.cn/changed.pdf'}
    monkeypatch.setattr(cli,'Session',session_factory());monkeypatch.setattr(cli,'DATA',tmp_path);monkeypatch.setattr(cli,'source_state',state)
    with pytest.raises(ValueError,match='changed'):cli.audit('d',[1])
    assert len(calls)==2
