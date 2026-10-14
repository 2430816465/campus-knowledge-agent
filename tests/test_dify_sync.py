"""Regression tests for publication boundaries and recoverable remote versions."""
from types import SimpleNamespace
import pytest
from scripts.sync_dify import run_sync,KnowledgeClient

class FakeKnowledge:
    base='http://127.0.0.1:8080/v1'
    dataset='33246954-b0d6-4b77-b2d6-a687240201a8'
    def __init__(self):self.docs={};self.states={};self.calls=[]
    def ensure_document(self,payload):
        name=payload['name'];found=name in self.docs
        if not found:self.docs[name]='remote-'+str(len(self.docs)+1)
        return self.docs[name],found
    def wait_index(self,remote):return {'indexing_status':'completed'}
    def metadata(self,remote,values):self.calls.append(('metadata',remote,values))
    def enabled(self,remote,enabled):self.states[remote]=enabled

def job(sha,version):
    doc=SimpleNamespace(id='local',sha256=sha,version=version,source_url='https://ie.njxzc.edu.cn/example',status='published')
    return (doc,{'name':'campus-local-'+sha})

def test_trial_credentials_cannot_be_used_for_formal_sync(tmp_path):
    with pytest.raises(ValueError):run_sync({'sample_only':True},[],tmp_path/'state.json',client=FakeKnowledge())

def test_formal_credentials_cannot_be_used_for_trial_sync(tmp_path):
    with pytest.raises(ValueError):run_sync({},[],tmp_path/'state.json',sample=True,client=FakeKnowledge())

def test_version_replacement_and_rollback_preserve_remote_identity(tmp_path):
    api=FakeKnowledge();path=tmp_path/'state.json';old=job('old',1);new=job('new',2)
    a=run_sync({},[old],path,client=api)['documents'][0]['remote_id']
    b=run_sync({},[new],path,client=api)['documents'][0]['remote_id']
    assert a!=b and api.states[a] is False and api.states[b] is True
    restored=run_sync({},[old],path,client=api)
    assert restored['documents'][0]['remote_id']==a and restored['documents'][0]['deduplicated']
    assert api.states[a] is True and api.states[b] is False
    assert len(api.docs)==2

def test_unmanaged_documents_are_never_withdrawn(tmp_path):
    api=FakeKnowledge();api.states['unmanaged-ui-document']=True
    run_sync({},[job('old',1)],tmp_path/'state.json',client=api)
    run_sync({},[],tmp_path/'state.json',client=api)
    assert api.states['unmanaged-ui-document'] is True

@pytest.mark.parametrize('base',['https://remote.example/v1','http://user:pass@localhost/v1'])
def test_nonlocal_or_embedded_credentials_rejected(base):
    with pytest.raises(ValueError):KnowledgeClient({'api_base':base,'dataset_id':FakeKnowledge.dataset,'knowledge_api_key':'unused'})
