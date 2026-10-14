import fs from 'node:fs';
const path='games/workshop/scene.js',s=fs.readFileSync(path,'utf8');
fs.writeFileSync(path,s.replace("ctx.save();ctx.fillStyle='#bd6681';ctx.fillRect(L.counter", "ctx.save();if(s.shop.facilities.rack){ctx.fillStyle='#bd6681';ctx.fillRect(L.counter").replace("L.counter.y-12,5,13);ctx.fillStyle='#aa4d75';", "L.counter.y-12,5,13);}ctx.fillStyle='#aa4d75';"));
