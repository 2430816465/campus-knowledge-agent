import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source=process.cwd(),id='evolve-final-20261002-hell-art-v1',dest=path.resolve(source,'../定稿版本/再进化一次-20261002-地狱美术定稿');
try{await fs.access(dest);throw new Error('冻结目录已存在，请创建新的版本标识，不能覆盖定稿。');}catch(e){if(e.code!=='ENOENT')throw e;}
const before=await fs.readFile('artifacts/evolve-hell-art/backup/hell.js','utf8'),after=await fs.readFile('games/evolve/hell.js','utf8');
assert.equal(after.split('export function drawHellHazards')[0].replace(/\r/g,''),before.split('export function drawHellHazards')[0].replace(/\r/g,''));
await fs.mkdir(dest,{recursive:true});
const runtime=['games/evolve','games/shared/wood-ui.js','games/shared/wood-ui.css','games/shared/camp-wallet.js','screen-pages.js','screen-pages.css','assets/fonts/camp-display.woff','assets/ui/wood'];
const references=['app.js','services.js','adapters.js','evolve-host.js'];
for(const rel of runtime){const to=path.join(dest,'runtime',rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(path.join(source,rel),to,{recursive:true,errorOnExist:true,force:false});}
for(const rel of references){const to=path.join(dest,'integration-reference',rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(rel,to);}
await fs.cp('artifacts/evolve-hell-art/masters',path.join(dest,'美术母版'),{recursive:true});
await fs.mkdir(path.join(dest,'验收'),{recursive:true});
for(const rel of ['prompts.json','image-audit.json','接入与验收.md','evolve-results.txt','unit-results.txt'])await fs.copyFile('artifacts/evolve-hell-art/'+rel,path.join(dest,'验收',rel));
await fs.cp('artifacts/evolve-hell-art/skill-final',path.join(dest,'验收/官方客户端'),{recursive:true});
await fs.cp('artifacts/evolve-hell/browser',path.join(dest,'验收/浏览器'),{recursive:true});
for(const rel of ['tests/evolve.test.mjs','tests/evolve-hell.test.mjs','tests/evolve-services.test.mjs','tests/evolve-hell-browser.mjs']){const to=path.join(dest,rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(rel,to);}
const readme=`# 再进化一次 · 当前最终版本\n\n版本标识：${id}\n状态：CURRENT_FINAL_SOURCE（仅本玩法，不代表合集APK发布）\n日期：2026-10-02\n\n包含普通模式、20级三合一体系、独立地狱存档、毒潮/裂隙/强水流/稀缺食物及三张独立美术资源。动画沿用游戏时间，不改变规则。\n\n接入时将 runtime/games/evolve 完整对应到目标项目 games/evolve，包含 assets/hazards 三张WebP，勿混用旧脚本。共享UI、字体及木牌资源在runtime相对路径中，作为依赖版本参考；请比较目标已有版本，保留其他玩法的新改动。integration-reference 是冻结时的营地接口参考，不可直接覆盖整个大厅或货币系统。\n\n保留 camp-evolve-v1 与 camp-evolve-hell-v1 存档键。普通模式不覆盖地狱模式。20级获胜与一次广告复活均已接入原宿主协议。营地广告仍按当前项目平台适配工作，快照不是新广告SDK。\n\n大厅入口沿用第六入口；先显示标题页，再选择普通池塘/地狱挑战。独立预览地址 games/evolve/index.html?difficulty=hell。营地help旧文案仍提“吃同级直接进化/进度满合并”，整理时应校正为“主角+2只同级进化；低级随行3只同级自动合成”。这里只记录该接口文案，不覆盖并行大厅改动。\n\n验证：本玩法34项测试及浏览器流程通过，透明资源、预警/爆发、手机横屏画面已检查。全项目本次158项156通过，2项rush失败见验收记录；不得称为全合集测试通过。未实机Android验证，未生成或替换APK。\n\nmanifest.json 记录冻结文件SHA256；当前项目继续修改不会改变本快照。以后若改动玩法，应创建新版本并更新当前定稿指针，不能悄悄覆盖此目录。\n`;
await fs.writeFile(path.join(dest,'接入说明.md'),readme);
const files=[];async function walk(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else{const buf=await fs.readFile(f);files.push({path:path.relative(dest,f).replaceAll('\\','/'),bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex')});}}}await walk(dest);
const record={id,game:'再进化一次',status:'CURRENT_FINAL_SOURCE',date:'2026-10-02',createdAt:new Date().toISOString(),snapshot:dest,scope:'games/evolve only; shared dependencies and camp interfaces are references',apkBuilt:false,gameLogicUnchanged:true,checks:{evolveUnit:{passed:34,failed:0},browser:'passed',wholeProject:{passed:156,failed:2,failedFile:'tests/rush.test.mjs'}},files};
await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify(record,null,2));await fs.mkdir('versions',{recursive:true});
await fs.writeFile('versions/evolve-current-final.json',JSON.stringify({...record,files:undefined,manifest:path.join(dest,'manifest.json')},null,2));
await fs.writeFile(path.resolve(source,'../再进化一次-当前最终版本.md'),readme+`\n冻结目录：${dest}\n\n项目索引：${path.join(source,'versions/evolve-current-final.json')}\n`);
console.log(JSON.stringify({id,snapshot:dest,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)},null,2));
