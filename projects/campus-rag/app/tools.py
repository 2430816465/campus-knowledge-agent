import re
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .db import Competition, Document, Candidate, Chunk

SHANGHAI = ZoneInfo('Asia/Shanghai')
LABELS = {'internal_deadline': '校内截止', 'organizer_deadline': '主办方截止', 'internal_start': '校内开始', 'organizer_start': '主办方开始', 'eligibility': '报名资格', 'team_size': '团队人数', 'fee': '费用', 'materials': '材料', 'registration': '报名方式', 'recognition': '校内认定', 'college': '学院', 'major': '专业', 'education': '学段', 'grade': '年级'}

def query_time(value=None):
    if value is None:
        return datetime.now(SHANGHAI)
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=SHANGHAI) if parsed.tzinfo is None else parsed.astimezone(SHANGHAI)

def deadline_status(fields, at=None):
    now = query_time(at)
    deadline = fields.get('internal_deadline') or fields.get('organizer_deadline')
    if not deadline or not deadline.get('value'):
        return 'unknown'
    if deadline.get('precision') == 'date':
        closing_date = date.fromisoformat(deadline['value'])
        if now.date() > closing_date:
            return 'closed'
        if now.date() == closing_date:
            return 'deadline_day_unknown'
    else:
        end = query_time(deadline['value'])
        if now > end:
            return 'closed'
        if now == end:
            return 'deadline_boundary_unknown'
    start = fields.get('internal_start') or fields.get('organizer_start')
    if not start or not start.get('value'):
        return 'start_unknown'
    if now < query_time(start['value']):
        return 'not_started'
    return 'open'

def doc_dict(doc):
    return {key: getattr(doc, key) for key in ('id','title','source_url','publisher','published_at','imported_at','checked_at','sha256','status','visibility','kind','version','supersedes','parent_id','error','warnings','attachments')}

def comp_dict(session, comp, doc, at=None):
    candidates = session.scalars(select(Candidate).where(Candidate.competition_id == comp.id).order_by(Candidate.field, Candidate.id)).all()
    pending = [{
        'id': c.id, 'field': c.field, 'label': LABELS.get(c.field, c.field), 'value': c.value,
        'quote': c.quote, 'chunk_id': c.chunk_id, 'status': c.status, 'note': c.note,
    } for c in candidates]
    return {
        'competition_id': comp.id, 'name': comp.name, 'alias': comp.alias, 'year': comp.year,
        'track': comp.track, 'phase': comp.phase, 'school': comp.school, 'fields': comp.fields,
        'record_kind': doc.kind, 'catalog_year': 2026 if doc.kind=='catalog' and '2026' in doc.title else None,
        'review_status': comp.review_status, 'registration_status': deadline_status(comp.fields, at),
        'last_verified': comp.last_verified, 'source': doc_dict(doc), 'candidates': pending,
        'unknown_fields': [k for k in LABELS if k not in comp.fields],
    }

def eligible(fields, student):
    missing, unmet, satisfied = [], [], []
    for field in ('college','major','education','grade'):
        rule = fields.get(field)
        if not rule or not rule.get('allowed'):
            missing.append(LABELS[field] + '规则未核实')
        elif not student.get(field):
            missing.append('缺少学生' + LABELS[field])
        elif student[field] not in rule['allowed'] and 'all' not in rule['allowed']:
            unmet.append(LABELS[field] + '不符合')
        else:
            satisfied.append(LABELS[field] + '符合')
    size = fields.get('team_size')
    if size and ('min' in size or 'max' in size):
        if student.get('team_size') is None:
            missing.append('缺少团队人数')
        elif (size.get('min') is not None and student['team_size'] < size['min']) or (size.get('max') is not None and student['team_size'] > size['max']):
            unmet.append('团队人数不符合')
        else:
            satisfied.append('团队人数符合')
    else:
        missing.append('团队人数规则未核实')
    # 本版还不能自动验证项目合规、指导教师和校内选拔条件。
    missing.append('需核实完整资格、项目条件及校内办理要求')
    return {'status': 'not_met' if unmet else 'need_information' if missing else 'met', 'satisfied': satisfied, 'unmet': unmet, 'missing': missing}

def search_competitions(session, q='', year=None, track=None, phase=None, school=None, college=None, major=None, education=None, grade=None, team_size=None, recognition=None, registration=None, before=None, after=None, verified=False, offset=0, limit=20, at=None):
    for value in (before,after):
        if value and date.fromisoformat(value).isoformat()!=value:
            raise ValueError('筛选日期必须为YYYY-MM-DD')
    if before and after and after>before:
        raise ValueError('截止范围起点晚于终点')
    statement = select(Competition, Document).join(Document, Competition.document_id == Document.id).where(
        Document.visibility == 'public', Document.kind.in_(['notice','catalog']), Document.status.in_(['pending_review', 'published']))
    if q:
        # 固定参数结构，SQLAlchemy 绑定参数；没有任意 SQL 工具。
        statement = statement.where(Competition.name.contains(q, autoescape=True) | Competition.alias.contains(q, autoescape=True))
    for attr, value in ((Competition.year, year), (Competition.track, track), (Competition.phase, phase), (Competition.school, school)):
        if value is not None:
            statement = statement.where(attr == value)
    if verified:
        statement = statement.where(Competition.review_status == 'verified', Document.status == 'published')
    rows = session.execute(statement).all()
    result = []
    unknown = 0
    for comp, doc in rows:
        status = deadline_status(comp.fields, at)
        if status in ('unknown', 'start_unknown', 'deadline_day_unknown', 'deadline_boundary_unknown'):
            unknown += 1
        if registration and status != registration:
            continue
        match = True
        for field, value in (('college', college), ('major', major), ('education', education), ('grade', grade)):
            if value:
                allowed = comp.fields.get(field, {}).get('allowed', [])
                if value not in allowed and 'all' not in allowed:
                    match = False
        if team_size is not None:
            rule = comp.fields.get('team_size', {})
            if not rule or not any(k in rule for k in ('min','max')) or (rule.get('min') is not None and team_size < rule['min']) or (rule.get('max') is not None and team_size > rule['max']):
                match = False
        if recognition and comp.fields.get('recognition', {}).get('category') != recognition:
            match = False
        deadline = comp.fields.get('internal_deadline') or comp.fields.get('organizer_deadline') or {}
        value = deadline.get('value', '')[:10]
        if (before and (not value or value > before)) or (after and (not value or value < after)):
            match = False
        if match:
            result.append(comp_dict(session, comp, doc, at))
    result.sort(key=lambda c: ((c['fields'].get('internal_deadline') or c['fields'].get('organizer_deadline') or {}).get('value', '9999'), c['name'], c['competition_id']))
    return {'total': len(result), 'offset': offset, 'limit': limit, 'items': result[offset:offset+limit], 'unknown_registration_count': unknown, 'query_time': query_time(at).isoformat(), 'coverage_note': '仅枚举已导入且可公开访问的记录，未收录不代表赛事不存在；未知规则不视为符合条件。'}

def get_competition_rules(session, competition_id, year=None, track=None, phase=None, at=None):
    comp = session.get(Competition, competition_id)
    if comp is None or (year is not None and comp.year != year) or (track is not None and comp.track != track) or (phase is not None and comp.phase != phase):
        return None
    doc = session.get(Document, comp.document_id)
    if doc.visibility != 'public' or doc.kind not in ('notice','catalog') or doc.status not in ('pending_review', 'published'):
        return None
    return comp_dict(session, comp, doc, at)

def get_school_policy(session, topic, year=None):
    rows = session.execute(select(Chunk, Document).join(Document).where(Document.kind.in_(['policy', 'catalog']), Document.visibility == 'public', Document.status.in_(['pending_review', 'published']))).all()
    matches = []
    for chunk, doc in rows:
        if topic in chunk.text or topic in doc.title:
            if year is not None and str(year) not in doc.title:
                continue
            matches.append({'text': chunk.text, 'location': chunk.location, 'source': doc_dict(doc), 'verified': doc.status == 'published'})
    return {'total': len(matches), 'items': matches, 'note': '校内认定须核实文件生效范围；历史制度不得替代当前制度。'}
