"""Narrow CET date relevance checks for a review-only response integration.

No exam dates are configured here. These checks reject known failure patterns;
they do not certify semantic correctness, train a model, or fetch a page.
"""
import re
from datetime import date, datetime


TOPIC = r'四六级|四、六级|四级|六级|全国大学英语|CET(?:4|6)?'
WHEN = r'什么时候|何时|哪天|哪一天|几号|时间|日期'
DAY = re.compile(r'(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日')


def exam_date_intent(question, now=None):
    """Limit this guard to CET exam dates, preserving explicit historical intent."""
    focus = question.split('；追问：')[-1]
    if not re.search(TOPIC, question, re.I) or not re.search(WHEN, focus):
        return None
    if re.search(r'报名|缴费|支付|准考证|成绩|查分|报名费', focus):
        return None  # Other fields need their own contracts, not this date guard.
    now = now or datetime.now().astimezone()
    explicit = re.findall(r'(?<!\d)(20\d{2})\s*年(?!级)', question)
    relative = next(iter(re.findall(r'今年|明年|去年', question)), None)
    years = set(map(int, explicit))
    if relative:
        years.add(now.year + {'今年': 0, '明年': 1, '去年': -1}[relative])
    if len(years) > 1:
        return {'ambiguous': True}
    year = next(iter(years), now.year)
    phase = '口试' if re.search(r'口试|口语', focus) else '笔试' if '笔试' in focus else ''
    levels = set(re.findall(r'四级|六级', focus))
    level = next(iter(levels)) if len(levels) == 1 and not re.search(r'四六级|四、六级', focus) else ''
    season = next(iter(re.findall(r'上半年|下半年', question)), '')
    explicit_period = bool(years or season)
    if not season and not explicit_period:
        season = '下半年' if now.month >= 7 else '上半年'
    return {'year': year, 'phase': phase, 'season': season, 'level': level,
            'upcoming': not explicit_period, 'today': now.date(), 'ambiguous': False,
            'query': f'{year}年{season}全国大学英语{level or "四、六级"}{phase or "考试"}日期'}


def _fragments(text):
    # Keep dates with the named exam stage; a mixed sentence can contain both.
    return [s.strip() for s in re.split(r'[。；;\n]|[，,](?=笔试|口试|口语考试)', text) if s.strip()]


def _facts(text, title, intent):
    years = set(map(int, re.findall(r'(20\d{2})\s*年(?!级)', title + '\n' + text)))
    if years != {intent['year']}:
        return set()
    facts = set()
    for fragment in _fragments(text):
        if not re.search(r'笔试|口试|口语考试|四级考试|六级考试|CET[46]|考试(?:时间|日期|安排|定于|在|将于|为|是)|开考|举行', fragment, re.I):
            continue
        # Mentioning an exam while discussing payment is insufficient.
        if re.search(r'报名|缴费|支付|准考证.{0,6}(?:打印|下载|领取)|(?:打印|下载|领取).{0,6}准考证|成绩|查分', fragment):
            continue
        phase = '口试' if re.search(r'口试|口语考试', fragment) else '笔试' if '笔试' in fragment else ''
        if intent['phase'] and phase != intent['phase']:
            continue
        if intent.get('level'):
            # A two-level date list cannot establish which day belongs to the
            # requested level. Require an independently labelled source row.
            levels = set(re.findall(r'四级|六级', fragment))
            if levels != {intent['level']}:
                continue
        for match in DAY.finditer(fragment):
            try:
                day = date(int(match[1] or intent['year']), int(match[2]), int(match[3]))
            except ValueError:
                continue
            if day.year != intent['year'] or (intent['upcoming'] and day < intent['today']):
                continue
            if intent['season'] and (day.month <= 6) != (intent['season'] == '上半年'):
                continue
            facts.add((phase, day))
    return facts


def source_date_facts(source, intent):
    text = '\n'.join(source.get('paragraphs') or [source.get('quote') or source.get('text') or ''])
    return _facts(text, source.get('title', ''), intent)


def source_matches_date(source, intent):
    return bool(not intent.get('ambiguous') and source_date_facts(source, intent))


def answer_date_issues(question, result, now=None):
    intent = exam_date_intent(question, now)
    if intent is None:
        return []
    if intent['ambiguous']:
        return ['ambiguous_requested_year']
    claims = result.get('explanation') or []
    # Do not let dates in a long appended quotation rescue an off-topic claim.
    text = '\n'.join(c.get('text', '') for c in claims) if claims else result.get('answer', '')
    facts = _facts(text, '', intent)
    if not facts:
        return ['missing_matching_exam_date']
    sources = result.get('web_sources') or result.get('sources') or []
    lookup = {s.get('id'): s for s in sources}
    if claims:
        for claim in claims:
            claim_facts = _facts(claim.get('text', ''), '', intent)
            support = set().union(*(source_date_facts(lookup[i], intent)
                                    for i in claim.get('ids', []) if i in lookup))
            if not claim_facts or not _supported(claim_facts, support):
                return ['claim_date_not_supported_by_its_citations']
    else:
        support = set().union(*(source_date_facts(s, intent) for s in sources))
        if not _supported(facts, support):
            return ['answer_date_not_supported_by_source']
    return []


def _supported(facts, support):
    return all(any(day == source_day and (not phase or phase == source_phase)
                   for source_phase, source_day in support) for phase, day in facts)


def render_exam_dates(sources, intent):
    """Lead with verified dates; full quotations stay in the reference groups."""
    refs = {}
    for index, source in enumerate(sources, 1):
        for fact in source_date_facts(source, intent):
            refs.setdefault(fact, []).append(index)
    if not refs:
        return []
    # A table heading may repeat a date without a phase; avoid duplicate lines.
    for fact in list(refs):
        phase, day = fact
        if not phase and any(stage and other_day == day for stage, other_day in refs):
            del refs[fact]
    period = f"{intent['year']}年{intent['season']}{intent.get('level', '')}"
    prefix = f'如果你问的是接下来的考试，按{period}的官方安排：' if intent['upcoming'] else f'{period}的官方安排：'
    paragraphs = [prefix]
    for phase in ('笔试', '口试', ''):
        rows = sorted((day, ids) for (stage, day), ids in refs.items() if stage == phase)
        if rows:
            dates = '、'.join(f'{day.month}月{day.day}日' for day, _ in rows)
            citations = ''.join(f' [{i}]' for i in sorted({i for _, ids in rows for i in ids}))
            paragraphs.append(f'{intent.get("level", "")}{phase or "考试日期"}：{dates}。{citations}')
    return paragraphs


def reject_date_answer(result, issues):
    """Clear all rendered answer fields so a rejected answer cannot linger."""
    if not issues:
        return result
    message = '现有回答未核实所问的考试日期，需要按对应年份核对官方考试安排。'
    return {**result, 'mode': 'insufficient_evidence', 'answer': message,
            'sources': [], 'document_ids': [], 'explanation': [],
            'web_sources': [], 'web_links': [], 'source_sections': [],
            'web_status': 'date_answer_rejected',
            'answer_view': {'label': '考试日期待核实', 'paragraphs': [message], 'groups': []},
            'date_relevance': {'rejected_mode': result.get('mode'), 'issues': issues,
                               'scope': 'narrow_development_guard_not_semantic_certification'}}
