from pathlib import Path
R=Path(__file__).resolve().parents[1]
def write(p,s): (R/p).write_text(s,encoding='utf-8')
def change(p,a,b):
 s=(R/p).read_text(encoding='utf-8'); assert a in s,(p,a[:70]);write(p,s.replace(a,b))
write('pixel-home.js','''import {modes} from './services.js';
import {icon} from './ui.js';
import {referenceArt} from './reference-art.js';
export function pixelHome(s){
 return `<div class="home-layout"><section class="camp-playfield" aria-label="冒险营地，小小的游戏，大大的冒险">${referenceArt('hero')}<h1 class="sr-only">冒险营地</h1>${s.equipped.includes('camp-lights')?'<div class="camp-lights" aria-label="星夜灯串">✦ · ✦ · ✦ · ✦ · ✦</div>':''}${s.equipped.includes('camp-shelf')?`<div class="camp-shelf">${modes.map(m=>`<span>${icon(m.id)} ${s.runs.filter(r=>r.mode===m.id&&r.reward>0).length}</span>`).join('')}</div>`:''}</section><section class="portal-zone" aria-label="选择冒险玩法"><div class="mode-grid">${modes.map(m=>`<button class="adventure-portal" data-action="mode:${m.id}" aria-label="${m.name}，进入准备页">${referenceArt(m.id,'portal-picture')}<span class="portal-copy"><span><strong>${m.name}</strong><small>${{marble:'连锁弹射',coop:'双人合作'}[m.id]||m.tag}</small></span><span class="portal-go">${icon('arrow')}</span></span></button>`).join('')}</div><button class="reference-shop" data-action="shop">${referenceArt('merchant')}<span><strong>补给铺</strong><small>为旅途添一点色彩</small></span></button><p class="future-routes">${icon('compass')} 远方还有新的故事 <span>更多玩法，陆续抵达</span></p></section></div>`;
}
''')
change('ui.js',"import {pixelPaths}","import {referenceArt} from './reference-art.js';\nimport {pixelPaths}")
change('ui.js','`<div class="scene ${id} ${cls}" aria-hidden="true"></div>`','`<div class="scene ${id} ${cls}" aria-hidden="true">${referenceArt(id)}</div>`')
s=(R/'ui.js').read_text(encoding='utf-8');start=s.index('export const portrait=');end=s.index('export const status=',start)
s=s[:start]+'''export const avatarVariant=s=>s.equipped.find(x=>x.startsWith('avatar-'))||(s.equipped.includes('scarf')?'red':'');
export const portrait=(variant='')=>`<span class="avatar portrait ${variant}">${referenceArt(variant.startsWith('avatar-')?variant:'portrait')}${variant==='red'?'<span class="avatar-scarf"></span>':''}</span>`;
export const itemArt=id=>id.startsWith('avatar-')?`<div class="item-art avatar-item">${referenceArt(id)}</div>`:`<div class="item-art ${id}"><img src="assets/pixel/${id}.svg" alt="" width="256" height="256" loading="lazy"></div>`;
''' +s[end:];write('ui.js',s)
for p in ['app.js','views.js']:
 change(p,'money,portrait,itemArt','money,portrait,avatarVariant,itemArt')
 change(p,"portrait(s.equipped.includes('scarf')?'red':'')","portrait(avatarVariant(s))")
change('app.js',"import {renderPage}","import {referenceArt} from './reference-art.js';\nimport {renderPage}")
change('app.js','篝火仍在，冒险继续','欢迎回来！')
change('app.js','1.7.1 · 全屏联机版','1.8.0 · 像素营地')
change('app.js',"${icon(i)}<span>${n}</span>","${referenceArt({home:'navHome',tasks:'navTasks',collection:'navCollection',profile:'navProfile'}[id])}<span>${n}</span>")
change('services.js',"export const products=[","""export const productCategory=p=>p.id.startsWith('avatar-')||p.id==='scarf'?'avatars':p.id.startsWith('camp-')?'decor':'skins';
export const products=[
 {id:'avatar-ranger',name:'林间旅人',mode:'营地头像',price:80,effect:'以篝火旁的绿围巾旅人作为营地头像。永久拥有，可随时切换。',type:'永久头像',icon:'user'},
 {id:'avatar-camper',name:'麦田来客',mode:'营地头像',price:100,effect:'以戴草帽的露营伙伴作为营地头像。仅改变营地肖像。',type:'永久头像',icon:'user'},
 {id:'avatar-fox',name:'午睡小狐',mode:'营地头像',price:120,effect:'把篝火旁熟睡的小狐狸带到头像中。仅改变营地肖像。',type:'永久头像',icon:'user'},
""")
change('services.js',"!(id.endsWith('-orb')&&x.endsWith('-orb'))","!((id.endsWith('-orb')&&x.endsWith('-orb'))||((id.startsWith('avatar-')||id==='scarf')&&(x.startsWith('avatar-')||x==='scarf')))")
change('views.js','modes,products,taskProgress','modes,products,productCategory,taskProgress')
change('views.js',"const codex=tab==='codex';","const codex=tab==='codex',category=['avatars','skins','decor'].includes(tab)?tab:'all';")
change('views.js','${btn(\'旅人外观\',\'tab:daily\',codex?\'\':\'selected\',`aria-pressed="${!codex}"`)}',"${[['all','全部'],['avatars','头像'],['skins','游戏皮肤'],['decor','营地装饰']].map(([id,label])=>btn(label,'tab:'+id,!codex&&category===id?'selected':'',`aria-pressed=\"${!codex&&category===id}\"`)).join('')}")
change('views.js',":products.map(p=>{const owned=",":products.filter(p=>category==='all'||productCategory(p)===category).map(p=>{const owned=")
change('views.js',"owned?'装备外观':'查看获取方式'","owned?'装备外观':`${p.price} 币 · 兑换`")
change('views.js','一件旧物，一段记忆。选一件与你同行。','头像、游戏皮肤与营地装饰，用冒险币兑换。')
change('views.js','已接入原版游戏与真实操作。游戏内资源独立保存；联机需要两位玩家连接同一服务器。','单人进度保存在本机；两部安卓手机连接同一 Wi-Fi 即可创建和加入合作房间。')
# Remove the competing historical camp themes. Game styles have their own shared layer.
write('index.html','''<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#fcf7ef"><link rel="preload" href="assets/fonts/camp-display.woff" as="font" type="font/woff" crossorigin><title>冒险营地</title><link rel="icon" href="data:,"><link rel="stylesheet" href="reference-ui.css"><link rel="stylesheet" href="live.css"><link rel="stylesheet" href="unified.css"></head><body><div id="app"></div><dialog id="modal"></dialog><div id="toast" role="status" aria-live="polite"></div><script type="module" src="app.js"></script></body></html>''')
# Palette is also read by canvas menus; preserve gameplay rendering and controls.
for p in ['games/shared/camp-ui.js','games/shared/camp-ui.css']:
 s=(R/p).read_text(encoding='utf-8')
 for a,b in {'#fff4df':'#fcf7ef','#e6c99a':'#f5e5cf','#554735':'#482e24','#78664e':'#817268','#bda278':'#dfbea0','#df9a59':'#dfa36e','#e7ddbd':'#f8f0e4','#f1e2c4':'#f8ecdc'}.items():s=s.replace(a,b)
 write(p,s)
change('android/app/build.gradle','versionCode 8','versionCode 9')
change('android/app/build.gradle',"versionName '1.7.1'","versionName '1.8.0'")
p='android/app/src/main/java/com/adventurecamp/game/MainActivity.java'
s=(R/p).read_text(encoding='utf-8');write(p,s.replace('1.7.1','1.8.0'))
