"""Convert the author's editable PC map set. Never execute downloaded AS3 code.
Imported map data and its adaptations are distributed under GPL-3.0.
"""
import argparse, hashlib, json, shutil, struct
from pathlib import Path
import xml.etree.ElementTree as E

SCALE=1.4
def num(e,k,d=0): return float(e.get(k,d))
def rect(e,w=None,h=None):
 return {'x':round(num(e,'x')*SCALE,3),'y':round(num(e,'y')*SCALE,3),
         'w':round((w if w is not None else num(e,'w',num(e,'width')))*SCALE,3),
         'h':round((h if h is not None else num(e,'h',num(e,'height')))*SCALE,3)}
def convert(source,mode,n):
 t=E.parse(source).getroot(); chapter=(n-1)//12+1
 L={'id':50+(0 if mode=='normal' else 36)+n,'number':n,'mode':mode,'imported':True,
    'title':f'{["石库","工坊","高厅"][chapter-1]} · {n:02d}', 'chapter':chapter,
    'chapterTitle':['石库 · 认识搭档','工坊 · 移动机关','高厅 · 交错路线'][chapter-1],
    'subtitle':'1P 冲刺破障与背队友；2P 二段跳与推箱。共同抵达出口。',
    'hint':'1P：互动冲刺破障。2P：空中再跳；靠近伙伴互动搭肩，跳跃离肩。长按跳跃可跳得更高。',
    'mobileHint':'1P 冲刺；2P 二段跳、推箱、搭肩。长按跳跃更高，一起到出口。',
    'profile':'slf','width':round(float(t.findtext('width'))*SCALE,3),
    'height':round(float(t.findtext('height'))*SCALE,3),'platforms':[], 'gates':[],
    'bridges':[],'plates':[],'switches':[],'lifts':[],'boxes':[],'hazards':[],
    'enemies':[],'pickups':[],'checkpoints':[],'decor':[], 'spawns':[],
    'source':{'repo':'initials/SuperLemonadeFactoryOUYA','path':str(source.name),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'license':'GPL-3.0'}}
 for e in t.findall('solids/rect'): L['platforms'].append(rect(e))
 for layer in t:
  for e in layer:
   tag=e.tag
   if 'spike' in tag.lower():
    r=rect(e);r['direction']=int(tag[-1]);L['hazards'].append(r)
   elif layer.tag=='extraPlatforms' and 'special' in tag:
    w,h=(40,40) if 'Block' in tag else (40 if 'Small' in tag else 100,20)
    r=rect(e,w,h);r['mechanical']=True;L['platforms'].append(r)
   elif tag=='LargeCrate':
    r=rect(e,80,60);r.update(id=f'break-{len(L["boxes"])}',kind='breakable',movable=False,breakable=True);L['boxes'].append(r)
   elif layer.tag=='movingPlatforms':
    w,h=(40,40) if 'Block' in tag else (40 if 'Small' in tag else 100,20)
    r=rect(e,w,h);r.update(id=f'path-{len(L["lifts"])}',path=[{'x':r['x'],'y':r['y']}]+[{'x':round(num(a,'x')*SCALE,3),'y':round(num(a,'y')*SCALE,3)} for a in e.findall('node')],speed=num(e,'speed',40)*SCALE,movementType=int(num(e,'movementType',5)))
    L['lifts'].append(r)
   elif tag=='L1_SmallCrate':
    r=rect(e,24,23);r['y']=round((num(e,'y')-13)*SCALE,3);r.update(id=f'push-{len(L["boxes"])}',movable=True,kind='push');L['boxes'].append(r)
   elif tag=='exit':
    L['exit']=rect(e,66,110);L['exit']['y']=round((num(e,'y')-20)*SCALE,3);L['chest']={'x':L['exit']['x'],'y':L['exit']['y']}
   elif tag in ('Bottle','smallSugarBag'):
    r=rect(e,12 if tag=='Bottle' else 22,24 if tag=='Bottle' else 22);r.update(id=f'collect-{len(L["pickups"])}',kind='token' if tag=='Bottle' else 'relic');L['pickups'].append(r)
   elif tag in ('andreCheckPoint','liselotCheckPoint'):
    r=rect(e,28,60);r.update(id=f'cp-{len(L["checkpoints"])}',slot=0 if tag.startswith('andre') else 1);L['checkpoints'].append(r)
   elif layer.tag=='characters' and tag in ('worker','army','chef','inspector'):
    r=rect(e,10,41);node=e.find('node');r.update(id=f'patrol-{len(L["enemies"])}',kind=tag,speed=num(e,'speed',40)*SCALE,minX=min(r['x'],num(node,'x',num(e,'x'))*SCALE) if node is not None else r['x'],maxX=max(r['x'],num(node,'x',num(e,'x'))*SCALE) if node is not None else r['x']);L['enemies'].append(r)
   elif layer.tag.startswith('BG') and tag not in ('spike0','spike1','spike2','spike3'):
    # Low contrast background furnishings, never drawn with a walkable top edge.
    if ('window' in tag or 'Pipe' in tag or 'tank' in tag or 'painting' in tag):
     r=rect(e,num(e,'width',60),num(e,'height',100));r['kind']='window' if 'window' in tag else 'pipe' if 'Pipe' in tag else 'niche';L['decor'].append(r)
 chars=t.find('characters');p=chars.find('player');q=chars.find('liselot')
 for e in [p,q]: L['spawns'].append({'x':round(num(e,'x')*SCALE-11,3),'y':round(num(e,'y')*SCALE,3)})
 L['checkpoint']=dict(L['spawns'][0])
 assert L['exit'] and all(r['w']>0 and r['h']>0 for r in L['platforms']+L['hazards'])
 return L

def main():
 a=argparse.ArgumentParser();a.add_argument('source');args=a.parse_args()
 src=Path(args.source);game=Path(__file__).resolve().parents[1];out=game/'third_party/slf';(out/'maps').mkdir(parents=True,exist_ok=True)
 maps=[]
 for mode,prefix in [('normal','level'),('hard','hclevel')]:
  for n in range(1,37):
   p=src/'data/SLF_levelEditor/PC'/f'{prefix}{n}.oel';shutil.copy2(p,out/'maps'/p.name);maps.append(convert(p,mode,n))
 shutil.copy2(src/'LICENSE',out/'LICENSE');shutil.copy2(src/'src/Registry.as',out/'Registry.as.reference.txt')
 text='// Derived map data: Initials Video Games, GPL-3.0. See third_party/slf/LICENSE and NOTICE.md.\n(function(root,factory){const v=factory();if(typeof module!=="undefined"&&module.exports)module.exports=v;if(root)root.RushImportedMaps=v;})(typeof window!=="undefined"?window:globalThis,function(){return '+json.dumps(maps,ensure_ascii=False,separators=(',',':'))+';});\n'
 (game/'src/imported-maps.js').write_text(text,encoding='utf-8')
 manifest={'source':'https://github.com/initials/SuperLemonadeFactoryOUYA','branch':'master','date':'2026-10-02','license':'GPL-3.0','sourceDirectory':'data/SLF_levelEditor/PC','scale':SCALE,'normal':36,'hard':36,'maps':[{'mode':m['mode'],'number':m['number'],**m['source']} for m in maps]}
 (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'normal':36,'hard':36,'platforms':sum(len(m['platforms']) for m in maps),'hazards':sum(len(m['hazards']) for m in maps),'movers':sum(len(m['lifts']) for m in maps),'patrols':sum(len(m['enemies']) for m in maps),'boxes':sum(len(m['boxes']) for m in maps),'bytes':len(text.encode('utf8'))},ensure_ascii=False))
if __name__=='__main__':main()
