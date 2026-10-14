"""Conservative fallback for an article's displayed date, not policy validity."""
from datetime import date
import re

METADATA_DATE=re.compile(r'(?:(发布时间|发布日期|发布于)[：:\s]*)?(\d{4})[-/](\d{1,2})[-/](\d{1,2})'
    r'(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?')


def displayed_article_date(soup):
    body=soup.select_one('.wp_articlecontent, .Article_Content, .article-content, #content')
    candidates=[]
    for selector in ('.arti_update','.Article_PublishDate','.arti_time'):
        for node in soup.select(selector):
            if body is not None and (node is body or any(p is body for p in node.parents)):continue
            literal=node.get_text(' ',strip=True)
            match=METADATA_DATE.fullmatch(literal)
            if not match:continue
            try:
                value=date(int(match[2]),int(match[3]),int(match[4])).isoformat()
                if match[5] and not (0<=int(match[5])<24 and 0<=int(match[6])<60
                        and 0<=int(match[7] or 0)<60):continue
            except ValueError:continue
            candidates.append({'date':value,'literal':literal,'selector':selector,
                'role':'explicit_publication' if match[1] else 'unlabelled_page_timestamp'})
    unique={c['date'] for c in candidates}
    if len(unique)>1:return None,['网页元信息出现不同日期，未自动选择发布日期。'],candidates
    if not unique:return None,[],candidates
    explicit=any(c['role']=='explicit_publication' for c in candidates)
    warnings=[] if explicit else ['网页日期来自未标注类型的文章元信息显示时间；首次发布或更新时间未区分，不证明政策当前有效。']
    return next(iter(unique)),warnings,candidates
