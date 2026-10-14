from pathlib import Path
import hashlib,zipfile
root=Path.cwd();base=root/'android/app/build/outputs/apk/debug/app-debug.apk';desktop=Path('C:/Users/24308/Desktop/再弹一次/冒险营地-再弹一次自由瞄准版-1.4.0.apk');latest=Path('C:/Users/24308/Desktop/总/冒险营地-当前版.apk')
with zipfile.ZipFile(base) as z:
 assert z.testzip() is None
 for name in ['app.js','games/marble/main.js','games/marble/endless-data.js','games/marble/state-endless.js','games/marble/render-endless.js']:
  assert z.read('assets/web/'+name)==(root/name).read_bytes(),name
for name in ['main.js','endless-data.js','state-endless.js']:
 assert (root/'games/marble'/name).read_text(encoding='utf-8')==(Path('C:/Users/24308/Desktop/再弹一次')/name).read_text(encoding='utf-8'),name
hashes=[hashlib.sha256(x.read_bytes()).hexdigest() for x in [base,desktop,latest]];assert len(set(hashes))==1
print('APK and desktop code verified. SHA256:',hashes[0])

