from pathlib import Path
p=Path(__file__).with_name('improve-adventure.py')
s=p.read_text(encoding='utf-8')
start=s.index("edit('games/marble/main.js'")
prefix=s[:s.index("edit('services.js'")] if "edit('services.js'" in s else ''
root=Path(__file__).resolve().parents[1]
def edit(name,old,new):
 p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:80]);p.write_text(s.replace(old,new),encoding='utf-8')
edit('games/marble/main.js',"if(a==='new'){", "if(a==='reroll'){g.reroll();showScene();return}if(a==='new'){")
tail=s[s.index("edit('games/marble/render-endless.js'",start):]
exec(tail,{'ROOT':root,'edit':edit})
