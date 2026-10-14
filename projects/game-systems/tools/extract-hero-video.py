"""Extract supplied 24 fps video; retain fixed scale and motion, remove pink backdrop."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/hero-video'
OUT.mkdir(exist_ok=True)
SOURCE = OUT / 'source.mp4'
cap = cv2.VideoCapture(str(SOURCE))
fps = cap.get(cv2.CAP_PROP_FPS)
frames, bounds, heads = [], [], []
while True:
    ok, bgr = cap.read()
    if not ok:
        break
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    # Sample the unobstructed sides of every row: the supplied background is a gradient.
    left = np.median(rgb[:, :100], axis=1)
    right = np.median(rgb[:, -100:], axis=1)
    x = np.linspace(0, 1, rgb.shape[1])[None, :, None]
    bg = left[:, None] * (1-x) + right[:, None] * x
    delta = np.linalg.norm(rgb.astype(float)-bg, axis=2)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    pink = ((hsv[:,:,0] > 140) | (hsv[:,:,0] < 4)) & (hsv[:,:,1] > 35) & (hsv[:,:,2] > 65)
    mask = ((delta > 60) & ~pink).astype('uint8')
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3,3),np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    biggest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    mask = (labels == biggest).astype('uint8')
    # Do not close the matte: closing reintroduced pink pixels between moving limbs.
    ys, xs = np.where(mask)
    bounds.append([int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)])
    hair = (mask>0)&(hsv[:,:,0]<27)&(hsv[:,:,0]>3)&(hsv[:,:,1]>140)&(hsv[:,:,2]>100)
    hair[int(ys.min())+180:] = False
    hy,hx=np.where(hair)
    heads.append(float(np.median(hx)))
    frames.append(Image.fromarray(np.dstack([rgb,mask*255]),'RGBA'))
cap.release()
baseline = float(np.percentile(np.array(bounds)[:,3], 90))
height = float(np.median(np.array(bounds)[:35,3]-np.array(bounds)[:35,1]))
scale = 114 / height
# Use one scale for all frames. Horizontal head drift is not intended game locomotion.
clean=[]
flow_dir=OUT/'flow-native';flow_dir.mkdir(exist_ok=True)
for i,im in enumerate(frames):
    # Smooth the anchor only; preserve stride/breathing motion within the body.
    center=float(np.median(heads[max(0,i-2):min(len(heads),i+3)]))
    matrix=np.float32([[scale*2,0,160-center*scale*2],[0,scale*2,296-baseline*scale*2]])
    pixels=np.array(im).astype('float32');pixels[:,:,:3]*=pixels[:,:,3:4]/255
    # Premultiply before filtering. Otherwise invisible background RGB leaks into edges.
    rgba=cv2.warpAffine(pixels,matrix,(320,320),flags=cv2.INTER_LINEAR)
    def unpremultiply(p):
        p=p.copy();p[:,:,:3]/=np.maximum(p[:,:,3:4]/255,1e-6)
        p[:,:,3]=np.where(p[:,:,3]>=192,255,0)
        p[p[:,:,3]==0,:3]=0
        return np.clip(p,0,255).astype('uint8')
    Image.fromarray(unpremultiply(rgba)).save(flow_dir/f'{i:03}.png')
    rgba=unpremultiply(cv2.resize(rgba,(160,160),interpolation=cv2.INTER_AREA))
    clean.append(Image.fromarray(rgba))
native=OUT/'native';native.mkdir(exist_ok=True)
for i,im in enumerate(clean): im.save(native/f'{i:03}.png')
sheet=Image.new('RGB',(12*160,12*180),'#b9b4a8');draw=ImageDraw.Draw(sheet)
for j,i in enumerate(range(36,180)):
    x=j%12*160;y=j//12*180;sheet.paste(clean[i],(x,y),clean[i]);draw.text((x+4,y+160),str(i),fill='black')
sheet.save(OUT/'run-contact.jpg')
arrays=[np.array(im).astype(float) for im in clean]
scores=[]
for a in range(60,115):
    for b in range(a+16,min(a+49,164)):
        # Require matching poses and matching incoming/outgoing direction of motion.
        err=np.mean(np.abs(arrays[a]-arrays[b]))
        velocity=np.mean(np.abs((arrays[a+1]-arrays[a])-(arrays[b+1]-arrays[b])))
        scores.append((round(err+.3*velocity,4),a,b,round(err,4)))
scores.sort()
meta={'fps':fps,'frames':len(frames),'duration':len(frames)/fps,'baseline':baseline,'scale':scale,'bounds':bounds,'heads':heads,'loopCandidates':scores[:30]}
(OUT/'extraction.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print(json.dumps({k:meta[k] for k in ['fps','frames','duration','baseline','scale','loopCandidates']},indent=2))
