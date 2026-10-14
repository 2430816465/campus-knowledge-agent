from pathlib import Path
r=Path.cwd()
def edit(f,a,b):
 p=r/f;s=p.read_text(encoding='utf-8');assert a in s,(f,a);p.write_text(s.replace(a,b),encoding='utf-8')
f='games/marble/endless-data.js'
edit(f,'maxEnemies:620','maxEnemies:900')
edit(f,"fire:[Math.ceil(n/4),20+3*n],pierce:n*2", "fire:[Math.ceil(n/5),18+2*n],pierce:n*2")
edit(f,"split:n,bounce:3*n", "split:n,bounce:2*n")
edit(f,"hint:'每颗主弹珠仅分裂一次；子弹不再分裂。'", "hint:'每颗主弹珠仅分裂一次；子弹不穿透，Boss 伤害为 45%。'")
edit(f,'export function pressure(shot){const late=Math.max(0,shot-35);return {target:Math.min(580,ENDLESS.startEnemies+shot*4+late*4),drop:Math.min(260,8+shot*.16+late*.8),bossHp:Math.round(110+shot*5+late*late*9)};}', 'export function pressure(shot){const middle=Math.max(0,shot-25),late=Math.max(0,shot-35);return {target:Math.min(840,ENDLESS.startEnemies+shot*4+middle*9+Math.max(0,shot-55)*7),spawnDepth:Math.min(205,65+shot*.5+middle*2.2),drop:Math.min(260,8+shot*.16+late*.8),bossHp:Math.round(220+shot*8+late*late*12),bossRush:Math.min(32,10+Math.floor(shot/10)*2)};}')
edit(f,'Math.round(4+level*level*8)','Math.round(4+level*level*8+Math.max(0,level-5)**2*8)')
edit(f,'分裂和间接伤害不递归。','分裂子弹最多反弹 8 次，不继承穿透，对 Boss 造成 45% 直击伤害；间接伤害不递归。Boss 每存活 3 发发动一次推进，倒计时会显示在血条下方，冻结帮助可暂停一次推进。')
f='games/marble/state-endless.js'
edit(f,'Math.min(145,65+this.run.shot*.5)','pressure(r.shot).spawnDepth')
edit(f,'r:23,hp,maxHp:hp,dead:false','r:23,hp,maxHp:hp,spawnShot:r.shot,rushIn:3,dead:false')
edit(f,"limit:(child?14:30)+stats('bounce',this.level('bounce'))", "limit:child?8:26+stats('bounce',this.level('bounce'))")
edit(f,"const amount=source==='direct'?stats('core',this.level('core')):6", "const amount=source==='direct'?Math.max(1,Math.round(stats('core',this.level('core'))*(b?.child?.45:1))):2")
edit(f,"this.damage(e,'direct',b)","this.damage(e,'direct',b)")
edit(f,"if(b.pierces<stats('pierce',this.level('pierce')))","if(!b.child&&b.pierces<stats('pierce',this.level('pierce')))")
edit(f,"const drop=r.freezeNext?0:pressure(r.shot).drop;r.freezeNext=false;for(const e of r.room.enemies){e.fromY=e.y;e.toY=e.y+drop*(e.kind==='haste'?1.7:1)*(e.frozen?.5:1);e.frozen=false}","const frozen=r.freezeNext,p=pressure(r.shot),bosses=r.room.enemies.filter(e=>e.type==='boss');let rush=0;if(!frozen)for(const boss of bosses){boss.rushIn=(boss.rushIn??3)-1;if(boss.rushIn<=0){boss.rushIn=3;rush=Math.max(rush,p.bossRush);this.effect('blast',boss.x,boss.y,{radius:80,t:.6,life:.6});this.sound('boss')}}const drop=frozen?0:p.drop;r.freezeNext=false;for(const e of r.room.enemies){e.fromY=e.y;e.toY=e.y+(drop+ rush)*(e.type==='boss'?1.25:e.kind==='haste'?1.7:1)*(e.frozen?(e.type==='boss'?.8:.5):1);e.frozen=false}if(rush)this.notice='Boss 推进！优先处理领主';")
# Move the normal descent notice before the rush branch so the warning remains visible.
edit(f,"const frozen=r.freezeNext,p=pressure(r.shot)","this.notice=`${v.kills} 击破 · ${v.combo} 连击 · 游魂下沉`;const frozen=r.freezeNext,p=pressure(r.shot)")
edit(f,"if(rush)this.notice='Boss 推进！优先处理领主';;this.notice=`${v.kills} 击破 · ${v.combo} 连击 · 游魂下沉`;", "if(rush)this.notice='Boss 推进！优先处理领主';")
# Upgrade live old-save bosses once; retain their proportion of remaining health.
edit(f,'r.offerSerial??=0;r.owned??={}',"if(!r.balanceRevision){for(const e of r.room.enemies)if(e.type==='boss'){const hp=pressure(e.spawnShot??r.shot).bossHp;e.hp=Math.ceil(hp*e.hp/e.maxHp);e.maxHp=hp;e.rushIn=3}r.balanceRevision=1;r.xpNeed=xpThreshold(r.level)}r.offerSerial??=0;r.owned??={}")
edit(f,'version:4,revision:3,selections:0','version:4,revision:3,balanceRevision:1,selections:0')
f='games/marble/render-endless.js'
edit(f,"c.fillText(String(e.hp),e.x,e.y-39);continue", "c.fillText(String(e.hp),e.x,e.y-39);c.fillStyle=(e.rushIn??3)===1?'#ff8d75':'#f0cbff';c.fillText(`推进 ${e.rushIn??3} 发`,e.x,e.y+39);continue")
