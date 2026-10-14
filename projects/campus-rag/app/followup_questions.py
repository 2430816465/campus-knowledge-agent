"""Local question suggestions: no inference, database reads or factual claims."""
import re
from .exam_identity import professional_exam


def suggest_questions(question, result, history=()):
    # Only the current question and already-authorized public response identify
    # the topic. Never search private/admin records to build student suggestions.
    sources = (result.get('sources') or []) + (result.get('web_sources') or [])
    titles = ' '.join(str(row.get('title', '')) for row in sources)
    topic = question
    patterns = ('普通话', '四六级|四、六级|四级|六级', '档案', '申诉', '奖学金|助学金', '数学建模|数模', '毕业典礼', '校训|英文名称', '学籍|休学|复学')
    if not any(re.search(p, topic) for p in patterns):
        topic += ' ' + titles
    explicit_year = re.search(r'(?<!\d)(20\d{2})年', question)
    year = explicit_year.group(1) if explicit_year else str(result.get('query_time', ''))[:4]
    year = year if re.fullmatch(r'20\d{2}', year) else ''
    prefix = year + '年' if year else ''
    competition_id = result.get('competition_id')
    rows = []
    if '普通话' in topic:
        season = re.search(r'春季|秋季', question)
        # Sources identify evidence, never an unconfirmed user-selected season.
        period = prefix + (season.group() if season else '')
        rows = [
            (period + '普通话报名时间是什么？', r'何时|什么时候|时间|几号|哪天'),
            (period + '普通话考试报名有哪些要求？', r'要求|条件|资格'),
            (period + '普通话考试如何报名？', r'如何|怎么|流程'),
            (period + '普通话考试需要准备什么材料？', r'材料|准备'),
            (period + '普通话考试在哪里参加？', r'哪里|地点'),
        ]
    elif professional_exam(question):
        name = professional_exam(question)
        rows = [(prefix + name + '报名需要哪些条件？', r'条件|要求|资格'),
                (prefix + name + '入场需要携带什么证件？', r'证件|携带'),
                (prefix + name + '几点停止入场？', r'入场|进入|到考场'),
                (prefix + name + '考试有什么注意事项？', r'注意事项')]
    elif re.search(r'四六级|四、六级|四级|六级', topic):
        half = re.search(r'上半年|下半年', question)
        period = prefix + (half.group() if half else '')
        rows = [(period + '四六级报名时间是什么？', r'何时|什么时候|时间'),
                (period + '四六级报名需要哪些条件？', r'条件|要求|资格'),
                (period + '四六级如何报名缴费？', r'如何|怎么|流程|缴费'),
                (period + '四六级准考证什么时候打印？', r'准考证')]
    elif '档案' in topic:
        rows = [('档案查询需要什么材料？', r'材料'), ('线上档案查询需要到校办理吗？', r'到校|线上'),
                ('档案查询办理需要多久？', r'多久|工作日|时间'), ('档案查询如何办理？', r'如何|怎么|流程'),
                ('档案查询可以获取哪些内容？', r'哪些内容|查阅内容')]
    elif '申诉' in topic:
        rows = [('学生申诉应在什么期限内提出？', r'期限|时间|多久'), ('学生申诉由哪个机构受理？', r'机构|谁|受理'),
                ('学生申诉需要提交什么材料？', r'材料'), ('学生申诉复查有哪些程序？', r'程序|流程')]
    elif re.search(r'奖学金|助学金', topic):
        name = next((s for s in ('国家励志奖学金', '国家奖学金', '国家助学金') if s in topic), '奖助学金')
        rows = [(name + '申请有哪些条件？', r'条件|要求|资格'), (name + '申请需要哪些材料？', r'材料'),
                (name + '如何申请？', r'如何|怎么|流程'), (name + '评审有哪些程序？', r'程序|评审')]
    elif competition_id:
        rows = [('这个赛事允许跨专业组队吗？', r'跨专业'), ('这个赛事每队可以有几人？', r'几人|人数'),
                ('这个赛事报名截止时间是什么？', r'截止|时间'), ('这个赛事报名有哪些要求？', r'要求|条件')]
    elif '毕业典礼' in topic:
        rows = [(prefix + '毕业典礼在哪里举行？', r'哪里|地点'), (prefix + '毕业典礼什么时候举行？', r'何时|什么时候|时间'),
                (prefix + '毕业典礼参加人员有哪些？', r'人员|谁|哪些人'), (prefix + '毕业典礼有哪些安排？', r'安排')]
    elif re.search(r'学籍|休学|复学', topic):
        rows = [('学生休学如何办理？', r'休学.*(?:如何|怎么|流程)'), ('学生复学需要哪些条件？', r'复学.*(?:条件|要求)'),
                ('学生学籍异动有哪些办理程序？', r'学籍.*程序'), ('休学期间有哪些注意事项？', r'休学.*注意')]
    elif '校训' in topic:
        rows = [('学校的校训由谁题写？', r'谁|题写'), ('学校的校训是什么时候提出的？', r'什么时候|何时|提出'),
                ('学校的校训有哪些历史记载？', r'历史|沿革'), ('学校英文名称是什么？', r'英文名称')]
    elif sources:
        title = str(sources[0].get('title', '')).strip()[:140]
        label = '《' + title + '》' if title else '这些资料'
        rows = [(label + '适用哪些对象？', r'对象|适用'), (label + '有哪些具体要求？', r'要求|条件'),
                (label + '涉及哪些办理部门？', r'部门|机构'), (label + '适用哪个年度？', r'年度|哪年')]
    else:
        rows = [('学校的校训是什么？', r'校训'), ('学校英文名称是什么？', r'英文名称'),
                ('档案查询如何办理？', r'档案'), ('普通话考试报名有哪些要求？', r'普通话')]
        competition_id = None
    asked = {question.strip(), *(str(item.get('question', '')).strip() for item in history)}
    # Avoid recommending the just-answered intent, as well as exact repeats.
    candidates = [text for text, intent in rows if text not in asked and not re.search(intent, question)]
    if not candidates:
        candidates = [text for text in ('这些资料的适用年度是什么？', '这些资料由哪个部门发布？', '这些资料中哪些要求还需要核实？')
                      if text not in asked]
    return [{'question': text, 'competition_id': competition_id} for text in candidates[:3]]
