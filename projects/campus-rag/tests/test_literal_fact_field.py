from app.campus_qa import campus_retrieve, requested_literal_fields
from app.db import Chunk
from app.ingest import uid
from test_campus_qa import factory, add


def test_explicit_site_question_prioritizes_body_field_over_generic_steps():
    with factory()() as session:
        doc, direct = add(session, '选择“南京晓庄学院”考点。',
                          title='2026年普通话水平测试考生报名操作流程')
        for text in ['考生选择支付方式，完成报名操作流程。',
                     '考生应选择证书邮寄方式，完成报名操作。',
                     '报名操作中考生选择考点自取或快递邮寄，上传照片，填写联系信息。']:
            session.add(Chunk(id=uid(), document_id=doc.id, text=text, location='Word 段落 2'))
        session.commit()
        hits = campus_retrieve(session, '2026年普通话水平测试考生报名操作流程中应选择哪个考点？', limit=1)
        assert hits[0]['id'] == direct.id
        assert hits[0]['text'] == direct.text
        assert not campus_retrieve(session, '2027年普通话水平测试应选择哪个考点？')


def test_explicit_field_does_not_override_public_access():
    with factory()() as session:
        add(session, '选择秘密考点。', title='普通话水平测试报名操作流程', visibility='private')
        add(session, '选择撤回考点。', title='普通话水平测试报名操作流程', status='withdrawn')
        assert not campus_retrieve(session, '普通话水平测试应选择哪个考点？')


def test_field_detection_preserves_stage_names_and_does_not_expand_generic_time():
    assert requested_literal_fields('报名时间是什么？') == {'报名时间'}
    assert requested_literal_fields('提交时间是什么？') == {'提交时间'}
    assert requested_literal_fields('哪个考点？') == {'考点'}
    assert not requested_literal_fields('什么时候报名？')
    assert not requested_literal_fields('什么是考点？')
