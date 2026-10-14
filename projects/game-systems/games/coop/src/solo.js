(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-shared.js'));
  else root.RushSolo = factory(root.RushGame);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Game) {
  'use strict';
  const KEY = 'zcyg_solo_72_v1';
  const idle = () => ({ left: false, right: false, jump: false, interact: false });
  class Session {
    constructor(storage, onSaveError) {
      this.storage = storage;
      storage.removeItem?.('zcyg_solo_v1');
      this.onSaveError = onSaveError || (() => {});
      this.world = null;
      this.active = 0;
      this.input = idle();
      this.award = null;
      this.run = 0;
      this.savedTicks = 0;
      this.progress = { coins: 0, cleared: [], marks: {}, ownedSkins: ['default'], skin: 'default' };
      try {
        const saved = JSON.parse(storage.getItem(KEY) || 'null');
        if (saved && saved.version === 1) {
          this.progress.coins = Math.max(0, Number(saved.progress.coins) || 0);
          this.progress.cleared = [...new Set(saved.progress.cleared.filter(id => Number.isInteger(id) && Game.LEVELS.some(l => l.id === id)))];
          this.progress.marks = saved.progress.marks || {};
          const w = saved.world;
          if (w && Number.isInteger(w.levelIndex) && Game.LEVELS[w.levelIndex] &&
              Number.isInteger(w.roomIndex) && w.roomIndex >= 0 && (w.campaignVersion !== Game.CAMPAIGN_VERSION || w.roomIndex < (Game.LEVELS[w.levelIndex].rooms?.length || 1)) &&
              w.players?.length === 2 && w.players.every(p => p && ['x','y','vx','vy'].every(k => Number.isFinite(p[k]))) &&
              Array.isArray(w.boxes) && Array.isArray(w.lifts) && w.flags && w.plates && w.charges && w.sockets && w.transits?.length === 2 &&
              Number.isFinite(w.tick) && Number.isFinite(w.elapsed) && ['playing', 'intermission'].includes(w.phase)) {
            // Keep coins, unlocks and receipts; old geometry cannot resume in a remade map.
            this.world = w.campaignVersion !== Game.CAMPAIGN_VERSION
              ? Game.createWorld(w.levelIndex, w.run || 1, true) : w;
            this.active = saved.active === 1 ? 1 : 0;
            this.run = w.run || 0;
            this.award = saved.award || null;
            this.release();
          }
        }
      } catch (_) {
        this.world = null; this.award = null; this.active = 0; this.input = idle();
        this.progress = { coins: 0, cleared: [], marks: {}, ownedSkins: ['default'], skin: 'default' };
      }
    }
    start(index) {
      if (!Number.isInteger(index) || !Game.LEVELS[index]) throw new Error('关卡不存在');
      this.world = Game.createWorld(index, ++this.run, true);
      this.active = 0;
      this.award = null;
      this.release();
      this.save();
      return this.snapshot();
    }
    release() {
      this.input = idle();
      if (this.world) this.world.players.forEach(p => { p.input = idle(); p.jumpBuffer = 0; p.vx = 0; });
    }
    setInput(input) {
      const jumpPressed = this.input.jumpPressed || input.jumpPressed;
      const interactPressed = this.input.interactPressed || input.interactPressed;
      this.input = { ...idle(), ...input, jumpPressed: !!jumpPressed, interactPressed: !!interactPressed };
    }
    switchPlayer() {
      if (!this.world || this.world.phase !== 'playing') return;
      this.release();
      this.active = 1 - this.active;
    }
    step() {
      if (!this.world || this.world.phase !== 'playing') return;
      const inputs = [idle(), idle()];
      inputs[this.active] = this.input;
      Game.stepWorld(this.world, inputs, 1 / 60);
      this.input.jumpPressed = false;
      this.input.interactPressed = false;
      if (this.world.phase === 'intermission') this.settle();
      else if (++this.savedTicks >= 120) { this.savedTicks = 0; this.save(); }
    }
    settle() {
      const id = Game.LEVELS[this.world.levelIndex].id;
      const first = !this.progress.cleared.includes(id);
      const marks = { ...this.progress.marks[id], cleared: true };
      if (this.world.safeRun) marks.safeArrival = true;
      if (this.world.memorialFound) marks.keepsake = true;
      if (Game.nextLevelIndex(this.world.levelIndex) == null) marks.finaleBadge = true;
      if (first) { this.progress.cleared.push(id); this.progress.coins += 30; }
      this.progress.marks[id] = marks;
      // Stable first-clear IDs let the camp receipt survive reloads without paying twice.
      this.award = { id: first ? 'solo-first-' + id : null, base: first ? 30 : 0, adBonus: 0, first, marks };
      this.release();
      this.save();
    }
    next() {
      if (!this.world || this.world.phase !== 'intermission') return;
      const next = Game.nextLevelIndex(this.world.levelIndex);
      if(next == null) return;
      return this.start(next);
    }
    reset() {
      if (!this.world || this.world.phase !== 'playing') return;
      this.release();
      Game.respawnAll(this.world, '回到本关检查点');
      this.save();
    }
    save() {
      try { this.storage.setItem(KEY, JSON.stringify({ version: 1, progress: this.progress, world: this.world, active: this.active, award: this.award })); }
      catch (_) { this.onSaveError(); }
    }
    snapshot() {
      return { solo: true, phase: this.world?.phase || 'home', world: this.world, selectedLevel: this.world?.levelIndex || 0,
        wallet: this.progress, selfAward: this.award, players: [{ name: '1P', connected: true }, { name: '2P', connected: true }] };
    }
  }
  return { Session, KEY };
});
