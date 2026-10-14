from datetime import datetime,timezone
from types import SimpleNamespace
import json
import pytest
from app.evidence_windows import pdf_windows,expand_evidence,complete_citation_windows,retain_complete_windows
from app.campus_qa import campus_answer,campus_retrieve
from app.db import Chunk
from app.ingest import uid
from tests.test_campus_qa import factory,add


def row(identity,text,page=1,paragraph=1,document='one',location=None):
    return (SimpleNamespace(id=identity,text=text,location=location or f'第 {page} 页 / 段落 {paragraph} / 字符 1'),
            SimpleNamespace(id=document))


def test_wrapped_rule_window_keeps_exact_pieces_in_order():
    rows=[row('a','第八条 考核采用笔试，考试时间原则上为120'),
          row('b','分钟；实际操作原则上不超过180分钟。',paragraph=2),
          row('c','第九条 不同规则另行规定。',paragraph=3)]
    windows=pdf_windows(rows)
    assert [c.id for c in windows['a']]==['a','b']
    assert windows['a']==windows['b'] and 'c' not in windows


def test_windows_do_not_cross_pages_documents_gaps_rules_or_ocr():
    rows=[row('a','未完的规则'),row('b','另一页续行。',page=2),row('c','另一文件。',document='two'),
          row('d','跳号段落。',paragraph=4),row('e','第十条 单独新规则。',paragraph=5),
          row('ocr','OCR候选',location='第 1 页 / OCR 框 1 / 置信度 0.900')]
    assert not pdf_windows(rows)


@pytest.mark.parametrize('heading',['三、活动时间','二．申请条件','十.办理流程'])
def test_chinese_section_heading_does_not_absorb_previous_unpunctuated_section(heading):
    rows=[row('a','D 类为腾讯开悟人工智能全球公开赛，聚焦人工智能场景真实需',paragraph=12),
          row('b','求，具体详情见赛题手册）',paragraph=13),
          row('h',heading,paragraph=14),
          row('c','相关说明',paragraph=15),
          row('d','线上报名及确定选题 2026 年 2 月 11 日至 3 月 20 日 16:00',paragraph=16)]
    windows=pdf_windows(rows)
    assert [c.id for c in windows['a']]==['a','b']
    assert [c.id for c in windows['d']]==['h','c','d']
    assert all(c.id not in ('a','b') for c in windows['h'])


def test_chinese_heading_prevents_cross_page_continuation_without_losing_exception():
    rows=[row('a','适用于上一节的未完介绍文字，需要保留其独立位置',paragraph=23),
          row('h','三、申请条件',page=2),
          row('c','申请人须提交证明材料，',page=2,paragraph=2),
          row('d','但不符合规定条件者不得申请。',page=2,paragraph=3)]
    windows=pdf_windows(rows,complete_documents={'one'})
    assert 'a' not in windows
    assert [c.id for c in windows['c']]==['h','c','d']


def test_schedule_table_is_not_joined_as_prose_or_cut_into_eight_piece_windows():
    rows=[row('h','三、活动时间'),row('header','活动内容 活动时间',paragraph=2),
          row('registration','线上报名及确定选题 2026 年 2 月 11 日至 3 月 20 日 16:00',paragraph=3),
          row('selection','B 类校内选拔赛 2026 年 3 月 27 日',paragraph=4),
          row('submission','B 类及 C 类提交时间：2026 年 4 月 4 日',paragraph=5),
          row('continued','10:00-4 月 8 日 16:00',paragraph=6),
          row('next','四、申请条件',paragraph=7),
          row('condition','申请人须提交证明材料，',paragraph=8),
          row('exception','但不符合规定条件者不得申请。',paragraph=9)]
    windows=pdf_windows(rows,complete_documents={'one'})
    assert not {'registration','selection','submission','continued','header'} & windows.keys()
    assert [c.id for c in windows['condition']]==['next','condition','exception']


def test_cross_page_clause_requires_complete_document_and_preserves_raw_locations():
    rows=[row('a','自然科学类：（1）项目负责人作为独立或第一作者在 SCI',paragraph=23),
          row('b','二区及以上期刊发表1篇论文。',page=2)]
    assert not pdf_windows(rows)
    windows=pdf_windows(rows,complete_documents={'one'})
    assert [c.id for c in windows['a']]==['a','b']
    assert windows['a']==windows['b']
    assert windows['a'][0].location=='第 1 页 / 段落 23 / 字符 1'
    assert windows['b'][1].location=='第 2 页 / 段落 1 / 字符 1'


@pytest.mark.parametrize('change',['ended','new_rule','header','page_gap','paragraph_gap','other_doc','offset','footer'])
def test_cross_page_connection_rejects_unproven_boundaries(change):
    a=row('a','自然科学类：（1）项目负责人作为独立或第一作者在 SCI',paragraph=23)
    b=row('b','二区及以上期刊发表1篇论文。',page=2)
    rows=[a,b]
    if change=='ended':a[0].text+='。'
    if change=='new_rule':b[0].text='2.青年项目依据另一个成果条件。'
    if change=='header':b[0].text='南京晓庄学院科研处公开事项通知'
    if change=='page_gap':b[0].location='第 3 页 / 段落 1 / 字符 1'
    if change=='paragraph_gap':b[0].location='第 2 页 / 段落 2 / 字符 1'
    if change=='other_doc':b[1].id='two'
    if change=='offset':a[0].location='第 1 页 / 段落 23 / 字符 1001'
    if change=='footer':rows.append(row('footer','1',paragraph=24))
    windows=pdf_windows(rows,complete_documents={'one','two'})
    assert 'a' not in windows or 'b' not in {c.id for c in windows['a']}


def test_window_limits_are_real_and_long_existing_chunks_are_unchanged():
    rows=[row(str(i),'连续文字',paragraph=i) for i in range(1,20)]
    rows.append(row('long','x'*201,paragraph=20))
    windows=pdf_windows(rows)
    assert max(len(w) for w in windows.values())<=8 and 'long' not in windows


def test_expansion_balances_sources_and_deduplicates():
    evidence=[{'id':'a','document_id':'one','text':'anchor','supporting_chunks':[
        {'id':'a','text':'first'},{'id':'b','text':'condition'}]},
        {'id':'c','document_id':'two','text':'comparison'}]
    expanded=expand_evidence(evidence)
    assert [r['id'] for r in expanded]==['a','c','b']
    assert expanded[2]['document_id']=='one' and expanded[2]['text']=='condition'
    assert len(expand_evidence(evidence,max_total=2))==2


def pdf_fixture(session, cross_page=False):
    doc,c=add(session,'第十条 缓考申请必须在考试开始之前书面提出，',title='课程考核办法')
    c.location='第 1 页 / 段落 1 / 字符 1'
    location='第 2 页 / 段落 1 / 字符 1' if cross_page else '第 1 页 / 段落 2 / 字符 1'
    second=Chunk(id=uid(),document_id=doc.id,text='因病须附医院证明，经批准后生效。',location=location)
    session.add(second);session.commit()
    return doc,c,second


def test_live_retrieval_and_fallback_preserve_the_full_condition_and_locations():
    with factory()() as session:
        doc,first,second=pdf_fixture(session)
        hits=campus_retrieve(session,'课程考核缓考申请需要什么条件？')
        assert hits and [p['id'] for p in hits[0]['supporting_chunks']]==[first.id,second.id]
        result=campus_answer(session,'课程考核缓考申请需要什么条件？',datetime.now(timezone.utc),use_model=False)
        assert result['mode']=='evidence_fallback'
        assert {r['id'] for r in result['sources']}=={first.id,second.id}
        assert [r['quote'] for r in result['sources']]==[first.text,second.text]


@pytest.mark.parametrize('cross_page',[False,True])
def test_model_cites_each_immutable_piece_and_withdrawal_still_invalidates_all(monkeypatch,cross_page):
    import app.campus_qa as module
    with factory()() as session:
        doc,first,second=pdf_fixture(session,cross_page)
        def generate(messages):
            payload=json.loads(messages[1]['content']);evidence=payload['evidence']
            assert len(evidence)==1
            assert first.text+'\n'+second.text==evidence[0]['text']
            return {'message':{'content':json.dumps({'citations':[{'id':r['id']} for r in evidence],
                'explanation':[{'text':'缓考须在考前申请，因病提供医院证明并经批准。','ids':[r['id'] for r in evidence]}]})}}
        monkeypatch.setattr(module,'generate',generate)
        result=campus_answer(session,'课程考核缓考申请需要什么条件？',datetime.now(timezone.utc))
        assert result['mode']=='grounded_explanation' and len(result['sources'])==2
        def withdrawn(messages):
            answer=generate(messages);doc.status='withdrawn';session.commit();return answer
        monkeypatch.setattr(module,'generate',withdrawn)
        result=campus_answer(session,'课程考核缓考申请需要什么条件？',datetime.now(timezone.utc))
        assert result['mode']=='insufficient_evidence' and not result['sources']


def test_selected_coherent_unit_decodes_all_original_pieces(monkeypatch):
    import app.campus_qa as module
    with factory()() as session:
        doc,first,second=pdf_fixture(session)
        def generate(messages):
            assert '先直接回答' in messages[0]['content']
            pieces=json.loads(messages[1]['content'])['evidence']
            chosen=next(p for p in pieces if '医院' in p['text'])
            return {'message':{'content':json.dumps({'citations':[{'id':chosen['id']}],
                'explanation':[{'text':'因病须附医院证明，经批准后生效。','ids':[chosen['id']]}]})}}
        monkeypatch.setattr(module,'generate',generate)
        result=campus_answer(session,'课程考核缓考因病需要什么证明？',datetime.now(timezone.utc))
        assert [r['id'] for r in result['sources']]==[first.id,second.id]
        assert result['sources'][0]['supporting_context'] is False
        assert result['sources'][1]['supporting_context'] is False
        assert result['explanation'][0]['ids']==[first.id,second.id]
        assert [r['quote'] for r in result['sources']]==[first.text,second.text]
        assert '[1][2]' in result['answer']


@pytest.mark.parametrize('cross_page',[False,True])
def test_changed_companion_invalidates_entire_window_even_if_model_did_not_select_it(monkeypatch,cross_page):
    import app.campus_qa as module
    with factory()() as session:
        doc,first,second=pdf_fixture(session,cross_page)
        def generate(messages):
            pieces=json.loads(messages[1]['content'])['evidence']
            chosen=next(p for p in pieces if '医院' in p['text'])
            first.text='已变动的申请规定。';session.commit()
            return {'message':{'content':json.dumps({'citations':[{'id':chosen['id']}],
                'explanation':[{'text':'因病须附医院证明。','ids':[chosen['id']]}]})}}
        monkeypatch.setattr(module,'generate',generate)
        result=campus_answer(session,'课程考核缓考因病需要什么证明？',datetime.now(timezone.utc))
        assert result['mode']=='insufficient_evidence' and not result['sources']


def test_context_expansion_deduplicates_and_does_not_expand_other_documents():
    base={'id':'a','document_id':'one','text':'第一半句','supporting_chunks':[
        {'id':'a','text':'第一半句'},{'id':'b','text':'第二半句。'}]}
    selected=[{**base,'quote':base['text']},
              {**base,'id':'b','text':'第二半句。','quote':'第二半句。'},
              {'id':'other','document_id':'two','text':'另一来源','quote':'另一来源'}]
    expanded,required=complete_citation_windows(selected,[base])
    assert [r['id'] for r in expanded]==['a','b','other']
    assert all(not r['supporting_context'] for r in expanded[:2])
    assert [r['id'] for r in retain_complete_windows(expanded[1:],required)]==['other']


def test_unselected_model_input_can_be_displayed_only_as_separate_source_context():
    base={'id':'a','document_id':'one','text':'条件首行','supporting_chunks':[
        {'id':'a','text':'条件首行'},{'id':'b','text':'后续条件。'}]}
    selected=[{**base,'quote':'条件首行'}]
    expanded,_=complete_citation_windows(selected,[base])
    assert expanded[1]['supporting_context'] and expanded[1]['quote']=='后续条件。'
    assert selected[0]['quote']=='条件首行'
