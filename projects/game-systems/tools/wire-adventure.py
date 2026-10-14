from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,path;p.write_text(s.replace(a,b),encoding='utf-8')
edit('games/mine/index.html','<script src="src/scenes/TitleScene.js">','<script src="src/modes/mining/MiningAdventure.js"></script>\n<script src="src/scenes/TitleScene.js">')
edit('games/mine/src/modes/mining/MiningRNG.js','this._next = mulberry32(MM.U.hashSeed(this.seed));','''this.state = MM.U.hashSeed(this.seed);
    this._next = () => {
      this.state = ((this.state | 0) + 0x6D2B79F5) | 0;
      let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };''')
with (R/'games/shared/camp-ui.css').open('a',encoding='utf-8') as f:f.write('''
.mine-draft{position:fixed;inset:8% 8%;z-index:999;background:#172b35f7;border:2px solid #d4b27c;border-radius:18px;padding:18px;color:#fff4d8;overflow:auto;box-shadow:0 0 0 100vmax #07151ac9;font-family:system-ui}.mine-draft h2{font-size:22px;margin:0 0 8px}.mine-draft p{font-size:13px}.mine-draft button{display:block;width:100%;text-align:left;background:#304653;border:1px solid #c2ac7d;color:inherit;border-radius:10px;padding:14px;margin:10px 0;cursor:pointer;min-height:64px}.mine-draft button:focus-visible{outline:3px solid #fff1a1}.mine-draft strong,.mine-draft span{display:block}.mine-draft span{font-size:13px;line-height:1.5;margin-top:4px}
''')
