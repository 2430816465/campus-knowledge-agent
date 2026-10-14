import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',clients=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function client(){const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});const c={ws,messages,send:x=>ws.send(JSON.stringify(x)),async wait(predicate){for(let n=0;n<250;n++){const value=messages.findLast(predicate);if(value)return value;await sleep(20);}throw Error('Snapshot timeout: '+JSON.stringify(messages.slice(-2)));}};clients.push(c);return c;}
try{
 assert.equal((await (await fetch(base+'/health')).json()).websocket,true);
 const a=await client(),b=await client();const key='qa-'+Date.now();a.send({type:'create',accountId:key+'-a',name:'房主',level:0});const joined=await a.wait(m=>m.type==='joined');b.send({type:'join',accountId:key+'-b',name:'队友',code:joined.code});await b.wait(m=>m.type==='joined');await a.wait(m=>m.type==='snapshot'&&m.players[1].joined);
 const extra=await client();extra.send({type:'join',accountId:key+'-c',code:joined.code});assert.match((await extra.wait(m=>m.type==='error')).message,/房间已满/);
 a.send({type:'ready',value:true});b.send({type:'ready',value:true});await a.wait(m=>m.type==='snapshot'&&m.players.every(p=>p.ready));a.send({type:'start'});
 const initial=await a.wait(m=>m.type==='snapshot'&&m.phase==='playing');await b.wait(m=>m.type==='snapshot'&&m.phase==='playing');assert.equal(initial.world.levelIndex,0);const x=initial.world.players[0].x;
 a.send({type:'input',right:true});await a.wait(m=>m.type==='snapshot'&&m.world?.players[0].x>x+25);a.send({type:'input',right:false});await b.wait(m=>m.type==='snapshot'&&m.world?.players[0].x>x+20);
 a.send({type:'reset'});const reset=await a.wait(m=>m.type==='snapshot'&&m.world?.run>initial.world.run);assert.equal(reset.world.levelIndex,0);await b.wait(m=>m.type==='snapshot'&&m.world?.run===reset.world.run);
 a.send({type:'leave'});await a.wait(m=>m.type==='left');b.send({type:'leave'});await b.wait(m=>m.type==='left');console.log('72-map campaign LAN: create/join/full-room/ready/start/movement/reset/leave passed. Full LAN route completion is not covered.');
}finally{clients.forEach(c=>c.ws.close());}
