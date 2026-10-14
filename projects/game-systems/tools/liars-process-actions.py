import json, subprocess, pathlib, shutil, os
root = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((root/'artifacts/liars-actions/process-assets.json').read_text(encoding='utf-8'))
processor = pathlib.Path('C:/Users/24308/.codex/skills/generate2dsprite/scripts/generate2dsprite.py')
import sys
sys.path.insert(0,str(processor.parent))
from generate2dsprite import remove_bg_magenta, estimate_anchor
from PIL import Image
for character in ['hero','demon','goblin','rogue']:
    profile = root/f'artifacts/liars-actions/{character}/scale-profile.json'
    for action in ['challenge','drink']:
        item=manifest[f'{character}-{action}']; out=root/f'artifacts/liars-actions/{character}/{action}'
        out.mkdir(parents=True,exist_ok=True)
        prompt=out/'prompt-source.txt';prompt.write_text(item['prompt'],encoding='utf-8')
        # Translate source cells to one baseline; preserve each pose's original scale.
        raw=Image.open(item['source']).convert('RGBA');w,h=raw.width//2,raw.height//3
        aligned=Image.new('RGBA',(w*2,h*3),(255,0,255,255))
        for i in range(6):
            frame=remove_bg_magenta(raw.crop(((i%2)*w,(i//2)*h,(i%2+1)*w,(i//2+1)*h)),60,30)
            bbox=frame.getbbox();ax,ay=estimate_anchor(frame,bbox,'bottom')
            dx=round(w/2-ax);dy=round(h*.9-ay)
            if bbox[0]+dx<8 or bbox[2]+dx>w-8 or bbox[1]+dy<8 or bbox[3]+dy>h-8:raise ValueError('source alignment would clip '+character+' '+action)
            aligned.paste(frame,((i%2)*w+dx,(i//2)*h+dy),frame)
        source=out/'source-aligned.png';aligned.convert('RGB').save(source)
        cmd=[sys.executable,str(processor),'process','--input',str(source),'--target','player','--mode',action,'--rows','3','--cols','2','--output-dir',str(out),'--prompt-file',str(prompt),'--cell-size','64','--fit-scale','0.94','--shared-scale','--align','bottom','--component-mode','largest','--strict-qc','--max-body-scale-cv','0.08','--max-anchor-y-std','0.05']
        cmd += ['--write-scale-profile',str(profile),'--profile-name',character] if action=='challenge' else ['--scale-profile',str(profile),'--max-profile-scale-drift','0.10']
        result=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',env={**os.environ,'PYTHONUTF8':'1'})
        print(character,action,result.returncode,result.stdout[-1800:],result.stderr[-1000:],flush=True)
        if result.returncode:sys.exit(result.returncode)
        target=root/f'games/liars/assets/animations/{character}/{action}';target.mkdir(parents=True,exist_ok=True)
        for i in range(6):shutil.copy2(out/f'{action}-{i+1}.png',target/f'{i}.png')
