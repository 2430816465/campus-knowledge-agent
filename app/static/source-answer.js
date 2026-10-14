(function (root) {
  'use strict';
  function renderSourceAnswer(box, result) {
    if (result.mode !== 'verified_source_lookup' || !Array.isArray(result.source_sections) ||
        !result.source_sections.length || !result.source_sections.every(s => s && typeof s.title === 'string' && typeof s.text === 'string')) return false;
    box.textContent = '';
    const intro = document.createElement('p');
    intro.textContent = '原文直达：完整保留已收录正文，未生成摘要。' +
      (result.lookup_needs_version ? '存在多个年度/学期，请选择所问通知，勿将旧安排当作本次安排。' :
       result.source_sections.length > 1 ? '不同版本分别展示，请核实适用版本，勿拼接使用。' : '');
    box.appendChild(intro);
    result.source_sections.forEach((section, index) => {
      const details = document.createElement('details');
      details.className = 'source-notice';
      details.open = index === 0 && !result.lookup_needs_version;
      const summary = document.createElement('summary');
      summary.textContent = section.title + ' · 网页发布 ' + (section.published_at || '日期未知') + ' · 展开完整正文';
      const body = document.createElement('div');
      body.className = 'source-notice-body';
      body.textContent = section.text;
      details.appendChild(summary);
      details.appendChild(body);
      box.appendChild(details);
    });
    const footer = document.createElement('p');
    footer.textContent = '附件内容请打开原件核对。请核对来源日期和适用范围；未经教师审核的关键规则不作为资格或认定结论。';
    box.appendChild(footer);
    return true;
  }
  root.campusSourceAnswer = renderSourceAnswer;
  if (typeof module !== 'undefined') module.exports = { renderSourceAnswer };
})(typeof window === 'undefined' ? globalThis : window);
