/* V1.0 矿脉远征：批量抽检全部矿区。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../games/mine');
const store = {};
global.window = global;
global.CampSkin = {paper:'#fcf7ef',wood:'#f5e5cf',ink:'#482e24',muted:'#817268',line:'#dfbea0',primary:'#dfa36e',green:'#6d8657',danger:'#a54338'};
global.localStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
  setItem(key, value) { store[key] = String(value); },
  removeItem(key) { delete store[key]; },
};

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [];
let match;
const scriptPattern = /<script src="([^"]+)"><\/script>/g;
while ((match = scriptPattern.exec(html))) scripts.push(match[1]);
for (const src of scripts) {
  if (/app\.js$/.test(src) || !src.startsWith('src/') || src.endsWith('MiningAdventure.js')) continue;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), { filename: src });
}

const MM = global.MT.MM;
const count = Math.max(1, Math.min(1000, parseInt(process.argv[2], 10) || 100));
const mineIds = ['oldMine', 'resonanceCave', 'clockworkMine', 'sealedVault'];
const report = [];
let totalFailure = 0;

function say(line) {
  report.push(line);
  console.log(line);
}

say('=== V1.0 矿脉远征全矿区 Seed 抽检（每矿区 ' + count + ' 张） ===');
for (const mineId of mineIds) {
  let invalid = 0;
  let featureMissing = 0;
  let legalClearFailed = 0;
  let retried = 0;
  let repaired = 0;
  let fallback = 0;
  const repairReasons = {};
  const treasureCosts = [];

  for (let i = 0; i < count; i++) {
    const seed = 'V1-ALL-MINES-' + mineId + '-' + i;
    const generated = MM.Generator.generateValidated(seed, mineId);
    const map = generated.map;
    if (!generated.report.ok || !map.validated || map.w !== 9 || map.h !== 45) invalid++;
    if (generated.attempts > 1) retried++;
    if (generated.repairs > 0) repaired++;
    if (generated.repairs === -1) fallback++;
    (generated.notes || []).forEach((note) => {
      repairReasons[note.why] = (repairReasons[note.why] || 0) + 1;
    });

    if (mineId === 'resonanceCave'
        && !(map.resonanceStones || []).some((p) => map.get(p.x, p.y).specialType === 'resonanceStone')) featureMissing++;
    if (mineId === 'clockworkMine') {
      const gate = map.gate;
      const consoleCell = gate && map.get(gate.x, gate.y);
      const barrier = gate && map.get(gate.barrier.x, gate.barrier.y);
      if (!consoleCell || consoleCell.specialType !== 'gateConsole'
          || !barrier || barrier.specialType !== 'gateBarrier'
          || !(gate.path || []).length) featureMissing++;
    }
    if (mineId === 'sealedVault'
        && (!map.gate || !(map.resonanceStones || []).length || (map.workbenches || []).length !== 2)) featureMissing++;

    const cost = generated.report.stats && generated.report.stats.treasureCost;
    if (Number.isFinite(cost)) treasureCosts.push(cost);

    const clear = MM.Simulator.legalClear(map);
    if (!clear || !clear.ok) legalClearFailed++;
  }

  totalFailure += invalid + featureMissing + legalClearFailed + fallback;
  const minCost = treasureCosts.length ? Math.min.apply(null, treasureCosts) : 'n/a';
  const maxCost = treasureCosts.length ? Math.max.apply(null, treasureCosts) : 'n/a';
  say(mineId + ': 有效 ' + (count - invalid) + '/' + count
    + ' · 特征缺失 ' + featureMissing
    + ' · 合法通关失败 ' + legalClearFailed
    + ' · 重试 ' + retried + ' · 局部修正 ' + repaired + ' · 兜底 ' + fallback
    + ' · 藏宝库理论成本 [' + minCost + ', ' + maxCost + ']'
    + (Object.keys(repairReasons).length ? ' · 修正项 ' + JSON.stringify(repairReasons) : ''));
}

say(totalFailure ? '❌ 发现问题：' + totalFailure + ' 项' : '✅ 全部矿区通过结构、特色内容与合法通关检查');
const outPath = path.resolve(__dirname, '../artifacts/release-1.15.0/mine-seed-sweep.txt');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, report.join('\n') + '\n', 'utf8');
console.log('报告已写入 ' + path.relative(ROOT, outPath));
process.exit(totalFailure ? 1 : 0);
