import json
from app.generation_prompt import focused_messages, FOCUSED_ANSWER


def test_every_source_character_scope_and_exact_clock_retained_without_mutation():
    payload = {'question': '学校的校训是什么？', 'context_question': '学校的校训是什么？',
               'query_time': '2026-10-11T23:59:59.999999+08:00',
               'evidence': [{'id': 'E1', 'text': '受理后5个工作日；收到回复后寄送。\n例外：须先核实。',
                             'scope_uncertain': True, 'original_file_year': 2025}]}
    messages = [{'role': 'system', 'content': '禁止臆造；保留例外。'},
                {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
    before = json.dumps(messages)
    output = focused_messages(messages)
    assert json.dumps(messages) == before
    assert json.loads(output[1]['content']) == payload
    assert list(json.loads(output[1]['content']))[-1] == 'query_time'
    assert output[0]['content'].startswith(messages[0]['content'])
    assert output[0]['content'].endswith(FOCUSED_ANSWER)


def test_repair_feedback_is_not_rewritten_or_dropped():
    messages = [{'role': 'system', 'content': '约束'}, {'role': 'user', 'content': '{"evidence":[]}'},
                {'role': 'user', 'content': '请重查：阶段、例外、数字均须原文支持。'}]
    assert focused_messages(messages)[-1] == messages[-1]


def test_generic_user_messages_remain_supported():
    assert focused_messages([{'role': 'user', 'content': '测试'}]) == [{'role': 'user', 'content': '测试'}]


def test_procedures_exceptions_background_and_multiple_questions_keep_exact_prompts():
    for question in ['档案查询如何办理？', '普通话什么时候报名？', '申诉期间学校是否停止执行原决定？',
                     '学校的校训是什么，有什么含义？', '校训为什么是教学做合一？', '学校校训的由来是什么？',
                     '学生申请国家励志奖学金需要哪些条件？', '学校英文名称和简称是什么？']:
        messages = [{'role': 'system', 'content': '全部必要条件'},
                    {'role': 'user', 'content': json.dumps({'question': question, 'query_time': '完整时刻'})}]
        assert focused_messages(messages) == messages
