"""Guard the trial boundary and restore settings after a failed live change."""
import copy
import pytest
from scripts.verify_dify_retrieval import DATASET, REMOTE, validate_scope, apply_verified


@pytest.mark.parametrize('config,active', [
    ({'sample_only': False, 'dataset_id': DATASET}, [REMOTE]),
    ({'sample_only': True, 'dataset_id': 'other'}, [REMOTE]),
    ({'sample_only': True, 'dataset_id': DATASET}, [REMOTE, 'extra-document']),
    ({'sample_only': True, 'dataset_id': DATASET}, []),
])
def test_refuse_changed_scope_or_corpus(config, active):
    with pytest.raises(ValueError):
        validate_scope(config, {'id': DATASET, 'permission': 'only_me'},
                       [{'id': value, 'enabled': True} for value in active])


class SettingsAPI:
    def __init__(self, baseline, mismatch=False):
        self.current = copy.deepcopy(baseline)
        self.writes = []
        self.mismatch = mismatch

    def request(self, method, path, **kwargs):
        if method == 'PATCH':
            self.current = copy.deepcopy(kwargs['json']['retrieval_model'])
            self.writes.append(copy.deepcopy(self.current))
            if self.mismatch and len(self.writes) == 1:
                self.current['top_k'] = 1
            return {}
        return {'retrieval_model_dict': copy.deepcopy(self.current)}


@pytest.mark.parametrize('failure', ['missing_evidence', 'network', 'readback'])
def test_failure_restores_previous_persistent_settings(failure):
    baseline = {'top_k': 3, 'search_method': 'semantic_search'}
    desired = {'top_k': 10, 'search_method': 'hybrid_search'}
    api = SettingsAPI(baseline, mismatch=failure == 'readback')

    def verify():
        if failure == 'network':
            raise TimeoutError('verification connection failed')
        return {'questions': 20, 'recall_at_returned_k': 19}

    with pytest.raises((RuntimeError, TimeoutError)):
        apply_verified(api, desired, baseline, verify)
    assert api.current == baseline
    assert api.writes == [desired, baseline]
