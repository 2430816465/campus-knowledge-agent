/* Dialogue text is data; game.js owns presentation and gameplay effects. */
(function () {
  const MT = (window.MT = window.MT || {});
  MT.DIALOGUES = {
    common: {
      fairy: { speaker: '仙子', who: 'fairy', pages: ['往上走，别往下看。这座塔一共五十层，一层都不能跳。'] },
      thief: { speaker: '小偷', who: 'thief', pages: ['墙后面有路。看见可疑的墙，试着靠近观察。'] },
      elder: { speaker: '老人', who: 'elder', pages: ['十字架在手，亡者便是柴。塔里的不死系最怕它。'] },
      merchant: { speaker: '商人', who: 'merchant', pages: ['只要有门，就必然有守卫。想清楚再开门。'] },
      princess: { speaker: '公主', who: 'princess', pages: ['你终于来了。……可你确定，我就是你要找的公主吗？'] }
    },
    floor2: {
      thiefFirst: {
        speaker: '小偷', who: 'thief',
        pages: ['我们终于逃出来了。你的剑和盾被警卫拿走了，你必须先找到武器。', '我知道铁剑在5楼，铁盾在9楼，你最好先取到它们。我现在有事要做，没法帮你。再见。']
      },
      thiefReturn: {
        speaker: '小偷', who: 'thief',
        pages: ['哈哈，我们又见面了！谢谢你救了我。', '我可以帮你在魔龙前打开一条暗道。我现在就去35楼。']
      }
    }
  };
})();
