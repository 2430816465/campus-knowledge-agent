import json
from datetime import datetime, timezone

import pytest

from app.duration_boundaries import duration_origin_issues
from app.campus_qa import validate_generated_response


SOURCE = '复查小组自收到书面申请之日起12日内作出复查结论。情况复杂时，可以延长12日内完成。'


@pytest.mark.parametrize('claim,rejected', [
    ('复查小组在12日内作出结论。', True),
    ('复查小组自收到书面申请之日起12日内作出结论。', False),
    ('从收到书面申请当日起12天内作出结论。', False),
    ('自提交书面申请之日起12日内作出结论。', True),
    ('自收到口头申请之日起12日内作出结论。', True),
    ('自收到书面申请之日起12日内完成；另在12日内答复。', True),
    ('情况复杂时可延长12日内完成。', False),
    ('12日内复查，情况复杂时可延长12日内完成。', True),
    ('复查小组负责复查。', False),
])
def test_each_event_relative_period_keeps_its_own_start(claim, rejected):
    assert bool(duration_origin_issues(claim, SOURCE)) == rejected
    parsed = {'citations': [{'id': 'E1', 'quote': SOURCE}],
              'explanation': [{'text': claim, 'ids': ['E1']}]}
    assert bool(validate_generated_response(parsed, [{'id': 'E1', 'text': SOURCE}])[1]) != rejected


@pytest.mark.parametrize('claim,source,rejected', [
    ('12日内答复。', '12日内答复。', False),
    ('报名12日内完成。', '自收到申请之日起7日内答复；报名12日内完成。', False),
    ('自收到申请之日起12个工作日内答复。', '自收到申请之日起12工作日内答复。', False),
    ('12工作日内答复。', '自收到申请之日起12个工作日内答复。', True),
    ('12日内完成。', '自收到申请之日起12工作日内答复。', True),
    ('延长12日内完成。', '自收到申请之日起12日内答复。', True),
    ('自收到申请之日起十二日内答复。', '自收到申请之日起十二日内答复。', False),
    ('自 收到申请 之日起 12 日内答复。', '自收到申请之日起12日内答复。', False),
])
def test_scope_and_literal_recognition_boundaries(claim, source, rejected):
    # Different numbers remain outside this narrow check. This does not prove
    # that the action, exception or all other conditions are supported.
    assert bool(duration_origin_issues(claim, source)) == rejected


@pytest.mark.parametrize('claim,source,rejected', [
    ('12个工作日内答复。', '12日内答复。', True),
    ('自收到申请之日起12工作日内答复。', '自收到申请之日起12日内答复。', True),
    ('自收到申请之日起12日内答复。', '自收到申请之日起12工作日内答复。', True),
    ('12天以内答复。', '12日内答复。', False),
    ('12工作日内答复。', '12个工作日以内答复。', False),
    ('12日内复查。', '首次办理12工作日内完成，复查12日内完成。', False),
    ('12日内完成。', '自收到申请之日起7工作日内答复。', False),
    ('12日内完成。', '办理规定。', False),
])
def test_day_unit_must_have_literal_cited_support(claim, source, rejected):
    issues = duration_origin_issues(claim, source)
    assert ('duration_day_unit_changed' in issues) == rejected
    parsed = {'citations': [{'id': 'E1', 'quote': source}],
              'explanation': [{'text': claim, 'ids': ['E1']}]}
    if rejected:
        assert not validate_generated_response(parsed, [{'id': 'E1', 'text': source}])[1]


@pytest.mark.parametrize('corrected', [True, False])
def test_unit_correction_shares_the_existing_single_retry(monkeypatch, corrected):
    import app.campus_qa as qa
    source = '办公室12个工作日内答复。'
    row = dict(id='raw', document_id='doc', text=source, title='申请办理规定',
               url='https://jwc.njxzc.edu.cn/example.htm', location='网页段落1', warnings=[])
    monkeypatch.setattr(qa, 'campus_retrieve', lambda *a, **k: [row])
    calls = []

    def generate(messages):
        calls.append(messages)
        claim = source if corrected and len(calls) == 2 else '办公室12日内答复。'
        return {'message': {'content': json.dumps({'citations': [{'id': 'E1'}],
                'explanation': [{'text': claim, 'ids': ['E1']}]})}}

    monkeypatch.setattr(qa, 'generate', generate)
    answer = qa.campus_answer(None, '办公室的答复期限是什么？', datetime.now(timezone.utc))
    assert len(calls) == 2 and len(calls[1]) == 3
    assert '不能互换日与工作日' in calls[1][-1]['content']
    assert answer['model']['duration_repair_attempted']
    assert bool(answer['explanation']) == corrected
    assert answer['sources'][0]['quote'] == source


@pytest.mark.parametrize('corrected', [True, False])
def test_one_shared_repair_then_literal_fallback(monkeypatch, corrected):
    import app.campus_qa as qa
    source = '办公室自收到书面申请之日起12日内答复。'
    row = dict(id='raw', document_id='doc', text=source, title='申请办理规定',
               url='https://jwc.njxzc.edu.cn/example.htm', location='网页段落1', warnings=[])
    monkeypatch.setattr(qa, 'campus_retrieve', lambda *a, **k: [row])
    calls = []

    def generate(messages):
        calls.append(messages)
        claim = source if corrected and len(calls) == 2 else '办公室12日内答复。'
        return {'message': {'content': json.dumps({'citations': [{'id': 'E1'}],
                'explanation': [{'text': claim, 'ids': ['E1']}]})}}

    monkeypatch.setattr(qa, 'generate', generate)
    answer = qa.campus_answer(None, '办公室的答复期限是什么？', datetime.now(timezone.utc))
    assert len(calls) == 2
    assert calls[1][:2] == calls[0] and len(calls[1]) == 3
    assert '起算事件' in calls[1][-1]['content']
    assert answer['model']['duration_repair_attempted'] is True
    assert bool(answer['explanation']) == corrected
    assert answer['sources'][0]['quote'] == source
    assert answer['mode'] == ('grounded_explanation' if corrected else 'local_model_evidence')
