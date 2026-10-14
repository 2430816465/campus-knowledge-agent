(function(){
 'use strict';
 if(!window.CampLan)return;
 let worker=null,pump=null,endpoint='',address='';
 function stop(){clearInterval(pump);pump=null;if(worker)worker.terminate();worker=null;CampLan.stop();endpoint='';address='';}
 function host(){
  stop();const result=JSON.parse(CampLan.start());if(result.error)throw Error(result.error);
  address=result.address;endpoint=result.url;
  worker=new Worker('src/phone-host-worker.js');
  let wallets;try{wallets=JSON.parse(localStorage.getItem('camp.phone-host.wallets'));}catch(_){}
  worker.postMessage({init:wallets&&wallets.accounts?wallets:{version:1,accounts:{}}});
  worker.onmessage=({data})=>{if(data.store)localStorage.setItem('camp.phone-host.wallets',JSON.stringify(data.store));else CampLan.send(data.id,data.text);};
  worker.onerror=()=>{stop();window.dispatchEvent(new Event('phone-host-ended'));};
  pump=setInterval(()=>{
   if(!CampLan.active()){stop();window.dispatchEvent(new Event('phone-host-ended'));return;}
   for(const e of JSON.parse(CampLan.poll()))worker.postMessage(e);
  },16);
  return endpoint;
 }
 function join(value){
  const parts=value.trim().split('.');
  if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255))throw Error('请填写房主手机显示的 IPv4 地址，例如 192.168.1.20');
  const [a,b]=parts.map(Number);if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31))throw Error('仅支持同一 Wi-Fi 内的局域网地址');
  stop();address=parts.map(Number).join('.');endpoint='ws://'+address+':38474/ws?v=1';return endpoint;
 }
 window.PhoneLan={host,join,stop,get url(){return endpoint},get address(){return address},get hosting(){return !!worker}};
 window.addEventListener('pagehide',stop);
})();
