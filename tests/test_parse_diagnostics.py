"""Read-only archive diagnostics cannot turn source shells into verified rules."""
import hashlib
import sqlite3
import pytest
from bs4 import BeautifulSoup
from app.parse_diagnostics import audit_failures,body_resources


@pytest.fixture
def archive(tmp_path):
    blobs=tmp_path/'blobs';blobs.mkdir();frontier=tmp_path/'frontier.sqlite3'
    with sqlite3.connect(frontier) as c:
        c.execute('CREATE TABLE urls(url TEXT PRIMARY KEY,final_url TEXT,mime TEXT,sha256 TEXT,document_id TEXT,state TEXT,import_state TEXT)')
    def add(name,content=b'',mime='text/html',state='fetched',import_state='parse_failed',document_id=None):
        url='https://www.njxzc.edu.cn/'+name
        digest=hashlib.sha256(content).hexdigest();(blobs/digest).write_bytes(content)
        with sqlite3.connect(frontier) as c:
            c.execute('INSERT INTO urls VALUES(?,?,?,?,?,?,?)',(url,url,mime,digest,document_id,state,import_state))
        return url,digest
    return frontier,blobs,add


def test_literal_attachment_shell_is_diagnostic_not_relabelled_success(archive):
    f,b,add=archive
    add('page.htm',b'<div class="wp_articlecontent"><div pdfsrc="/file.pdf"></div></div>',document_id='parent')
    add('file.pdf',b'%PDF-fake',mime='application/pdf',import_state='imported',document_id='child')
    before=f.read_bytes();result=audit_failures(f,b)
    assert result['categories']=={'html_source_shell_with_literal_resources':1}
    assert result['literal_resource_states']=={'archive_record_imported':1}
    assert result['review_states_modified'] is False and result['http_or_ocr_or_embedding_requests']==0
    assert f.read_bytes()==before
    with sqlite3.connect(f) as c:assert c.execute("SELECT import_state FROM urls WHERE document_id='parent'").fetchone()[0]=='parse_failed'


@pytest.mark.parametrize('markup,category',[
    (b'<div class="wp_articlecontent"></div>','html_empty_without_supported_literal_resource'),
    (b'<a href="/x.pdf">outside</a><div class="wp_articlecontent"></div>','html_empty_without_supported_literal_resource'),
    (b'<div>navigation without article</div>','html_no_article_container'),
    (b'<div class="wp_articlecontent">A substantial original paragraph with more than twenty characters.</div>','html_substantial_text_requires_parser_review'),
])
def test_html_categories_do_not_mislabel_every_failure_as_pdf_ocr(archive,markup,category):
    f,b,add=archive;add('page.htm',markup)
    assert audit_failures(f,b)['categories']=={category:1}


def test_literal_resources_are_official_supported_urls_without_execution():
    soup=BeautifulSoup('''<div><iframe src="/x.pdf"></iframe><img src="/a.png">
    <a href="https://external.example/x.pdf">external</a><a href="javascript:evil()">bad</a>
    <embed src="https://user:pass@www.njxzc.edu.cn/secret.pdf"><a href="/unknown.viewer">viewer</a>
    <script>throw new Error('NEVER RUN')</script></div>''','html.parser')
    assert body_resources(soup.div,'https://www.njxzc.edu.cn/page.htm')==[
        'https://www.njxzc.edu.cn/a.png','https://www.njxzc.edu.cn/x.pdf']


def test_finite_snapshot_and_unknown_resource_stay_explicit(archive):
    f,b,add=archive
    for i in range(3):add(f'{i}.htm',b'<div class="wp_articlecontent"><object data="/untracked.pdf"></object></div>')
    result=audit_failures(f,b,limit=1)
    assert result['audited']==1 and result['remaining_not_audited']==2
    assert result['literal_resource_states']=={'untracked_literal_resource':1}


def test_hash_mismatch_is_not_classified_as_source_shell(archive):
    f,b,add=archive;_,digest=add('page.htm',b'<div class="wp_articlecontent"><img src="/a.png"></div>')
    (b/digest).write_bytes(b'changed')
    assert audit_failures(f,b)['categories']=={'blob_hash_mismatch':1}


def test_missing_frontier_does_not_create_database(tmp_path):
    path=tmp_path/'absent.sqlite3'
    with pytest.raises(sqlite3.OperationalError):audit_failures(path,tmp_path)
    assert not path.exists()


@pytest.mark.parametrize('limit',[0,-1,5001,True])
def test_unbounded_or_invalid_limits_are_rejected(archive,limit):
    f,b,_=archive
    with pytest.raises(ValueError):audit_failures(f,b,limit=limit)
