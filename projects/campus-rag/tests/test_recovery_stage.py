import copy
import pytest
from scripts.recovery_stage import stage_page


def doc():
    return dict(id='one', sha256='a'*64, source_url='https://www.njxzc.edu.cn/a.pdf', parent_id='parent', version=1, checked_at='2026-10-11', status='partial_parse', visibility='public')


def ocr():
    return dict(original_sha256='a'*64, original_page=21, coordinate_system='render pixels, origin top-left', render_scale=1.5, boxes=[dict(box=[[1,1],[2,1],[2,2],[1,2]], text='日期：', confidence=.9)])


def test_deterministic_binding_and_no_mutation_or_publication():
    d, e = doc(), ocr()
    before = copy.deepcopy((d,e))
    first = stage_page(d,e)
    assert first == stage_page(d,e)
    assert (d,e) == before
    assert not first['production_applicable'] and not first['publication_requested']
    assert first['review_required'] and first['expected_document']['status'] == 'partial_parse'
    first['evidence']['boxes'][0]['text'] = 'changed'
    assert e['boxes'][0]['text'] == '日期：'


def test_shared_content_retains_distinct_sources_and_cas_state():
    d, e = doc(), ocr()
    a = stage_page(d,e)
    d.update(id='two', source_url='https://www.njxzc.edu.cn/b.pdf', version=2)
    b = stage_page(d,e)
    assert a['content_key'] == b['content_key']
    assert a['staging_key'] != b['staging_key']
    assert b['expected_document']['version'] == 2


def test_independent_boxes_never_join_dates_or_fill_empty_fields():
    e = ocr()
    e['boxes'].append(dict(box=[[4,1],[5,1],[5,2],[4,2]], text='2026年', confidence=.8))
    result = stage_page(doc(),e)
    assert [b['text'] for b in result['independent_ocr_blocks']] == ['日期：','2026年']
    assert result['independent_ocr_blocks'][1]['location'] == '第 21 页 / OCR 框 2'


def test_input_cannot_override_original_page_location():
    e = ocr()
    e['boxes'][0]['location'] = '第 1 页 / invented'
    assert stage_page(doc(), e)['independent_ocr_blocks'][0]['location'] == '第 21 页 / OCR 框 1'


@pytest.mark.parametrize('change', [dict(status='published'), dict(status='pending_review'), dict(sha256='b'*64), dict(source_url='file:///a.pdf'), dict(version=0), dict(visibility='unknown')])
def test_reject_unsafe_document_binding(change):
    d = doc(); d.update(change)
    with pytest.raises(ValueError): stage_page(d,ocr())


@pytest.mark.parametrize('change', [dict(original_page=True), dict(original_page=0), dict(coordinate_system='unknown'), dict(render_scale=float('inf'))])
def test_reject_ambiguous_evidence(change):
    e = ocr(); e.update(change)
    with pytest.raises(ValueError): stage_page(doc(),e)


@pytest.mark.parametrize('change', [dict(confidence=float('nan')), dict(confidence=1.1), dict(box=[[1,2]]), dict(text='')])
def test_reject_invalid_box(change):
    e = ocr(); e['boxes'][0].update(change)
    with pytest.raises(ValueError): stage_page(doc(),e)


def test_text_layer_keeps_geometry_without_creating_table_fact_chunks():
    e = dict(original_sha256='a'*64, original_page=303, text_layer='表', coordinate_system='PDF points, origin bottom-left', characters=[dict(index=0,text='表',box=[1,1,2,2])])
    result = stage_page(doc(),e)
    assert result['layout_review_required']
    assert result['independent_ocr_blocks'] == []
    e['characters'][0]['box'] = [2,1,1,2]
    with pytest.raises(ValueError): stage_page(doc(),e)
