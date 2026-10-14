/* 局内状态（设计规格 §68 / §69）：
 * 一个 miningRun 对象装下这一局的一切；主阶段全部走 state 状态机，
 * 不用几十个互相冲突的 Boolean（§69）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const S = {
    GENERATING: 'GENERATING',
    ENTERING: 'ENTERING',
    EXPLORING: 'EXPLORING',
    MOVING: 'MOVING',
    DIGGING: 'DIGGING',
    ROOM_DISCOVERY: 'ROOM_DISCOVERY',
    TREASURE_DISCOVERY: 'TREASURE_DISCOVERY',
    EXTRACTING: 'EXTRACTING',
    RESULT: 'RESULT',
  };

  MM.State = {
    S,

    createRun(seed) {
      const B = MM.BALANCE;
      return {
        seed: String(seed),
        runId: 'R' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffffff).toString(36),

        playerX: 4,
        playerY: 0,
        currentDepth: 0,
        maxDepthReached: 0,

        stamina: B.START_STAMINA,
        maxStamina: B.MAX_STAMINA,

        baseValue: 0,
        mineValue: 0,          // V0.7：只由"实际挖出的矿物"累计（采矿进度）
        otherValue: 0,         // 宝箱 / 藏宝库 / 调试等非采矿价值
        resources: { copper: 0, silver: 0, gold: 0, crystal: 0 },
        materials: { copper: 0, silver: 0, gold: 0, crystal: 0 }, // 可制作矿料；与累计价值分开
        crafted: {},
        upgrades: [],
        upgradeUses: {},
        trackedRecipe: null,
        challengeMode: null,
        challengeParams: {},
        relicTarget: null,
        roomChoices: {},

        tools: {
          bomb: B.START_TOOLS.bomb,
          powerPick: B.START_TOOLS.powerPick,
          lamp: B.START_TOOLS.lamp,
        },

        lampDigsRemaining: 0,
        freeDig: false,

        roomsFound: [],
        chestsOpened: 0,
        treasureReached: false,
        mysteryFound: false,

        /* V0.7（试玩反馈）：本局补给档位（t1 自动；t2/t3 玩家三选一）与"当前发现" */
        supplies: { t1: false, t2: null, t3: null },
        discoveries: [],

        state: S.ENTERING,
        move: null,             // MOVING 阶段：{ kind, path, i, t, dur }
        action: null,           // DIGGING 阶段：{ kind:'dig'|'bomb', ... }
        pendingDiscovery: null, // 挖到隐藏房后，等本次移动结束再播发现提示
        pendingTreasure: false,
        pendingSpring: null,
        pendingGate: false,
        pendingWorkbench: false,
        pendingRoomChoice: null,
        tutorialRun: false,

        settled: false,
        summary: null,
        recordAnnounced: false,
        exhaustedHint: false,

        stats: {
          digActions: 0,        // 主动挖掘次数（每块岩壁 1 次）
          excavatedCells: 0,    // 总挖开格数（含炸药）
          freeDigsUsed: 0,
          bombsUsed: 0,
          picksUsed: 0,
          lampsUsed: 0,
          chainOreCells: 0,
          craftsMade: 0,
          salvagedMaterials: 0,
          minerals: 0,
          spentStamina: 0,
          cartRides: 0,
          drillUses: 0,
          drillStaminaSaved: 0,
          recoveryPicks: 0,
          recoveryOreEvents: 0,
          afterglowRooms: 0,
          afterglowStaminaRestored: 0,
          lensHints: 0,
          bombOreEvents: 0,
          directionalBlastWalls: 0,
        },

        /* 掉落 / 泉水等"局内随机"单独一条随机流：
         * 与地图生成解耦，玩家操作不会影响其他局的生成结果。 */
        rngLoot: MM.RNG.create(String(seed) + '#loot'),
      };
    },
  };
})();
