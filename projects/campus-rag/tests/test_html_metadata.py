from bs4 import BeautifulSoup
import pytest
from app.html_metadata import displayed_article_date
from app.ingest import parse


def metadata(value):
    return displayed_article_date(BeautifulSoup(value,'html.parser'))


def test_displayed_slash_date_preserves_unlabelled_role_instead_of_claiming_first_publication():
    value='<span class="arti_update">2026/01/20 01:42</span><div class="wp_articlecontent"><p>填表日期2026年1月16日</p></div>'
    day,warnings,evidence=metadata(value)
    assert day=='2026-01-20' and warnings
    assert evidence[0]['role']=='unlabelled_page_timestamp'
    title,published,_,blocks,warnings,_=parse(value.encode(),'.html')
    assert published==day and warnings
    assert any('填表日期' in text for _,text in blocks)


@pytest.mark.parametrize('value',['2026/02/30 10:00','2026/01/20 24:00','2026/01/20 10:60',
    '2026/01/20 10:00:60','活动于2026/01/20举行','2026/01/20 至 2026/02/01'])
def test_invalid_or_nonmetadata_date_not_inferred(value):
    assert metadata(f'<span class="arti_update">{value}</span>')[0] is None


def test_body_event_date_and_quoted_metadata_class_do_not_supply_publication_date():
    value='<div class="wp_articlecontent"><p>会议2026/01/20</p><span class="arti_update">2026/01/20 10:00</span></div>'
    assert metadata(value)==(None,[],[])
    assert parse(value.encode(),'.html')[1] is None


def test_conflicting_metadata_dates_remain_unknown():
    day,warnings,evidence=metadata('<span class="arti_update">2026/01/20</span><span class="arti_time">2026/02/01</span>')
    assert day is None and warnings and len(evidence)==2


def test_explicit_publication_label_and_valid_leap_day_do_not_need_unlabelled_warning():
    day,warnings,evidence=metadata('<span class="Article_PublishDate">发布时间：2024/2/29 09:00</span>')
    assert day=='2024-02-29' and not warnings and evidence[0]['role']=='explicit_publication'


def test_old_explicit_labelled_dash_date_keeps_existing_precedence():
    content='<p>发布时间：2026-01-01</p><span class="arti_update">2026/02/01</span><div class="wp_articlecontent"><p>原正文</p></div>'
    assert parse(content.encode(),'.html')[1]=='2026-01-01'
