from scripts.image_ocr_inventory import image_health, image_url


def doc(**kwargs):
    return dict(status='pending_review', visibility='public', parent_id='parent', warnings=[], **kwargs)


def test_old_ocr_text_remains_text_with_geometry_gap():
    health = image_health(doc(), ['OCR 框 1 / 置信度 0.980'])
    assert health['ocr_chunks'] == 1
    assert health['gaps'] == ['legacy_or_missing_box_coordinates']


def test_coordinates_do_not_hide_partial_warning():
    d = doc(); d.update(status='partial_parse', warnings=['2 个框待 OCR 复核'])
    health = image_health(d, ['OCR 框 1 / 置信度 0.980 xy=0,0;30,0;30,10;0,10'])
    assert health['coordinate_chunks'] == 1
    assert 'explicit_ocr_recovery_warning' in health['gaps']
    assert 'document_status_partial_parse' in health['gaps']


def test_empty_private_or_parentless_image_is_not_complete():
    d = doc(); d.update(visibility='private', parent_id=None)
    assert set(image_health(d, [])['gaps']) == {'no_ocr_text_chunks', 'not_public', 'missing_notice_parent_link'}
    assert image_health(None, [])['gaps'] == ['not_linked_to_business_document']


def test_html_error_at_image_url_excluded_and_unsupported_image_included():
    assert not image_url({'url':'https://a/a.png', 'final_url':None, 'mime':'text/html'})
    assert image_url({'url':'https://a/a.svg', 'final_url':None, 'mime':'image/svg+xml'})
    assert image_url({'url':'https://a/download', 'final_url':'https://a/a.JPG?q=x', 'mime':'image/jpeg'})
