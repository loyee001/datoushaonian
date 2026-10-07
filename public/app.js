import { renderManagement, bindManagement, openNewGroup, openCourseGroups } from './management.js';
import { initParent } from './parent.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
 robot:'<path d="M12 3v3M8 21v-2m8 2v-2M3 10v5m18-5v5"/><rect x="5" y="6" width="14" height="13" rx="5"/><path d="M9 11v2m6-2v2m-6 3h6"/><circle cx="12" cy="2" r="1"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6V2M3 10h18M7 14h2m4 0h3m-9 4h2m4 0h3"/>',
 users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3Zm13-17a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v3"/>',
 user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 folder:'<path d="M3 5h6l2 3h10v12H3Z"/>',
 note:'<path d="M14 2H5v20h14V7Zm0 0v5h5M8 11h8m-8 4h8m-8 4h5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
 book:'<path d="M12 5v16m0-16C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-3-1-6-2-10 1Z"/>',
 export:'<path d="M12 2v13m-5-5 5 5 5-5M3 15v6h18v-6"/>',
 link:'<path d="m10 8 3-3a5 5 0 0 1 7 7l-3 3m-3 1-3 3a5 5 0 0 1-7-7l3-3m2 6 6-6"/>',
 save:'<path d="M3 3h15l3 3v15H3Zm4 0v7h10V3M7 21v-7h10v7"/>',
 send:'<path d="m21 3-7 18-4-7-7-4Zm0 0L10 14"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 close:'<path d="m5 5 14 14M19 5 5 19"/>',
 logout:'<path d="M9 3H3v18h6m6-17 6 8-6 8M7 12h14"/>',
 spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
 edit:'<path d="m15 3 6 6-12 12H3v-6Zm-9 9 6 6M13 5l6 6"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
const cube = `<svg viewBox="0 0 200 176" fill="none" aria-hidden="true"><defs><linearGradient id="cube-light" x1="10" y1="0" x2="170" y2="180"><stop stop-color="#84fcff"/><stop offset="1" stop-color="#138aca"/></linearGradient></defs><g stroke="#158fc1" opacity=".38"><path d="m100 4 97 54-97 56L3 58Zm0 24 72 41-72 42-72-42Zm0 87 73-42 25 18-98 57L2 91l25-18"/><path d="M3 58v49l97 57 97-57V58M100 114v50"/></g><g stroke="url(#cube-light)" stroke-width="1.5"><path d="m100 28 45 26v51l-45 26-45-26V54Zm0 0v52m45-26-45 26-45-26m45 26v51"/><path d="m55 54 45 51 45-51m-90 51 45-25 45 25" opacity=".35"/></g><g fill="#abfcff"><circle cx="100" cy="28" r="3"/><circle cx="55" cy="54" r="2.5"/><circle cx="145" cy="54" r="3"/><circle cx="100" cy="80" r="4"/><circle cx="100" cy="131" r="3"/></g></svg>`;
const statusNames = {present:'已到',late:'迟到',leave:'请假',absent:'缺席',pending:'待点名'};
const state = { data:null, view:'today', sessionId:'', groupId:'', studentId:'', type:'day', search:'', drafts:new Map(), contents:new Map(), busy:false };

async function api(path, options = {}) {
 const init = {...options, credentials:'same-origin',headers:{...options.headers}};
 if (init.body != null) { init.headers['Content-Type']='application/json'; if (typeof init.body !== 'string') init.body=JSON.stringify(init.body); }
 const res=await fetch(path,init);
 const data=await res.json().catch(()=>({error:'服务器返回了无效数据'}));
 if(!res.ok){const err=new Error(data.error||'操作未完成，请重试');err.status=res.status;throw err;}
 return data;
}
function toast(message,type='success') {
 const el=document.createElement('div'); el.className=`toast toast-${type}`;
 el.innerHTML=`${icon(type==='error'?'alert':'check')}<span>${esc(message)}</span>`;
 $('#toast-root').append(el);setTimeout(()=>el.remove(),4500);
}
function closeModal(){ $('#app-modal').close(); }
function modal(title,body,onSubmit,submitLabel='保存') {
 const dialog=$('#app-modal');if(dialog.open)dialog.close();
 dialog.innerHTML=`<form id="modal-form"><div class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="icon-button modal-close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}<p id="modal-error" class="form-error" role="alert"></p></div><div class="modal-footer"><button type="button" class="button secondary modal-close">${submitLabel===null?'关闭':'取消'}</button>${submitLabel===null?'':`<button type="submit" class="button primary">${esc(submitLabel)}</button>`}</div></form>`;
 $$('.modal-close',dialog).forEach(b=>b.onclick=closeModal);
 $('#modal-form').onsubmit=async e=>{e.preventDefault();if(submitLabel===null||!onSubmit)return;const form=e.currentTarget,button=$('button[type="submit"]',dialog);button.disabled=true;form.inert=true;$('#modal-error').textContent='';try{await onSubmit(form);}catch(err){$('#modal-error').textContent=err.message;}finally{button.disabled=false;form.inert=false;}};
 dialog.showModal();
}
function beforeSessionEdit(id){
 if(state.contents.has(id)||[...state.drafts.values()].some(d=>d.sessionId===id&&d.dirty)){
  toast('这节课有未保存的学习内容或评价，请先回到今日课程保存草稿','error');return false;
 }
 return true;
}
const ctx=()=>({data:state.data,api,reload,toast,esc,modal,closeModal,getContext:ctx,beforeSessionEdit});
const session=()=>state.data.sessions.find(s=>s.id===state.sessionId);
const sessionGroupIds=s=>s?.groupIds||(s?.groupId?[s.groupId]:[]);
const courseGroups=()=>state.data.groups.filter(g=>sessionGroupIds(session()).includes(g.id));
const group=()=>courseGroups().find(g=>g.id===state.groupId);
const courseStudents=()=>state.data.students.filter(s=>sessionGroupIds(session()).includes(s.groupId));
const students=()=>courseStudents().filter(s=>!state.groupId||s.groupId===state.groupId);
const student=()=>students().find(s=>s.id===state.studentId);
const attendance=s=>state.data.attendance.find(a=>a.sessionId===state.sessionId&&a.studentId===s.id)||{status:'pending',note:''};
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function period(type,date){const d=new Date(date+'T12:00:00');if(type==='week'){const n=(d.getDay()+6)%7;d.setDate(d.getDate()-n);const end=new Date(d);end.setDate(end.getDate()+6);return [localDay(d),localDay(end)];}if(type==='month')return [date.slice(0,7)+'-01',localDay(new Date(d.getFullYear(),d.getMonth()+1,0))];return [date,date];}
const draftKey=()=>state.type==='day'?[state.sessionId,state.studentId,'day'].join(':'):[state.studentId,state.type,...period(state.type,session().date)].join(':');
function draft() {
 const key=draftKey();if(state.drafts.has(key))return state.drafts.get(key);
 const [periodStart,periodEnd]=period(state.type,session().date);
 const old=state.data.reviews.find(r=>r.studentId===state.studentId&&r.type===state.type&&(state.type==='day'?r.sessionId===state.sessionId:r.periodStart===periodStart&&r.periodEnd===periodEnd));
 const result={...old,studentId:state.studentId,sessionId:state.type==='day'?state.sessionId:null,type:state.type,periodStart,periodEnd,tags:[...(old?.tags||[])],text:old?.text||'',dirty:false};state.drafts.set(key,result);return result;
}
const avatar=s=>`<span class="kid-avatar tone-${(students().indexOf(s)+6)%6}">${s.avatar?`<img src="${esc(s.avatar)}" alt="${esc(s.name)}的头像">`:`<span>${esc(s.name.slice(-1))}</span><i></i>`}</span>`;
function markDraft(){const d=draft();d.dirty=true;$('#save-state').textContent='有未保存的修改';$('#save-state').className='save-state is-dirty';}
async function reload(){
 state.data=await api('/api/bootstrap');
 const studentIds=new Set(state.data.students.map(s=>s.id)),sessionIds=new Set(state.data.sessions.map(s=>s.id));
 for(const [key,d]of state.drafts)if(!studentIds.has(d.studentId)||(d.sessionId&&!sessionIds.has(d.sessionId))||!d.dirty)state.drafts.delete(key);
 for(const id of state.contents.keys())if(!sessionIds.has(id))state.contents.delete(id);
 if(!session())state.sessionId=state.data.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date))[0]?.id||'';
 if(!courseGroups().some(g=>g.id===state.groupId))state.groupId='';
 if(!student())state.studentId=students()[0]?.id||'';
 render();
}
async function act(fn){if(state.busy)return;state.busy=true;$('#app').inert=true;$('#app').setAttribute('aria-busy','true');try{await fn();}catch(err){toast(err.message,'error');if(err.status===401)showLogin();}finally{state.busy=false;$('#app').inert=false;$('#app').removeAttribute('aria-busy');}}

async function showLogin() {
 const {demoLogin=false}=await api('/api/config').catch(()=>({}));
 document.title='教师登录 · 大头少年';
 $('#app').innerHTML=`<main class="login-page"><div class="login-grid"><section class="login-intro"><a class="brand" href="/">${icon('robot')}<span><strong>大头少年</strong><small>EXPLORE THE POSSIBILITIES</small></span></a><div class="login-cube">${cube}</div><span class="eyebrow">课堂任务控制台</span><h1>记录每一次探索，<br>看见每一点成长。</h1><p>考勤、课堂评价与家长反馈，<br>在一个清楚的工作台里完成。</p></section><section class="login-card tech-panel"><span class="eyebrow">TEACHER ACCESS</span><h2>欢迎回到课堂</h2><p class="muted">登录教师账号，开启今天的探索。</p><form id="login-form"><label class="field"><span>教师账号</span><input class="input" name="username" autocomplete="username" value="teacher" required></label><label class="field"><span>登录密码</span><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="请输入密码"></label><p class="form-error" id="login-error" role="alert"></p><button class="button primary login-submit" type="submit">${icon('lock')}进入课堂</button></form>${demoLogin?'<details class="demo-access"><summary>查看本地演示账号</summary><p>账号：teacher<br>密码：SpaceClass2026!</p><small>演示数据为虚构学员，用于体验功能。</small></details>':''}</section></div></main>`;
 $('#login-form').onsubmit=async e=>{e.preventDefault();const b=$('button[type="submit"]',e.currentTarget);b.disabled=true;$('#login-error').textContent='';try{await api('/api/auth/login',{method:'POST',body:Object.fromEntries(new FormData(e.currentTarget))});await reload();}catch(err){$('#login-error').textContent=err.message;}finally{b.disabled=false;}};
}
function render() {
 const nav=[['today','calendar','今日课程'],['students','user','学员档案'],['projects','folder','项目与课程'],['records','note','评价记录']];
 document.title=`${nav.find(n=>n[0]===state.view)?.[2]} · 大头少年`;
 $('#app').innerHTML=`<div class="console-shell"><header class="topbar"><a class="brand" href="/">${icon('robot')}<span><strong>大头少年</strong><small>用 AI 点亮孩子的创造力</small></span></a><nav class="main-nav" aria-label="主导航">${nav.map(([id,i,label])=>`<button class="nav-item ${state.view===id?'active':''}" data-nav="${id}" ${state.view===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('')}</nav><div class="teacher-menu"><span class="teacher-avatar">${icon('user')}</span><span>${esc(state.data.teacher.name)}</span><button class="icon-button" id="logout" aria-label="退出登录" title="退出登录">${icon('logout')}</button></div></header><div id="view-root" class="${state.view==='today'?'':'management-container'}">${state.view==='today'?renderToday():renderManagement(state.view,ctx())}</div><footer class="console-footer"><span><i class="connection-dot"></i>课堂记录已连接</span><span>大头少年 <b>·</b> 让创造力抵达更远的地方</span><span>课堂管理工作台</span></footer></div>`;
 $$('[data-nav]').forEach(b=>b.onclick=()=>{state.view=b.dataset.nav;render();});
 $('#logout').onclick=()=>act(async()=>{if(hasDirty()&&!confirm('还有未保存的评价，确定退出吗？'))return;await api('/api/auth/logout',{method:'POST',body:{}});state.drafts.clear();state.contents.clear();showLogin();});
 if(state.view==='today')bindToday();else bindManagement(state.view,ctx());
}
function renderToday() {
 if(!session())return `<section class="empty-course tech-panel"><div>${icon('calendar')}</div><h1>准备开始第一节课</h1><p>新建项目组，添加自己的学员，再安排课程。</p><div class="empty-course-actions"><button class="button primary" id="new-project-group">${icon('plus')}新建项目组</button><button class="button secondary" id="goto-projects">项目与课程</button></div></section>`;
 const s=session(),g=group(),groups=courseGroups(),kids=students(),selected=student();
 const counts={total:kids.length,present:kids.filter(k=>['present','late'].includes(attendance(k).status)).length,leave:kids.filter(k=>attendance(k).status==='leave').length,pending:kids.filter(k=>attendance(k).status==='pending').length};
 const leaves=kids.filter(k=>attendance(k).status==='leave');
 const metrics=[['users','应到',counts.total,''],['check','实到',counts.present,'green'],['note','请假',counts.leave,'amber'],['clock','待点名',counts.pending,'muted']];
 return `<main class="today-layout"><aside class="course-sidebar tech-panel"><div class="side-title"><span class="eyebrow">MISSION CONTROL</span><h1>今日课程</h1><p>每一次探索，都值得记录</p></div><div class="holo-cube">${cube}<span>LEARNING MISSION / 06</span></div><div class="side-fields"><label class="side-field"><span>${icon('book')}当前课程</span><select id="session-select" class="input">${state.data.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(c=>`<option value="${esc(c.id)}" ${c.id===s.id?'selected':''}>${esc(c.title)} · ${esc(c.date)}</option>`).join('')}</select></label><div class="side-field"><span>${icon('folder')}本课小队</span><strong>${groups.length} 个小队 · ${courseStudents().length} 位学员</strong><small>在课堂上方切换小队</small></div><div class="side-field"><span>${icon('clock')}上课时间</span><strong class="date-label">${esc(s.date.replaceAll('-','.'))}</strong><strong class="time-label">${esc(s.startTime)} — ${esc(s.endTime)}</strong></div><button class="button secondary side-export" id="export-today">${icon('export')}导出评价</button></div><div class="planet-art" aria-hidden="true"><span></span></div><div class="side-signature">让每个孩子<br>与 AI 一起成长</div></aside>
 <section class="classroom-workspace"><div class="workspace-title"><div><span class="eyebrow">CLASSROOM WORKSPACE</span><h2>${esc(s.title)}</h2></div><div class="workspace-title-actions"><span class="publication-badge ${s.published?'published':''}">${s.published?'课程已发布':'课程草稿'}</span><button class="button secondary" id="new-project-group">${icon('plus')}新建项目组</button></div></div><section class="course-team-bar tech-panel" aria-label="切换小队"><label for="course-group-select">${icon('users')}当前小队</label><select id="course-group-select" class="input"><option value="">全部小队（${courseStudents().length} 人）</option>${groups.map(team=>`<option value="${esc(team.id)}" ${team.id===state.groupId?'selected':''}>${esc(team.name)}（${courseStudents().filter(k=>k.groupId===team.id).length} 人）</option>`).join('')}</select><span class="team-scope-hint">${g?`${esc(g.projectName||g.name)} · 点名与名单仅显示本队`:`${groups.length} 个小队一起上课 · 点名与名单显示全课`}</span><button class="button secondary" id="manage-course-groups">管理本课小队</button></section><section class="attendance-overview tech-panel" aria-label="考勤总览"><div class="metric-grid">${metrics.map(([i,l,n,c])=>`<div class="metric ${c}">${icon(i)}<div><span>${l}</span><strong>${n}</strong></div></div>`).join('')}</div><div class="leave-notice ${leaves.length?'has-leave':''}">${icon(leaves.length?'alert':'check')}<span>${leaves.length?`请假提醒：${leaves.map(k=>esc(k.name)).join('、')}`:(g?'本队暂无请假':'本节课暂无请假')}</span></div><div class="bulk-arrival"><button class="button primary" id="bulk-arrival">${icon('users')}${g?'本队一键到课':'全课一键到课'}</button><small>保留已登记请假</small></div></section>
 <div class="work-columns"><section class="roster tech-panel"><div class="panel-heading"><h2>${icon('users')}学员名单 <span>(${kids.length} 人)</span></h2><span class="roster-caption">实到包含迟到</span></div><label class="roster-search">${icon('search')}<input id="student-search" placeholder="搜索姓名或学员编号" aria-label="搜索学员" value="${esc(state.search)}"></label><div class="roster-labels"><span>学员姓名</span><span>学员编号</span><span>考勤状态</span></div><div class="student-list" id="student-list">${renderRoster()}</div><div class="roster-bottom"><span>${icon('check')}已评价 ${kids.filter(k=>state.data.reviews.some(r=>r.studentId===k.id&&r.sessionId===s.id&&r.type==='day')).length} / ${kids.length}</span><span>点击学员，记录课堂表现</span></div></section>
 <div class="edit-column"><section class="lesson-panel tech-panel"><div class="panel-heading"><h2>${icon('note')}本次学习内容</h2><span class="helper">本课所有小队共用</span></div><textarea class="editor lesson-editor" id="lesson-content" aria-label="本次学习内容" maxlength="10000" placeholder="记录本次课程的学习目标与创作内容…">${esc(state.contents.get(s.id)??s.content)}</textarea></section>${selected?renderReview():`<section class="tech-panel no-students"><h2>${g?'这个小队还没有学员':'本课程还没有学员'}</h2><p>前往学员档案，添加学员并选择本课的项目组。</p></section>`}</div></div>
 <div class="workspace-actions"><section class="parent-sharing tech-panel"><div class="sharing-label">${icon('users')}<div><strong>家长查看</strong><small>所有家长共用，手机号尾号匹配</small></div></div><button class="button secondary" id="parent-preview">预览</button><button class="button primary copy-link" id="copy-link">${icon('link')}复制统一家长链接</button></section><section class="publish-actions tech-panel"><span id="save-state" class="save-state">${hasDirty()?'有未保存的修改':'修改后请保存'}</span><div><button class="button secondary" id="save-draft">${icon('save')}保存草稿</button><button class="button primary" id="publish">${icon('send')}${state.type==='day'?'发布全课反馈':state.type==='week'?'发布本周评价':'发布本月评价'}</button></div>${state.type==='day'?'<small class="publish-scope-hint">发布本课程所有小队的日评价与共同学习内容</small>':''}</section></div></section></main>`;
}
function renderRoster(){return students().filter(s=>`${s.name} ${s.nickname} ${s.studentNo}`.toLowerCase().includes(state.search.toLowerCase())).map(s=>{const a=attendance(s);return `<div class="student-row ${s.id===state.studentId?'is-selected':''}" data-student="${esc(s.id)}"><button class="student-identity" data-select-student="${esc(s.id)}" aria-label="评价${esc(s.name)}" aria-pressed="${s.id===state.studentId}"><span class="selection-mark">${s.id===state.studentId?icon('check'):''}</span>${avatar(s)}<span><strong>${esc(s.name)}</strong><small>${esc([s.nickname,courseGroups().length>1?state.data.groups.find(g=>g.id===s.groupId)?.name:''].filter(Boolean).join(' · '))}</small></span></button><span class="student-number">${esc(s.studentNo)}</span><select class="attendance-select status-${a.status}" data-attendance="${esc(s.id)}" aria-label="${esc(s.name)}的考勤">${Object.entries(statusNames).map(([v,n])=>`<option value="${v}" ${a.status===v?'selected':''}>${n}</option>`).join('')}</select>${a.note?`<span class="attendance-note" title="${esc(a.note)}">${esc(a.note)}</span>`:''}</div>`;}).join('')||'<p class="roster-empty">没有找到匹配的学员</p>';}
function renderReview(){const s=student(),d=draft(),tags=[...new Set(['主动探索','独立完成','乐于合作','积极参与','勇敢表达',...d.tags])];return `<section class="review-panel tech-panel"><div class="review-heading"><div>${avatar(s)}<h2>${esc(s.name)}<small>${esc(state.data.groups.find(g=>g.id===s.groupId)?.name||'课堂评价')}</small></h2></div><div class="period-tabs" role="tablist" aria-label="评价周期">${[['day','日评价'],['week','周评价'],['month','月评价']].map(([v,n])=>`<button role="tab" aria-selected="${state.type===v}" class="${state.type===v?'active':''}" data-period="${v}">${n}</button>`).join('')}</div></div>${state.type!=='day'?`<div class="review-range"><label class="field"><span>开始日期</span><input type="date" class="input" id="period-start" value="${d.periodStart}" required></label><span>—</span><label class="field"><span>结束日期</span><input type="date" class="input" id="period-end" value="${d.periodEnd}" required></label></div>`:''}<label class="editor-label">评价标签 <span>可多选</span></label><div class="tag-options">${tags.map(t=>`<button class="tag-option ${d.tags.includes(t)?'selected':''}" data-tag="${esc(t)}" aria-pressed="${d.tags.includes(t)}">${icon(d.tags.includes(t)?'check':'plus')}${esc(t)}</button>`).join('')}</div><label class="editor-label" for="review-text">${state.type==='day'?'课堂表现与建议':state.type==='week'?'本周成长总结':'本月成长总结'}<span class="review-status">${d.published&&!d.dirty?'已发布':'草稿仅老师可见'}</span></label><textarea class="editor review-editor" id="review-text" maxlength="10000" placeholder="记录孩子的一个亮点，再给出一个具体的小建议…">${esc(d.text)}</textarea><div class="review-footnote"><span>${icon('spark')}让每个孩子的进步被看见</span><span id="review-count">${d.text.length} / 10000</span></div></section>`;}
function bindRoster(){ $$('[data-select-student]').forEach(b=>b.onclick=()=>{state.studentId=b.dataset.selectStudent;render();});$$('[data-attendance]').forEach(select=>select.onchange=()=>{const studentId=select.dataset.attendance;const kid=students().find(k=>k.id===studentId);const save=async note=>{await api('/api/attendance',{method:'POST',body:{sessionId:state.sessionId,studentId,status:select.value,note}});await reload();toast(`${kid.name}已标记为${statusNames[select.value]}`);};if(select.value==='leave'){modal(`登记${kid.name}的请假`,`<label class="field"><span>请假说明（选填）</span><textarea class="input" name="note" rows="3" maxlength="500" placeholder="例如：家长已告知身体不适，今日请假">${esc(attendance(kid).note)}</textarea></label>`,async form=>{await save(new FormData(form).get('note'));closeModal();});$('#app-modal').addEventListener('close',()=>render(),{once:true});}else act(()=>save(''));}); }
function bindToday(){
 $('#new-project-group')?.addEventListener('click',()=>openNewGroup(ctx()));
 if(!session()){$('#goto-projects')?.addEventListener('click',()=>{state.view='projects';render();});return;}
 $('#session-select').onchange=e=>{state.sessionId=e.target.value;state.groupId='';state.studentId=students()[0]?.id||'';state.search='';render();};
 $('#course-group-select').onchange=e=>{state.groupId=e.target.value;if(!student())state.studentId=students()[0]?.id||'';state.search='';render();};
 $('#manage-course-groups').onclick=()=>openCourseGroups(ctx(),state.sessionId);
 $('#student-search').oninput=e=>{state.search=e.target.value;$('#student-list').innerHTML=renderRoster();bindRoster();};bindRoster();
 $$('[data-period]').forEach(b=>b.onclick=()=>{state.type=b.dataset.period;render();});
 $$('[data-tag]').forEach(b=>b.onclick=()=>{const d=draft(),tag=b.dataset.tag;d.tags=d.tags.includes(tag)?d.tags.filter(t=>t!==tag):[...d.tags,tag];d.dirty=true;render();});
 $('#lesson-content').oninput=e=>{state.contents.set(state.sessionId,e.target.value);$('#save-state').textContent='有未保存的修改';$('#save-state').classList.add('is-dirty');};
 if($('#review-text'))$('#review-text').oninput=e=>{draft().text=e.target.value;markDraft();$('#review-count').textContent=`${e.target.value.length} / 10000`;};
 if($('#period-start'))$('#period-start').onchange=e=>{draft().periodStart=e.target.value;markDraft();};
 if($('#period-end'))$('#period-end').onchange=e=>{draft().periodEnd=e.target.value;markDraft();};
 $('#bulk-arrival').onclick=()=>act(async()=>{await api('/api/attendance/bulk',{method:'POST',body:{sessionId:state.sessionId,...(state.groupId?{groupId:state.groupId}:{})}});await reload();toast('已完成'+(state.groupId?'本队':'全课')+'点名，保留已登记请假');});
 $('#save-draft').onclick=()=>act(async()=>{await saveDrafts();await reload();toast('草稿已保存');});
 $('#publish').onclick=()=>act(async()=>{const type=state.type,targetSessionId=state.sessionId;const current=student()?draft():null;if(type!=='day'&&!current?.text.trim())throw new Error('请先填写评价内容');await saveDrafts();if(type==='day'){await api(`/api/sessions/${encodeURIComponent(targetSessionId)}/publish`,{method:'POST',body:{}});}else{if(!current.id)throw new Error('请先填写并保存评价');await api(`/api/reviews/${encodeURIComponent(current.id)}/publish`,{method:'POST',body:{}});}await reload();toast('反馈已发布，家长可通过统一链接查看');});
 $('#copy-link').onclick=()=>act(async()=>{const link=parentLink();try{await navigator.clipboard.writeText(link);toast('统一家长链接已复制');}catch{modal('统一家长链接',`<p class="muted">所有家长共用此链接，输入手机号尾号查看反馈。</p><input class="input share-url" aria-label="统一家长链接" value="${esc(link)}" readonly>`,async()=>closeModal());$('.share-url').select();}});
 $('#parent-preview').onclick=()=>window.open(parentLink(),'_blank','noopener');
 $('#export-today').onclick=()=>{
  const s=session(),groups=courseGroups();
  modal('导出评价',`<div class="export-form"><label class="field"><span>开始日期</span><input class="input" name="start" type="date" value="${s.date}" required></label><label class="field"><span>结束日期</span><input class="input" name="end" type="date" value="${s.date}" required></label><label class="field"><span>小队范围</span><select class="input" name="groupId" id="export-group"><option value="">本课程全部小队</option>${groups.map(g=>`<option value="${esc(g.id)}" ${g.id===state.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label class="field"><span>学员范围</span><select class="input" name="studentId" id="export-student"></select></label><label class="field"><span>评价类型</span><select class="input" name="type"><option value="">全部评价</option><option value="day">日评价</option><option value="week">周评价</option><option value="month">月评价</option></select></label></div><p class="muted export-hint">导出所选时间内、所选范围学员的评价，包含日、周、月评价。CSV 表格可用 Excel 打开。</p>`,async form=>{
   const values=Object.fromEntries(new FormData(form));if(values.end<values.start)throw new Error('结束日期不能早于开始日期');
   const q=new URLSearchParams({...values,sessionId:s.id});const a=document.createElement('a');a.href='/api/export?'+q;a.download='课堂评价.csv';a.click();closeModal();toast('评价表格已导出');
  },'导出表格');
  const updateExportStudents=()=>{$('#export-student').innerHTML='<option value="">所选范围全部学员</option>'+courseStudents().filter(k=>!$('#export-group').value||k.groupId===$('#export-group').value).map(k=>`<option value="${esc(k.id)}">${esc(k.name)} · ${esc(state.data.groups.find(g=>g.id===k.groupId)?.name)}</option>`).join('');};
  $('#export-group').onchange=updateExportStudents;updateExportStudents();
 };
}
const parentLink=()=>`${location.origin}/parent?id=${encodeURIComponent(state.sessionId)}`;
function hasDirty(){return [...state.drafts.values()].some(d=>d.dirty)||state.contents.size>0;}
async function saveDrafts(){
 for(const [id,content]of state.contents){const original=state.data.sessions.find(s=>s.id===id);if(content!==original?.content)await api(`/api/sessions/${encodeURIComponent(id)}`,{method:'PUT',body:{content,published:false}});state.contents.delete(id);}
 for(const d of state.drafts.values()){if(!d.dirty)continue;if(!d.text.trim()){if(d.id)throw new Error('已有评价不能为空，请填写内容后保存');d.dirty=false;continue;}if(d.periodEnd<d.periodStart)throw new Error('评价结束日期不能早于开始日期');const result=await api('/api/reviews',{method:'POST',body:{...d,published:false}});Object.assign(d,result.review,{dirty:false});}
}
window.addEventListener('beforeunload',e=>{if(hasDirty()){e.preventDefault();e.returnValue='';}});

async function boot(){if(location.pathname.startsWith('/parent')){document.title='课堂反馈 · 大头少年';await initParent({api,esc,toast,icon});return;}try{await api('/api/auth/me');await reload();}catch(err){if(err.status===401)showLogin();else{$('#app').innerHTML=`<div class="initial-loading"><h1>课堂暂时无法连接</h1><p>${esc(err.message)}</p><button class="button primary" id="retry">重试</button></div>`;$('#retry').onclick=boot;}}}
boot();
