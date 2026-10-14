"""Read-only site identities from SHA-verified official organisation directories.

Site identity is not article publisher, policy applicability, or crawl permission.
"""
import hashlib
import re
import sqlite3
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

DIRECTORIES={
    'https://www.njxzc.edu.cn/7240/list.htm':'二级学院',
    'https://www.njxzc.edu.cn/7239/list.htm':'党政部门',
    'https://www.njxzc.edu.cn/7241/list.htm':'直属（附属）单位',
}


def parse_directory(payload, source_url, sha256):
    if source_url not in DIRECTORIES or len(payload)>2*1024*1024:
        raise ValueError('unrecognised official directory or size budget')
    if not re.fullmatch(r'[a-f0-9]{64}',sha256 or '') or hashlib.sha256(payload).hexdigest()!=sha256:
        raise ValueError('directory SHA mismatch')
    soup=BeautifulSoup(payload,'html.parser')
    kind=DIRECTORIES[source_url]
    if not any(h.get_text(' ',strip=True)==kind for h in soup.select('h2')):
        raise ValueError('directory heading mismatch')
    body=soup.select_one('.col_news_list')
    if body is None:raise ValueError('directory list missing')
    entries=[];seen=set()
    for index,anchor in enumerate(body.select('a[href]'),1):
        label=anchor.get_text(' ',strip=True)
        title=(anchor.get('title') or '').strip()
        # A title attribute can supply the literal full name of a truncated
        # anchor, only when the visible prefix agrees. Never invent aliases.
        if label.endswith(('...','…')) and title.startswith(label.rstrip('.…')):
            label=title
        target=urljoin(source_url,anchor['href'])
        if not label or len(label)>160 or (label,target) in seen:continue
        seen.add((label,target));host=None
        try:
            parsed=urlsplit(target);host=parsed.hostname
            if (parsed.scheme not in ('http','https') or not host or parsed.username or parsed.password
                    or parsed.port not in (None,80 if parsed.scheme=='http' else 443)):
                status='unsupported_link'
            elif not host.endswith('.njxzc.edu.cn'):
                status='outside_school_domain'
            elif host=='www.njxzc.edu.cn':status='shared_main_site'
            elif parsed.path not in ('','/','/main.htm','/index.htm') or parsed.query or parsed.fragment:
                status='non_homepage_link'
            elif label.endswith(('...','…')):status='truncated_name'
            else:status='snapshot_site_identity'
        except ValueError:status='unsupported_link'
        entries.append({'name':label,'kind':kind,'target_url':target,'host':host,'status':status,
            'evidence':{'source_url':source_url,'sha256':sha256,'selector':'.col_news_list a[href]',
                        'anchor_ordinal':index,'anchor_text':anchor.get_text(' ',strip=True)}})
    if not entries:raise ValueError('directory has no entries')
    return entries


def read_directories(archive):
    archive=Path(archive).resolve();sources=[];entries=[]
    with sqlite3.connect((archive/'frontier.sqlite3').as_uri()+'?mode=ro',uri=True) as connection:
        connection.row_factory=sqlite3.Row
        for url,kind in DIRECTORIES.items():
            row=connection.execute('SELECT state,sha256,checked_at,final_url FROM urls WHERE url=?',(url,)).fetchone()
            source={'url':url,'kind':kind,'status':'unavailable'}
            if row:
                source.update(checked_at=row['checked_at'],sha256=row['sha256'])
                try:
                    if row['state']!='fetched' or row['final_url']!=url:
                        raise ValueError('directory not fetched at its expected URL')
                    digest=row['sha256'] or ''
                    if not re.fullmatch(r'[a-f0-9]{64}',digest):raise ValueError('invalid blob hash')
                    path=archive/'blobs'/digest
                    if path.stat().st_size>2*1024*1024:raise ValueError('directory size budget')
                    values=parse_directory(path.read_bytes(),url,digest)
                    for value in values:value['evidence']['archive_checked_at']=row['checked_at']
                    entries.extend(values);source['status']='sha_verified';source['entry_count']=len(values)
                except (OSError,ValueError) as error:
                    source['status']='rejected';source['error_type']=type(error).__name__
            sources.append(source)
    names={}
    for value in entries:
        if value['status']=='snapshot_site_identity':names.setdefault(value['host'],set()).add(value['name'])
    for value in entries:
        if value['status']=='snapshot_site_identity' and len(names[value['host']])>1:
            value['status']='ambiguous_host_identity'
    return {'sources':sources,'entries':entries}


def directory_coverage(directory, inventory):
    rows=[];matched=set()
    for entry in directory['entries']:
        usable_identity=entry['status']=='snapshot_site_identity'
        counts=inventory['source_host_breakdown'].get(entry['host']) if usable_identity else None
        if counts:matched.add(entry['host'])
        rows.append({**entry,'business_source_inventory':counts,
            'business_inventory_status':'host_observed' if counts else
                'no_business_documents_for_listed_host' if usable_identity else 'identity_not_assigned'})
    return {**directory,'entries':rows,'matched_business_hosts':sorted(matched),
        'business_hosts_without_directory_identity':sorted(set(inventory['source_host_breakdown'])-matched),
        'article_publisher_updated':False,'document_applicability_verified':False,
        'full_school_coverage_proven':False,
        'note':'Directory names and links describe archived official snapshots. No redirect/alias/current-validity inference, publisher writeback, policy applicability or new crawl permission. Joint names stay one directory entry; shared/ambiguous/external targets remain unassigned.'}
