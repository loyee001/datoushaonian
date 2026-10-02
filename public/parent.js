const parentIcons = {
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><path d="M17 4.7A8.2 8.2 0 0 0 5 18.5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  spark: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/>',
  note: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
};

function glyph(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parentIcons[name] || parentIcons.spark}</svg>`;
}

const attendanceLabels = { present: '已到课', arrived: '已到课', late: '迟到', leave: '请假', absent: '缺席', pending: '待点名' };
const periodLabels = { day: '本次课堂评价', daily: '本次课堂评价', week: '周评价', weekly: '周评价', month: '月评价', monthly: '月评价' };

/** Shared course link. Matched child information exists in memory only. */
export async function initParent({ api, esc }) {
  const mount = document.querySelector('#app');
  if (!mount) return;
  const escape = esc || ((value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const e = (value) => escape(String(value ?? ''));
  const sessionId = new URLSearchParams(location.search).get('id') || '';
  let session = null;
  let matchedChildren = [];
  let selectedChild = 0;
  let suffix = '';
  let needsMoreDigits = false;
  let submitting = false;
  let formMessage = '';

  function shell(content) {
    mount.innerHTML = `<div class="parent-page">
      <div class="parent-stars" aria-hidden="true"></div>
      <header class="parent-topbar">
        <div class="parent-brand"><span class="parent-brand-mark">${glyph('orbit')}</span><div><strong>大头少年</strong><span>点亮每一次探索</span></div></div>
        <span class="parent-mode"><i></i> 家长空间</span>
      </header>
      <main class="parent-main">${content}</main>
      <footer class="parent-footer"><span class="parent-footer-line"></span><span>每一个小小的发现，都值得被看见</span><span class="parent-footer-line"></span></footer>
    </div>`;
    mount.querySelectorAll('img[data-parent-avatar]').forEach((img) => {
      img.addEventListener('error', () => { img.replaceWith(document.createTextNode(img.dataset.fallback || '星')); }, { once: true });
    });
  }

  function courseMeta() {
    return `<div class="parent-course-meta"><span>${glyph('calendar')}${e(session?.date || '日期待定')}</span><span>${glyph('clock')}${e(session?.startTime || '--:--')} – ${e(session?.endTime || '--:--')}</span></div>`;
  }

  function courseHeading() {
    return `<div class="parent-course-heading"><span class="parent-eyebrow"><i></i> 课堂探索记录 <span>/ COURSE LOG</span></span><h1>${e(session?.title || '课堂学习反馈')}</h1><p>本次课程的学习内容与老师评价</p>${courseMeta()}</div>`;
  }

  function showError() {
    shell(`<section class="parent-notice parent-panel"><span class="parent-large-icon">${glyph('note')}</span><span class="parent-eyebrow">课堂链接</span><h1>暂时无法打开课堂</h1><p>请检查老师分享的链接是否完整，或联系老师重新获取。</p><button class="parent-primary" id="parent-reload">重新加载 ${glyph('arrow')}</button></section>`);
    mount.querySelector('#parent-reload').addEventListener('click', () => location.reload());
  }

  function showLookup() {
    shell(`<div class="parent-entry">
      <section class="parent-welcome">${courseHeading()}
        <div class="parent-orbit-art" aria-hidden="true"><div class="parent-orbit-ring ring-one"></div><div class="parent-orbit-ring ring-two"></div><div class="parent-orbit-ring ring-three"></div><div class="parent-orbit-center">${glyph('spark')}</div><span class="parent-orbit-dot dot-one"></span><span class="parent-orbit-dot dot-two"></span><span class="parent-orbit-label">EXPLORE · CREATE · GROW</span></div>
        <p class="parent-welcome-copy">一次新的探索，一点新的成长。<br>看看孩子在这节课里的发现与收获。</p>
      </section>
      <section class="parent-lookup parent-panel" aria-labelledby="parent-lookup-title">
        <div class="parent-panel-topline"><span>家长验证</span><span>01 / 02</span></div>
        <span class="parent-large-icon">${glyph('lock')}</span><h2 id="parent-lookup-title">查看孩子的课堂反馈</h2><p class="parent-muted">输入登记的家长手机号${needsMoreDigits ? '更多末尾位数' : '后 4 位'}，<br>开启本次课程的成长记录。</p>
        <form id="parent-lookup-form" novalidate>
          <label for="parent-phone-suffix">${needsMoreDigits ? '补充手机号末尾位数' : '家长手机号后 4 位'}</label>
          <div class="parent-phone-control"><span aria-hidden="true">${needsMoreDigits ? '…' : '••• ••••'}</span><input id="parent-phone-suffix" name="suffix" type="text" inputmode="numeric" pattern="[0-9]{4,11}" minlength="4" maxlength="11" autocomplete="off" spellcheck="false" placeholder="${needsMoreDigits ? '继续输入更多位数' : '输入后 4 位'}" value="${e(suffix)}" aria-describedby="parent-form-help parent-form-message" required ${submitting ? 'disabled' : ''}></div>
          <p class="parent-form-help" id="parent-form-help">${needsMoreDigits ? '末尾位数重复，请补充更多位数，必要时输入完整手机号。' : '请使用报名时登记的手机号，验证后查看孩子的反馈。'}</p>
          <p class="parent-form-message" id="parent-form-message" role="status" aria-live="polite">${e(formMessage)}</p>
          <button type="submit" class="parent-primary" ${submitting ? 'disabled' : ''}>${submitting ? '正在查找…' : '查看课堂反馈'} ${glyph('arrow')}</button>
        </form>
        <div class="parent-privacy">${glyph('lock')}<span>验证通过后，仅展示您孩子的课堂反馈</span></div>
      </section>
    </div>`);
    const input = mount.querySelector('#parent-phone-suffix');
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 11); suffix = input.value; });
    mount.querySelector('#parent-lookup-form').addEventListener('submit', submitLookup);
  }

  async function submitLookup(event) {
    event.preventDefault();
    if (submitting) return;
    suffix = mount.querySelector('#parent-phone-suffix').value.trim();
    if (!/^\d{4,11}$/.test(suffix)) {
      formMessage = '请输入手机号末尾的 4 至 11 位数字。';
      showLookup();
      mount.querySelector('#parent-phone-suffix').focus();
      return;
    }
    submitting = true;
    formMessage = '';
    showLookup();
    try {
      const result = await api('/api/parent/lookup', { method: 'POST', body: { sessionId, suffix } });
      if (result.needsMoreDigits) {
        needsMoreDigits = true;
        formMessage = '这个尾号有重复，请补充更多位数后再次验证。';
      } else if (Array.isArray(result.children) && result.children.length) {
        matchedChildren = result.children;
        session = { ...session, ...(result.session || {}) };
        suffix = '';
        selectedChild = 0;
        submitting = false;
        showResult();
        return;
      } else {
        formMessage = '暂未找到对应的课堂记录，请核对号码或联系老师。';
      }
    } catch (error) {
      formMessage = error.status === 429 ? '尝试次数较多，请稍后再试。' : '暂未找到对应的课堂记录，请核对号码或联系老师。';
    }
    submitting = false;
    showLookup();
    mount.querySelector('#parent-phone-suffix').focus();
  }

  function avatar(child, small = false) {
    const name = child.name || child.nickname || '星';
    const fallback = Array.from(name).slice(-1).join('');
    const source = String(child.avatar || '');
    // Uploaded raster images and local image routes are supported; never inject SVG or arbitrary HTML.
    const safe = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(source) || /^\/uploads\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(source);
    return `<span class="parent-avatar ${small ? 'parent-avatar-small' : ''}">${safe ? `<img data-parent-avatar data-fallback="${e(fallback)}" src="${e(source)}" alt="${e(name)}的头像">` : e(fallback)}</span>`;
  }

  function attendance(child) {
    const status = typeof child.attendance === 'string' ? child.attendance : child.attendance?.status;
    const normalized = Object.hasOwn(attendanceLabels, status) ? status : 'pending';
    return `<span class="parent-attendance parent-attendance-${e(normalized)}">${glyph(normalized === 'present' || normalized === 'arrived' ? 'check' : 'clock')}${e(attendanceLabels[normalized])}</span>`;
  }

  function childProject(child) {
    const details = [
      child.groupName ? `<div><dt>所属小队</dt><dd>${e(child.groupName)}</dd></div>` : '',
      child.projectName ? `<div><dt>项目</dt><dd>${e(child.projectName)}</dd></div>` : '',
    ].filter(Boolean);
    return details.length ? `<dl class="parent-child-project">${details.join('')}</dl>` : '';
  }

  function reviewCard(review, index) {
    const range = review.periodStart ? `${review.periodStart}${review.periodEnd && review.periodEnd !== review.periodStart ? ` 至 ${review.periodEnd}` : ''}` : session.date;
    const tags = Array.isArray(review.tags) ? review.tags : [];
    return `<article class="parent-review parent-panel"><div class="parent-section-heading"><span class="parent-section-icon">${glyph('note')}</span><div><span class="parent-eyebrow">TEACHER'S NOTE <span>/ ${String(index + 1).padStart(2, '0')}</span></span><h3>${e(periodLabels[review.type] || '课堂评价')}</h3></div><span class="parent-review-date">${e(range)}</span></div>
      ${tags.length ? `<div class="parent-tags">${tags.map((tag) => `<span>${glyph('check')}${e(tag)}</span>`).join('')}</div>` : ''}
      <p class="parent-review-text">${e(review.text || '老师已发布本次评价。')}</p>
      <div class="parent-teacher-signature"><span class="parent-signature-line"></span>${e(review.teacherName || '授课老师')}</div></article>`;
  }

  function showResult() {
    const child = matchedChildren[selectedChild];
    const reviews = Array.isArray(child.reviews) ? child.reviews.filter((review) => review.published !== false) : [];
    shell(`<div class="parent-result-toolbar"><button class="parent-back" id="parent-change-account">${glyph('back')} 返回验证</button><span>${glyph('lock')} 手机号核对通过</span></div>
      <section class="parent-result-header">${courseHeading()}<span class="parent-result-decoration" aria-hidden="true">${glyph('orbit')}</span></section>
      ${matchedChildren.length > 1 ? `<div class="parent-child-switch"><p>选择要查看的孩子</p><div role="group" aria-label="选择孩子">${matchedChildren.map((entry, index) => `<button class="${index === selectedChild ? 'is-selected' : ''}" data-child-index="${index}" aria-pressed="${index === selectedChild}">${avatar(entry, true)}${e(entry.name)}</button>`).join('')}</div></div>` : ''}
      <section class="parent-child-banner parent-panel">${avatar(child)}<div class="parent-child-name"><span class="parent-eyebrow">本次成长记录</span><h2>${e(child.name)}${child.nickname ? `<span>${e(child.nickname)}</span>` : ''}</h2></div>${attendance(child)}${childProject(child)}</section>
      <div class="parent-report-grid">
        <section class="parent-learning parent-panel"><div class="parent-section-heading"><span class="parent-section-icon">${glyph('spark')}</span><div><span class="parent-eyebrow">TODAY'S DISCOVERY</span><h3>本次学习内容</h3></div></div><p class="parent-learning-content">${e(session.content || '老师正在整理本次课程内容，发布后即可查看。')}</p><div class="parent-learning-bottom" aria-hidden="true"><span>探索，让想象发生。</span>${glyph('orbit')}</div></section>
        <div class="parent-reviews">${reviews.length ? reviews.map(reviewCard).join('') : `<section class="parent-panel parent-empty-review"><span class="parent-large-icon">${glyph('note')}</span><h3>课堂评价正在路上</h3><p>老师发布后，您可以通过这个链接再次查看。</p></section>`}</div>
      </div>
      <p class="parent-end-note">${glyph('spark')} 让每一次探索，都成为成长的光。</p>`);
    mount.querySelector('#parent-change-account').addEventListener('click', () => {
      matchedChildren = [];
      selectedChild = 0;
      suffix = '';
      needsMoreDigits = false;
      formMessage = '';
      session = { id: session.id, title: session.title, date: session.date, startTime: session.startTime, endTime: session.endTime, published: session.published };
      showLookup();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    mount.querySelectorAll('[data-child-index]').forEach((button) => button.addEventListener('click', () => { selectedChild = Number(button.dataset.childIndex); showResult(); }));
  }

  shell('<section class="parent-loading"><span class="parent-loading-orbit" aria-hidden="true"></span><p role="status">正在连接课堂记录…</p></section>');
  if (!sessionId) { showError(); return; }
  try {
    const result = await api(`/api/parent/session/${encodeURIComponent(sessionId)}`);
    if (!result.session) throw new Error('Invalid session');
    session = result.session;
    showLookup();
  } catch { showError(); }
}
