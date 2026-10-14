"""Bounded OOXML inspection; declared extension never changes original bytes."""
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZipFile,BadZipFile
from xml.etree import ElementTree

OFFICE_EXTENSIONS = frozenset(('.doc','.docx','.xls','.xlsx'))
CFB_MAGIC = bytes.fromhex('d0cf11e0a1b11ae1')
MAIN_TYPES = {
    'word/document.xml': ('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','.docx'),
    'xl/workbook.xml': ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml','.xlsx'),
}


def legacy_word_package(content):
    """Recognize a bounded unencrypted Word 97+ compound file, never execute it.

    CFB alone also identifies Excel and encrypted OOXML. Require the root Word
    stream, its FibBase identity and the selected table, and reject ambiguity.
    This is routing validation, not full Word content or macro verification.
    """
    if not content.startswith(CFB_MAGIC):
        return False
    if len(content)>20*1024*1024:
        raise ValueError('Legacy Office byte budget exceeded')
    import olefile
    try:
        with olefile.OleFileIO(BytesIO(content),raise_defects=olefile.DEFECT_INCORRECT) as archive:
            entries=archive.listdir()
            if len(entries)>4096:
                raise ValueError('Legacy Office stream budget exceeded')
            roots={name[0].casefold():name[0] for name in entries if len(name)==1}
            if len(roots)!=sum(len(name)==1 for name in entries):
                raise ValueError('Ambiguous legacy Office root stream names')
            if 'encryptedpackage' in roots or 'encryptioninfo' in roots:
                raise ValueError('Encrypted Office package; no decryption attempted')
            if 'worddocument' not in roots:
                return False
            if any(name in roots for name in ('workbook','book','powerpoint document')):
                raise ValueError('Ambiguous legacy Office package')
            size=archive.get_size(roots['worddocument'])
            if not 32<=size<=len(content):
                raise ValueError('Invalid legacy Word stream size')
            with archive.openstream(roots['worddocument']) as stream:
                header=stream.read(32)
            if len(header)!=32 or header[:2]!=b'\xec\xa5':
                raise ValueError('Unrecognized legacy Word FibBase identity')
            if int.from_bytes(header[2:4],'little') not in (0xc1,0xd9,0x101,0x10c,0x112):
                raise ValueError('Unsupported legacy Word FibBase version')
            flags=int.from_bytes(header[10:12],'little')
            if flags&0x0100:
                raise ValueError('Encrypted legacy Word; no decryption attempted')
            table='1table' if flags&0x0200 else '0table'
            if table not in roots or not 0<archive.get_size(roots[table])<=len(content):
                raise ValueError('Missing or invalid selected legacy Word table')
            return True
    except (OSError,IndexError,TypeError) as error:
        raise ValueError('Malformed legacy Office compound file') from error


def office_package_suffix(content, declared_suffix):
    """Return verified normal OOXML type or None for non-ZIP legacy files.

    Reject ambiguous, encrypted, macro-enabled and oversized packages before
    parser allocation. Never unzip to disk or open Office applications.
    """
    if declared_suffix not in OFFICE_EXTENSIONS or not content.startswith(b'PK'):
        return None
    if len(content)>20*1024*1024:
        raise ValueError('Office package byte budget exceeded')
    try:
        with ZipFile(BytesIO(content)) as archive:
            members=archive.infolist();names=[i.filename for i in members]
            if len(members)>4096 or len(set(names))!=len(names):
                raise ValueError('Office package entry budget or duplicate name')
            if any(i.flag_bits&1 or i.file_size>32*1024*1024 for i in members):
                raise ValueError('Encrypted or oversized Office member')
            if sum(i.file_size for i in members)>64*1024*1024:
                raise ValueError('Office package expanded byte budget exceeded')
            if any(PurePosixPath(n).is_absolute() or '..' in PurePosixPath(n).parts or '\\' in n for n in names):
                raise ValueError('Unsafe Office package member path')
            if '[Content_Types].xml' not in names:
                raise ValueError('ZIP is not a recognized Office package')
            info=archive.getinfo('[Content_Types].xml')
            if info.file_size>128*1024:
                raise ValueError('Office content types budget exceeded')
            value=archive.read(info)
            if b'<!DOCTYPE' in value.upper() or b'<!ENTITY' in value.upper():
                raise ValueError('Office content types declarations not allowed')
            root=ElementTree.fromstring(value)
            namespace='{http://schemas.openxmlformats.org/package/2006/content-types}'
            if root.tag!=namespace+'Types':
                raise ValueError('Invalid Office content types namespace')
            overrides={}
            for item in root:
                if item.tag==namespace+'Override':
                    name=item.get('PartName','').lstrip('/')
                    if name in overrides:raise ValueError('Duplicate Office main type')
                    overrides[name]=item.get('ContentType','')
            candidates=[name for name in MAIN_TYPES if name in names]
            if len(candidates)!=1 or 'ppt/presentation.xml' in names:
                raise ValueError('Unsupported or ambiguous Office package')
            name=candidates[0];expected,suffix=MAIN_TYPES[name]
            if overrides.get(name)!=expected or any('vbaproject' in n.lower() for n in names):
                raise ValueError('Unsupported or macro-enabled Office package')
            # Readers verify individual member CRC as consumed. Inspecting types
            # does not claim every embedded object has been parsed or executed.
            return suffix
    except (BadZipFile,ElementTree.ParseError) as error:
        raise ValueError('Malformed Office package') from error
