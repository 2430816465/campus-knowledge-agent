(function (root) {
  'use strict';
  function safeURL(value) {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  }
  function renderAnswerView(box, result) {
    const view = result.answer_view;
    if (!view || !Array.isArray(view.paragraphs) || !Array.isArray(view.groups)) return false;
    const node = (tag, text, cls) => {
      const e = document.createElement(tag); if (text != null) e.textContent = text;
      if (cls) e.className = cls; return e;
    };
    const link = (title, url, cls) => {
      const href = safeURL(url); if (!href) return node('span', title, cls);
      const a = node('a', title, cls); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    };
    box.textContent = ''; box.classList.add('answer-card');
    const answer = node('section', null, 'assistant-answer');
    answer.appendChild(node('h3', view.label));
    if (view.context_note) answer.appendChild(node('p', view.context_note, 'context-interpretation'));
    const paragraph = text => node('p', text, text === '此处仅为摘录；完整条件、例外和其他版本请展开“原文对照”。' ? 'answer-notice' : null);
    if (view.paragraphs.join('').length > 450) {
      answer.appendChild(node('p', '这份回答涉及较多内容。请展开查看完整解释、条件与例外。'));
      const complete = node('details', null, 'complete-answer');
      complete.appendChild(node('summary', '展开完整回答（保留全部条件与例外）'));
      view.paragraphs.forEach(text => complete.appendChild(paragraph(text)));
      answer.appendChild(complete);
    } else {
      view.paragraphs.forEach(text => answer.appendChild(paragraph(text)));
    }
    if (view.scope_note) answer.appendChild(node('p', view.scope_note, 'answer-notice'));
    box.appendChild(answer);
    view.groups.forEach(group => {
      const section = node('section', null, 'answer-source-group');
      const details = node('details', null, 'original-comparison');
      details.appendChild(node('summary', (group.source_type === 'unverified' ? '未核实搜索线索 · ' : '原文对照 · ') + group.title));
      group.quotes.forEach(quote => {
        details.appendChild(node('p', '[' + quote.ref + '] ' + (quote.context || quote.location || '') + ' · 版本 ' + (quote.version ?? '未知') +
          ((quote.location || '').includes('OCR') ? ' · OCR候选，请核对原图' : ''), 'quote-location'));
        details.appendChild(node('blockquote', quote.text, 'source-quote'));
      });
      section.appendChild(details);
      const resources = node('div', null, 'source-resources');
      resources.appendChild(node('strong', '原网页与附件'));
      const official = group.source_type === 'official';
      const unverified = group.source_type === 'unverified';
      resources.appendChild(node('p', unverified ? '搜索线索 · 正文与发布机构未核实，未作为答案依据' : official ? '官网公开正文 · 适用范围请核对发布机构' : '已收录原文 · 审核状态见提示', 'source-provenance'));
      const original = link((official ? '官网原文：' : '原网页：') + group.title, group.url, 'resource-web');
      const href = safeURL(group.url);
      if (href) original.appendChild(node('span', '原网址：' + href, 'source-address'));
      resources.appendChild(original);
      if (group.checked_at) resources.appendChild(node('p', '正文读取于：' + group.checked_at + (group.cached ? ' · 60秒内缓存' : ' · 本次联网读取'), 'source-provenance'));
      (group.attachments || []).forEach(a => resources.appendChild(link('附件：' + a.title, a.url, 'resource-attachment')));
      section.appendChild(resources); box.appendChild(section);
    });
    if (view.notice) box.appendChild(node('p', view.notice, 'answer-notice'));
    return true;
  }
  root.campusAnswerView = renderAnswerView;
  if (typeof module !== 'undefined') module.exports = { renderAnswerView, safeURL };
})(typeof window === 'undefined' ? globalThis : window);
