import http from 'node:http';
import {attachChess} from './games/chess/server.mjs';
import {attachLiars} from './games/liars/server.mjs';
import attachCoop from './games/coop/server/server.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {networkInterfaces} from 'node:os';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||4173);
function lanUrls(){return Object.entries(networkInterfaces()).filter(([name])=>!/vmware|virtual|vethernet|loopback/i.test(name)).flatMap(([,items])=>(items||[]).filter(a=>a.family==='IPv4'&&!a.internal&&!a.address.startsWith('169.254.')).map(a=>`http://${a.address}:${port}/`));}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/api/config'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({playtestAllLevels:process.env.PLAYTEST_ALL_LEVELS==='1'||process.env.NODE_ENV!=='production'}));return;}
  if(name==='/health'||name==='/lan-info'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify(name==='/health'?{ok:true,websocket:true}:{urls:lanUrls()}));return;
  }
  if(/(?:^|\/)(?:\.[^/]*|server|tests|tools|android|artifacts|node_modules)(?:\/|$)/.test(name)||!types[path.extname(name==='/'?'index.html':name)])throw Error();
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root))throw Error();
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
attachCoop(server);
attachLiars(server);
attachChess(server);
server.listen(port,process.env.HOST||'0.0.0.0',()=>{
 console.log(`Adventure Camp: http://127.0.0.1:${port}/`);
 for(const url of lanUrls())console.log('LAN: '+url);
});

