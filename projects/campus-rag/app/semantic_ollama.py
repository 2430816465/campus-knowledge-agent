"""CPU-only, digest-checked embedding adapter for the persistent index."""
import httpx
from .model_gate import inference_gate


class ModelVersionChanged(RuntimeError):
    pass


def model_digest(client, endpoint, model):
    response = client.get(endpoint.rstrip('/') + '/api/tags')
    response.raise_for_status()
    for item in response.json().get('models', []):
        if item.get('name') == model or item.get('model') == model:
            digest = item.get('digest')
            if isinstance(digest, str) and digest:
                return digest
    raise ModelVersionChanged('Configured embedding model is not present in local Ollama.')


class OllamaCpuEmbedder:
    def __init__(self, endpoint, model, expected_digest, *, lock_directory=None, timeout=2):
        self.endpoint, self.model, self.expected_digest = endpoint, model, expected_digest
        self.lock_directory, self.timeout = lock_directory, timeout

    def __call__(self, texts):
        with inference_gate(self.endpoint, workload='embedding', timeout=self.timeout,
                            directory=self.lock_directory) as call:
            with httpx.Client(timeout=120, trust_env=False) as client:
                try:
                    installed_digest = model_digest(client, self.endpoint, self.model)
                except Exception:
                    call.mark_completed()  # Only metadata was requested.
                    raise
                if installed_digest != self.expected_digest:
                    call.mark_completed()  # No inference POST has been sent.
                    raise ModelVersionChanged('Embedding model digest changed before inference.')
                try:
                    response = client.post(self.endpoint.rstrip('/') + '/api/embed', json={
                        'model': self.model, 'input': texts, 'truncate': False,
                        'keep_alive': 0, 'options': {'num_gpu': 0, 'num_ctx': 4096},
                    })
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    call.mark_completed()
                    raise
                call.mark_completed()
                response.raise_for_status()
                vectors = response.json()['embeddings']
                if model_digest(client, self.endpoint, self.model) != self.expected_digest:
                    raise ModelVersionChanged('Embedding model digest changed during inference.')
                return vectors
