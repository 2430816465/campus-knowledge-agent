# -*- coding: utf-8 -*-
from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'games/mine/src/scenes/TitleScene.js';s=f.read_text(encoding='utf-8');s=s.replace('this.hit = {};','this.hit = {};this.moreOpen=false;')
s=s.replace("if (MM.U.pointInRect(ev.x, ev.y, this.hit.back)) {", "if(MM.U.pointInRect(ev.x,ev.y,this.hit.quickResume)){MM.Game.setScene(new MM.MiningMode(undefined,undefined,{resume:true}));return;}\n      if(MM.U.pointInRect(ev.x,ev.y,this.hit.more)){this.moreOpen=true;return;}\n      if (MM.U.pointInRect(ev.x, ev.y, this.hit.back)) { if(this.moreOpen){this.moreOpen=false;return;}")
s=s.replace('drawTitleBackdrop(ctx);','this.hit={};drawTitleBackdrop(ctx);',1)
mark='    /* 主目标说明 */';assert mark in s
compact='''    if(!this.moreOpen){
      let y=300+heroExtra;const continuing=MM.Save.hasActiveRun();
      if(continuing){this.hit.quickResume={x:24,y:y,w:672,h:98};U.button(ctx,this.hit.quickResume,'继续上次探索',{color:'#b78230',border:'#ffe09b'});y+=122;}
      this.hit.start={x:24,y:y,w:672,h:98};U.button(ctx,this.hit.start,continuing?'选择新矿区':'开始探索 · 选择矿区',{color:'#b78230',border:'#ffe09b'});y+=125;
      MM.U.text(ctx,'体力决定路线，撤离可保住收获',360,y,23,'#514635','center',true);y+=45;
      this.hit.tutorial={x:24,y:y,w:330,h:100};U.button(ctx,this.hit.tutorial,'新手实操',{color:'#244f58',border:'#93b8b0'});
      this.hit.archive={x:366,y:y,w:330,h:100};U.button(ctx,this.hit.archive,'探索档案',{color:'#51402b',border:'#bc9e6d'});y+=124;
      this.hit.more={x:24,y:y,w:672,h:96};U.button(ctx,this.hit.more,'目标风格 / 每日与同图挑战',{color:'#51402b',border:'#bc9e6d'});
      if(this.archiveOpen)this.drawArchive(ctx);if(this.codexOpen)this.drawCodex(ctx);if(this.settingsOpen)this.drawSettings(ctx);
      if(this.currencyOpen)this.drawCurrency(ctx);if(this.handbookOpen)this.drawHandbook(ctx);if(this.minePickerOpen)this.drawMinePicker(ctx);
      return;
    }
'''
s=s.replace(mark,compact+mark);f.write_text(s,encoding='utf-8')
f=p/'games/marble/state-endless.js';s=f.read_text(encoding='utf-8');s=s.replace('const v=r.volley;r.shot++;','const v=r.volley;r.lastVolley={kills:v.kills,combo:v.combo,direct:v.direct,indirect:v.indirect,xp:v.xpGain,time:v.elapsed,recalled:v.elapsed>=C.flight};r.shot++;');f.write_text(s,encoding='utf-8')
f=p/'games/marble/ui-endless.js';s=f.read_text(encoding='utf-8');s=s.replace("${r.supportUsed?'本局战术帮助已使用':'战术帮助 · 每局二选一'}","${r.supportUsed?'本局战术帮助已使用':'战术帮助 · 每局二选一'}")
s=s.replace('<div class="evolution-progress">${evolutions(g)}</div>','<p class="arena-panel-note">单发最长7.2秒后回收；最多8主球 / 32总球。爆炸、连锁及分裂额度整发共享，升级变化见能力卡。</p>${r.lastVolley?`<p class="arena-panel-note">上发：${r.lastVolley.kills}击破 · ${r.lastVolley.combo}连击 · ${r.lastVolley.xp}经验${r.lastVolley.recalled?\' · 达到时限已回收\':\'\'}</p>`:\'\'}<div class="evolution-progress">${evolutions(g)}</div>')
f.write_text(s,encoding='utf-8')
