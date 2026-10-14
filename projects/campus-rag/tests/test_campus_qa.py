from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, Document, Chunk
from app.ingest import uid
from app.campus_qa import campus_retrieve, validate_generated_response, campus_answer, followup_question


def factory():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def test_colloquial_when_question_recalls_registration_time_with_no_topic_in_body():
    with factory()() as session:
        doc, rule = add(session, '考生报名时间：2026年10月12日14:00至10月14日14:00。',
                        title='2026年秋季普通话水平测试报名通知')
        session.add(Chunk(id=uid(), document_id=doc.id, text='测试费25元/人。', location='网页段落 2'))
        session.commit()
        for question in ['普通话什么时候报名？', '普通话何时报名？', '普通话什么时间报名？']:
            hits = campus_retrieve(session, question, limit=1)
            assert hits and hits[0]['id'] == rule.id
            assert hits[0]['text'] == rule.text
        assert not campus_retrieve(session, '2027年普通话什么时候报名？')


def test_explicit_notice_prefix_scopes_identity_without_dropping_question_fields():
    from app.campus_qa import document_identity_focus
    question='2026科研结项通知，高层次项目培育期已获省部级以上立项能自动结项吗？'
    assert document_identity_focus(question)=='2026科研结项通知'
    for q in ['不是科研结项通知，而是项目申报通知', '不要用科研结项通知，问申报时间',
              '高层次项目已经立项，是否自动结项？', '科研结项通知是否适用？']:
        assert document_identity_focus(q)==q


def test_long_notice_question_does_not_switch_to_application_news():
    with factory()() as session:
        doc,rule=add(session,'高层次培育项目在周期内获省部级以上立项，可自动结项，须提供相关证明。',
                     title='关于组织2026年校级科研项目结项考核工作的通知')
        news,_=add(session,'高层次项目培育期已获省部级以上立项，现组织申报。',
                   title='2026年高层次项目培育省部级项目立项申报通知')
        news.sha256='b'*64
        session.commit()
        hits=campus_retrieve(session,'2026科研结项通知，高层次项目培育期已获省部级以上立项能自动结项吗？',limit=1)
        assert hits and hits[0]['id']==rule.id


def test_annual_balance_preserves_missing_versions_and_multi_year_documents():
    from app.campus_qa import balance_annual
    rows = [('a', {'2025'}), ('b', {'2025'}), ('c', {'2026'}), ('d', {'2026'})]
    assert [r[0] for r in balance_annual(rows, {'2025', '2026', '2027'}, lambda r:r[1])] == ['a','c','b','d']
    combined = [('both', {'2025','2026'}), ('next', {'2026'})]
    assert balance_annual(combined, {'2025','2026'}, lambda r:r[1]) == combined


def test_body_field_can_reserve_detailed_rule_before_short_title_budget():
    with factory()() as session:
        for n in range(6):
            news,_=add(session,'按照国家奖学金评审实施细则，现公布推荐名单。',title='国家奖学金公示名单')
            news.sha256=f'{n+1:064x}'
        policy,rule=add(session,'德育素质得分须达到14分（含）以上。',title='本科学生国家奖学金评审实施细则')
        policy.sha256='b'*64
        private,_=add(session,'德育素质得分须达到99分。',title='国家奖学金德育要求',visibility='private')
        session.commit()
        hits=campus_retrieve(session,'国家奖学金德育分最低要求是多少？',limit=2)
        assert hits and hits[0]['id']==rule.id
        assert private.id not in {r['document_id'] for r in hits}


def test_generic_question_words_do_not_outweigh_actual_score_field():
    with factory()() as session:
        doc,rule=add(session,'德育素质得分在14分（含）以上。',title='国家奖学金评审实施细则')
        session.add(Chunk(id=uid(),document_id=doc.id,text='按照有关要求评审，具体要求以通知为准。',location='网页段落 2'))
        session.add(Chunk(id=uid(),document_id=doc.id,text=' | '.join(['德育素质得分：']*10),location='工作表 表格 行 1'))
        session.commit()
        hits=campus_retrieve(session,'国家奖学金德育分最低要求是多少？',limit=1)
        assert hits[0]['id']==rule.id


def test_colloquial_freshman_question_retrieves_grade_eligibility_not_application_steps():
    with factory()() as session:
        doc, rule = add(session, '国家奖学金用于奖励二年级（含）以上全日制本科在籍在校学生。',
                        title='本科学生国家奖学金评审实施细则')
        for i in range(8):
            session.add(Chunk(id=uid(), document_id=doc.id,
                text=f'申请国家奖学金的学生由学院审核，学校审定上报名单。流程{i}。',
                location=f'网页段落 {i+2}'))
        session.commit()
        for question in ['本科新生大一能申请国家奖学金吗？', '大二学生申请国家奖学金的年级条件是什么？']:
            hits = campus_retrieve(session, question, limit=1)
            assert hits and hits[0]['id'] == rule.id


def test_grade_query_expansion_does_not_invent_a_grade_requirement():
    with factory()() as session:
        doc, rule = add(session, '国家助学金用于资助家庭经济困难的全日制本科在籍在校学生。',
                        title='本科学生国家助学金评审实施细则')
        session.commit()
        hits = campus_retrieve(session, '大一新生能申请国家助学金吗？')
        assert hits and hits[0]['id'] == rule.id
        assert '二年级' not in hits[0]['text']


def test_grade_clause_identity_precedes_repeated_historical_joint_award_notice():
    with factory()() as session:
        doc, rule = add(session, '第二条 国家奖学金用于奖励二年级（含）以上全日制本科在籍在校学生。',
                        title='本科学生国家奖学金评审实施细则')
        old, _ = add(session, '国家奖学金用于奖励二年级以上本科在籍在校学生，学生申请后由学院审核。',
                     title='2021年国家奖学金、国家励志奖学金、校长奖学金评审通知')
        old.sha256 = 'b'*64
        for i in range(5):
            session.add(Chunk(id=uid(), document_id=old.id,
                text=f'新生申请国家奖学金步骤{i}，二年级学生申请奖学金由学院审核。',
                location=f'网页段落 {i+2}'))
        session.commit()
        assert campus_retrieve(session, '本科新生大一能申请国家奖学金吗？', limit=1)[0]['id'] == rule.id
        # Explicit historical requests retain the existing annual boundary.
        assert all(x['document_id'] == old.id for x in campus_retrieve(
            session, '2021年本科新生大一能申请国家奖学金吗？'))


def test_requested_person_count_does_not_promote_other_numeric_fields():
    with factory()() as session:
        doc,people=add(session,'召集不少于5人的受理小组。',title='学生申诉工作规定')
        session.add(Chunk(id=uid(),document_id=doc.id,text='受理小组在3日内决定是否受理。',location='网页段落 2'))
        session.add(Chunk(id=uid(),document_id=doc.id,text='受理小组以书面形式处理，受理小组按照程序询问。',location='网页段落 3'))
        session.commit()
        assert campus_retrieve(session,'学生申诉受理小组最少需要几人？',limit=1)[0]['id']==people.id


def test_body_fields_do_not_mix_named_funding_programs():
    with factory()() as session:
        aid,rule=add(session,'德育得分12分以上，大一新生除外。',title='本科学生国家助学金评审实施细则')
        other,_=add(session,'德育得分12分以上，学院审核，二年级学生可申请。',title='国家励志奖学金评选通知')
        other.sha256='b'*64
        session.commit()
        hits=campus_retrieve(session,'国家助学金德育分要求多少，大一是否例外？',limit=4)
        assert hits and {r['document_id'] for r in hits}=={aid.id}
        assert hits[0]['id']==rule.id


def test_deadline_body_probe_does_not_promote_large_project_lists():
    with factory()() as session:
        doc,date=add(session,'各学院5月22日前提交项目推荐材料。',title='2026年创新训练计划立项申报通知')
        for n in range(5):
            other,_=add(session,'学院项目拟推荐名单：材料创新、材料开发。',title='2026年创新训练计划项目推荐名单')
            other.sha256=f'{n+1:064x}'
        session.commit()
        assert campus_retrieve(session,'2026年创新训练计划学院推荐材料截止日期是什么？',limit=1)[0]['id']==date.id


def test_deadline_comparison_finds_dated_pdf_bodies_before_download_labels():
    with factory()() as session:
        originals = {}
        for year, day in [('2025','20'), ('2026','22')]:
            title = f'关于组织申报{year}年大学生创新训练计划立项工作的通知'
            shell, _ = add(session, title+'及附件.zip', title)
            shell.sha256 = (year[-1]*64)
            pdf, date = add(session, f'各学院请于 {year} 年 5 月 {day} 日前提交推荐表。', title+' / 通知.pdf')
            pdf.sha256 = ('a' if year=='2025' else 'b')*64
            pdf.parent_id = shell.id
            date.location = '第 2 页 / 段落 13 / 字符 1'
            session.commit()
            originals[year] = pdf.id
        hits = campus_retrieve(session, '2025年与2026年大学生创新训练计划的申报截止日期分别是什么？', limit=2)
        assert {h['document_id'] for h in hits} == set(originals.values())
        assert all('日前' in h['text'] for h in hits)


def test_repeated_one_year_copies_do_not_displace_other_year_deadline():
    with factory()() as session:
        other = None
        for index, year in enumerate(['2025']*6+['2026']):
            doc, _ = add(session, f'各学院请于 {year} 年 5 月 {index+10} 日前提交推荐表。',
                         title=f'{year}年大学生创新训练计划立项申报通知')
            doc.sha256 = f'{index+1:064x}'
            if year=='2026': other=doc.id
        session.commit()
        hits = campus_retrieve(session,'2025年与2026年大学生创新训练计划申报最晚什么时候提交？',limit=2)
        assert len(hits)==2 and other in {h['document_id'] for h in hits}


def test_annual_comparison_does_not_reserve_private_or_missing_evidence():
    with factory()() as session:
        doc, _ = add(session,'各学院请于2025年5月20日前提交推荐表。',title='2025年大学生创新训练计划申报通知')
        parent, _ = add(session,'下载通知.pdf',title='2026年大学生创新训练计划申报通知',visibility='private')
        private_child, _ = add(session,'各学院请于2026年5月22日前提交推荐表。',title='2026年大学生创新训练计划申报通知 / 通知.pdf')
        private_child.parent_id=parent.id
        private_child.sha256='b'*64
        session.commit()
        hits=campus_retrieve(session,'2025年与2026年大学生创新训练计划申报截止日期分别是什么？',limit=2)
        assert hits and {h['document_id'] for h in hits} == {doc.id}


def add(session, text, title='档案查询', visibility='public', status='pending_review'):
    doc = Document(id=uid(), title=title, sha256='a'*64, raw_name='x.html', mime='.html',
                   source_url='https://www.njxzc.edu.cn/test.htm', kind='knowledge', visibility=visibility, status=status)
    session.add(doc);session.flush()
    chunk = Chunk(id=uid(), document_id=doc.id, text=text, location='网页段落 1')
    session.add(chunk);session.commit()
    return doc, chunk


def test_general_retrieval_excludes_private_withdrawn_and_duplicate_text():
    with factory()() as session:
        add(session, '档案查询无需到校，通过电子邮件申请。')
        add(session, '档案查询无需到校，通过电子邮件申请。', title='档案查阅业务')
        add(session, '档案查询无需到校，秘密地址。', visibility='private')
        add(session, '档案查询已撤回。', status='withdrawn')
        hits = campus_retrieve(session, '档案查询需要到校吗？')
        assert len(hits) == 1
        assert '通过电子邮件' in hits[0]['text']


def test_claims_need_exact_quotes_valid_ids_and_no_invented_numbers_links():
    evidence = [{'id':'a', 'text':'业务受理后5个工作日内办理。'}]
    response = {'citations':[{'id':'a', 'quote':'业务受理后5个工作日内办理。'}, {'id':'bad', 'quote':'伪造引用'}],
                'explanation':[{'text':'受理后5个工作日内办理。', 'ids':['a']},
                               {'text':'需要3个工作日。', 'ids':['a']},
                               {'text':'立即办理。', 'ids':['unknown']},
                               {'text':'去 https://evil.example 提交。', 'ids':['a']}]}
    selected, claims = validate_generated_response(response, evidence)
    assert len(selected) == 1
    assert claims == [{'text':'受理后5个工作日内办理。', 'ids':['a']}]


def test_fallback_and_model_no_evidence_are_distinct(monkeypatch):
    import app.campus_qa as module
    with factory()() as session:
        add(session, '档案查询无需到校，通过电子邮件申请。')
        fallback = campus_answer(session, '档案查询到校？', datetime.now(timezone.utc), use_model=False)
        assert fallback['mode'] == 'evidence_fallback'
        monkeypatch.setattr(module, 'generate', lambda _: {'message':{'content':'{"citations":[],"explanation":[]}'}})
        result = campus_answer(session, '档案查询到校？', datetime.now(timezone.utc))
        assert result['mode'] == 'insufficient_evidence' and not result['sources']


def test_new_topic_does_not_implicitly_inherit_history():
    assert followup_question('那需要什么材料？')
    assert not followup_question('图书馆开放时间？')
    assert not followup_question('还有图书馆开放时间？')


def test_campus_followup_keeps_only_authorized_documents(monkeypatch):
    import app.campus_qa as module
    captured = {}
    def fake_retrieve(session, question, limit=6, document_ids=None):
        captured.update(question=question, ids=document_ids)
        return []
    monkeypatch.setattr(module, 'campus_retrieve', fake_retrieve)
    campus_answer(None, '那多久办好？', datetime.now(timezone.utc),
                  history=[{'document_ids':['doc-1'], 'question':'档案查询'}])
    assert captured == {'question':'档案查询 那多久办好？', 'ids':['doc-1']}


def test_current_followup_year_replaces_old_year_and_scope(monkeypatch):
    import app.campus_qa as module
    captured = {}
    def fake_retrieve(session, question, limit=6, document_ids=None):
        captured.update(question=question, ids=document_ids)
        return []
    monkeypatch.setattr(module, 'campus_retrieve', fake_retrieve)
    campus_answer(None, '那2027年呢？', datetime.now(timezone.utc),
                  history=[{'document_ids':['old'], 'question':'2026年普通话报名时间'}])
    assert '2026' not in captured['question'] and '2027年' in captured['question']
    assert captured['ids'] is None


def test_model_receives_short_facts_and_checks_only_transmitted_quote(monkeypatch):
    import app.campus_qa as module
    import json
    row = dict(id='short', text='校训是教学做合一。', title='学校章程', document_id='doc',
               context='第一章 总则', location='网页段落 3 / 字符 1', warnings=[], url='https://www.njxzc.edu.cn/x.htm')
    long = {**row, 'id':'long', 'text':'公开说明'*230 + '未发送尾部', 'document_id':'doc2'}
    monkeypatch.setattr(module, 'campus_retrieve', lambda *a, **k: [row, long])
    def model(messages):
        sent = json.loads(messages[1]['content'])['evidence']
        assert sent[0]['text'] == row['text'] and sent[0]['context'] == row['context']
        assert '未发送尾部' not in sent[1]['text']
        return {'message':{'content':json.dumps({'citations':[{'id':sent[0]['id']},
                                                                {'id':'not-transmitted'}],
                                                'explanation':[]})}}
    monkeypatch.setattr(module, 'generate', model)
    result = campus_answer(None, '校训是什么？', datetime.now(timezone.utc))
    assert [s['id'] for s in result['sources']] == ['short']


def test_topic_identity_precedes_global_chunk_limit_and_generic_titles():
    with factory()() as session:
        for _ in range(4):
            add(session, '报名通知另行安排。', title='报名')
        old, _ = add(session, '普通话测试起止时间历史说明。', title='2025年普通话通知')
        session.add_all([Chunk(id=uid(), document_id=old.id, text='普通话测试起止时间历史说明。',
                              location=f'网页段落 {i} / 字符 1') for i in range(510)])
        target, _ = add(session, '10月12日14时开始，10月14日14时截止。', title='2026年秋季普通话水平测试报名通知')
        target.sha256 = 'b'*64
        session.commit()
        hits = campus_retrieve(session, '2026年秋季普通话测试报名起止时间？')
        assert hits and hits[0]['document_id'] == target.id


def test_explicit_year_does_not_use_other_dated_notice():
    with factory()() as session:
        add(session, '普通话测试报名10月12日开始。', title='2026年普通话报名通知')
        assert not campus_retrieve(session, '2027年普通话报名时间？')


def test_section_subject_is_returned_as_separate_source_context():
    with factory()() as session:
        doc, heading = add(session, '第二章 学生', title='学校章程')
        heading.location = '网页段落 10 / 字符 1'
        body = Chunk(id=uid(), document_id=doc.id, text='可以对学校给予的处分提出申诉。',
                     location='网页段落 11 / 字符 1')
        session.add(body);session.commit()
        hits = campus_retrieve(session, '章程规定学生可以提出申诉吗？')
        hit = next(s for s in hits if s['id'] == body.id)
        assert hit['context'] == '第二章 学生'
        assert hit['text'] == body.text


def test_complete_article_does_not_leak_facts_into_later_articles():
    with factory()() as session:
        doc, fact = add(session, '第二条 学校英文译名为 Nanjing Xiaozhuang University，英文缩写为 NJXZU。', title='学校章程')
        fact.location = '网页段落 2 / 字符 1'
        other = Chunk(id=uid(), document_id=doc.id, text='第三条 学校为公办全日制普通本科高等学校。',
                      location='网页段落 3 / 字符 1')
        session.add(other);session.commit()
        hits = campus_retrieve(session, '学校章程中的英文名称和简称是什么？')
        assert hits[0]['id'] == fact.id
        assert not any('NJXZU' in hit['context'] for hit in hits)


def test_comparison_retrieves_both_periods_without_propagating_step_facts():
    with factory()() as session:
        doc, heading = add(session, '（一）日常查询', title='档案查询利用通告')
        heading.location = '网页段落 1 / 字符 1'
        for paragraph, text in [(2, '业务受理后5个工作日内返回电子材料。'),
                                (3, '（二）寒暑假查询'),
                                (4, '1. 发送电子邮件申请，提供毕业证书扫描件。'),
                                (5, '2. 邮箱查收。收到邮件后一周内发送电子材料。'),
                                (6, '3. 拨打电话咨询。')]:
            session.add(Chunk(id=uid(), document_id=doc.id, text=text,
                              location=f'网页段落 {paragraph} / 字符 1'))
        session.commit()
        hits = campus_retrieve(session, '档案查询在平时和寒暑假的电子材料办理时效有什么区别？', limit=4)
        joined = ''.join(hit['text'] for hit in hits)
        assert '5个工作日' in joined and '一周内' in joined
        phone = next((hit for hit in hits if '拨打电话' in hit['text']), None)
        assert not phone or '一周内' not in phone['context']


def test_model_selects_id_but_source_quote_is_copied_by_server(monkeypatch):
    import app.campus_qa as module
    import json
    row = dict(id='original-chunk', text='如需纸制材料，请在顺丰小程序上自行下单。', title='档案查询',
               document_id='doc', context='（一）日常业务', location='网页段落 3 / 字符 1',
               warnings=[], url='https://www.njxzc.edu.cn/a.htm')
    monkeypatch.setattr(module, 'campus_retrieve', lambda *a, **k: [row])
    def model(messages):
        assert json.loads(messages[1]['content'])['evidence'][0]['id'] == 'E1'
        return {'message':{'content':json.dumps({'citations':[{'id':'E1','quote':'被改写的原文'}],
                     'explanation':[{'text':'申请人自行下单。','ids':['E1']}]})}}
    monkeypatch.setattr(module, 'generate', model)
    result = campus_answer(None, '快递谁下单？', datetime.now(timezone.utc))
    assert result['sources'][0]['id'] == row['id']
    assert result['sources'][0]['quote'] == row['text']
    assert result['explanation'][0]['ids'] == [row['id']]


def test_student_question_does_not_retrieve_staff_chapter_as_student_rule():
    with factory()() as session:
        doc, heading = add(session, '第二章 学生', title='学校章程')
        heading.location = '网页段落 1 / 字符 1'
        for i, text in [(2,'学生可以对处分提出申诉。'), (3,'第三章 教职工'),
                        (4,'可以就职务评聘福利待遇提出申诉。')]:
            session.add(Chunk(id=uid(), document_id=doc.id, text=text, location=f'网页段落 {i} / 字符 1'))
        session.commit()
        hits = campus_retrieve(session, '学校章程规定学生可以提出申诉吗？')
        assert hits and all('教职工' not in r['context'] for r in hits)


def test_notice_year_labels_are_allowed_but_not_inferred_dates_or_headcounts():
    evidence = [{'id':'fee','title':'2026年秋季普通话测试报名通知','text':'测试费25元/人。'}]
    parsed = {'citations':[{'id':'fee','quote':'测试费25元/人。'}],
              'explanation':[{'text':'2026年秋季普通话测试费25元/人。','ids':['fee']},
                             {'text':'2026人参加测试。','ids':['fee']},
                             {'text':'2027年测试费25元。','ids':['fee']},
                             {'text':'2026年10月报名。','ids':['fee']}]}
    _, claims = validate_generated_response(parsed,evidence)
    assert [c['text'] for c in claims] == ['2026年秋季普通话测试费25元/人。']


def test_negated_years_and_cohorts_do_not_authorize_another_notice():
    from app.campus_qa import requested_years
    assert requested_years('2024年培训报名，我问的是2024年，不是2026年。') == {'2024'}
    assert requested_years('2027年能参加吗？我是2026级。') == {'2027'}
    with factory()() as session:
        add(session, '培训报名在十月截止。', title='2026年培训报名通知')
        assert not campus_retrieve(session, '查2024年培训报名，不是2026年。')


def test_undated_attachment_requires_matching_annual_parent_and_live_access():
    with factory()() as session:
        parent, _ = add(session, '考试报名安排。', title='2026年考试报名通知')
        attachment, _ = add(session, '考试报名费用25元，付款后有效。', title='考试报名操作指南')
        attachment.parent_id = parent.id
        attachment.sha256 = 'b'*64
        session.commit()
        assert not campus_retrieve(session, '2027年考试报名费用？')
        assert campus_retrieve(session, '2026年考试报名费用？')
        parent.status = 'withdrawn'; session.commit()
        assert not campus_retrieve(session, '考试报名费用？')


def test_discourse_prefix_with_an_explicit_new_service_resets_history(monkeypatch):
    import app.campus_qa as module
    calls = []
    def retrieve(session, question, limit=6, document_ids=None):
        calls.append((question, document_ids))
        if len(calls) == 1:
            return [{'document_id':'archive', 'identity_score':.5}]
        return []
    monkeypatch.setattr(module, 'campus_retrieve', retrieve)
    campus_answer(None, '那线上档案查询能开英文材料吗？', datetime.now(timezone.utc),
                  history=[{'question':'普通话考试地点？','document_ids':['speech']}])
    assert calls[-1][1] is None
    assert '普通话' not in calls[-1][0]


def test_long_comparison_keeps_both_delivery_scopes_in_first_four():
    with factory()() as session:
        doc, heading = add(session, '（一）日常业务办理', title='关于线上办理档案查询利用业务的通告')
        heading.location = '网页段落 1 / 字符 1'
        for i, text in [(2,'如需纸制材料，收到电子材料回复后自行下单。'),
                        (3,'（二）假期业务办理'),
                        (4,'寒、暑假期间，仅提供档案的电子版。'),
                        (5,'服务咨询时间日常为工作日，寒暑假为每周四。')]:
            session.add(Chunk(id=uid(),document_id=doc.id,text=text,location=f'网页段落 {i} / 字符 1'))
        session.commit()
        hits = campus_retrieve(session, '这份线上档案通告中，日常和寒暑假对纸制材料的提供方式有什么区别？请分别说明。',limit=4)
        assert any('自行下单' in r['text'] for r in hits)
        assert any('仅提供档案的电子版' in r['text'] for r in hits)
        assert '自行下单' in hits[0]['text']
        assert '仅提供档案的电子版' in hits[1]['text']


def test_field_lookup_ignores_title_word_bridges_and_finds_personal_schedule_limit():
    with factory()() as session:
        doc, fee = add(session, '普通话测试费用25元。', title='2026年普通话水平测试报名通知')
        fee.location = '网页段落 1 / 字符 1'
        session.add(Chunk(id=uid(),document_id=doc.id,text='测试时间安排在十月份底，具体场次以准考证为准。',
                          location='网页段落 2 / 字符 1'))
        session.commit()
        hits = campus_retrieve(session, '2026年普通话测试，能确定我被分到哪一天哪一场吗？')
        assert '准考证' in hits[0]['text']


def test_numeric_spacing_in_original_does_not_block_faithful_cohort_explanation():
    evidence = [{'id':'cohort','text':'202 3 级、202 4 级、202 5 级在籍本科生。'}]
    parsed = {'citations':[{'id':'cohort','quote':evidence[0]['text']}],
              'explanation':[{'text':'通知列明2023、2024、2025级在籍本科生。','ids':['cohort']}]}
    selected, claims = validate_generated_response(parsed,evidence)
    assert selected[0]['quote'] == evidence[0]['text']
    assert len(claims) == 1


def test_specific_service_beats_frequent_student_identity_titles():
    with factory()() as session:
        guide, _ = add(session, '学籍档案查阅材料仅限中文版，不含应届毕业生。',title='关于线上办理档案查询利用业务的通告')
        for i in range(8):
            other, _ = add(session, '户籍迁移请到保卫处核实。', title=f'关于{2020+i}年应届毕业生户籍迁移工作的通知')
            other.sha256 = str(i)*64
        session.commit()
        hits = campus_retrieve(session, '那线上档案查询能给应届毕业生开英文成绩表吗？')
        assert hits and hits[0]['document_id'] == guide.id
        from app.campus_qa import explicit_new_topic
        assert explicit_new_topic(session, '那线上档案查询能开英文成绩表吗？','普通话测试地点？')
        assert not explicit_new_topic(session, '那需要什么材料？','线上档案查询？')


def test_general_organization_duty_cannot_become_appeal_handling_authority():
    evidence = [{'id':'governance','text':'各组织机构可以分设专门委员会，依据授权或章程履行职责。'}]
    parsed = {'citations':[{'id':'governance','quote':evidence[0]['text']}],
              'explanation':[{'text':'各组织机构具体受理申诉事务。','ids':['governance']}]}
    _, claims = validate_generated_response(parsed, evidence)
    assert not claims


def test_public_attachment_of_unparseable_public_source_is_searchable_with_annual_parent():
    with factory()() as session:
        parent, _ = add(session, '原文是图片。', title='2026年考试报名通知', status='parse_failed')
        child, _ = add(session, '考试报名费用25元，付款后有效。', title='考试报名指南')
        child.parent_id, child.sha256 = parent.id, 'b'*64
        session.commit()
        assert campus_retrieve(session, '2026年考试报名费用？')
        assert not campus_retrieve(session, '2027年考试报名费用？')
        parent.visibility = 'private'; session.commit()
        assert not campus_retrieve(session, '考试报名费用？')


def test_attachment_ancestor_chain_cannot_skip_revoked_grandparent():
    with factory()() as session:
        grand, _ = add(session, '原文。', title='考试报名', status='withdrawn')
        parent, _ = add(session, '原文图片。', title='考试报名表', status='parse_failed')
        child, _ = add(session, '考试报名费用25元。', title='考试报名指南')
        parent.parent_id, child.parent_id = grand.id, parent.id
        session.commit()
        assert not campus_retrieve(session, '考试报名费用？')


def test_cohort_title_does_not_override_explicit_annual_parent():
    with factory()() as session:
        parent, _ = add(session, '原文图片。', title='2026年考试报名通知', status='parse_failed')
        child, _ = add(session, '考试报名费用25元。', title='2023级考试报名指南')
        child.parent_id, child.sha256 = parent.id, 'b'*64
        session.commit()
        assert campus_retrieve(session, '2026年考试报名费用？')
        assert not campus_retrieve(session, '2023年考试报名费用？')


def test_sources_are_rechecked_after_model_wait_and_withdrawn_parent_is_not_returned(monkeypatch):
    import app.campus_qa as module
    import json
    with factory()() as session:
        parent, _ = add(session, '原文图片。', title='档案查询通知', status='parse_failed')
        doc, _ = add(session, '档案查询无需到校。', title='档案查询指南')
        doc.parent_id = parent.id; session.commit()
        def model(messages):
            parent.status = 'withdrawn'; session.commit()
            return {'message': {'content': json.dumps({'citations':[{'id':'E1'}], 'explanation':[]})}}
        monkeypatch.setattr(module, 'generate', model)
        result = campus_answer(session, '档案查询需要到校吗？', datetime.now(timezone.utc))
        assert result['mode'] == 'insufficient_evidence' and result['sources'] == []


def test_changed_chunk_or_provenance_cannot_reuse_selected_quote():
    from app.campus_qa import revalidate_sources
    with factory()() as session:
        doc, chunk = add(session, '档案查询无需到校。')
        row = {**campus_retrieve(session, '档案查询到校？')[0], 'quote':chunk.text}
        assert revalidate_sources(session, [row])
        chunk.text = '档案查询规则已修订。'; session.commit()
        assert not revalidate_sources(session, [row])
        chunk.text = row['quote']; doc.source_url = 'https://www.njxzc.edu.cn/replaced.htm'; session.commit()
        assert not revalidate_sources(session, [row])


def test_requested_year_cannot_promote_unrelated_deadline_or_eligibility_notice():
    with factory()() as session:
        speech, _ = add(session, '普通话测试报名在10月截止，测试费25元。', title='2026年秋季普通话水平测试报名通知')
        for year in (2025, 2027):
            unrelated, _ = add(session, '受理信访截止时间为10月31日，本科生材料另行核实。',
                title=f'{year}年巡察公告')
            unrelated.sha256 = str(year)*16
        session.commit()
        assert not campus_retrieve(session, '2025年秋季普通话水平测试报名截止时间？不是2026年。')
        assert not campus_retrieve(session, '2027年秋季普通话测试多少钱，2026级本科生能报吗？')
        assert campus_retrieve(session, '2026年秋季普通话报名截止时间？')


def test_explanation_cannot_move_a_holiday_application_into_daily_scope():
    evidence = [{'id':'day','text':'如需纸制材料，收到电子材料回复后自行下单。','context':'（一）日常业务'},
                {'id':'holiday','text':'发送电子邮件进行业务申请。','context':'（二）假期业务'}]
    parsed = {'citations':[{'id':r['id'],'quote':r['text']} for r in evidence],
        'explanation':[{'text':'日常业务需发送电子邮件申请并自行下单。','ids':['day','holiday']},
                       {'text':'日常业务如需纸制材料，收到电子材料回复后自行下单。','ids':['day']},
                       {'text':'日常业务纸制材料自行下单；假期业务发送电子邮件申请。','ids':['day','holiday']}]}
    _,claims=validate_generated_response(parsed,evidence)
    assert len(claims)==2 and claims[0]['ids']==['day']


def test_staff_chapter_cannot_prove_student_claim_even_if_committee_has_student_representative():
    row={'id':'staff','text':'学生代表参与教职工申诉处理委员会。','context':'第三章 教职工'}
    _,claims=validate_generated_response({'citations':[{'id':'staff','quote':row['text']}],
        'explanation':[{'text':'学生申诉由该委员会处理。','ids':['staff']}]},[row])
    assert not claims


def test_both_periods_explicit_in_hours_quote_can_support_each_period():
    row={'id':'both','text':'咨询时间日常为工作日，寒暑假为每周四。','context':'（二）假期业务'}
    _,claims=validate_generated_response({'citations':[{'id':'both','quote':row['text']}],
        'explanation':[{'text':'日常咨询时间为工作日。','ids':['both']}]},[row])
    assert len(claims)==1
