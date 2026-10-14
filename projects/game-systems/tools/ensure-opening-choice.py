from pathlib import Path
p=Path('games/marble/state-endless.js');s=p.read_text(encoding='utf-8');a="this.sound('reward');return true}";b="if(kind==='upgrade'&&r.selections===1&&!r.offer.some(p=>p.id==='extra'))r.offer[2]={id:'extra',tier:r.offer[2].tier};this.sound('reward');return true}";assert a in s;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
