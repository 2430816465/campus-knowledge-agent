import copy
import hashlib
import json
import pytest
from app.evaluation import load_bank, audit_bank, original_segments, evidence_measure, read_journal, verified_window_evidence


def fixture(tmp_path):
    content = '<html><nav>wrong navigation fact</nav><div class="wp_articlecontent">每年12月31日前一次性发放。</div></html>'.encode()
    raw = tmp_path/'source.html'; raw.write_bytes(content)
    source = {'raw_name':'source.html','sha256':hashlib.sha256(content).hexdigest(),
              'source_url':'https://xsc.njxzc.edu.cn/a.htm'}
    fact = {'source_id':'one','anchor':'12月31日前'}
    case = {'id':'A','question':'什么时候发放？','standard_answer':'12月31日前','expectation':'answerable','facts':[fact]}
    bank = {'sources':{'one':source},'cases':[case]}
    metadata = {'one':{'id':'one','title':'奖学金细则','parent_id':None,'visibility':'public',
                       'status':'pending_review',**source}}
    chunks = {'one':[{'id':'chunk','text':'每年12月31日前一次性发放。'}]}
    return bank,metadata,chunks


def test_bank_fingerprint_duplicate_and_missing_fact(tmp_path):
    bank,_,_ = fixture(tmp_path)
    file=tmp_path/'bank.json'; file.write_text(json.dumps(bank),encoding='utf-8')
    assert load_bank(file)[1] == hashlib.sha256(file.read_bytes()).hexdigest()
    bank['cases'].append(copy.deepcopy(bank['cases'][0]))
    file.write_text(json.dumps(bank),encoding='utf-8')
    with pytest.raises(ValueError,match='duplicate'): load_bank(file)
    bank['cases']=bank['cases'][:1];bank['cases'][0]['facts']=[]
    file.write_text(json.dumps(bank),encoding='utf-8')
    with pytest.raises(ValueError,match='facts required'):load_bank(file)


def test_audit_requires_raw_and_live_chunk_and_metadata(tmp_path):
    bank,meta,chunks=fixture(tmp_path)
    result=audit_bank(bank,tmp_path,meta,chunks)
    assert result[0]['facts'][0]['original_segments_1based']==[1]
    assert result[0]['facts'][0]['chunk_ids']==['chunk']
    with pytest.raises(ValueError,match='unverified'):audit_bank(bank,tmp_path,meta,{})
    meta['one']['sha256']='changed'
    with pytest.raises(ValueError,match='ineligible'):audit_bank(bank,tmp_path,meta,chunks)


@pytest.mark.parametrize('change',[{'visibility':'private'},{'status':'withdrawn'},{'parent_id':'missing'},
                                    {'source_url':'https://other.example/'},{'raw_name':'other.html'}])
def test_stale_or_disallowed_sources_fail_closed(tmp_path,change):
    bank,meta,chunks=fixture(tmp_path);meta['one'].update(change)
    with pytest.raises(ValueError,match='ineligible'):audit_bank(bank,tmp_path,meta,chunks)


def test_navigation_cannot_be_standard_evidence(tmp_path):
    bank,meta,chunks=fixture(tmp_path)
    bank['cases'][0]['facts'][0]['anchor']='wrong navigation fact'
    chunks['one'][0]['text']='wrong navigation fact'
    with pytest.raises(ValueError,match='unverified'):audit_bank(bank,tmp_path,meta,chunks)


def test_original_hash_path_and_missing_article_guard(tmp_path):
    bank,_,_=fixture(tmp_path);s=bank['sources']['one']
    with pytest.raises(ValueError,match='SHA'):original_segments(tmp_path,{**s,'sha256':'bad'})
    outside=tmp_path.parent/'outside.html';outside.write_text('secret')
    with pytest.raises(ValueError,match='path'):original_segments(tmp_path,{**s,'raw_name':'../outside.html'})
    payload=b'<nav>not an article</nav>'; (tmp_path/'source.html').write_bytes(payload)
    with pytest.raises(ValueError,match='article'):original_segments(tmp_path,{**s,'sha256':hashlib.sha256(payload).hexdigest()})


def test_identical_phrase_in_wrong_source_is_not_a_hit(tmp_path):
    bank,_,_=fixture(tmp_path);case=bank['cases'][0]
    hit={'document_id':'other','text':'12月31日前'}
    assert evidence_measure(case,[hit])['all_expected_evidence_found'] is False
    hit['document_id']='one'
    measure=evidence_measure(case,[hit])
    assert measure['all_expected_evidence_found'] is True
    assert measure['answer_correct'] is None and measure['manual_review_required']
    case['expectation']='insufficient'
    assert evidence_measure(case,[])['all_expected_evidence_found'] is None


def test_resume_rejects_changed_bank_code_duplicates_or_partial_record(tmp_path):
    path=tmp_path/'events.jsonl'
    header={'bank_sha256':'sha','code_version':'code'}
    path.write_text(json.dumps(header)+'\n'+json.dumps({'id':'one'})+'\n',encoding='utf-8')
    assert read_journal(path,'sha','code')[1]=={'one'}
    with pytest.raises(ValueError,match='mismatch'):read_journal(path,'different','code')
    with pytest.raises(ValueError,match='mismatch'):read_journal(path,'sha','other')
    with path.open('a') as f:f.write(json.dumps({'id':'one'})+'\n')
    with pytest.raises(ValueError,match='duplicate'):read_journal(path,'sha','code')
    path.write_text(json.dumps(header)+'\n{"id":',encoding='utf-8')
    with pytest.raises(json.JSONDecodeError):read_journal(path,'sha','code')


def window_fixture():
    chunks = {
        'a':dict(id='a',document_id='one',text='规则前半句',location='第 1 页 / 段落 1 / 字符 1'),
        'b':dict(id='b',document_id='one',text='12月31日前一次性发放。',location='第 1 页 / 段落 2 / 字符 1')}
    hit={**chunks['a'],'supporting_chunks':[{k:v for k,v in r.items() if k!='document_id'} for r in chunks.values()]}
    return chunks,hit


def test_window_metric_is_separate_from_original_primary_chunk_metric(tmp_path):
    bank,_,_=fixture(tmp_path);case=bank['cases'][0]
    chunks,hit=window_fixture()
    assert evidence_measure(case,[hit])['all_expected_evidence_found'] is False
    windows=verified_window_evidence([hit],chunks)
    assert evidence_measure(case,windows)['all_expected_evidence_found'] is True
    assert evidence_measure(case,[hit])['all_expected_evidence_found'] is False
    assert len(verified_window_evidence([hit,hit],chunks))==2


@pytest.mark.parametrize('change',[
    {'text':'伪造日期'}, {'document_id':'other'}, {'location':'第 2 页 / 段落 2 / 字符 1'},
])
def test_window_metric_requires_fresh_exact_chunk_readback(change):
    chunks,hit=window_fixture();chunks['b'].update(change)
    with pytest.raises(ValueError,match='fabricated'):verified_window_evidence([hit],chunks)


@pytest.mark.parametrize('change',[
    {'location':'第 2 页 / 段落 2 / 字符 1'},
    {'location':'第 1 页 / 段落 3 / 字符 1'},
    {'location':'第 1 页 / 段落 2 / 字符 2'},
    {'text':'x'*201},
])
def test_metric_rejects_cross_page_gap_offset_and_long_window(change):
    chunks,hit=window_fixture();hit['supporting_chunks'][1].update(change)
    chunks['b'].update(change)
    with pytest.raises(ValueError,match='window'):verified_window_evidence([hit],chunks)


def test_window_metric_never_manufactures_a_cross_fragment_anchor():
    chunks,hit=window_fixture()
    case={'expectation':'answerable','facts':[{'source_id':'one','anchor':'前半句12月31日'}]}
    assert not evidence_measure(case,verified_window_evidence([hit],chunks))['all_expected_evidence_found']
    hit['supporting_chunks']=hit['supporting_chunks'][1:]
    with pytest.raises(ValueError,match='excludes'):verified_window_evidence([hit],chunks)


def test_cross_page_metric_requires_all_positions_and_never_joins_anchor_text():
    chunks,hit=window_fixture()
    chunks['a']['text']='自然科学类：项目负责人作为独立或第一作者在SCI'
    chunks['b'].update(text='二区及以上期刊发表1篇论文。',location='第 2 页 / 段落 1 / 字符 1')
    hit={**chunks['a'],'supporting_chunks':[dict(r) for r in chunks.values()]}
    with pytest.raises(ValueError,match='complete document'):verified_window_evidence([hit],chunks)
    out=verified_window_evidence([hit],chunks,complete_chunks=chunks)
    assert {r['id'] for r in out}=={'a','b'}
    case={'expectation':'answerable','facts':[{'source_id':'one','anchor':'SCI二区及以上'}]}
    assert evidence_measure(case,out)['all_expected_evidence_found'] is False
    full={**chunks,'hidden':dict(id='hidden',document_id='one',text='1',location='第 1 页 / 段落 3 / 字符 1')}
    with pytest.raises(ValueError,match='boundary'):
        verified_window_evidence([hit],chunks,complete_chunks=full)


def test_cross_page_metric_rejects_changed_companion():
    chunks,hit=window_fixture()
    chunks['a']['text']='自然科学类：项目负责人作为独立或第一作者在SCI'
    chunks['b'].update(text='二区及以上期刊发表1篇论文。',location='第 2 页 / 段落 1 / 字符 1')
    hit={**chunks['a'],'supporting_chunks':[dict(r) for r in chunks.values()]}
    chunks['b']['text']='修改后另一个成果要求。'
    with pytest.raises(ValueError,match='fabricated'):
        verified_window_evidence([hit],chunks,complete_chunks=chunks)
