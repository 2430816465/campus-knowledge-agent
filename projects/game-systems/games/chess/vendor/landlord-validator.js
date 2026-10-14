// Adapted from TypeThe0ry/CardRoomPro, MIT, revision 64753e936e4200c58eca7992ce1e9d4bb8184ec8. See CardRoomPro-LICENSE.txt.
//数组排序
function arraySort(array, asc) {
    return array.sort(function (a, b) {
        return asc === 'asc' ? a - b : b - a;
    })
}


//计算数组中每个成员出现的次数，返回一个去重的次数数组
function getCountArrayForGroupByCard(array, asc) {
    var ret = getGroupByCard(array);
    var r = [];
    for (var i in ret) {
        (r.indexOf(ret[i]) === -1) && r.push(ret[i]);
    }
    r = arraySort(r, asc);
    return r;
}

//统计数组中每个成员出现的次数
function getGroupByCard(array) {
    var ret = {};
    array.forEach(function (item) {
        if (ret[item] === undefined) {
            ret[item] = 0;
        }
        ret[item]++;
    });
    return ret;
}

//数组去重
function arrayClearRepeat(array) {
    var ret = [];
    array.forEach(function (item) {
        if (ret.indexOf(item) === -1) {
            ret.push(item);
        }
    });
    return ret;
}

//从一个数组中过滤掉 >=n 的成员
function removeItemOverOf(array, n) {
    return array.filter(function (item) {
        return item < n;
    });
}


///数组的最大成员是否 < n;
function maxItemLessThan(array, n) {
    return Math.max.apply(Math, array) < n;
}

///数组的最大成员是否 >= n;
function maxItemMoreThan(array, n) {
    return Math.max.apply(Math, array) >= n;
}

//获取数组中最小的成员;
function getMinItem(array) {
    if (!array.length) {
        return undefined;
    }
    return Math.min.apply(Math, array);
}
//获取数组中最大的成员
function getMaxItem(array) {
    if (!array.length) {
        return undefined;
    }
    return Math.max.apply(Math, array);
}

//筛选数组中累计出现过至少n次的成员
function getCardByCountOverOf(array, n) {
    var ret = getGroupByCard(array);
    var r = [];
    for (var i in ret) {
        if (ret[i] >= n) {
            r.push(parseInt(i));
        }
    }
    return r;
}

//筛选数组中出现过n次的成员
function getCardByCount(array, n) {
    var ret = getGroupByCard(array);
    var r = [];
    for (var i in ret) {
        if (ret[i] === n) {
            r.push(parseInt(i));
        }
    }
    return r;
}

//筛选数组中出现n次的成员与其它出现n次的成员，
//若能组成等差数组，则返回这些成员的list（最长的那个等差数列,若长度一致，取最大的那一列）
function getSequence(array, n) {
    var r = arraySort(getCardByCount(array, n), 'asc');
    var rets = [];
    var ret = [];
    var maxIndex = r.length - 1;
    for (var i = 0; i < maxIndex; i++) {
        var prev = r[i];
        var curr = r[i + 1];
        if (curr - prev === 1 && curr < 15) {
            if (ret.indexOf(prev) === -1) {
                ret.push(prev);
            }
            if (ret.indexOf(curr) === -1) {
                ret.push(curr);
            }
            if (i === maxIndex - 1) {
                rets.push(ret);
            }
        } else {
            rets.push(ret);
            ret = [];
        }
    }
    rets = rets.sort(function (a, b) {
        return a.length - b.length;
    });
    return rets.pop() || [];

}


//检查数组是否为等差数组 （差值 1）
// {Array} param
// {boolean} return
function checkSequence(array) {
    array = arraySort(array, 'asc');
    for (var i = 0, len = array.length - 1; i < len; i++) {
        var prev = array[i];
        var current = array[i + 1];
        if (current - prev !== 1) {
            return false;
        }
    }
    return true;
}
//顺子 N 张
function ABCDE_N(cards, count) {
    var cards = arraySort(cards, 'asc');

    if (maxItemMoreThan(cards, 15)) {
        return false;
    }
    var ret = checkSequence(cards);
    if (count === undefined) {
        return ret;
    } else {
        return ret && cards.length === count;
    }
}
//连对N对
function AABBCC_N(cards, count) {
    var ret = getGroupByCard(cards);
    var retKeys = arraySort(Object.keys(ret), 'asc');
    if (maxItemMoreThan(retKeys, 15)) {
        return false;
    }
    var flag = checkSequence(retKeys);
    if (!flag) {
        return false;
    }
    var r = getCountArrayForGroupByCard(cards, 'asc');
    return r.length === 1 && r[0] === 2 && cards.length === count && count % 2 === 0;
}
//飞机不带翅膀N飞
function AAABBB_N(cards, count) {
    var countList = getCountArrayForGroupByCard(cards, 'asc');
    var mCards = getGroupByCard(cards);
    mCards = arraySort(Object.keys(mCards), 'asc');
    if (maxItemMoreThan(mCards, 15)) {
        return false;
    }
    var ret = checkSequence(mCards);
    return ret && countList.length === 1 && countList[0] === 3 && cards.length === count;
}

//飞机带单N飞
function AAABBB_N_CD_N(cards, count) {
    var ret = arraySort(getCardByCountOverOf(cards, 3), 'asc');
    ret = removeItemOverOf(ret, 15);
    if (ret.length < count / 4) {
        return {
            status: false
        };
    }
    var r = getSequence(ret, 1);
    if (r.length < count / 4) {
        return { status: false };
    }
    var key = getMinItem(r);
    var status = cards.length === count;
    return {
        key: key,
        status: status
    }
}

//双飞以上带对
function AAABB_N(cards, count) {
    cards = cards.slice(0);
    if (count % 5 !== 0) {
        return false;
    }
    var ret = getSequence(cards, 3);
    if (ret.length !== count / 5) {
        return false;
    }
    var r = [];
    cards.forEach(function (item) {
        (ret.indexOf(item) === -1) && r.push(item);
    });
    r = arraySort(r, 'asc');
    if (r.length !== (count / 5) * 2) {
        return false;
    }
    r = getCountArrayForGroupByCard(r, 'asc');
    for (var i = 0, len = r.length; i < len; i++) {
        if (r[i] !== 4 && r[i] !== 2) {
            return false;
        }
    }
    return true;
}

const TYPES = {

    //[1张的时候] 
    // 单张
    A: function (cards) {
        return {
            len: 1,
            key: cards[0],
            status: cards.length === 1
        }
    },





    //[2张的时候] 
    //对子
    AA: function (cards) {
        var status = cards.length === 2 && cards[0] === cards[1];
        return {
            len: 2,
            key: cards[0],
            status: status
        }
    },
    //王炸
    KING: function (cards) {
        var ret = arraySort(cards, 'asc');
        var status = ret.length === 2 && ret[0] + ret[1] === 33;
        return {
            len: 2,
            key: 16,
            status: status
        }
    },




    //[3张的时候] 
    //三不带
    AAA: function (cards) {
        var status = cards.length === 3 && cards[0] === cards[1] && cards[1] === cards[2];
        return {
            len: 3,
            key: cards[0],
            status: status
        }
    },





    //[4张的时候] 
    //炸弹（四张）
    AAAA: function (cards) {
        var ret = arrayClearRepeat(cards);
        var status = ret.length === 1 && cards.length === 4;
        return {
            len: 4,
            key: cards[0],
            status: status
        }
    },
    //三带一
    AAAB: function (cards) {
        var r = getCountArrayForGroupByCard(cards, 'desc');
        var ret = getCardByCount(cards, 3);
        var status = r.length === 2 && r[0] === 3 && r[1] === 1 && cards.length === 4;
        return {
            len: 4,
            key: ret[0],
            status: status
        }
    },





    //[5张的时候] 
    //三带二（三带一对）
    AAABB: function (cards) {
        var r = getCountArrayForGroupByCard(cards, 'desc');
        var ret = getCardByCount(cards, 3);
        var status = r.length === 2 && r[0] === 3 && r[1] === 2 && cards.length === 5;
        return {
            len: 5,
            key: ret[0],
            status: status
        }
    }
    ,
    //顺子5张
    ABCDE_5: function (cards) {
        var status = ABCDE_N(cards, 5);
        return {
            len: 5,
            key: getMinItem(cards),
            status: status
        }
    }
    ,




    //[6张的时候] 
    //顺子6张
    ABCDE_6: function (cards) {
        var status = ABCDE_N(cards, 6);
        return {
            len: 6,
            key: getMinItem(cards),
            status: status
        }
    }
    ,
    //连对
    AABBCC_6: function (cards) {
        var status = AABBCC_N(cards, 6);
        return {
            len: 6,
            key: getMinItem(cards),
            status: status
        }
    },
    //四带二
    AAAABC: function (cards) {
        var r = getCountArrayForGroupByCard(cards, 'desc');
        var status = [2, 3].indexOf(r.length) > -1 && r[0] === 4 && cards.length === 6;
        return {
            len: 6,
            key: getCardByCount(cards, 4)[0],
            status: status
        }
    },
    //双飞不带
    AAABBB: function (cards) {
        var status = AAABBB_N(cards, 6);
        return {
            len: 6,
            key: getMinItem(cards),
            status: status
        }
    },



    //[7张的时候] 
    //顺子7张
    ABCDE_7: function (cards) {
        var status = ABCDE_N(cards, 7);
        return {
            len: 7,
            key: getMinItem(cards),
            status: status
        }
    },





    //[8张的时候]           
    //顺子8张
    ABCDE_8: function (cards) {
        var status = ABCDE_N(cards, 8);
        return {
            len: 8,
            key: getMinItem(cards),
            status: status
        }
    },
    //双飞带二张(AAABBBAB也应满足 [连续的两炸])
    AAABBB_CD: function (cards) {
        var data = AAABBB_N_CD_N(cards, 8);
        return {
            len: 8,
            key: data.key,
            status: data.status
        }
    },
    //连对 8张
    AABBCC_8: function (cards) {
        var status = AABBCC_N(cards, 8);
        return {
            len: 8,
            key: getMinItem(cards),
            status: status
        }
    },
    //4带2对(AAAABBBB也算)
    AAAABBCC: function (cards) {
        var status = {
            len: 8,
            key: undefined,
            status: false
        };
        if (cards.length !== 8) {
            return status;
        }
        cards = cards.slice(0);
        var ret = getCardByCountOverOf(cards, 4);
        if (ret.length === 2) {
            status.key = getMaxItem(ret);
            status.status = true;
            return status;
        }
        else if (ret.length < 1) {
            return status;
        }
        else if (ret.length === 1) {
            var r = [];
            var exceptCard = ret[0];
            cards.forEach(function (card) {
                if (card !== exceptCard) {
                    r.push(card);
                }
            });
            r = arraySort(r, 'asc');
            status.key = exceptCard;
            status.status = r[0] === r[1] && r[2] === r[3];
            return status;
        }
        else {
            return status;
        }
    },



    //[9张的时候]
    //顺子9张
    ABCDE_9: function (cards) {
        var status = ABCDE_N(cards, 9);
        return {
            len: 9,
            key: getMinItem(cards),
            status: status
        }
    },
    //三飞不带
    AAABBB_9: function (cards) {
        var status = AAABBB_N(cards, 9);
        return {
            len: 9,
            key: getMinItem(cards),
            status: status
        }
    },


    //[10张的时候]
    //顺子10张
    ABCDE_10: function (cards) {
        var status = ABCDE_N(cards, 10);
        return {
            len: 10,
            key: getMinItem(cards),
            status: status
        }
    },
    //连对10张
    AABBCC_10: function (cards) {
        var status = AABBCC_N(cards, 10);
        return {
            len: 10,
            key: getMinItem(cards),
            status: status
        }
    }
    ,
    //双飞带两对   
    AAABBBCCDD: function (cards) {
        var status = AAABB_N(cards, 10);
        var ret = getCardByCount(cards, 3);
        return {
            len: 10,
            key: getMinItem(ret),
            status: status
        }
    },



    //[11张的时候]
    //顺子11张
    ABCDE_11: function (cards) {
        var status = ABCDE_N(cards, 11);
        return {
            len: 11,
            key: getMinItem(cards),
            status: status
        }
    },


    //[12张的时候]
    //顺子12张
    ABCDE_12: function (cards) {
        var status = ABCDE_N(cards, 12);
        return {
            len: 12,
            key: getMinItem(cards),
            status: status
        }
    },
    //连对 12张
    AABBCC_12: function (cards) {
        var status = AABBCC_N(cards, 12);
        return {
            len: 12,
            key: getMinItem(cards),
            status: status
        }
    },
    //四飞不带
    AAABBB_12: function (cards) {
        var status = AAABBB_N(cards, 12);
        return {
            len: 12,
            key: getMinItem(cards),
            status: status
        }
    },
    //三飞带三张
    AAABBB_CD_12: function (cards) {
        var data = AAABBB_N_CD_N(cards, 12);
        return {
            len: 12,
            key: data.key,
            status: data.status
        }
    },

    //[13张的时候]
    //无

    //[14张的时候]
    //连对14张
    AABBCC_14: function (cards) {
        var status = AABBCC_N(cards, 14);
        return {
            len: 14,
            key: getMinItem(cards),
            status: status
        }
    },


    //[15张的时候]
    //三飞带三对
    AAABB_15: function (cards) {
        var status = AAABB_N(cards, 15);
        var ret = getCardByCount(cards, 3);
        return {
            len: 15,
            key: getMinItem(ret),
            status: status
        }
    },
    //5飞不带
    AAABBB_15: function (cards) {
        var status = AAABBB_N(cards, 15);
        return {
            len: 15,
            key: getMinItem(cards),
            status: status
        }
    },


    //[16张的时候]
    //连对16张
    AABBCC_16: function (cards) {
        var status = AABBCC_N(cards, 16);
        return {
            len: 16,
            key: getMinItem(cards),
            status: status
        }
    },
    //4飞带4张
    AAABBB_CD_16: function (cards) {
        var data = AAABBB_N_CD_N(cards, 16);
        return Object.assign({ len: 16 }, data);
    },

    //[17张的时候]
    //无

    //[18张的时候]
    //连对 18张
    AABBCC_18: function (cards) {
        var status = AABBCC_N(cards, 18);
        return {
            len: 18,
            key: getMinItem(cards),
            status: status
        }
    },
    //6飞不带
    AAABBB_18: function (cards) {
        var status = AAABBB_N(cards, 18);
        return {
            len: 18,
            key: getMinItem(cards),
            status: status
        }
    },

    //[19张的时候]
    //无

    //[20张的情况]
    //连对20张
    AABBCC_20: function (cards) {
        var status = AABBCC_N(cards, 20);
        return {
            len: 20,
            key: getMinItem(cards),
            status: status
        }
    },
    //5飞带5张
    AAABBB_CD_20: function (cards) {
        var data = AAABBB_N_CD_N(cards, 20);
        return Object.assign({ len: 20 }, data);
    },
    //四飞带四对(5 x 4)
    AAABB_20: function (cards) {
        var status = AAABB_N(cards, 20);
        var ret = getCardByCount(cards, 3);
        return {
            len: 20,
            key: getMinItem(ret),
            status: status
        }
    }

}



var cardValidator = {
    1: [['A', TYPES.A]],
    2: [['AA', TYPES.AA], ['KING', TYPES.KING]],
    3: [['AAA', TYPES.AAA]],
    4: [['AAAA', TYPES.AAAA], ['AAAB', TYPES.AAAB]],
    5: [['AAABB', TYPES.AAABB], ['ABCDE', TYPES.ABCDE_5]],
    6: [
        ['ABCDE', TYPES.ABCDE_6],
        ['AABBCC', TYPES.AABBCC_6],
        ['AAAABC', TYPES.AAAABC],
        ['AAABBB', TYPES.AAABBB]
    ],
    7: [
        ['ABCDE', TYPES.ABCDE_7],
    ],
    8: [
        ['ABCDE', TYPES.ABCDE_8],
        ['AAAB', TYPES.AAABBB_CD],
        ['AABBCC', TYPES.AABBCC_8],
        ['AAAABBCC', TYPES.AAAABBCC]
    ],
    9: [
        ['ABCDE', TYPES.ABCDE_9],
        ['AAABBB', TYPES.AAABBB_9]
    ],
    10: [
        ['ABCDE', TYPES.ABCDE_10],
        ['AABBCC', TYPES.AABBCC_10],
        ['AAABB', TYPES.AAABBBCCDD]
    ],
    11: [
        ['ABCDE', TYPES.ABCDE_11]
    ],
    12: [
        ['ABCDE', TYPES.ABCDE_12],
        ['AABBCC', TYPES.AABBCC_12],
        ['AAABBB', TYPES.AAABBB_12],
        ['AAAB', TYPES.AAABBB_CD_12]
    ],
    13: [],
    14: [['AABBCC', TYPES.AABBCC_14]],
    15: [
        ['AAABB', TYPES.AAABB_15],
        ['AAABBB', TYPES.AAABBB_15]
    ],
    16: [
        ['AABBCC', TYPES.AABBCC_16],
        ['AAAB', TYPES.AAABBB_CD_16]
    ],
    17: [],
    18: [
        ['AABBCC', TYPES.AABBCC_18],
        ['AAABBB', TYPES.AAABBB_18]
    ],
    19: [],
    20: [
        ['AABBCC', TYPES.AABBCC_20],
        ['AAABBB', TYPES.AAABBB_CD_20],
        ['AAABB', TYPES.AAABB_20],
    ]
}

export default function (cards) {
  var len = cards.length;
  var validators = cardValidator[len];
  if (len < 1 || len > 20 || !validators?.length) {
      return {
          status: false,
          len: len,
          types: []
      };
  }
  var ret = [];
  validators.forEach(function (array) {
      var type = array[0];
      var validator = array[1];
      var result = validator(cards);
      if (result.status) {
          result.type = type;
          ret.push({key:result.key,type:type});
      }
  });
  if (ret.length) {
      return {
          status: true,
          len: len,
          types: ret
      }
  } else {
      return {
          status: false,
          len: len,
          types: []
      };
  }
}
