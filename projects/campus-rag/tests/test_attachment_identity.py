import pytest
from tests.test_campus_qa import factory, add
from app.campus_qa import campus_retrieve


@pytest.mark.parametrize('mime', ['.pdf', '.docx', '.xlsx', '.jpg', '.webp'])
def test_generic_attachment_inherits_only_recorded_notice_identity(mime):
    with factory()() as session:
        parent, _ = add(session, '详情见附件。', title='2026年校园创意设计活动通知')
        child, fact = add(session, '报名时间：2026年10月12日至10月15日。仅限在校本科生。', title='附件1' + mime)
        child.parent_id, child.mime, child.sha256 = parent.id, mime, 'b'*64
        child.source_url = 'https://www.njxzc.edu.cn/files/original' + mime
        other, _ = add(session, '报名时间：2026年11月1日。', title='附件2' + mime)
        other.mime, other.sha256 = mime, 'c'*64
        session.commit()
        hits = campus_retrieve(session, '2026年校园创意设计活动通知，报名时间和条件是什么？')
        assert any(h['id'] == fact.id and h['url'] == child.source_url and h['text'] == fact.text for h in hits)
        assert other.id not in {h['document_id'] for h in hits}
        assert not campus_retrieve(session, '2027年校园创意设计活动通知，报名时间和条件是什么？')
        for attribute, value in [('visibility', 'private'), ('status', 'withdrawn')]:
            parent.visibility, parent.status = 'public', 'pending_review'
            setattr(parent, attribute, value)
            session.commit()
            assert child.id not in {h['document_id'] for h in campus_retrieve(session, '校园创意设计活动报名条件？')}


def test_partial_child_stays_unsearchable_and_unrelated_web_child_not_inherited():
    with factory()() as session:
        parent, _ = add(session, '详情见附件。', title='2026年校园创意设计活动通知')
        for mime, state in [('.pdf', 'partial_parse'), ('.html', 'pending_review')]:
            child, _ = add(session, '报名时间为10月12日。', title='无关页面', status=state)
            child.parent_id, child.mime, child.sha256 = parent.id, mime, mime
        session.commit()
        assert not campus_retrieve(session, '2026年校园创意设计活动通知，报名时间？')
