"""Rebuildable, hash-bound original-year evidence. Never certifies current validity."""
from datetime import datetime
import json
from pathlib import Path
import re
import sqlite3

PARSER_VERSION = 'original-year-v1'
DOCUMENT_NUMBER = re.compile(r'(?:南晓院|晓院)[\u4e00-\u9fff]{0,8}[〔\[【（(](20\d{2})[〕\]】）)]\d{1,4}号')
DATE = re.compile(r'(?<!\d)(20\d{2})年(\d{1,2})月(\d{1,2})日')
SIGNATURE = re.compile(r'南京晓庄学院(?:[\u4e00-\u9fff]{0,12})?(20\d{2})年(\d{1,2})月(\d{1,2})日(?:印发)?$')


def normalize(text):
    return re.sub(r'\s+', '', text)


def valid_record(record,sha):
    if not isinstance(record,dict) or not isinstance(sha,str) or not re.fullmatch(r'[0-9a-f]{64}',sha):
        return False
    year=record.get('year')
    proof=record.get('evidence')
    return bool(record.get('state')=='ready' and record.get('source_sha256')==sha
        and record.get('parser_version')==PARSER_VERSION and isinstance(year,str) and re.fullmatch(r'20\d{2}',year)
        and record.get('basis') in ('school_document_number_and_closing_date','closing_school_signature_date')
        and record.get('current_validity_verified') is False
        and isinstance(proof,list) and 1<=len(proof)<=4
        and all(isinstance(p,dict) and isinstance(p.get('segment'),int) and not isinstance(p['segment'],bool)
                and 1<=p['segment']<=300 and isinstance(p.get('quote'),str) and len(p['quote'])<=100
                and year in normalize(p['quote']) for p in proof))


def original_year(segments):
    """School document number before first article + closing date, or school signature.

    Bare dates, referenced documents and implementation years are insufficient.
    The result is the original file's year, never a current/effective-policy claim.
    """
    if not segments:
        return {'state':'unknown','reason':'no_text'}
    head, tail = normalize(segments[0])[:1400], normalize(segments[-1])[-500:]
    boundary = re.search(r'第[一二三四五六七八九十0-9]+[章条]',head)
    header = head[:boundary.start()] if boundary else head
    codes = list(DOCUMENT_NUMBER.finditer(header))
    dates = []
    for match in DATE.finditer(tail):
        try:
            datetime(*(int(v) for v in match.groups()))
        except ValueError:
            continue
        if len(tail)-match.end() <= 80:
            dates.append(match)
    signature = SIGNATURE.search(tail)
    code_years = {m[1] for m in codes}
    date_years = {m[1] for m in dates}
    if len(code_years)>1 or len(date_years)>1:
        return {'state':'unknown','reason':'ambiguous_header_or_closing_dates'}
    if code_years and date_years and code_years != date_years:
        return {'state':'unknown','reason':'document_number_closing_date_conflict'}
    if len(code_years)==1 and code_years==date_years:
        year = next(iter(code_years))
        return {'state':'ready','year':year,'basis':'school_document_number_and_closing_date',
                'evidence':[{'segment':1,'quote':codes[0][0]},
                            {'segment':len(segments),'quote':dates[-1][0]}],
                'current_validity_verified':False}
    # School signature at the end is deliberately stricter than any date in the body.
    # Require a rule-like heading, so a news story mentioning a dated event is not a rule version.
    if signature and date_years and re.search(r'办法|规定|细则|章程|条例|制度|规程',head[:500]):
        return {'state':'ready','year':signature[1],'basis':'closing_school_signature_date',
                'evidence':[{'segment':len(segments),'quote':signature[0]}],
                'current_validity_verified':False}
    return {'state':'unknown','reason':'no_unambiguous_original_version_basis'}


def open_cache(path):
    path = Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    connection = sqlite3.connect(path,timeout=10)
    connection.execute('PRAGMA journal_mode=WAL')
    connection.execute('''CREATE TABLE IF NOT EXISTS evidence (
        parser TEXT NOT NULL, sha256 TEXT NOT NULL, state TEXT NOT NULL,
        payload TEXT NOT NULL, checked_at TEXT NOT NULL,
        PRIMARY KEY(parser,sha256))''')
    connection.commit()
    return connection


def save_evidence(connection,sha,result,checked_at):
    payload = {**result,'source_sha256':sha,'parser_version':PARSER_VERSION}
    connection.execute('INSERT OR IGNORE INTO evidence VALUES (?,?,?,?,?)',
                       (PARSER_VERSION,sha,result['state'],json.dumps(payload,ensure_ascii=False),checked_at))
    connection.commit()


def read_evidence(path,hashes):
    """Read-only, bounded SELECTs. Missing/invalid derived cache falls back to metadata."""
    path = Path(path)
    if not path.is_file():
        return {}
    records = {}
    try:
        connection = sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=1)
        try:
            connection.execute('PRAGMA query_only=ON')
            hashes = sorted(set(hashes))
            for start in range(0,len(hashes),256):
                batch = hashes[start:start+256]
                if not batch:
                    continue
                rows = connection.execute('SELECT sha256,payload FROM evidence WHERE parser=? AND state=? AND sha256 IN ('+
                    ','.join('?' for _ in batch)+')',(PARSER_VERSION,'ready',*batch))
                for sha,payload in rows:
                    record=json.loads(payload)
                    if valid_record(record,sha):
                        records[sha]=record
        finally:
            connection.close()
    except (OSError,sqlite3.Error,ValueError,TypeError,KeyError):
        return {}
    return records


def enrich_metadata(metadata,path):
    records=read_evidence(path,[row.get('sha256','') for row in metadata.values()])
    return {identity:{**row,**({'original_version':records[row['sha256']]} if row.get('sha256') in records else {})}
            for identity,row in metadata.items()}
