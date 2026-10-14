from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'app/static/admin.html';t=p.read_text(encoding='utf-8')
old='<button type="submit">保存待审核候选</button></form>'
new=old+'''<p>不同赛道分别建档：先在上方选择通知、证据、原文和依据。新记录不继承原赛事日期、资格和认定，须分别审核。</p><label>新赛道名称<input id="scope-track" maxlength="100" placeholder="须逐字出现在支持原文中"></label><label>阶段（可留空）<input id="scope-phase" maxlength="100"></label><button id="split-scope" type="button">按证据建立独立赛道</button>'''
if 'id="split-scope"' not in t:
    assert old in t;p.write_text(t.replace(old,new),encoding='utf-8')
# Windows PowerShell 5.1 需要 BOM 才能可靠识别含中文的脚本。
for path in (root/'scripts').glob('*.ps1'):
    text=path.read_text(encoding='utf-8-sig');path.write_text(text,encoding='utf-8-sig')
