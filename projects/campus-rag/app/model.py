import threading
import json
import httpx
from .config import OLLAMA, CHAT_MODEL, EMBED_MODEL
from .model_gate import inference_gate, ModelBusy

MODEL_LOCK = threading.Lock()
CHAT_CONTEXT = 4096
CHAT_OUTPUT = 1100


class ModelContextLimit(ValueError):
    reason = 'model_context_limit'


class ModelOutputIncomplete(ValueError):
    reason = 'model_output_incomplete'


def check_chat_input(messages, response_schema=None):
    # Byte cap bounds transport/memory; it is NOT a tokenizer measurement.
    if (not isinstance(messages, list) or not 1 <= len(messages) <= 4
            or any(not isinstance(m, dict) or m.get('role') not in ('system','user','assistant')
                   or not isinstance(m.get('content'), str) for m in messages)):
        raise ModelContextLimit('Invalid or excessive message history')
    payload = {'messages':messages,'format':response_schema or 'json'}
    if len(json.dumps(payload,ensure_ascii=False).encode('utf-8')) > 12000:
        raise ModelContextLimit('Input exceeds bounded request budget')


def check_chat_result(result):
    # Reject output near the context boundary, and complete-looking JSON from
    # a length-limited generation. Counts are runtime evidence, not estimates.
    if not isinstance(result,dict):
        raise ModelOutputIncomplete('Malformed generation result')
    count = result.get('prompt_eval_count')
    if (type(count) is not int or count < 0 or count >= CHAT_CONTEXT - CHAT_OUTPUT):
        raise ModelContextLimit('Prompt count missing or context reserve exhausted')
    output_count = result.get('eval_count')
    if (result.get('done') is not True or result.get('done_reason') != 'stop'
            or type(output_count) is not int or not 0 <= output_count < CHAT_OUTPUT):
        raise ModelOutputIncomplete('Generation did not complete within output budget')
    return result


def embeddings(texts):
    if not MODEL_LOCK.acquire(timeout=2):
        raise ModelBusy('model_thread_busy')
    try:
        with inference_gate(OLLAMA, workload='embedding', timeout=2) as call:
            with httpx.Client(timeout=120, trust_env=False) as client:
                try:
                    response = client.post(OLLAMA + '/api/embed', json={
                        'model': EMBED_MODEL, 'input': texts, 'truncate': False,
                        'keep_alive': 0, 'options': {'num_gpu': 0, 'num_ctx': 4096},
                    })
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    call.mark_completed()  # Connection never admitted a request.
                    raise
                call.mark_completed()  # Full HTTP response received, before parsing.
                response.raise_for_status()
                result = response.json()['embeddings']
                if len(result) != len(texts) or not result or not result[0]:
                    raise ValueError('Embedding 数量或维度异常')
                return result
    finally:
        MODEL_LOCK.release()


def generate(messages, *, response_schema=None):
    check_chat_input(messages,response_schema)
    if not MODEL_LOCK.acquire(timeout=2):
        raise ModelBusy('model_thread_busy')
    try:
        with inference_gate(OLLAMA, workload='chat', timeout=2) as call:
            with httpx.Client(timeout=120, trust_env=False) as client:
                try:
                    response = client.post(OLLAMA + '/api/chat', json={
                        'model': CHAT_MODEL, 'messages': messages, 'think': False,
                        'stream': False, 'format': 'json' if response_schema is None else response_schema, 'keep_alive': '5m',
                        'options': {'num_ctx': CHAT_CONTEXT, 'num_predict': CHAT_OUTPUT, 'temperature': 0},
                    })
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    call.mark_completed()
                    raise
                call.mark_completed()
                response.raise_for_status()
                return check_chat_result(response.json())
    finally:
        MODEL_LOCK.release()
