from pathlib import Path
R=Path(__file__).resolve().parents[1]
def write(p,s):(R/p).write_text(s,encoding='utf-8')
def replace(p,a,b):
 s=(R/p).read_text(encoding='utf-8');assert a in s,(p,a[:50]);write(p,s.replace(a,b))
replace('reference-art.js','hero:[0,129,862,497]','crest:[361,47,140,77],hero:[0,132,862,494]')
replace('app.js','<div class="brand">${icon(\'compass\')}','<div class="brand">${referenceArt(\'crest\')}${icon(\'compass\')}')
replace('services.js','export const products=[',"""export const products=[
 {id:'rose-orb',name:'桃霞弹珠',mode:'再弹一次',price:140,effect:'弹珠、拖尾与发射法阵染成桃霞粉。仅改变外观，不影响能力、伤害与判定。',type:'永久皮肤',icon:'star'},
 {id:'mint-orb',name:'薄荷弹珠',mode:'再弹一次',price:140,effect:'弹珠、拖尾与发射法阵染成薄荷绿。仅改变外观，不影响能力、伤害与判定。',type:'永久皮肤',icon:'star'},
""")
replace('games/marble/main.js',"g.orbSkin=Array.isArray(d.cosmetics)","g.orbSkin=Array.isArray(d.cosmetics)&&d.cosmetics.includes('rose-orb')?'rose':Array.isArray(d.cosmetics)&&d.cosmetics.includes('mint-orb')?'mint':Array.isArray(d.cosmetics)")
replace('games/marble/render-endless.js',"{amber:'#f5bd66'","{rose:'#f4a0ab',mint:'#99dab0',amber:'#f5bd66'")
replace('games/marble/render.js',"skin==='comet'?","skin==='rose'?'#f4a0ab':skin==='mint'?'#99dab0':skin==='comet'?")
# Add new skins to the real trail-color branch (alpha is preserved).
replace('games/marble/render.js',"skin==='rose'?'#f4a0ab':skin==='mint'?'#99dab0':skin==='comet'?`rgba", "skin==='rose'?`rgba(244,160,171,${alpha})`:skin==='mint'?`rgba(153,218,176,${alpha})`:skin==='comet'?`rgba")
replace('games/marble/main.js',"{amber:'琥珀',violet:'紫晶'","{rose:'桃霞',mint:'薄荷',amber:'琥珀',violet:'紫晶'")
base=(R/'assets/pixel/amber-orb.svg').read_text(encoding='utf-8')
for name,palette in [('rose',['#71464d','#9a606c','#c38591','#a86675','#c8858e','#824d59','#69404c','#efa3b0','#fff0ef','#ffd3dc','#b77585']),('mint',['#435f50','#5b826a','#8dbd99','#649c7d','#86bb96','#456950','#385846','#a5ddaf','#f0ffdb','#d0f3cc','#599774'])]:
 s=base
 for a,b in zip(['#7b5835','#aa7440','#d7a34d','#a65c2e','#c88736','#7f4a2d','#6b3f30','#efb650','#fff0b1','#ffe08d','#a9592c'],palette):s=s.replace(a,b)
 write('assets/pixel/'+name+'-orb.svg',s)
# Flatten canvas panels and buttons without changing hit regions or map pixels.
p='games/mine/src/modes/mining/MiningUI.js'
s=(R/p).read_text(encoding='utf-8').replace("g.addColorStop(1,'#efdfbe')","g.addColorStop(1,skin.paper)").replace("MM.U.fillRound(ctx,x,y+4,w,h,16,'#bda278');","MM.U.fillRound(ctx,x,y+1,w,h,16,skin.line);").replace("MM.U.fillRound(ctx,x,y+4,w,h-4,14,'#b69b73');","MM.U.fillRound(ctx,x,y+1,w,h-4,14,skin.line);")
write(p,s)
# Final stylesheet in shared JS also applies after individual game themes.
replace('games/shared/camp-ui.js',"window.CampSkin=Object.freeze", "const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../shared/reference-game.css',document.currentScript.src).href;document.addEventListener('DOMContentLoaded',()=>document.head.append(style),{once:true});\n  window.CampSkin=Object.freeze")
