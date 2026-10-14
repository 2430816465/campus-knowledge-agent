import hashlib
import sqlite3
import pytest
from app.site_directory import DIRECTORIES,parse_directory,read_directories,directory_coverage

URL='https://www.njxzc.edu.cn/7240/list.htm'


def html(links,heading='二级学院'):
    return (f'<h2>{heading}</h2><div class="col_news_list">{links}</div>'
        '<footer><a href="https://fake.njxzc.edu.cn/">脚注学院</a></footer>').encode()


def parse(payload,url=URL):
    return parse_directory(payload,url,hashlib.sha256(payload).hexdigest())


def archive(tmp_path,payload,*,final_url=URL,digest=None):
    digest=digest or hashlib.sha256(payload).hexdigest()
    (tmp_path/'blobs').mkdir(exist_ok=True);(tmp_path/'blobs'/digest).write_bytes(payload)
    with sqlite3.connect(tmp_path/'frontier.sqlite3') as c:
        c.execute('CREATE TABLE urls(url,state,sha256,checked_at,final_url)')
        c.execute('INSERT INTO urls VALUES(?,?,?,?,?)',(URL,'fetched',digest,'2026-10-09T10:32:06Z',final_url))


def test_joint_literal_name_kept_once_and_footer_not_used_as_directory_evidence():
    values=parse(html('<a href="http://ie.njxzc.edu.cn/">信息工程学院、人工智能学院</a>'))
    assert len(values)==1 and values[0]['name']=='信息工程学院、人工智能学院'
    assert values[0]['status']=='snapshot_site_identity'
    assert values[0]['evidence']['source_url']==URL
    assert values[0]['evidence']['anchor_ordinal']==1


@pytest.mark.parametrize('target,status',[
    ('https://www.njxzc.edu.cn/a.htm','shared_main_site'),
    ('https://unit.njxzc.edu.cn/a.htm','non_homepage_link'),
    ('https://unit.njxzc.edu.cn/?login=1','non_homepage_link'),
    ('https://unit.njxzc.edu.cn.evil.test/','outside_school_domain'),
    ('https://external.example/','outside_school_domain'),
    ('javascript:alert(1)','unsupported_link'),
    ('https://user:password@unit.njxzc.edu.cn/','unsupported_link'),
    ('https://unit.njxzc.edu.cn:444/','unsupported_link'),
])
def test_unassigned_targets_do_not_expand_crawl_scope_or_attribute_main_site(target,status):
    entry=parse(html(f'<a href="{target}">示例学院</a>'))[0]
    assert entry['status']==status


def test_truncated_name_uses_only_agreeing_literal_title():
    values=parse(html('<a href="https://one.njxzc.edu.cn" title="教师发展学院（继续教育学院合署）">教师发展学院...</a>'
        '<a href="https://two.njxzc.edu.cn" title="另一名称">示例学院...</a>'))
    assert values[0]['name']=='教师发展学院（继续教育学院合署）'
    assert values[1]['status']=='truncated_name'


def test_unknown_source_wrong_hash_or_wrong_heading_cannot_establish_site_identity():
    payload=html('<a href="https://unit.njxzc.edu.cn">示例学院</a>')
    with pytest.raises(ValueError):parse(payload,'https://evil.test/7240/list.htm')
    with pytest.raises(ValueError):parse_directory(payload,URL,'0'*64)
    with pytest.raises(ValueError):parse(html('<a href="https://unit.njxzc.edu.cn">示例学院</a>',heading='普通新闻'))


def test_read_only_archive_corruption_and_unexpected_redirect_never_assign_entries(tmp_path):
    payload=html('<a href="https://unit.njxzc.edu.cn">示例学院</a>')
    archive(tmp_path,payload,digest='0'*64)
    result=read_directories(tmp_path)
    assert not result['entries'] and result['sources'][0]['status']=='rejected'
    with sqlite3.connect(tmp_path/'frontier.sqlite3') as c:
        c.execute('UPDATE urls SET sha256=?,final_url=?',(hashlib.sha256(payload).hexdigest(),'https://other.njxzc.edu.cn/'))
    (tmp_path/'blobs'/hashlib.sha256(payload).hexdigest()).write_bytes(payload)
    result=read_directories(tmp_path)
    assert not result['entries'] and result['sources'][0]['status']=='rejected'


def test_conflicting_names_stay_ambiguous_not_double_attributed(tmp_path):
    archive(tmp_path,html('<a href="https://unit.njxzc.edu.cn">甲学院</a><a href="http://unit.njxzc.edu.cn">乙学院</a>'))
    directory=read_directories(tmp_path)
    assert all(e['status']=='ambiguous_host_identity' for e in directory['entries'])
    result=directory_coverage(directory,{'source_host_breakdown':{'unit.njxzc.edu.cn':{'document_count':3}}})
    assert not result['matched_business_hosts']
    assert all(e['business_source_inventory'] is None for e in result['entries'])
    assert not result['document_applicability_verified']


def test_missing_host_is_explicit_gap_and_report_does_not_write_publisher(tmp_path):
    archive(tmp_path,html('<a href="https://one.njxzc.edu.cn">甲学院</a><a href="https://two.njxzc.edu.cn">乙学院</a>'))
    before=(tmp_path/'frontier.sqlite3').read_bytes()
    directory=read_directories(tmp_path)
    result=directory_coverage(directory,{'source_host_breakdown':{
        'one.njxzc.edu.cn':{'document_count':2,'eligible_with_chunks':1},'unmapped.njxzc.edu.cn':{'document_count':3}}})
    assert (tmp_path/'frontier.sqlite3').read_bytes()==before
    assert result['entries'][1]['business_inventory_status']=='no_business_documents_for_listed_host'
    assert result['matched_business_hosts']==['one.njxzc.edu.cn']
    assert result['business_hosts_without_directory_identity']==['unmapped.njxzc.edu.cn']
    assert not result['article_publisher_updated'] and not result['full_school_coverage_proven']
