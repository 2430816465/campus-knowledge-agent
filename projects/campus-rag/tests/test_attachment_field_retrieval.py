import pytest
from tests.test_appeal_retrieval import session_factory, add
from app.campus_qa import campus_retrieve


@pytest.mark.parametrize('question,expected',[
    ('拍摄点布置示意图 头顶灯光有什么影响','头发反光'),
    ('拍摄点布置示意图 背景颜色能用绿色红色吗','不得用绿色'),
    ('拍摄点布置示意图 为什么避免单侧靠窗','单侧光线过强'),
    ('图像信息采集通知 提交截止日期是哪天','6月20日'),
])
def test_named_attachment_body_field_precedes_parent_filename_directory(question,expected):
    with session_factory()() as session:
        parent,_=add(session,'关于做好2026届毕业生图像信息采集工作的通知',[
            '附件1、如何获取学信网图像采集码.docx 附件2、学生用户使用指南.docx 附件3：拍摄点布置示意图.docx 附件4、常见不合格照片及解决办法.docx',
            '提交截止日期为2026年6月20日。'])
        child,rows=add(session,parent.title+' / 附件3：拍摄点布置示意图.docx',[
            '拍摄点布置示意图','背景','0.4米','被拍摄者','0.6米','柔光灯','0.8米','0.2米','手机',
            '1．背景应为单色系，白色、蓝色为佳（不得用绿色、红色)。',
            '2．拍摄点布置应避免单侧靠窗，防止单侧光线过强造成脸',
            '部一边亮一边暗。','3．避开头顶有灯光位置，防止头发反光。'],parent_id=parent.id)
        child.mime='.docx'
        for index,row in enumerate(rows,1):row.location=f'Word 图像 1 / OCR {index}'
        session.commit()
        hits=campus_retrieve(session,question,limit=1)
        assert hits and expected in hits[0]['text']
        assert hits[0]['document_id']==(parent.id if '截止' in question else child.id)
