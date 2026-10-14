"""Evidence inventory, not an estimate of the size of the school website."""
import re
from collections import Counter
from urllib.parse import urlsplit
from .source_scope import eligibility


DOMAINS = {
    '教务教学': ('教务|教学|选课|考试|转专业|课程|补考|重修', ['选课与退课','考试与补考','转专业','学分与培养方案']),
    '学生管理': ('学生管理|学籍|申诉|处分|违纪|学生手册', ['本科生学籍','研究生学籍','申诉与处分']),
    '竞赛': ('竞赛|大赛|挑战杯', ['报名资格','截止时间','参赛材料','竞赛认定']),
    '科研': ('科研|课题|科学研究|基金项目', ['学生科研项目','教师项目申报','科研管理制度']),
    '创新创业': ('创新创业|创业|创新训练|大创', ['创新训练项目','创业支持与申请流程']),
    '奖助学金': ('奖学金|助学金|资助|助学贷款|勤工助学', ['奖学金资格','资助申请','评审与异议流程']),
    '校园生活设施': ('图书馆|宿舍|食堂|校园卡|体育馆|操场|校车|医疗|门诊', ['设施开放时间','住宿规则','图书借阅','校园卡服务']),
    '就业升学': ('就业|招聘|求职|升学|考研|推免', ['就业服务','求职补贴','考研与推免']),
    '毕业学位': ('毕业|学位|结业', ['毕业要求','学位授予','毕业材料']),
    '学校制度': ('章程|管理办法|管理规定|实施细则|规章制度', ['章程','现行制度','修订与废止关系']),
    '学院通知': ('学院.*(?:通知|公示|公告)|(?:通知|公示|公告).*学院', ['学院归属','各学院具体适用范围']),
}


def inventory(documents, chunk_counts, *, current_year):
    metadata = {row['id']: row for row in documents}
    domains = {name: {'metadata_mentions': 0, 'eligible_with_chunks': 0,
                     'published_with_chunks': 0, 'explicit_year_mentions': Counter(),
                     'samples': [], 'required_topics_not_yet_verified': topics}
               for name, (_, topics) in DOMAINS.items()}
    hosts, years, publishers, decisions, statuses, hashes = (Counter() for _ in range(6))
    host_details, cross_counts = {}, {}
    missing_date = missing_publisher = undated_eligible = eligible_count = 0
    unmatched, old_eligible, dated_eligible = 0, 0, 0
    for row in documents:
        decision = eligibility(row['id'], metadata)
        usable = decision['eligible'] and chunk_counts.get(row['id'], 0) > 0
        eligible_count += usable
        decisions[decision['reason'] if not decision['eligible'] else
                  'eligible_with_chunks' if usable else 'eligible_without_chunks'] += 1
        statuses[row['status']] += 1
        if row.get('sha256'):
            hashes[row['sha256']] += 1
        try:
            host = urlsplit(row.get('source_url') or '').hostname or '(unknown)'
        except ValueError:
            host = '(invalid_url)'
        hosts[host] += 1
        publisher = row.get('publisher') or '(unknown)'
        publishers[publisher] += 1
        missing_publisher += not bool(row.get('publisher'))
        missing_date += not bool(row.get('published_at'))
        effective_years = decision['effective_years']
        host_value=host_details.setdefault(host,{'document_count':0,'eligible_with_chunks':0,
            'published_with_chunks':0,'missing_publisher':0,'missing_publication_date':0,
            'effective_year_mentions':Counter(),'title_domains':Counter()})
        host_value['document_count']+=1
        host_value['eligible_with_chunks']+=usable
        host_value['published_with_chunks']+=usable and row['status']=='published'
        host_value['missing_publisher']+=not bool(row.get('publisher'))
        host_value['missing_publication_date']+=not bool(row.get('published_at'))
        host_value['effective_year_mentions'].update(effective_years or ['(unknown_or_ineligible)'])
        if usable:
            if not effective_years:
                undated_eligible += 1
            else:
                dated_eligible += 1
                old_eligible += all(int(year) < current_year for year in effective_years)
        for year in effective_years or ['(unknown_or_ineligible)']:
            years[year] += 1
        matches = [name for name,(pattern,_) in DOMAINS.items()
                   if re.search(pattern, row.get('title') or '')]
        unmatched += not bool(matches)
        host_value['title_domains'].update(matches or ['(unmatched_title)'])
        for domain in matches or ['(unmatched_title)']:
            for year in effective_years or ['(unknown_or_ineligible)']:
                value=cross_counts.setdefault((domain,host,year),{'metadata_mentions':0,
                    'eligible_with_chunks':0,'published_with_chunks':0})
                value['metadata_mentions']+=1
                value['eligible_with_chunks']+=usable
                value['published_with_chunks']+=usable and row['status']=='published'
        for name in matches:
            value = domains[name]
            value['metadata_mentions'] += 1
            value['eligible_with_chunks'] += usable
            value['published_with_chunks'] += usable and row['status'] == 'published'
            value['explicit_year_mentions'].update(effective_years)
            if usable and len(value['samples']) < 3:
                value['samples'].append({key: row.get(key) for key in
                    ('id','title','source_url','published_at','sha256')})
    for value in domains.values():
        value['explicit_year_mentions'] = dict(value['explicit_year_mentions'])
        value['coverage_verified'] = False
    for value in host_details.values():
        for field in ('effective_year_mentions','title_domains'):
            value[field]=dict(sorted(value[field].items()))
    return {'document_count': len(documents), 'chunk_count': sum(chunk_counts.values()),
            'eligible_documents_with_chunks': eligible_count,
            'reviewed_published_documents': statuses.get('published',0),
            'document_statuses': dict(statuses), 'source_decisions': dict(decisions),
            'source_hosts': dict(sorted(hosts.items())),
            'source_host_breakdown': dict(sorted(host_details.items())),
            'domain_source_year_breakdown': [dict(domain=d,source_host=h,effective_year=y,**value)
                for (d,h,y),value in sorted(cross_counts.items())],
            'cross_tab_note': 'Domains and years can overlap per document. Host identity is not publisher or applicability; unknown/ineligible annual values remain separate from verified years. Counts are inventories, not completeness percentages.',
            'effective_year_mentions': dict(sorted(years.items())),
            'recorded_publishers': dict(sorted(publishers.items())),
            'college_assignment_verified': False,
            'college_gap': 'Publisher is recorded metadata, not a verified college assignment. Host/college mapping and applicability require source review.',
            'missing_publication_date': missing_date, 'missing_publisher': missing_publisher,
            'eligible_without_annual_evidence': undated_eligible,
            'eligible_with_annual_evidence': dated_eligible,
            'eligible_annual_evidence_before_current_year': old_eligible,
            'unique_document_hashes': len(hashes),
            'same_hash_additional_document_records': sum(n-1 for n in hashes.values()),
            'unmatched_title_metadata': unmatched, 'domains': domains,
            'full_school_coverage_proven': False, 'gold_standard_questions': 0,
            'note': 'Title keyword counts overlap and can miss or misclassify content. Annual metadata is not proof of current validity; identical hashes do not authorize deleting provenance. Required topics remain unverified until original-source review.'}
