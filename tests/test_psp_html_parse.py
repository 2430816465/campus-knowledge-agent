import hashlib

import pytest

from app.ingest import parse


HTML = '''<!DOCTYPE html><html><head><title>通知</title></head><body>
<h1>报名通知</h1><div class="wp_articlecontent">
<p>线上报名时间：2026年2月11日至3月20日16:00。</p>
<p>对象：全日制在校学生。每队最多5人。</p>
<a href="form.pdf">报名表</a><img src="poster.png">
</div></body></html>'''.encode()


@pytest.mark.parametrize('prefix', [b'', b'\xef\xbb\xbf', b' \r\n\t'])
def test_historical_psp_preserves_literal_facts_and_source_without_io(prefix, monkeypatch):
    import app.ingest as ingest
    def forbidden(*args, **kwargs):
        raise AssertionError('Parser must not fetch or invoke models')
    monkeypatch.setattr(ingest, 'fetch', forbidden)
    monkeypatch.setattr(ingest, 'embeddings', forbidden)
    payload = prefix + HTML
    before = hashlib.sha256(payload).hexdigest()
    url = 'https://ste.njxzc.edu.cn/40/27/c433a147495/page.psp'
    result = parse(payload, '.psp', url)
    normal = parse(payload, '.html', url)
    assert result[:4] == normal[:4]
    assert result[5] == normal[5]
    assert result[5][0]['url'].endswith('/40/27/c433a147495/form.pdf')
    assert any('PSP' in warning for warning in result[4])
    assert hashlib.sha256(payload).hexdigest() == before
    assert '2026年2月11日至3月20日16:00' in result[3][0][1]
    assert '每队最多5人' in result[3][1][1]


@pytest.mark.parametrize('payload', [b'%PDF-1.7', b'PK\x03\x04', b'\x89PNG\r\n',
    b'not html <html>', b'<htmlish>', b'<!doctype htmlish>', b'<html>\x00binary'])
def test_psp_suffix_is_not_enough_to_reinterpret_original(payload):
    with pytest.raises(ValueError, match='PSP'):
        parse(payload, '.psp', 'https://ste.njxzc.edu.cn/page.psp')


def test_html_root_without_doctype_and_uppercase_declaration():
    for payload in (HTML.replace(b'<!DOCTYPE html>', b''), HTML.replace(b'<!DOCTYPE html>', b'<!doctype HTML>')):
        assert parse(payload, '.psp')[3] == parse(payload, '.html')[3]
