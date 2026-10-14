from io import BytesIO
from types import SimpleNamespace
import struct
import subprocess

import pytest
from PIL import Image

from app.wmf_bitmap import inspect_bitmap_wmf,render_bitmap_wmf
from app.docx_images import extract_docx_images,A,R
from tests.test_docx_images import document


def bitmap_wmf():
    # Real single-DIB WMF: 12x12 red source, one-inch destination.
    pixels=b'\x00\x00\xff'*12*12
    dib=struct.pack('<IiiHHIIiiII',40,12,12,1,24,0,len(pixels),0,0,0,0)+pixels
    def record(kind,value):return struct.pack('<IH',(len(value)+6)//2,kind)+value
    drawing=struct.pack('<Ihhhhhhhh',0x00cc0020,12,12,0,0,144,144,0,0)+dib
    records=[record(0x20b,struct.pack('<hh',0,0)),record(0x20c,struct.pack('<hh',144,144)),
             record(0xb41,drawing),record(0,b'')]
    header=struct.pack('<HHHIHIH',1,9,0x300,(18+sum(map(len,records)))//2,0,max(map(len,records))//2,0)
    placeable=struct.pack('<IHhhhhHI',0x9ac6cdd7,0,0,0,144,144,144,0)
    checksum=0
    for word in struct.unpack('<10H',placeable):checksum ^= word
    return placeable+struct.pack('<H',checksum)+header+b''.join(records)


def test_single_bitmap_header_and_budgets_are_independent_of_renderer():
    blob=bitmap_wmf()
    assert inspect_bitmap_wmf(blob)==(288,288)
    with pytest.raises(ValueError,match='pixel budget'):inspect_bitmap_wmf(blob,100)
    with pytest.raises(ValueError,match='byte budget'):inspect_bitmap_wmf(b'bad')


@pytest.mark.parametrize('offset,fmt,value',[
    (20,'H',0),(26,'H',0x999),(28,'I',99),(32,'H',1),
    (40,'I',2),(44,'H',0x626),(66,'I',0x1234),(72,'h',11),
    (78,'h',143),(90,'i',20001),(100,'H',8),(102,'I',1),
],ids=['checksum','version','file_size','objects','record_length','escape','rop','crop',
       'destination','source_size','bit_depth','compression'])
def test_unsafe_or_unverified_records_never_reach_native_renderer(monkeypatch,offset,fmt,value):
    import app.wmf_bitmap as wmf
    blob=bytearray(bitmap_wmf());struct.pack_into('<'+fmt,blob,offset,value)
    def forbidden(*a,**k):raise AssertionError('Native renderer must not execute')
    monkeypatch.setattr(wmf.subprocess,'run',forbidden)
    with pytest.raises(ValueError):render_bitmap_wmf(bytes(blob))


def test_actual_finite_child_renderer_matches_known_bitmap_and_marks_coordinates():
    if not hasattr(Image.core,'drawwmf'):pytest.skip('Windows renderer unavailable')
    png,note=render_bitmap_wmf(bitmap_wmf())
    with Image.open(BytesIO(png)) as image:
        assert image.size==(288,288) and image.convert('RGB').getpixel((144,144))==(255,0,0)
    assert '288DPI' in note and 'SHA256=' in note and '不证明真实性' in note


def test_timeout_or_invalid_output_retains_fail_closed_boundary(monkeypatch):
    import app.wmf_bitmap as wmf
    if not hasattr(Image.core,'drawwmf'):pytest.skip('Windows renderer unavailable')
    def timeout(*a,**kw):
        assert kw['timeout']==15 and kw['capture_output'] and kw['input']==bitmap_wmf()
        raise subprocess.TimeoutExpired('render',15)
    monkeypatch.setattr(wmf.subprocess,'run',timeout)
    with pytest.raises(subprocess.TimeoutExpired):render_bitmap_wmf(bitmap_wmf())
    monkeypatch.setattr(wmf.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=1,stdout=b''))
    with pytest.raises(ValueError,match='renderer failed'):render_bitmap_wmf(bitmap_wmf())


def test_wmf_ocr_drops_high_confidence_tilted_text_and_keeps_upright_candidate():
    if not hasattr(Image.core,'drawwmf'):pytest.skip('Windows renderer unavailable')
    doc=document();node=next(doc.element.body.iter(A+'blip'))
    part=doc.part.rels[node.get(R+'embed')].target_part
    part._blob=bitmap_wmf();part._content_type='image/x-wmf'
    def ocr(_):return [([[1,20],[90,1],[110,200],[20,220]],'错误方向文字',.99),
        ([[50,230],[220,230],[220,260],[50,260]],'电子专用章',.98)]
    blocks,warnings=extract_docx_images(doc,ocr)
    assert len(blocks)==1 and blocks[0][1]=='电子专用章' and '/ WMF OCR' in blocks[0][0]
    assert any('渲染图 SHA256=' in w for w in warnings)
    assert any('方向未核实' in w and '待 OCR' in w for w in warnings)
