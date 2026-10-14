from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def edit(name,fn):
 p=ROOT/name;s=p.read_text(encoding='utf-8');p.write_text(fn(s),encoding='utf-8')
def rep(name,old,new):
 def fn(s):
  if old not in s:raise ValueError(name+': missing '+old[:60])
  return s.replace(old,new)
 edit(name,fn)
# Load one shared test-ad policy before game-owned handlers.
for name in ['index.html']+[f'games/{g}/index.html' for g in ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']]+['games/marble/puzzle.html']:
 edit(name,lambda s:s.replace('<head>','<head><script src="'+('games/shared/' if name=='index.html' else '../shared/')+'rewarded-ads.js"></script>',1) if '<head>' in s else s.replace('<head ', '<head ',1))
# Marble: explicitly requested landscape and browser fallback without advancing a hidden battle.
rep('games/marble/main.js',"window.CampEconomyState=()=>({playing:screen==='game'&&!overlay&&!hostPaused&&!busy});", "const orientationBlocked=()=>screen==='game'&&innerHeight>innerWidth;\nwindow.CampEconomyState=()=>({playing:screen==='game'&&!overlay&&!hostPaused&&!busy&&!orientationBlocked()});\nconst rotate=document.createElement('section');rotate.id='marble-rotate';rotate.setAttribute('role','dialog');rotate.style.cssText='position:fixed;inset:0;z-index:8000;background:#f4e5c7;color:#563b26;display:none;place-content:center;text-align:center;padding:24px';rotate.innerHTML='<h2>把手机横过来，继续守线</h2><p>战斗已暂停，旋转后自动继续。</p><button style=\"min-height:44px\">开启横屏 / 全屏</button>';rotate.querySelector('button').onclick=()=>requestLandscape(true);document.body.append(rotate);\nfunction syncRotate(){rotate.style.display=orientationBlocked()?'grid':'none';if(orientationBlocked()){pointer=null;g.cancelAim();}}addEventListener('resize',syncRotate);")
rep('games/marble/main.js',"function ui(){const html=", "function ui(){syncRotate();const html=")
rep('games/marble/main.js',"function loop(now){const rawDt=", "function loop(now){if(orientationBlocked()){requestAnimationFrame(loop);return;}const rawDt=")
rep('games/marble/main.js',"function completeAd(){if(busy)return;", "function completeAd(){if(busy)return;const permit=window.CampAds.reserve('marble',g.adKind,g.run?.id);if(!permit.ok){g.notice=permit.reason;overlay='';showScene();return;}")
rep('games/marble/main.js',"if(outcome!=='cancel'){const source=outcome==='complete'?'ad':'fallback';", "if(window.CampAds.complete(permit.ticket,outcome)){const source='ad';")
rep('games/marble/main.js',"else g.notice='已提前关闭 · 原有奖励和流程保留'", "else g.notice=outcome==='cancel'?'已提前关闭 · 原有奖励和流程保留':'模拟广告失败 · 未发放帮助，免费选项仍可使用'")
edit('games/marble/main.js',lambda s:s.replace('加载失败按平台异常兜底发放并单独记录。','加载或展示失败不发奖励，不消耗游戏内帮助机会。'))
# Bakery: reveal resource state and the limiting stage, with an actual upgrade comparison.
rep('games/workshop/game.js',"import {createManagementUI}","import {productionInsight} from './production-insight.js';\nimport {createManagementUI}")
rep('games/workshop/game.js',"if(i===3)$('desc-'+i)","if(i===4){const a=productionInsight(s),copy=structuredClone(s);copy.upgrades.polish=Math.min(8,copy.upgrades.polish+1);const next=productionInsight(copy);$('desc-'+i).textContent=`${a.state} · 理论产出 ${Number.isFinite(a.cycle)?a.cycle.toFixed(1)+'秒/个':'需解锁原料'}；瓶颈：${a.bottleneck}。升级后 ${Number.isFinite(next.cycle)?next.cycle.toFixed(1)+'秒/个':'原料仍未解锁'}${a.manual?'；尚需人工运输':''}`;}\n  if(i===3)$('desc-'+i)")
rep('games/workshop/game.js',"if(!offer)return;dialog('奖励广告'", "if(!offer)return;const permit=window.CampAds.reserve('workshop',placement,'bakery-'+state.deliveries);if(!permit.ok){toast(permit.reason);return;}adTicket=permit.ticket;dialog('开发模拟奖励广告'")
rep('games/workshop/game.js',"const ok=claimReward(state,offer);", "const ok=window.CampAds.complete(adTicket,'complete')&&claimReward(state,offer);adTicket=null;")
rep('games/workshop/game.js',"function closeDialog(){", "let adTicket=null;\nfunction closeDialog(){window.CampAds.cancel(adTicket);adTicket=null;")
# Nightwatch progression introduces one system at a time without taking anything owned away.
rep('games/nightwatch/game.js',".map(([ic,action,label])=>button(glyph(ic)+label,action)).join('')", ".filter(([,action])=>action==='codex'||Object.keys(p.clears).length>0||p.bag?.length>0).map(([ic,action,label])=>button(glyph(ic)+label,action)).join('')")
rep('games/nightwatch/game.js',"s.wall=Math.max(0,s.wall-amount)","s.wall=Math.max(0,s.wall-amount)") if False else None
# Evolve: shared reward policy and non-color-only same-level recognition.
rep('games/evolve/main.js',"ad={elapsed:0,outcome:'complete'};setScreen('ad');", "const permit=window.CampAds.reserve('evolve','revive',g.run.id);if(!permit.ok){toast(permit.reason);break;}ad={elapsed:0,outcome:'complete',ticket:permit.ticket};setScreen('ad');")
rep('games/evolve/main.js',"const outcome=ad.outcome;ad=null;if(outcome==='complete')", "const outcome=ad.outcome,ticket=ad.ticket;ad=null;if(window.CampAds.complete(ticket,outcome))")
rep('games/evolve/main.js',"case 'cancelAd':ad=null;", "case 'cancelAd':window.CampAds.cancel(ad?.ticket);ad=null;")
rep('games/evolve/render.js',"if(danger){ctx.strokeStyle='#c8876b';", "if(e.level===r.level){ctx.strokeStyle='#fff5ad';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(e.x,e.y,er+5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);this.label('同级 · 可合成',e.x,e.y-er-13,'#654526','#fff5c9',10);}if(danger){ctx.strokeStyle='#c8876b';")
# Rush: new runs can recover from a poor gate; old version-4 saves retain their rules.
rep('games/rush/battle.js','layoutVersion:4,mistakes:0','layoutVersion:5,mistakes:0')
rep('games/rush/battle.js',"if(b.mistakes>STAGES[b.stage-1].mistakeLimit)return 'broken';", "if(b.layoutVersion<5&&b.mistakes>STAGES[b.stage-1].mistakeLimit)return 'broken';")
rep('games/rush/battle.js',"if(wrong)notice(b,bossSeal(b)==='broken'?", "if(wrong&&b.layoutVersion>=5)notice(b,'选门损失 · 首领抗性 '+Math.round((1-bossDamageScale(b))*100)+'%，仍可用补给和升级击败','#ffb99e');else if(wrong)notice(b,bossSeal(b)==='broken'?")
rep('games/rush/scene.js',"if(b.layoutVersion>=4&&e.correctSide===(i?'right':'left'))", "if(b.layoutVersion>=4&&(b.layoutVersion<5||b.stage<=2)&&e.correctSide===(i?'right':'left'))")
rep('games/rush/game.js',"失误 ${b.mistakes} / ${STAGES[b.stage-1].mistakeLimit}", "失误 ${b.mistakes}${b.layoutVersion>=5?' · 首领抗性 '+Math.round((1-bossDamageScale(b))*100)+'%':' / '+STAGES[b.stage-1].mistakeLimit}")
rep('games/rush/game.js',"破阵符印门为正确路线 · 本关容错 ${s.mistakeLimit} 次", "前两关显示路线提示；后续比较算式与预计人数。错误增加首领抗性，最多24%，仍可补救")
print('Applied gameplay, feedback and shared test-ad changes.')
