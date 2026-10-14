import pytest
from scripts.verify_basic_facts import contains_facts,failure_stage


def test_never_join_unrelated_ocr_boxes_to_manufacture_fact():
    assert not contains_facts(['2026年2月11日','至3月20日16:00'],['2026年2月11日至3月20日16:00'])
    assert contains_facts(['2026 年 2 月 11 日至 3 月 20 日 16:00'],['2026年2月11日至3月20日16:00'])


@pytest.mark.parametrize('changes,expected', [
    ({'original_ok':False},'original_or_fixture_unverified'),
    ({'document_exists':False},'not_ingested'),
    ({'searchable':False},'partial_failed_or_not_publicly_searchable'),
    ({'chunks_ok':False},'parse_omission'),
    ({'chunks_ok':False,'ocr':True},'ocr_omission'),
    ({'retrieved_ok':False},'retrieval_omission'),
    ({'answer_ok':False},'answer_omission'),
    ({},'candidate_evidence_only'),
])
def test_failure_stages_and_candidate_not_answer_success(changes,expected):
    args=dict(original_ok=True,document_exists=True,searchable=True,chunks_ok=True,
              retrieved_ok=True,answer_ok=True,mode='evidence_fallback')
    assert failure_stage(**{**args,**changes})==expected
