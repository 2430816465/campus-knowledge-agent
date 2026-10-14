import json
import sqlite3
import pytest
from app.source_versions import original_year,open_cache,save_evidence,read_evidence,enrich_metadata,PARSER_VERSION,valid_record
from app.source_scope import eligibility


def evidence(year='2017',sha='a'*64):
    return {'state':'ready','year':year,'source_sha256':sha,'parser_version':PARSER_VERSION,
            'basis':'school_document_number_and_closing_date','evidence':[{'segment':1,'quote':'南晓院〔2017〕1号'}],
            'current_validity_verified':False}


def doc(identity='one',**values):
    return {'id':identity,'title':'课程考核办法','sha256':'a'*64,'visibility':'public','status':'pending_review',
            'parent_id':None,'published_at':'2018-06-05',**values}


def test_document_number_and_closing_date_with_spaced_digits_and_page_footer():
    result=original_year(['南京晓庄学院文件 南晓院教字〔2017〕1号 第一章 总则 第一条 引用〔2015〕1号',
                          '教务处 2017 年 1 月 10 日 南京晓庄学院教务处 2017年1月10日印发 - 6 -'])
    assert result['state']=='ready' and result['year']=='2017'
    assert result['evidence'][1]['segment']==2
    assert result['current_validity_verified'] is False


def test_own_school_closing_signature_is_not_reprint_date():
    result=original_year(['学生勤工助学实施细则 第一条', '第三十二条 原2015年规定废止 南京晓庄学院 20 19 年 1 月 1 8 日'])
    assert result['state']=='ready' and result['year']=='2019'


@pytest.mark.parametrize('segments',[
    ['课程考核办法 第一条 根据南晓院〔2017〕1号规定，2024年执行。'],
    ['南晓院〔2017〕1号 课程考核办法 第一条','南京晓庄学院2018年1月1日'],
    ['南晓院〔2017〕1号 南晓院〔2018〕1号 第一条','2018年1月1日'],
    ['课程考核办法','本办法2019年施行，详情另行通知。'],
    ['学校新闻','南京晓庄学院2019年1月1日'],
    ['课程考核办法','南京晓庄学院2019年2月31日'],
    [],
])
def test_reference_dates_conflicts_news_and_invalid_dates_are_not_original_version(segments):
    assert original_year(segments)['state']=='unknown'


def test_year_precedence_keeps_title_file_and_reprint_separate():
    meta={'one':doc(original_version=evidence())}
    decision=eligibility('one',meta)
    assert decision['effective_years']==['2017']
    assert decision['year_basis']['source']=='original_version'
    assert {x['source'] for x in decision['year_evidence']}=={'original_version','published_at'}
    meta['one']['title']='2026年课程考核通知'
    assert eligibility('one',meta)['effective_years']==['2026']


def test_original_year_does_not_bypass_ancestor_permissions_or_hash_change():
    meta={'one':doc(parent_id='private',original_version=evidence()),'private':doc('private',visibility='private')}
    assert not eligibility('one',meta)['eligible']
    meta['one']['parent_id']=None;meta['one']['sha256']='b'*64
    assert eligibility('one',meta)['effective_years']==['2018']


def test_undated_child_uses_parent_original_before_parent_reprint():
    meta={'one':doc(published_at=None,parent_id='parent'),
          'parent':doc('parent',original_version=evidence())}
    decision=eligibility('one',meta)
    assert decision['effective_years']==['2017'] and decision['year_basis']['document_id']=='parent'


def test_cache_resume_immutable_key_and_readonly_lookup(tmp_path):
    path=tmp_path/'cache.sqlite3'
    connection=open_cache(path)
    save_evidence(connection,'a'*64,original_year(['南晓院〔2017〕1号 第一条','2017年1月10日']),'first')
    save_evidence(connection,'a'*64,{'state':'ready','year':'2030'},'attempted overwrite')
    connection.close()
    before=path.read_bytes()
    records=read_evidence(path,['a'*64,'b'*64])
    assert records['a'*64]['year']=='2017' and 'b'*64 not in records
    assert path.read_bytes()==before
    metadata={'one':doc(),'other':doc('other',sha256='b'*64)}
    enriched=enrich_metadata(metadata,path)
    assert 'original_version' not in metadata['one']
    assert enriched['one']['original_version']['year']=='2017' and 'original_version' not in enriched['other']


def test_missing_or_corrupt_cache_does_not_create_or_write(tmp_path):
    path=tmp_path/'missing.sqlite3'
    assert read_evidence(path,['a'*64])=={} and not path.exists()
    path.write_bytes(b'not sqlite')
    assert read_evidence(path,['a'*64])=={} and path.read_bytes()==b'not sqlite'


@pytest.mark.parametrize('change',[{'year':'2030'},{'source_sha256':'b'*64},{'current_validity_verified':True},
                                  {'parser_version':'unrecognized'},{'evidence':[]},{'basis':'guessed'}])
def test_corrupt_or_unbound_proof_cannot_override_year(change):
    original={**evidence(),**change}
    assert not valid_record(original,'a'*64)
    assert eligibility('one',{'one':doc(original_version=original)})['effective_years']==['2018']


def test_live_retrieval_uses_original_file_year_with_warning(tmp_path,monkeypatch):
    from tests.test_campus_qa import factory,add
    from app.campus_qa import campus_retrieve
    import app.config as config
    monkeypatch.setattr(config,'DATA',tmp_path)
    cache=open_cache(tmp_path/'source-versions'/'evidence.sqlite3')
    save_evidence(cache,'a'*64,original_year(['南晓院〔2017〕1号 第一条','2017年1月10日']),'now');cache.close()
    with factory()() as session:
        document,_=add(session,'课程考核补考成绩合格者以60分计。',title='课程考核办法')
        document.published_at='2018-06-05';session.commit()
        hits=campus_retrieve(session,'2017课程考核补考合格成绩是多少？')
        assert hits and hits[0]['document_id']==document.id
        assert '不证明当前有效' in ''.join(hits[0]['warnings'])
        assert not campus_retrieve(session,'2018课程考核补考合格成绩是多少？')
        document.visibility='private';session.commit()
        assert not campus_retrieve(session,'2017课程考核补考合格成绩是多少？')
