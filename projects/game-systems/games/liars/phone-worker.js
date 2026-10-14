import {Rooms} from './rooms.js';
const rooms=new Rooms();
self.onmessage=({data:e})=>{
 if(e.kind==='records'){for(const [id,r] of Object.entries(e.records||{}))if(/^[A-Za-z0-9_-]{8,80}$/.test(id)&&Array.isArray(r?.outcomes))rooms.records[id]={outcomes:r.outcomes.filter(v=>typeof v==='boolean').slice(-20),at:Number(r.at)||0};return;}
 if(e.kind==='open')rooms.open(e.id,m=>postMessage({id:e.id,text:JSON.stringify(m)}),{phone:true,host:e.host});
 else if(e.kind==='close')rooms.close(e.id);
 else if(e.kind==='text'){try{rooms.handle(e.id,JSON.parse(e.text));}catch{postMessage({id:e.id,text:JSON.stringify({type:'error',message:'消息格式无效'})});}}
};
rooms.saveRecords=records=>postMessage({kind:'records',records});
setInterval(()=>rooms.tick(),100);
