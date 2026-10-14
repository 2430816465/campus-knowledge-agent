'use strict';

// Normal-input chapter-one route simulations. These deliberately begin at the
// authored spawns and use the same authoritative physics as the server.
const assert = require('node:assert/strict');
const Game = require('../src/game-shared.js');
const DT = 1 / 60;

function toward(input, x, target, stop = 12) {
  if (x < target - stop) input.right = true;
  else if (x > target + stop) input.left = true;
}

function tap(input, condition, tick) {
  if (condition && tick % 18 === 0) input.interact = true;
}

function holdInteract(input, condition) {
  if (condition) input.interact = true;
}

function jumpPulse(input, player, tick, enabled = true) {
  if (enabled && player.grounded && tick % 24 === 0) input.jump = true;
}

// The same input routes are used by the WebSocket harness, where clients only
// sample server snapshots every few simulation ticks. Keep a short jump window
// so the harness cannot skip a one-tick pulse between snapshots.
function routedJump(input, player, tick, enabled = true) {
  if (enabled && player.grounded && tick % 30 < 6) {
    input.jump = true;
    input.jumpPressed = true;
  }
}

const level5RouteState = { lastTick: -1, climb: [0, 0], carryStage: 0 };

function onLift(player, lift) {
  return player.grounded && Math.abs(player.y + Game.PHYSICS.playerHeight - lift.y) < 10 &&
    player.x + Game.PHYSICS.playerWidth > lift.x && player.x < lift.x + lift.w;
}

function vaultBox(input, player, box) {
  const width = Game.PHYSICS.playerWidth;
  const feet = player.y + Game.PHYSICS.playerHeight;
  if (player.x > box.x + box.w + 8) return false;
  if (player.grounded && Math.abs(feet - box.y) < 6) {
    input.right = true;
    return true;
  }
  if (player.x + width < box.x - 3) {
    input.right = true;
    return true;
  }
  if (feet > box.y - 8) {
    if (player.grounded) input.jump = true;
    return true;
  }
  input.right = true;
  return true;
}

function chapterOneFinale(world, index, tick) {
  const p = world.players[index], input = {};
  if (world.roomIndex === 0) {
    if (index === 0 && !world.flags.upperRune) {
      input.right = p.x < 322;
      holdInteract(input, Math.abs(p.x - 322) < 38);
    } else if (index === 1 && world.flags.lowerBridge && !world.flags.lowerRune) {
      input.right = p.x < 770;
      holdInteract(input, Math.abs(p.x - 770) < 44);
    } else if (world.flags.lowerRune) input.right = p.x < 1190;
    return input;
  }

  const lift = world.lifts[0];
  const box = world.boxes[0];
  if (index === 0) {
    if (!world.flags.cratePower) {
      // Stop the ordinary push at the center of the authored board. The
      // player must not run through and momentarily impersonate the box.
      input.right = box.x < 405;
      return input;
    }
    // The crate must remain on the plate while the partner rides up, calls
    // the lift down, and opens the top switch. Only then does player 1 cross.
    if (world.flags.topSwitch && lift.target === lift.top && lift.y <= lift.top + 3) {
      input.right = p.x < 1190;
      return input;
    }
    if (!world.flags.topSwitch || Math.abs(lift.y - lift.bottom) > 3 || lift.target !== lift.bottom) return input;
    if (vaultBox(input, p, box)) return input;
    if (p.x < lift.x - 18) {
      input.right = true;
      input.jump = p.grounded && p.x >= lift.x - 100;
    } else if (onLift(p, lift)) holdInteract(input, true);
    return input;
  }

  if (!world.flags.cratePower) return input;
  const feet = p.y + Game.PHYSICS.playerHeight;
  const onUpperFloor = feet < lift.bottom - 100;
  if (!onUpperFloor) {
    if (lift.target === lift.top || lift.y < lift.bottom - 3) return input;
    if (vaultBox(input, p, box)) return input;
    if (p.x < lift.x - 18) {
      input.right = true;
      input.jump = p.grounded && p.x >= lift.x - 100;
    } else if (onLift(p, lift)) holdInteract(input, lift.target === lift.bottom);
    return input;
  }

  // From the fixed upper landing, move to a reliable interaction point on
  // the lift, call it down once, then reach and activate the top switch.
  if (lift.target === lift.top && lift.y > lift.top + 3) return input;
  if (lift.y <= lift.top + 3 && lift.target === lift.top && p.x < lift.x + 119) {
    if (p.x < lift.x + 119) input.right = true;
    return input;
  }
  if (lift.target === lift.top && Math.abs(lift.y - lift.top) <= 3 && !world.flags.topSwitch) {
    if (p.x > lift.x + 126) input.left = true;
    else holdInteract(input, p.x >= lift.x + 90);
    return input;
  }
  if (!world.flags.topSwitch) {
    input.right = p.x < 950;
    holdInteract(input, Math.abs(p.x - 950) < 42);
    return input;
  }
  input.right = p.x < 1190;
  return input;
}

function run(levelIndex, controller, maxTicks = 6000) {
  const world = Game.createWorld(levelIndex, 1);
  for (let tick = 0; tick < maxTicks && world.phase === 'playing'; tick += 1) {
    const inputs = world.players.map((player, index) => controller(world, index, tick) || {});
    if (process.env.ROUTE_DETAIL === String(levelIndex + 1) && tick % 20 === 0) {
      console.log('detail', tick, JSON.stringify({ inputs: inputs.map(i => [!!i.left, !!i.right, !!i.jump, !!i.interact]),
        players: world.players.map(p => [Math.round(p.x), Math.round(p.y), p.grounded]),
        flags: [world.flags.upperBridge, world.flags.routeLocked, world.flags.exitPower],
        boxes: world.boxes.map(b => [Math.round(b.x), Math.round(b.y)]),
        lifts: world.lifts.map(l => [Math.round(l.y), Math.round(l.target)]) }));
    }
    Game.stepWorld(world, inputs, DT);
    if (levelIndex === 3 && world.flags.routeLocked) {
      const activeStairs = Game.stageFor(world).bridges.filter(bridge => Game.bridgeIsActive(bridge, world));
      world.__routeUsedReturnStairs = world.__routeUsedReturnStairs || [];
      activeStairs.forEach(stair => {
        const helper = world.players[1];
        if (helper.grounded && Math.abs(helper.y + Game.PHYSICS.playerHeight - stair.y) < 2 &&
          helper.x + Game.PHYSICS.playerWidth > stair.x && helper.x < stair.x + stair.w &&
          !world.__routeUsedReturnStairs.includes(stair.id)) world.__routeUsedReturnStairs.push(stair.id);
      });
    }
    if (process.env.ROUTE_TRACE === String(levelIndex + 1) && tick % 120 === 0) {
      console.log('trace', tick, world.players.map(p => [Math.round(p.x), Math.round(p.y), p.grounded]), world.flags,
        world.boxes.map(b => [Math.round(b.x), Math.round(b.y)]), world.lifts.map(l => [Math.round(l.y), Math.round(l.target)]));
    }
  }
  if (world.phase !== 'intermission') console.error('Route state', levelIndex + 1, JSON.stringify({
    players: world.players.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), grounded: p.grounded })),
    flags: world.flags, plates: world.plates, boxes: world.boxes.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), socketId: b.socketId })),
    lifts: world.lifts.map(l => ({ id: l.id, y: Math.round(l.y), target: l.target })), message: world.message
  }));
  assert.equal(world.phase, 'intermission', 'level ' + (levelIndex + 1) + ' is normally completable');
  if (levelIndex === 3) {
    assert.equal(world.flags.routeLocked, true, 'level 4 return stairs were unlocked');
    assert.equal(world.flags.liftPower, false, 'level 4 crate left its first board');
    assert.equal(world.flags.exitPower, true, 'level 4 crate powers the exit board');
    assert.deepEqual([...(world.__routeUsedReturnStairs || [])].sort(),
      ['return-stair-1', 'return-stair-2', 'return-stair-3'], 'the lift rider returned along all three stair colliders');
    assert.equal(Math.abs(world.lifts[0].y - world.lifts[0].top) < 2, true, 'the first lift carried a player to the upper switch');
  }
  return world;
}

const controllers = {
  3: (world, index, tick) => {
    const p = world.players[index], input = {}, lift = world.lifts[0];
    if (index === 0) {
      if (!world.flags.routeLocked) return {};
      if (!world.flags.exitPower) input.right = true;
      else { input.right = true; input.jump = p.grounded; }
      return input;
    }
    if (!world.flags.routeLocked) {
      if (lift.y > lift.top + 4 || lift.target !== lift.top) {
        const onLift = p.grounded && Math.abs(p.y + Game.PHYSICS.playerHeight - lift.y) < 10;
        if (onLift) {
          if (lift.target === lift.bottom) tap(input, true, tick);
        } else if (p.x < 440) input.right = true;
        else if (p.x < 500) { input.right = true; input.jump = p.grounded; }
        else if (p.y > 400) { input.right = true; input.jump = p.grounded; }
      } else {
        toward(input, p.x, 620);
        tap(input, Math.abs(p.x - 620) < 34 && Math.abs(p.y + Game.PHYSICS.playerHeight - lift.y) < 10, tick);
      }
      return input;
    }
    if (world.flags.exitPower) toward(input, p.x, 1170);
    return input;
  },
  4: (world, index, tick) => {
    const p = world.players[index], input = {};
    if (tick < level5RouteState.lastTick) {
      level5RouteState.climb = [0, 0];
      level5RouteState.carryStage = 0;
    }
    level5RouteState.lastTick = tick;
    if (index === 0) {
      if (!world.flags.upperBridge && !world.flags.routeLocked) return {};
      if (world.flags.routeLocked) {
        input.right = p.x < 1190;
        input.jump = p.grounded && p.x > 850 && p.x < 970;
      } else {
        const climb = level5RouteState.climb;
        if (p.grounded && climb[index] < 3) climb[index] = p.y > 500 ? 0 : (p.y > 420 ? 1 : (p.y > 340 ? 2 : 3));
        if (climb[index] === 0) {
          if (p.grounded) {
            // Stop well before the edge of the overhead stair. The WebSocket
            // harness samples inputs between server ticks, so a tight x=174
            // threshold can drift into the platform's underside before takeoff.
            input.right = p.x < 140;
            routedJump(input, p, tick, p.x >= 140);
          } else if (p.y < 444) input.right = p.x < 258;
        } else if (climb[index] === 1) {
          if (p.grounded) {
            input.left = p.x > 234;
            routedJump(input, p, tick, p.x <= 234);
          } else if (p.y < 378) input.right = p.x < 250;
        } else if (climb[index] === 2) {
          if (p.grounded) {
            input.right = p.x < 300;
            routedJump(input, p, tick, p.x >= 300);
          } else if (p.y < 294) input.right = p.x < 400;
        } else {
          input.right = p.x < 890;
          tap(input, Math.abs(p.x + 18 - 873) < 66, tick);
        }
      }
      return input;
    }
    if (!world.flags.routeLocked) {
      if (!world.flags.upperBridge) input.right = p.x < 600;
      return input;
    }
    // After the first player locks both bridges, the island player climbs the
    // authored three-step route, drops beside X, and pushes it onto P3.
    let stage = level5RouteState.carryStage;
    const feet = p.y + Game.PHYSICS.playerHeight;
    if (stage === 0) {
      if (p.grounded && Math.abs(feet - 510) < 3) stage = 1;
      else if (p.grounded && feet > 540) {
        if (p.x < 540) input.right = true;
        else routedJump(input, p, tick, true);
      } else if (!p.grounded && feet <= 510) input.right = p.x < 595;
    } else if (stage === 1) {
      if (p.grounded && Math.abs(feet - 430) < 3) stage = 2;
      else if (p.grounded && Math.abs(feet - 510) < 3) routedJump(input, p, tick, true);
      else if (!p.grounded && feet <= 430) input.right = p.x < 710;
    } else if (stage === 2) {
      if (p.grounded && feet > 580 && p.x > 800) stage = 3;
      else if (p.grounded && Math.abs(feet - 430) < 3) input.right = true;
      else if (!p.grounded) input.right = p.x < 820;
    } else if (stage === 3) {
      input.right = p.x < 1190;
    }
    level5RouteState.carryStage = stage;
    return input;
  },
  5: (world, index, tick) => {
    const p = world.players[index], input = {}, box = world.boxes[0];
    if (index === 0) {
      if (!world.flags.returnLocked) return {};
      if (!world.flags.finishPower) {
        input.right = true;
        return input;
      }
      input.right = p.x < 1190;
      input.jump = p.grounded && p.x >= box.x - 76 && p.x < box.x - 24;
      return input;
    }
    if (!world.flags.returnLocked) {
      input.right = p.x < 560;
      tap(input, Math.abs(p.x + 18 - 600) < 56, tick);
      return input;
    }
    if (!world.flags.finishPower) return {};
    input.right = p.x < 1190;
    input.jump = p.grounded && p.x > 880 && p.x < 1020;
    return input;
  },
  6: (world, index, tick) => {
    const p = world.players[index], input = {}, lift = world.lifts[0], box = world.boxes[0];
    if (index === 0) {
      if (!world.flags.routeLocked) {
        if (box.y < 500) input.right = box.x < 520;
        else tap(input, Math.abs(p.x + 18 - 461) < 58 && p.y < 400, tick);
      } else {
        if (Math.abs(lift.y - lift.top) < 5 && lift.target === lift.top) {
          input.right = p.x < 1190;
          input.jump = p.grounded && p.x >= 470 && p.x < 520;
        }
      }
      return input;
    }
    if (!world.flags.routeLocked || !world.flags.liftPower || box.y < 500) return {};
    const aboard = onLift(p, lift);
    if (Math.abs(lift.y - lift.top) > 4) {
      if (!aboard) {
        input.right = p.x < lift.x + 24;
        input.jump = p.grounded && p.x >= lift.x - 160 && p.x < lift.x - 80;
      } else if (lift.target === lift.bottom) input.interact = true;
      return input;
    }
    input.right = p.x < 1190;
    return input;
  },
  7: (world, index, tick) => {
    const p = world.players[index], input = {}, lift = world.lifts[0], box = world.boxes[0];
    if (index === 0) {
      if (box.y < 530) return {};
      if (Math.abs(lift.y - lift.top) < 5 && lift.target === lift.top && p.y < 400) {
        input.right = p.x < 1190;
        return input;
      }
      if (p.x < 320) {
        input.right = true;
        input.jump = p.grounded && p.x >= 200 && p.x < 240;
        return input;
      }
      if (p.x < 550) { input.right = true; return input; }
      if (!world.flags.routeLocked || Math.abs(lift.y - lift.bottom) > 5 || lift.target !== lift.bottom) return {};
      if (!onLift(p, lift)) {
        input.right = p.x < 570;
        input.jump = p.grounded && p.x >= 530 && p.x <= 566;
      } else if (lift.target === lift.bottom) {
        if (p.x < lift.x + 18) input.right = true;
        else input.interact = true;
      }
      if (Math.abs(lift.y - lift.top) < 5 && lift.target === lift.top) input.right = p.x < 1190;
      return input;
    }
    if (!world.__l8P1AtTop) {
      if (!onLift(p, lift)) {
        input.right = p.x < 700;
        input.jump = p.grounded && p.x >= 520 && p.x <= 550;
      } else if (lift.target === lift.bottom) input.interact = true;
      if (Math.abs(lift.y - lift.top) < 5 && p.y < 400) world.__l8P1AtTop = true;
      return input;
    }
    if (box.x > 246 && box.y < 530) { input.left = true; return input; }
    if (box.y < 530) return input;
    if (lift.target === lift.top && p.x < 820) {
      input.right = p.x < 770;
      tap(input, Math.abs(p.x + 18 - 787) < 52 && p.y < 400, tick);
      return input;
    }
    if (!world.flags.routeLocked) {
      input.right = p.x < 1190;
      tap(input, Math.abs(p.x + 18 - 931) < 60 && p.y < 400, tick);
    } else input.right = p.x < 1190;
    return input;
  },
  8: (world, index, tick) => {
    const p = world.players[index], input = {};
    if (index === 0) {
      if (!world.flags.dualLocked) return {};
      if (!world.plates['finish-board']) input.right = true;
      else { input.right = true; jumpPulse(input, p, tick); }
      return input;
    }
    if (!world.flags.dualLocked) {
      input.right = p.x < 640;
      jumpPulse(input, p, tick, p.x > 110 && p.x < 240);
      tap(input, Math.abs(p.x + 18 - 670) < 58 && p.y > 500, tick);
      return input;
    }
    if (world.flags.p3) { input.right = true; jumpPulse(input, p, tick); }
    return input;
  },
  9: chapterOneFinale
};

const requested = process.argv.slice(2).map((value) => Number(value) - 1);
const levels = requested.length ? requested : [3, 4, 5, 6, 7, 8];
if (require.main === module) {
  for (const levelIndex of levels) {
    assert.equal(typeof controllers[levelIndex], 'function', 'level ' + (levelIndex + 1) + ' has a route controller');
    const result = run(levelIndex, controllers[levelIndex], 12000);
    if (levelIndex === 9) assert.equal(result.roomIndex, 1, 'level 10 completed both authored rooms');
    console.log('Normal-input route passed for level ' + (levelIndex + 1) + '.');
  }
}

module.exports = { controllers, run };
