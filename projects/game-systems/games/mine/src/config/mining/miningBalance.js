/* MINING_BALANCE —— 地下矿坑全局平衡参数（设计规格 §65 / §66：改这一个文件就能快速重平衡）
 *
 * V0.2（§79）：9×20 → 9×45 正式尺寸 + 完整深度层 + 铜/银/金/水晶完整分布 + 体力平衡。
 * 两种尺寸都在 MAP_PRESETS 里，一套模块共用：
 *   full —— 9×45 正式矿坑（默认）
 *   v01  —— 9×20 快速测试矿坑（调试用 / 对照 V0.1）
 * 所有概率、体力、视野、工具效果、房间与奖励都从这里读取（数据驱动，§24 / §65）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.BALANCE = {
    BUILD: 'V1.0（矿脉远征）',
    RULE_VERSION: 4,

    WIDTH: 9,                 // §5：宽 9 格
    DEPTH: 45,                // §5 / §79：正式矿坑 9×45（默认预设）
    FULL_DEPTH: 45,

    DEFAULT_MAP: 'full',

    /* ── 地图预设（§79：V0.2 由 9×20 扩到 9×45，两套尺寸都保留） ── */
    MAP_PRESETS: {
      full: {
        id: 'full',
        name: '地下矿坑（9×45）',
        short: '9×45',
        WIDTH: 9, DEPTH: 45, DEPTH_LABEL: 44,   // V0.6：1 格 = 1m；入口 0m，最深 44m（统一标注）
        resourcePool: ['copper', 'silver', 'gold', 'crystal'],   // §79：完整矿物
        validator: {
          MID_DEPTH_METERS: 32,    // §20：验证"约 30～35m 区域"
          MID_DEPTH_BUDGET: 42,    // 该区域理论最低成本上限（初始 40 体力的合理比例）
          TREASURE_MIN_COST: 30,
          TREASURE_MAX_COST: 72,   // §20：杜绝"理论 80+ 的明显不可完成地图"
          MIN_MINERAL_CELLS: 50,
          HINT_START_METERS: 35,   // §43：约进入 35m 后出现藏宝库方向提示
        },
        /* §30：每局生成 2～4 个主要隐藏房（地下泉为体力主来源，§29 → 每局必出）；
         * 藏宝库独立必出（§42）。权重决定各房间的出现频率，神秘石室最稀有（§40）。 */
        roomPlan: {
          GUARANTEED: ['spring'],
          MIN_OTHER: 1, MAX_OTHER: 3,
          WEIGHTS: {
            supply: 2.5, goldenVein: 2.5, crystalCave: 2,
            minecart: 2, ruinVault: 2, lostSupplies: 2, mysteryRoom: 1,
          },
        },
      },
      v01: {
        id: 'v01',
        name: '测试矿坑（9×20）',
        short: '9×20',
        WIDTH: 9, DEPTH: 20, DEPTH_LABEL: 19,
        resourcePool: ['copper', 'gold'],                          // V0.1 对照：两种测试矿物
        validator: {
          MID_DEPTH_METERS: 14,
          MID_DEPTH_BUDGET: 30,
          TREASURE_MIN_COST: 10,
          TREASURE_MAX_COST: 60,
          MIN_MINERAL_CELLS: 24,
          HINT_START_METERS: 12,
        },
        /* 9×20 快速图保持 V0.1 的房间组合（地下泉 + 仓库）作为对照 */
        roomPlan: {
          GUARANTEED: ['spring'],
          MIN_OTHER: 1, MAX_OTHER: 1,
          WEIGHTS: { supply: 1 },
        },
        branches: false,   // 9×20 对照图不做 P2 岔路（保持 V0.1 形态）
      },
    },

    START_STAMINA: 40,        // §13
    MAX_STAMINA: 50,          // §13
    BASE_VISION: 3,           // §15：局部视野，曼哈顿距离 ≤ 3

    /* V0.6 规则：普通撤离与藏宝库都按基础探索价值结算，不再使用撤离倍率 */
    SETTLE_MULTIPLIER: 1.0,

    START_TOOLS: { bomb: 2, powerPick: 1, lamp: 1 },  // §28 起始工具数量示例

    TOOL: {
      BOMB_RADIUS_TYPE: 'cross',  // §25：目标格 + 上下左右，共最多 5 格
      BOMB_MAX_CELLS: 5,
      BOMB_RANGE: 5,              // 目标格与玩家的最大曼哈顿距离（V0.1 便利值，可调）
      FREE_PICK_USES: 1,          // §26：下一次成功挖掘不消耗体力
      LAMP_VISION: 5,             // §27：视野 3 → 5
      LAMP_DIGS: 5,               // §27：持续"接下来 5 次成功挖掘"（按次数，不按时间）
    },

    META_REWARD: {               // §47
      FIRST_TREASURE: 10,
      REPEAT_TREASURE: 2,
    },

    TREASURE_VALUE: 120,         // §45：抵达藏宝库直接获得的"大量探索价值"（V0.1 基准）

    ROOM_PLAN_V01: {             // §72：V0.1 房间计划（类型见 config/rooms.js）
      spring: 1,
      supply: 1,
      treasure: 1,
    },

    GENERATOR: {
      MAX_ATTEMPTS: 60,                  // §18⑨ / §76：生成失败允许换 seed 重来
      ROUTE_BANDS: 5,                    // §85：低成本矿道分 5 段（段内竖直，段间横向漂移）
      ROUTE_BAND_DRIFT: 2,               // 每段相对上一段最多漂移 2 列
      ROUTE_SOFTEN: { dirt: 94, rock: 5, hard: 1 },        // 主矿道经过的岩层权重（P2 微调，为插塞让出预算）
      NEAR_ROUTE_SOFTEN: { dirt: 85, rock: 14, hard: 1 },  // 主矿道相邻格的软化权重
      DEEP_SOFTEN_RATIO: 0.78,           // P3：最后 22% 深度再软化一档（给藏宝库路段留出可达余量）
      DEEP_ROUTE_SOFTEN: { dirt: 97, rock: 3, hard: 0 },
      BRANCH_MINERAL_BOOST: 1.4,         // §85：支路矿物概率加成
      BRANCH_TIER_BOOST: 0.45,           // §85：支路高价值矿物加权概率
      MINERAL_CHANCE_BY_LAYER: {         // 每格生成矿物的基础概率（按深度层）
        shallow: 0.16, rock: 0.20, deep: 0.22, old: 0.22, treasure: 0.26,
      },
      HINT_TRAIL_MIN: 3,                 // 提示格最少数量
      /* V0.6（P2）：可判断的岔路——直通矿道上的硬岩插塞 + 两条支线（低收益 / 高收益） */
      BRANCH_COUNT_MIN: 2,
      BRANCH_COUNT_MAX: 3,
      BRANCH_ROW_MIN_RATIO: 0.28,
      BRANCH_ROW_MAX_RATIO: 0.78,
      BRANCH_MIN_SEPARATION: 6,          // 两条岔路至少间隔的行数
      BRANCH_PLUG: 'rock',               // 直通插塞岩层（2 格）
      BRANCH_LOW_WEIGHTS: { dirt: 70, rock: 30, hard: 0 },   // 低收益支线岩层
      BRANCH_HIGH_WEIGHTS: { dirt: 30, rock: 55, hard: 15 }, // 高收益支线岩层（更贵）
      CLUE_MAX_ROUTE_DIST: 3,            // 房间线索必须在此距离内进入主矿道视野（§31 / P2）
      BRANCH_RUN_CAP: 8,                 // 主矿道连续泥土段上限（超过则插一格岩石，P2）
      BRANCH_ENTRY_COST_MAX: 14,         // 单条岔路的入口总成本上限（校验用）
      BRANCH_LOW_VALUE_MIN: 10,          // 低收益支线至少价值（校验用）
      BRANCH_HIGH_VALUE_MIN: 50,         // 高收益支线至少价值（校验用）
    },

    /* 通用验证参数；每个尺寸的具体阈值见 MAP_PRESETS[x].validator */
    VALIDATOR: { MAX_REPAIR_ROUNDS: 3 },

    /* V0.6（P3）：生成验证与模拟策略（seed 抽检规模可调） */
    SIM: {
      SWEEP_SEEDS: 1000,      // 完整抽检规模（tools/seed-sweep.js）
      ROUTINE_SEEDS: 120,     // 日常验收规模（tools/headless-test.js）
      MAX_STEPS: 420,         // 单局模拟步数上限（合法通关约 50 个动作，420 足够）
    },

    /* V0.7（试玩反馈）：本局采矿进度与补给档位
     *  - 进度只由"实际挖出的矿物"累计（宝箱 / 藏宝库 / 调试加值都不算）；
     *  - 第一档自动发放，第二/三档让玩家三选一（效果、适用场景都会写在选项里）；
     *  - 门槛与数量是"待试玩验证的假设"：300 张抽样确认"主矿道 2 格内"的矿物价值
     *    前 27m ≥195、全深度 ≥430，因此 50 / 150 / 300 三档在抽检地图上均可顺手达成；
     *    实际手感与是否过强（让藏宝库失去挑战）由 P4 数据与后续试玩再调。 */
    MINE_PROGRESS: {
      TIERS: [
        {
          id: 't1', name: '第一档补给', need: 50,
          auto: { stamina: 10 },
        },
        {
          id: 't2', name: '第二档补给', need: 150,
          choices: [
            { id: 'stamina', label: '恢复体力 +14', gain: { stamina: 14 }, detail: '立刻恢复 14 体力（不超过上限 50）' },
            { id: 'bomb', label: '炸药 ×1', gain: { bomb: 1 }, detail: '炸开十字 5 格、不耗体力；适合前面有 2~3 体力岩块挡路时' },
            { id: 'powerPick', label: '强化矿镐 ×1', gain: { powerPick: 1 }, detail: '下一次挖掘不消耗体力；留给 3 体力坚硬岩石最划算' },
          ],
        },
        {
          id: 't3', name: '第三档补给', need: 300,
          choices: [
            { id: 'stamina', label: '恢复体力 +18', gain: { stamina: 18 }, detail: '立刻恢复 18 体力（不超过上限 50）' },
            { id: 'bomb', label: '炸药 ×2', gain: { bomb: 2 }, detail: '两次十字爆破；深层硬岩密集时价值最高' },
            { id: 'powerPick', label: '强化矿镐 ×2', gain: { powerPick: 2 }, detail: '接下来两次挖掘免费；适合连续遇到坚硬岩石' },
          ],
        },
      ],
    },

    /* V0.7.1 探索风格（可选个人目标）：
     * 只回答"这局我想怎么玩"，不发永久奖励、不改变主目标、不强制完成。
     * 完成后写入探索档案（archive.styles），并在结算页展示。 */
    STYLES: [
      {
        id: 'explorer', name: '探险家', color: '#9fd0ff',
        goal: '发现 2 个隐藏区域',
        /* V0.8.2：风格奖励为局内即时补给（只发一次）；数值是待试玩验证的假设 */
        reward: { lamp: 1, stamina: 4 },
      },
      {
        id: 'miner', name: '矿工', color: '#9fe08a',
        goal: '采矿进度达到第二档',
        reward: { powerPick: 1, stamina: 4 },
      },
      {
        id: 'racer', name: '速降', color: '#ffd75e',
        goal: '不坐矿车抵达 30m',
        reward: { stamina: 12 },
      },
    ],

    /* V0.7.1 三段式节奏：进入新的深度层时提示一次（每局每层一次） */
    DEPTH_HINTS: {
      shallow: '浅层（0-9m）：软岩为主；顺手挖矿物，攒第一档补给',
      rock: '10m 起岩层变硬：看到 2~3 体力岩块，先算一下体力够不够直下',
      deep: '20m 深层：矿车 / 岔路 / 泉水都在这段，决定绕路还是直下',
      old: '30m 旧矿区：体力要留给后段；没把握随时可结束探索（价值全保留）',
      treasure: '接近藏宝库：最后几格，稳住体力',
    },

    CAMERA: { SMOOTH: 7.5 },   // §60：镜头平滑跟随（绘制时取整，避免像素模糊）

    ANIM: {                    // §62：一次挖掘反馈目标 0.2～0.4 秒
      DIG_TIME: 0.30,
      BOMB_TIME: 0.55,
      MOVE_TIME: 0.12,
      WALK_TIME: 0.085,
      ENTER_TIME: 0.60,
      ROOM_BANNER_TIME: 1.10,
      TREASURE_TIME: 3.20,     // §81：藏宝库正式发现演出总时长
      CART_TIME: 0.50,         // V0.6：矿车双向乘坐（含自动返回寻路中的连接段）
    },

    /* §44 / §81 藏宝库发现演出时序（秒，从演出开始计）：
     * 最后一块岩壁破碎 → 镜头轻震 → 金色光线 → 藏宝库区域逐格点亮 → 发现横幅 → 玩家选择结算或继续 */
    TREASURE_SEQ: {
      CRACK: 0.45,   // 碎壁定格（重震 + 碎石）
      SHAKE: 0.90,   // 轻震推进（尘埃）
      LIGHT: 1.50,   // 金色光线射出（强闪 + 光束）
      REVEAL: 2.40,  // 区域点亮（逐格扫过藏宝室）
    },

    DEV_MODE: true,            // §75：正式发布改成 false → 调试面板自动隐藏
  };

  /* 取地图预设；未知 id 回落到默认预设 */
  MM.mapSpec = function (id) {
    const presets = MM.BALANCE.MAP_PRESETS;
    const mine = MM.MINES && MM.MINES[id];
    if (mine) {
      const base = presets[mine.baseMap] || presets.full;
      return Object.assign({}, base, { id: mine.id, name: mine.name, mineId: mine.id });
    }
    return presets[id] || presets[MM.BALANCE.DEFAULT_MAP] || presets.full;
  };

  /* 取某张地图对应的验证阈值（优先跟随 map.spec，其次默认预设） */
  MM.specValidatorOf = function (map) {
    const spec = (map && map.spec) || MM.mapSpec();
    return (spec && spec.validator) || MM.mapSpec().validator;
  };
})();



