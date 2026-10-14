/* Approved V3 vertical slice. Loaded after the generated V2 maps; 4F+ stay intact. */
(function () {
  const maps = {
    1: {
      name: '入塔检疫封锁',
      note: '两条检疫路线汇向封印节点；钥匙与生命各有代价。',
      rows: [
        '############', '#########>##', '#########)##', '#########2##',
        '######1.0.##', '##..3.1#####', '##.###.3a###', '##.###.#####',
        '##1#Y#y.21h#', '##.#2###.###', '#<@..1...###', '############'
      ],
      entry: [2, 10], exit: [9, 1],
      hooks: [
        { type: 'ENTER', id: 'F01_SEAL_INIT', once: true },
        { type: 'AREA', at: [8, 4], id: 'F01_SEAL_OPENED', once: true, setFlag: 'F01_SEAL_OPENED' }
      ]
    },
    2: {
      name: '石牢与暗墙',
      note: '牢区的石缝与巡逻道，通往同一处上行关口。',
      rows: [
        '############', '#########>##', '######h##.##', '######1##1##',
        '#####..2..##', '#####1###2##', '#####*###.##', '###Y#.#e#3##',
        '###2#t#y#.##', '##.....1..##', '##<#########', '############'
      ],
      entry: [2, 10], exit: [9, 1],
      hooks: [
        { type: 'AREA', at: [5, 8], id: 'F02_THIEF_MET', once: true, setFlag: 'F02_THIEF_MET' },
        { type: 'SWITCH', at: [5, 6], id: 'F02_THIEF_TUNNEL', once: true, setFlag: 'F02_THIEF_TUNNEL' }
      ]
    },
    3: {
      name: '缴械间',
      note: '红宝石能跨过法师的攻击阈值；黄门则省下眼前的生命。',
      rows: [
        '############', '#######Y#>##', '#######5#1##', '#####..2..##',
        '#####.#.####', '###..4..#Y##', '##h3#.#2#e##', '###.#.#.6b##',
        '##a1..y.####', '#####.######', '##<...######', '############'
      ],
      entry: [2, 10], exit: [9, 1],
      hooks: [
        { type: 'ENTER', id: 'F03_DISARM', once: true, setFlag: 'F03_DISARM' }
      ]
    }
  };
  for (const [floor, map] of Object.entries(maps)) {
    const old = window.MT.FLOORS[floor];
    window.MT.FLOORS[floor] = Object.assign({}, old, {
      name: map.name, note: map.note, rows: map.rows,
      v2Entry: map.entry, v2Exit: map.exit, eventHooks: map.hooks
    });
  }
})();
