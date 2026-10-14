/* 新手引导状态与固定开场矿段。正式地图素材仍由 MiningArt 绘制。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});
  const KEY = 'forgotten-tower.mining.tutorial.v2';

  function wasCompleted() {
    try { return localStorage.getItem(KEY) === '1'; }
    catch (e) { return false; }
  }

  function remember() {
    try { localStorage.setItem(KEY, '1'); }
    catch (e) { /* 存储不可用时，本局仍可正常完成教程。 */ }
  }

  function cellAt(map, point) {
    return point && map ? map.get(point.x, point.y) : null;
  }

  MM.Tutorial = {
    KEY,

    create(force) {
      const show = !!force || !wasCompleted();
      return {
        open: show,
        guided: show,
        page: 0,
        completed: !show,
        authored: show,
        step: show ? 'soft' : 'done',
        intro: null,
      };
    },

    /* 首次教学局把入口附近整理成短而确定的练习段，之后接回本局随机地图。 */
    prepareMap(map, run, state) {
      if (!map || !state || !state.authored || map.h < 8 || map.w < 5) return;
      const x = MM.U.clamp(map.entrance ? map.entrance.x : run.playerX, 1, map.w - 2);
      const p = {
        soft: { x, y: 1 },
        ore: { x, y: 2 },
        detour: { x: x - 1, y: 2 },
        descent: { x, y: 3 },
        workbench: { x, y: 4 },
      };
      map.forEach((cell) => {
        if (cell.specialType === 'workbench') {
          cell.specialType = null;
          cell.specialGranted = false;
        }
      });
      const clearCell = (point, terrain, resourceType, specialType) => {
        const cell = cellAt(map, point);
        if (!cell) return null;
        cell.excavated = false;
        cell.revealed = false;
        cell.terrainType = terrain;
        cell.digCost = MM.TERRAIN[terrain].digCost;
        cell.resourceType = resourceType || null;
        cell.resourceValue = resourceType ? MM.RESOURCES[resourceType].value : 0;
        cell.resourceGranted = false;
        cell.clueType = null;
        cell.roomId = null;
        cell.branchId = null;
        cell.specialType = specialType || null;
        cell.specialGranted = false;
        return cell;
      };

      clearCell(p.soft, 'dirt');
      clearCell(p.ore, 'dirt', 'copper');
      clearCell(p.detour, 'rock', 'silver');
      clearCell(p.descent, 'dirt');
      const bench = clearCell(p.workbench, 'dirt', null, 'workbench');
      if (bench) map.workbench = { x: bench.x, y: bench.y };

      /* 入口下面保留一格可走通道；不改动更深处的随机房间与主路线。 */
      const connector = map.get(x, 5);
      if (connector && !connector.roomId && !connector.specialType) {
        connector.terrainType = 'dirt';
        connector.digCost = MM.TERRAIN.dirt.digCost;
        connector.resourceType = null;
        connector.resourceValue = 0;
        connector.clueType = null;
        connector.branchId = null;
      }
      state.intro = p;
    },

    advance(state) {
      if (!state || !state.open) return;
      if (state.page < 2) state.page++;
      else state.open = false;
    },

    skip(state) {
      if (!state) return;
      state.open = false;
      state.guided = false;
      state.completed = true;
      state.step = 'done';
      remember();
    },

    onExcavated(state, cell) {
      if (!state || !state.guided || state.completed || !cell || !state.intro) return null;
      const p = state.intro;
      if (state.step === 'soft' && cell.x === p.soft.x && cell.y === p.soft.y) {
        state.step = 'ore';
        return { message: '路打通了。矿物既增加采矿进度，也会留下可制作的本局矿料。' };
      }
      if (state.step === 'ore' && cell.x === p.ore.x && cell.y === p.ore.y) {
        state.step = 'choice';
        return { message: '现在可直接向下，或多花体力挖左侧银矿；选一条路继续到工作台。' };
      }
      if (state.step === 'choice'
          && ((cell.x === p.descent.x && cell.y === p.descent.y)
            || (cell.x === p.detour.x && cell.y === p.detour.y))) {
        state.step = 'workbench';
        return { message: '路线由你决定。沿已挖开的路继续向下，找到工作台制作一件改造。' };
      }
      if (state.step === 'workbench' && cell.x === p.workbench.x && cell.y === p.workbench.y) {
        return { message: '工作台已显露：在弹窗中制作一件改造，再回到地图使用工具。' };
      }
      return null;
    },

    onWorkbenchOpened(state) {
      if (state && state.guided && !state.completed) state.step = 'craft';
    },

    onCrafted(state) {
      if (state && state.guided && !state.completed) state.step = 'tool';
    },

    onToolUsed(state) {
      if (!state || !state.guided || state.completed || state.step !== 'tool') return false;
      state.guided = false;
      state.completed = true;
      state.step = 'done';
      remember();
      return true;
    },

    targets(state, map, run) {
      if (!state || !state.guided || !state.intro || !map) return [];
      const p = state.intro;
      let points = [];
      if (state.step === 'soft') points = [p.soft];
      else if (state.step === 'ore') points = [p.ore];
      else if (state.step === 'choice') points = [p.descent, p.detour];
      else if (state.step === 'workbench') {
        const center = cellAt(map, p.ore);
        const descent = cellAt(map, p.descent);
        const bench = cellAt(map, p.workbench);
        if (center && !center.excavated) points = [p.ore];
        else if (descent && !descent.excavated
            && MM.U.manhattan(run.playerX, run.playerY, descent.x, descent.y) > 1) points = [p.ore];
        else if (descent && !descent.excavated) points = [p.descent];
        else if (bench && !bench.excavated) points = [p.workbench];
      }
      return points.map((point) => cellAt(map, point))
        .filter((cell) => cell && cell.revealed);
    },

    guideText(state, map, run) {
      if (!state || !state.guided) return '';
      const targets = this.targets(state, map, run);
      if (state.step === 'soft') return '第 1 步：挖开矿工前方的松土，进入矿道';
      if (state.step === 'ore') return '第 2 步：挖出铜矿；它同时增加进度并成为制作材料';
      if (state.step === 'choice') return '第 3 步：选择直下的低成本路线，或挖左侧银矿绕路';
      if (state.step === 'workbench') {
        return targets.length ? '第 4 步：沿已挖道路前往工作台，途中挖矿可补足材料'
          : '第 4 步：继续沿主路向下，寻找工作台';
      }
      if (state.step === 'craft') return '第 5 步：在工作台选择可制作的改造';
      if (state.step === 'tool') return '第 6 步：使用一件工具，完成开场教学';
      return '';
    },

    isCompleted: wasCompleted,
  };
})();
