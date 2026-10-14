from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'games/marble/state-endless.js'
s=p.read_text(encoding='utf-8')
def change(a,b):
 global s
 assert a in s, a[:100]
 s=s.replace(a,b,1)
change('xpThreshold,EVOLUTIONS}', 'xpThreshold,EVOLUTIONS,fireStats,FIRE_BRANCHES,BOSS_INTENTS,stageInfo}')
change('balanceRevision:1,selections:0', 'balanceRevision:1,fireBranch:null,recoveryUntil:-1,selections:0')
change('r.offerSerial??=0;r.owned??={}', "r.offerSerial??=0;r.owned??={};r.fireBranch??=null;r.recoveryUntil??=-1;for(const boss of r.room.enemies.filter(e=>e.type==='boss'))boss.intentIndex??=0;this.lowEffects=!!this.meta.lowEffects")
change("this.aim=null;this.spawn(C.startEnemies", "this.aim=null;this.lowEffects=!!this.meta.lowEffects;this.spawn(C.startEnemies")
change("const q=this.random(),kind=q<.018?'bomb'", "const q=this.random(),elite=stageInfo(r).id==='elite'&&es.filter(e=>live(e)&&e.kind==='shield').length<6,kind=elite&&q<.06?'shield':q<.018?'bomb'")
change("r:kind==='normal'?3.8:5.3,dead:false", "r:kind==='normal'?3.8:kind==='shield'?6:5.3,shield:kind==='shield',dead:false")
change('spawnShot:r.shot,rushIn:3,dead:false', 'spawnShot:r.shot,rushIn:3,intentIndex:r.bossSpawns%3,armor:0,dead:false')
change("this.notice='暗影领主降临 · 击败获得额外强化'", "this.notice='暗影领主降临 · 三发后执行预告动作'")
change("if(!live(e))return false;if(e.type==='boss')", "if(!live(e))return false;if(e.kind==='shield'&&e.shield&&source!=='direct'){e.shield=false;this.effect('blast',e.x,e.y,{radius:12});return false}if(e.type==='boss')")
change('e.hp=Math.max(0,e.hp-amount);', "const blocked=Math.min(e.armor||0,amount);e.armor=Math.max(0,(e.armor||0)-amount);e.hp=Math.max(0,e.hp-(amount-blocked));")
change('r.bossKills++;r.queuedBossRewards++;', 'r.bossKills++;r.recoveryUntil=r.shot+1;r.queuedBossRewards++;')
change("hit(e,b){const r=this.run,v=r.volley;v.direct++", "hit(e,b){const r=this.run,v=r.volley;if(e.kind==='shield'&&e.shield&&b.y>e.y+e.r*.25){this.effect('bounce',e.x,e.y,{color:'#f0bf64'});this.sound('bounce');return false}v.direct++")
change("b.fires<stats('fire',this.level('fire'))[0]", "b.fires<fireStats(this.level('fire'),r.fireBranch)[0]")
change("stats('fire',this.level('fire'))[1]", "fireStats(this.level('fire'),r.fireBranch)[1]")
change("let rush=0;if(!frozen)for(const boss of bosses){boss.rushIn=(boss.rushIn??3)-1;if(boss.rushIn<=0){boss.rushIn=3;rush=Math.max(rush,p.bossRush);this.effect('blast',boss.x,boss.y,{radius:80,t:.6,life:.6});this.sound('boss')}}", "let rush=0;if(!frozen)for(const boss of bosses){boss.rushIn=(boss.rushIn??3)-1;if(boss.rushIn<=0){boss.rushIn=3;const intent=BOSS_INTENTS[boss.intentIndex??0];boss.intentIndex=((boss.intentIndex??0)+1)%3;boss.armor=0;if(intent.id==='advance')rush=Math.max(rush,p.bossRush);else if(intent.id==='shield')boss.armor=48;else r.pendingObstacles=Math.min(2,(r.pendingObstacles||0)+2);this.effect('blast',boss.x,boss.y,{radius:60,t:.5,life:.5});this.sound('boss');this.notice='领主行动 · '+intent.name}}")
change("if(r.hp===0){r.phase='failed';", "if(r.hp===0){r.deathReason=`本发有 ${lost} 点越线伤害；下次优先清理底部或使用冻结。`;r.phase='failed';")
change('this.spawn(Math.max(0,p.target-r.room.enemies.length));', "const count=Math.max(0,p.target-r.room.enemies.length);this.spawn(stageInfo(r).id==='recovery'?Math.ceil(count/2):count);if(r.pendingObstacles){this.spawnObstacles(r.pendingObstacles);r.pendingObstacles=0}")
change("r.phase='aim';if(!this.available().length)", "r.phase='aim';if(this.level('fire')>=3&&!r.fireBranch){r.phase='reward';r.offerType='imprint';r.offerSerial++;r.offer=Object.keys(FIRE_BRANCHES).map(id=>({id}));r.shotSnapshot=null;this.sound('reward');return}if(!this.available().length)")
change(" choose(id){", " chooseImprint(id){const r=this.run;if(r.phase!=='reward'||r.offerType!=='imprint'||!FIRE_BRANCHES[id]||r.fireBranch)return false;r.fireBranch=id;this.meta.endlessBranches??={};this.meta.endlessBranches[id]=true;this.notice=FIRE_BRANCHES[id].name+' · 本局路线已确定';this.offerNext();this.persist();return true}\n choose(id){")
change("if(r.phase!=='reward'||!item)return false;", "if(r.phase!=='reward'||r.offerType==='imprint'||!item)return false;")
change("r.upgrades.push(id);", "r.upgrades.push(id);this.meta.endlessDiscovered??={};this.meta.endlessDiscovered[id]=true;")
change("r.offerType!=='ad'&&r.selections", "r.offerType!=='ad'&&r.offerType!=='imprint'&&r.selections")
change("r.phase!=='reward'||r.rerolled", "r.phase!=='reward'||r.offerType==='imprint'||r.rerolled")
change("this.meta.endlessBest=Math.max(this.meta.endlessBest||0,r.kills);", "this.meta.endlessBest=Math.max(this.meta.endlessBest||0,r.kills);this.meta.endlessBossBest=Math.max(this.meta.endlessBossBest||0,r.bossKills);this.meta.endlessShotBest=Math.max(this.meta.endlessShotBest||0,r.shot);this.meta.endlessRuns??=[];if(!this.meta.endlessRuns.some(x=>x.id===r.id))this.meta.endlessRuns.unshift({id:r.id,kills:r.kills,shot:r.shot,bossKills:r.bossKills,combo:r.bestCombo,branch:r.fireBranch,powers:Object.keys(r.powers).filter(id=>r.powers[id]>0)});this.meta.endlessRuns=this.meta.endlessRuns.slice(0,10);")
change("obstacles:r.room.obstacles,owned", "obstacles:r.room.obstacles,fireBranch:r.fireBranch,stage:stageInfo(r),lowEffects:!!this.lowEffects,owned")
change("kind:e.kind,x:", "kind:e.kind,shield:!!e.shield,x:")
change("{hp:e.hp}", "{hp:e.hp,armor:e.armor||0,intent:BOSS_INTENTS[e.intentIndex??0].name,actsIn:e.rushIn}")
p.write_text(s,encoding='utf-8')
# Radius remains optional so puzzle and legacy previews keep their original behavior.
p=root/'games/marble/physics.js'
s=p.read_text(encoding='utf-8').replace('preview(room,x,y,vx,vy){const b={x,y,vx,vy}', 'preview(room,x,y,vx,vy,r=BALL_R){const b={x,y,vx,vy,r}')
p.write_text(s,encoding='utf-8')
with (root/'progress.md').open('a',encoding='utf-8') as f:
 f.write('\n## 无尽重制 · 2026-10-01\nUser request: 按你的方案改进。以总目录当前六游戏源码为基础，备份已保存。实现爆裂3点后一次分支选择、限量护盾精英、Boss三种可预告动作、Boss击杀后减少一次补充、构筑发现和本地纪录。保留抽卡概率和40+12币上限。效果需通过测试验证，不视为玩家研究结论。\n')
