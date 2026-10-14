import importlib.util
from pathlib import Path

import pytest
from bs4 import BeautifulSoup


spec = importlib.util.spec_from_file_location("isolated_published_links", Path(__file__).parents[1] / "app/published_links.py")
links = importlib.util.module_from_spec(spec)
spec.loader.exec_module(links)


def extract(script, **limits):
    return links.extract_published_links(BeautifulSoup("<script>" + script + "</script>", "html.parser"), **limits)


def test_published_carousel_literal_fields_and_titles():
    assert extract('var w22imgJsons=[{title:"文化长廊2",src:"/photo.jpg",url:"/4a/5a/c6712a84570/page.htm"},{}];w22imgJsons.pop();') == [
        ("/4a/5a/c6712a84570/page.htm", "文化长廊2", "script_literal_url")
    ]


def test_calendar_html_anchor_wins_label_and_deduplicates_url_field():
    assert extract('var calendar_wh=[{"title":"<a href=\'/3f/8f/c9138a147343/page.htm\' title=\'第十七届课堂教学优秀奖\'>截止时间</a>","url":"/3f/8f/c9138a147343/page.htm"}];') == [
        ("/3f/8f/c9138a147343/page.htm", "第十七届课堂教学优秀奖", "script_literal_anchor")
    ]


def test_escaped_quotes_slashes_unicode_hex_and_trailing_comma():
    assert extract(r'''const w1imgJsons = [{title:'\u6653\u5e84\x20\'通知\'', url:"\/a\/page.htm?x=1\u0026y=2",},];''') == [
        ("/a/page.htm?x=1&y=2", "晓庄 '通知'", "script_literal_url")
    ]


def test_escaped_anchor_quotes_and_html_entities():
    assert extract(r'''let calendar_wh = [{title:"&lt;a href=\"/notice/page.htm?a=1&amp;b=2\"&gt;A &amp; B&lt;/a&gt;"}];''') == [
        ("/notice/page.htm?a=1&b=2", "A & B", "script_literal_anchor")
    ]


@pytest.mark.parametrize("value", ["2026-10-09", "晓庄通知", "javascript:alert(1)", "data:text/html,test", "#", "mailto:a@example.com", "/{placeholder}/page.htm", "/bad path/page.htm", "<a href='/x'>"])
def test_non_url_data_is_not_a_link(value):
    import json
    assert extract('var w1imgJsons=[{url:' + json.dumps(value) + '}];') == []


def test_external_and_account_paths_are_returned_for_caller_scope_checks():
    assert [row[0] for row in extract('var w1imgJsons=[{url:"https://example.com/a.htm"},{url:"https://authserver.njxzc.edu.cn/login"},{url:"//other.example/x.htm"}];')] == [
        "https://example.com/a.htm", "https://authserver.njxzc.edu.cn/login", "//other.example/x.htm"
    ]


def test_no_javascript_execution_or_dynamic_expression_interpretation(tmp_path):
    marker = tmp_path / "must-not-exist"
    script = 'globalThis.fetch("/api/data");throw new Error("never executed");var calendar_wh=[{title:"<a href=\'/x/page.htm\' onclick=\'throw 1\'>X</a>",url:"/x/page.htm"}];'
    assert extract(script) == [("/x/page.htm", "X", "script_literal_anchor")]
    assert not marker.exists()
    assert extract('var w1imgJsons=[{url:(function(){throw 1})()}];') == []
    assert extract('var w1imgJsons=[{url:"/part/" + "page.htm"}];') == []
    assert extract('var w1imgJsons=[{url:`/x/${value}.htm`}];') == []


def test_only_known_data_array_declarations_not_ajax_templates_or_comments():
    script = '''// var w1imgJsons=[{url:"/comment.htm"}];
    var other=[{url:"/unrelated.htm"}]; $.ajax({url:"/api/data"});
    var template="var calendar_wh=[{url:'/quoted.htm'}];";
    /*var calendar_wh=[{url:"/block.htm"}];*/
    var w2imgJsons=[{title:"real",url:"/real.htm"}];'''
    assert extract(script) == [("/real.htm", "real", "script_literal_url")]


def test_limits_skip_oversized_and_bound_output_and_script_count():
    script = 'var w1imgJsons=[{url:"/one.htm"},{url:"/two.htm"}];'
    assert extract(script, max_script_bytes=10) == []
    assert len(extract(script, max_links=1)) == 1
    soup = BeautifulSoup('<script>var w1imgJsons=[{url:"/one.htm"}];</script><script>var w2imgJsons=[{url:"/two.htm"}];</script>', 'html.parser')
    assert len(links.extract_published_links(soup, max_scripts=1)) == 1
    assert len(links.extract_published_links(soup, max_total_script_bytes=45)) == 1
    assert extract(script, max_links=0) == []


def test_literal_depth_malformed_strings_and_src_scripts_fail_closed():
    assert extract('var calendar_wh=[' + '[' * 10 + '{url:"/deep.htm"}' + ']' * 10 + '];') == []
    assert extract(r'''var w1imgJsons=[{url:"/bad\q/page.htm"}];''') == []
    assert extract('var w1imgJsons=[{url:"/unterminated.htm}];') == []
    soup = BeautifulSoup('<script src="/dynamic.js">var w1imgJsons=[{url:"/x.htm"}];</script>', 'html.parser')
    assert links.extract_published_links(soup) == []


def test_label_omits_scripts_and_styles_and_supports_surrogate_pair():
    assert extract(r'''var w1imgJsons=[{url:"/x.htm", title:"晓庄\uD83D\uDE00<script>throw 1<\/script><style>hidden<\/style>通知"}];''') == [
        ("/x.htm", "晓庄😀 通知", "script_literal_url")
    ]
