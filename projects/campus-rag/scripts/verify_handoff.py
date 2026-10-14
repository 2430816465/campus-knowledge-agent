"""在新目录核验备份恢复、可迁移台账、部署环境生成和仅回环问答。"""
import base64,json,os,socket,subprocess,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import ROOT,DATA
from app.db import Session
from app.rag import answer
backup=json.loads((ROOT/'reports/latest-backup.json').read_text(encoding='utf-8'))['path']
def run(args,env=None):
    result=subprocess.run([sys.executable,*args],cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8')
    if result.returncode:raise RuntimeError(result.stderr or result.stdout)
    return result.stdout
restored=json.loads(run(['scripts/restore_check.py',backup]))
target=DATA/'restore-checks'/('migration-'+uuid.uuid4().hex[:12]);target.mkdir(parents=True)
env={**os.environ,'MIGRATION_TARGET_URL':'sqlite:///'+(target/'migrated.db').as_posix(),'PYTHONIOENCODING':'utf-8'}
migration=json.loads(run(['scripts/migrate_business.py',backup],env))
with tempfile.TemporaryDirectory(prefix='campus-dify-check-') as folder:
    folder=Path(folder);upstream=ROOT/'deploy/vendor/dify-1.17.1/docker'
    for name in ('.env.example','docker-compose.yaml'):(folder/name).write_bytes((upstream/name).read_bytes())
    run(['deploy/prepare_dify_env.py',str(folder)])
    initial=(folder/'.env').read_bytes()
    text=initial.decode('utf-8')
    assert 'EXPOSE_NGINX_PORT=8080' in text
    override=(folder/'docker-compose.override.yaml').read_text(encoding='utf-8')
    assert '127.0.0.1:8080:80' in override and '127.0.0.1:5003:5003' in override
    values=dict(line.split('=',1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
    assert values['SANDBOX_API_KEY']==values['CODE_EXECUTION_API_KEY']
    assert values['CELERY_BROKER_URL']=='redis://:'+values['REDIS_PASSWORD']+'@redis:6379/1'
    assert values['WEAVIATE_API_KEY']==values['WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS']
    assert len(values['DB_PASSWORD'])>=32
    assert len(base64.urlsafe_b64decode(values['DIFY_AGENT_SERVER_SECRET_KEY']+'==='))==32
    repeat=subprocess.run([sys.executable,'deploy/prepare_dify_env.py',str(folder)],capture_output=True)
    assert repeat.returncode!=0 and initial==(folder/'.env').read_bytes()
attempted=[];original=socket.create_connection
def local_only(address,*args,**kwargs):
    attempted.append(str(address[0]))
    if address[0] not in ('127.0.0.1','localhost','::1'):raise RuntimeError('验收进程禁止外网连接')
    return original(address,*args,**kwargs)
with patch('socket.create_connection',local_only),Session() as session:
    result=answer(session,'2026年五一数学建模我校报名截止时间',competition_id='f6749c9f-973c-4630-85c3-52dcdfae0c36',year=2026)
assert result['mode']=='local_model_evidence' and '20:00' in result['answer']
pg_report=ROOT/'reports/postgres-restore-check.json'
pg_restore=json.loads(pg_report.read_text(encoding='utf-8')) if pg_report.exists() else {}
report={'passed':True,'restore':restored,'business_export_migration':migration,'dify_environment_generation':{'isolated_temporary_directory':True,'matching_keys':True,'loopback_ports':True,'existing_env_preserved':True,'docker_compose_executed':False},'application_local_network_check':{'mode':result['mode'],'connection_hosts':attempted,'seconds':result['elapsed_seconds'],'limitation':'仅限制本次 Python 进程；未隔离 Ollama 独立进程和操作系统网络，不能称为拔网验收'},'postgresql_restore_tested':pg_restore.get('passed',False),'postgresql_restore_evidence':'reports/postgres-restore-check.json'}
(ROOT/'reports/handoff-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
