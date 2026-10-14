export function privateIPv4(value){const p=String(value).trim().split('.');if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))throw Error('请输入房主的局域网IPv4地址');const [a,b]=p.map(Number);if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31))throw Error('请使用同一Wi-Fi内的房主地址');return p.map(Number).join('.');}
export function serverEndpoint(address){const url=new URL(address);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('服务器地址应为HTTP或HTTPS网址');if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){try{privateIPv4(url.hostname);}catch{throw Error('公网服务器需要HTTPS网址');}}const ws=new URL('/chess-ws?v=1',url);ws.protocol=url.protocol==='https:'?'wss:':'ws:';return ws.href;}
export class Connection{
 constructor(onMessage,onStatus){this.onMessage=onMessage;this.onStatus=onStatus;this.generation=0;}
 async connect({realm='lan',serverUrl='',address='',...intent}){
  this.stop();this.manual=false;this.intent=intent;this.realm=realm;
  if(intent.type==='practice'){this.local();return;}
  if(realm==='internet'){
   if(!serverUrl){let config={};try{config=await(await fetch(new URL('./server-config.json',import.meta.url))).json();}catch{}serverUrl=config.serverUrl||'';}
   if(!serverUrl){if(window.CampLan)throw Error('公网服务尚未部署，请在联机设置填写HTTPS服务器地址');serverUrl=location.origin;}
   this.endpoint=serverEndpoint(serverUrl);this.address=new URL(serverUrl).host;
  }else if(window.CampLan){
   if(intent.type==='match')throw Error('快速匹配需要公网服务器；局域网请创建好友房');
   if(intent.type==='create'){const r=JSON.parse(CampLan.start());if(r.error)throw Error(r.error);this.address=r.address;this.endpoint=r.url;this.worker=new Worker(new URL('./phone-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>CampLan.send(data.id,data.text);this.worker.onerror=()=>this.fail('手机房间异常，请重新开房');this.pump=setInterval(()=>{if(!CampLan.active()){this.fail('房主退出前台，手机房间已关闭');return;}try{for(const e of JSON.parse(CampLan.poll()))this.worker.postMessage(e);}catch{this.fail('局域网连接异常');}},16);}
   else{this.address=privateIPv4(address);this.endpoint=`ws://${this.address}:38474/ws?v=1`;}
  }else{this.endpoint=serverEndpoint(address?`http://${privateIPv4(address)}:4173`:location.origin);this.address=address||location.host;}
  this.open();
 }
 local(){this.address='本机人机桌';this.worker=new Worker(new URL('./phone-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>this.receive(JSON.parse(data.text));this.worker.onerror=()=>this.fail('人机桌启动异常');this.socket={readyState:1,send:text=>this.worker?.postMessage({kind:'text',id:'practice-player',text}),close:()=>{}};this.worker.postMessage({kind:'open',id:'practice-player',host:true});this.send(this.intent);this.onStatus('本机人机桌');}
 open(){const gen=++this.generation;this.onStatus(this.token?'正在重连 · 座位保留30秒':'正在连接牌桌…');const s=new WebSocket(this.endpoint);this.socket=s;this.joinTimeout=setTimeout(()=>{if(gen===this.generation&&!this.token){this.manual=true;s.close();this.onMessage({type:'disconnected'});this.onStatus('连接超时，请检查服务器或房主地址');}},10000);
  s.onopen=()=>{this.send(this.token?{...this.intent,type:'join',code:this.code,token:this.token}:this.intent);clearInterval(this.ping);this.ping=setInterval(()=>this.send({type:'ping',at:Date.now()}),10000);};
  s.onmessage=e=>{if(gen!==this.generation)return;let m;try{m=JSON.parse(e.data);}catch{return;}this.receive(m);};s.onerror=()=>{};
  s.onclose=()=>{clearInterval(this.ping);clearTimeout(this.joinTimeout);if(gen!==this.generation||this.manual)return;if(this.token){this.retryAt??=Date.now();if(Date.now()-this.retryAt<30000){this.onStatus('连接中断，机器人暂时代打，正在重连…');this.onMessage({type:'reconnecting'});this.retry=setTimeout(()=>this.open(),1000);return;}}this.onStatus('已断开，请重新加入');this.onMessage({type:'disconnected'});};
 }
 receive(m){if(['joined','queue'].includes(m.type))clearTimeout(this.joinTimeout);if(m.type==='joined'){this.token=m.token;this.code=m.code;this.retryAt=null;this.onStatus(this.realm==='internet'?'服务器已连接':this.address||'已连接');}if(m.type==='closed'){this.manual=true;this.token=null;clearInterval(this.ping);}this.onMessage(m);}
 fail(reason){this.stop();this.onStatus(reason);this.onMessage({type:'closed',reason});}
 send(data){if(this.socket?.readyState!==1)return false;try{this.socket.send(JSON.stringify({v:1,...data}));return true;}catch{return false;}}
 leave(){this.send({type:'leave'});this.stop();}
 stop(){this.manual=true;this.generation++;clearTimeout(this.retry);clearTimeout(this.joinTimeout);clearInterval(this.ping);clearInterval(this.pump);this.socket?.close();this.socket=null;this.worker?.terminate();this.worker=null;if(this.pump&&window.CampLan)CampLan.stop();this.pump=null;this.token=null;this.retryAt=null;}
}
