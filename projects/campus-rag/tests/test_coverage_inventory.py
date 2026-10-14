from sqlalchemy import create_engine, event
from app.coverage_inventory import inventory, DOMAINS
from app.db import Base, Document, Chunk
from scripts.report_knowledge_coverage import read_inventory


def doc(identity, **values):
    return {'id':identity,'title':'2026年奖学金申请通知','visibility':'public',
            'status':'pending_review','source_url':'https://www.njxzc.edu.cn/a.htm',
            'published_at':'2026-09-01','publisher':None,'parent_id':None,'sha256':'a'*64,**values}


def test_empty_all_required_domains_and_unknown_coverage():
    report = inventory([],{},current_year=2026)
    assert report['document_count'] == report['chunk_count'] == 0
    assert set(report['domains']) == set(DOMAINS)
    assert all(not item['coverage_verified'] and item['required_topics_not_yet_verified'] for item in report['domains'].values())
    assert report['gold_standard_questions'] == 0
    assert not report['full_school_coverage_proven']


def test_private_withdrawn_missing_ancestor_never_usable_or_sampled():
    documents = [doc('private',visibility='private'),doc('child',parent_id='private'),
                 doc('withdrawn',status='withdrawn'),doc('orphan',parent_id='gone')]
    report = inventory(documents,{row['id']:2 for row in documents},current_year=2026)
    assert report['eligible_documents_with_chunks'] == 0
    assert report['domains']['奖助学金']['metadata_mentions'] == 4
    assert report['domains']['奖助学金']['eligible_with_chunks'] == 0
    assert report['domains']['奖助学金']['samples'] == []


def test_status_content_hashes_overlapping_domains_and_samples():
    documents = [doc('one',title='2026年毕业生求职资助申请通知',status='published'),
                 doc('two',title='2026年毕业生求职资助申请通知'),doc('three',title='不匹配标题',sha256='b'*64)]
    report = inventory(documents,{'one':3,'two':1},current_year=2026)
    assert report['eligible_documents_with_chunks'] == 2
    assert report['same_hash_additional_document_records'] == 1
    assert report['unmatched_title_metadata'] == 1
    assert report['domains']['奖助学金']['published_with_chunks'] == 1
    assert report['domains']['就业升学']['eligible_with_chunks'] == 2
    assert report['domains']['毕业学位']['eligible_with_chunks'] == 2
    assert report['reviewed_published_documents'] == 1


def test_title_year_takes_priority_over_reprint_and_cohort_not_annual():
    report = inventory([doc('old',title='2023年奖学金办法',published_at='2026-01-01'),
                        doc('undated',title='2025级学生毕业要求',published_at=None)],
                       {'old':1,'undated':1},current_year=2026)
    assert report['eligible_annual_evidence_before_current_year'] == 1
    assert report['eligible_without_annual_evidence'] == 1
    assert report['effective_year_mentions']['2023'] == 1
    assert '2025' not in report['effective_year_mentions']
    assert report['missing_publication_date'] == 1


def test_no_guessed_college_assignment_bad_url_and_unknown_publisher():
    report = inventory([doc('one',source_url='https://[bad',publisher=None)],{'one':1},current_year=2026)
    assert report['source_hosts'] == {'(invalid_url)':1}
    assert report['recorded_publishers'] == {'(unknown)':1}
    assert not report['college_assignment_verified']


def test_sql_read_snapshot_does_not_load_bad_vectors_or_poison_pool():
    bind = create_engine('sqlite://')
    Base.metadata.create_all(bind)
    row = doc('one')
    with bind.begin() as connection:
        connection.execute(Document.__table__.insert().values(**row,raw_name='original.html',mime='.html'))
        connection.exec_driver_sql("INSERT INTO chunks(id,document_id,text,location,vector) VALUES('c','one','not loaded','p1','INVALID JSON')")
    statements = []
    event.listen(bind,'before_cursor_execute',lambda c,cur,sql,*rest: statements.append(sql))
    report = read_inventory(bind)
    assert report['chunk_count'] == 1 and report['eligible_documents_with_chunks'] == 1
    selects = [sql.lower() for sql in statements if sql.lower().startswith('select')]
    assert all('vector' not in sql and 'chunks.text' not in sql for sql in selects)
    assert not any(sql.lower().startswith(('insert','update','delete')) for sql in statements)
    with bind.connect() as connection:
        assert connection.exec_driver_sql('PRAGMA query_only').scalar() == 0


def test_host_domain_year_cross_tabs_do_not_treat_withdrawn_or_empty_as_knowledge():
    documents=[doc('current',status='published'),doc('old',title='2023年奖学金办法'),
        doc('empty',source_url='https://xsc.njxzc.edu.cn/e.htm'),
        doc('private',visibility='private',source_url='https://xsc.njxzc.edu.cn/p.htm'),
        doc('withdrawn',status='withdrawn'),doc('unmatched',title='未分类',published_at=None)]
    report=inventory(documents,{'current':2,'old':1,'private':2,'withdrawn':1,'unmatched':1},current_year=2026)
    by_host=report['source_host_breakdown']
    assert by_host['www.njxzc.edu.cn']['document_count']==4
    assert by_host['www.njxzc.edu.cn']['eligible_with_chunks']==3
    assert by_host['www.njxzc.edu.cn']['published_with_chunks']==1
    assert by_host['xsc.njxzc.edu.cn']['eligible_with_chunks']==0
    rows={(r['domain'],r['source_host'],r['effective_year']):r for r in report['domain_source_year_breakdown']}
    assert rows[('奖助学金','www.njxzc.edu.cn','2023')]['eligible_with_chunks']==1
    assert rows[('奖助学金','www.njxzc.edu.cn','2026')]['published_with_chunks']==1
    assert rows[('(unmatched_title)','www.njxzc.edu.cn','(unknown_or_ineligible)')]['eligible_with_chunks']==1
    assert sum(r['eligible_with_chunks'] for r in by_host.values())==report['eligible_documents_with_chunks']
    assert not report['college_assignment_verified']


def test_cross_tabs_keep_multi_domain_and_multi_annual_metadata_overlap_explicit():
    row=doc('comparison',title='2025与2026年毕业生求职资助申请通知',publisher='原文记录单位')
    report=inventory([row],{'comparison':1},current_year=2026)
    cross=report['domain_source_year_breakdown']
    assert {r['domain'] for r in cross}=={'毕业学位','就业升学','奖助学金'}
    assert {r['effective_year'] for r in cross}=={'2025','2026'}
    assert len(cross)==6
    assert all(r['eligible_with_chunks']==1 for r in cross)
    assert report['source_host_breakdown']['www.njxzc.edu.cn']['document_count']==1
    assert report['recorded_publishers']=={'原文记录单位':1}
    assert not report['college_assignment_verified']
