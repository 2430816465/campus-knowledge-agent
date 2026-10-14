import copy
import pytest
from app.source_scope import eligibility, title_years, publication_year


def doc(status='pending_review', visibility='public', parent_id=None, title='通知', published_at=None):
    return {'status': status, 'visibility': visibility, 'parent_id': parent_id,
            'title': title, 'published_at': published_at}


@pytest.mark.parametrize('status', ['pending_review', 'published'])
def test_public_root_is_eligible_without_parent(status):
    result = eligibility('root', {'root': doc(status=status)})
    assert result['eligible'] and result['reason'] == 'eligible'
    assert result['ancestor_ids'] == [] and result['year_evidence'] == []


@pytest.mark.parametrize('status', ['parse_failed', 'partial_parse', 'converted', 'withdrawn', 'superseded', 'pending', None])
def test_child_must_be_searchable_pending_review_or_published(status):
    result = eligibility('child', {'child': doc(status=status)})
    assert not result['eligible'] and result['reason'] == 'document_state_not_allowed'


@pytest.mark.parametrize('status', ['pending_review', 'published', 'parse_failed', 'partial_parse', 'converted'])
def test_public_original_source_shells_remain_valid_ancestors(status):
    metadata = {'child': doc(parent_id='parent'), 'parent': doc(status=status, parent_id='root'),
                'root': doc(status='published')}
    before = copy.deepcopy(metadata)
    result = eligibility('child', metadata)
    assert result['eligible'] and result['ancestor_ids'] == ['parent', 'root']
    assert metadata == before


@pytest.mark.parametrize(('target', 'change', 'reason'), [
    ('child', {'visibility': 'private'}, 'document_not_public'),
    ('parent', {'visibility': 'private'}, 'ancestor_not_public'),
    ('root', {'visibility': 'private'}, 'ancestor_not_public'),
    ('parent', {'status': 'withdrawn'}, 'ancestor_state_not_allowed'),
    ('root', {'status': 'withdrawn'}, 'ancestor_state_not_allowed'),
    ('parent', {'status': 'superseded'}, 'ancestor_state_not_allowed'),
    ('root', {'status': 'unrecognized_state'}, 'ancestor_state_not_allowed'),
])
def test_private_or_revoked_anywhere_blocks_descendant(target, change, reason):
    metadata = {'child': doc(parent_id='parent'), 'parent': doc(parent_id='root'), 'root': doc()}
    metadata[target].update(change)
    result = eligibility('child', metadata)
    assert not result['eligible'] and result['reason'] == reason
    assert result['blocked_document_id'] == target
    assert result['year_evidence'] == result['effective_years'] == []


def test_missing_parent_and_missing_child_fail_closed():
    assert eligibility('missing', {})['reason'] == 'document_missing'
    result = eligibility('child', {'child': doc(parent_id='missing')})
    assert not result['eligible'] and result['reason'] == 'ancestor_missing'
    assert result['ancestor_ids'] == ['missing']


@pytest.mark.parametrize('links', [{'a': 'a'}, {'a': 'b', 'b': 'a'}, {'a': 'b', 'b': 'c', 'c': 'b'}])
def test_self_and_longer_source_cycles_fail_closed(links):
    metadata = {name: doc(parent_id=parent) for name, parent in links.items()}
    assert eligibility('a', metadata)['reason'] == 'source_cycle'


def test_depth_bound_counts_links_and_still_allows_roots():
    metadata = {'a': doc(parent_id='b'), 'b': doc(parent_id='c'), 'c': doc()}
    assert eligibility('a', metadata, max_depth=2)['eligible']
    assert eligibility('a', metadata, max_depth=1)['reason'] == 'source_depth_exceeded'
    assert eligibility('c', metadata, max_depth=0)['eligible']
    assert eligibility('a', metadata, max_depth=0)['reason'] == 'source_depth_exceeded'


@pytest.mark.parametrize('parent_id', ['', ' ', 0, [], {}])
def test_malformed_explicit_parent_is_not_silently_a_root(parent_id):
    assert eligibility('child', {'child': doc(parent_id=parent_id)})['reason'] == 'invalid_parent_id'


def test_metadata_identity_cannot_be_substituted_under_another_key():
    metadata = {'child': {**doc(), 'id': 'other'}}
    assert eligibility('child', metadata)['reason'] == 'metadata_id_mismatch'


def test_annual_evidence_uses_nearest_title_before_later_upload_date():
    metadata = {'child': doc(parent_id='parent', title='班车时刻表（2023年9月25日起试行）.pdf', published_at='2024-08-30'),
                'parent': doc(status='parse_failed', title='南京晓庄学院班车时刻表', published_at='2024-08-30')}
    result = eligibility('child', metadata)
    assert result['eligible'] and result['effective_years'] == ['2023']
    assert result['year_basis'] == {'document_id': 'child', 'source': 'title'}
    assert {(row['year'], row['source']) for row in result['year_evidence']} == {('2023', 'title'), ('2024', 'published_at')}


def test_parent_title_year_survives_attachment_lacking_own_year():
    metadata = {'child': doc(parent_id='parent', title='办理须知.pdf', published_at='2026-01-02'),
                'parent': doc(title='2025年办理通知', published_at='2025-12-30')}
    result = eligibility('child', metadata)
    assert result['effective_years'] == ['2025']
    assert result['year_basis'] == {'document_id': 'parent', 'source': 'title'}


def test_explicit_child_version_takes_precedence_over_ancestor_title():
    metadata = {'child': doc(parent_id='parent', title='2026年修订细则'),
                'parent': doc(title='2025年通知')}
    assert eligibility('child', metadata)['effective_years'] == ['2026']


def test_cohort_is_not_annual_version_and_body_years_are_never_read():
    metadata = {'child': {**doc(title='2026级与2025年级新生事项', published_at='2024-09-01'),
                          'text': '这份正文包含2027年，但不可传播到年度元数据'}}
    result = eligibility('child', metadata)
    assert result['effective_years'] == ['2024']
    assert len(result['year_evidence']) == 1 and result['year_evidence'][0]['source'] == 'published_at'
    assert title_years('2026 级与2025 年 级通知') == []
    assert title_years('2026-2027学年通知（2025级适用）') == ['2026', '2027']
    assert title_years('号码1232026456不等于年度，2026年通知') == ['2026']


def test_publication_fallback_requires_valid_iso_date_and_can_use_ancestor():
    metadata = {'child': doc(parent_id='parent', published_at='2026-02-30'),
                'parent': doc(published_at='2025-10-09T12:00:00+08:00')}
    result = eligibility('child', metadata)
    assert result['effective_years'] == ['2025']
    assert result['year_basis'] == {'document_id': 'parent', 'source': 'published_at'}
    assert publication_year('2026') is None and publication_year('not a date 2026-10-09') is None


@pytest.mark.parametrize('max_depth', [-1, True, 1.5, None])
def test_invalid_depth_is_a_caller_error(max_depth):
    with pytest.raises(ValueError, match='nonnegative integer'):
        eligibility('child', {'child': doc()}, max_depth=max_depth)
