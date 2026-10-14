"""Different appeal subjects and procedural stages must retain their sources."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, Document, Chunk
from app.ingest import uid
from app.campus_qa import campus_retrieve


def session_factory():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def add(session, title, texts, **kwargs):
    doc = Document(id=uid(), title=title, kind='policy', status='pending_review',
                   visibility='public', sha256=uid().replace('-', '')*2,
                   raw_name='fixture.html', mime='text/html',
                   source_url='https://xsc.njxzc.edu.cn/example.htm', **kwargs)
    session.add(doc)
    rows = [Chunk(id=uid(), document_id=doc.id, text=t,
                  location=f'网页段落 {i+1} / 字符 1') for i,t in enumerate(texts)]
    session.add_all(rows)
    session.commit()
    return doc, rows


def test_named_appeal_committee_keeps_admission_deadline_out_of_party_accountability():
    with session_factory()() as s:
        doc, rows = add(s, '学生申诉工作规定', [
            '受理学生申诉的机构是学生申诉处理委员会，简称申诉委员会。',
            '受理小组对书面申诉是否受理进行表决，自接到书面申诉之日起3日内做出处理。',
            '学生接到处分决定书之日起10日内可以提出书面申诉。',
            '收到书面申诉后15日内告知复查结论。'])
        other, _ = add(s, '委员会问责实施办法', [
            '党组织接到书面申诉后，应在1个月内作出申诉处理决定。'])
        hits = campus_retrieve(s, '申诉委员会收到书面申诉后，几日内决定是否受理？')
        assert hits[0]['id'] == rows[1].id
        assert {h['document_id'] for h in hits} == {doc.id}


def test_explicit_party_accountability_does_not_get_student_appeal_scope():
    with session_factory()() as s:
        add(s, '学生申诉工作规定', ['申诉委员会收到申诉后3日内决定是否受理。'])
        doc, rows = add(s, '委员会问责实施办法', [
            '问责对象向党组织提出书面申诉，党组织1个月内作出申诉处理决定。'])
        hits = campus_retrieve(s, '问责实施办法，党组织收到问责对象申诉后多久作出处理决定？')
        assert hits[0]['document_id'] == doc.id


def test_pausing_question_retrieves_execution_rule_and_exception_within_prompt_budget():
    with session_factory()() as s:
        _, rows = add(s, '学生申诉工作规定', [
            '提交申诉后，处分复查意见由校长办公会做出决定，立即执行。',
            '在作出复议决定前，学校原定处理决定不停止执行，认为必要时可以建议暂缓执行。',
            '提交申诉书时应附处分决定复印件。',
            '申诉委员会组成受理小组。'])
        hits = campus_retrieve(s, '提交申诉后，原处分就自动暂停执行吗？', limit=4)
        assert rows[1].id in {x['id'] for x in hits}
        assert any('不停止执行' in h['text'] and '建议暂缓' in h['text'] for h in hits)


def test_post_review_remedy_survives_unrelated_internal_competition_news():
    with session_factory()() as s:
        doc, rows = add(s, '学生申诉工作规定', [
            '学生对复查决定有异议，可以在接到复查决定书之日起15日内向省级教育行政部门书面申诉。',
            '学生对处分决定有异议，可以在10日内向学校申诉委员会提出书面申诉。'])
        add(s, '校内竞赛申报指导工作通知', ['校内竞赛指导会，申报流程和处理决定的时间安排。'])
        hits = campus_retrieve(s, '对校内申诉复查决定仍不服，应向谁申诉、期限多久？', limit=4)
        assert rows[0].id in {x['id'] for x in hits}
        assert all(x['document_id'] == doc.id for x in hits)


def test_explicit_other_policy_and_funding_scope_are_preserved():
    with session_factory()() as s:
        add(s, '学生申诉工作规定', ['申诉委员会受理学生对处分决定的申诉。'])
        charter, _ = add(s, '学校章程', ['学生可对处分提出申诉。'])
        funding, _ = add(s, '国家奖学金评审细则', ['对国家奖学金评审结果有异议的学生可以提出书面申诉。'])
        assert campus_retrieve(s, '学校章程规定学生能提出申诉吗？')[0]['document_id'] == charter.id
        assert campus_retrieve(s, '国家奖学金评审结果有异议如何申诉？')[0]['document_id'] == funding.id


def test_committee_alias_does_not_bypass_private_ancestor():
    with session_factory()() as s:
        parent, _ = add(s, '私有文件', ['内部材料'])
        parent.visibility = 'private'
        child, _ = add(s, '学生申诉规定', [
            '申诉委员会收到书面申诉后3日内决定是否受理。'], parent_id=parent.id)
        assert campus_retrieve(s, '申诉委员会收到书面申诉后，几日内决定是否受理？') == []


def test_appeal_submission_attachment_precedes_outcome_and_postponement_clauses():
    with session_factory()() as s:
        doc, rows = add(s, '学生申诉工作规定', [
            '申诉不成立，原处理或处分决定正确的，维持原处理或者处分决定，并将申诉不成立的结论和理由书面通知申诉人。',
            '学生对处分决定有异议的，可以提出书面申诉；有不可抗力者提供证明材料申请延长期限。',
            '申诉书，并附上学校做出的处分或处理决定（复印件）。申诉书必须载明自己的真实姓名及理由。'])
        hits = campus_retrieve(s, '申诉书除请求和理由外，还要附什么决定材料？', limit=4)
        assert hits[0]['id'] == rows[2].id
        assert hits[0]['document_id'] == doc.id
