import {createHash,randomUUID,randomInt} from 'node:crypto';
import {Rooms} from './rooms.js';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
const recordsFile=new URL('../../.liars-data/records.json',import.meta.url);
// Separate endpoint: the existing cooperation server owns /ws, this mode owns /liars-ws.
export function attachLiars(server){
 const allowedOrigins=new Set((process.env.LIARS_ALLOWED_ORIGINS||'http://127.0.0.1:38473').split(',').map(v=>v.trim()).filter(Boolean));
 let records={};try{records=JSON.parse(readFileSync(recordsFile,'utf8'));}catch{}
 const service=new Rooms({randomInt,uuid:randomUUID,records,saveRecords:value=>{mkdirSync(new URL('../../.liars-data/',import.meta.url),{recursive:true});const tmp=new URL('../../.liars-data/records.tmp',import.meta.url);writeFileSync(tmp,JSON.stringify(value));renameSync(tmp,recordsFile);}}),sockets=new Set();
 function frame(socket,opcode,body=''){if(socket.destroyed)return;const bytes=Buffer.from(body);let header;if(bytes.length<126)header=Buffer.from([0x80|opcode,bytes.length]);else{header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(bytes.length,2);}if(socket.writableLength>128*1024)return socket.destroy();socket.write(Buffer.concat([header,bytes]));}
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://local');if(url.pathname!=='/liars-ws')return;
  let origin;try{origin=new URL(req.headers.origin);}catch{}
  if(url.searchParams.get('v')!=='1'||!origin||origin.host!==req.headers.host&&!allowedOrigins.has(origin.origin)||!['http:','https:'].includes(origin.protocol)||req.headers['sec-websocket-version']!=='13'||req.headers.upgrade?.toLowerCase()!=='websocket'||!/^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key']||'')||sockets.size>=128){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const id=randomUUID();let buffer=Buffer.alloc(0),fragment=null,pong=true;sockets.add(socket);socket.setTimeout(45000,()=>socket.destroy());socket.setNoDelay(true);service.open(id,value=>frame(socket,1,JSON.stringify(value)));
  const receive=chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>32768)return socket.destroy();
   while(buffer.length>=2){const fin=!!(buffer[0]&128),opcode=buffer[0]&15,masked=!!(buffer[1]&128);let size=buffer[1]&127,offset=2;if(buffer[0]&112||!masked||size===127)return socket.destroy();if(size===126){if(buffer.length<4)return;size=buffer.readUInt16BE(2);offset=4;}if(size>16384||(opcode>=8&&(!fin||size>125)))return socket.destroy();if(buffer.length<offset+4+size)return;
    const mask=buffer.subarray(offset,offset+4),body=Buffer.from(buffer.subarray(offset+4,offset+4+size));buffer=buffer.subarray(offset+4+size);for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
    if(opcode===8){frame(socket,8,body);socket.end();return;}if(opcode===9){frame(socket,10,body);continue;}if(opcode===10){pong=true;continue;}
    if(opcode===1){if(fragment)return socket.destroy();fragment=body;}else if(opcode===0){if(!fragment)return socket.destroy();fragment=Buffer.concat([fragment,body]);}else return socket.destroy();if(fragment.length>16384)return socket.destroy();
    if(fin){try{service.handle(id,JSON.parse(fragment.toString('utf8')));}catch{frame(socket,1,JSON.stringify({type:'error',message:'消息格式无效'}));}fragment=null;}
   }
  };
  socket.on('data',receive);socket.on('error',()=>{});socket.on('close',()=>{clearInterval(heartbeat);sockets.delete(socket);service.close(id);});const heartbeat=setInterval(()=>{if(!pong)return socket.destroy();pong=false;frame(socket,9);},15000);heartbeat.unref();if(head.length)receive(head);
 });
 const timer=setInterval(()=>service.tick(),100);timer.unref();server.on('close',()=>{clearInterval(timer);for(const s of sockets)s.destroy();});return service;
}
