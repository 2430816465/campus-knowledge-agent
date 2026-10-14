(() => {if(window.CampPreferences)return;const root=document.documentElement;
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
window.CampPreferences=Object.freeze({update,systemReducedMotion:()=>originalMedia('(prefers-reduced-motion: reduce)').matches,get preferences(){return {...preferences};}});})();