import pytest
from scripts.downloaded_inventory import classification


@pytest.mark.parametrize('state,error,doc,expected', [
    (None,None,None,'pending'),
    ('imported',None,None,'broken_document_link'),
    ('imported',None,{'status':'pending_review'},'searchable_unreviewed'),
    ('imported',None,{'status':'published'},'published'),
    ('partial_parse','OCR pending',None,'partial_parse'),
    ('parse_failed','empty OCR',None,'parse_failed'),
    ('not_searchable','navigation page',None,'archive_only_navigation_or_shell'),
    ('not_searchable','decorative image',None,'archive_only_nonbody_image'),
    ('not_searchable','Legacy DOC',None,'unsupported_or_unresolved_format'),
    ('conversion_failed','converter timeout',None,'conversion_failed'),
])
def test_downloaded_does_not_imply_answerable(state,error,doc,expected):
    assert classification({'import_state':state,'import_error':error},doc)==expected
