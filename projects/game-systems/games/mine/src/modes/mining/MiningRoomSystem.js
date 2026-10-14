/* 隐藏房系统（设计规格 §30～§41）：
 * 隐藏房是"真实存在于地图中的区域"，玩家必须挖过去（§30）；
 * V0.1 只处理：废弃矿工仓库（宝箱）+ 地下泉。
 * 宝箱内容用 run.rngLoot（独立随机流）决定，保证同一 Seed 下开局随机流不受玩家操作干扰。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Rooms = {
    def(id) { return MM.ROOMS[id] || null; },

    /* 宝箱 / 宝匣统一入口（§32 木箱 / §38 碎石宝匣 / §39 遗失补给 / §40 神秘宝箱） */
    rollCache(run, profileId) {
      const p = MM.CACHE_PROFILES[profileId] || MM.CACHE_PROFILES.supplyChest;
      const rng = run.rngLoot;
      const value = p.value + rng.nextInt(p.vary + 1);
      MM.Resources.addValue(run, value, 'cache');
      let toolId = null;
      if (p.tools > 0) {
        toolId = rng.weighted(MM.SUPPLY_CHEST_DROP_WEIGHTS);
        run.tools[toolId] = (run.tools[toolId] || 0) + p.tools;
      }
      run.chestsOpened++;
      if (p.mystery) run.mysteryFound = true;
      return { profile: profileId, name: p.name, value, toolId, toolCount: p.tools };
    },

    /* 某格被挖开时统一触发（由 DigSystem 调用） */
    onCellExcavated(run, map, cell, events) {
      /* 房间首次发现 */
      if (cell.roomId && run.roomsFound.indexOf(cell.roomId) === -1) {
        run.roomsFound.push(cell.roomId);
        events.push({ type: 'roomFound', roomId: cell.roomId, name: (MM.ROOMS[cell.roomId] || {}).name || cell.roomId });
        if (cell.roomId !== 'treasure' && run.lampDigsRemaining > 0
            && MM.Upgrades && MM.Upgrades.has(run, 'afterglowWick')
            && (run.stats.afterglowRooms || 0) < (MM.UPGRADE_USE_LIMITS.afterglowWick || 3)) {
          const before = run.stamina;
          run.stamina = Math.min(run.maxStamina, run.stamina + 2);
          run.stats.afterglowRooms = (run.stats.afterglowRooms || 0) + 1;
          const restored = run.stamina - before;
          run.stats.afterglowStaminaRestored = (run.stats.afterglowStaminaRestored || 0) + restored;
          events.push({ type: 'afterglowHeal', amount: restored, roomId: cell.roomId,
            remaining: Math.max(0, (MM.UPGRADE_USE_LIMITS.afterglowWick || 3) - run.stats.afterglowRooms) });
        }
      }

      /* 地下泉先保存本眼的恢复量，交给玩家决定现在使用或留待之后。 */
      if (cell.specialType === 'spring' && !cell.specialGranted) {
        cell.specialGranted = true;
        cell.springHeal = cell.springHeal || run.rngLoot.rangeInt(MM.SPRING_HEAL.min, MM.SPRING_HEAL.max);
        cell.springFound = true;
        events.push({
          type: 'springFound',
          heal: cell.springHeal,
          x: cell.x, y: cell.y,
        });
      }

      /* 宝箱 / 宝匣（§32 / §38 / §39 / §40）：只开一次 */
      const cacheBySpecial = {
        chest: 'supplyChest',
        lostChest: 'lostChest',
        ruinCache: 'ruinCache',
        mysteryChest: 'mysteryChest',
      };
      const profile = cacheBySpecial[cell.specialType];
      if (profile && !cell.specialGranted) {
        cell.specialGranted = true;
        const loot = this.rollCache(run, profile);
        /* 遗物按来源固定，不再从任意神秘宝箱随机掉落。 */
        if (MM.Relics && cell.specialType === 'lostChest') loot.relic = MM.Relics.collect(run, 'oldLamp');
        if (MM.Relics && cell.specialType === 'mysteryChest') loot.relic = MM.Relics.collect(run, 'silverBell');
        events.push(Object.assign({ type: 'cache', roomId: cell.roomId, x: cell.x, y: cell.y }, loot));
      }

      /* 废弃仓库的旧补给箱改为一次性抉择：工具与价值，或制作材料。 */
      if (cell.specialType === 'warehouseChoice' && !cell.specialGranted) {
        cell.specialGranted = true;
        events.push({ type: 'warehouseChoice', roomId: cell.roomId, x: cell.x, y: cell.y });
      }

      if (cell.specialType === 'workbench' && !cell.specialGranted) {
        cell.specialGranted = true;
        events.push({ type: 'workbenchFound', x: cell.x, y: cell.y });
      }

      /* 机巧矿场控制台：发现时给出一次闸门处理选择。 */
      if (cell.specialType === 'gateConsole' && !cell.specialGranted) {
        cell.specialGranted = true;
        events.push({ type: 'gateConsoleFound', x: cell.x, y: cell.y });
      }

      /* 废弃矿车站（§36）：挖到矿车 → 弹出"乘坐 / 不乘坐"抉择 */
      if (cell.specialType === 'minecart') {
        events.push({ type: 'minecartFound', x: cell.x, y: cell.y });
      }
    },
  };
})();
