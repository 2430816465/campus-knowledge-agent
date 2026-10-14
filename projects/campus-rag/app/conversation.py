"""Bounded user-intent continuity. History supplies intent, never policy evidence."""
import re
from dataclasses import dataclass

MAX_HISTORY = 30
MAX_CONTEXT_CHARS = 2400
RESET = r'(?:换个话题|换个问题|清空上下文|重新开始)[！!。\s]*'

TOPICS = r'普通话|四六级|四、六级|英语四级|英语六级|四级|六级|档案(?:查询|查阅)?|数学建模|数模|图书馆|奖学金|助学金|助学贷款|转专业|教师资格|计算机等级|示范课|校训|学费|宿舍|毕业(?!班|生)|学籍|休学|复学|医保|考研|研究生考试|专升本|就业|实习|补考|重修|创新创业|挑战杯|互联网\+'
TIME = r'(?:20\d{2}(?:[—–-]20\d{2})?年?|今年|明年|去年|春季|秋季|上半年|下半年|第[一二12]学期|学年|学期|的|呢|那|是|我要问|我问|查询|[，,。？?\s])+'
ELLIPSIS = r'^(?:(?:那|它|这个|这些|该|上述|前面|刚才|还有|那么|请问|具体|我想问)[，,\s]*)?(?:报名|考试|办理|申请|查询|查阅|提交|需要|要求|条件|材料|费用|多少钱|什么时候|时间|截止|在哪里|在哪|怎么|如何|可以|能否|是否|为什么|多久|几天|几人|人数|名额|流程|步骤|有无|有没有|线上|线下|到校|跨专业|退费|补报|具体呢|春季|秋季|上半年|下半年|20\d{2})'


@dataclass(frozen=True)
class Context:
    question: str
    inherited: bool = False
    clarification: str = ''
    note: str = ''
    intent_question: str = ''


def _topic(text):
    match = re.search(TOPICS, text)
    return match.group() if match else ''


def _merge(question, previous):
    from .topic_guard import named_subjects
    # An explicit new named subject must not inherit the preceding event.
    if named_subjects(question):
        return Context(question)
    topic = _topic(question)
    prior_topic = _topic(previous)
    if topic:
        # Repeating the same subject alone does not discard its year/conditions.
        if topic != prior_topic or re.search(r'20\d{2}|今年|明年|去年', question) or question == previous:
            return Context(question)
        focus = question.replace(topic, '', 1).strip(' ，,')
        if not focus or not re.search(ELLIPSIS, focus):
            return Context(question)
        return _merge(focus, previous)
    is_time = bool(re.fullmatch(TIME, question))
    is_followup = bool(re.search(ELLIPSIS, question)) or bool(re.match(r'^(那|它|上述|前面|刚才|我(?:是|不是|还没|已经|没有|有|属于)|本人|往届|应届|毕业班)', question))
    if not previous and is_time:
        return Context(question, clarification='请补充要查询的事项，例如“2026年秋季普通话报名时间”；单独的年份或学期不足以确定主题。')
    if not previous or len(previous) > MAX_CONTEXT_CHARS or not (is_time or is_followup) or len(question) > 160:
        return Context(question)
    base = previous
    if re.search(r'20\d{2}|今年|明年|去年', question):
        base = re.sub(r'20\d{2}(?:[—–-]20\d{2})?年?|今年|明年|去年', '', base)
    if re.search(r'春季|秋季|上半年|下半年|第[一二12]学期', question):
        base = re.sub(r'春季|秋季|上半年|下半年|第[一二12]学期|学年|学期', '', base)
    if is_time:
        # Canonical order also keeps source-lookup's exact version checks usable.
        combined = question + base
        annual = re.search(r'20\d{2}(?:[—–-]20\d{2})?年?|今年|明年|去年', combined)
        season = re.search(r'春季|秋季|上半年|下半年|第[一二12]学期', combined)
        prefix = (annual.group() if annual else '') + (season.group() if season else '')
        remainder = re.sub(r'20\d{2}(?:[—–-]20\d{2})?年?|今年|明年|去年|春季|秋季|上半年|下半年|第[一二12]学期|学年|学期', '', base)
        effective = prefix + re.sub(r'[？?。\s]+$', '', remainder)
    else:
        # Keep prior constraints verbatim; a new subquestion changes the focus,
        # not the applicant's stated circumstances or exceptions.
        simple = re.fullmatch(r'((?:(?:20\d{2}(?:[—–-]20\d{2})?年?|春季|秋季|上半年|下半年|第[一二12]学期|学年|学期)\s*)*(?:' + TOPICS + r'))(?:什么时候报名|报名时间(?:是什么)?|如何办理)[？?。\s]*', base)
        if simple and not re.search(r'那具体|为什么|怎么理解|多久', question):
            effective = simple[1] + re.sub(r'^(?:那|那么|请问)[，,\s]*', '', question)
        else:
            # Repeating a focus must not consume the context budget on every turn.
            parts = base.split('；追问：')
            parts = [p for p in parts if p.rstrip('？?。 ') != question.rstrip('？?。 ')]
            effective = '；追问：'.join(parts).rstrip('？?。 ') + '；追问：' + question
    if len(effective) > MAX_CONTEXT_CHARS:
        return Context(question, clarification='追问条件较多，请把事项、年份和本次问题合成一句；我不会截断条件后猜测。')
    return Context(effective, True)


def _resolve_context(question, history=None):
    previous = ''
    recent = (history or [])[-MAX_HISTORY:]
    # A reset is also a boundary for explicit returns to an earlier topic.
    for index in range(len(recent) - 1, -1, -1):
        row = recent[index]
        if isinstance(row, dict) and isinstance(row.get('question'), str) and re.fullmatch(RESET, row['question'].strip()):
            recent = recent[index + 1:]
            break
    for row in recent:
        if not isinstance(row, dict):
            continue
        value = row.get('resolved_question') or row.get('question')
        if isinstance(value, str) and 0 < len(value) <= MAX_CONTEXT_CHARS:
            if re.fullmatch(r'(?:谢谢|好的|好|收到|明白了|你好|您好)[！!。\s]*', value.strip()):
                continue
            if re.fullmatch(RESET, value.strip()):
                previous = ''
                continue
            previous = _merge(value.strip(), previous).question
    current = question.strip()
    if re.fullmatch(RESET, current):
        return Context(current, clarification='已开始新话题，请输入要查询的事项。')
    correction = re.fullmatch(r'(?:不是|不要|不问)\s*(20\d{2})年?[，,\s]*(?:是|改为|改成|我要问|我问)\s*(20\d{2})年?[呢。？?\s]*', current)
    if correction and previous:
        current = correction[2] + '年'
    # Explicitly returning to a named earlier topic can recover its conditions.
    if re.match(r'^(?:回到|继续问|接着问|刚才的|之前的)', current) and _topic(current):
        subject = _topic(current)
        for row in reversed(recent):
            value = (row.get('resolved_question') or row.get('question')) if isinstance(row, dict) else None
            if isinstance(value, str) and len(value) <= MAX_CONTEXT_CHARS and _topic(value) == subject:
                remainder = re.sub(r'^(?:回到|继续问|接着问|刚才的|之前的)(?:刚才|之前)?的?', '', current)
                remainder = remainder.replace(subject, '', 1).strip('，,？?。 ')
                if not remainder:
                    return Context(value, True)
                return _merge(remainder, value)
    return _merge(current, previous)


def resolve_context(question, history=None, current_year=None):
    from .semester import interpret_semester
    concept = re.fullmatch(r'第([一二12])学期(?:是|指|属于|对应|一般是)?(?:春季|秋季)(?:还是|或)(?:春季|秋季)(?:学期)?[呢吗？?。\s]*', question.strip())
    if concept:
        return Context(question, clarification='按通常的学年口径，第一学期是秋季，第二学期是次年春季。例如2026—2027学年第一学期对应2026年秋季，第二学期对应2027年春季；具体开学和放假日期请核对学校校历。')
    context = _resolve_context(question, history)
    if context.clarification:
        return context
    # Validate the raw turn before merging: a canonical time prefix must not
    # hide contradictory seasons by taking only the first regex match.
    original_term = interpret_semester(question)
    if original_term.clarification and re.search(r'20\d{2}|春季|秋季', question):
        return Context(context.question, context.inherited, original_term.clarification)
    effective = context.question
    if current_year is not None:
        effective = re.sub(r'今年|明年|去年', lambda m: str(current_year + {'今年': 0, '明年': 1, '去年': -1}[m.group()]) + '年', effective)
    semester = interpret_semester(effective)
    return Context(semester.question, context.inherited, semester.clarification,
                   semester.note, semester.intent or effective)
