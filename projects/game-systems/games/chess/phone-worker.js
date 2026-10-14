import {Rooms} from './rooms.js';
const rooms=new Rooms();
self.onmessage=({data:e})=>{if(e.kind==='open')rooms.open(e.id,m=>postMessage({id:e.id,text:JSON.stringify(m)}),{phone:true,host:e.host});else if(e.kind==='close')rooms.close(e.id);else if(e.kind==='text'){try{rooms.handle(e.id,JSON.parse(e.text));}catch{postMessage({id:e.id,text:JSON.stringify({type:'error',message:'消息格式无效'})});}}};
setInterval(()=>rooms.tick(),100);
