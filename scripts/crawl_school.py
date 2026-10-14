"""受控公开采集：只跟随官网实际链接，不登录、不穷举URL、不抓取个人账户。"""
import argparse,hashlib,json,re,sys,time
from pathlib import Path
from urllib.parse import urljoin,urlsplit
from bs4 import BeautifulSoup
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.ingest import fetch,ingest_bytes
from app.config import ROOT,DATA
from app.db import Session,init_db,timestamp

parser=argparse.ArgumentParser()
parser.add_argument('--start',default='https://www.njxzc.edu.cn/main.htm')
parser.add_argument('--max-pages',type=int,default=24)
parser.add_argument('--depth',type=int,default=3)
args=parser.parse_args()
init_db();todo=[(args.start,0,'学校官网入口')];seen=set();events=[]
discovery=DATA/'crawl';discovery.mkdir(exist_ok=True)
def priority(title,url):
    score=0
    if re.search('竞赛|大赛|创新创业|数学建模|挑战杯|报名',title):score+=100
    if re.search('通知|公告|教务|团委|学院|学生工作|党政|机构设置',title):score+=20
    if re.search(r'jwc\.|tw\.|ie\.|pe\.|ste\.|xsc\.',url):score+=15
    if re.search('招生|招标|招聘|采购|纪委|图书|登录|邮箱',title):score-=80
    if re.search('获奖|荣获|佳绩|概况|简介|院长|教师队伍|招生|交流体验|实验室|中心简介|学院领导',title):score-=100
    return score
with Session() as session:
    while todo and len(seen)<args.max_pages:
        todo.sort(key=lambda item:priority(item[2],item[0]),reverse=True)
        url,depth,label=todo.pop(0)
        if url in seen:continue
        seen.add(url);event={'url':url,'depth':depth,'label':label,'at':timestamp()}
        try:
            content,mime,final=fetch(url)
            digest=hashlib.sha256(content).hexdigest()
            (discovery/(digest+'.html')).write_bytes(content)
            event.update(sha256=digest,final_url=final,status='visited')
            soup=BeautifulSoup(content,'html.parser')
            heading=soup.select_one('.arti_title, .Article_Title, h1')
            title=heading.get_text(' ',strip=True) if heading else label
            event['title']=title
            is_article=bool(re.search(r'/page[m]?\.(?:htm|psp)',url))
            if is_article and re.search('竞赛|大赛|数学建模|挑战杯',title) and re.search('通知|报名|选拔|章程|管理办法|目录',title):
                doc,dup=ingest_bytes(session,content,title+'.html',final,'public','notice')
                event.update(document_id=doc.id,duplicate=dup,parse_status=doc.status)
            links=[]
            if depth<args.depth:
                for a in soup.select('a[href]'):
                    href=urljoin(final,a['href']).split('#')[0]
                    text=a.get_text(' ',strip=True) or a.get('title','')
                    p=urlsplit(href);host=p.hostname or ''
                    if not (host=='njxzc.edu.cn' or host.endswith('.njxzc.edu.cn')):continue
                    if p.scheme not in ('http','https') or re.search('login|admin|auth|logout',href,re.I):continue
                    if p.path and not re.search(r'(?:\.htm[l]?|\.psp|/)$',p.path):continue
                    if priority(text,href)>0 and href not in seen:
                        links.append({'title':text,'url':href,'score':priority(text,href)})
                links.sort(key=lambda x:x['score'],reverse=True)
                for link in links[:20]:todo.append((link['url'],depth+1,link['title']))
            event['discovered_links']=links
        except Exception as exc:
            session.rollback();event.update(status='failed',error=f'{type(exc).__name__}: {str(exc)[:200]}')
        events.append(event)
        (ROOT/'reports'/'school-crawl.json').write_text(json.dumps({'entry':args.start,'visited':len(seen),'events':events,'queued_not_visited':len(todo),'scope_note':'仅公开官网实际链接；页数和深度有限，不是全校覆盖证明。'},ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in event.items() if k!='discovered_links'},ensure_ascii=False),flush=True)
        time.sleep(.7)
