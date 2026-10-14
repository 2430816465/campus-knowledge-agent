from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
edit('pixel-home.js','✦ · ✦ · ✦ · ✦ · ✦ · ✦', '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>')
with (R/'unified.css').open('a',encoding='utf-8') as f:f.write('''
.camp-playfield>.camp-lights{top:115px;left:24%;width:52%;height:35px;z-index:3;display:flex;justify-content:space-between;border-top:2px solid #775d34;transform:rotate(3deg)}.camp-playfield>.camp-lights i{width:10px;height:15px;margin-top:5px;background:#ffe08a;border:2px solid #926e37;border-radius:40%;box-shadow:0 0 8px 3px #ffd55f99;position:relative}.camp-playfield>.camp-lights i:before{content:"";position:absolute;top:-8px;left:2px;width:2px;height:6px;background:#775d34}.camp-playfield:has(>.camp-shelf)>.camp-bubble{display:none}.camp-playfield>.camp-shelf{z-index:2;bottom:5px;font-size:12px;white-space:nowrap}
''')
edit('games/coop/src/client.js'," + routeMarks;", " + routeMarks + (Object.keys(marks.contracts||{}).length?'契'+Object.keys(marks.contracts).length:'');")
edit('games/coop/src/client.js',"    const markItems = [];", "    const markItems = [];\n    Object.keys(marks.contracts||{}).forEach(id=>{const names={safe:'平安同行',keepsake:'寻迹搭档',perfect:'完整旅程',lead0:'蓝色先锋',lead1:'金色先锋'};if(names[id])markItems.push('<span class=\"result-mark keepsake\">契 · '+names[id]+'</span>');});")
edit('games/marble/endless-data.js','每第 3 次常规／Boss 能力选择','每局可免费重选一次，刷新后仍保留选项和使用状态。已有连锁＋分裂、寒霜＋爆裂、回响＋重芯时，分别解锁雷网分裂、寒霜冰爆、轨道重炮的候选资格；符合条件的Boss奖励及每第3次选卡保证出现一个可用进化。组合进化固定效果，不参与品质升档。</p><p>每第 3 次常规／Boss 能力选择')
edit('package.json','"version": "1.1.0"','"version": "1.6.0"')
edit('package.json','node --test tests/services.test.mjs','node --test tests/services.test.mjs tests/adventure.test.mjs')
edit('android/app/build.gradle','versionCode 5','versionCode 6')
edit('android/app/build.gradle',"versionName '1.5.0'","versionName '1.6.0'")
with (R/'progress.md').open('a',encoding='utf-8') as f:f.write('''

## 2026-09-30 Adventure improvements (1.6.0)
- User: use Desktop/总 as source of truth, implement economy, randomness and out-of-run purchases. Source backup: Desktop/总/备份-完善前-20260930. Historical standalone folders unchanged.
- Latest cooperative source has 50 levels, not the three-level assumption from the earlier analysis. Preserved catalog and physics.
- Camp: mine reward depends on actual dig/depth/rooms/treasure, 0–30; no reward/ad/task farming from empty runs. Added solo achievement alternative, exclusive orb skins, visible camp lights/shelf and miner cosmetics.
- Marble: three prerequisite evolutions, Boss/every-third-offer eligibility guarantee, one persisted free reroll; owned orb skin now renders in endless gameplay.
- Mine: free seeded three-card toolbox at 5/15m, no duplicate choices, existing upgrade-slot limit respected, consumables as fallback. Stable-boundary local continuation with persistent run ID and RNG state, including pending draft and result to deduplicate camp credits.
- Coop: server-generated per-room/per-level offers, unanimous opt-in or ordinary exploration, ready reset on changed vote/level; persisted collectible contract marks and first-final-exit tracking. No physics or monetary multiplier changes. Isolated test wallet location supported.
- Rule tests: 15 passed; endless regression passed; real two-client 3-level network integration passed. Browser fixture tests: purchase/equip, draft/reload/RNG, two selections, settlement dedup, evolution/reroll, contract consensus passed; screenshots inspected. These are automated checks, not human balance validation.
''')
