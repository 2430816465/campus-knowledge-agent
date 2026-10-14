import json
from datetime import datetime,timezone
from app.db import Chunk
from app.ingest import uid
from app.campus_qa import campus_retrieve,campus_answer
from app.pdf_sections import section_label,requested_scopes
from tests.test_campus_qa import factory,add


def fixture(session):
    doc,head=add(session,'1.高层次培育项目。须满足如下条件。',title='2026年科研结项通知')
    head.location='第 1 页 / 段落 1 / 字符 1'
    data=[('第 1 页 / 段落 2 / 字符 1','自然科学类：（1）项目负责人作为独立或第一作者在SCI'),
          ('第 2 页 / 段落 1 / 字符 1','二区及以上期刊发表1篇论文；或获得2项国家发明专利。'),
          ('第 2 页 / 段落 2 / 字符 1','2.青年专项。须满足如下条件。'),
          ('第 2 页 / 段落 3 / 字符 1','自然科学类：项目负责人获得发明专利和实用新型专利各1项。')]
    for location,text in data:session.add(Chunk(id=uid(),document_id=doc.id,text=text,location=location))
    session.commit()
    return doc,head


def test_literal_pdf_labels_and_comparisons_do_not_infer_category():
    assert section_label('1.高层次培育项目。在研究周期内申报。')==(1,'1.高层次培育项目')
    assert section_label('自然科学类：（1）独立或第一作者。')==(2,'自然科学类')
    assert section_label('普通正文中提到青年专项。') is None
    labels={'1.高层次培育项目','2.青年专项'}
    assert requested_scopes('科研项目要求是什么？',labels)==set()
    assert requested_scopes('比较高层次与青年项目',labels)==labels
    assert requested_scopes('不是高层次项目，问青年专项',labels)==set()


def test_process_and_attachment_headings_are_not_subject_categories():
    from types import SimpleNamespace
    from app.pdf_sections import pdf_sections
    doc=SimpleNamespace(id='one')
    rows=[(SimpleNamespace(id=str(n),text=t,location=f'第 1 页 / 段落 {n} / 字符 1'),doc)
          for n,t in enumerate(['1.材料提交。各学院提交。','2.推荐名额分配表。','3.系统评审。'],1)]
    assert not pdf_sections(rows)[0]
    contexts,refs,scopes,options=pdf_sections(rows,complete_documents={'one'})
    assert contexts and options['one']==set()


def test_project_subject_filter_keeps_cross_page_conditions_and_general_queries():
    with factory()() as session:
        fixture(session)
        high=campus_retrieve(session,'2026科研结项通知，高层次自然科学项目一项发明加一项实用新型可以吗？')
        young=campus_retrieve(session,'2026科研结项通知，青年自然科学项目一项发明加一项实用新型可以吗？')
        assert high and young
        assert all('青年专项' not in r['context'] for r in high)
        assert all('高层次培育项目' not in r['context'] for r in young)
        assert any(len({p['location'].split(' / ')[0] for p in r['supporting_chunks']})==2 for r in high)
        assert any('各1项' in r['text'] for r in young)
        assert any('高层次' in r['context'] for r in campus_retrieve(session,'2026科研结项通知，比较高层次与青年自然科学项目专利条件？'))
        assert any('青年' in r['context'] for r in campus_retrieve(session,'2026科研结项通知，比较高层次与青年自然科学项目专利条件？'))


def test_model_context_is_cited_and_changed_scope_heading_invalidates_response(monkeypatch):
    import app.campus_qa as qa
    with factory()() as session:
        doc,head=fixture(session)
        def generate(messages):
            items=json.loads(messages[1]['content'])['evidence']
            chosen=next(r for r in items if 'SCI' in r['text'])
            assert '高层次培育项目' in chosen['context']
            return {'message':{'content':json.dumps({'citations':[{'id':chosen['id']}],
                'explanation':[{'text':'高层次项目须由负责人独立或第一作者发表SCI二区及以上论文。','ids':[chosen['id']]}]})}}
        monkeypatch.setattr(qa,'generate',generate)
        q='2026科研结项通知，高层次自然科学项目SCI论文条件是什么？'
        answer=campus_answer(session,q,datetime.now(timezone.utc))
        assert answer['mode']=='grounded_explanation'
        assert head.id in answer['explanation'][0]['ids']
        assert any(r['id']==head.id and r['quote']==head.text for r in answer['sources'])
        def changed(messages):
            result=generate(messages);head.text='1.另一类项目。适用规则已修改。';session.commit();return result
        monkeypatch.setattr(qa,'generate',changed)
        answer=campus_answer(session,q,datetime.now(timezone.utc))
        assert answer['mode']=='insufficient_evidence' and not answer['sources']

def test_inline_top_level_heading_replaces_previous_scope_without_changing_quotes():
    from types import SimpleNamespace
    from app.pdf_sections import pdf_sections
    doc = SimpleNamespace(id='inline')
    texts = ['三、会议内容', '四、参会对象：各高等院校相关院系领导、统计与市场调查学科',
             '带头人、统计与市场调查课程负责人与骨干教师。', '五、考核证书：经综合考核后颁发证书。']
    rows = [(SimpleNamespace(id=str(n), text=t, location=f'第 2 页 / 段落 {n} / 字符 1'), doc)
            for n, t in enumerate(texts, 1)]
    contexts, references, _, _ = pdf_sections(rows, complete_documents={'inline'})
    assert contexts['2'] == contexts['3'] == '四、参会对象'
    assert contexts['4'] == '五、考核证书'
    assert references['3'][0]['text'] == texts[1]
    assert [c.text for c, _ in rows] == texts
    assert not pdf_sections(rows)[0]
    assert section_label('普通正文中提到四、参会对象：教师。') is None
