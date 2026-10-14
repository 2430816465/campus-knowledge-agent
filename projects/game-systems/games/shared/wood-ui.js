/* Shared wood presentation and master audio gain. No game rules or save ownership. */
(() => {
  if(window.WoodUI)return;
  const here=new URL('.',document.currentScript.src),root=document.documentElement;
  import(new URL('../../screen-pages.js',here).href).catch(error=>console.error('界面分页未加载',error));
  root.dataset.woodUi='b-1.16.0';
  root.dataset.woodGame=location.pathname.includes('/games/')?location.pathname.split('/').at(-2):'camp';
  const originalMedia=window.matchMedia.bind(window);
  let preferences={};
  try{preferences=JSON.parse(localStorage.getItem('adventure-camp-demo-v1'))?.settings||{};}catch{}
  const reduced=()=>typeof preferences.reducedMotion==='boolean'?preferences.reducedMotion:originalMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.reduceMotion=String(reduced());
  window.matchMedia=query=>{
    const media=originalMedia(query);
    if(!query.includes('prefers-reduced-motion'))return media;
    return new Proxy(media,{get(target,key){if(key==='matches')return query.includes('no-preference')?!reduced():reduced();const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  const masterNodes=new Set(),masters=new WeakMap();
  const volume=()=>!location.pathname.includes('/games/')?1:preferences.sound===false?0:Math.max(0,Math.min(1,(preferences.soundVolume??80)/100));
  if(window.AudioNode){
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...args){
      if(destination===this.context.destination){
        let master=masters.get(this.context);
        if(!master){master=this.context.createGain();master.gain.value=volume();connect.call(master,destination);masters.set(this.context,master);masterNodes.add(master);}
        return connect.call(this,master,...args);
      }
      return connect.call(this,destination,...args);
    };
  }
  const update=value=>{preferences={...preferences,...value};root.dataset.reduceMotion=String(reduced());for(const node of masterNodes)node.gain.setValueAtTime(volume(),node.context.currentTime);};
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.source==='camp-host'&&e.data.command==='preferences')update(e.data.settings);});
  const images={};for(const name of ['panel','primary','secondary','plaque']){const im=new Image();im.src=new URL('../../assets/ui/wood/'+name+'.png',here).href;images[name]=im;}
  let pressed=null;
  document.addEventListener('pointerdown',e=>{if(e.target instanceof HTMLCanvasElement)pressed={canvas:e.target,x:e.clientX,y:e.clientY};},{passive:true});
  for(const event of ['pointerup','pointercancel','blur'])window.addEventListener(event,()=>pressed=null);
  function paint(ctx,name,rect,{disabled=false}={}){
    const im=images[name];if(!im?.complete||!im.naturalWidth)return false;
    const {x,y,w,h}=rect;if(w<=0||h<=0)return false;
    const edge=name==='panel'?92:34,dh=Math.min(name==='panel'?(Math.min(w,h)<180?8:24):12,w/3,h/3),sw=im.naturalWidth,sh=im.naturalHeight;
    const sx=[0,edge,sw-edge,sw],sy=[0,edge,sh-edge,sh],dx=[x,x+dh,x+w-dh,x+w],dy=[y,y+dh,y+h-dh,y+h];
    ctx.save();ctx.imageSmoothingEnabled=false;if(disabled)ctx.globalAlpha*=.55;
    if(name!=='panel'&&!disabled&&pressed?.canvas===ctx.canvas){const b=ctx.canvas.getBoundingClientRect();const px=(pressed.x-b.left)*ctx.canvas.width/b.width,py=(pressed.y-b.top)*ctx.canvas.height/b.height;if(px>=x&&px<=x+w&&py>=y&&py<=y+h){ctx.translate(0,3);ctx.filter='brightness(.83)';}}
    for(let row=0;row<3;row++)for(let col=0;col<3;col++)ctx.drawImage(im,sx[col],sy[row],sx[col+1]-sx[col],sy[row+1]-sy[row],dx[col],dy[row],dx[col+1]-dx[col],dy[row+1]-dy[row]);
    ctx.restore();return true;
  }
  window.WoodUI=Object.freeze({paint,update,systemReducedMotion:()=>originalMedia('(prefers-reduced-motion: reduce)').matches,get preferences(){return {...preferences};},build:'b-1.16.0'});
})();
