"""Finite, resumable CPU semantic-index build; no business DB writes."""
import argparse
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('--limit', type=int, default=200, help='Maximum attempted chunks; 0 inventories/publishes without inference.')
    result.add_argument('--batch-size', type=int, default=4)
    result.add_argument('--retry-failed', action='store_true', help='Explicitly retry active failed jobs.')
    result.add_argument('--model-digest', help='Expected local model digest; refuse a different installed version.')
    result.add_argument('--dimensions', type=int, default=1024)
    result.add_argument('--index-root', type=Path)
    result.add_argument('--keep-generations', type=int, default=3,
                        help='Retain this many recent immutable generations plus current; mapped/invalid generations are skipped.')
    return result


def main(argv=None):
    argument_parser = parser()
    args = argument_parser.parse_args(argv)
    if args.limit < 0 or args.batch_size < 1 or args.dimensions < 1 or args.keep_generations < 1:
        argument_parser.error('limit must be nonnegative; batch size/dimensions must be positive.')
    import httpx
    from app.config import DATA, ROOT, OLLAMA, EMBED_MODEL
    from app.db import engine
    from app.model_gate import ModelBusy
    from app.semantic_index import SemanticIndexBuilder, atomic_json, now
    from app.semantic_ollama import OllamaCpuEmbedder, model_digest
    from app.semantic_sources import readonly_connection, document_metadata, source_chunks

    index_root = (args.index_root or DATA / 'semantic-index').resolve()
    if not index_root.is_relative_to(DATA.resolve()) or index_root == DATA.resolve():
        argument_parser.error('index-root must be a child directory inside the configured project data directory.')
    report = ROOT / 'reports' / 'semantic-index-state.json'
    state = {'run_id': uuid.uuid4().hex, 'started_at': now(), 'state': 'starting',
             'limit': args.limit, 'batch_size': args.batch_size, 'dimensions': args.dimensions,
             'index_root': str(index_root), 'model': EMBED_MODEL,
             'business_data_modified': False, 'legacy_json_vectors_used': False}

    def save():
        state['updated_at'] = now()
        atomic_json(report, state)

    try:
        # GET tags is metadata only: inventory/publication must remain usable
        # while another task holds the compute lease. Every actual embedding
        # batch independently acquires the shared inference gate and rechecks
        # the digest around its POST.
        with httpx.Client(timeout=30, trust_env=False) as client:
            digest = model_digest(client, OLLAMA, EMBED_MODEL)
        if args.model_digest and digest != args.model_digest:
            raise ValueError('Expected embedding model digest is not installed.')
        state.update(model_digest=digest, state='inventory')
        save()
        with SemanticIndexBuilder(index_root, digest, args.dimensions) as builder:
            with readonly_connection(engine, snapshot=True) as connection:
                metadata = document_metadata(connection)
                state['inventory'] = builder.sync_inventory(source_chunks(connection), metadata)
            if args.retry_failed:
                state['retried_failed'] = builder.retry_failed()
            state['state'] = 'embedding'
            save()
            state['embedding'] = builder.build_pending(OllamaCpuEmbedder(OLLAMA, EMBED_MODEL, digest),
                                                       limit=args.limit, batch_size=args.batch_size)
            state['cache'] = builder.stats()
            state['state'] = 'publishing'
            save()
            state['publication'] = builder.publish()
            state['generation_gc'] = builder.collect_generations(keep=args.keep_generations)
            state['state'] = 'completed_with_errors' if state['embedding'].get('failed') else 'completed'
            if state['embedding'].get('busy'):
                state['state'] = 'deferred_model_busy'
        save()
        print('Semantic index:', state['state'], '| ready:', state['cache']['states'].get('ready', 0),
              '| active:', state['cache']['active'], '| report:', report)
        if state['state'] == 'deferred_model_busy':
            return 75
        return 1 if state['state'] == 'completed_with_errors' else 0
    except ModelBusy:
        state.update(state='deferred_lock_busy', error_type='ModelBusy')
        save()
        return 75
    except KeyboardInterrupt:
        state.update(state='interrupted', error_type='KeyboardInterrupt')
        save()
        return 130
    except Exception as error:
        state.update(state='failed', error_type=type(error).__name__)
        save()
        print('Semantic index failed:', type(error).__name__, '| report:', report, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
