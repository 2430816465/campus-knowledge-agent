'use strict';

const assert = require('node:assert/strict');
const Game = require('../games/coop/src/game-shared.js');

assert.equal(Game.LEVELS.length, 50, 'runtime campaign has exactly 50 levels');
const errors = [];
const entityGroups = ['platforms', 'gates', 'plates', 'switches', 'bridges', 'boxes', 'lifts', 'hazards', 'charges', 'sockets', 'oneWayGates'];

function inspectStage(level, label) {
  for (const group of entityGroups) {
    const ids = (level[group] || []).map(item => item.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push(label + ': duplicate id in ' + group);
  }

  const plateIds = new Set((level.plates || []).map(item => item.id));
  const liftIds = new Set((level.lifts || []).map(item => item.id));
  const socketIds = new Set((level.sockets || []).map(item => item.id));
  const flagKeys = new Set(Object.keys(level.flags || {}));
  (level.plates || []).forEach(item => { if (item.key) flagKeys.add(item.key); });
  (level.switches || []).forEach(item => {
    if (item.key) flagKeys.add(item.key);
    (item.keys || []).forEach(key => flagKeys.add(key));
    if (item.opens) flagKeys.add(item.opens);
  });
  (level.bridges || []).forEach(item => { if (item.key) flagKeys.add(item.key); });
  (level.charges || []).forEach(item => { if (item.key) flagKeys.add(item.key); });
  (level.sockets || []).forEach(item => { if (item.key) flagKeys.add(item.key); });
  (level.oneWayGates || []).forEach(item => { if (item.unlockKey) flagKeys.add(item.unlockKey); });
  (level.gates || []).forEach(item => { if (item.lockKey) flagKeys.add(item.lockKey); });

  (level.gates || []).forEach(gate => {
    (gate.plates || []).forEach(id => { if (!plateIds.has(id)) errors.push(label + ': gate ' + gate.id + ' references missing plate ' + id); });
    [...(gate.any || []), ...(gate.key && !['plate', 'switch'].includes(gate.key) ? [gate.key] : [])].forEach(key => {
      if (!flagKeys.has(key)) errors.push(label + ': gate ' + gate.id + ' references missing flag ' + key);
    });
  });
  (level.switches || []).forEach(sw => {
    (sw.requires || []).forEach(key => { if (!flagKeys.has(key)) errors.push(label + ': switch ' + sw.id + ' requires missing flag ' + key); });
    if (sw.liftId && !liftIds.has(sw.liftId)) errors.push(label + ': switch ' + sw.id + ' references missing lift ' + sw.liftId);
    if (sw.socketId && !socketIds.has(sw.socketId)) errors.push(label + ': switch ' + sw.id + ' references missing socket ' + sw.socketId);
  });
  (level.lifts || []).forEach(lift => {
    for (const key of Array.isArray(lift.poweredBy) ? lift.poweredBy : [lift.poweredBy]) {
      if (key && !flagKeys.has(key)) errors.push(label + ': lift ' + lift.id + ' references missing power flag ' + key);
    }
  });
  (level.charges || []).forEach(node => (node.poweredBy || []).forEach(key => {
    if (!flagKeys.has(key)) errors.push(label + ': charge ' + node.id + ' references missing power flag ' + key);
  }));
  (level.carryOut || []).forEach(item => {
    if (!(level.boxes || []).some(box => box.id === item.id)) errors.push(label + ': carryOut references missing box ' + item.id);
  });
  (level.carryBoxes || []).forEach(id => {
    if (!(level.boxes || []).some(box => box.id === id)) errors.push(label + ': carryBoxes references missing box ' + id);
  });

  for (const group of entityGroups) {
    (level[group] || []).forEach(item => {
      if (typeof item.x !== 'number' || typeof item.y !== 'number') errors.push(label + ': ' + group + ' entity lacks numeric position');
      if (item.w != null && item.x + item.w > Game.VIEW.width + 0.01) errors.push(label + ': ' + group + ' entity exceeds right edge');
      if (item.h != null && item.y + item.h > Game.VIEW.height + 0.01) errors.push(label + ': ' + group + ' entity exceeds bottom edge');
    });
  }
}

Game.LEVELS.forEach((campaign, index) => {
  assert.equal(campaign.id, index + 1, 'campaign IDs remain sequential');
  const stages = campaign.rooms || [campaign];
  assert.ok(stages.length <= 3, 'level ' + campaign.id + ' has at most three rooms');
  stages.forEach((stage, roomIndex) => inspectStage(stage, String(campaign.id).padStart(2, '0') + '/' + (roomIndex + 1)));
});

assert.deepEqual(errors, [], 'campaign has no duplicate entity IDs, unresolved references, or out-of-bounds entities');
console.log('Campaign data validation passed: 50 levels, ' + Game.LEVELS.reduce((sum, level) => sum + (level.rooms ? level.rooms.length : 1), 0) + ' playable stages; IDs, references, bounds, and room cap are valid.');
