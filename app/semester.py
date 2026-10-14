"""Resolve academic terms before retrieval; assumptions are visible, never evidence."""
import re
from dataclasses import dataclass

YEAR = r'20\d{2}'
RANGE = rf'({YEAR})\s*[—–－\-至]\s*({YEAR})(?:\s*学年)?'
TERM = r'第([一二12])学期'


@dataclass(frozen=True)
class Semester:
    question: str
    intent: str = ''
    note: str = ''
    clarification: str = ''


def interpret_semester(question):
    academic = re.search(RANGE, question)
    term = re.search(TERM, question)
    compact = re.search(RANGE + r'-([12])(?:学期)?', question)
    season = re.search(r'春季|秋季', question)
    if not term and not compact and not (academic and season):
        calendar_term = re.search(r'(20\d{2})年(春季|秋季)', question)
        if calendar_term:
            calendar = int(calendar_term[1])
            start = calendar if calendar_term[2] == '秋季' else calendar - 1
            label = '一' if calendar_term[2] == '秋季' else '二'
            intent = question.replace(calendar_term[0], f'{start}—{start+1}学年第{label}学期', 1)
            return Semester(question, intent)
        return Semester(question)
    number = (term[1] if term else compact[3] if compact else ('一' if season[0] == '秋季' else '二'))
    first = number in ('一', '1')
    expected = '秋季' if first else '春季'
    if season and season[0] != expected:
        return Semester(question, clarification='按学年口径，第一学期通常为秋季，第二学期通常为次年春季。你同时写了不同的学期和季节，请确认要查哪一个。')
    if academic:
        start, end = int(academic[1]), int(academic[2])
        if end != start + 1:
            return Semester(question, clarification='学年通常跨相邻两个年份，请确认完整学年，例如“2026—2027学年第一学期”。')
        calendar = start if first else end
        assumption = ''
    else:
        years = set(re.findall(YEAR, question))
        if len(years) != 1:
            return Semester(question, clarification=f'第一学期通常是秋季，第二学期通常是次年春季。请补充学年或年份，例如“2026—2027学年第一学期普通话报名时间”。')
        calendar = int(next(iter(years)))
        # A bare 年 is a calendar year. A 学年 explicitly names its start year.
        if re.search(rf'{calendar}年?学年', question):
            start = calendar
            calendar += 0 if first else 1
            assumption = '按所写学年的起始年份理解；'
        else:
            if not season:
                return Semester(question, clarification=f'已确定所问年份为{calendar}。你指{calendar}年{"春季" if first else "秋季"}，还是{calendar}—{calendar+1}学年的第{"一" if first else "二"}学期（{calendar if first else calendar+1}年{"秋季" if first else "春季"}）？请确认年份口径。')
            start = calendar if first else calendar - 1
            assumption = '按明确写出的自然年份和季节理解；'
        end = start + 1
    remainder = re.sub(RANGE, '', question)
    remainder = re.sub(TERM, '', remainder)
    if compact:
        remainder = re.sub(r'^-([12])(?:学期)?', '', remainder)
    remainder = re.sub(rf'{YEAR}年?|学年|春季|秋季', '', remainder).strip(' ，,。？?')
    normalized = f'{calendar}年{expected}{remainder}'
    intent = f'{start}—{end}学年第{"一" if first else "二"}学期{remainder}'
    note = f'学期理解：{assumption}{start}—{end}学年第{"一" if first else "二"}学期，即{calendar}年{expected}。如年份口径不符，可直接纠正。具体报名日期仍以该学期通知为准。'
    return Semester(normalized, intent, note)


def semester_key(text):
    """A title's explicit academic version, independent of its publication date."""
    result = interpret_semester(re.sub(r'\s+', '', text))
    if result.clarification:
        return None
    match = re.search(r'(20\d{2})年(春季|秋季)', result.question)
    return (int(match[1]), match[2]) if match else None
