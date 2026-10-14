from scripts.parse_priority import prioritize, resource_group


def row(name, mime='', final=None):
    return {'url': 'https://www.njxzc.edu.cn/' + name, 'final_url': final, 'mime': mime}


def test_images_then_pdf_word_preserves_order_within_type_without_mutation():
    rows = [row('a.htm'), row('a.docx'), row('b.pdf'), row('a.png'), row('b.JPG?q=1'), row('b.doc'), row('a.xls')]
    before = [r.copy() for r in rows]
    assert [r['url'].split('/')[-1] for r in prioritize(rows)] == [
        'a.png', 'b.JPG?q=1', 'b.pdf', 'a.docx', 'b.doc', 'a.htm', 'a.xls']
    assert rows == before


def test_html_error_is_not_image_and_redirect_uses_actual_suffix():
    assert resource_group(row('error.png', 'text/html; charset=utf-8')) == 'other'
    assert resource_group(row('download', 'image/png', 'https://www.njxzc.edu.cn/a.png')) == 'image'
    assert resource_group(row('a.svg', 'image/svg+xml')) == 'other'
