"""Conservative field-mismatch detection, not a semantic truth certificate.

Only explicit conflicting fields trigger rejection. Missing keywords alone do
not prove an otherwise valid paraphrase wrong. No source/review writes or model.
"""
import re
from datetime import datetime

FIELDS = {
    'defense_date': r'(?<!开题)(?<!预)答辩(?!稿).{0,15}(?:时间|日期|安排|举行|进行|月|日)|(?:时间|日期).{0,8}(?<!开题)(?<!预)答辩(?!稿)',
    'exam_date': r'考试时间|考试日期|笔试|口试|开考|举行|考试.{0,8}(?:定于|将于|为|是)',
    'application_date': r'报名时间|报名期|申请时间|报名.{0,12}(?:开始|截止|截至|时间|至|月)|申请.{0,12}(?:开始|截止|截至|时间|至|月)|受理时间',
    'payment': r'缴费|支付|费用|收费',
    'result': r'审批结果|审核结果|录取结果|公示结果|查询结果|审批.{0,8}(?:完成|通过|公布)',
    'eligibility': r'条件|资格|对象|须为|必须为|仅限|不得报|不允许|可报名|可以报|面向',
    'procedure': r'流程|步骤|办理方式|依次|登录|填写|提交|受理|领取|前往',
    'materials': r'材料|身份证|申请表|证明|复印件|原件',
    'page_date': r'发布时间|发布日期|更新时间|发布于',
}


def requested_field(question):
    q = question.split('；追问：')[-1]
    when = bool(re.search(r'什么时候|何时|哪天|几号|时间|日期|截止|截至', q))
    requested = []
    if when and '答辩' in q:
        requested.append('defense_date')
    if when and re.search(r'考试|笔试|口试|开考', q):
        requested.append('exam_date')
    if when and re.search(r'报名|申请|受理', q):
        requested.append('application_date')
    if re.search(r'审批结果|审核结果|录取结果|公示结果', q):
        requested.append('result')
    if re.search(r'条件|资格|对象|能否.{0,5}(?:报名|申请)|可以.{0,5}(?:报名|申请)', q):
        requested.append('eligibility')
    if re.search(r'流程|步骤|如何办理|怎么办理|怎么申请|如何申请', q):
        requested.append('procedure')
    if re.search(r'什么材料|哪些材料|所需材料|需要准备', q):
        requested.append('materials')
    if re.search(r'缴费|支付|费用|收费', q):
        requested.append('payment')
    return requested[0] if len(set(requested)) == 1 else None


def relevance_issues(question, result, now=None):
    if result.get('mode') in ('clarification', 'insufficient_evidence'):
        return []
    field = requested_field(question)
    claims = result.get('explanation') or []
    text = '\n'.join(c.get('text', '') for c in claims) if claims else result.get('answer', '')
    from .topic_guard import topic_issues
    issues = topic_issues(question, result)
    if field and text and not re.search(FIELDS[field], text):
        conflicting = [name for name, pattern in FIELDS.items() if name != field and re.search(pattern, text)]
        if conflicting:
            issues.append('requested_' + field + '_answered_' + '_'.join(conflicting))
    if re.search(r'目前|现在|当前|还(?:能|可以).{0,4}(?:报名|申请)|正在开放', question):
        # Historical evidence cannot prove current availability. Explicit history
        # remains valid; never silently rewrite it to the current year.
        explicit = re.findall(r'20\d{2}年', question)
        years = set(map(int, re.findall(r'(20\d{2})年', text)))
        current = (now or datetime.now().astimezone()).year
        if not explicit and years and max(years) < current and not re.search(r'无法核实|不能确认|已结束|已截止|历史|过期', text):
            issues.append('historical_notice_does_not_prove_current_opening')
    return issues


def reject_irrelevant_answer(result, issues):
    if not issues:
        return result
    message = '现有材料尚未核实你所问的信息，不能用相关但不同事项或历史通知代替回答。'
    return {**result, 'mode': 'insufficient_evidence', 'answer': message,
            'sources': [], 'document_ids': [], 'explanation': [], 'web_sources': [],
            'web_links': [], 'source_sections': [],
            'answer_view': {'label': '所问信息待核实', 'paragraphs': [message], 'groups': []},
            'relevance_trace': {'rejected_mode': result.get('mode'), 'issues': issues,
                                'scope': 'named_subject_and_explicit_field_checks_not_semantic_certification'}}
