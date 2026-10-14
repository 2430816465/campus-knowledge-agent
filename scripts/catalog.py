import json,re,sys,logging
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pdfplumber,pypdfium2
from sqlalchemy import select,func
from app.db import Session,Document,Chunk,Competition,Candidate,Audit
from app.config import DATA,ROOT
from app.ingest import uid
logging.getLogger('pdfminer').setLevel(logging.ERROR)

with Session() as session:
    doc=session.scalar(select(Document).where(Document.kind=='catalog'))
    if not doc:raise SystemExit('先导入2026分类目录')
    path=DATA/'raw'/doc.raw_name
    pdf=pypdfium2.PdfDocument(path)
    pdf[0].render(scale=1.5).to_pil().save(ROOT/'reports'/'catalog-page1.png')
    rows=[];issues=[]
    with pdfplumber.open(path) as parsed:
        for page_index,page in enumerate(parsed.pages,1):
            for table_index,table in enumerate(page.dedupe_chars(extra_attrs=()).extract_tables(),1):
                for row_index,row in enumerate(table,1):
                    values=[re.sub(r'\s+','',v or '') for v in row]
                    if len(values)!=4:continue
                    number,name,organizer,category=values
                    if '2026年南京晓庄学院' in number:
                        doc.title=number
                    if not number.isdigit() or not name:continue
                    location=f'第{page_index}页 / 表{table_index} / 行{row_index}'
                    quote=' | '.join(values)
                    if category not in ('一类A','一类B','二类A','二类B','三类'):
                        issues.append({'location':location,'quote':quote,'issue':'分类值需核实'})
                    # 叠字和跨页断行保留原样，避免自动修字篡改正式名称。
                    if re.search(r'(.)\1(.)\2(.)\3',name):
                        issues.append({'location':location,'quote':quote,'issue':'可能存在PDF叠字，请核对图像'})
                    rows.append({'number':number,'name':name,'organizer':organizer,'category':category,'location':location,'quote':quote})
    existing={chunk.location:(comp,candidate,chunk) for comp,candidate,chunk in session.execute(select(Competition,Candidate,Chunk).join(Candidate,Candidate.competition_id==Competition.id).join(Chunk,Candidate.chunk_id==Chunk.id).where(Competition.document_id==doc.id))}
    for row in rows:
        if row['location'] in existing:
            comp,candidate,chunk=existing[row['location']]
            if candidate.status!='pending':
                raise SystemExit('目录已含人工审核项；请通过新版本导入，不覆盖审核记录')
            comp.name=row['name']
            years=re.findall(r'(?<!\d)(20\d{2})(?!\d)',row['name'])
            comp.year=int(years[0]) if len(set(years))==1 else None
            if chunk.text!=row['quote']:
                chunk.text=row['quote'];chunk.vector=None;chunk.embedding_model=None
            candidate.quote=row['quote']
            candidate.value={'category':row['category'],'organizer':row['organizer'],'catalog_number':row['number']}
        else:
            chunk=Chunk(id=uid(),document_id=doc.id,text=row['quote'],location=row['location'])
            session.add(chunk);session.flush()
            years=re.findall(r'(?<!\d)(20\d{2})(?!\d)',row['name'])
            comp=Competition(id=uid(),name=row['name'],year=int(years[0]) if len(set(years))==1 else None,document_id=doc.id,fields={})
            session.add(comp);session.flush()
            candidate=Candidate(id=uid(),competition_id=comp.id,field='recognition',value={'category':row['category'],'organizer':row['organizer'],'catalog_number':row['number']},quote=row['quote'],chunk_id=chunk.id)
            session.add(candidate)
    unmatched=set(existing)-{r['location'] for r in rows}
    if unmatched:raise SystemExit('目录位置变化，停止更新，需人工比对：'+str(sorted(unmatched)))
    doc.warnings=list(dict.fromkeys(doc.warnings+['2026目录抽取候选未完成逐行人工核验；目录没有报名通知，不能据此认定报名中']))
    session.add(Audit(id=uid(),action='catalog_extract',entity_id=doc.id,changes={'candidate_rows':len(rows),'issues':len(issues)}))
    session.commit()
    report={'document_id':doc.id,'source':doc.source_url,'sha256':doc.sha256,'pages':len(pdf),'extracted_rows':len(rows),'issues':issues,'rows':rows,'human_verified':False,'scope_note':'目录行是认定与赛事名称候选，不包含当届报名资格与日期；不能当作所有赛事可报名清单。'}
    (ROOT/'reports'/'catalog.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('rows','issues')},ensure_ascii=False,indent=2))
