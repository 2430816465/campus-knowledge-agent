from io import BytesIO
from hashlib import sha256
from pathlib import Path
import struct

import pytest
from sqlalchemy import select

from app.file_formats import legacy_word_package,CFB_MAGIC
from app.db import Chunk,Audit
from tests.test_appeal_retrieval import session_factory,add
from tests.test_convert_archive_doc import module,archived,FakeStore,conversion_frontier


def docx_bytes():
    from docx import Document
    stream=BytesIO();doc=Document();doc.add_paragraph('学校公开附件正文');doc.save(stream)
    return stream.getvalue()


def compound(streams):
    """Small real CFB fixture using regular 4096-byte streams, no Office needed."""
    free,end,fat=0xffffffff,0xfffffffe,0xfffffffd
    assert len(streams)<=3
    last=1+8*len(streams)
    header=bytearray(512);header[:8]=CFB_MAGIC
    struct.pack_into('<HHHH',header,24,0x3e,3,0xfffe,9)
    struct.pack_into('<H',header,32,6)
    struct.pack_into('<IIIIIIIII',header,40,0,1,0,0,4096,end,0,end,0)
    struct.pack_into('<109I',header,76,last,*([free]*108))
    directory=bytearray(512)
    def entry(index,name,kind,start,size,right=free,child=free):
        offset=index*128;encoded=(name+'\0').encode('utf-16le')
        directory[offset:offset+len(encoded)]=encoded
        struct.pack_into('<HBBIII',directory,offset+64,len(encoded),kind,1,free,right,child)
        struct.pack_into('<IQ',directory,offset+116,start,size)
    entry(0,'Root Entry',5,end,0,child=1)
    chains=[end]+[free]*127
    data=[]
    for n,(name,value) in enumerate(streams.items()):
        start=1+n*8;entry(n+1,name,2,start,4096,right=n+2 if n+1<len(streams) else free)
        value=value.ljust(4096,b'\0');assert len(value)==4096
        data.append(value)
        for sector in range(start,start+8):chains[sector]=sector+1 if sector<start+7 else end
    chains[last]=fat
    return bytes(header)+bytes(directory)+b''.join(data)+struct.pack('<128I',*chains)


def word_bytes(flags=0,table='0Table'):
    header=bytearray(32);struct.pack_into('<HH',header,0,0xa5ec,0xc1)
    struct.pack_into('<H',header,10,flags)
    return compound({'WordDocument':bytes(header),table:b'table'})


def test_compound_header_does_not_confuse_excel_encrypted_ooxml_or_word():
    assert legacy_word_package(word_bytes()) is True
    assert legacy_word_package(word_bytes(0x200,'1Table')) is True
    assert legacy_word_package(compound({'Workbook':b'spreadsheet'})) is False
    assert legacy_word_package(docx_bytes()) is False
    assert legacy_word_package(b'plain text') is False


@pytest.mark.parametrize('payload,reason',[
    (compound({'EncryptionInfo':b'crypto','EncryptedPackage':b'secret'}),'Encrypted'),
    (word_bytes(0x100),'Encrypted'),
    (word_bytes(0x200),'selected'),
    (compound({'WordDocument':b'not a Fib','0Table':b'table'}),'identity'),
    (compound({'WordDocument':b'\xec\xa5'+b'\0'*30,'Workbook':b'excel','0Table':b'table'}),'Ambiguous'),
    (CFB_MAGIC+b'bad','Malformed'),
],ids=['encrypted_ooxml','encrypted_word','missing_selected_table','invalid_fib','mixed_excel_word','truncated_cfb'])
def test_rejects_unsupported_compound_before_office(payload,reason):
    with pytest.raises(ValueError,match=reason):legacy_word_package(payload)


def test_mislabeled_docx_uses_hash_verified_doc_copy_and_reuses_derived_output(tmp_path):
    row=archived(tmp_path,word_bytes(),'legacy.docx');store=FakeStore();calls=[]
    def convert(helper,source,output):
        assert source.suffix=='.doc' and source.read_bytes()==word_bytes()
        calls.append(source);output.write_bytes(docx_bytes())
    first=module.convert_row(row,store,tmp_path/'school-archive',tmp_path/'derived',tmp_path/'helper',converter=convert)
    second=module.convert_row(row,store,tmp_path/'school-archive',tmp_path/'derived',tmp_path/'helper',converter=convert)
    assert first['state']==second['state']=='converted' and len(calls)==1
    assert first['detected_suffix']=='.doc' and first['declared_suffix']=='.docx'
    assert first['original_bytes_changed'] is False and first['original_sha256']==row['sha256']


def test_background_batch_skips_usable_docx_but_records_encrypted_failure_without_word(tmp_path):
    rows=[archived(tmp_path,docx_bytes(),'normal.docx'),
          archived(tmp_path,compound({'EncryptionInfo':b'x','EncryptedPackage':b'y'}),'encrypted.docx')]
    rows[0]['document_id']='already-searchable'
    def forbidden(*args):raise AssertionError('Encrypted input must not reach Word')
    store=FakeStore()
    events=module.run_batch(rows,store,tmp_path/'school-archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
    assert len(events)==1 and events[0]['state']=='conversion_failed'
    assert 'Encrypted Office package' in events[0]['error']
    assert events[0]['original_document_id'] is None
    with conversion_frontier() as frontier:
        frontier.execute('INSERT INTO urls VALUES (?,?,?,?,?,?,?,?)',
                         (rows[1]['url'],'fetched',rows[1]['sha256'],0,1,'parse_failed',None,'preserved-original'))
        module.save_frontier_event(frontier,events[0])
        row=frontier.execute('SELECT document_id,import_state FROM urls').fetchone()
        assert tuple(row)==('preserved-original','conversion_failed')


@pytest.mark.parametrize('boundary',['none','private_parent','withdrawn_parent','published','existing_chunks',
                                    'private_original','missing_original','converted_without_derivative'])
def test_mislabeled_original_requires_existing_public_failed_empty_source(boundary):
    with session_factory()() as session:
        parent,_=add(session,'公开通知',['附件'])
        doc,_=add(session,'误标旧Word',[],parent_id=parent.id)
        payload=word_bytes();doc.mime='.docx';doc.status='parse_failed';doc.sha256=sha256(payload).hexdigest()
        doc.source_url='https://zlpg.njxzc.edu.cn/legacy.docx'
        if boundary=='private_parent':parent.visibility='private'
        if boundary=='withdrawn_parent':parent.status='withdrawn'
        if boundary=='published':doc.status='published'
        if boundary=='private_original':doc.visibility='private'
        if boundary=='missing_original':doc.source_url='https://zlpg.njxzc.edu.cn/another.docx'
        if boundary=='converted_without_derivative':doc.status='converted'
        if boundary=='existing_chunks':session.add(Chunk(id='existing',document_id=doc.id,text='已有',location='原位置'))
        session.commit();row={'url':'https://zlpg.njxzc.edu.cn/legacy.docx','sha256':doc.sha256,'document_id':doc.id}
        before=(doc.status,doc.sha256,doc.mime,doc.parent_id,doc.source_url)
        if boundary=='none':
            assert module.BusinessStore(session).ensure_original(row,payload).id==doc.id
        else:
            with pytest.raises(ValueError):module.BusinessStore(session).ensure_original(row,payload)
        assert (doc.status,doc.sha256,doc.mime,doc.parent_id,doc.source_url)==before
        assert not list(session.scalars(select(Audit)))


def test_crash_after_conversion_commit_reuses_existing_usable_derivative_without_mutation():
    with session_factory()() as session:
        parent,_=add(session,'公开通知',['附件'])
        doc,_=add(session,'误标旧Word',[],parent_id=parent.id)
        payload=word_bytes();doc.mime='.docx';doc.status='converted';doc.sha256=sha256(payload).hexdigest()
        doc.source_url='https://zlpg.njxzc.edu.cn/legacy.docx'
        derivative,_=add(session,'本地派生Word',['正确公开内容'],parent_id=parent.id)
        derivative.mime='.docx';derivative.source_url=doc.source_url
        session.add(Audit(id='conversion',action='archive_doc_conversion',entity_id=derivative.id,
                          changes={'original_id':doc.id,'original_sha256':doc.sha256}))
        session.commit();before=(doc.status,doc.title,doc.sha256,doc.checked_at,parent.checked_at)
        store=module.BusinessStore(session)
        assert store.ensure_original({'url':doc.source_url,'sha256':doc.sha256},payload).id==doc.id
        assert store.find_conversion(doc).id==derivative.id
        assert (doc.status,doc.title,doc.sha256,doc.checked_at,parent.checked_at)==before
        assert len(list(session.scalars(select(Audit))))==1
