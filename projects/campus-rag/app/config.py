import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('CAMPUS_DATA', str(ROOT / 'data'))).resolve()
for directory in (DATA, DATA / 'raw', DATA / 'inbox', ROOT / 'reports', ROOT / '.secrets'):
    directory.mkdir(parents=True, exist_ok=True)
# Explicit environment wins for isolated tests/recovery. Local runtime settings
# keep the selected database consistent across the web process and import tools.
runtime_file = ROOT / '.secrets/runtime.json'
runtime = json.loads(runtime_file.read_text(encoding='utf-8')) if runtime_file.exists() else {}
DATABASE_URL = os.environ.get('DATABASE_URL', runtime.get('DATABASE_URL', f'sqlite:///{(DATA / "campus.db").as_posix()}'))
OLLAMA = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
CHAT_MODEL = os.environ.get('CHAT_MODEL', 'qwen3:8b')
EMBED_MODEL = os.environ.get('EMBED_MODEL', 'qwen3-embedding:0.6b')
SCHOOL = '南京晓庄学院'
MAX_FILE = 20 * 1024 * 1024

# Pilot stays off until real coverage and question-level quality acceptance.
SEMANTIC_SEARCH_ENABLED = os.environ.get('CAMPUS_SEMANTIC_SEARCH', '0') == '1'
