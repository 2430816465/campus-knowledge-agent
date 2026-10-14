export function privateIPv4(value){const p=value.trim().split('.');if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))throw Error('请填写房主的局域网IPv4地址');const [a,b]=p.map(Number);if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31))throw Error('请使用同一Wi-Fi内的房主地址');return p.map(Number).join('.');}
export class Connection {
 constructor(onMessage,onStatus){this.onMessage=onMessage;this.onStatus=onStatus;this.socket=null;this.worker=null;this.pump=null;this.manual=false;this.retry=null;this.token=null;this.endpoint='';this.intent=null;this.ping=null;this.generation=0;}
 async connect({hosting,code,name,character,clientId,address,matching=false,playerId}){
  this.stop();this.manual=false;let url;
  if(matching){
   let config={};try{config=await (await fetch(new URL('./match-config.json',import.meta.url))).json();}catch{}
   this.intent={type:'match',name,character,clientId,playerId};this.matching=true;
   if(config.serverUrl){const root=new URL(config.serverUrl);if(!['http:','https:'].includes(root.protocol)||root.username||root.password)throw Error('匹配服务器地址配置无效');if(root.protocol==='http:'&&!['127.0.0.1','localhost'].includes(root.hostname)){try{privateIPv4(root.hostname);}catch{throw Error('公共匹配服务器需要HTTPS地址');}}url=new URL('/liars-ws?v=1',root);url.protocol=root.protocol==='https:'?'wss:':'ws:';this.address=root.host;this.endpoint=url.href;this.open();return;}
   if(window.CampLan){this.localMatch();return;}
   url=new URL('/liars-ws?v=1',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';this.address=location.host;this.endpoint=url.href;this.open();return;
  }
  this.matching=false;
  if(window.CampLan){
   if(hosting){const result=JSON.parse(CampLan.start());if(result.error)throw Error(result.error);this.address=result.address;url=result.url;this.worker=new Worker(new URL('./phone-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.kind==='records')this.persistRecords(data.records);else CampLan.send(data.id,data.text);};this.worker.onerror=()=>{this.stop();this.onStatus('手机房间异常结束，请重新开房');};this.pump=setInterval(()=>{if(!CampLan.active()){this.stop();this.onStatus('房主离开前台，房间已关闭');this.onMessage({type:'closed',reason:'房主离开前台，房间已关闭'});return;}try{for(const e of JSON.parse(CampLan.poll()))this.worker.postMessage(e);}catch{this.stop();this.onStatus('手机联机异常，请重新开房');}},16);}
   else{this.address=privateIPv4(address);url=`ws://${this.address}:38474/ws?v=1`;}
  }else{url=new URL('/liars-ws?v=1',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';this.address=location.host;url=url.href;}
  this.endpoint=url;this.intent={type:hosting?'create':'join',code,name,character,clientId};this.open();
 }
 persistRecords(records){try{localStorage.setItem('liars-bot-records',JSON.stringify(records));}catch{}}
 localMatch(){this.address='本机测试桌';this.worker=new Worker(new URL('./phone-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.kind==='records'){this.persistRecords(data.records);return;}const m=JSON.parse(data.text);if(m.type==='joined'){this.token=m.token;this.code=m.code;}this.onMessage(m);};this.worker.onerror=()=>{this.onStatus('测试桌连接异常');this.onMessage({type:'disconnected'});};let records={};try{records=JSON.parse(localStorage.getItem('liars-bot-records')||'{}');}catch{}this.worker.postMessage({kind:'records',records});this.worker.postMessage({kind:'open',id:'local-match',host:true});this.socket={readyState:WebSocket.OPEN,send:text=>this.worker?.postMessage({kind:'text',id:'local-match',text}),close:()=>{}};this.onStatus('本机测试匹配 · 公共服务器尚未配置');this.send(this.intent);}
 open(){const generation=++this.generation;this.onStatus(this.token?'正在重连，座位保留30秒':'正在连接酒馆…');const socket=new WebSocket(this.endpoint);this.socket=socket;const joinTimeout=setTimeout(()=>{if(!this.token){this.onStatus('连接超时，请检查房主地址和Wi-Fi');socket.close();this.manual=true;}},10000);
  socket.onopen=()=>{this.send(this.token?{...this.intent,type:'join',code:this.code,token:this.token}:this.intent);clearInterval(this.ping);this.ping=setInterval(()=>this.send({type:'ping',at:Date.now()}),10000);};
  socket.onmessage=e=>{if(generation!==this.generation)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='queue'){clearTimeout(joinTimeout);this.onStatus('正在匹配同一服务器上的旅人…');}if(m.type==='joined'){clearTimeout(joinTimeout);this.token=m.token;this.code=m.code;this.retryStarted=null;this.onStatus(this.matching?'匹配已连接':'局域网已连接');}if(m.type==='snapshot')this.onStatus(m.phase==='paused'?m.reason:this.matching?'匹配已连接':'局域网已连接');if(m.type==='closed'){this.manual=true;this.token=null;clearInterval(this.ping);}this.onMessage(m);};
  socket.onclose=()=>{clearTimeout(joinTimeout);clearInterval(this.ping);if(generation!==this.generation||this.manual)return;if(this.token){this.retryStarted??=Date.now();if(Date.now()-this.retryStarted<30000){this.onStatus('连接中断，正在重连…');this.retry=setTimeout(()=>this.open(),1000);return;}}this.onStatus('连接已断开，请重新加入');this.onMessage({type:'disconnected'});};socket.onerror=()=>{};
 }
 send(data){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({v:1,...data}));}
 leave(){this.send({type:'leave'});this.stop();}
 stop(){this.manual=true;this.generation++;clearTimeout(this.retry);clearInterval(this.ping);clearInterval(this.pump);this.socket?.close();this.socket=null;this.worker?.terminate();this.worker=null;if(window.CampLan)CampLan.stop();this.token=null;this.retryStarted=null;}
}
