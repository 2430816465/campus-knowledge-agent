# -*- coding: utf-8 -*-
from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'games/rush/game.js';s=f.read_text(encoding='utf-8');s=s.replace("function show(){","function show(){document.getElementById('game').dataset.screen=screen;");f.write_text(s,encoding='utf-8')
f=p/'games/rush/style.css';s=f.read_text(encoding='utf-8');s+='''
/* Menus use the screen width; the playable vertical track keeps its aspect. */
@media(orientation:landscape) and (max-height:500px){
 #game:has(#overlay:not(:empty)){width:100vw}#overlay .panel{max-width:760px}
 #game[data-screen="home"] .panel,#game[data-screen="paused"] .panel{display:grid;grid-template-columns:1fr 1fr;gap:6px;overflow:hidden;padding:10px}
 #game[data-screen="home"] .panel h1{font-size:23px;margin:0;align-self:center}
 #game[data-screen="home"] .wallet{font-size:12px;padding:7px}
 #game[data-screen="home"] .stage-note{grid-column:1/-1;margin:0;padding:7px}
 #game[data-screen="home"] .stage-note p{margin:2px 0;line-height:1.4;font-size:12px}
 #game[data-screen="home"] .actions{grid-column:1/-1;margin:0}
 #game[data-screen="home"] .btn,#game[data-screen="paused"] .btn{margin:0;min-height:44px;padding:7px}
 #game[data-screen="home"] .caption{display:none}
 #game[data-screen="paused"] :is(.eyebrow,h2,p){grid-column:1/-1;margin:0;line-height:1.4}
 #game[data-screen="paused"] [data-action="resume"]{grid-column:1/-1}
}
''';f.write_text(s,encoding='utf-8')
f=p/'games/liars/style.css';s=f.read_text(encoding='utf-8')+'''
@media(orientation:landscape) and (max-height:430px){
 .welcome{padding:6px 14px}.welcome>.eyebrow{display:none}.welcome>h1{margin:0 0 5px;font-size:23px}
 .welcome>.panel{padding:10px;gap:12px}.welcome .character img{height:60px}.welcome .character{padding:5px}
 .welcome .characters{margin:4px 0}.welcome .role-name-note{margin:0;font-size:13px}.welcome .profile-editor>small{font-size:10px}
 .welcome .room-note{font:11px/1.35 sans-serif;margin:4px 0}.welcome .mode-tabs{margin:6px 0}.welcome .connect-form button{min-height:44px;padding:6px}
}
''';f.write_text(s,encoding='utf-8')
f=p/'games/marble/ui-endless.js';s=f.read_text(encoding='utf-8').replace('营地冒险币按有效游玩入账，见角落记录','营地冒险币按有效游玩入账，可在营地暂停菜单查看');f.write_text(s,encoding='utf-8')
f=p/'games/marble/main.js';s=f.read_text(encoding='utf-8');s=s.replace("padding:24px';","padding:24px';",1);s=s.replace("rotate.id='marble-rotate';","rotate.id='marble-rotate';rotate.dataset.fitNative='true';");f.write_text(s,encoding='utf-8')
