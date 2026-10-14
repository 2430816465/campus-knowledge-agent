// Keep suggestions beside their own answer; choosing one restores that scope.
window.campusFollowups = function (questions, onChoose) {
  const group = document.createElement('section');
  group.className = 'followup-questions';
  group.setAttribute('aria-label', '你是否想问');
  const label = document.createElement('p');
  label.textContent = '你是否想问：';
  group.appendChild(label);
  for (const item of (questions || []).slice(0, 3)) {
    if (typeof item.question !== 'string' || !item.question.trim()) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet';
    button.textContent = item.question;
    button.addEventListener('click', () => {
      if (!document.getElementById('ask').disabled) onChoose(item);
    });
    group.appendChild(button);
  }
  return group.children.length > 1 ? group : null;
};
