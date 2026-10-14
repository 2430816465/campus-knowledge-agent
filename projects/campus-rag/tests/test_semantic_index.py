import copy
import json
import os
import sqlite3
import threading

import numpy as np
import pytest

from app.model_gate import ModelBusy
from app.semantic_index import (SourceChunk, SemanticIndexBuilder, SemanticIndexReader,
                                reciprocal_rank_fusion, sha_file, sha_text)


DIGEST = 'test-model-immutable-digest'


def corpus(count=3):
    metadata, sources, chunks = {}, [], {}
    for number in range(count):
        doc, chunk = f'doc-{number}', f'chunk-{number}'
        title, text = f'通知{number}', f'真实公开正文内容{number}'
        metadata[doc] = {'id': doc, 'visibility': 'public', 'status': 'pending_review',
                         'parent_id': None, 'title': title, 'sha256': str(number % 10) * 64,
                         'kind': 'notice', 'published_at': '2024-08-30'}
        sources.append(SourceChunk(chunk, doc, metadata[doc]['sha256'], title, text))
        chunks[chunk] = {'document_id': doc, 'text': text, 'location': '正文第1段'}
    return metadata, sources, chunks


def fake_embed(texts):
    return [[1, 0, 0] for _ in texts]


def build(root, sources, metadata, *, digest=DIGEST, embedder=fake_embed):
    with SemanticIndexBuilder(root, digest, 3) as builder:
        inventory = builder.sync_inventory(sources, metadata)
        embedding = builder.build_pending(embedder, limit=100, batch_size=2)
        publication = builder.publish()
        return inventory, embedding, publication


def search(reader, metadata, chunks, **kwargs):
    return reader.search([1, 0, 0], model_digest=kwargs.pop('model_digest', DIGEST),
                         metadata_by_id=metadata, fetch_chunks=lambda ids: {key: chunks[key] for key in ids if key in chunks},
                         **kwargs)


def test_finite_build_resumes_without_reembedding_ready_chunks(tmp_path):
    metadata, sources, chunks = corpus()
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        assert builder.sync_inventory(sources, metadata) == {'enqueued': 3}
        assert builder.build_pending(fake_embed, limit=1, batch_size=4) == {'attempted': 1, 'ready': 1}
        assert builder.stats()['states'] == {'pending': 2, 'ready': 1}
        assert builder.publish()['rows'] == 1
    calls = []
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        assert builder.sync_inventory(sources, metadata) == {'unchanged': 3}
        builder.build_pending(lambda texts: calls.extend(texts) or fake_embed(texts), limit=10)
        assert len(calls) == 2
        assert builder.publish()['rows'] == 3
        assert builder.stats()['cached_versions'] == 3
    reader = SemanticIndexReader(tmp_path)
    try:
        result = search(reader, metadata, chunks)
        assert len(result['matches']) == 3
        assert isinstance(reader.matrix, np.memmap)
        assert reader.matrix.dtype == np.float32 and not reader.matrix.flags.writeable
        assert np.allclose(np.linalg.norm(reader.matrix, axis=1), 1)
    finally:
        reader.close()


def test_unchanged_inventory_reuses_vectors_and_generation(tmp_path):
    metadata, sources, chunks = corpus(1)
    first = build(tmp_path, sources, metadata)[2]
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        assert builder.sync_inventory(sources, metadata) == {'unchanged': 1}
        assert not builder.build_pending(lambda _: pytest.fail('Unchanged job was embedded.'))
        second = builder.publish()
    assert not second['published'] and second['generation'] == first['generation']


def test_new_arbitrary_uuid_before_old_id_is_discovered(tmp_path):
    metadata, sources, chunks = corpus(2)
    build(tmp_path, sources[1:], metadata)
    inventory, embedding, publication = build(tmp_path, sources, metadata)
    assert inventory == {'enqueued': 1, 'unchanged': 1}
    assert embedding['ready'] == 1 and publication['rows'] == 2


@pytest.mark.parametrize('change', ['text', 'title', 'source_hash'])
def test_changed_inputs_with_same_chunk_id_are_stale_then_reindexed(tmp_path, change):
    metadata, sources, chunks = corpus(1)
    build(tmp_path, sources, metadata)
    source = sources[0]
    if change == 'text':
        chunks['chunk-0']['text'] = '修改后新增的服务信息'
    if change == 'title':
        metadata['doc-0']['title'] = '更新的通知标题'
    if change == 'source_hash':
        metadata['doc-0']['sha256'] = 'a' * 64
    sources = [SourceChunk(source.chunk_id, source.document_id, metadata['doc-0']['sha256'],
                           metadata['doc-0']['title'], chunks['chunk-0']['text'])]
    reader = SemanticIndexReader(tmp_path)
    try:
        assert search(reader, metadata, chunks)['matches'] == []
        inventory, embedding, publication = build(tmp_path, sources, metadata)
        assert inventory == {'enqueued': 1} and embedding['ready'] == 1
        assert search(reader, metadata, chunks)['matches'][0]['text'] == chunks['chunk-0']['text']
        with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
            assert builder.stats()['cached_versions'] == 2
    finally:
        reader.close()


def test_model_digest_and_dimension_are_part_of_version_key(tmp_path):
    metadata, sources, chunks = corpus(1)
    build(tmp_path, sources, metadata)
    reader = SemanticIndexReader(tmp_path)
    try:
        assert search(reader, metadata, chunks, model_digest='new-digest')['reason'] == 'model_digest_mismatch'
        inventory, embedding, publication = build(tmp_path, sources, metadata, digest='new-digest')
        assert inventory == {'enqueued': 1} and embedding['ready'] == 1
        assert search(reader, metadata, chunks, model_digest='new-digest')['matches']
        with SemanticIndexBuilder(tmp_path, 'new-digest', 4) as builder:
            assert builder.sync_inventory(sources, metadata) == {'enqueued': 1}
            assert builder.stats()['cached_versions'] == 3
    finally:
        reader.close()


def test_inventory_scan_failure_rolls_back_all_active_flags(tmp_path):
    metadata, sources, chunks = corpus(2)
    build(tmp_path, sources, metadata)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        def broken():
            yield sources[0]
            raise RuntimeError('simulated interrupted scan')
        with pytest.raises(RuntimeError):
            builder.sync_inventory(broken(), metadata)
        assert builder.stats()['active'] == 2
        with pytest.raises(ValueError, match='Duplicate'):
            builder.sync_inventory([sources[0], sources[0]], metadata)
        assert builder.stats()['active'] == 2


def test_working_task_recovery_requires_exclusive_builder_lock(tmp_path):
    metadata, sources, chunks = corpus(1)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory(sources, metadata)
        builder.connection.execute("UPDATE jobs SET state='working'")
        builder.connection.commit()
        with pytest.raises(ModelBusy):
            with SemanticIndexBuilder(tmp_path, DIGEST, 3):
                pytest.fail('Second writer acquired the OS lock.')
        assert builder.stats()['states'] == {'working': 1}
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        assert builder.stats()['states'] == {'pending': 1}
        assert builder.build_pending(fake_embed)['ready'] == 1


def test_model_busy_is_pending_and_does_not_count_as_content_failure(tmp_path):
    metadata, sources, chunks = corpus(2)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory(sources, metadata)
        def busy(_):
            raise ModelBusy('busy')
        counts = builder.build_pending(busy)
        assert counts.get('attempted', 0) == 0 and counts['busy'] == 2
        assert builder.stats()['states'] == {'pending': 2}
        assert sum(row[0] for row in builder.connection.execute('SELECT attempts FROM jobs')) == 0


@pytest.mark.parametrize('bad', [[], [[1, 2]], [[0, 0, 0]], [[float('nan'), 1, 0]], [[float('inf'), 0, 1]], ['bad']])
def test_invalid_vectors_are_failed_and_only_explicitly_retried(tmp_path, bad):
    metadata, sources, chunks = corpus(1)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory(sources, metadata)
        counts = builder.build_pending(lambda _: bad)
        assert counts['failed'] == 1 and counts['attempted'] == 1
        assert builder.stats()['states'] == {'failed': 1}
        assert not builder.build_pending(lambda _: pytest.fail('Implicit retry.'))
        assert builder.retry_failed() == 1
        assert builder.build_pending(fake_embed)['ready'] == 1


def test_embedding_failure_is_finite_and_error_has_no_prompt(tmp_path):
    metadata, sources, chunks = corpus(5)
    calls = []
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory(sources, metadata)
        def failing(texts):
            calls.append(texts)
            raise RuntimeError('sensitive provider body with prompt')
        assert builder.build_pending(failing, limit=3, batch_size=2)['failed'] == 3
        assert len(calls) == 2
        assert builder.stats()['states'] == {'failed': 3, 'pending': 2}
        assert {row[0] for row in builder.connection.execute("SELECT error FROM jobs WHERE state='failed'")} == {'RuntimeError'}


@pytest.mark.parametrize('ancestor_state', ['parse_failed', 'partial_parse', 'converted'])
def test_source_shell_parent_is_eligible_at_build_and_query(tmp_path, ancestor_state):
    metadata, sources, chunks = corpus(1)
    metadata['doc-0']['parent_id'] = 'html'
    metadata['html'] = {'visibility': 'public', 'status': ancestor_state, 'title': '2023年9月25日起试行',
                        'published_at': '2024-08-30', 'parent_id': None}
    assert build(tmp_path, sources, metadata)[2]['rows'] == 1
    reader = SemanticIndexReader(tmp_path)
    try:
        match = search(reader, metadata, chunks, years={'2023'})['matches'][0]
        assert match['eligibility']['effective_years'] == ['2023']
        assert not search(reader, metadata, chunks, years={'2024'})['matches']
    finally:
        reader.close()


@pytest.mark.parametrize('target,update', [
    ('doc-0', {'status': 'withdrawn'}), ('doc-0', {'status': 'superseded'}),
    ('doc-0', {'visibility': 'private'}), ('html', {'status': 'withdrawn'}),
    ('html', {'visibility': 'private'}), ('doc-0', {'parent_id': 'missing'}),
    ('html', {'parent_id': 'doc-0'}),
])
def test_live_permissions_override_the_persisted_index(tmp_path, target, update):
    metadata, sources, chunks = corpus(1)
    metadata['doc-0']['parent_id'] = 'html'
    metadata['html'] = {'visibility': 'public', 'status': 'parse_failed', 'title': '原通知', 'parent_id': None}
    build(tmp_path, sources, metadata)
    reader = SemanticIndexReader(tmp_path)
    try:
        assert search(reader, metadata, chunks)['matches']
        metadata[target].update(update)
        assert not search(reader, metadata, chunks)['matches']
    finally:
        reader.close()


def test_no_private_or_withdrawn_data_enters_new_inventory(tmp_path):
    metadata, sources, chunks = corpus(3)
    metadata['doc-0']['visibility'] = 'private'
    metadata['doc-1']['parent_id'] = 'missing'
    inventory, embedding, publication = build(tmp_path, sources, metadata)
    assert inventory == {'excluded': 2, 'enqueued': 1}
    assert publication['rows'] == 1


def test_grade_labels_and_body_years_are_not_annual_version(tmp_path):
    metadata, sources, chunks = corpus(1)
    metadata['doc-0']['title'] = '2026级学生服务'
    metadata['doc-0']['published_at'] = '2024-08-30'
    chunks['chunk-0']['text'] = '本文提到2025年度的历史安排'
    sources = [SourceChunk('chunk-0', 'doc-0', '0' * 64, metadata['doc-0']['title'], chunks['chunk-0']['text'])]
    build(tmp_path, sources, metadata)
    reader = SemanticIndexReader(tmp_path)
    try:
        assert not search(reader, metadata, chunks, years={'2026'})['matches']
        assert not search(reader, metadata, chunks, years={'2025'})['matches']
        assert search(reader, metadata, chunks, years={'2024'})['matches']
    finally:
        reader.close()


def test_document_and_kind_scope_are_hard_filters(tmp_path):
    metadata, sources, chunks = corpus(3)
    build(tmp_path, sources, metadata)
    metadata['doc-1']['kind'] = 'catalog'
    reader = SemanticIndexReader(tmp_path)
    try:
        result = search(reader, metadata, chunks, allowed_document_ids={'doc-1', 'doc-2'})
        assert [match['document_id'] for match in result['matches']] == ['doc-2']
    finally:
        reader.close()


@pytest.mark.parametrize('change', ['missing', 'wrong_document', 'wrong_text'])
def test_fresh_candidate_lookup_detects_body_or_identity_changes(tmp_path, change):
    metadata, sources, chunks = corpus(1)
    build(tmp_path, sources, metadata)
    if change == 'missing':
        chunks.clear()
    elif change == 'wrong_document':
        chunks['chunk-0']['document_id'] = 'other'
    else:
        chunks['chunk-0']['text'] = 'same ID but changed body'
    reader = SemanticIndexReader(tmp_path)
    try:
        result = search(reader, metadata, chunks)
        assert not result['matches'] and result['stale_candidates'] == 1
    finally:
        reader.close()


def test_stale_candidate_checks_are_bounded_and_signal_partial_coverage(tmp_path):
    metadata, sources, chunks = corpus(8)
    build(tmp_path, sources, metadata)
    for chunk in chunks.values():
        chunk['text'] = 'stale indexed contents'
    reader = SemanticIndexReader(tmp_path)
    try:
        result = search(reader, metadata, chunks, limit=1, max_candidates=2)
        assert result['candidate_limit_reached'] and result['stale_candidates'] == 2
        assert not result['matches']
    finally:
        reader.close()


def test_partial_generation_publication_does_not_replace_previous_pointer(tmp_path, monkeypatch):
    import app.semantic_index as module
    metadata, sources, chunks = corpus(2)
    first = build(tmp_path, sources[:1], metadata)[2]
    real_atomic = module.atomic_json
    def fail_pointer(path, value):
        if path.name == 'current.json':
            raise OSError('simulated pointer interruption')
        return real_atomic(path, value)
    monkeypatch.setattr(module, 'atomic_json', fail_pointer)
    with pytest.raises(OSError):
        build(tmp_path, sources, metadata)
    assert json.loads((tmp_path / 'current.json').read_text())['generation'] == first['generation']
    reader = SemanticIndexReader(tmp_path)
    try:
        assert len(search(reader, metadata, chunks)['matches']) == 1
    finally:
        reader.close()
    monkeypatch.setattr(module, 'atomic_json', real_atomic)
    assert build(tmp_path, sources, metadata)[2]['rows'] == 2


def test_matrix_is_reused_until_a_new_complete_generation(tmp_path, monkeypatch):
    metadata, sources, chunks = corpus(2)
    build(tmp_path, sources[:1], metadata)
    real_load, calls = np.load, []
    def tracked(*args, **kwargs):
        calls.append(args[0])
        return real_load(*args, **kwargs)
    monkeypatch.setattr(np, 'load', tracked)
    reader = SemanticIndexReader(tmp_path)
    try:
        assert len(search(reader, metadata, chunks)['matches']) == 1
        first_mmap = reader.matrix._mmap
        search(reader, metadata, chunks)
        assert len(calls) == 1
        build(tmp_path, sources, metadata)
        assert len(search(reader, metadata, chunks)['matches']) == 2
        assert len(calls) == 2 and first_mmap.closed
    finally:
        reader.close()


def test_empty_index_and_missing_index_have_explicit_fallback(tmp_path):
    metadata, sources, chunks = corpus(0)
    reader = SemanticIndexReader(tmp_path)
    assert search(reader, metadata, chunks)['reason'] == 'index_unavailable'
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory([], {})
        assert builder.publish()['rows'] == 0
    try:
        assert search(reader, metadata, chunks)['reason'] == 'no_current_eligible_vectors'
    finally:
        reader.close()


@pytest.mark.parametrize('corruption', ['vector', 'pointer', 'row_mapping'])
def test_corrupt_index_fails_closed_to_lexical_fallback(tmp_path, corruption):
    metadata, sources, chunks = corpus(1)
    publication = build(tmp_path, sources, metadata)[2]
    directory = tmp_path / publication['generation']
    if corruption == 'vector':
        with (directory / 'vectors.npy').open('ab') as handle:
            handle.write(b'corrupt')
    elif corruption == 'pointer':
        (tmp_path / 'current.json').write_text(json.dumps({'schema': 1, 'generation': '../escape'}))
    else:
        with sqlite3.connect(directory / 'rows.sqlite3') as connection:
            connection.execute('UPDATE rows SET ordinal=9')
        manifest = json.loads((directory / 'manifest.json').read_text())
        manifest['rows_sha256'] = sha_file(directory / 'rows.sqlite3')
        (directory / 'manifest.json').write_text(json.dumps(manifest))
    reader = SemanticIndexReader(tmp_path)
    try:
        result = search(reader, metadata, chunks)
        assert not result['available'] and result['reason'] == 'index_unavailable'
    finally:
        reader.close()


def test_current_pointer_path_cannot_escape_index_root(tmp_path):
    (tmp_path / 'current.json').write_text(json.dumps({'schema': 1, 'generation': '../../secrets'}))
    reader = SemanticIndexReader(tmp_path)
    assert search(reader, {}, {})['reason'] == 'index_unavailable'


def test_rrf_promotes_agreement_without_score_scale_assumptions():
    rankings = [[{'chunk_id': 'a', 'score': 99}, {'chunk_id': 'b', 'score': 0.1}],
                [{'chunk_id': 'b', 'score': 0.01}, {'chunk_id': 'c', 'score': 0.009}]]
    result = reciprocal_rank_fusion(rankings)
    assert [item['chunk_id'] for item in result] == ['b', 'a', 'c']
    assert result[0]['rrf_score'] == pytest.approx(1 / 61 + 1 / 62)


def test_rrf_duplicate_id_does_not_vote_twice_in_one_list():
    result = reciprocal_rank_fusion([[{'chunk_id': 'a'}, {'chunk_id': 'a'}]])
    assert result[0]['rrf_score'] == pytest.approx(1 / 61)


def test_inventory_metadata_mismatch_is_not_silently_indexed(tmp_path):
    metadata, sources, chunks = corpus(1)
    metadata['doc-0']['title'] = 'concurrent title change'
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        with pytest.raises(ValueError, match='snapshot'):
            builder.sync_inventory(sources, metadata)
        assert builder.stats()['active'] == 0


def test_builder_methods_require_exclusive_context(tmp_path):
    builder = SemanticIndexBuilder(tmp_path, DIGEST, 3)
    with pytest.raises(RuntimeError, match='context'):
        builder.stats()


def test_model_version_changed_stops_remaining_old_digest_jobs(tmp_path):
    from app.semantic_ollama import ModelVersionChanged
    metadata, sources, chunks = corpus(5)
    calls = []
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        builder.sync_inventory(sources, metadata)
        def changed(texts):
            calls.append(texts)
            raise ModelVersionChanged('different actual model')
        with pytest.raises(ModelVersionChanged):
            builder.build_pending(changed, batch_size=2)
        assert len(calls) == 1 and builder.stats()['states'] == {'failed': 2, 'pending': 3}


def test_interrupt_during_model_call_recovers_only_unfinished_batch(tmp_path):
    metadata, sources, chunks = corpus(3)
    with pytest.raises(KeyboardInterrupt):
        with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
            builder.sync_inventory(sources, metadata)
            builder.build_pending(fake_embed, limit=1)
            def interrupted(_):
                raise KeyboardInterrupt
            builder.build_pending(interrupted, limit=1)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        assert builder.stats()['states'] == {'pending': 2, 'ready': 1}
        assert builder.build_pending(fake_embed)['ready'] == 2


def test_windows_transient_generation_rename_is_retried_without_losing_pointer(tmp_path, monkeypatch):
    import app.semantic_index as module
    metadata, sources, chunks = corpus(1)
    real_replace, attempts = module.os.replace, []
    def sharing_violation(source, destination):
        if str(destination).split('gen-')[-1] != str(destination) and source.is_dir():
            attempts.append(source)
            if len(attempts) < 3:
                raise PermissionError('temporary sharing violation')
        return real_replace(source, destination)
    monkeypatch.setattr(module.os, 'replace', sharing_violation)
    assert build(tmp_path, sources, metadata)[2]['rows'] == 1
    assert len(attempts) == 3


def make_generations(root, number=5):
    metadata, sources, chunks = corpus(number)
    generations = []
    for count in range(1, number + 1):
        publication = build(root, sources[:count], metadata)[2]
        generations.append(publication['generation'])
        # Avoid filesystem timestamp granularity affecting the retention test.
        os.utime(root / publication['generation'], (1700000000 + count, 1700000000 + count))
    return metadata, sources, chunks, generations


def test_generation_gc_retains_recent_three_and_never_touches_cache_or_source(tmp_path):
    metadata, sources, chunks, generations = make_generations(tmp_path)
    untouched = tmp_path / 'raw-source.pdf'
    untouched.write_bytes(b'original source bytes')
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        before = builder.stats()
        result = builder.collect_generations()
        assert builder.stats() == before
        assert set(result['deleted']) == set(generations[:2])
        assert set(result['retained']) == set(generations[2:]) and not result['skipped']
    assert (tmp_path / 'cache.sqlite3').exists() and untouched.read_bytes() == b'original source bytes'


def test_gc_preserves_current_even_when_it_is_older_than_recent_keep(tmp_path):
    metadata, sources, chunks, generations = make_generations(tmp_path)
    (tmp_path / 'current.json').write_text(json.dumps({'schema': 1, 'generation': generations[0]}))
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        result = builder.collect_generations(keep=2)
    assert set(result['retained']) == {generations[0], generations[-1], generations[-2]}
    assert (tmp_path / generations[0] / 'vectors.npy').exists()


def test_gc_skips_busy_reader_before_deleting_any_files(tmp_path, monkeypatch):
    from pathlib import Path
    metadata, sources, chunks, generations = make_generations(tmp_path, 3)
    real_unlink = Path.unlink
    def busy_mmap(path, *args, **kwargs):
        if path.parent.name == generations[0] and path.name == 'vectors.npy':
            raise PermissionError('another process has this mmap open')
        return real_unlink(path, *args, **kwargs)
    monkeypatch.setattr(Path, 'unlink', busy_mmap)
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        result = builder.collect_generations(keep=1)
    skipped = result['skipped'][0]
    assert skipped['generation'] == generations[0] and skipped['removed_files'] == []
    assert {entry.name for entry in (tmp_path / generations[0]).iterdir()} == {'vectors.npy', 'rows.sqlite3', 'manifest.json'}


@pytest.mark.parametrize('unsafe', ['extra_file', 'checksum_corrupt'])
def test_gc_skips_unverified_or_unexpected_generation_content(tmp_path, unsafe):
    metadata, sources, chunks, generations = make_generations(tmp_path, 3)
    oldest = tmp_path / generations[0]
    if unsafe == 'extra_file':
        (oldest / 'not-derived.doc').write_bytes(b'preserve this')
    else:
        with (oldest / 'vectors.npy').open('ab') as handle:
            handle.write(b'changed')
    with SemanticIndexBuilder(tmp_path, DIGEST, 3) as builder:
        result = builder.collect_generations(keep=1)
    assert result['skipped'][0]['generation'] == generations[0]
    assert (oldest / 'vectors.npy').exists() and (oldest / 'manifest.json').exists()


def test_reader_refresh_cannot_close_mmap_used_by_concurrent_search(tmp_path):
    metadata, sources, chunks = corpus(2)
    build(tmp_path, sources[:1], metadata)
    reader = SemanticIndexReader(tmp_path)
    entered, release, refreshed = threading.Event(), threading.Event(), threading.Event()
    results, errors = [], []
    def fetch(ids):
        entered.set()
        assert release.wait(3)
        return {key: chunks[key] for key in ids}
    def request():
        try:
            results.append(reader.search([1, 0, 0], model_digest=DIGEST, metadata_by_id=metadata,
                                         fetch_chunks=fetch))
        except BaseException as error:
            errors.append(error)
    def refresh():
        try:
            reader.refresh()
            refreshed.set()
        except BaseException as error:
            errors.append(error)
    first = threading.Thread(target=request)
    first.start()
    try:
        assert entered.wait(3)
        original = reader.matrix._mmap
        build(tmp_path, sources, metadata)
        second = threading.Thread(target=refresh)
        second.start()
        assert not refreshed.wait(0.1) and not original.closed
        release.set()
        first.join(3)
        second.join(3)
        assert refreshed.is_set() and not errors
        assert len(results[0]['matches']) == 1 and original.closed
        assert len(search(reader, metadata, chunks)['matches']) == 2
    finally:
        release.set()
        first.join(3)
        reader.close()
