import hashlib
import os
import ipaddress
import re
import socket
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from urllib.parse import urlsplit, urljoin
import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from .config import DATA, MAX_FILE, SCHOOL
from .db import Document, Chunk, Competition, Candidate, Audit, timestamp
from .model import embeddings

def uid():
    return str(uuid.uuid4())

def validate_url(url):
    p = urlsplit(url)
    host = (p.hostname or '').lower()
    if p.scheme not in ('http', 'https') or p.username or p.password or p.port not in (None, 80, 443):
        raise ValueError('仅允许无凭据的 HTTP/HTTPS 官网链接')
    if host != 'njxzc.edu.cn' and not host.endswith('.njxzc.edu.cn'):
        raise ValueError('当前导入范围仅限南京晓庄学院官网；其他来源请导入授权文件')
    addresses = socket.getaddrinfo(host, p.port or (443 if p.scheme == 'https' else 80))
    if any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('禁止访问本地或内网地址')
    return url

_archive_client = ContextVar('archive_fetch_client', default=None)


@contextmanager
def pooled_archive_fetches():
    """Reuse HTTP connections within one locked batch; no global session."""
    if _archive_client.get() is not None:
        yield
        return
    with httpx.Client(timeout=35, follow_redirects=False, trust_env=False,
            headers={'User-Agent': 'CampusAgent/0.1 (public notices; local archive)'},
            limits=httpx.Limits(max_connections=4, max_keepalive_connections=4,
                                keepalive_expiry=30)) as client:
        token = _archive_client.set(client)
        try:
            yield
        finally:
            _archive_client.reset(token)


@contextmanager
def fetch_client():
    shared = _archive_client.get()
    if shared is not None:
        # Preserve anonymous fetch isolation while reusing only the transport.
        shared.cookies.clear()
        yield shared
    else:
        with httpx.Client(timeout=35, follow_redirects=False, trust_env=False,
                headers={'User-Agent': 'CampusAgent/0.1 (public notices; local archive)'}) as client:
            yield client


def fetch(url, guard=None):
    # 每一跳单独核验，避免重定向进入校内系统或本地服务。
    # Optional caller policy runs before DNS or HTTP on the initial URL and
    # every redirect. Other import callers retain their existing URL checks.
    with fetch_client() as client:
        for _ in range(5):
            if guard is not None:
                guard(url)
            validate_url(url)
            with client.stream('GET', url) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    url = urljoin(url, r.headers['location'])
                    continue
                r.raise_for_status()
                content = bytearray()
                for block in r.iter_bytes():
                    content.extend(block)
                    if len(content) > MAX_FILE:
                        raise ValueError('资料超过 20MB，需拆分后导入')
                return bytes(content), r.headers.get('content-type', ''), url
    raise ValueError('重定向次数过多')

def paragraphs(text):
    # 保留段落顺序；长段落分窗，定位含偏移。
    blocks = []
    for n, line in enumerate(text.splitlines(), 1):
        line = re.sub(r'[ \t]+', ' ', line).strip()
        if len(line) < 2:
            continue
        for start in range(0, len(line), 900):
            blocks.append((f'段落 {n} / 字符 {start + 1}', line[start:start+1000]))
    return blocks

def parse(content, suffix, source_url=None):
    title, published, publisher, links = None, None, None, []
    warnings = []
    # Historical WebPlus originals retain their .psp raw_name. Route only
    # positively identified HTML; never rename the original or infer a type
    # from the URL alone, and never fetch embedded resources here.
    if suffix == '.psp':
        prefix = content[:4096].removeprefix(b'\xef\xbb\xbf').lstrip()
        if b'\x00' in prefix or not re.match(br'(?:<!doctype\s+html(?:\s|>)|<html(?:\s|>))', prefix, re.I):
            raise ValueError('PSP 原件未识别为 HTML；保留原件，需核验实际格式')
        suffix = '.html'
        warnings.append('历史 PSP 原件按已识别的 HTML 只读解析；原件名称、来源和审核状态不变。')
    from .file_formats import office_package_suffix
    detected = office_package_suffix(content,suffix)
    if detected and detected != suffix:
        warnings.append(f'原件后缀 {suffix} 与内部OOXML格式 {detected} 不一致；按内部格式只读解析，未修改原件或来源。')
        suffix = detected
    if suffix in ('.html', '.htm'):
        soup = BeautifulSoup(content, 'html.parser', from_encoding='utf-8')
        heading = soup.select_one('.arti_title, .Article_Title, .article-title, h1')
        title = heading.get_text(' ', strip=True) if heading else (soup.title.get_text(strip=True) if soup.title else None)
        page_text = soup.get_text(' ', strip=True)
        date_match = re.search(r'(?:发布时间|发布日期|发布于)[：:\s]*(\d{4}-\d{2}-\d{2})', page_text)
        published = date_match.group(1) if date_match else None
        if published is None:
            from .html_metadata import displayed_article_date
            published,date_warnings,_=displayed_article_date(soup)
            warnings.extend(date_warnings)
        body = soup.select_one('.wp_articlecontent, .Article_Content, .article-content, #content')
        if body is None:
            body = soup.body or soup
            warnings.append('未找到固定正文容器；请审核是否含导航内容')
        for node in body.select('script, style, nav, footer'):
            node.decompose()
        if source_url:
            for anchor in body.select('a[href]'):
                link = urljoin(source_url, anchor['href'])
                if re.search(r'\.(pdf|docx?|xlsx?|png|jpe?g)(?:\?|$)', link, re.I):
                    links.append({'title': anchor.get_text(strip=True), 'url': link, 'status': 'not_imported'})
        # 内联 span 不应切断“我校报名时间：即日起至”和后面的日期。
        nodes = body.find_all(['p', 'tr', 'li', 'h2', 'h3'])
        blocks = [(f'网页段落 {n}', node.get_text(' ', strip=True)) for n,node in enumerate(nodes,1) if node.get_text(' ',strip=True)]
        # Empty layout/image paragraphs do not prove the article has no text.
        # Preserve normal paragraph locations; use the existing body fallback
        # only when none of the structural nodes yielded literal text.
        if not blocks:
            blocks = paragraphs(body.get_text('\n', strip=True))
        blocks = [(loc + f' / 字符 {i+1}', text[i:i+1000]) for loc,text in blocks for i in range(0,len(text),900)]
        # 来源子域名不等于发布单位，保留未知，交由来源正文/教师审核。
        publisher = None
    elif suffix == '.pdf':
        import pdfplumber
        import logging
        logging.getLogger('pdfminer').setLevel(logging.ERROR)
        from io import BytesIO
        blocks = []
        with pdfplumber.open(BytesIO(content)) as reader:
            if len(reader.pages) > 300:
                raise ValueError('PDF 超过 300 页，需拆分')
            ocr_pages = 0
            for n, page in enumerate(reader.pages, 1):
                # 官方 PDF 存在同位置重复字形；仅消除重叠字形，不猜测文字。
                text = page.dedupe_chars(extra_attrs=()).extract_text() or ''
                if len(text.strip()) < 20:
                    if ocr_pages >= 20:
                        warnings.append(f'第 {n} 页待 OCR；单文件限 20 个扫描页，请拆分')
                        continue
                    import pypdfium2
                    pdf = pypdfium2.PdfDocument(content)
                    bitmap = pdf[n-1].render(scale=1.5)
                    try:
                        raster = bitmap.to_numpy()
                        result = local_ocr(raster)
                        from .raster_ocr import positioned_blocks
                        page_blocks, page_warnings = positioned_blocks(result, raster.shape[1], raster.shape[0], f'第 {n} 页 / ')
                        blocks.extend(page_blocks)
                        warnings.extend(page_warnings)
                        warnings.append(f'第 {n} 页 OCR xy为1.5倍页面渲染像素坐标；各框独立，不推定跨框日期或表格关系')
                        if not result:
                            warnings.append(f'第 {n} 页 OCR 无结果，待 OCR 复核')
                        else:
                            warnings.append(f'第 {n} 页使用本地 OCR；关键字段须人工核对图像')
                    finally:
                        bitmap.close(); pdf.close()
                    ocr_pages += 1
                else:
                    for location, line in paragraphs(text):
                        blocks.append((f'第 {n} 页 / {location}', line))
    elif suffix == '.docx':
        from docx import Document as WordDocument
        from io import BytesIO
        doc = WordDocument(BytesIO(content))
        blocks = [(f'Word 段落 {n}', p.text) for n, p in enumerate(doc.paragraphs, 1) if p.text.strip()]
        for n, table in enumerate(doc.tables, 1):
            blocks.extend((f'Word 表 {n} 行 {j}', ' | '.join(cell.text for cell in row.cells)) for j, row in enumerate(table.rows, 1))
        from .docx_images import extract_docx_images
        image_blocks, image_warnings = extract_docx_images(doc, local_ocr)
        blocks.extend(image_blocks)
        warnings.extend(image_warnings)
    elif suffix == '.xlsx':
        from openpyxl import load_workbook
        from io import BytesIO
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
        blocks = []
        try:
            for sheet in workbook:
                for n, row in enumerate(sheet.iter_rows(values_only=True), 1):
                    if n > 10000:
                        warnings.append(f'{sheet.title} 超过 10000 行；已截断，需拆分')
                        break
                    text = ' | '.join('' if v is None else str(v) for v in row)
                    if text.strip(' |'):
                        blocks.append((f'工作表 {sheet.title} 行 {n}', text))
        finally:
            workbook.close()
        warnings.append('XLSX本地只读解析；不执行宏、不计算公式，仅保留缓存值，图表和嵌入对象未解析')
    elif suffix == '.xls':
        import xlrd
        workbook = xlrd.open_workbook(file_contents=content, on_demand=True)
        blocks = []
        try:
            for sheet in workbook.sheets():
                for n in range(min(sheet.nrows, 10000)):
                    values = []
                    for cell in sheet.row(n):
                        if cell.ctype == xlrd.XL_CELL_DATE:
                            value = xlrd.xldate_as_datetime(cell.value, workbook.datemode).isoformat(sep=' ')
                        elif cell.ctype == xlrd.XL_CELL_NUMBER and cell.value.is_integer():
                            value = str(int(cell.value))
                        else:
                            value = str(cell.value) if cell.value != '' else ''
                        values.append(value)
                    text = ' | '.join(values)
                    if text.strip(' |'):
                        blocks.append((f'工作表 {sheet.name} 行 {n+1}', text))
                if sheet.nrows > 10000:
                    warnings.append(f'{sheet.name} 超过 10000 行；已截断，需拆分')
        finally:
            workbook.release_resources()
        warnings.append('旧版XLS本地只读解析；不执行宏，不计算公式，仅保留缓存单元格值；图表和嵌入对象未解析')
    elif suffix in ('.png', '.jpg', '.jpeg', '.webp'):
        import numpy as np
        import cv2
        image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.shape[0] * image.shape[1] > 25000000:
            raise ValueError('图片无效或超过 2500 万像素')
        result = local_ocr(image)
        from .raster_ocr import positioned_blocks
        blocks, ocr_warnings = positioned_blocks(result, image.shape[1], image.shape[0])
        warnings.extend(ocr_warnings)
        warnings.append('OCR xy为原图像素坐标；各框独立，不推定跨框日期或表格关系')
        warnings.append('OCR 候选：所有日期、人数和资格均须人工复核')
    elif suffix in ('.txt', '.md', '.csv'):
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = content.decode('gb18030')
        blocks = paragraphs(text)
    else:
        raise ValueError('不支持该文件格式；旧版 DOC/XLS 请另存为 DOCX/XLSX')
    return title, published, publisher, blocks, warnings, links


_ocr_engine = None
def local_ocr(image):
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    result, _ = _ocr_engine(image)
    return result

def extract_candidates(session, comp, chunks, document):
    year = comp.year
    for chunk in chunks:
        text = chunk.text
        fields = []
        if re.search(r'参赛对象|全校学生|本科生|研究生|跨专业|年级|在校学生', text):
            fields.append(('eligibility', {'text': text}))
        if re.search(r'报名时间|报名截止|报名.*至', text):
            # 跨段、省略年份/时间、24:00 都保留原文精度，不猜测截止。
            # 同段可能先写开放时间再写截止；不能把第一个日期当截止。
            normalized=re.sub(r'(\d)\s+(\d)(?=\s*日)',r'\1\2',text)
            all_dates=re.findall(r'\d{1,2}\s*月\s*\d{1,2}\s*日',normalized)
            if len(all_dates)>1:
                fields.append(('internal_deadline' if re.search(r'我校报名|校内.*报名|校赛.*报名',text) else 'organizer_deadline',{'text':text,'precision':'ambiguous','timezone':'Asia/Shanghai','reason':'同段存在多个日期，需分别核对开始与截止'}))
            match = None if len(all_dates)>1 else re.search(r'(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*[:：]\s*(\d{2})', normalized)
            if not match and len(all_dates)<=1:
                match = re.search(r'(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日', normalized)
            if match and ('截止' in text or '至' in text):
                y = int(match[1]) if match[1] else year
                if y:
                    value = {'value': f'{y:04d}-{int(match[2]):02d}-{int(match[3]):02d}', 'precision': 'date', 'timezone': 'Asia/Shanghai', 'year_inferred': not bool(match[1])}
                    if len(match.groups()) == 5:
                        hour = int(match[4])
                        value.update(value=value['value'] + f'T{hour:02d}:{int(match[5]):02d}:00+08:00', precision='minute')
                        if hour == 24:
                            value = {'text': text, 'precision': 'ambiguous', 'timezone': 'Asia/Shanghai'}
                    internal = bool(re.search(r'我校报名|校内.*报名|校赛.*报名|校赛参赛报名', text))
                    fields.append(('internal_deadline' if internal else 'organizer_deadline', value))
        if re.search(r'每[支个]?队.*\d.*人|[组队团队].*人数', text):
            fields.append(('team_size', {'text': text}))
        if re.search(r'费用|收费|报销', text):
            fields.append(('fee', {'text': text}))
        if re.search(r'材料|提交|承诺书|论文|报名表', text):
            fields.append(('materials', {'text': text}))
        if re.search(r'报名方式|报名.*群|报名.*网|报名入口', text):
            fields.append(('registration', {'text': text}))
        if re.search(r'认定|学分|奖励|一类|二类|三类', text):
            fields.append(('recognition', {'text': text}))
        for field, value in fields:
            session.add(Candidate(id=uid(), competition_id=comp.id, field=field, value=value, quote=text, chunk_id=chunk.id))

def ingest_bytes(session, content, filename, url=None, visibility='private', kind='notice', parent_id=None, embed=True):
    digest = hashlib.sha256(content).hexdigest()
    existing = session.scalar(select(Document).where(Document.sha256 == digest, Document.source_url == url, Document.visibility == visibility))
    if existing:
        existing.checked_at = timestamp()
        if parent_id and not existing.parent_id:
            existing.parent_id = parent_id
        link_attachment(session, parent_id, url, existing)
        session.commit()
        return existing, True
    suffix = Path(urlsplit(url).path if url else filename).suffix.lower()
    if suffix in ('.htm', '.psp', '') and url:
        suffix = '.html'
    raw_name = digest + suffix
    raw_path = DATA / 'raw' / raw_name
    # Never overwrite an existing original, even when a duplicate source URL
    # legitimately needs its own provenance document.
    staged = raw_path.with_name(raw_name + '.' + uid() + '.incoming')
    try:
        with staged.open('xb') as original:
            original.write(content)
        try:
            os.link(staged, raw_path)  # atomic no-replace on the local NTFS store
        except FileExistsError:
            if hashlib.sha256(raw_path.read_bytes()).hexdigest() != digest:
                raise ValueError('Existing original differs from its SHA256; retained without overwrite.')
    finally:
        staged.unlink(missing_ok=True)
    doc = Document(id=uid(), title=filename, source_url=url, sha256=digest, raw_name=raw_name, mime=suffix, visibility=visibility, kind=kind, parent_id=parent_id)
    session.add(doc)
    session.flush()
    try:
        title, published, publisher, blocks, warnings, links = parse(content, suffix, url)
        doc.title = title or filename
        doc.published_at, doc.publisher, doc.attachments = published, publisher, links
        chunks = [Chunk(id=uid(), document_id=doc.id, text=text, location=location) for location, text in blocks if text.strip()]
        if not chunks:
            empty_messages = {
                '.html': '未提取到网页正文；请核验正文容器及嵌入附件、正文图片的独立处理结果',
                '.htm': '未提取到网页正文；请核验正文容器及嵌入附件、正文图片的独立处理结果',
                '.pdf': '未提取到 PDF 正文；文字提取和本地 OCR 无可用结果，请核对原页及文件限制',
            }
            doc.status, doc.error = 'parse_failed', empty_messages.get(
                suffix, '未提取到可检索文本；请核验原件内容、文件格式及图像清晰度')
        elif any('待 OCR' in warning or '截断' in warning for warning in warnings):
            doc.status = 'partial_parse'
        session.add_all(chunks)
        session.flush()
        if embed and chunks:
            try:
                for i in range(0, len(chunks), 12):
                    batch = chunks[i:i+12]
                    vectors = embeddings([doc.title + '\n' + c.text for c in batch])
                    for c, vector in zip(batch, vectors):
                        c.vector, c.embedding_model = vector, 'qwen3-embedding:0.6b'
            except Exception as exc:
                warnings.append(f'语义索引未完成：{type(exc).__name__}；仍可关键词检索')
        # 相同 URL 再发布视为修订候选；审核发布前旧版仍有效。
        previous = session.scalars(select(Document).where(Document.source_url == url, Document.id != doc.id).order_by(Document.version.desc())).first() if url else None
        if previous:
            doc.version, doc.supersedes = previous.version + 1, previous.id
            warnings.append('同来源内容已变更：须审核后替代旧版')
        years = re.findall(r'(20\d{2})', doc.title)
        year = int(years[0]) if years else None
        full_text = '\n'.join(c.text for c in chunks)
        if year and re.search(rf'20\d{{2}}年.*(?:开始|集训)', full_text):
            for wrong in re.findall(r'(20\d{2})年.{0,25}(?:开始|集训)', full_text):
                if int(wrong) != year:
                    warnings.append(f'年份冲突：标题 {year}，正文 {wrong}；需联系发布单位核实')
        doc.warnings = warnings
        if kind == 'notice' and chunks:
            comp = Competition(id=uid(), name=doc.title, year=year, document_id=doc.id, school=SCHOOL, fields={})
            session.add(comp)
            session.flush()
            extract_candidates(session, comp, chunks, doc)
    except Exception as exc:
        doc.status, doc.error = 'parse_failed', f'{type(exc).__name__}: {str(exc)[:400]}'
    link_attachment(session, parent_id, url, doc)
    session.add(Audit(id=uid(), action='import', entity_id=doc.id, changes={'sha256': digest, 'status': doc.status}))
    session.commit()
    return doc, False


def link_attachment(session, parent_id, url, doc):
    parent = session.get(Document, parent_id) if parent_id else None
    if parent:
        parent.attachments = [{**a, 'status':doc.status, 'document_id':doc.id} if a['url']==url else a for a in parent.attachments]

def ingest_url(session, url, kind='notice', embed=True, parent_id=None):
    content, mime, final_url = fetch(url)
    return ingest_bytes(session, content, Path(urlsplit(final_url).path).name, final_url, 'public', kind, parent_id, embed)
