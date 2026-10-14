from app.model_evidence import prepare_units,decode_units
from app.campus_qa import validate_generated_response
from tests.test_source_versions import evidence


def row(identity='a',document='one',text='原始首行',**values):
    return {'id':identity,'document_id':document,'text':text,'title':'管理办法','location':'位置',
            'sha256':'a'*64,**values}


def window(identity='a',document='one'):
    return row(identity,document,supporting_chunks=[{'id':identity,'text':'申请前提，','location':'第 1 页 / 段落 1 / 字符 1'},
        {'id':identity+'2','text':'以及审批条件。','location':'第 1 页 / 段落 2 / 字符 1'}])


def test_coherent_unit_expands_to_original_citations_not_a_synthetic_quote():
    units,originals,prompt,omitted=prepare_units([window()])
    assert len(units)==1 and prompt[0]['text']=='申请前提，\n以及审批条件。'
    selected,claims=decode_units([units[0]],[{'text':'需要申请和审批。','ids':['E1']}],originals)
    assert [r['quote'] for r in selected]==['申请前提，','以及审批条件。']
    assert claims[0]['ids']==['a','a2'] and omitted==0


def test_full_window_is_omitted_instead_of_half_sent_when_budget_is_small():
    units,originals,prompt,omitted=prepare_units([window(),row('b','two','短句')],budget=5)
    assert len(units)==1 and prompt[0]['text']=='短句' and omitted==1
    assert originals['E1'][0]['document_id']=='two'


def test_input_budget_counts_join_separators_and_keeps_documents_separate():
    units,originals,prompt,omitted=prepare_units([window(),window('b','two')],budget=15)
    assert sum(len(u['text']) for u in units)<=15 and len(units)==1 and omitted==1
    assert len({p['document_id'] for p in originals['E1']})==1


def test_only_hash_verified_file_year_is_exposed_as_original_year():
    _,_,prompt,_=prepare_units([row(original_version=evidence())])
    assert prompt[0]['original_file_year']=='2017' and not prompt[0]['current_validity_verified']
    _,_,prompt,_=prepare_units([row(original_version=evidence(sha='b'*64))])
    assert 'original_file_year' not in prompt[0]


def test_original_year_label_is_allowed_but_user_assumption_and_other_year_are_rejected():
    units,_,_,_=prepare_units([row(text='补考合格按60分登记。',original_version=evidence())])
    parsed={'citations':[{'id':'E1','quote':units[0]['text']}],'explanation':[
        {'text':'2017年办法规定补考合格按60分登记。','ids':['E1']},
        {'text':'80分合格后按60分登记。','ids':['E1']},
        {'text':'2026年办法规定补考合格按60分登记。','ids':['E1']}]}
    _,claims=validate_generated_response(parsed,units)
    assert [c['text'] for c in claims]==['2017年办法规定补考合格按60分登记。']
    units[0]['sha256']='b'*64
    assert validate_generated_response(parsed,units)[1]==[]


def test_budgeted_single_fragment_is_omitted_whole_instead_of_losing_exception():
    units,originals,prompt,omitted=prepare_units([row(text='abcdef')],budget=4)
    assert not units and not originals and not prompt and omitted==1


def test_multiple_selected_units_deduplicate_original_ids_and_keep_claim_mapping():
    units,originals,_,_=prepare_units([window(),row('b','two')])
    selected,claims=decode_units(units+units,[{'text':'比较结果','ids':['E1','E2']}],originals)
    assert [r['id'] for r in selected]==['a','a2','b']
    assert claims[0]['ids']==['a','a2','b']
