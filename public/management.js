const states = {
  students: { search: '', groupId: '' },
  records: { start: '', end: '', studentId: '', groupId: '', type: '' },
};

const safeId = value => String(value ?? '');
const byId = (items, id) => (items || []).find(item => safeId(item.id) === safeId(id));
const sessionGroupIds = session => [...new Set((Array.isArray(session?.groupIds) ? session.groupIds : [session?.groupId]).filter(Boolean).map(safeId))];
const published = review => Boolean(review.published || review.publishedAt || review.isPublished || review.status === 'published');
const today = () => new Date().toLocaleDateString('en-CA');
const typeName = type => ({ day: '日评价', week: '周评价', month: '月评价' }[type] || '日评价');
const dateLabel = date => date ? String(date).slice(0, 10).replaceAll('-', '.') : '未设置';
const field = (label, input, hint = '') => `<label class="field"><span>${label}</span>${input}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
const empty = (title, detail, action = '') => `<div class="management-empty"><span class="empty-orbit" aria-hidden="true"></span><h3>${title}</h3><p>${detail}</p>${action}</div>`;
const icon = name => {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    history: '<path d="M3 4v5h5M3.5 9a9 9 0 1 1-.2 6M12 7v5l3 2"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  };
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.plus}</svg>`;
};

function avatar(student, esc, large = false) {
  const colorIndex = [...String(student.name || '')].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 5;
  const className = `management-avatar avatar-tone-${colorIndex}${large ? ' avatar-large' : ''}`;
  return /^data:image\/(png|jpeg|webp);base64,/i.test(student.avatar || '')
    ? `<img class="${className}" src="${esc(student.avatar)}" alt="${esc(student.name)}的头像">`
    : `<span class="${className}" aria-hidden="true">${esc(String(student.nickname || student.name || '学').slice(-1))}</span>`;
}

function groupOptions(groups, current, esc, emptyLabel = '全部项目组') {
  return `<option value="">${emptyLabel}</option>${groups.map(group => `<option value="${esc(group.id)}" ${safeId(current) === safeId(group.id) ? 'selected' : ''}>${esc(group.name)}</option>`).join('')}`;
}

function studentOptions(students, current, esc, emptyLabel = '全部学员') {
  return `<option value="">${emptyLabel}</option>${students.map(student => `<option value="${esc(student.id)}" ${safeId(current) === safeId(student.id) ? 'selected' : ''}>${esc(student.name)} · ${esc(student.studentNo)}</option>`).join('')}`;
}

function renderStudents(ctx) {
  const { data, esc } = ctx;
  const state = states.students;
  const students = data.students.filter(student => (!state.groupId || safeId(student.groupId) === state.groupId) && (!state.search || [student.name, student.nickname, student.studentNo, student.parentName, student.parentPhone].some(value => String(value || '').toLowerCase().includes(state.search.toLowerCase()))));
  return `<div class="management">
    <div class="management-heading"><div><div class="section-eyebrow">STUDENT ARCHIVE</div><h1>学员档案 <span class="heading-count">${data.students.length}</span></h1><p class="muted">每一份探索，都从认识孩子开始。</p></div><div class="management-heading-actions"><button type="button" class="button secondary" data-action="recent-deletions">${icon('history')}最近删除</button><button class="button primary" data-action="${data.groups.length ? 'student-add' : 'group-add-student'}">${icon('plus')}${data.groups.length ? '新增学员' : '先创建项目组'}</button></div></div>
    <section class="panel management-toolbar"><label class="management-search">${icon('search')}<input class="input" id="student-search" aria-label="搜索学员" placeholder="搜索姓名、学员编号或家长手机" value="${esc(state.search)}"></label><select class="input" id="student-group" aria-label="按项目组筛选学员">${groupOptions(data.groups, state.groupId, esc)}</select><span class="management-result-count">共 ${students.length} 位学员</span></section>
    <div id="students-grid" class="management-student-grid">${students.length ? students.map(student => {
      const group = byId(data.groups, student.groupId);
      return `<article class="panel management-student-card"><div class="student-card-top">${avatar(student, esc, true)}<div class="student-card-identity"><h2>${esc(student.name)} <small>${esc(student.nickname || '')}</small></h2><span class="student-code">${esc(student.studentNo)}</span></div><button class="button management-icon-button secondary" data-action="student-edit" data-id="${esc(student.id)}" aria-label="编辑${esc(student.name)}档案">${icon('edit')}</button></div><div class="student-meta"><span>${esc(student.grade || '未填年级')}</span><span>${esc(student.gender || '未填性别')}</span></div><div class="student-project"><span class="project-marker" aria-hidden="true"></span><div><strong>${esc(group?.name || '尚未分组')}</strong><span>${esc(group?.projectName || '加入一个项目，开启探索')}</span></div></div><dl class="student-family"><div><dt>家长</dt><dd>${esc(student.parentName || '未填写')}</dd></div><div><dt>联系电话</dt><dd class="tabular">${esc(student.parentPhone || '未填写')}</dd></div></dl><div class="student-bottom-actions"><button type="button" class="student-edit-link" data-action="student-edit" data-id="${esc(student.id)}">查看与编辑档案 <span aria-hidden="true">↗</span></button><button type="button" class="delete-text-button" data-action="student-delete" data-id="${esc(student.id)}" aria-label="删除学员${esc(student.name)}">删除学员</button></div></article>`;
    }).join('') : !data.groups.length ? empty('先创建项目组，再添加学员', '先设置项目名称，再录入孩子与家长的信息。', '<button class="button primary" data-action="group-add-student">创建第一个项目组</button>') : empty(state.search || state.groupId ? '没有找到匹配学员' : '建立第一份学员档案', state.search || state.groupId ? '调整搜索词或项目组筛选后重试。' : '点击“新增学员”，录入孩子与家长的信息。')}</div>
  </div>`;
}

function renderProjects(ctx) {
  const { data, esc } = ctx;
  const sessions = [...data.sessions].sort((a, b) => String(b.date + b.startTime).localeCompare(String(a.date + a.startTime)));
  return `<div class="management"><div class="management-heading"><div><div class="section-eyebrow">MISSION CONTROL</div><h1>项目与课程</h1><p class="muted">把一个好奇的想法，变成一次有准备的课堂。</p></div><div class="management-heading-actions"><button type="button" class="button secondary" data-action="recent-deletions">${icon('history')}最近删除</button><button class="button primary" data-action="group-add">${icon('plus')}新建项目组</button></div></div>
    <div class="management-group-grid">${data.groups.length ? data.groups.map(group => {
      const count = data.students.filter(student => safeId(student.groupId) === safeId(group.id)).length;
      return `<article class="panel management-group-card"><div class="group-card-header"><span class="group-orbit" aria-hidden="true"><span></span></span><span class="badge">${count} 位学员</span></div><h2>${esc(group.name)}</h2><p class="group-project-name">${esc(group.projectName || '待设置项目名称')}</p><p class="group-description">${esc(group.introduction || '为这个项目添加一段介绍，记录孩子们要探索的方向。')}</p><div class="group-card-footer"><span class="muted">队长 <strong>${esc(group.captain || '未设置')}</strong></span><button class="button secondary" data-action="group-edit" data-id="${esc(group.id)}">编辑项目</button></div><div class="group-next-actions"><button class="button secondary" data-action="student-add" data-group-id="${esc(group.id)}">${icon('plus')}新增学员</button><button class="button primary" data-action="session-add" data-group-id="${esc(group.id)}">${icon('calendar')}安排课程</button></div><div class="group-delete-action"><button type="button" class="delete-text-button" data-action="group-delete" data-id="${esc(group.id)}" aria-label="删除项目组${esc(group.name)}">${icon('trash')}删除项目组</button></div></article>`;
    }).join('') : empty('创建你的第一个项目组', '创建项目组后，就可以添加学员和安排课程。', '<button class="button primary" data-action="group-add">创建项目组</button>')}</div>
    <section class="panel management-sessions"><div class="management-section-title"><div><div class="section-eyebrow">COURSE SCHEDULE</div><h2>课程安排 <span class="heading-count">${sessions.length}</span></h2></div><button class="button primary" data-action="${data.groups.length ? 'session-add' : 'group-add-session'}">${icon('calendar')}${data.groups.length ? '安排课程' : '先创建项目组'}</button></div>${sessions.length ? `<div class="management-table-wrap"><table class="management-table"><thead><tr><th>课程名称</th><th>项目组</th><th>上课日期</th><th>时间</th><th>学习内容</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${sessions.map(session => `<tr><td><strong>${esc(session.title)}</strong>${session.date === today() ? '<span class="badge today-badge">今天</span>' : ''}</td><td><div class="session-group-tags">${sessionGroupIds(session).map(id => `<span>${esc(byId(data.groups, id)?.name || '未知项目组')}</span>`).join('') || '未分组'}</div></td><td class="tabular">${dateLabel(session.date)}</td><td class="tabular">${esc(session.startTime || '--:--')}–${esc(session.endTime || '--:--')}</td><td><span class="table-summary" title="${esc(session.content || '')}">${esc(session.content || '待填写')}</span></td><td><button class="button secondary management-table-action" data-action="session-edit" data-id="${esc(session.id)}">编辑</button></td></tr>`).join('')}</tbody></table></div>` : empty('还没有安排课程', data.groups.length ? '一节课程可选择多个项目组，系统会带入所有参与学员。' : '先创建项目组，再设置上课日期和时间。')}</section>
  </div>`;
}

function reviewDates(review, data) {
  const session = byId(data.sessions, review.sessionId);
  return { start: String(review.periodStart || session?.date || review.createdAt || '').slice(0, 10), end: String(review.periodEnd || review.periodStart || session?.date || review.createdAt || '').slice(0, 10) };
}

function filteredReviews(data) {
  const filters = states.records;
  return [...data.reviews].filter(review => {
    const student = byId(data.students, review.studentId);
    const dates = reviewDates(review, data);
    return (!filters.start || dates.end >= filters.start) && (!filters.end || dates.start <= filters.end) && (!filters.studentId || safeId(review.studentId) === filters.studentId) && (!filters.groupId || safeId(student?.groupId) === filters.groupId) && (!filters.type || review.type === filters.type);
  }).sort((a, b) => reviewDates(b, data).start.localeCompare(reviewDates(a, data).start));
}

function renderRecords(ctx) {
  const { data, esc } = ctx;
  const state = states.records;
  const reviews = filteredReviews(data);
  const students = state.groupId ? data.students.filter(student => safeId(student.groupId) === state.groupId) : data.students;
  const query = new URLSearchParams(Object.fromEntries(Object.entries(state).filter(([, value]) => value)));
  return `<div class="management"><div class="management-heading"><div><div class="section-eyebrow">LEARNING LOG</div><h1>评价记录</h1><p class="muted">记录每一次进步，让成长被看见。</p></div><div class="management-heading-actions"><a class="button secondary" href="/api/export?${query}" download>${icon('export')}导出评价</a><button class="button primary" data-action="review-add">${icon('plus')}新增评价</button></div></div>
    <section class="panel management-record-filters"><div class="management-date-range">${field('开始日期', `<input class="input" type="date" id="record-start" value="${esc(state.start)}">`)}<span class="range-dash">—</span>${field('结束日期', `<input class="input" type="date" id="record-end" value="${esc(state.end)}">`)}</div>${field('项目组', `<select class="input" id="record-group">${groupOptions(data.groups, state.groupId, esc)}</select>`)}${field('学员', `<select class="input" id="record-student">${studentOptions(students, state.studentId, esc)}</select>`)}${field('评价类型', `<select class="input" id="record-type"><option value="">全部类型</option>${['day', 'week', 'month'].map(type => `<option value="${type}" ${state.type === type ? 'selected' : ''}>${typeName(type)}</option>`).join('')}</select>`)}<button class="button secondary management-reset" data-action="record-reset">重置</button></section>
    <div class="management-record-meta"><span>共 <strong>${reviews.length}</strong> 条评价</span><span class="muted">草稿仅老师可见 · 导出格式为 Excel 可打开的 CSV</span></div>
    <div class="management-review-list">${reviews.length ? reviews.map(review => {
      const student = byId(data.students, review.studentId) || { name: '未知学员' };
      const dates = reviewDates(review, data);
      const session = byId(data.sessions, review.sessionId);
      return `<article class="panel management-review-card"><div class="review-card-top"><div class="review-student">${avatar(student, esc)}<div><h2>${esc(student.name)} <span class="review-type">${typeName(review.type)}</span></h2><p>${esc(byId(data.groups, student.groupId)?.name || '未分组')} <span>·</span> ${dateLabel(dates.start)}${dates.end && dates.end !== dates.start ? ` — ${dateLabel(dates.end)}` : ''}${session ? ` <span>·</span> ${esc(session.title)}` : ''}</p></div></div><span class="badge ${published(review) ? 'badge-published' : 'badge-draft'}">${published(review) ? '已发布' : '草稿'}</span></div>${(review.tags || []).length ? `<div class="review-tag-list">${review.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}<p class="review-body">${esc(review.text || '尚未填写评价内容')}</p><div class="review-card-footer"><span class="muted">${published(review) ? '家长可查看此评价' : '发布后家长可查看'}</span><div><button class="button secondary" data-action="review-edit" data-id="${esc(review.id)}">编辑评价</button>${!published(review) ? `<button class="button primary" data-action="review-publish" data-id="${esc(review.id)}">发布评价</button>` : ''}</div></div></article>`;
    }).join('') : empty('暂时没有评价记录', state.start || state.end || state.studentId || state.groupId || state.type ? '调整筛选条件，或为孩子新增一条评价。' : '课堂评价与周、月总结都会汇集在这里。')}</div>
  </div>`;
}

export function renderManagement(view, ctx) {
  if (states.students.groupId && !byId(ctx.data.groups, states.students.groupId)) states.students.groupId = '';
  if (states.records.groupId && !byId(ctx.data.groups, states.records.groupId)) states.records.groupId = '';
  if (states.records.studentId && !byId(ctx.data.students, states.records.studentId)) states.records.studentId = '';
  return ({ students: renderStudents, projects: renderProjects, records: renderRecords }[view] || renderStudents)(ctx);
}

function redraw(view, ctx, focusId) {
  const root = document.querySelector('#view-root');
  const focused = focusId && document.getElementById(focusId);
  const position = focused?.selectionStart;
  root.innerHTML = renderManagement(view, ctx);
  bindManagement(view, ctx);
  if (focusId) {
    const next = document.getElementById(focusId);
    next?.focus();
    if (typeof position === 'number') next?.setSelectionRange(position, position);
  }
}

async function save(ctx, path, method, body, message) {
  const result = await ctx.api(path, { method, body });
  ctx.closeModal();
  await ctx.reload();
  ctx.toast(message);
  return result;
}

function deletionCounts(data, type, entity) {
  const studentIds = new Set(type === 'student' ? [safeId(entity.id)] : data.students.filter(student => safeId(student.groupId) === safeId(entity.id)).map(student => safeId(student.id)));
  const groupSessions = type === 'group' ? data.sessions.filter(session => sessionGroupIds(session).includes(safeId(entity.id))) : [];
  const sessionIds = new Set(groupSessions.filter(session => sessionGroupIds(session).length === 1).map(session => safeId(session.id)));
  return {
    groups: type === 'group' ? 1 : 0,
    students: studentIds.size,
    sessions: sessionIds.size,
    sharedSessions: groupSessions.length - sessionIds.size,
    attendance: data.attendance.filter(item => studentIds.has(safeId(item.studentId)) || sessionIds.has(safeId(item.sessionId))).length,
    reviews: data.reviews.filter(item => studentIds.has(safeId(item.studentId)) || sessionIds.has(safeId(item.sessionId))).length,
  };
}

function countsSummary(counts = {}, type) {
  const number = key => Math.max(0, Number(counts[key]) || 0);
  return type === 'group'
    ? `${number('groups')} 个项目组 · ${number('students')} 位学员 · ${number('sessions')} 节独立课程 · ${number('attendance')} 条考勤 · ${number('reviews')} 条评价${number('sharedSessions') ? `；另有 ${number('sharedSessions')} 节共有课程保留` : ''}`
    : `${number('students')} 位学员 · ${number('attendance')} 条考勤 · ${number('reviews')} 条评价`;
}

function deletionModal(ctx, type, id) {
  const current = ctx.getContext?.() || ctx;
  const { data, esc } = current;
  const entity = byId(type === 'group' ? data.groups : data.students, id);
  if (!entity) throw new Error('这条记录已不存在，请刷新后重试');
  const label = type === 'group' ? '项目组' : '学员';
  const counts = deletionCounts(data, type, entity);
  const impact = type === 'group'
    ? '项目组及组内学员、相关考勤和评价将移入最近删除。仅该组参加的课程一并删除；其他小队也参加的课程会保留，并移除本组。家长将无法查看本组学员的课程反馈。'
    : '该学员的档案、考勤和评价将移入最近删除，家长将无法查看该学员的反馈。项目组、课程及其他组员保持不变。';
  current.modal(`删除${label}`, `<div class="management deletion-confirm"><p class="deletion-object">即将删除${label} <strong>${esc(entity.name)}</strong></p><div class="deletion-warning"><p>${impact}</p><p class="deletion-impact">${countsSummary(counts, type)}</p></div><p class="deletion-recovery-note">已保存记录可在“最近删除”中恢复；相关未保存编辑也会移除。</p>${field(`请输入${label}名称“${esc(entity.name)}”确认`, '<input class="input" name="confirmName" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="完整输入名称后才能删除">')}</div>`, async form => {
    const confirmName = String(new FormData(form).get('confirmName') || '');
    if (confirmName !== entity.name) throw new Error(`名称不一致，请完整输入“${entity.name}”`);
    await current.api(`/api/${type === 'group' ? 'groups' : 'students'}/${encodeURIComponent(entity.id)}`, { method: 'DELETE', body: { confirmName } });
    states.students.search = '';
    await current.reload();
    current.closeModal();
    current.toast(`${label}已移入最近删除，可随时在“最近删除”中恢复`);
  }, '确认删除');
  document.querySelector('#modal-form button[type="submit"]')?.classList.add('danger');
}

async function openRecentDeletions(ctx) {
  ctx.modal('最近删除', '<div class="management recently-deleted"><p class="recently-deleted-intro">删除的学员和项目组会保存在这里，恢复后可继续使用。</p><div id="deletion-list-status" class="form-error deletion-list-error" role="alert"></div><div id="deletion-list" class="deletion-list"><p class="muted">正在加载最近删除…</p></div></div>', null, null);
  const list = document.getElementById('deletion-list');
  await loadRecentDeletions(ctx, list);
}

async function loadRecentDeletions(ctx, list) {
  if (!list) return;
  const errorElement = document.getElementById('deletion-list-status');
  try {
    const current = ctx.getContext?.() || ctx;
    const { deletions } = await current.api('/api/deletions');
    if (document.getElementById('deletion-list') !== list) return;
    errorElement.textContent = '';
    list.innerHTML = deletions.length ? deletions.map(item => {
      const timestamp = new Date(item.deletedAt);
      const deletedAt = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('zh-CN', { hour12: false }) : '时间未知';
      return `<article class="deletion-record" data-deletion-row="${current.esc(item.id)}"><div class="deletion-record-title"><div><span class="badge">${item.type === 'group' ? '项目组' : '学员'}</span><h3>${current.esc(item.name)}</h3></div><button type="button" class="button secondary" data-restore-deletion="${current.esc(item.id)}">${icon('history')}恢复</button></div><p class="deletion-record-counts">${countsSummary(item.counts, item.type)}</p><p class="deletion-record-date">删除时间：${current.esc(deletedAt)}</p></article>`;
    }).join('') : empty('最近删除为空', '删除的学员和项目组会显示在这里。');
    list.querySelectorAll('[data-restore-deletion]').forEach(button => button.addEventListener('click', async () => {
      const buttons = [...list.querySelectorAll('[data-restore-deletion]')];
      buttons.forEach(item => { item.disabled = true; });
      errorElement.textContent = '';
      let restored = false;
      try {
        await current.api(`/api/deletions/${encodeURIComponent(button.dataset.restoreDeletion)}/restore`, { method: 'POST', body: {} });
        restored = true;
        button.closest('[data-deletion-row]')?.remove();
        await current.reload();
        await loadRecentDeletions(current.getContext?.() || current, list);
        current.toast('记录已恢复');
      } catch (error) {
        errorElement.textContent = restored ? `记录已恢复，但页面刷新失败：${error.message || '请重新加载页面'}` : error.message || '恢复失败，请稍后重试';
      } finally {
        buttons.forEach(item => { item.disabled = false; });
      }
    }));
  } catch (error) {
    if (document.getElementById('deletion-list') !== list) return;
    errorElement.textContent = error.message || '最近删除加载失败，请稍后重试';
    list.innerHTML = '<button type="button" class="button secondary" id="reload-deletions">重新加载</button>';
    document.getElementById('reload-deletions').onclick = () => loadRecentDeletions(ctx, list);
  }
}

function studentModal(ctx, student, defaults = {}) {
  const { data, esc } = ctx;
  if (!data.groups.length && !student) { groupModal(ctx, undefined, { next: 'student' }); return; }
  const value = name => esc(student?.[name] || '');
  let newAvatar = student?.avatar || '';
  const fields = `<div class="management management-form"><div class="management-avatar-upload"><div id="student-avatar-preview">${avatar(student || { name: '新' }, esc, true)}</div><div><label class="button secondary upload-button">上传头像<input type="file" name="avatarFile" id="student-avatar-file" accept="image/png,image/jpeg,image/webp"></label><p class="muted">JPG、PNG 或 WebP，最大 2 MB</p><button type="button" class="management-text-button" id="student-avatar-clear">使用默认头像</button></div></div><div class="management-form-grid">${field('学员编号 *', `<input class="input" name="studentNo" required maxlength="30" placeholder="例如 A007" value="${value('studentNo')}">`)}${field('孩子姓名 *', `<input class="input" name="name" required maxlength="30" value="${value('name')}">`)}${field('孩子绰号', `<input class="input" name="nickname" maxlength="30" value="${value('nickname')}">`)}${field('年级 *', `<input class="input" name="grade" required maxlength="20" placeholder="例如 三年级" value="${value('grade')}">`)}${field('性别', `<select class="input" name="gender"><option value="">请选择</option>${['男', '女'].map(option => `<option ${student?.gender === option ? 'selected' : ''}>${option}</option>`).join('')}</select>`)}${field('所属项目组 *', `<select class="input" name="groupId" required>${groupOptions(data.groups, student?.groupId ?? defaults.groupId, esc, '请选择项目组')}</select>`)}${field('家长姓名 *', `<input class="input" name="parentName" required maxlength="30" value="${value('parentName')}">`)}${field('家长手机号 *', `<input class="input" name="parentPhone" required type="tel" inputmode="numeric" pattern="1[0-9]{10}" maxlength="11" placeholder="11 位手机号" value="${value('parentPhone')}">`, '家长通过统一链接输入手机号尾号查看反馈。')}</div>${!data.groups.length ? '<p class="management-form-note">请先在“项目与课程”中创建项目组，再登记学员。</p>' : ''}</div>`;
  ctx.modal(student ? '编辑学员档案' : '新增学员', fields, async form => {
    const body = Object.fromEntries(new FormData(form));
    delete body.avatarFile;
    body.avatar = newAvatar;
    await save(ctx, student ? `/api/students/${encodeURIComponent(student.id)}` : '/api/students', student ? 'PUT' : 'POST', body, student ? '学员档案已更新' : '学员档案已建立');
  });
  const fileInput = document.getElementById('student-avatar-file');
  if (fileInput) fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      ctx.toast('请选择小于 2 MB 的 JPG、PNG 或 WebP 图片', 'error');
      fileInput.value = '';
      return;
    }
    try {
      newAvatar = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      document.getElementById('student-avatar-preview').innerHTML = avatar({ ...student, name: student?.name || '新学员', avatar: newAvatar }, esc, true);
    } catch { ctx.toast('头像读取失败，请重新选择图片', 'error'); }
  };
  const clear = document.getElementById('student-avatar-clear');
  if (clear) clear.onclick = () => { newAvatar = ''; if (fileInput) fileInput.value = ''; document.getElementById('student-avatar-preview').innerHTML = avatar({ ...student, name: student?.name || '新', avatar: '' }, esc, true); };
}

export function openNewGroup(ctx) {
  groupModal(ctx);
}

function groupModal(ctx, group, options = {}) {
  const { esc } = ctx;
  const value = name => esc(group?.[name] || '');
  ctx.modal(group ? '编辑项目组' : '新建项目组', `<div class="management management-form"><div class="management-form-grid">${field('项目组名称 *', `<input class="input" name="name" required maxlength="50" placeholder="例如 星光创作组" value="${value('name')}">`)}${field('项目名称 *', `<input class="input" name="projectName" required maxlength="80" placeholder="例如 AI 绘本创作" value="${value('projectName')}">`)}${field('队长', `<input class="input" name="captain" maxlength="30" placeholder="填写队长姓名" value="${value('captain')}">`)}</div>${field('项目介绍', `<textarea class="input" name="introduction" rows="4" maxlength="2000" placeholder="孩子们将在这个项目中学习和完成什么？">${value('introduction')}</textarea>`)}</div>`, async form => {
    const result = await save(ctx, group ? `/api/groups/${encodeURIComponent(group.id)}` : '/api/groups', group ? 'PUT' : 'POST', Object.fromEntries(new FormData(form)), group ? '项目组已更新' : '项目组已创建');
    const latestCtx = ctx.getContext?.() || ctx;
    if (!group && result?.group?.id) {
      const defaults = { groupId: result.group.id };
      if (options.next === 'student') studentModal(latestCtx, undefined, defaults);
      if (options.next === 'session') sessionModal(latestCtx, undefined, defaults);
    }
  });
}

export function openCourseGroups(ctx, sessionId) {
  const current = ctx.getContext?.() || ctx;
  const session = byId(current.data.sessions, sessionId);
  if (!session) throw new Error('这节课程已不存在，请刷新后重试');
  sessionModal(current, session);
}

function sessionModal(ctx, session, defaults = {}) {
  if (session && ctx.beforeSessionEdit && !ctx.beforeSessionEdit(session.id)) return;
  const { data, esc } = ctx;
  if (!data.groups.length && !session) { groupModal(ctx, undefined, { next: 'session' }); return; }
  const value = name => esc(session?.[name] || '');
  const selectedGroups = new Set(session ? sessionGroupIds(session) : [defaults.groupId].filter(Boolean).map(safeId));
  const groupChoices = data.groups.map(group => {
    const count = data.students.filter(student => safeId(student.groupId) === safeId(group.id)).length;
    return `<label class="session-group-choice"><input type="checkbox" name="groupIds" value="${esc(group.id)}" ${selectedGroups.has(safeId(group.id)) ? 'checked' : ''}><span><strong>${esc(group.name)}</strong><small>${count} 位学员${group.projectName ? ` · ${esc(group.projectName)}` : ''}</small></span></label>`;
  }).join('');
  ctx.modal(session ? '编辑课程安排' : '安排一节新课程', `<div class="management management-form">${field('课程名称 *', `<input class="input" name="title" required maxlength="100" placeholder="例如 提示词与角色设定" value="${value('title')}">`)}<fieldset class="session-group-picker"><legend>参与项目组 *</legend><p class="session-group-hint" id="session-group-hint">一个课程可选择多个小队，勾选本次参加的项目组。</p><div class="session-group-choices" aria-describedby="session-group-hint">${groupChoices}</div><p class="session-group-summary" id="session-group-summary" aria-live="polite"></p></fieldset><div class="management-form-grid">${field('上课日期 *', `<input class="input" type="date" name="date" required value="${esc(session?.date || today())}">`)}<div class="management-time-fields">${field('开始时间 *', `<input class="input" type="time" name="startTime" required value="${esc(session?.startTime || '16:00')}">`)}${field('结束时间 *', `<input class="input" type="time" name="endTime" required value="${esc(session?.endTime || '17:30')}">`)}</div></div>${field('本次学习内容', `<textarea class="input" name="content" rows="4" maxlength="5000" placeholder="本次课程所有小队共用的学习内容，可在上课后继续完善。">${value('content')}</textarea>`)}${session ? '<p class="management-form-note">已有考勤或评价的项目组需要保留，避免丢失课堂记录；可以继续添加其他项目组。</p>' : ''}</div>`, async form => {
    const formData = new FormData(form);
    const body = Object.fromEntries(formData);
    body.groupIds = formData.getAll('groupIds').map(safeId);
    if (!body.groupIds.length) throw new Error('请至少选择一个参与项目组');
    if (body.startTime >= body.endTime) { ctx.toast('结束时间需要晚于开始时间', 'error'); return; }
    body.published = Boolean(session?.published && body.content === session.content);
    await save(ctx, session ? `/api/sessions/${encodeURIComponent(session.id)}` : '/api/sessions', session ? 'PUT' : 'POST', body, session ? '课程安排已更新' : '新课程已安排');
  });
  const form = document.getElementById('modal-form');
  const updateGroupSummary = () => {
    const groupIds = new Set(new FormData(form).getAll('groupIds').map(safeId));
    const studentCount = data.students.filter(student => groupIds.has(safeId(student.groupId))).length;
    document.getElementById('session-group-summary').textContent = groupIds.size ? `已选择 ${groupIds.size} 个项目组，共 ${studentCount} 位学员` : '请选择至少一个项目组';
  };
  form.querySelectorAll('input[name="groupIds"]').forEach(input => input.addEventListener('change', updateGroupSummary));
  updateGroupSummary();
}

function reviewModal(ctx, review) {
  const { data, esc } = ctx;
  const dates = review ? reviewDates(review, data) : { start: today(), end: today() };
  const selectedStudent = review?.studentId || states.records.studentId || '';
  const type = review?.type || states.records.type || 'week';
  const renderSessionOptions = (studentId, sessionId) => {
    const student = byId(data.students, studentId);
    const sessions = student ? data.sessions.filter(session => sessionGroupIds(session).includes(safeId(student.groupId))) : [];
    return `<option value="">不关联具体课程</option>${sessions.map(session => `<option value="${esc(session.id)}" ${safeId(session.id) === safeId(sessionId) ? 'selected' : ''}>${dateLabel(session.date)} · ${esc(session.title)}</option>`).join('')}`;
  };
  ctx.modal(review ? '编辑评价' : '新增成长评价', `<div class="management management-form"><div class="management-form-grid">${field('选择学员 *', `<select class="input" name="studentId" id="review-student-select" required>${studentOptions(data.students, selectedStudent, esc, '请选择学员')}</select>`)}${field('评价类型 *', `<select class="input" name="type" id="review-type-select">${['day', 'week', 'month'].map(option => `<option value="${option}" ${type === option ? 'selected' : ''}>${typeName(option)}</option>`).join('')}</select>`)}${field('周期开始 *', `<input class="input" type="date" name="periodStart" required value="${esc(dates.start)}">`)}${field('周期结束 *', `<input class="input" type="date" name="periodEnd" required value="${esc(dates.end)}">`)}</div>${field('关联课程（日评价必选）', `<select class="input" name="sessionId" id="review-session-select" ${type === 'day' ? 'required' : ''}>${renderSessionOptions(selectedStudent, review?.sessionId)}</select>`)}${field('评价标签', `<input class="input" name="tags" maxlength="200" placeholder="主动探索、独立完成、乐于合作" value="${esc((review?.tags || []).join('、'))}">`, '多个标签用顿号或逗号分隔。')}${field('评价内容 *', `<textarea class="input" name="text" rows="5" required maxlength="10000" placeholder="记录孩子的表现、进步，以及下一步建议。">${esc(review?.text || '')}</textarea>`)}<p class="management-form-note">${review && published(review) ? '此评价已发布，保存修改后转为草稿，重新发布后家长可查看。' : '保存为草稿，确认后可在评价列表中发布。'}</p></div>`, async form => {
    const body = Object.fromEntries(new FormData(form));
    if (body.periodStart > body.periodEnd) { ctx.toast('周期结束不能早于开始日期', 'error'); return; }
    if (body.type === 'day') {
      const session = byId(data.sessions, body.sessionId);
      if (!session) { ctx.toast('请为日评价选择对应课程', 'error'); return; }
      if (body.periodStart !== session.date || body.periodEnd !== session.date) { ctx.toast('日评价的日期应与所选课程日期一致', 'error'); return; }
    }
    body.tags = body.tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean);
    body.sessionId = body.sessionId || null;
    body.published = false;
    await save(ctx, review ? `/api/reviews/${encodeURIComponent(review.id)}` : '/api/reviews', review ? 'PUT' : 'POST', body, review ? '评价已更新' : '评价草稿已保存');
  });
  const studentSelect = document.getElementById('review-student-select');
  const sessionSelect = document.getElementById('review-session-select');
  if (studentSelect && sessionSelect) studentSelect.onchange = () => { sessionSelect.innerHTML = renderSessionOptions(studentSelect.value, ''); };
  const syncSessionDate = () => {
    const session = byId(data.sessions, sessionSelect.value);
    const isDay = document.getElementById('review-type-select')?.value === 'day';
    sessionSelect.required = isDay;
    const form = sessionSelect.closest('form');
    if (form) {
      form.elements.periodStart.readOnly = isDay;
      form.elements.periodEnd.readOnly = isDay;
      if (session && isDay) { form.elements.periodStart.value = session.date; form.elements.periodEnd.value = session.date; }
    }
  };
  if (sessionSelect) {
    sessionSelect.onchange = syncSessionDate;
    document.getElementById('review-type-select').onchange = syncSessionDate;
    syncSessionDate();
  }
}

export function bindManagement(view, ctx) {
  const root = document.querySelector('#view-root');
  if (!root) return;
  root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    const { action, id, groupId } = button.dataset;
    try {
      if (action === 'student-add') studentModal(ctx, undefined, { groupId });
      if (action === 'student-edit') studentModal(ctx, byId(ctx.data.students, id));
      if (action === 'student-delete') deletionModal(ctx, 'student', id);
      if (action === 'group-add') groupModal(ctx);
      if (action === 'group-add-student') groupModal(ctx, undefined, { next: 'student' });
      if (action === 'group-add-session') groupModal(ctx, undefined, { next: 'session' });
      if (action === 'group-edit') groupModal(ctx, byId(ctx.data.groups, id));
      if (action === 'group-delete') deletionModal(ctx, 'group', id);
      if (action === 'recent-deletions') await openRecentDeletions(ctx);
      if (action === 'session-add') sessionModal(ctx, undefined, { groupId });
      if (action === 'session-edit') sessionModal(ctx, byId(ctx.data.sessions, id));
      if (action === 'review-add') reviewModal(ctx);
      if (action === 'review-edit') reviewModal(ctx, byId(ctx.data.reviews, id));
      if (action === 'review-publish') {
        button.disabled = true;
        await ctx.api(`/api/reviews/${encodeURIComponent(id)}/publish`, { method: 'POST', body: {} });
        await ctx.reload();
        ctx.toast('评价已发布，家长可以查看');
      }
      if (action === 'record-reset') { states.records = { start: '', end: '', studentId: '', groupId: '', type: '' }; redraw(view, ctx); }
    } catch (error) { ctx.toast(error.message || '操作失败，请稍后重试', 'error'); button.disabled = false; }
  }));
  if (view === 'students') {
    document.getElementById('student-search').oninput = event => { states.students.search = event.target.value; redraw(view, ctx, 'student-search'); };
    document.getElementById('student-group').onchange = event => { states.students.groupId = event.target.value; redraw(view, ctx); };
  }
  if (view === 'records') {
    const mapping = { 'record-start': 'start', 'record-end': 'end', 'record-group': 'groupId', 'record-student': 'studentId', 'record-type': 'type' };
    Object.entries(mapping).forEach(([id, key]) => {
      document.getElementById(id).onchange = event => {
        const next = event.target.value;
        if (key === 'start' && next && states.records.end && next > states.records.end || key === 'end' && next && states.records.start && next < states.records.start) { ctx.toast('结束日期不能早于开始日期', 'error'); event.target.value = states.records[key]; return; }
        states.records[key] = next;
        if (key === 'groupId') states.records.studentId = '';
        redraw(view, ctx);
      };
    });
  }
}
