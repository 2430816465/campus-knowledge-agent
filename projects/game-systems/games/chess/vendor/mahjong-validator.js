// Adapted from TypeThe0ry/CardRoomPro, MIT, revision 64753e936e4200c58eca7992ce1e9d4bb8184ec8. See CardRoomPro-LICENSE.txt.
// 四人麻将的服务端牌局模型。
// 采用 136 张标准牌，支持摸牌、出牌、吃、碰、明杠、暗杠和基础牌型胡牌。
// 牌面 value 为 0-33：万 0-8、条 9-17、筒 18-26、风牌 27-30、三元牌 31-33。

const TILE_COUNT = 34;
const PLAYER_COUNT = 4;

function cloneCard(card) {
  return card ? { value: card.value, type: card.type || 0 } : null;
}

function sameTile(a, b) {
  return !!a && !!b && Number(a.value) === Number(b.value);
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
  return cards;
}

function makeDeck() {
  const deck = [];
  for (let value = 0; value < TILE_COUNT; value++) {
    for (let copy = 0; copy < 4; copy++) deck.push({ value, type: 0 });
  }
  return shuffle(deck);
}

function countsFor(cards) {
  const counts = Array(TILE_COUNT).fill(0);
  (cards || []).forEach(card => {
    if (card && Number.isInteger(Number(card.value)) && Number(card.value) >= 0 && Number(card.value) < TILE_COUNT) {
      counts[Number(card.value)]++;
    }
  });
  return counts;
}

function isSuit(value) {
  return value >= 0 && value < 27;
}

function canTakeSequence(value) {
  return isSuit(value) && value % 9 <= 6;
}

// 检查一组牌是否能拆成指定数量的顺子/刻子，并留出一对将。
function isStandardWinning(cards, meldCount) {
  const counts = countsFor(cards);
  const needMelds = Math.max(0, Number(meldCount) || 0);
  const total = cards.length + needMelds * 3;
  if (total !== 14) return false;

  function removeMelds(left, groups) {
    if (groups === 0) return left.every(n => n === 0);
    let first = -1;
    for (let i = 0; i < left.length; i++) {
      if (left[i]) { first = i; break; }
    }
    if (first < 0) return false;

    if (left[first] >= 3) {
      left[first] -= 3;
      if (removeMelds(left, groups - 1)) return true;
      left[first] += 3;
    }

    if (canTakeSequence(first) && left[first + 1] && left[first + 2]) {
      left[first]--;
      left[first + 1]--;
      left[first + 2]--;
      if (removeMelds(left, groups - 1)) return true;
      left[first]++;
      left[first + 1]++;
      left[first + 2]++;
    }
    return false;
  }

  for (let pair = 0; pair < counts.length; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    if (removeMelds(counts, 4 - needMelds)) return true;
    counts[pair] += 2;
  }
  return false;
}


export {isStandardWinning};
