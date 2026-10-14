/* 怪物定义（§10）：只保留 HP / 移动速度 / 体型 / 数量 四种差异，
 * 三个基础等级：普通怪 / 精英怪 / Boss。第一版禁止任何复杂技能。
 * 形象以后直接复用主项目的怪物素材（阶段四），这里先用色块。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.MONSTERS = {
    grunt: {
      id: 'grunt', name: '骷髅兵', tier: 'normal', kind: 'skeleton',
      hp: 25, speed: 55, gold: 2, size: 30, color: '#c0504d', shape: 'circle',
    },
    hound: {
      id: 'hound', name: '蝙蝠', tier: 'normal', kind: 'bat_small',
      hp: 20, speed: 82, gold: 2, size: 26, color: '#b5763c', shape: 'circle',
    },
    elite: {
      id: 'elite', name: '重甲卫兵', tier: 'elite', kind: 'guard_low',
      hp: 180, speed: 44, gold: 2, size: 42, color: '#8a4fb0', shape: 'square',
    },
    boss: {
      id: 'boss', name: '魔塔守卫', tier: 'boss', kind: 'knight_black',
      hp: 900, speed: 38, gold: 0, size: 64, color: '#3d3350', shape: 'square', isBoss: true,
    },
  };
})();
