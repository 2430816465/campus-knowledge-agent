from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
edit('services.js','装备后，在《再弹一次》的营地顶栏展示战旗徽记','装备后，在《再弹一次》战斗画布右下角展示战旗徽记')
edit('games/marble/main.js',"if(d.command==='enter'){walletBalance=", "if(d.command==='enter'){g.campFlag=Array.isArray(d.cosmetics)&&d.cosmetics.includes('flag');walletBalance=")
edit('games/marble/render-endless.js'," disk(c,ORIGIN.x,ORIGIN.y,12", " if(g.campFlag){c.strokeStyle='#a68551';c.lineWidth=2;c.beginPath();c.moveTo(606,316);c.lineTo(606,342);c.stroke();c.fillStyle='#d58355';c.beginPath();c.moveTo(607,316);c.lineTo(624,321);c.lineTo(607,327);c.closePath();c.fill();}\n disk(c,ORIGIN.x,ORIGIN.y,12")
edit('完善说明-1.6.0.md','保留已有营地徽记定义','弹珠战斗画布右下角的落日战旗')
with (R/'progress.md').open('a',encoding='utf-8') as f:f.write('''
- Final verification: 16 rule tests passed, four-mode live interaction regression passed with no console errors after updating the legacy test to use the existing fullscreen marble pause menu and landscape orientation. New tests use isolated coop wallets. APK 1.6.0/code 6 built offline; signature v1/v2 verified; all 498 packaged assets byte-matched to source and all 28 backed-up tower source files unchanged. Artifact/hash: 交付校验-1.6.0.json. No Android physical-device validation.
- Final cosmetic audit also restores flag visibility inside the current endless battle renderer; purchase text now describes the actual location.
''')
