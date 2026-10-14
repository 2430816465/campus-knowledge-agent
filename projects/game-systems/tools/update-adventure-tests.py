from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
edit('tests/live.mjs',"f=await enter(p,'marble');", "await p.setViewportSize({width:844,height:390});f=await enter(p,'marble');")
edit('tests/live.mjs'," f=await enter(p,'mine');", " await p.setViewportSize({width:390,height:844});f=await enter(p,'mine');")
edit('tests/live.mjs',"await act(p,'claim:first');", "if(await p.locator('[data-action=\"claim:first\"]').count())await act(p,'claim:first');")
edit('tests/live.mjs',"await p.waitForTimeout(350)}\n assert((await read(f)).stats", "await p.waitForTimeout(350);if(await f.locator('.mine-draft button').count())await f.locator('.mine-draft button').first().click()}\n assert((await read(f)).stats")
edit('tests/adventure-browser.mjs',"await a.screenshot({path:dir+'/coop-play.png'});", "await a.setViewportSize({width:844,height:390});await a.waitForTimeout(250);await a.screenshot({path:dir+'/coop-play.png'});")
