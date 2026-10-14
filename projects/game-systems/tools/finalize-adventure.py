from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
edit('games/coop/src/client.js',"lead1:'金色先锋'", "lead1:'金色先锋',together:'默契到站',steady:'稳稳同行'")
edit('games/coop/server/server.js','  room.slots[freeIndex] = slot;', '  room.slots[freeIndex] = slot;\n  resetContracts(room);')
edit('tests/live.mjs',"await act(p,'menu');await p.waitForTimeout(100);assert(await p.locator('dialog[open]').count());await act(p,'close');await exit(p);checks.push('marble: current entry starts, shared menu pauses and exits');", "await f.locator('[data-action=pause]').click();await f.getByText('探险暂停',{exact:true}).waitFor();await f.locator('[data-action=save]').click();await p.waitForFunction(()=>!document.querySelector('iframe'));checks.push('marble: current entry starts, internal pause menu saves and exits');")
