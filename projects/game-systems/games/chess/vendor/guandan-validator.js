// Adapted from TypeThe0ry/CardRoomPro, MIT, revision 64753e936e4200c58eca7992ce1e9d4bb8184ec8. See CardRoomPro-LICENSE.txt.
const HEART_TYPE = 2;
const SEQUENCE_ORDER = [14, 15, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function randomIndex(max) {
  return Math.floor(Math.random() * (max + 1));
}

function nextPos(posId) {
  return (Number(posId) + 1) % 4;
}

function makeDeck() {
  const cards = [];
  for (let deck = 0; deck < 2; deck++) {
    for (let value = 3; value <= 15; value++) {
      for (let type = 0; type < 4; type++) {
        cards.push({ value, type, deck });
      }
    }
    cards.push({ value: 16, type: 0, deck });
    cards.push({ value: 17, type: 0, deck });
  }
  return cards;
}

function cardKey(card) {
  return [card.value, card.type, card.deck == null ? 0 : card.deck].join('_');
}

function sortCards(cards) {
  return cards.sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    if (a.type !== b.type) return a.type - b.type;
    return (a.deck || 0) - (b.deck || 0);
  });
}

function labelValue(value) {
  if (value === 11) return 'J';
  if (value === 12) return 'Q';
  if (value === 13) return 'K';
  if (value === 14) return 'A';
  if (value === 15) return '2';
  return String(value);
}

function isWild(card, levelRank) {
  return card.value === levelRank && card.type === HEART_TYPE;
}

function countValues(cards) {
  const counts = {};
  cards.forEach(card => {
    counts[card.value] = (counts[card.value] || 0) + 1;
  });
  return counts;
}

function sameSuit(cards) {
  if (!cards.length) return false;
  return cards.every(card => card.type === cards[0].type && card.value < 16);
}

function canBuildSameKind(cards, wildCount, size) {
  const normals = cards.filter(c => !c.__wild);
  const counts = countValues(normals);
  const values = Object.keys(counts).map(Number).filter(v => v < 16);
  if (normals.some(c => c.value >= 16)) return { ok: normals.length === size && new Set(normals.map(c => c.value)).size === 1, key: normals[0]?.value };
  if (!values.length) {
    return { ok: wildCount >= size, key: 0 };
  }
  if (values.length !== 1) return { ok: false };
  const v = values[0];
  return { ok: counts[v] + wildCount >= size, key: v };
}

function canBuildUnitSequence(cards, wildCount, unitSize, unitCount) {
  const normals = cards.filter(c => !c.__wild);
  const counts = countValues(normals);
  const values = Object.keys(counts).map(Number);
  if (normals.some(c => c.value >= 16)) return { ok: false };
  if (values.some(v => counts[v] > unitSize)) return { ok: false };
  for (let start = SEQUENCE_ORDER.length - unitCount; start >= 0; start--) {
    const seq = SEQUENCE_ORDER.slice(start, start + unitCount);
    let need = 0;
    seq.forEach(v => { need += Math.max(0, unitSize - (counts[v] || 0)); });
    if (need <= wildCount && values.every(v => seq.includes(v))) {
      return { ok: true, key: start };
    }
  }
  return { ok: false };
}

function canBuildPairsSequence(cards, wildCount, pairCount) {
  return canBuildUnitSequence(cards, wildCount, 2, pairCount);
}

function canBuildTriplesSequence(cards, wildCount, tripleCount) {
  return canBuildUnitSequence(cards, wildCount, 3, tripleCount);
}

function canBuildStraight(cards, wildCount, len) {
  return canBuildUnitSequence(cards, wildCount, 1, len);
}

function rawAnalyze(cards, levelRank) {
  const cloned = cards.map(c => Object.assign({}, c, { __wild: isWild(c, levelRank) }));
  const wildCount = cloned.filter(c => c.__wild).length;
  const normals = cloned.filter(c => !c.__wild);
  const len = cloned.length;
  const values = normals.map(c => c.value);
  const counts = countValues(normals);
  const countVals = Object.keys(counts).map(Number);

  if (!len) return { status: false };

  const jokers = cloned.filter(c => c.value >= 16);
  if (len === 4 && jokers.length === 4) {
    return { status: true, len, key: 99, type: 'JOKER_BOMB', bomb: true, bombPower: 100 };
  }

  const sameKind = canBuildSameKind(cloned, wildCount, len);
  if (len >= 4 && sameKind.ok) {
    return { status: true, len, key: sameKind.key, type: 'BOMB', bomb: true, bombPower: len };
  }

  if (len === 5 && sameSuit(normals)) {
    const straight = canBuildStraight(cloned, wildCount, 5);
    if (straight.ok) {
      return { status: true, len, key: straight.key, type: 'STRAIGHT_FLUSH', bomb: true, bombPower: 5.5 };
    }
  }

  if (len === 1) return { status: true, len, key: cloned[0].value, type: 'SINGLE' };

  if (len === 2) {
    const pair = canBuildSameKind(cloned, wildCount, 2);
    if (pair.ok) return { status: true, len, key: pair.key, type: 'PAIR' };
  }

  if (len === 3) {
    const triple = canBuildSameKind(cloned, wildCount, 3);
    if (triple.ok) return { status: true, len, key: triple.key, type: 'TRIPLE' };
  }

  if (len === 5) {
    const straight = canBuildStraight(cloned, wildCount, 5);
    if (straight.ok) return { status: true, len, key: straight.key, type: 'STRAIGHT' };

    for (const tripleValue of [levelRank,14,13,12,11,10,9,8,7,6,5,4,3,15].filter((v,i,a)=>a.indexOf(v)===i)) {
      const tripleNeed = Math.max(0, 3 - (counts[tripleValue] || 0));
      if (tripleNeed > wildCount) continue;
      const leftWild = wildCount - tripleNeed;
      const rest = normals.filter(c => c.value !== tripleValue);
      const restCounts = countValues(rest);
      const pairValue = Object.keys(restCounts).map(Number).find(v => Object.keys(restCounts).length === 1 && restCounts[v] + leftWild === 2 && v !== tripleValue && (v < 16 || leftWild === 0));
      if (pairValue || (rest.length === 0 && leftWild >= 2)) {
        return { status: true, len, key: tripleValue, type: 'FULL_HOUSE' };
      }
    }
  }

  if (len === 6) {
    const pairs = canBuildPairsSequence(cloned, wildCount, 3);
    if (pairs.ok) return { status: true, len, key: pairs.key, type: 'PAIRS_SEQ' };
  }

  if (len === 6) {
    const triples = canBuildTriplesSequence(cloned, wildCount, 2);
    if (triples.ok) return { status: true, len, key: triples.key, type: 'TRIPLES_SEQ' };
  }

  return { status: false };
}

function canBeat(current, last) {
  if (!last || !last.len) return true;
  if (current.bomb || last.bomb) {
    if (!current.bomb) return false;
    if (!last.bomb) return true;
    if (current.bombPower !== last.bombPower) return current.bombPower > last.bombPower;
    return current.key > last.key;
  }
  return current.type === last.type && current.len === last.len && current.key > last.key;
}


export function analyze(cards, levelRank) {
 const r=rawAnalyze(cards,levelRank);
 if(r.status && ["SINGLE","PAIR","TRIPLE","FULL_HOUSE","BOMB"].includes(r.type)) {
  if(r.key===0)r.key=levelRank;
  r.rank=r.key; r.key=r.key>=16?r.key+2:r.key===levelRank?17:r.key===15?2:r.key;
 }
 return r;
}
export {canBeat};
