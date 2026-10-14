// Campaign 3: fixed authored geometry with wider reflection passages.
export const LEVELS = [
  {
    "name": "第一束光",
    "hint": "拖动瞄准，松手发射。命中金色出口即可过关。",
    "objective": "拖动瞄准，松手发射。命中金色出口即可过关。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 320,
      "y": 105,
      "r": 30
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 1,
    "chapter": "初识弹道",
    "revision": 3,
    "difficulty": 1
  },
  {
    "name": "借墙一弹",
    "hint": "借墙面完成一次折返，观察入射角与反射角。出口要求至少反弹一次。",
    "objective": "借墙面完成一次折返，观察入射角与反射角。出口要求至少反弹一次。",
    "origin": {
      "x": 140,
      "y": 320
    },
    "walls": [],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 86,
      "y": 226,
      "r": 30,
      "minBounces": 1
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 2,
    "chapter": "初识弹道",
    "revision": 3,
    "difficulty": 1
  },
  {
    "name": "斜镜转角",
    "hint": "青色斜镜改变方向；借镜折返后进入出口，出口要求至少反弹一次。",
    "objective": "青色斜镜改变方向；借镜折返后进入出口，出口要求至少反弹一次。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [],
    "plates": [
      {
        "x1": 230,
        "y1": 170,
        "x2": 360,
        "y2": 270
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 205,
      "y": 280,
      "r": 28,
      "minBounces": 1
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 3,
    "chapter": "初识弹道",
    "revision": 3,
    "difficulty": 1
  },
  {
    "name": "石梁绕行",
    "hint": "石梁挡住直线，需要从侧面绕行。",
    "objective": "石梁挡住直线，需要从侧面绕行。",
    "origin": {
      "x": 120,
      "y": 320
    },
    "walls": [
      {
        "id": "beam",
        "x": 210,
        "y": 160,
        "w": 260,
        "h": 22
      }
    ],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 75,
      "y": 226,
      "r": 28,
      "minBounces": 1
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 4,
    "chapter": "初识弹道",
    "revision": 3,
    "difficulty": 1
  },
  {
    "name": "两次折返",
    "hint": "观察顶部与侧墙的反射关系，把至少两次反弹连起来。",
    "objective": "观察顶部与侧墙的反射关系，把至少两次反弹连起来。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "beam",
        "x": 265,
        "y": 100,
        "w": 200,
        "h": 22
      }
    ],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 50,
      "y": 259,
      "r": 28,
      "minBounces": 2
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 5,
    "chapter": "初识弹道",
    "revision": 3,
    "difficulty": 1
  },
  {
    "name": "点亮门锁",
    "hint": "先命中青色开关，再进入上方出口。机关进度保留。",
    "objective": "先命中青色开关，再进入上方出口。机关进度保留。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "key",
        "x": 320,
        "y": 190,
        "r": 24,
        "kind": "switch"
      }
    ],
    "requires": [
      "key"
    ],
    "exit": {
      "x": 320,
      "y": 80,
      "r": 28
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 6,
    "chapter": "石廊探路",
    "revision": 3,
    "difficulty": 2
  },
  {
    "name": "裂石开路",
    "hint": "裂纹石墙一撞即碎。打穿石墙后继续进入出口。",
    "objective": "裂纹石墙一撞即碎。打穿石墙后继续进入出口。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "crack",
        "x": 230,
        "y": 195,
        "w": 180,
        "h": 22,
        "breakable": true
      }
    ],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [
      "wall:crack"
    ],
    "exit": {
      "x": 320,
      "y": 80,
      "r": 28
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 7,
    "chapter": "石廊探路",
    "revision": 3,
    "difficulty": 2
  },
  {
    "name": "双廊初探",
    "hint": "两面错开的石墙构成通道，寻找连续折返路线。",
    "objective": "两面错开的石墙构成通道，寻找连续折返路线。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 220,
        "y": 90,
        "w": 22,
        "h": 155
      },
      {
        "id": "b",
        "x": 425,
        "y": 150,
        "w": 22,
        "h": 170
      }
    ],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 50,
      "y": 259,
      "r": 26,
      "minBounces": 2
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 8,
    "chapter": "石廊探路",
    "revision": 3,
    "difficulty": 2
  },
  {
    "name": "背面封印",
    "origin": {
      "x": 90,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 220,
        "y": 140,
        "w": 180,
        "h": 20
      },
      {
        "id": "b",
        "x": 470,
        "y": 80,
        "w": 22,
        "h": 180
      },
      {
        "id": "c",
        "x": 110,
        "y": 80,
        "w": 60,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 300,
        "y1": 250,
        "x2": 370,
        "y2": 300
      }
    ],
    "goal": "箭头是弹珠命中时的行进方向；从错误方向命中会反弹。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 430,
        "y": 66,
        "r": 19,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "needs": [],
        "direction": "down"
      }
    ],
    "requires": [
      "n0"
    ],
    "exit": {
      "x": 408,
      "y": 196,
      "r": 23
    },
    "chapter": "石廊探路",
    "hint": "箭头是弹珠命中时的行进方向；从错误方向命中会反弹。",
    "objective": "箭头是弹珠命中时的行进方向；从错误方向命中会反弹。",
    "id": 9,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 7,
    "difficulty": 2
  },
  {
    "name": "针塔回旋",
    "hint": "避开中央针塔，从外圈连续折返到达出口。",
    "objective": "避开中央针塔，从外圈连续折返到达出口。",
    "origin": {
      "x": 535,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 300,
        "y": 70,
        "w": 35,
        "h": 175,
        "hazard": true
      },
      {
        "id": "b",
        "x": 120,
        "y": 175,
        "w": 110,
        "h": 22
      },
      {
        "id": "c",
        "x": 455,
        "y": 95,
        "w": 105,
        "h": 18
      },
      {
        "id": "d",
        "x": 390,
        "y": 235,
        "w": 22,
        "h": 70
      }
    ],
    "plates": [
      {
        "x1": 145,
        "y1": 85,
        "x2": 225,
        "y2": 130
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 495,
        "y": 183,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      },
      {
        "id": "n1",
        "x": 545,
        "y": 148,
        "r": 20,
        "kind": "switch",
        "label": "2",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 406,
      "y": 93,
      "r": 23,
      "minBounces": 3
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 10,
    "id": 10,
    "chapter": "石廊探路",
    "revision": 3,
    "difficulty": 2
  },
  {
    "name": "斜镜夹层",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 190,
        "y": 200,
        "w": 220,
        "h": 18
      },
      {
        "id": "b",
        "x": 290,
        "y": 80,
        "w": 200,
        "h": 18
      },
      {
        "id": "c",
        "x": 510,
        "y": 145,
        "w": 20,
        "h": 145
      }
    ],
    "plates": [
      {
        "x1": 110,
        "y1": 100,
        "x2": 195,
        "y2": 160
      },
      {
        "x1": 360,
        "y1": 280,
        "x2": 440,
        "y2": 230
      }
    ],
    "goal": "在上下夹层间借斜镜折返，不能直接穿过石梁。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [],
    "requires": [],
    "exit": {
      "x": 432,
      "y": 149,
      "r": 23
    },
    "chapter": "机关进阶",
    "hint": "上下石梁形成夹层，观察边墙与斜镜，寻找绕开阻挡的折返路线。",
    "objective": "上下石梁形成夹层，观察边墙与斜镜，寻找绕开阻挡的折返路线。",
    "id": 11,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 13,
    "difficulty": 3
  },
  {
    "name": "钥匙暗室",
    "chapter": "机关进阶",
    "shots": 3,
    "par": 2,
    "origin": {
      "x": 100,
      "y": 320
    },
    "exit": {
      "x": 535,
      "y": 85,
      "r": 23
    },
    "hint": "金色钥匙在左上方。先拿钥匙，再寻找通往右侧出口的反射路线。",
    "walls": [
      {
        "id": "middle",
        "x": 280,
        "y": 148,
        "w": 25,
        "h": 170
      },
      {
        "id": "shelf",
        "x": 55,
        "y": 155,
        "w": 145,
        "h": 18
      },
      {
        "id": "guard",
        "x": 430,
        "y": 250,
        "w": 115,
        "h": 18
      }
    ],
    "nodes": [
      {
        "id": "key",
        "x": 100,
        "y": 86,
        "r": 19,
        "kind": "key"
      }
    ],
    "requires": [
      "key"
    ],
    "plates": [
      {
        "x1": 390,
        "y1": 185,
        "x2": 470,
        "y2": 105
      }
    ],
    "id": 12,
    "contacts": 18,
    "objective": "金色钥匙在左上方。先拿钥匙，再寻找通往右侧出口的反射路线。",
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 2,
    "difficulty": 3
  },
  {
    "name": "回声蓄能",
    "hint": "先反弹至少 3 次，再命中蓄能晶体；直击晶体无效。",
    "objective": "先反弹至少 3 次，再命中蓄能晶体；直击晶体无效。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 250,
        "y": 90,
        "w": 20,
        "h": 200
      },
      {
        "id": "b",
        "x": 405,
        "y": 50,
        "w": 20,
        "h": 190
      },
      {
        "id": "c",
        "x": 65,
        "y": 135,
        "w": 105,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 445,
        "y1": 240,
        "x2": 540,
        "y2": 175
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 119,
        "y": 87,
        "r": 20,
        "kind": "charge",
        "label": "1",
        "relay": false,
        "minBounces": 3
      }
    ],
    "requires": [
      "n0"
    ],
    "exit": {
      "x": 185,
      "y": 108,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 9,
    "id": 13,
    "chapter": "机关进阶",
    "revision": 3,
    "difficulty": 3
  },
  {
    "name": "旋镜密道",
    "chapter": "机关进阶",
    "shots": 3,
    "par": 2,
    "origin": {
      "x": 320,
      "y": 320
    },
    "exit": {
      "x": 540,
      "y": 94,
      "r": 28
    },
    "hint": "青铜齿轮会转动中央镜面，借斜板反射后点亮出口。",
    "walls": [
      {
        "id": "block",
        "x": 435,
        "y": 165,
        "w": 24,
        "h": 145
      },
      {
        "id": "overhang",
        "x": 160,
        "y": 75,
        "w": 120,
        "h": 18
      }
    ],
    "nodes": [
      {
        "id": "turn",
        "x": 100,
        "y": 100,
        "r": 19,
        "kind": "switch",
        "rotate": 0
      }
    ],
    "requires": [
      "turn",
      "plate:0"
    ],
    "plates": [
      {
        "x1": 230,
        "y1": 170,
        "x2": 350,
        "y2": 230
      }
    ],
    "id": 14,
    "contacts": 18,
    "objective": "青铜齿轮会转动中央镜面，借斜板反射后点亮出口。",
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 3,
    "difficulty": 3
  },
  {
    "name": "针墙折返",
    "chapter": "机关进阶",
    "shots": 3,
    "par": 2,
    "origin": {
      "x": 105,
      "y": 320
    },
    "exit": {
      "x": 540,
      "y": 105,
      "r": 23
    },
    "hint": "红色尖刺会回收弹珠。先取钥匙，再从尖刺上侧绕行。",
    "walls": [
      {
        "id": "spikes",
        "x": 270,
        "y": 160,
        "w": 32,
        "h": 145,
        "hazard": true
      },
      {
        "id": "shelf",
        "x": 370,
        "y": 130,
        "w": 155,
        "h": 18
      }
    ],
    "nodes": [
      {
        "id": "key",
        "x": 150,
        "y": 80,
        "r": 19,
        "kind": "key"
      }
    ],
    "requires": [
      "key"
    ],
    "id": 15,
    "plates": [
      {
        "x1": 345,
        "y1": 240,
        "x2": 410,
        "y2": 285
      }
    ],
    "contacts": 18,
    "objective": "红色尖刺会回收弹珠。先取钥匙，再从尖刺上侧绕行。",
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 4,
    "difficulty": 3
  },
  {
    "name": "错层双廊",
    "hint": "绕过错层石墙，寻找两次以上反弹的出口路线。",
    "objective": "绕过错层石墙，寻找两次以上反弹的出口路线。",
    "origin": {
      "x": 95,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 200,
        "y": 55,
        "w": 24,
        "h": 190
      },
      {
        "id": "b",
        "x": 400,
        "y": 145,
        "w": 24,
        "h": 180
      },
      {
        "id": "c",
        "x": 270,
        "y": 82,
        "w": 95,
        "h": 18
      }
    ],
    "plates": [],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 60,
        "y": 71,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      },
      {
        "id": "n1",
        "x": 128,
        "y": 101,
        "r": 20,
        "kind": "switch",
        "label": "2",
        "relay": false
      },
      {
        "id": "n2",
        "x": 154,
        "y": 155,
        "r": 20,
        "kind": "switch",
        "label": "3",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "n1",
      "n2"
    ],
    "exit": {
      "x": 174,
      "y": 283,
      "r": 23,
      "minBounces": 3
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 1,
    "id": 16,
    "chapter": "连击回路",
    "revision": 3,
    "difficulty": 4
  },
  {
    "name": "单发双星",
    "hint": "同一发按一灯→二灯点亮紫色星印，再进出口；回收后星点熄灭。",
    "objective": "同一发按一灯→二灯点亮紫色星印，再进出口；回收后星点熄灭。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 175,
        "y": 65,
        "w": 20,
        "h": 145
      },
      {
        "id": "b",
        "x": 435,
        "y": 150,
        "w": 20,
        "h": 155
      },
      {
        "id": "c",
        "x": 270,
        "y": 205,
        "w": 100,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 265,
        "y1": 110,
        "x2": 335,
        "y2": 65
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 273,
        "y": 253,
        "r": 20,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 75,
        "y": 175,
        "r": 20,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 75,
      "y": 99,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 8,
    "id": 17,
    "chapter": "连击回路",
    "revision": 3,
    "difficulty": 4
  },
  {
    "name": "十字迷宫",
    "origin": {
      "x": 90,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 295,
        "y": 70,
        "w": 25,
        "h": 100
      },
      {
        "id": "b",
        "x": 295,
        "y": 215,
        "w": 25,
        "h": 100
      },
      {
        "id": "c",
        "x": 120,
        "y": 180,
        "w": 130,
        "h": 20
      },
      {
        "id": "d",
        "x": 365,
        "y": 180,
        "w": 145,
        "h": 20
      }
    ],
    "plates": [
      {
        "x1": 480,
        "y1": 65,
        "x2": 550,
        "y2": 125
      }
    ],
    "goal": "穿过十字间隙，再按箭头方向命中封印。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 375,
        "y": 96,
        "r": 19,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "needs": [],
        "direction": "down"
      }
    ],
    "requires": [
      "n0"
    ],
    "exit": {
      "x": 446,
      "y": 123,
      "r": 23
    },
    "chapter": "连击回路",
    "hint": "穿过十字间隙，再按箭头方向命中封印。",
    "objective": "穿过十字间隙，再按箭头方向命中封印。",
    "id": 18,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 11,
    "difficulty": 4
  },
  {
    "name": "三镜折返",
    "hint": "借三次反弹蓄能，再击中晶体绕出镜室。",
    "objective": "借三次反弹蓄能，再击中晶体绕出镜室。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 250,
        "y": 70,
        "w": 140,
        "h": 18
      },
      {
        "id": "b",
        "x": 90,
        "y": 220,
        "w": 150,
        "h": 18
      },
      {
        "id": "c",
        "x": 455,
        "y": 145,
        "w": 22,
        "h": 160
      }
    ],
    "plates": [
      {
        "x1": 100,
        "y1": 100,
        "x2": 200,
        "y2": 200
      },
      {
        "x1": 390,
        "y1": 240,
        "x2": 470,
        "y2": 320
      },
      {
        "x1": 370,
        "y1": 125,
        "x2": 440,
        "y2": 55
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 132,
        "y": 182,
        "r": 20,
        "kind": "charge",
        "label": "1",
        "relay": false,
        "minBounces": 3
      }
    ],
    "requires": [
      "n0"
    ],
    "exit": {
      "x": 55,
      "y": 113,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 6,
    "id": 19,
    "chapter": "连击回路",
    "revision": 3,
    "difficulty": 4
  },
  {
    "name": "碎壁折光",
    "chapter": "连击回路",
    "shots": 3,
    "par": 2,
    "origin": {
      "x": 110,
      "y": 320
    },
    "exit": {
      "x": 520,
      "y": 80,
      "r": 25
    },
    "hint": "拆开裂纹墙，借两面斜板反射，拾取符文后进入出口。",
    "walls": [
      {
        "id": "crack",
        "x": 280,
        "y": 90,
        "w": 24,
        "h": 220,
        "breakable": true
      },
      {
        "id": "beam",
        "x": 390,
        "y": 150,
        "w": 160,
        "h": 18
      },
      {
        "id": "needle",
        "x": 70,
        "y": 70,
        "w": 20,
        "h": 90,
        "hazard": true
      }
    ],
    "nodes": [
      {
        "id": "rune",
        "x": 565,
        "y": 267,
        "r": 27,
        "kind": "rune"
      }
    ],
    "plates": [
      {
        "x1": 130,
        "y1": 150,
        "x2": 210,
        "y2": 90
      },
      {
        "x1": 390,
        "y1": 280,
        "x2": 470,
        "y2": 220
      }
    ],
    "id": 20,
    "requires": [
      "plate:0",
      "plate:1",
      "rune"
    ],
    "contacts": 18,
    "objective": "拆开裂纹墙，借两面斜板反射，拾取符文后进入出口。",
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 5,
    "difficulty": 4
  },
  {
    "name": "门中有路",
    "hint": "同颜色、同造型的传送门成对连接，穿门后保留弹珠方向。",
    "objective": "同颜色、同造型的传送门成对连接，穿门后保留弹珠方向。",
    "origin": {
      "x": 120,
      "y": 320
    },
    "walls": [
      {
        "id": "divider",
        "x": 295,
        "y": 35,
        "w": 25,
        "h": 300
      }
    ],
    "plates": [],
    "portals": [
      {
        "id": "p0",
        "x": 120,
        "y": 220,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 480,
        "y": 220,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 463,
        "y": 84,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "p0"
    ],
    "exit": {
      "x": 439,
      "y": 145,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 21,
    "chapter": "空间折跃",
    "revision": 3,
    "difficulty": 5
  },
  {
    "name": "隔墙折跃",
    "hint": "石墙和斜镜改变入门路线；穿门后在另一侧折返，点亮机关。",
    "objective": "石墙和斜镜改变入门路线；穿门后在另一侧折返，点亮机关。",
    "origin": {
      "x": 110,
      "y": 320
    },
    "walls": [
      {
        "id": "divider",
        "x": 290,
        "y": 35,
        "w": 24,
        "h": 300
      },
      {
        "id": "ledge",
        "x": 395,
        "y": 135,
        "w": 150,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 65,
        "y1": 170,
        "x2": 155,
        "y2": 230
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 220,
        "y": 110,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 490,
        "y": 260,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 413,
        "y": 180,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "p0"
    ],
    "exit": {
      "x": 450,
      "y": 87,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 22,
    "chapter": "空间折跃",
    "revision": 3,
    "difficulty": 5
  },
  {
    "name": "长短双轨",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 140,
        "y": 80,
        "w": 180,
        "h": 18
      },
      {
        "id": "b",
        "x": 300,
        "y": 220,
        "w": 200,
        "h": 18
      },
      {
        "id": "c",
        "x": 85,
        "y": 160,
        "w": 20,
        "h": 140
      },
      {
        "id": "d",
        "x": 530,
        "y": 45,
        "w": 20,
        "h": 140
      }
    ],
    "plates": [
      {
        "x1": 365,
        "y1": 100,
        "x2": 435,
        "y2": 160
      }
    ],
    "goal": "同发按底座灯数由少到多串联两颗星；留意长墙与短墙造成的不同回路。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 290,
        "y": 159,
        "r": 19,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 404,
        "y": 191,
        "r": 19,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 484,
      "y": 140,
      "r": 23
    },
    "chapter": "空间折跃",
    "hint": "同发按底座灯数由少到多串联两颗星；留意长墙与短墙造成的不同回路。",
    "objective": "同发按底座灯数由少到多串联两颗星；留意长墙与短墙造成的不同回路。",
    "id": 23,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 12,
    "difficulty": 5
  },
  {
    "name": "折跃取印",
    "hint": "穿门并按箭头方向命中封印；入口角度决定出口走向。",
    "objective": "穿门并按箭头方向命中封印；入口角度决定出口走向。",
    "origin": {
      "x": 510,
      "y": 320
    },
    "walls": [
      {
        "id": "divider",
        "x": 315,
        "y": 35,
        "w": 24,
        "h": 290
      },
      {
        "id": "shelf",
        "x": 85,
        "y": 195,
        "w": 155,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 395,
        "y1": 140,
        "x2": 480,
        "y2": 90
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 510,
        "y": 225,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 150,
        "y": 120,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 89,
        "y": 83,
        "r": 20,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "direction": "up"
      }
    ],
    "requires": [
      "n0",
      "p0"
    ],
    "exit": {
      "x": 59,
      "y": 145,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 24,
    "chapter": "空间折跃",
    "revision": 3,
    "difficulty": 5
  },
  {
    "name": "逆向取印",
    "hint": "两枚封印入口方向不同；找到各自的反射入口，再进入出口。",
    "objective": "两枚封印入口方向不同；找到各自的反射入口，再进入出口。",
    "origin": {
      "x": 530,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 170,
        "y": 55,
        "w": 22,
        "h": 160
      },
      {
        "id": "b",
        "x": 350,
        "y": 145,
        "w": 22,
        "h": 175
      },
      {
        "id": "c",
        "x": 440,
        "y": 75,
        "w": 115,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 100,
        "y1": 255,
        "x2": 175,
        "y2": 300
      },
      {
        "x1": 390,
        "y1": 100,
        "x2": 460,
        "y2": 145
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 530,
        "y": 178,
        "r": 20,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "direction": "right"
      },
      {
        "id": "n1",
        "x": 575,
        "y": 112,
        "r": 20,
        "kind": "lock",
        "label": "2",
        "relay": false,
        "direction": "left"
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 496,
      "y": 122,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 14,
    "id": 25,
    "chapter": "空间折跃",
    "revision": 3,
    "difficulty": 5
  },
  {
    "name": "碎镜初识",
    "hint": "铜橙端头的裂镜只反射一次，碎裂后通路保持开放。",
    "objective": "铜橙端头的裂镜只反射一次，碎裂后通路保持开放。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "shelf",
        "x": 450,
        "y": 125,
        "w": 90,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 220,
        "y1": 160,
        "x2": 380,
        "y2": 260,
        "fragile": true
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 184,
        "y": 227,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      },
      {
        "id": "n1",
        "x": 119,
        "y": 238,
        "r": 20,
        "kind": "switch",
        "label": "2",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "n1",
      "plate:0"
    ],
    "exit": {
      "x": 247,
      "y": 290,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 26,
    "chapter": "碎镜布局",
    "revision": 3,
    "difficulty": 6
  },
  {
    "name": "先折后穿",
    "hint": "先借橙色碎镜取得右侧钥匙；下一发穿过镜面原位置，进入上方出口。",
    "objective": "先借橙色碎镜取得右侧钥匙；下一发穿过镜面原位置，进入上方出口。",
    "origin": {
      "x": 200,
      "y": 320
    },
    "walls": [
      {
        "id": "pillar",
        "x": 455,
        "y": 85,
        "w": 22,
        "h": 205
      }
    ],
    "plates": [
      {
        "x1": 150,
        "y1": 230,
        "x2": 250,
        "y2": 130,
        "fragile": true
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "key",
        "x": 380,
        "y": 171,
        "r": 25,
        "kind": "key"
      }
    ],
    "requires": [
      "plate:0",
      "key"
    ],
    "exit": {
      "x": 200,
      "y": 80,
      "r": 27
    },
    "shots": 3,
    "par": 2,
    "contacts": 18,
    "id": 27,
    "chapter": "碎镜布局",
    "revision": 3,
    "difficulty": 6
  },
  {
    "name": "破镜换路",
    "hint": "两面镜子，一面会碎。先判断该保留哪条折返路线。",
    "objective": "两面镜子，一面会碎。先判断该保留哪条折返路线。",
    "origin": {
      "x": 520,
      "y": 320
    },
    "walls": [
      {
        "id": "beam",
        "x": 260,
        "y": 110,
        "w": 160,
        "h": 18
      },
      {
        "id": "pillar",
        "x": 100,
        "y": 205,
        "w": 22,
        "h": 100
      }
    ],
    "plates": [
      {
        "x1": 395,
        "y1": 215,
        "x2": 530,
        "y2": 135,
        "fragile": true
      },
      {
        "x1": 130,
        "y1": 105,
        "x2": 235,
        "y2": 165
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 544,
        "y": 87,
        "r": 20,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "direction": "down"
      }
    ],
    "requires": [
      "n0",
      "plate:0"
    ],
    "exit": {
      "x": 462,
      "y": 127,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 28,
    "chapter": "碎镜布局",
    "revision": 3,
    "difficulty": 6
  },
  {
    "name": "碎镜取钥",
    "hint": "一次性镜面与永久镜面同场。借反射点亮机关，再寻找出口。",
    "objective": "一次性镜面与永久镜面同场。借反射点亮机关，再寻找出口。",
    "origin": {
      "x": 280,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 110,
        "y": 125,
        "w": 110,
        "h": 18
      },
      {
        "id": "b",
        "x": 365,
        "y": 240,
        "w": 22,
        "h": 75
      }
    ],
    "plates": [
      {
        "x1": 225,
        "y1": 200,
        "x2": 330,
        "y2": 125,
        "fragile": true
      },
      {
        "x1": 455,
        "y1": 185,
        "x2": 550,
        "y2": 250
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 337,
        "y": 214,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "plate:0"
    ],
    "exit": {
      "x": 457,
      "y": 258,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 29,
    "chapter": "碎镜布局",
    "revision": 3,
    "difficulty": 6
  },
  {
    "name": "三点共振",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 200,
        "y": 60,
        "w": 20,
        "h": 155
      },
      {
        "id": "b",
        "x": 420,
        "y": 140,
        "w": 20,
        "h": 180
      },
      {
        "id": "c",
        "x": 285,
        "y": 110,
        "w": 75,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 80,
        "y1": 180,
        "x2": 160,
        "y2": 125
      },
      {
        "x1": 280,
        "y1": 240,
        "x2": 360,
        "y2": 280
      }
    ],
    "goal": "同发按一灯→二灯→三灯依次点亮星印，再进入出口；分开发射不能累积星点。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 253,
        "y": 148,
        "r": 19,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 255,
        "y": 63,
        "r": 19,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      },
      {
        "id": "n2",
        "x": 154,
        "y": 80,
        "r": 19,
        "kind": "relay",
        "label": "3",
        "relay": true,
        "needs": [
          "n1"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1",
      "n2"
    ],
    "exit": {
      "x": 69,
      "y": 149,
      "r": 23
    },
    "chapter": "碎镜布局",
    "hint": "同发按一灯→二灯→三灯依次点亮星印，再进入出口；分开发射不能累积星点。",
    "objective": "同发按一灯→二灯→三灯依次点亮星印，再进入出口；分开发射不能累积星点。",
    "id": 30,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 15,
    "difficulty": 6
  },
  {
    "name": "一珠两路",
    "hint": "命中绿色分裂晶体，产生两颗子弹珠。点亮两侧分流印，再进出口。",
    "objective": "命中绿色分裂晶体，产生两颗子弹珠。点亮两侧分流印，再进出口。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [],
    "plates": [],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 320,
        "y": 220,
        "r": 24,
        "spread": 32
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 102,
        "y": 91,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 512,
        "y": 139,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "split"
    ],
    "exit": {
      "x": 55,
      "y": 266,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 31,
    "chapter": "双珠分流",
    "revision": 3,
    "difficulty": 7
  },
  {
    "name": "双廊分流",
    "hint": "两颗子弹珠分走左右石廊，同发点亮分流印。",
    "objective": "两颗子弹珠分走左右石廊，同发点亮分流印。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 180,
        "y": 115,
        "w": 95,
        "h": 18
      },
      {
        "id": "b",
        "x": 390,
        "y": 190,
        "w": 125,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 430,
        "y1": 85,
        "x2": 505,
        "y2": 125
      }
    ],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 320,
        "y": 245,
        "r": 23,
        "spread": 36
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 194,
        "y": 220,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 324,
        "y": 132,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "split"
    ],
    "exit": {
      "x": 50,
      "y": 292,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 32,
    "chapter": "双珠分流",
    "revision": 3,
    "difficulty": 7
  },
  {
    "name": "分镜合印",
    "hint": "左右镜面各负责一条路线；两个分流印需要同发激活。",
    "objective": "左右镜面各负责一条路线；两个分流印需要同发激活。",
    "origin": {
      "x": 160,
      "y": 320
    },
    "walls": [
      {
        "id": "beam",
        "x": 280,
        "y": 170,
        "w": 160,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 65,
        "y1": 120,
        "x2": 155,
        "y2": 170
      },
      {
        "x1": 465,
        "y1": 235,
        "x2": 555,
        "y2": 165
      }
    ],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 175,
        "y": 215,
        "r": 23,
        "spread": 34
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 125,
        "y": 220,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 338,
        "y": 73,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "split"
    ],
    "exit": {
      "x": 574,
      "y": 140,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 33,
    "chapter": "双珠分流",
    "revision": 3,
    "difficulty": 7
  },
  {
    "name": "针廊双珠",
    "hint": "两条支路都要避开针柱，失败的子弹珠不会提前收回另一颗。",
    "objective": "两条支路都要避开针柱，失败的子弹珠不会提前收回另一颗。",
    "origin": {
      "x": 480,
      "y": 320
    },
    "walls": [
      {
        "id": "needle",
        "x": 290,
        "y": 120,
        "w": 24,
        "h": 120,
        "hazard": true
      },
      {
        "id": "beam",
        "x": 70,
        "y": 160,
        "w": 150,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 400,
        "y1": 80,
        "x2": 490,
        "y2": 140
      }
    ],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 465,
        "y": 235,
        "r": 23,
        "spread": 30
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 267,
        "y": 69,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 576,
        "y": 191,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "split"
    ],
    "exit": {
      "x": 53,
      "y": 100,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 34,
    "chapter": "双珠分流",
    "revision": 3,
    "difficulty": 7
  },
  {
    "name": "针阵蓄光",
    "origin": {
      "x": 80,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 210,
        "y": 110,
        "w": 20,
        "h": 180
      },
      {
        "id": "b",
        "x": 420,
        "y": 55,
        "w": 20,
        "h": 160
      },
      {
        "id": "c",
        "x": 65,
        "y": 90,
        "w": 90,
        "h": 18,
        "hazard": true
      },
      {
        "id": "d",
        "x": 495,
        "y": 250,
        "w": 65,
        "h": 18,
        "hazard": true
      }
    ],
    "plates": [
      {
        "x1": 280,
        "y1": 235,
        "x2": 350,
        "y2": 165
      }
    ],
    "goal": "绕过两组针阵，反弹至少 3 次后激活晶体。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 317,
        "y": 110,
        "r": 23,
        "kind": "charge",
        "label": "1",
        "relay": false,
        "needs": [],
        "minBounces": 3
      }
    ],
    "requires": [
      "n0"
    ],
    "exit": {
      "x": 292,
      "y": 278,
      "r": 23
    },
    "chapter": "双珠分流",
    "hint": "绕过两组针阵，反弹至少 3 次后激活晶体。",
    "objective": "绕过两组针阵，反弹至少 3 次后激活晶体。",
    "id": 35,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 16,
    "difficulty": 7
  },
  {
    "name": "门镜接力",
    "hint": "同发依次点亮两颗星，还需穿过传送门。规划石梁与镜面的折返路线。",
    "objective": "同发依次点亮两颗星，还需穿过传送门。规划石梁与镜面的折返路线。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 290,
        "y": 35,
        "w": 22,
        "h": 200
      },
      {
        "id": "b",
        "x": 390,
        "y": 240,
        "w": 155,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 435,
        "y1": 80,
        "x2": 535,
        "y2": 125
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 160,
        "y": 215,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 465,
        "y": 160,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 53,
        "y": 65,
        "r": 20,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 125,
        "y": 123,
        "r": 20,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0"
    ],
    "exit": {
      "x": 563,
      "y": 100,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 36,
    "chapter": "交织机关",
    "revision": 3,
    "difficulty": 8
  },
  {
    "name": "碎镜折跃",
    "hint": "先穿过传送门，再借一次性镜面折返取印；传送不改变方向。",
    "objective": "先穿过传送门，再借一次性镜面折返取印；传送不改变方向。",
    "origin": {
      "x": 110,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 295,
        "y": 35,
        "w": 22,
        "h": 300
      },
      {
        "id": "b",
        "x": 485,
        "y": 270,
        "w": 95,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 420,
        "y1": 120,
        "x2": 520,
        "y2": 180,
        "fragile": true
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 110,
        "y": 220,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 470,
        "y": 220,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 398,
        "y": 200,
        "r": 20,
        "kind": "switch",
        "label": "1",
        "relay": false
      }
    ],
    "requires": [
      "n0",
      "p0",
      "plate:0"
    ],
    "exit": {
      "x": 186,
      "y": 291,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 37,
    "chapter": "交织机关",
    "revision": 3,
    "difficulty": 8
  },
  {
    "name": "跃门双流",
    "hint": "先穿门换位，再分裂两路。两颗子弹珠必须同发点亮两枚分流印。",
    "objective": "先穿门换位，再分裂两路。两颗子弹珠必须同发点亮两枚分流印。",
    "origin": {
      "x": 110,
      "y": 320
    },
    "walls": [
      {
        "id": "post",
        "x": 285,
        "y": 85,
        "w": 22,
        "h": 195
      }
    ],
    "plates": [
      {
        "x1": 90,
        "y1": 150,
        "x2": 185,
        "y2": 90
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 110,
        "y": 235,
        "r": 30,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 470,
        "y": 245,
        "r": 30,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [
      {
        "id": "split",
        "x": 470,
        "y": 155,
        "r": 30,
        "spread": 33
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 68,
        "y": 187,
        "r": 25,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 536,
        "y": 145,
        "r": 25,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0",
      "split"
    ],
    "exit": {
      "x": 577,
      "y": 294,
      "r": 28,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 38,
    "chapter": "交织机关",
    "revision": 3,
    "difficulty": 8
  },
  {
    "name": "碎镜双印",
    "hint": "分流后利用一次性镜面，改变另一颗子弹珠可走的路线。",
    "objective": "分流后利用一次性镜面，改变另一颗子弹珠可走的路线。",
    "origin": {
      "x": 170,
      "y": 320
    },
    "walls": [
      {
        "id": "beam",
        "x": 300,
        "y": 110,
        "w": 145,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 90,
        "y1": 120,
        "x2": 195,
        "y2": 175,
        "fragile": true
      },
      {
        "x1": 460,
        "y1": 235,
        "x2": 550,
        "y2": 165
      }
    ],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 190,
        "y": 235,
        "r": 23,
        "spread": 35
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 73,
        "y": 78,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 375,
        "y": 72,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "plate:0",
      "split"
    ],
    "exit": {
      "x": 189,
      "y": 122,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 39,
    "chapter": "交织机关",
    "revision": 3,
    "difficulty": 8
  },
  {
    "name": "镜室回环",
    "hint": "围绕中央立柱折返，同发连续点亮两个星点。",
    "objective": "围绕中央立柱折返，同发连续点亮两个星点。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 105,
        "y": 115,
        "w": 100,
        "h": 18
      },
      {
        "id": "b",
        "x": 435,
        "y": 230,
        "w": 100,
        "h": 18
      },
      {
        "id": "c",
        "x": 300,
        "y": 105,
        "w": 24,
        "h": 140
      }
    ],
    "plates": [
      {
        "x1": 430,
        "y1": 65,
        "x2": 515,
        "y2": 120
      },
      {
        "x1": 110,
        "y1": 240,
        "x2": 195,
        "y2": 285
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 477,
        "y": 158,
        "r": 24,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 410,
        "y": 146,
        "r": 24,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 297,
      "y": 68,
      "r": 28,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 17,
    "id": 40,
    "chapter": "交织机关",
    "revision": 3,
    "difficulty": 8
  },
  {
    "name": "双门迷廊",
    "hint": "两对传送门分别连接不同石廊，颜色和造型帮助你辨认入口。",
    "objective": "两对传送门分别连接不同石廊，颜色和造型帮助你辨认入口。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 290,
        "y": 45,
        "w": 22,
        "h": 150
      },
      {
        "id": "b",
        "x": 330,
        "y": 240,
        "w": 22,
        "h": 85
      },
      {
        "id": "c",
        "x": 80,
        "y": 160,
        "w": 130,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 460,
        "y1": 85,
        "x2": 555,
        "y2": 145
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 170,
        "y": 225,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 420,
        "y": 105,
        "r": 22,
        "pair": "p0",
        "label": "A"
      },
      {
        "id": "p2",
        "x": 495,
        "y": 215,
        "r": 22,
        "pair": "p3",
        "label": "B"
      },
      {
        "id": "p3",
        "x": 210,
        "y": 105,
        "r": 22,
        "pair": "p2",
        "label": "B"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 580,
        "y": 84,
        "r": 20,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 584,
        "y": 163,
        "r": 20,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0"
    ],
    "exit": {
      "x": 107,
      "y": 103,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 41,
    "chapter": "路线筹谋",
    "revision": 3,
    "difficulty": 9
  },
  {
    "name": "镜后定向",
    "hint": "一次性镜面与方向封印组合；看清命中封印时的行进方向。",
    "objective": "一次性镜面与方向封印组合；看清命中封印时的行进方向。",
    "origin": {
      "x": 530,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 265,
        "y": 75,
        "w": 22,
        "h": 180
      },
      {
        "id": "b",
        "x": 350,
        "y": 265,
        "w": 110,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 390,
        "y1": 210,
        "x2": 510,
        "y2": 125,
        "fragile": true
      },
      {
        "x1": 90,
        "y1": 110,
        "x2": 200,
        "y2": 185
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 577,
        "y": 68,
        "r": 20,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "direction": "up"
      },
      {
        "id": "n1",
        "x": 508,
        "y": 90,
        "r": 20,
        "kind": "lock",
        "label": "2",
        "relay": false,
        "direction": "down"
      }
    ],
    "requires": [
      "n0",
      "n1",
      "plate:0"
    ],
    "exit": {
      "x": 418,
      "y": 150,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 42,
    "chapter": "路线筹谋",
    "revision": 3,
    "difficulty": 9
  },
  {
    "name": "跨室蓄能",
    "hint": "跨越传送门后仍保留反弹次数；先蓄能再解封。",
    "objective": "跨越传送门后仍保留反弹次数；先蓄能再解封。",
    "origin": {
      "x": 130,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 295,
        "y": 35,
        "w": 22,
        "h": 285
      },
      {
        "id": "b",
        "x": 395,
        "y": 125,
        "w": 150,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 60,
        "y1": 125,
        "x2": 155,
        "y2": 80
      },
      {
        "x1": 390,
        "y1": 230,
        "x2": 475,
        "y2": 175
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 190,
        "y": 175,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 470,
        "y": 265,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 578,
        "y": 113,
        "r": 20,
        "kind": "charge",
        "label": "1",
        "relay": false,
        "minBounces": 3
      }
    ],
    "requires": [
      "n0",
      "p0"
    ],
    "exit": {
      "x": 393,
      "y": 87,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 43,
    "chapter": "路线筹谋",
    "revision": 3,
    "difficulty": 9
  },
  {
    "name": "三镜双流",
    "hint": "三面镜子提供不同支路；先确定分裂方向，再让两路共同点亮分流印。",
    "objective": "三面镜子提供不同支路；先确定分裂方向，再让两路共同点亮分流印。",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 220,
        "y": 95,
        "w": 115,
        "h": 18
      },
      {
        "id": "b",
        "x": 380,
        "y": 180,
        "w": 22,
        "h": 110
      }
    ],
    "plates": [
      {
        "x1": 70,
        "y1": 205,
        "x2": 165,
        "y2": 145
      },
      {
        "x1": 455,
        "y1": 90,
        "x2": 550,
        "y2": 155
      },
      {
        "x1": 230,
        "y1": 265,
        "x2": 300,
        "y2": 215
      }
    ],
    "portals": [],
    "splitters": [
      {
        "id": "split",
        "x": 330,
        "y": 235,
        "r": 22,
        "spread": 38
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 243,
        "y": 208,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 262,
        "y": 151,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "split"
    ],
    "exit": {
      "x": 96,
      "y": 122,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 44,
    "chapter": "路线筹谋",
    "revision": 3,
    "difficulty": 9
  },
  {
    "name": "逆流三印",
    "hint": "三个方向封印分散在障碍后；方向正确才会激活，进度保留。",
    "objective": "三个方向封印分散在障碍后；方向正确才会激活，进度保留。",
    "origin": {
      "x": 100,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 240,
        "y": 70,
        "w": 20,
        "h": 120
      },
      {
        "id": "b",
        "x": 385,
        "y": 190,
        "w": 20,
        "h": 120
      },
      {
        "id": "c",
        "x": 77,
        "y": 215,
        "w": 100,
        "h": 18
      },
      {
        "id": "d",
        "x": 440,
        "y": 90,
        "w": 115,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 295,
        "y1": 100,
        "x2": 355,
        "y2": 160
      }
    ],
    "portals": [],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 164,
        "y": 76,
        "r": 21,
        "kind": "lock",
        "label": "1",
        "relay": false,
        "direction": "right"
      },
      {
        "id": "n1",
        "x": 395,
        "y": 108,
        "r": 21,
        "kind": "lock",
        "label": "2",
        "relay": false,
        "direction": "right"
      },
      {
        "id": "n2",
        "x": 483,
        "y": 165,
        "r": 21,
        "kind": "lock",
        "label": "3",
        "relay": false,
        "direction": "right"
      }
    ],
    "requires": [
      "n0",
      "n1",
      "n2"
    ],
    "exit": {
      "x": 566,
      "y": 293,
      "r": 25,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "retainedFrom": 18,
    "id": 45,
    "chapter": "路线筹谋",
    "revision": 3,
    "difficulty": 9
  },
  {
    "name": "四折连星",
    "origin": {
      "x": 520,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 170,
        "y": 120,
        "w": 20,
        "h": 175
      },
      {
        "id": "b",
        "x": 320,
        "y": 55,
        "w": 20,
        "h": 185
      },
      {
        "id": "c",
        "x": 470,
        "y": 145,
        "w": 100,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 85,
        "y1": 100,
        "x2": 140,
        "y2": 55
      },
      {
        "x1": 355,
        "y1": 280,
        "x2": 425,
        "y2": 220
      }
    ],
    "goal": "先找反射顺序，再同发串联三个星点；不能靠逐个瞄准完成。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 536,
        "y": 79,
        "r": 25,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 472,
        "y": 79,
        "r": 25,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      },
      {
        "id": "n2",
        "x": 381,
        "y": 108,
        "r": 25,
        "kind": "relay",
        "label": "3",
        "relay": true,
        "needs": [
          "n1"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1",
      "n2"
    ],
    "exit": {
      "x": 405,
      "y": 189,
      "r": 28
    },
    "chapter": "终极遗迹",
    "hint": "先找反射顺序，再同发串联三个星点；不能靠逐个瞄准完成。",
    "objective": "先找反射顺序，再同发串联三个星点；不能靠逐个瞄准完成。",
    "id": 46,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 19,
    "difficulty": 10
  },
  {
    "name": "终极折光阵",
    "origin": {
      "x": 320,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 145,
        "y": 70,
        "w": 24,
        "h": 125
      },
      {
        "id": "b",
        "x": 460,
        "y": 185,
        "w": 24,
        "h": 120
      },
      {
        "id": "c",
        "x": 235,
        "y": 170,
        "w": 160,
        "h": 18
      },
      {
        "id": "d",
        "x": 480,
        "y": 75,
        "w": 95,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 85,
        "y1": 240,
        "x2": 155,
        "y2": 295
      },
      {
        "x1": 339,
        "y1": 70,
        "x2": 451,
        "y2": 150
      }
    ],
    "goal": "同发按序点亮两颗星，首星需要 3 次反弹，末星还需按箭头方向命中。",
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "nodes": [
      {
        "id": "n0",
        "x": 508,
        "y": 151,
        "r": 19,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": [],
        "minBounces": 3
      },
      {
        "id": "n1",
        "x": 556,
        "y": 235,
        "r": 19,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ],
        "direction": "left"
      }
    ],
    "requires": [
      "n0",
      "n1"
    ],
    "exit": {
      "x": 556,
      "y": 296,
      "r": 23
    },
    "chapter": "终极遗迹",
    "hint": "同发按序点亮两颗星，首星需要 3 次反弹，末星还需按箭头方向命中。",
    "objective": "同发按序点亮两颗星，首星需要 3 次反弹，末星还需按箭头方向命中。",
    "id": 47,
    "revision": 3,
    "portals": [],
    "splitters": [],
    "retainedFrom": 20,
    "difficulty": 10
  },
  {
    "name": "门镜终局",
    "hint": "传送门、碎镜和石梁交织。同发按序点亮两颗星，并完成门镜条件。",
    "objective": "传送门、碎镜和石梁交织。同发按序点亮两颗星，并完成门镜条件。",
    "origin": {
      "x": 110,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 295,
        "y": 35,
        "w": 22,
        "h": 215
      },
      {
        "id": "b",
        "x": 385,
        "y": 245,
        "w": 145,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 420,
        "y1": 95,
        "x2": 520,
        "y2": 145,
        "fragile": true
      },
      {
        "x1": 110,
        "y1": 125,
        "x2": 190,
        "y2": 195
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 185,
        "y": 225,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 470,
        "y": 180,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [],
    "nodes": [
      {
        "id": "n0",
        "x": 238,
        "y": 216,
        "r": 20,
        "kind": "relay",
        "label": "1",
        "relay": true,
        "needs": []
      },
      {
        "id": "n1",
        "x": 368,
        "y": 155,
        "r": 20,
        "kind": "relay",
        "label": "2",
        "relay": true,
        "needs": [
          "n0"
        ]
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0",
      "plate:0"
    ],
    "exit": {
      "x": 212,
      "y": 290,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 48,
    "chapter": "终极遗迹",
    "revision": 3,
    "difficulty": 10
  },
  {
    "name": "双流钥阵",
    "hint": "分裂、跨门与双目标同时成立，出口只有两路完成后才开启。",
    "objective": "分裂、跨门与双目标同时成立，出口只有两路完成后才开启。",
    "origin": {
      "x": 510,
      "y": 320
    },
    "walls": [
      {
        "id": "a",
        "x": 285,
        "y": 95,
        "w": 22,
        "h": 185
      },
      {
        "id": "b",
        "x": 350,
        "y": 195,
        "w": 95,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 440,
        "y1": 80,
        "x2": 550,
        "y2": 150
      },
      {
        "x1": 100,
        "y1": 150,
        "x2": 200,
        "y2": 90
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 370,
        "y": 100,
        "r": 22,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 140,
        "y": 240,
        "r": 22,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [
      {
        "id": "split",
        "x": 490,
        "y": 240,
        "r": 23,
        "spread": 34
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 347,
        "y": 252,
        "r": 20,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 475,
        "y": 154,
        "r": 20,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0",
      "split"
    ],
    "exit": {
      "x": 252,
      "y": 149,
      "r": 23,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 49,
    "chapter": "终极遗迹",
    "revision": 3,
    "difficulty": 10
  },
  {
    "name": "遗迹总机关",
    "hint": "先穿门换位，再分裂两路；还需借碎镜反射，同发完成两枚分流印。",
    "objective": "先穿门换位，再分裂两路；还需借碎镜反射，同发完成两枚分流印。",
    "origin": {
      "x": 110,
      "y": 320
    },
    "walls": [
      {
        "id": "post",
        "x": 285,
        "y": 85,
        "w": 22,
        "h": 195
      },
      {
        "id": "ledge",
        "x": 360,
        "y": 290,
        "w": 150,
        "h": 18
      }
    ],
    "plates": [
      {
        "x1": 450,
        "y1": 80,
        "x2": 550,
        "y2": 120,
        "fragile": true
      },
      {
        "x1": 90,
        "y1": 150,
        "x2": 185,
        "y2": 90
      }
    ],
    "portals": [
      {
        "id": "p0",
        "x": 110,
        "y": 235,
        "r": 30,
        "pair": "p1",
        "label": "A"
      },
      {
        "id": "p1",
        "x": 470,
        "y": 245,
        "r": 30,
        "pair": "p0",
        "label": "A"
      }
    ],
    "splitters": [
      {
        "id": "split",
        "x": 470,
        "y": 155,
        "r": 30,
        "spread": 33
      }
    ],
    "nodes": [
      {
        "id": "n0",
        "x": 173,
        "y": 131,
        "r": 25,
        "kind": "fork",
        "label": "1",
        "relay": true,
        "forkOnly": true
      },
      {
        "id": "n1",
        "x": 346,
        "y": 119,
        "r": 25,
        "kind": "fork",
        "label": "2",
        "relay": true,
        "forkOnly": true
      }
    ],
    "requires": [
      "n0",
      "n1",
      "p0",
      "plate:0",
      "split"
    ],
    "exit": {
      "x": 405,
      "y": 74,
      "r": 28,
      "minBounces": 0
    },
    "shots": 3,
    "par": 1,
    "contacts": 18,
    "id": 50,
    "chapter": "终极遗迹",
    "revision": 3,
    "difficulty": 10
  }
];
