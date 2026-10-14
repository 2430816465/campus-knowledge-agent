"""真实服务验收：逐页枚举、模型延迟、原文引用、两请求并发。不会确认学校规则。"""
import concurrent.futures
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.config import ROOT
from app.model_gate import inference_gate

BASE = 'http://127.0.0.1:8008'
OLLAMA = 'http://127.0.0.1:11434'
COMP = 'f6749c9f-973c-4630-85c3-52dcdfae0c36'


def ask():
    # The backend admits its own model requests. An outer gate here would
    # deadlock against that nested admission and also serialize the API probe.
    started = time.perf_counter()
    with httpx.Client(timeout=150, trust_env=False) as client:
        response = client.post(BASE + '/api/chat', json={
            'question': '2026年五一数学建模竞赛我校报名截止时间是什么？',
            'competition_id': COMP, 'year': 2026,
        })
        response.raise_for_status()
        body = response.json()
        for source in body.get('sources', []):
            chunks = client.get(BASE + '/api/documents/' + source['document_id'] + '/chunks').json()['chunks']
            assert any(x['id'] == source['id'] and source['quote'] in x['text'] for x in chunks)
    return {'seconds': round(time.perf_counter() - started, 3), **body}


def unload_model(client):
    """Unload changes model residency, so it also requires compute admission."""
    with inference_gate(OLLAMA, workload='inference') as call:
        response = client.post(OLLAMA + '/api/generate', json={'model': 'qwen3:8b', 'keep_alive': 0})
        response.read()
        call.mark_completed()
    response.raise_for_status()


def stream_model_timing(client, label):
    """Keep arrival timestamps; parse only after the entire stream is received."""
    start = time.perf_counter()
    lines = []
    with inference_gate(OLLAMA, workload='chat') as call:
        with client.stream('POST', OLLAMA + '/api/chat', json={
            'model': 'qwen3:8b',
            'messages': [{'role': 'user', 'content': '只回答：本地模型连接正常'}],
            'think': False, 'stream': True, 'keep_alive': '5m',
            'options': {'num_ctx': 4096, 'num_predict': 40, 'temperature': 0},
        }) as response:
            for line in response.iter_lines():
                if line:
                    lines.append((line, time.perf_counter() - start))
        # No completion mark on a timeout, incomplete body, or stream close
        # error: the server may still be executing and must stay quarantined.
        call.mark_completed()
    received_seconds = time.perf_counter() - start
    response.raise_for_status()
    first = None
    last = None
    for line, arrived in lines:
        last = json.loads(line)
        if first is None and last.get('message', {}).get('content'):
            first = arrived
    assert first is not None and last['done']
    return {
        'run': label, 'first_content_seconds': round(first, 3),
        'total_seconds': round(received_seconds, 3),
        'load_seconds': round(last.get('load_duration', 0) / 1e9, 3),
        'output_tokens': last.get('eval_count'),
    }


def main():
    with httpx.Client(timeout=150, trust_env=False) as client:
        coverage = client.get(BASE + '/api/coverage').json()
        ids = []
        offset = 0
        while True:
            page = client.get(BASE + '/api/competitions', params={'offset': offset, 'limit': 20}).json()
            ids.extend(x['competition_id'] for x in page['items'])
            offset += len(page['items'])
            if offset >= page['total']:
                break
            assert page['items']
        assert len(ids) == len(set(ids)) == page['total'] == coverage['competitions']
        unload_model(client)
        timings = [stream_model_timing(client, label) for label in ('cold', 'warm')]
        gpu = client.get(OLLAMA + '/api/ps').json()
    single = ask()
    assert single['mode'] == 'local_model_evidence'
    assert '4 月 12 日' in single['answer'] and '20:00' in single['answer']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        concurrent_results = list(pool.map(lambda _: ask(), range(2)))
    report = {
        'checked_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'health': httpx.get(BASE + '/api/health', trust_env=False).json(),
        'coverage': {k: v for k, v in coverage.items() if k != 'sources'},
        'pagination': {'records': len(ids), 'unique_records': len(set(ids)), 'page_size': 20, 'passed': True},
        'stream_timings': timings, 'gpu_models': gpu, 'single_real_notice': single,
        'two_simultaneous_requests': [
            {'mode': x['mode'], 'seconds': x['seconds'], 'warnings': x.get('warnings', []),
             'sources_verified': len(x.get('sources', []))} for x in concurrent_results
        ],
        'limits': [
            '两请求仅为小规模并发探测，不是学校峰值验收',
            '忙时返回带提示的原文摘录；没有持久化排队',
            '首字延迟针对最小模型 API 请求，网页问答仍整体返回',
            '教师未核验100题候选，不能报告事实正确率',
            '直接模型请求逐次共享推理许可；校园API由后端独立申请，Dify异步worker及其他直连客户端不受本脚本锁约束',
        ],
    }
    (ROOT / 'reports' / 'live-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('gpu_models', 'single_real_notice')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
