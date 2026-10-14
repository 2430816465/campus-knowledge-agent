"""Wire the mechanism guide into the existing campaign without editing game rules."""
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'games/marble/puzzle-main.js'
s=p.read_text(encoding='utf-8')
def change(old,new):
    global s
    if old not in s: raise ValueError('Missing insertion: '+old[:90])
    s=s.replace(old,new,1)
change("import {ImpactAudio} from './endless-audio.js';", "import {ImpactAudio} from './endless-audio.js';\nimport {artReady} from './puzzle-art.js';\nimport {TUTORIALS,mechanisms,tutorialBody,drawTutorial} from './puzzle-tutorial.js';")
change("attempts:{},...saved.meta", "attempts:{},tutorialSeen:{},...saved.meta")
change("if(review)meta.unlocked=LEVELS.length;", "meta.tutorialSeen=meta.tutorialSeen||{};let tutorialQueue=[],tutorialAt=0,tutorialReturn='';\nif(review)meta.unlocked=LEVELS.length;")
change("function start(index)", """function openTutorial(replay=false,back=''){
 tutorialQueue=mechanisms(g.level,g.index).filter(id=>replay||!meta.tutorialSeen[id]);tutorialAt=0;tutorialReturn=back;
 if(tutorialQueue.length){view='tutorial';pointer=null;angle=null;}return tutorialQueue.length>0;
}
function finishTutorial(all=false){
 if(view!=='tutorial')return;
 if(all){for(const id of tutorialQueue)meta.tutorialSeen[id]=true;tutorialAt=tutorialQueue.length;}
 else{meta.tutorialSeen[tutorialQueue[tutorialAt]]=true;tutorialAt++;}
 if(tutorialAt>=tutorialQueue.length){view=tutorialReturn;tutorialQueue=[];tutorialAt=0;}
 save();ui(true);
}
function start(index)""")
change("save();landscape();ui(true)}\nfunction record", "openTutorial();save();landscape();ui(true)}\nfunction record")
change("if(!force&&sig===lastSignature)return;", "if(!force&&sig===lastSignature)return;")
change("${btn('帮助','help','small',g.phase==='flight')}", "${btn('教程','tutorial','small',g.phase==='flight')}${btn('帮助','help','small',g.phase==='flight')}")
change("else if(view==='help')", "else if(view==='tutorial'){body=tutorialBody(tutorialQueue[tutorialAt],tutorialAt+1,tutorialQueue.length,btn)}\n else if(view==='help')")
change("${btn('返回关卡','close','gold')}${btn('免费重新挑战','retry')}", "${btn('返回关卡','close','gold')}${btn('机关教程','tutorial')}${btn('免费重新挑战','retry')}")
change("${btn('选择关卡','levels')}${camp?", "${btn('选择关卡','levels')}${btn('机关教程','tutorial')}${camp?")
change("紫色编号星必须同发按序串联", "紫色星印必须按底座灯数由少到多同发串联")
change("标记“3弹”的晶体需先完成3次反弹", "金色晶体下方几盏灯，就需先完成几次反弹")
change("同字母圆环是传送门", "同颜色、同造型的圆门是成对传送门")
change("橙色虚线镜面反射一次后消失", "铜橙端头的裂镜反射一次后消失")
change("金色圆环是出口，青色圆点是机关", "金色圆门是出口，青色方形宝石是机关")
change('`<div class="scrim"><section class="panel">${body}</section></div>`', '`<div class="scrim ${view===\'tutorial\'?\'tutorial-shade\':\'\'}"><section class="panel ${view===\'tutorial\'?\'tutorial-panel\':\'\'}">${body}</section></div>`')
change("const [a,id]=action.split(':');if(a==='chapter')", "const [a,id]=action.split(':');if(a==='tutorialNext'){finishTutorial();return}if(a==='tutorialSkip'||a==='close'&&view==='tutorial'){finishTutorial(true);return}if(a==='tutorial'){if(g.phase==='flight')return;openTutorial(true,view==='help'||view==='pause'?view:'');ui(true);return}if(a==='chapter')")
change("view='';hostPaused=false;message='';landscape()", "view='';hostPaused=false;message='';if(a==='continue'&&g.phase==='aim')openTutorial();landscape()")
change("drawPuzzle(g,canvas,angle);requestAnimationFrame(tick)}", "drawPuzzle(g,canvas,angle);if(view==='tutorial')drawTutorial(document.querySelector('#tutorialDemo'),tutorialQueue[tutorialAt],now);requestAnimationFrame(tick)}")
change("...g.describe(),view,unlocked:meta.unlocked", "...g.describe(),view,unlocked:meta.unlocked,tutorial:view==='tutorial'?{id:tutorialQueue[tutorialAt],number:tutorialAt+1,total:tutorialQueue.length}:null")
change("window.Puzzle={get game(){return g},meta,start,act};ui(true)", "await artReady;window.Puzzle={get game(){return g},get tutorial(){return view==='tutorial'?tutorialQueue[tutorialAt]:null},meta,start,act};ui(true)")
p.write_text(s,encoding='utf-8')
print('Integrated nineteen mechanism guides, persistence, replay and pause.')
