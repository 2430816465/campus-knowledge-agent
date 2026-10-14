(function(root) {
  'use strict';
  function createChatTurn(log, role, text) {
    const user = role === 'user';
    const turn = document.createElement('article');
    turn.className = 'chat-turn ' + (user ? 'chat-turn-user' : 'chat-turn-assistant');
    const label = document.createElement('div');
    label.className = 'chat-role'; label.textContent = user ? '你' : '晓庄助手';
    turn.setAttribute('aria-label', label.textContent);
    const box = document.createElement('div');
    box.className = 'chat-message' + (user ? ' user' : ''); box.textContent = text;
    turn.appendChild(label); turn.appendChild(box); log.appendChild(turn);
    return {turn, box};
  }
  root.campusChatTurn = createChatTurn;
  if (typeof module !== 'undefined') module.exports = {createChatTurn};
})(typeof window === 'undefined' ? globalThis : window);
