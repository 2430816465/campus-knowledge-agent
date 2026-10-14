"""Summarize actual acceptance evidence without repeating expensive model/OCR work."""
import ast,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from sqlalchemy import select,func
from app.db import Session,Document,Chunk,Competition
root=Path(__file__).resolve().parents[1]
names=['postgres-restore-check','postgres-cutover','postgres-filters','dify-runtime','dify-chatflow-acceptance','dify-knowledge-api','dify-restore-check','dify-retrieval','handoff-verification','student-retrieval','student-answer-acceptance','student-ui-context']
reports={name:json.loads((root/'reports'/f'{name}.json').read_text(encoding='utf-8')) for name in names}
for name,report in reports.items():
    if name=='postgres-cutover':
        assert report['all_tables_identical'] and report['live_health']['database']=='postgresql' and not report['web_restart_and_live_acceptance_pending']
    else:assert report['passed'],name
xml=ET.parse(root/'reports/tests.xml').getroot();suite=xml.find('testsuite')
test_count=int(suite.attrib['tests'])
assert test_count>=65 and int(suite.attrib['failures'])==0 and int(suite.attrib['errors'])==0 and int(suite.attrib.get('skipped',0))==0
with httpx.Client(trust_env=False) as c:
    health=c.get('http://127.0.0.1:8008/api/health').json();assert health['database']=='postgresql' and health['chat_ready']
with Session() as session:
    published=session.scalar(select(func.count()).select_from(Document).where(Document.status=='published'));assert published==0
    counts={table.__tablename__:session.scalar(select(func.count()).select_from(table)) for table in (Document,Chunk,Competition)}
for file in (root/'scripts').glob('*.py'):ast.parse(file.read_text(encoding='utf-8-sig'))
retrieval=reports['dify-retrieval']
report={'checked_at':datetime.now().astimezone().isoformat(),'passed':True,'stage':'local prototype and scoped Dify trial; not school deployment',
        'database':'postgresql','physical_counts':counts,'effective_directory_rows':257,'teacher_published_documents':published,'automated_tests_passed':test_count,
        'acceptance_reports':[f'reports/{name}.json' for name in names],
        'student_recall_by_scope':reports['student-retrieval']['after_summary'],
        'student_live_literal_answers':reports['student-answer-acceptance']['successful_literal_answers'],
        'human_next_action':'Teacher verifies the Five-One mathematical modelling school deadline against the official source in /admin.',
        'native_trial_recall':{'baseline_at_3':retrieval['baseline']['recall_at_3'],
                              'hybrid_at_10':retrieval['persistent_default']['recall_at_returned_k'],
                              'questions':retrieval['persistent_default']['questions'],
                              'hybrid_at_3':retrieval['persistent_default']['recall_at_3'],'answer_accuracy_measured':False},
        'pending':['Teacher rules and 100 candidate answers','Normal Windows reboot recovery','School server/SSO/network/target workload','Independent wider retrieval/answer checks; unknown and ambiguous event names need explicit user scope','Broader native retrieval ranking/context validation before replacing business hybrid retrieval']}
(root/'reports/local-stage-completion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
