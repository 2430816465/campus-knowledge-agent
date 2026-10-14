"""Official public-page fallback. Search snippets are never answer evidence."""
import json
import os
import re
import subprocess
import ipaddress
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import httpx
from bs4 import BeautifulSoup
from .web_cache import cached
from .answer_relevance import FIELDS, requested_field, relevance_issues, reject_irrelevant_answer
from .qa_date_guard import (exam_date_intent, source_matches_date,
                            answer_date_issues, reject_date_answer, render_exam_dates)

DOMAINS = ('njxzc.edu.cn', 'neea.edu.cn', 'neea.cn', 'cltt.org', 'jseea.cn', 'due.xjtu.edu.cn')
_search_retry_after = 0.0


def public_url(url):
    try:
        p = urlparse(url)
        host = (p.hostname or '').lower()
        if re.search(r'(^|\.)(?:oa|authserver|sso|passport|mail|vpn)\.', host) or re.search(r'login|signin|admin|search|_redirect|token|password|session', unquote(p.path + '?' + p.query), re.I):
            return False
        try:
            if not ipaddress.ip_address(host).is_global:
                return False
        except ValueError:
            pass
        return (p.scheme == 'https' and p.port in (None, 443) and not p.username and not p.password
                and '.' in host and host != 'localhost' and not host.endswith(('.local', '.internal')))
    except ValueError:
        return False


def official_url(url):
    if not public_url(url):
        return False
    host = urlparse(url).hostname.lower()
    if host == 'www.boxuegu.com':
        return urlparse(url).path == '/match/' and not urlparse(url).query
    # Government domains and institutional education subdomains expand coverage;
    # their publisher is still not automatically the user's own school.
    return (any(host == d or host.endswith('.' + d) for d in DOMAINS)
            or host.endswith('.gov.cn')
            or bool(re.fullmatch(r'(?:www|jwc|jw|yz|yjs|xsc|news|xxgk|zs)\.[a-z0-9-]+\.edu\.cn', host)))


def fetch_page(url):
    (final, markup, checked_at), hit = cached('page', url, 60, lambda: _fetch_page(url))
    soup = BeautifulSoup(markup, 'html.parser')
    soup.__dict__['_campus_checked_at'] = checked_at
    soup.__dict__['_campus_cached'] = hit
    return final, soup


def _fetch_page(url):
    """Validate every redirect; bound bytes and runtime. No cookies or credentials."""
    with httpx.Client(timeout=5, trust_env=False, follow_redirects=False) as client:
        for _ in range(4):
            if not official_url(url):
                raise ValueError('非官方公开网页')
            host = urlparse(url).hostname
            addresses = socket.getaddrinfo(host, 443)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                raise ValueError('禁止访问内网或本地地址')
            with client.stream('GET', url, headers={'User-Agent': 'CampusAssistant/1.0 (public-source-check)'}) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers.get('location', ''))
                    continue
                response.raise_for_status()
                if 'html' not in response.headers.get('content-type', '').lower():
                    raise ValueError('不是可核验HTML正文')
                data = bytearray()
                for part in response.iter_bytes():
                    data.extend(part)
                    if len(data) > 500_000:
                        raise ValueError('网页超出读取预算')
                # BeautifulSoup respects a page's declared Chinese encoding.
                soup = BeautifulSoup(bytes(data), 'html.parser')
                for node in soup(['script', 'style', 'noscript', 'nav', 'footer']):
                    node.decompose()
                return url, str(soup), datetime.now(timezone.utc).isoformat()
    raise ValueError('重定向次数过多')


def search_candidates(query):
    result, _ = cached('search', query, 60, lambda: _search_candidates(query))
    return result


def _search_candidates(query):
    global _search_retry_after
    if time.monotonic() < _search_retry_after:
        return [], '搜索服务暂不可用，已改查官方通知目录。'
    home = Path.home()
    node = Path(os.environ.get('CAMPUS_SEARCH_NODE', str(home / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')))
    cli = Path(os.environ.get('CAMPUS_SEARCH_CLI', str(home / '.local/share/skill-runtime-node/node_modules/mcporter/dist/cli.js')))
    if not node.is_file() or not cli.is_file():
        return [], '搜索服务未配置，已改查官方通知目录。'
    try:
        args = json.dumps({'query': query, 'numResults': 8}, ensure_ascii=False)
        result = subprocess.run([str(node), str(cli), 'call', 'exa.web_search_exa', '--args', args],
                                capture_output=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        text = result.stdout.decode('utf-8', errors='replace')
        if result.returncode or re.search(r'rate limit|API key|error', text, re.I):
            raise ValueError('搜索服务未返回结果')
        urls = list(dict.fromkeys(re.findall(r'https://[a-zA-Z0-9._~:/?#\[\]@!$&\x27*+,;=%-]+', text)))
        return [u.rstrip('.,;') for u in urls if public_url(u.rstrip('.,;'))][:8], ''
    except (OSError, subprocess.TimeoutExpired, ValueError):
        _search_retry_after = time.monotonic() + 300
        return [], '搜索服务暂不可用或额度受限，已改查官方通知目录。'


def public_query(question):
    # Send only a controlled public topic/year/intent, never names, IDs, chat
    # transcripts, teacher data, or arbitrary URLs to the search provider.
    from .topic_guard import named_subjects
    named = named_subjects(question)
    topics = named or re.findall(r'普通话|四六级|四、六级|四级|六级|档案|教师资格|计算机等级|图书馆|奖学金|助学金|助学贷款|转专业|研究生(?:招生)?考试|考研|专升本|学籍|休学|复学|医保|就业|实习|数学建模|创新创业|挑战杯|补考|重修|学费|宿舍', question)
    if not topics:
        # General public questions can be discovered across the web. Do not send
        # personal narratives, credentials, URLs or transcripts to a provider.
        if len(question) > 120 or re.search(r'我|姓名|学号|身份证|手机|电话|邮箱|密码|口令|私有|教师后台|https?://|@|\d{6,}', question):
            return None
        head = re.sub(r'^(?:请问|查询|查一下|帮忙查询)\s*', '', question)
        head = re.sub(r'20\d{2}年?|今年|明年|去年|春季|秋季|上半年|下半年', '', head)
        topic = re.split(r'什么时候|何时|如何|怎么|是否|有哪些|需要|的要求|报名时间|[，,？?。]', head)[0].strip()
        if not 2 <= len(topic) <= 30 or not re.fullmatch(r'[\u4e00-\u9fffA-Za-z、·\- ]+', topic):
            return None
    else:
        topic = topics[-1]
    if topic in ('四六级', '四、六级', '四级', '六级'):
        topic = '全国大学英语四、六级考试'
    years = list(dict.fromkeys(re.findall(r'(?<!\d)20\d{2}(?!\d)', question)))
    if len(years) > 1:
        return None
    qualifiers = re.findall(r'春季|秋季|上半年|下半年|报名|考试|笔试|口试|口语|日期|时间|要求|条件|材料|流程|成绩|准考证|费用|利率|政策|办理|申请', question)
    personal = bool(re.search(r'我|姓名|学号|身份证|手机|电话|邮箱|密码|口令', question))
    school = None if personal else re.search(r'([\u4e00-\u9fff]{2,14}(?:大学|学院))', question)
    scope = school[1] if school else '南京晓庄学院' if topics and not personal and (not named or topic == '答辩') else ''
    if topic == '答辩' and scope and '大学' not in scope and scope != '南京晓庄学院':
        scope = '南京晓庄学院 ' + scope
    fresh = ['最新'] if '最新' in question else []
    if topic == '答辩' and re.search(r'毕业|论文|学位', question):
        qualifiers.insert(0, '毕业论文')
        qualifiers = list(dict.fromkeys(qualifiers))
    return topic, ' '.join([scope, topic, *years, *qualifiers[-5:], *fresh]).strip()


def discover(topic, query):
    seeds = ['https://jwc.njxzc.edu.cn/']
    if topic == '传智杯':
        seeds.append('https://www.boxuegu.com/match/')
    if '四、六级' in topic:
        seeds.insert(0, 'https://cet.neea.edu.cn/')
    elif '普通话' in topic:
        seeds.append('https://www.cltt.org/')
    def links(seed):
        try:
            current, soup = fetch_page(seed)
            choices = []
            for a in soup.select('a[href]'):
                title = a.get('title') or a.get_text(' ', strip=True)
                match = ('四级|六级|四、六级|四六级' if '四、六级' in topic else re.escape(topic))
                u = urljoin(current, a['href'])
                if re.search(match, title) and official_url(u) and re.search(r'报名|通知|安排|流程|要求|条件', title):
                    choices.append(u)
            return choices[:4]
        except (httpx.HTTPError, OSError, ValueError, TimeoutError):
            return []
    # Search and official directories run at the same time, not serially.
    with ThreadPoolExecutor(max_workers=3) as pool:
        search = pool.submit(search_candidates, query)
        directories = list(pool.map(links, seeds))
        urls, warning = search.result()
    candidates = list(dict.fromkeys(([seeds[-1]] if topic == '传智杯' else []) + [u for row in directories for u in row] + urls))
    candidates.sort(key=lambda u: (not official_url(u), not urlparse(u).hostname.endswith('njxzc.edu.cn')))
    return candidates[:10], warning


def extract_source(url, question, topic, now=None):
    try:
        if not official_url(url):
            return None
        final, soup = fetch_page(url)
        # A different university's defense calendar cannot answer our students.
        if topic == '答辩' and not re.search(r'(?:大学|学院)', question) and not urlparse(final).hostname.endswith('njxzc.edu.cn'):
            return None
        topic_pattern = '四级|六级|四、六级|四六级|CET' if '四、六级' in topic else re.escape(topic)
        headings = [node for node in soup.select('h1, h2, h3, title') if node.get_text(' ', strip=True)]
        title = next((node for node in headings if re.search(topic_pattern, node.get_text(' ', strip=True))), None)
        if title is None:
            title = soup.title or soup.find('h1')
        title = title.get_text(' ', strip=True) if title else ''
        if urlparse(final).hostname == 'www.boxuegu.com':
            # This verified organizer page has a structured public timeline,
            # not an article. Read the registration card as one DOM block.
            if topic != '传智杯' or requested_field(question) != 'application_date':
                return None
            cards = [node.get_text(' ', strip=True) for node in soup.select('.box6 .text > span')]
            registration = [p for p in cards if '报名期' in p]
            editions = re.findall(r'第[一二三四五六七八九十\d]+届传智杯', ''.join(cards))
            years = re.findall(r'(?<!\d)20\d{2}(?!\d)', question)
            if len(registration) != 1 or len(set(editions)) != 1 or (years and not all(y in registration[0] for y in years)):
                return None
            requested_edition = re.findall(r'第[一二三四五六七八九十\d]+届', question)
            if requested_edition and any(e not in editions[0] for e in requested_edition):
                return None
            return {'title': title, 'url': final, 'paragraphs': registration,
                'context': '\n'.join(p for p in cards if editions[0] in p),
                'excerpt': editions[0] + '：' + registration[0],
                'checked_at': soup.__dict__.get('_campus_checked_at'),
                'cached': soup.__dict__.get('_campus_cached', False),
                'source_type': 'official', 'national': True,
                'scope': 'organizer_timeline_month_precision_not_campus_deadline'}
        content = next((soup.select_one(s) for s in ('.wp_articlecontent', '#Content', '.article-content', '.TRS_Editor', '#content', '.v_news_content', 'article') if soup.select_one(s)), None)
        if content is None:
            return None  # A directory/search/login page cannot support an answer.
        paragraphs = [re.sub(r'\s+', ' ', x.get_text(' ', strip=True)) for x in content.select('p, tr')]
        paragraphs = list(dict.fromkeys(p for p in paragraphs if p))
        text = '\n'.join(paragraphs)
        if len(text) > 30_000 or not re.search(topic_pattern, title + text) or not paragraphs:
            return None
        from .topic_guard import graduate_defense, graduate_source
        if graduate_defense(question) and not graduate_source(title + text):
            return None
        years = re.findall(r'(?<!\d)20\d{2}(?!\d)', question)
        if years and not all(y in title for y in years):
            return None
        season = next(iter(re.findall(r'春季|秋季|上半年|下半年', question)), '')
        if season in ('春季', '秋季'):
            from .semester import semester_key
            version = semester_key(title)
            if not version or version[1] != season or (years and version[0] != int(years[0])):
                return None
        elif season and season not in title:
            return None
        focus = question.split('；追问：')[-1]
        date_intent = exam_date_intent(question, now)
        field = requested_field(question)
        terms = ('考试时间|考试日期|开考科目|笔试|口试|口语考试|四级考试|六级考试|举行' if date_intent else
                 '报名时间|报名.*(?:开始|截止)|考点报名|规定时间' if re.search('何时|什么时候|报名时间', focus) else
                 '要求|条件|资格|对象|不得|不能|除外|注意|报名' if re.search('要求|条件|资格', focus) else
                 '材料|提交|准备' if '材料' in focus else
                 '成绩|查询' if '成绩' in focus else '报名|考试|流程|办理')
        if field and not date_intent:
            terms = FIELDS[field]
        indexes = [i for i, p in enumerate(paragraphs) if re.search(terms, p)]
        # Keep complete matching paragraphs and their following exceptions; never
        # cut a policy paragraph to make it fit a short answer.
        indexes = sorted({j for i in indexes for j in (i, i+1) if j < len(paragraphs)})
        if not indexes or len(text) > 30_000:
            return None
        quotes = [paragraphs[i] for i in indexes]
        source = {'title': title, 'url': final, 'paragraphs': quotes,
                'context': '\n'.join(p for p in paragraphs if re.search(topic_pattern, p))[:2000],
                'checked_at': soup.__dict__.get('_campus_checked_at', datetime.now(timezone.utc).isoformat()),
                'cached': soup.__dict__.get('_campus_cached', False),
                'source_type': 'official',
                'excerpt': next((paragraphs[i] for i in indexes if len(paragraphs[i]) <= 260
                                 and (len(paragraphs[i]) >= 25 or (field and len(paragraphs[i]) >= 6
                                      and re.search(r'[。；：:]|\d', paragraphs[i])))
                                 and re.search(terms, paragraphs[i])), ''),
                'national': not urlparse(final).hostname.endswith('njxzc.edu.cn')}
        return source if not date_intent or source_matches_date(source, date_intent) else None
    except (httpx.HTTPError, OSError, ValueError, TimeoutError):
        return None


def supplement(session, question, result, enabled=True, now=None):
    date_intent = exam_date_intent(question, now)
    if not date_intent:
        result = reject_irrelevant_answer(result, relevance_issues(question, result, now))
    if date_intent:
        result = reject_date_answer(result, answer_date_issues(question, result, now))
        if date_intent.get('ambiguous') or not enabled:
            return result
        question = date_intent['query']
    from .topic_guard import named_subjects
    verify_latest = bool(named_subjects(question) and '最新' in question)
    if not enabled or (not verify_latest and result.get('mode') not in ('insufficient_evidence', 'evidence_fallback', 'local_model_evidence')):
        return result
    if not verify_latest and (result.get('explanation') or re.search(r'变化|不再|年度不一致|多个年度', result.get('answer', ''))):
        return result
    intent = public_query(question)
    if not intent:
        return result
    started = time.perf_counter()
    topic, query = intent
    if date_intent:
        query = date_intent['query']  # Controlled public intent, including level.
    lookup_trace = {'query': query, 'discovery_requested': True,
                    'local_mode_before_lookup': result.get('date_relevance', {}).get('rejected_mode', result.get('mode'))}
    try:
        urls, warning = discover(topic, query)
    except (TimeoutError, OSError, ValueError):
        urls, warning = [], '联网查询暂不可用，请稍后重试或直接查看官网。'
    # A known private/withdrawn original cannot be reintroduced by web lookup.
    if urls and session is not None:
        from sqlalchemy import select
        from .db import Document
        from .answer_view import source_groups
        known = session.scalars(select(Document).where(Document.source_url.in_(urls))).all()
        forbidden = {d.source_url for d in known if source_groups(session, [{'document_id': d.id}]) is None}
        urls = [u for u in urls if u not in forbidden]
    leads = [{'title': urlparse(u).hostname, 'url': u, 'source_type': 'unverified',
              'attachments': [], 'quotes': []} for u in urls if public_url(u) and not official_url(u)][:3]
    with ThreadPoolExecutor(max_workers=3) as pool:
        sources = [s for s in pool.map(lambda u: extract_source(u, question, topic, now), [u for u in urls if official_url(u)][:6]) if s]
    sources.sort(key=lambda s: s['title'], reverse=True)
    sources.sort(key=lambda s: s['national'])
    # Official portals can publish the same notice under several host aliases.
    unique, fingerprints = [], set()
    for source in sources:
        fingerprint = (source['title'], source.get('context', ''), tuple(source['paragraphs']))
        if fingerprint not in fingerprints:
            unique.append(source)
            fingerprints.add(fingerprint)
    sources = unique
    superseded = []
    if verify_latest and topic.endswith('杯'):
        # Compare editions found in fetched original text, never search snippets.
        numerals = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
                    '七': 7, '八': 8, '九': 9, '十': 10}
        def edition(source):
            text = source['title'] + source.get('context', '')
            matches = re.findall(r'第([一二三四五六七八九十\d]+)届[“”"\s]*' + re.escape(topic), text)
            values = [int(v) if v.isdigit() else numerals.get(v) for v in matches]
            values = {v for v in values if v is not None}
            return next(iter(values)) if len(values) == 1 else None
        known = [edition(s) for s in sources]
        newest = max((e for e in known if e is not None), default=None)
        if newest is not None:
            superseded = [{'url': s['url'], 'edition': e, 'reason': 'older_or_unresolved_edition'}
                          for s, e in zip(sources, known) if e != newest]
            sources = [s for s, e in zip(sources, known) if e == newest]
    if sources and session is not None:
        # Recheck final URLs after redirects, including current ancestor ACLs.
        final_urls = [s['url'] for s in sources]
        known = session.scalars(select(Document).where(Document.source_url.in_(final_urls))).all()
        forbidden = {d.source_url for d in known if source_groups(session, [{'document_id': d.id}]) is None}
        sources = [s for s in sources if s['url'] not in forbidden]
    sources = sources[:2]
    lookup_trace.update(discovered_urls=len(urls), verified_sources=len(sources),
                        superseded_sources=superseded,
                        source_reads=[{'url': s['url'], 'checked_at': s['checked_at'],
                                       'cached': s['cached']} for s in sources])
    elapsed = round(time.perf_counter() - started, 3)
    warnings = list(result.get('warnings') or [])
    if warning:
        warnings.append(warning)
    if not sources:
        view = dict(result.get('answer_view') or {'label': '资料不足', 'paragraphs': [result.get('answer', '尚无可核实依据')], 'groups': []})
        view['groups'] = list(view.get('groups') or []) + leads
        return {**result, 'lookup_trace': lookup_trace, 'warnings': warnings + ['联网核验未找到匹配年份和事项的官方正文；未据搜索摘要生成答案。'],
                'web_links': leads, 'answer_view': view,
                'web_status': 'no_verified_source', 'web_elapsed_seconds': elapsed,
                'elapsed_seconds': round(result.get('elapsed_seconds', 0) + elapsed, 3)}
    paragraphs = ['《' + s['title'] + '》原文：' + s['excerpt'] + f' [{i}]' for i, s in enumerate(sources, 1) if s['excerpt']]
    if not paragraphs:
        paragraphs = ['找到官方相关通知，暂不能摘出可靠的简短结论，请展开原文核对。']
    if any(s['national'] for s in sources):
        paragraphs.append('校外机构或其他高校的资料不等于晓庄校内安排；校内截止时间和资格仍须核对学校对应通知。')
    if verify_latest:
        paragraphs.append('以上为本次查到的公开资料，不保证全网最新；不同来源的赛道、校内安排及日期精度不可混为一个截止日期。')
    groups = [{'title': s['title'], 'url': s['url'], 'attachments': [],
        'source_type': 'official', 'checked_at': s['checked_at'], 'cached': s['cached'], 'quotes': [
        {'ref': i, 'text': p, 'location': '联网读取的官方正文', 'version': s['checked_at']} for p in s['paragraphs']]} for i, s in enumerate(sources, 1)]
    updated = {**result, 'lookup_trace': lookup_trace, 'mode': 'official_web_lookup', 'web_status': 'verified_official_text',
            'sources': [], 'document_ids': [], 'explanation': [],
            'web_sources': sources, 'web_links': leads, 'warnings': warnings, 'web_elapsed_seconds': elapsed,
            'elapsed_seconds': round(result.get('elapsed_seconds', 0) + elapsed, 3),
            'answer': '\n\n'.join(paragraphs),
            'answer_view': {'label': '联网查询 · 官方原文摘答', 'paragraphs': paragraphs, 'groups': groups + leads,
                'scope_note': '仅摘录相关段落；完整条件和例外请核对原网页。联网结果未写入已审核资料库。',
                'notice': '官网正文缓存最长60秒，标明实际读取时间；未核实搜索线索未作为答案依据。联网结果不代表教师审核或现行适用性确认。'}}

    if date_intent:
        concise = render_exam_dates(sources, date_intent)
        updated['answer'] = '\n\n'.join(concise)
        updated['answer_view'] = {**updated['answer_view'], 'label': '联网查询 · 考试日期核验',
            'paragraphs': concise, 'scope_note': '结论依据下方官方原文与链接；未写入已审核资料库。'}
        return reject_date_answer(updated, answer_date_issues(question, updated, now))
    return reject_irrelevant_answer(updated, relevance_issues(question, updated, now))
