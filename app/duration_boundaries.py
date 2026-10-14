"""Literal safeguard for explicit event-relative deadlines, without inference.

Only cited bodies supply requirements. Unrecognised wording is left to other
validation; recognised paraphrases may be rejected in favour of source wording.
No dates are calculated and no policy-specific event or duration is hardcoded.
"""
import re


NUMBER = r'(?:\d+|[一二三四五六七八九十百两]+)'
DURATION = re.compile(r'(?<![\d一二三四五六七八九十百两])(' + NUMBER + r')(个工作日|工作日|日|天)(内|以内)')
ANCHOR = re.compile(r'(?:自|从)([^，,。；;！？\d]{2,48}?)(?:之日|当日)?起[，,]?\s*$')


def _compact(text):
    return re.sub(r'\s+', '', text)


def _key(match):
    unit = match[2].replace('个', '').replace('天', '日')
    return match[1], unit


def duration_origin_issues(text, source):
    """Reject changed day units or lost explicit source start events.

    Extension-only periods are exempt only when the cited source explicitly
    contains an extension with that same period. Each occurrence is checked;
    an anchor in another sentence cannot authorise an unanchored statement.
    """
    text, source = _compact(text), _compact(source)
    source_periods = {_key(match) for match in DURATION.finditer(source)}
    origins, extensions = {}, set()
    for clause in re.split(r'[。；;！？]', source):
        for duration in DURATION.finditer(clause):
            prefix = clause[:duration.start()]
            if anchor := ANCHOR.search(prefix):
                origins.setdefault(_key(duration), set()).add(anchor[1])
            if re.search(r'延长[^，,。；;！？]{0,8}$', prefix):
                extensions.add(_key(duration))
    issues = set()
    for clause in re.split(r'[。；;！？]', text):
        for duration in DURATION.finditer(clause):
            key = _key(duration)
            # Numerical validation alone cannot distinguish calendar days
            # from working days. Only reject a recognised same-number period
            # when none of its cited occurrences supports the claimed unit.
            if key not in source_periods and any(number == key[0] for number, unit in source_periods):
                issues.add('duration_day_unit_changed')
            if key not in origins:
                continue
            prefix = clause[:duration.start()]
            if key in extensions and re.search(r'延长[^，,。；;！？]{0,8}$', prefix):
                continue
            anchor = ANCHOR.search(prefix)
            if not anchor or anchor[1] not in origins[key]:
                issues.add('duration_start_event_omitted_or_changed')
    return issues
