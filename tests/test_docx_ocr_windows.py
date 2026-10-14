from datetime import datetime,timezone
from types import SimpleNamespace
import pytest
from app.evidence_windows import docx_ocr_windows
from app.db import Chunk
from app.ingest import uid
from app.campus_qa import campus_retrieve,campus_answer
from tests.test_appeal_retrieval import session_factory,add

LEFT='2．拍摄点布置应避免单侧靠窗，防止单侧光线过强造成脸'
RIGHT='部一边亮一边暗。'


def row(identity,text,index,xy,doc='one',image=1,digest='70159b256afc',confidence='0.998'):
    location=f'Word 图像 {image} SHA={digest} / OCR {index} conf={confidence} xy={xy}'
    return SimpleNamespace(id=identity,text=text,location=location),SimpleNamespace(id=doc)


def pair():
    return [row('a',LEFT,13,'74,706;624,706;624,730;74,730'),
            row('b',RIGHT,14,'34,737;195,737;195,762;34,762')]


def test_numbered_prose_context_requires_complete_document_and_retains_exact_rows():
    rows=pair()
    assert not docx_ocr_windows(rows)
    windows=docx_ocr_windows(rows,complete_documents={'one'})
    assert [c.id for c in windows['a']]==['a','b'] and windows['a']==windows['b']
    assert windows['a'][0].text==LEFT and windows['a'][1].text==RIGHT


@pytest.mark.parametrize('change',['gap','column','overlap','tilt','other_doc','other_image','other_sha',
    'new_rule','ended','short_label','duplicate_index','interference','malformed_interference','low_confidence','bad_coordinates','wmf'])
def test_unverified_layout_does_not_create_window(change):
    rows=pair();a,b=rows[0][0],rows[1][0]
    if change=='gap':b.location=b.location.replace('OCR 14','OCR 16')
    if change=='column':b.location=b.location.replace('34,737;195,737;195,762;34,762','650,737;810,737;810,762;650,762')
    if change=='overlap':b.location=b.location.replace('737','720').replace('762','745')
    if change=='tilt':b.location=b.location.replace('195,737','195,780')
    if change=='other_doc':rows[1][1].id='two'
    if change=='other_image':b.location=b.location.replace('图像 1','图像 2')
    if change=='other_sha':b.location=b.location.replace('70159b256afc','aaaaaaaaaaaa')
    if change=='new_rule':b.text='3．另一个独立条款。'
    if change=='ended':a.text+='。'
    if change=='short_label':a.text='被拍摄者'
    if change=='duplicate_index':rows.append(row('c','重复框',14,'34,737;195,737;195,762;34,762'))
    if change=='interference':rows.append(row('c','旁栏文字',15,'250,737;400,737;400,762;250,762'))
    if change=='malformed_interference':rows.append(row('c','不完整坐标框',15,'invalid'))
    if change=='low_confidence':b.location=b.location.replace('conf=0.998','conf=0.510')
    if change=='bad_coordinates':b.location=b.location.replace('34,737','-34,737')
    if change=='wmf':b.location=b.location.replace('/ OCR','/ WMF OCR')
    assert not docx_ocr_windows(rows,complete_documents={'one','two'})


def test_real_retrieval_and_fallback_display_both_raw_pieces_without_merging():
    with session_factory()() as session:
        parent,_=add(session,'摄影信息采集通知',['请查看附件'])
        doc,chunks=add(session,'拍摄点布置示意图.docx',[LEFT,RIGHT],parent_id=parent.id)
        doc.mime='.docx'
        for chunk,source in zip(chunks,pair()):chunk.location=source[0].location
        session.commit()
        question='拍摄点布置示意图 为什么避免单侧靠窗'
        hits=campus_retrieve(session,question)
        assert [p['id'] for p in hits[0]['supporting_chunks']]==[c.id for c in chunks]
        answer=campus_answer(session,question,datetime.now(timezone.utc),use_model=False)
        assert [s['quote'] for s in answer['sources']]==[LEFT,RIGHT]
        assert [s['location'] for s in answer['sources']]==[c.location for c in chunks]
        assert all('OCR' in s['location'] for s in answer['sources'])
        assert '【图像OCR候选，须核对原图】' in answer['answer']
        assert any('邻近' in w for w in answer['warnings'])


def test_model_input_marks_nearby_pieces_and_withdrawal_drops_whole_context():
    from app.model_evidence import prepare_units
    from app.evidence_windows import complete_citation_windows,retain_complete_windows
    parts=[{'id':r[0].id,'text':r[0].text,'location':r[0].location} for r in pair()]
    evidence=[{'id':'a','document_id':'one','text':LEFT,'supporting_chunks':parts,
        'location':parts[0]['location'],'warnings':[]}]
    _,originals,prompt,_=prepare_units(evidence)
    assert [p['text'] for p in originals['E1']]==[LEFT,RIGHT]
    assert '不是已核实的连续引文' in prompt[0]['evidence_format']
    selected,required=complete_citation_windows([{**evidence[0],'quote':LEFT}],evidence)
    assert [p['quote'] for p in selected]==[LEFT,RIGHT]
    assert not retain_complete_windows(selected[:1],required)
