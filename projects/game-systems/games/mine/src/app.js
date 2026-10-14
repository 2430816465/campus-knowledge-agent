/* 启动器：画布适配 + 主循环 + 场景切换。
 * 与主项目一致：不引任何库、不需要构建，直接双击 index.html 运行。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = MT.MM;

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const sceneCanvas=document.createElement('canvas');sceneCanvas.width=720;sceneCanvas.height=1280;
  const sceneCtx=sceneCanvas.getContext('2d');let landscape=null,viewWidth=0,viewHeight=0;
  MM.Input.init(canvas);

  const Game = {
    canvas: canvas,
    ctx: ctx,
    scene: null,

    setScene(scene) {
      if (this.scene && this.scene.exit) this.scene.exit();
      this.scene = scene;
      if (scene && scene.enter) scene.enter();
      fit();
    },
  };
  MM.Game = Game;

  function useLandscape() {
    const scene=Game.scene;
    return viewWidth>viewHeight && !!scene?.run && !scene.panel?.open;
  }
  function drawScene() {
    if(!!landscape!==useLandscape())fit();
    if(!landscape){Game.scene.draw(ctx);return;}
    MM.UI.overlayBounds=null;Game.scene.draw(sceneCtx);
    const L=MM.UI.LAYOUT,scale=720/viewWidth,side=landscape.side*scale;
    ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;
    const bounds=MM.UI.overlayBounds;landscape.overlay=null;
    if(bounds){
      const box={x:bounds.x-8,y:bounds.y-8,w:bounds.w+16,h:bounds.h+16};
      const zoom=Math.min(720/box.w,canvas.height/box.h)*.96,dx=(720-box.w*zoom)/2,dy=(canvas.height-box.h*zoom)/2;
      landscape.overlay={...box,zoom,dx,dy};landscape.hit=[];
      ctx.fillStyle='#10202c';ctx.fillRect(0,0,720,canvas.height);
      ctx.save();ctx.globalAlpha=.12;for(let y=0;y<canvas.height;y+=64)for(let x=0;x<720;x+=64)MM.Assets.drawTile(ctx,'rock-b',x,y,64);ctx.restore();
      ctx.imageSmoothingEnabled=true;ctx.drawImage(sceneCanvas,box.x,box.y,box.w,box.h,dx,dy,box.w*zoom,box.h*zoom);return;
    }
    ctx.drawImage(sceneCanvas,0,L.MAP_TOP,720,L.MAP_BOTTOM-L.MAP_TOP,side,0,720-side,canvas.height);
    ctx.save();ctx.scale(scale,scale);landscape.hit=[];MM.UI.drawLandscapeHUD(ctx,Game.scene,landscape.side,viewHeight,landscape.hit);ctx.restore();
  }
  Game.mapPointer=function(x,y){
    if(!landscape)return {x,y};
    if(landscape.overlay){const o=landscape.overlay;return{x:o.x+(x-o.dx)/o.zoom,y:o.y+(y-o.dy)/o.zoom};}
    const scale=720/viewWidth,px=x/scale,py=y/scale;
    if(px<landscape.side){
      const item=landscape.hit.find(h=>px>=h.x&&px<=h.x+h.w&&py>=h.y&&py<=h.y+h.h);
      const source=item&&(item.source||Game.scene.hit[item.target]);
      return source?{x:source.x+source.w/2,y:source.y+source.h/2}:{x:-1,y:-1};
    }
    const s=720/(viewWidth-landscape.side);
    return {x:(px-landscape.side)*s,y:MM.UI.LAYOUT.MAP_TOP+py*s};
  };
  Game.presentation=()=>landscape?{...landscape,width:viewWidth,height:viewHeight}:null;
  function fit() {
    /* 竖屏保持 720px 逻辑宽度并按设备比例增加逻辑高度。
     * 这样画布等比例铺满手机，长屏增加的空间可由地图承接，不会把按钮纵向拉高。
     * 横屏探索把信息与操作放在侧栏，矿道保持比例；弹窗按实际边界居中放大。 */
    const app = document.querySelector('.app');
    let width = window.innerWidth, height = window.innerHeight;
    if (app) {
      const style = window.getComputedStyle(app);
      width = app.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      height = app.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    }
    viewWidth=width;viewHeight=height;
    const wide=useLandscape();
    landscape=wide?{side:Math.round(Math.max(200,Math.min(248,width*.36))),hit:[]}:null;
    let cssWidth = Math.max(1, Math.round(width));
    let cssHeight = Math.max(1, Math.round(height));
    let logicalHeight = 1280;
    if(wide){logicalHeight=Math.round(720*height/width);}
    else if (height >= width) {
      logicalHeight = Math.max(1280, Math.round(720 * height / Math.max(1, width)));
    } else {
      cssWidth = Math.min(cssWidth, Math.round(cssHeight * 720 / 1280));
      cssHeight = Math.round(cssWidth * 1280 / 720);
    }
    if (canvas.height !== logicalHeight) {
      canvas.height = logicalHeight;
      ctx.imageSmoothingEnabled = false;
    }
    if (MM.UI && MM.UI.setViewportHeight) {
      MM.UI.setViewportHeight(wide?1280:logicalHeight);
      if(wide)MM.UI.LAYOUT.MAP_BOTTOM=MM.UI.LAYOUT.MAP_TOP+Math.round(720*height/(width-landscape.side));
    }
    Game.ctx=wide?sceneCtx:ctx;sceneCtx.imageSmoothingEnabled=false;
    if(Game.scene?.run)Game.scene.camY=Game.scene.camTarget=Game.scene.clampCam(Game.scene.playerWorldY()-Game.scene.viewH()*.42);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
  }
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();

  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
  if (MM.Assets && MM.Assets.loadAll) MM.Assets.loadAll();

  /* 开发 / QA 快捷入口（可选参数，不影响正常玩法）：
   *   index.html?start=1          → 直接进入矿坑（随机 Seed）
   *   index.html?seed=ABC123      → 直接进入矿坑并复现指定 Seed（§76）
   *   index.html?map=v01          → 使用 9×20 快速测试矿坑（默认 full = 9×45）
   */
  let bootScene = null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const seed = params.get('seed');
    const mapId = params.get('map');
    if (params.get('start') || seed || mapId) bootScene = new MM.MiningMode(seed || undefined, mapId || undefined);
  } catch (e) { /* 环境不支持时正常走标题 */ }
  Game.setScene(bootScene || new MM.TitleScene());

  let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let fault=null;
  function recover(error){
    if(fault)return;fault={message:String(error?.message||error),at:new Date().toISOString(),scene:Game.scene?.constructor.name};
    window.CampMineFault=fault;MM.Input.down=false;MM.Input.consume();
    const panel=document.createElement('section');panel.id='mine-recovery';panel.setAttribute('role','alertdialog');
    panel.style.cssText='position:fixed;inset:15%;z-index:9000;background:#fff1d5;color:#563920;border:3px solid #9b6636;padding:20px;display:flex;flex-direction:column;justify-content:center;gap:12px';
    const title=document.createElement('h2');title.textContent='探索暂时中断';const tip=document.createElement('p');tip.textContent='本局仍在内存中。可尝试恢复；若再次中断，返回首页读取最近存档。';
    const retry=document.createElement('button');retry.textContent='恢复本局';retry.style.minHeight='44px';retry.onclick=()=>{fault=null;last=performance.now();panel.remove();};
    const back=document.createElement('button');back.textContent='返回探索首页';back.style.minHeight='44px';back.onclick=()=>{try{Game.setScene(new MM.TitleScene());fault=null;panel.remove();}catch(e){tip.textContent='首页未能恢复，请保留故障记录后重新进入。';}};
    panel.append(title,tip,retry,back);document.body.append(panel);
  }
  function frame(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try{if (Game.scene&&!fault) {
      if (!window.campPaused&&!document.hidden) Game.scene.update(rawDt);
      drawScene();
    }}catch(error){recover(error);}finally{requestAnimationFrame(frame);}
  }
  window.advanceTime = function(ms) { for(let t=0;t<ms;t+=1000/60) { if(!window.campPaused && Game.scene) Game.scene.update(Math.min(1000/60,ms-t)/1000); } if(Game.scene)drawScene(); };
  window.render_game_to_text = function() { const s=Game.scene,r=s&&s.run; return JSON.stringify({scene:s&&s.constructor.name,state:r&&r.state,player:r&&{x:r.playerX,y:r.playerY},depth:r&&r.maxDepthReached,stamina:r&&r.stamina,resources:r&&r.resources,stats:r&&r.stats,settled:r&&r.settled,modal:s&&s.modal,draft:r&&r.campDraft,runId:r&&r.campRunId}); };
  requestAnimationFrame(frame);
})();
