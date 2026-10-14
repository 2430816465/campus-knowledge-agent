from types import SimpleNamespace
from tests.test_appeal_retrieval import session_factory,add
from app.campus_qa import campus_retrieve
from app.pdf_sections import requested_scopes,pdf_sections


def test_all_project_types_keep_categories_beyond_the_plan_name():
    labels={'1．创新训练项目','2．创业训练项目','3．创业实践项目'}
    assert requested_scopes('创新训练计划包含哪三种项目类型？',labels)==set()
    assert requested_scopes('创新训练计划校内级别与省级国家级推荐是什么关系？',labels)==set()
    assert requested_scopes('创业实践项目要求是什么？',labels)=={'3．创业实践项目'}


def test_project_level_heading_ends_previous_category_context():
    doc=SimpleNamespace(id='d')
    texts=['一、项目类型和级别','3．创业实践项目。主要支持学生团队。','（二）项目级别','本次级别分国家级、省级和校级。']
    rows=[(SimpleNamespace(id=str(i),text=t,location=f'第 1 页 / 段落 {i+1} / 字符 1'),doc) for i,t in enumerate(texts)]
    contexts,refs,scopes,options=pdf_sections(rows,complete_documents=['d'])
    assert '（二）项目级别' in contexts['3']
    assert '创业实践' not in contexts['3']
    assert scopes.get('3')=='（二）项目级别'


def test_type_rules_precede_larger_result_table_but_explicit_results_retain_scope():
    with session_factory()() as s:
        rules,rows=add(s,'关于组织申报2026年大学生创新训练计划立项工作的通知',[
            '1．创新训练项目。主要支持自主研究。',
            '2．创业训练项目。主要支持编制商业计划。',
            '3．创业实践项目。主要支持开展创业实践。'])
        result,_=add(s,'关于公布2026年大学生创新训练计划结项验收结果汇总表',[
            '大学生创新训练计划项目类型和项目级别：社会实践项目合格。']*12)
        hits=campus_retrieve(s,'2026大学生创新训练计划包含哪三种项目类型？',limit=4)
        assert {r.id for r in rows}<={r['id'] for r in hits}
        assert all(r['document_id']==rules.id for r in hits[:3])
        hits=campus_retrieve(s,'2026大学生创新训练计划结项验收结果汇总表中项目类型有哪些？')
        assert hits[0]['document_id']==result.id


def test_levels_use_application_procedure_not_named_award_list():
    with session_factory()() as s:
        rules,rows=add(s,'关于组织申报2026年创新训练计划立项工作的通知',[
            '项目级别分国家级、省级和校级，学校从校级项目中择优推荐参评省级和国家级。',
            '学院初审后推荐至学校参加校级评审。'])
        add(s,'关于公布2026年创新训练计划项目遴选结果的通知',[
            '创新训练计划项目级别：省级推荐项目100项、国家级40项、校级135项。'])
        hits=campus_retrieve(s,'2026创新训练计划校内级别与省级国家级推荐是什么关系？',limit=4)
        assert hits[0]['id']==rows[0].id
        assert hits[0]['document_id']==rules.id
