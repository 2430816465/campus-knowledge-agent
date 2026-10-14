"""Extract every source frame. Spatial matte cleanup only; no temporal synthesis."""
from pathlib import Path
import json, hashlib, math
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
QC=ROOT/'artifacts/hero-jump'
OUT=ROOT/'games/coop/assets/art-jump-video'
OUT.mkdir(exist_ok=True)
(QC/'native').mkdir(exist_ok=True)
cap=cv2.VideoCapture(str(QC/'source.mp4'))
fps=cap.get(cv2.CAP_PROP_FPS)
raw=[]; bounds=[]; centers=[]
while True:
    ok,bgr=cap.read()
    if not ok: break
    rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
    hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV)
    left=np.median(rgb[:,:100],axis=1);right=np.median(rgb[:,-100:],axis=1)
    x=np.linspace(0,1,rgb.shape[1])[None,:,None]
    bg=left[:,None]*(1-x)+right[:,None]*x
    pink=((hsv[:,:,0]>140)|(hsv[:,:,0]<4))&(hsv[:,:,1]>35)&(hsv[:,:,2]>65)
    mask=((np.linalg.norm(rgb.astype(float)-bg,axis=2)>60)&~pink).astype('uint8')
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    _,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    mask=(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype('uint8')
    ys,xs=np.where(mask)
    bounds.append([int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)])
    hair=(mask>0)&(hsv[:,:,0]>3)&(hsv[:,:,0]<27)&(hsv[:,:,1]>140)&(hsv[:,:,2]>100)
    hair[int(ys.min())+180:]=False
    centers.append(float(np.median(np.where(hair)[1])))
    raw.append(np.dstack([rgb,mask*255]))
cap.release()
scale=114/float(np.median([b[3]-b[1] for b in bounds[:7]]))
frames=[]
for i,im in enumerate(raw):
    center=float(np.median(centers[max(0,i-2):min(len(raw),i+3)]))
    # Remove video root displacement; the game owns jump trajectory and collisions.
    matrix=np.float32([[scale,0,80-center*scale],[0,scale,148-bounds[i][3]*scale]])
    p=im.astype('float32');p[:,:,:3]*=p[:,:,3:4]/255
    p=cv2.warpAffine(p,matrix,(160,160),flags=cv2.INTER_AREA)
    p[:,:,:3]/=np.maximum(p[:,:,3:4]/255,1e-6)
    p[:,:,3]=np.where(p[:,:,3]>=192,255,0);p[p[:,:,3]==0,:3]=0
    frame=Image.fromarray(np.clip(p,0,255).astype('uint8'))
    box=frame.getbbox();assert box and min(box[:2])>0 and max(box[2:])<160
    frame.save(QC/'native'/f'{i:03}.png');frames.append(frame)
sheet=Image.new('RGBA',(1280,math.ceil(len(frames)/8)*160))
for i,f in enumerate(frames):sheet.paste(f,(i%8*160,i//8*160))
sheet.save(OUT/'jump.png',optimize=True)
for i,f in enumerate(frames):
    assert np.array_equal(np.array(f),np.array(sheet.crop((i%8*160,i//8*160,i%8*160+160,i//8*160+160))))
gold=np.array(sheet);hsv=cv2.cvtColor(gold[:,:,:3],cv2.COLOR_RGB2HSV)
blue=(hsv[:,:,0]>93)&(hsv[:,:,0]<137)&(hsv[:,:,1]>75)&(gold[:,:,3]>0)
hsv[blue,0]=21;hsv[blue,1]=(hsv[blue,1]*.8).astype('uint8')
gold[blue,:3]=cv2.cvtColor(hsv,cv2.COLOR_HSV2RGB)[blue]
Image.fromarray(gold).save(OUT/'jump-gold.png',optimize=True)
meta={'fps':fps,'count':len(frames),'duration':len(frames)/fps,'cell':160,'columns':8,'drawCell':80,'nativeFramesOnly':True,'sourceFrames':list(range(len(frames))),'phases':{'jump':[0,35],'fall':[36,62],'land':[63,len(frames)-1]},'sourceSha256':hashlib.sha256((QC/'source.mp4').read_bytes()).hexdigest(),'scale':scale,'sourceBounds':bounds}
(OUT/'manifest.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
config={k:meta[k] for k in ['fps','count','cell','columns','drawCell','phases']}
(ROOT/'games/coop/src/hero-jump-config.js').write_text('// Generated from all original jump video frames; no interpolation.\n(function(){const a=window.RushArtConfig;a.hero.jumpVideo='+json.dumps(config)+';a.files.jump="../art-jump-video/jump.png";a.files.jumpGold="../art-jump-video/jump-gold.png";})();\n',encoding='utf8')
contact=Image.new('RGB',(1280,math.ceil(len(frames)/8)*180),'#33485b');d=ImageDraw.Draw(contact)
preview=[]
for i,f in enumerate(frames):
    x=i%8*160;y=i//8*180;contact.paste(f,(x,y),f);d.text((x+4,y+160),str(i),fill='white')
    bg=Image.new('RGB',(320,320),'#33485b');p=f.resize((320,320),Image.Resampling.NEAREST);bg.paste(p,(0,0),p);preview.append(bg)
contact.save(QC/'clean-contact.jpg')
preview[0].save(QC/'full-native-preview.png',save_all=True,append_images=preview[1:],duration=1000/fps,loop=0)
print(json.dumps({k:meta[k] for k in ['fps','count','duration','scale','phases']}))
