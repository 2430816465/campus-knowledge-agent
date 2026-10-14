"""Selected original chunks must still match after model wait, not just quotes."""
import json
from datetime import datetime, timezone

import pytest

from tests.test_campus_qa import factory, add
from app.campus_qa import campus_retrieve, revalidate_sources, campus_answer


@pytest.mark.parametrize('change', ['location', 'prefix', 'suffix', 'missing_location', 'missing_text'])
def test_preserved_quote_does_not_authorise_changed_chunk_input(change):
    with factory()() as session:
        doc, chunk = add(session, '档案查询无需到校。')
        row = {**campus_retrieve(session, '档案查询到校？')[0], 'quote': chunk.text}
        assert revalidate_sources(session, [row])
        if change == 'location':
            chunk.location = '网页段落 99 / 字符 1'
        elif change == 'prefix':
            chunk.text = '本段内容已调整。' + chunk.text
        elif change == 'suffix':
            chunk.text += '新增加补充条件。'
        elif change == 'missing_location':
            row.pop('location')
        else:
            row.pop('text')
        session.commit()
        assert not revalidate_sources(session, [row])


def test_truncated_quote_still_allowed_when_full_input_and_location_match():
    with factory()() as session:
        doc, chunk = add(session, '档案查询无需到校。可以通过线上办理。')
        row = {**campus_retrieve(session, '档案查询到校？')[0], 'quote': '档案查询无需到校。'}
        assert revalidate_sources(session, [row]) == [row]


@pytest.mark.parametrize('change', ['location', 'retained_quote_body'])
def test_changed_during_model_wait_returns_no_stale_source(monkeypatch, change):
    import app.campus_qa as qa
    with factory()() as session:
        doc, chunk = add(session, '档案查询无需到校。', title='档案查询指南')

        def generate(messages):
            if change == 'location':
                chunk.location = '网页段落 99 / 字符 1'
            else:
                chunk.text += '新增加补充条件。'
            session.commit()
            return {'message': {'content': json.dumps({'citations': [{'id': 'E1'}],
                    'explanation': [{'text': '档案查询无需到校。', 'ids': ['E1']}]})}}

        monkeypatch.setattr(qa, 'generate', generate)
        answer = campus_answer(session, '档案查询需要到校吗？', datetime.now(timezone.utc))
        assert answer['mode'] == 'insufficient_evidence'
        assert answer['sources'] == []
        assert '发生变化' in answer['answer']
