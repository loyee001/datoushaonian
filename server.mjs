import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'classroom.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS deleted_records (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
`);

const sessionGroupIds = session => [...new Set(Array.isArray(session.groupIds)?session.groupIds:session.groupId?[session.groupId]:[])];
const normalizeSession = session => {const groupIds=sessionGroupIds(session);return {...session,groupIds,groupId:groupIds[0]||''};};
const readRecord = (table,data) => table==='sessions'?normalizeSession(JSON.parse(data)):JSON.parse(data);
const all = table => db.prepare(`SELECT data FROM ${table}`).all().map(row=>readRecord(table,row.data));
const get = (table,id) => {const row=db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);return row?readRecord(table,row.data):null;};
const put = (table,item,id=item.id) => {
  if(table==='sessions')item=normalizeSession(item);
  const existing=get(table,id);
  // Preserve inert metadata written by an older version when editing a record.
  if(existing&&Object.hasOwn(existing,'classId'))item={...item,classId:existing.classId};
  db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id,JSON.stringify(item));return item;
};
const transaction = fn => { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = localDate();

if (!db.prepare('SELECT value FROM settings WHERE key = ?').get('seeded')) {
  transaction(() => {
    put('groups', { id: 'g-space', name: '星际探索队', projectName: 'AI 星球探险家', captain: '林子墨', introduction: '用 AI 创作属于自己的宇宙故事，学习提示词设计、图像生成与团队协作。' });
    const kids = [
      ['s-001','AI2026001','林子墨','小宇航员','三年级','男','林女士','13800001388'],
      ['s-002','AI2026002','陈一诺','诺诺','四年级','女','陈先生','13900012468'],
      ['s-003','AI2026003','王星宇','星星','三年级','男','王女士','13700022468'],
      ['s-004','AI2026004','赵可欣','可可','四年级','女','赵女士','13600005678'],
      ['s-005','AI2026005','刘乐天','天天','三年级','男','刘先生','13500008899'],
      ['s-006','AI2026006','林子涵','小月亮','二年级','女','林女士','13800001388'],
    ];
    kids.forEach(([id,studentNo,name,nickname,grade,gender,parentName,parentPhone]) => put('students',{id,studentNo,name,nickname,grade,gender,parentName,parentPhone,avatar:'',groupId:'g-space'}));
    put('sessions',{id:'s-today',groupId:'g-space',title:'第 06 课 · 设计我的 AI 星球',date:today,startTime:'14:00',endTime:'15:30',content:'今天我们学习用清晰的提示词描述一颗星球，尝试调整颜色、环境和生物设定，完成一张 AI 星球海报，并向伙伴介绍自己的创作。',published:true});
    ['present','present','leave','late','pending','present'].forEach((status,index) => {
      const studentId=kids[index][0];
      put('attendance',{sessionId:'s-today',studentId,status,note:status==='leave'?'家长已告知今日请假':''},`s-today:${studentId}`);
    });
    const texts=['能独立描述星球的环境，主动修改提示词，让画面中的角色更加一致。继续保持探索精神！','今天大胆分享了自己的作品，能认真听取同伴建议，并把想法融入第二版海报。','', '虽然稍晚到课，但很快跟上了任务节奏，尝试用不同的颜色表现星球气氛。'];
    [0,1,3].forEach((n,index)=>put('reviews',{id:`r-demo-${index+1}`,studentId:kids[n][0],sessionId:'s-today',type:'day',periodStart:today,periodEnd:today,tags:index===0?['独立创作','积极探索']:['积极参与','乐于分享'],text:texts[n],published:index<2,teacherName:'星辰老师',updatedAt:new Date().toISOString()}));
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('seeded','1');
  });
}

const passwordSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('teacher_password');
let passwordRecord = passwordSetting ? JSON.parse(passwordSetting.value) : null;
if (!passwordRecord || process.env.TEACHER_PASSWORD) {
  const password = process.env.TEACHER_PASSWORD || 'SpaceClass2026!';
  if (password.length < 10) throw new Error('TEACHER_PASSWORD must contain at least 10 characters');
  const salt = randomBytes(16).toString('hex');
  passwordRecord = { salt, hash:scryptSync(password,salt,64).toString('hex') };
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('teacher_password',JSON.stringify(passwordRecord));
}
const teacher = { name: '星辰老师' };
const loginAttempts = new Map();
const lookupAttempts = new Map();
const TTL = 12*60*60*1000;

class ApiError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail = (status,message) => { throw new ApiError(status,message); };
const requireItem = (table,id,label='记录') => get(table,id) || fail(404,`${label}不存在`);
const string = (value,label,max=200,required=false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail(400,`${label}格式不正确`);
  const result=value.trim();
  if ((required&&!result)||result.length>max) fail(400,`${label}${required&&!result?'不能为空':'过长'}`);
  return result;
};
const date = (value,label='日期') => {
  const result=string(value,label,10,true);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result+'T00:00:00Z'))||new Date(result+'T00:00:00Z').toISOString().slice(0,10)!==result) fail(400,`${label}格式不正确`);
  return result;
};
const boolean = (value,fallback=false) => { if(value===undefined)return fallback;if(typeof value!=='boolean')fail(400,'发布状态格式不正确');return value; };
const newId = prefix => `${prefix}-${randomBytes(8).toString('hex')}`;
const avatar = value => {
  if (!value) return '';
  if(typeof value!=='string') fail(400,'头像格式不正确');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)fail(400,'头像仅支持 PNG、JPEG 或 WebP 图片');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>2*1024*1024)fail(400,'头像不能超过 2 MB');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)fail(400,'头像文件内容与图片格式不符');
  return value;
};

function validateStudent(body,existing) {
  const data={...(existing||{}),...body};
  const studentNo=string(data.studentNo,'学员编号',40,true);
  if(all('students').some(s=>s.studentNo===studentNo&&s.id!==existing?.id))fail(409,'学员编号已存在');
  const parentPhone=string(data.parentPhone,'家长手机号',11,true);
  if(!/^\d{11}$/.test(parentPhone))fail(400,'请输入 11 位家长手机号');
  const groupId=string(data.groupId,'项目组',100,true);requireItem('groups',groupId,'项目组');
  if(existing&&groupId!==existing.groupId&&(all('attendance').some(a=>a.studentId===existing.id)||all('reviews').some(r=>r.studentId===existing.id)))fail(400,'该学员已有考勤或评价记录，暂不能更换项目组。请保留原档案，避免历史课程与家长反馈丢失。');
  const gender=string(data.gender||'未填写','性别',10);
  if(!['男','女','未填写','其他','male','female','other'].includes(gender))fail(400,'性别格式不正确');
  return {id:existing?.id||newId('student'),studentNo,name:string(data.name,'孩子姓名',60,true),nickname:string(data.nickname,'孩子绰号',60),grade:string(data.grade,'年级',30,true),gender,parentName:string(data.parentName,'家长姓名',60,true),parentPhone,avatar:avatar(data.avatar),groupId};
}
function validateGroup(body,existing) {
  const data={...(existing||{}),...body};
  return {id:existing?.id||newId('group'),name:string(data.name,'项目组名称',80,true),projectName:string(data.projectName,'项目名称',100,true),captain:string(data.captain,'队长',60),introduction:string(data.introduction,'项目介绍',3000)};
}
function validateSession(body,existing) {
  const data={...(existing||{}),...body};
  const selection=Object.hasOwn(body,'groupIds')?body.groupIds:Object.hasOwn(body,'groupId')?[body.groupId]:existing?sessionGroupIds(existing):[];
  if(!Array.isArray(selection)||!selection.length||selection.length>100)fail(400,'请至少选择一个项目组');
  const groupIds=[...new Set(selection.map(value=>string(value,'项目组',100,true)))];
  groupIds.forEach(groupId=>requireItem('groups',groupId,'项目组'));
  if(existing) {
    const removed=new Set(sessionGroupIds(existing).filter(groupId=>!groupIds.includes(groupId)));
    const students=new Map(all('students').map(student=>[student.id,student]));
    if(['attendance','reviews'].some(table=>all(table).some(record=>record.sessionId===existing.id&&removed.has(students.get(record.studentId)?.groupId))))fail(400,'要移除的项目组已有本课程的考勤或评价记录，请保留该项目组，避免历史记录丢失');
  }
  const sessionDate=date(data.date);
  if(existing&&sessionDate!==existing.date&&all('reviews').some(r=>r.sessionId===existing.id&&r.type==='day'))fail(400,'本课程已有日评价，暂不能更改日期。请保留原课程并新建课程安排，确保历史评价日期一致。');
  const startTime=string(data.startTime,'上课时间',5,true),endTime=string(data.endTime,'下课时间',5,true);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime)fail(400,'请设置有效的上课与下课时间');
  return {id:existing?.id||newId('session'),groupIds,groupId:groupIds[0],title:string(data.title,'课程名称',120,true),date:sessionDate,startTime,endTime,content:string(data.content,'学习内容',10000),published:boolean(data.published,existing?.published||false)};
}
function enrollment(sessionId,studentId) {
  const session=requireItem('sessions',sessionId,'课程'),student=requireItem('students',studentId,'学员');
  if(!sessionGroupIds(session).includes(student.groupId))fail(400,'该学员不属于本次课程的项目组');
  return {session,student};
}
function validateReview(body,existing) {
  const data={...(existing||{}),...body};
  const studentId=string(data.studentId,'学员',100,true);requireItem('students',studentId,'学员');
  const type=data.type||'day';if(!['day','week','month'].includes(type))fail(400,'评价类型不正确');
  const sessionId=string(data.sessionId,'课程',100,type==='day');
  let session=null;if(sessionId)session=enrollment(sessionId,studentId).session;
  const periodStart=date(data.periodStart||session?.date,'开始日期'),periodEnd=date(data.periodEnd||session?.date,'结束日期');
  if(periodEnd<periodStart)fail(400,'结束日期不能早于开始日期');
  if(type==='day'&&(periodStart!==session.date||periodEnd!==session.date))fail(400,'日评价日期应与课程日期一致');
  const tags=data.tags??[];if(!Array.isArray(tags)||tags.length>12)fail(400,'评价标签格式不正确');
  return {id:existing?.id||newId('review'),studentId,sessionId:sessionId||null,type,periodStart,periodEnd,tags:[...new Set(tags.map(t=>string(t,'标签',30,true)))],text:string(data.text,'评价内容',10000,true),published:boolean(data.published,existing?.published||false),teacherName:teacher.name,updatedAt:new Date().toISOString()};
}
function checkRate(map,key,max,windowMs,message) {
  const now=Date.now();
  if(map.size>5000)for(const [k,v]of map)if(v.until<now)map.delete(k);
  const item=map.get(key);
  if(item&&item.until>now&&item.count>=max)fail(429,message);
  if(!item||item.until<=now)map.set(key,{count:1,until:now+windowMs});else item.count++;
}
const hashToken = token => createHash('sha256').update(token).digest('hex');
function isAuthenticated(req) {
  const token=/(?:^|;\s*)classroom_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
  if(!token)return false;
  const item=db.prepare('SELECT expires_at FROM auth_sessions WHERE token_hash=?').get(hashToken(token));
  return !!item&&item.expires_at>Date.now();
}
const json = (res,status,data,headers={}) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
async function bodyOf(req) {
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'请使用 JSON 请求格式');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024)fail(413,'请求内容过大');chunks.push(chunk);}
  try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'请求格式不正确');return result;}catch(error){if(error instanceof ApiError)throw error;fail(400,'请求不是有效的 JSON');}
}
function headerOf(session,includeContent=false) {
  return {id:session.id,title:session.title,date:session.date,startTime:session.startTime,endTime:session.endTime,published:session.published,...(includeContent?{content:session.published?session.content:''}:{})};
}
function csvCell(value) {let text=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;}

const recordTables=['groups','students','sessions','attendance','reviews'];
function recycleRecords(type,id,confirmName) {
  return transaction(()=>{
    const target=requireItem(type==='group'?'groups':'students',id,type==='group'?'项目组':'学员');
    if(typeof confirmName!=='string'||confirmName!==target.name)fail(400,'确认名称不一致，请输入完整名称后再删除');
    const rows=Object.fromEntries(recordTables.map(table=>[table,db.prepare(`SELECT id,data FROM ${table}`).all()]));
    const studentIds=new Set(rows.students.filter(row=>type==='student'?row.id===id:JSON.parse(row.data).groupId===id).map(row=>row.id));
    const linkedSessions=type==='group'?rows.sessions.filter(row=>sessionGroupIds(JSON.parse(row.data)).includes(id)):[];
    const sessionIds=new Set(linkedSessions.filter(row=>sessionGroupIds(JSON.parse(row.data)).length===1).map(row=>row.id));
    const sharedSessions=linkedSessions.filter(row=>!sessionIds.has(row.id));
    const snapshot={
      groups:type==='group'?rows.groups.filter(row=>row.id===id):[],
      students:rows.students.filter(row=>studentIds.has(row.id)),
      sessions:rows.sessions.filter(row=>sessionIds.has(row.id)),
      attendance:rows.attendance.filter(row=>{const data=JSON.parse(row.data);return studentIds.has(data.studentId)||sessionIds.has(data.sessionId);}),
      reviews:rows.reviews.filter(row=>{const data=JSON.parse(row.data);return studentIds.has(data.studentId)||sessionIds.has(data.sessionId);}),
      // Keep links for both shared and sole-group courses, so overlapping group
      // deletions can be restored in either order without reverting course edits.
      sessionLinks:linkedSessions.map(row=>({id:row.id,groupId:id})),
    };
    const counts=Object.fromEntries(recordTables.map(table=>[table,snapshot[table].length]));
    if(sharedSessions.length)counts.sharedSessions=sharedSessions.length;
    const deletion={id:newId('deletion'),type,name:target.name,deletedAt:new Date().toISOString(),counts};
    put('deleted_records',{id:deletion.id,deletion,snapshot});
    for(const row of sharedSessions) {
      const session=JSON.parse(row.data);
      put('sessions',{...session,groupIds:sessionGroupIds(session).filter(groupId=>groupId!==id)});
    }
    for(const table of [...recordTables].reverse()) {
      const remove=db.prepare(`DELETE FROM ${table} WHERE id=?`);
      for(const row of snapshot[table])remove.run(row.id);
    }
    return deletion;
  });
}

function restoreRecords(id) {
  return transaction(()=>{
    const saved=requireItem('deleted_records',id,'回收记录'),snapshot=saved.snapshot;
    const restored=Object.fromEntries(recordTables.map(table=>[table,new Map(snapshot[table].map(row=>[row.id,readRecord(table,row.data)]))]));
    for(const table of recordTables)for(const row of snapshot[table])if(get(table,row.id))fail(409,'原记录编号已被占用，无法恢复；现有记录和回收记录均已保留');
    const studentNos=new Set(all('students').map(student=>student.studentNo));
    for(const student of restored.students.values()) {
      if(studentNos.has(student.studentNo))fail(409,`学员编号 ${student.studentNo} 已被使用，请修改现有学员编号后再恢复`);
      studentNos.add(student.studentNo);
    }
    const available=(table,recordId)=>restored[table].get(recordId)||get(table,recordId);
    for(const student of restored.students.values())if(!available('groups',student.groupId))fail(409,'所属项目组已删除，请先恢复项目组，再恢复学员');

    const sessionUpdates=new Map(),transferredSnapshots=new Map();
    for(const link of snapshot.sessionLinks||[]) {
      let session=restored.sessions.get(link.id)||sessionUpdates.get(link.id)||get('sessions',link.id);
      if(!session) {
        // The last remaining group may also have been deleted after this one.
        // Recover its latest course row, then leave that group's snapshot with
        // only the membership link so its later restore merges into this course.
        const source=all('deleted_records').find(record=>record.id!==id&&record.snapshot.sessions.some(row=>row.id===link.id));
        if(!source)fail(409,'关联课程已删除且没有可恢复的课程记录，暂时无法安全恢复');
        const pending=transferredSnapshots.get(source.id)||source;
        const row=pending.snapshot.sessions.find(item=>item.id===link.id);
        if(!row)fail(409,'关联课程恢复记录发生冲突，请重新尝试');
        session=readRecord('sessions',row.data);
        session={...session,groupIds:sessionGroupIds(session).filter(groupId=>available('groups',groupId))};
        pending.snapshot.sessions=pending.snapshot.sessions.filter(item=>item.id!==link.id);
        pending.snapshot.sessionLinks||=[];
        // A legacy snapshot has no explicit membership links.
        for(const groupId of sessionGroupIds(JSON.parse(row.data)))if(!pending.snapshot.sessionLinks.some(item=>item.id===link.id&&item.groupId===groupId))pending.snapshot.sessionLinks.push({id:link.id,groupId});
        transferredSnapshots.set(pending.id,pending);
        restored.sessions.set(link.id,session);
      }
      if(!available('groups',link.groupId))fail(409,'课程所属项目组已删除，请先恢复项目组');
      session=normalizeSession({...session,groupIds:[...sessionGroupIds(session),link.groupId]});
      if(restored.sessions.has(link.id))restored.sessions.set(link.id,session);else sessionUpdates.set(link.id,session);
    }
    const availableSession=sessionId=>restored.sessions.get(sessionId)||sessionUpdates.get(sessionId)||get('sessions',sessionId);
    for(const session of [...restored.sessions.values(),...sessionUpdates.values()])if(!sessionGroupIds(session).length||sessionGroupIds(session).some(groupId=>!available('groups',groupId)))fail(409,'课程所属项目组已删除，请先恢复项目组');
    for(const table of ['attendance','reviews'])for(const record of restored[table].values()) {
      const student=available('students',record.studentId);
      if(!student)fail(409,'关联学员已删除，请先恢复该学员');
      if(record.sessionId) {
        const session=availableSession(record.sessionId);
        if(!session)fail(409,'关联课程已删除，请先恢复课程所在项目组');
        if(!sessionGroupIds(session).includes(student.groupId))fail(409,'学员或课程的所属项目组已改变，暂时无法安全恢复');
        if(table==='reviews'&&record.type==='day'&&(record.periodStart!==session.date||record.periodEnd!==session.date))fail(409,'原课程日期已改变，请先还原课程日期后再恢复评价');
      }
    }
    for(const table of recordTables) {
      const insert=db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?)`);
      if(table==='sessions')for(const [recordId,session]of restored.sessions)insert.run(recordId,JSON.stringify(normalizeSession(session)));
      else for(const row of snapshot[table])insert.run(row.id,row.data);
    }
    for(const session of sessionUpdates.values())put('sessions',session);
    for(const record of transferredSnapshots.values())put('deleted_records',record);
    db.prepare('DELETE FROM deleted_records WHERE id=?').run(id);
    return saved.deletion;
  });
}

async function api(req,res,url) {
  const p=url.pathname,method=req.method;
  if(!['GET','HEAD','POST','PUT','DELETE'].includes(method))fail(405,'不支持此操作');
  if(['POST','PUT','DELETE'].includes(method)) {
    const origin=req.headers.origin;
    if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)fail(403,'请求来源不被允许');
    if(req.headers['sec-fetch-site']==='cross-site')fail(403,'请求来源不被允许');
  }
  if(p==='/api/health'&&method==='GET')return json(res,200,{ok:true});
  if(p==='/api/auth/login'&&method==='POST') {
    const key=req.socket.remoteAddress||'local';
    checkRate(loginAttempts,key,10,15*60*1000,'登录尝试过于频繁，请稍后再试');
    const body=await bodyOf(req);
    const password=string(body.password,'密码',200,true);
    const supplied=scryptSync(password,passwordRecord.salt,64),stored=Buffer.from(passwordRecord.hash,'hex');
    if(body.username!=='teacher'||!timingSafeEqual(supplied,stored))fail(401,'用户名或密码不正确');
    loginAttempts.delete(key);
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(Date.now());
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO auth_sessions (token_hash,expires_at) VALUES (?,?)').run(hashToken(token),Date.now()+TTL);
    return json(res,200,{user:teacher},{'Set-Cookie':`classroom_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL/1000}`});
  }
  if(p==='/api/auth/me'&&method==='GET'){if(!isAuthenticated(req))fail(401,'请先登录教师账号');return json(res,200,{user:teacher});}
  if(p==='/api/auth/logout'&&method==='POST') {
    const token=/(?:^|;\s*)classroom_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
    if(token)db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashToken(token));
    return json(res,200,{ok:true},{'Set-Cookie':'classroom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  const parentMatch=/^\/api\/parent\/session\/([^/]+)$/.exec(p);
  if(parentMatch&&method==='GET') {
    const session=requireItem('sessions',decodeURIComponent(parentMatch[1]),'课程');
    return json(res,200,{session:headerOf(session)});
  }
  if(p==='/api/parent/lookup'&&method==='POST') {
    checkRate(lookupAttempts,req.socket.remoteAddress||'local',30,5*60*1000,'查询次数较多，请 5 分钟后再试');
    const body=await bodyOf(req),session=requireItem('sessions',string(body.sessionId,'课程',100,true),'课程');
    const suffix=string(body.suffix,'手机号尾号',11,true);
    if(!/^\d{4,11}$/.test(suffix))fail(400,'请输入手机号后 4 至 11 位');
    const groupIds=sessionGroupIds(session);
    const kids=all('students').filter(s=>groupIds.includes(s.groupId)&&s.parentPhone.endsWith(suffix));
    if(!kids.length)fail(404,'没有找到匹配的家长手机号，请核对后重试');
    if(new Set(kids.map(k=>k.parentPhone)).size>1)return json(res,200,{needsMoreDigits:true});
    const reviews=all('reviews');
    const children=kids.map(k=>({name:k.name,nickname:k.nickname,avatar:k.avatar,groupName:get('groups',k.groupId)?.name||'',projectName:get('groups',k.groupId)?.projectName||'',attendance:{status:get('attendance',`${session.id}:${k.id}`)?.status||'pending',note:''},reviews:reviews.filter(r=>r.studentId===k.id&&r.published&&(r.sessionId===session.id||(!r.sessionId&&r.periodStart<=session.date&&r.periodEnd>=session.date))).map(r=>({type:r.type,periodStart:r.periodStart,periodEnd:r.periodEnd,tags:r.tags,text:r.text,teacherName:r.teacherName}))}));
    return json(res,200,{session:headerOf(session,true),children});
  }
  if(!isAuthenticated(req))fail(401,'请先登录教师账号');
  return teacherApi(req,res,url);
}

async function teacherApi(req,res,url) {
  const p=url.pathname,method=req.method;
  if(p==='/api/bootstrap'&&method==='GET')return json(res,200,{students:all('students'),groups:all('groups'),sessions:all('sessions'),attendance:all('attendance'),reviews:all('reviews'),teacher});
  if(p==='/api/deletions'&&method==='GET')return json(res,200,{deletions:all('deleted_records').map(record=>record.deletion).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))});
  const restoreMatch=/^\/api\/deletions\/([^/]+)\/restore$/.exec(p);
  if(restoreMatch&&method==='POST')return json(res,200,{restored:true,deletion:restoreRecords(decodeURIComponent(restoreMatch[1]))});
  const deleteMatch=/^\/api\/(students|groups)\/([^/]+)$/.exec(p);
  if(deleteMatch&&method==='DELETE') {
    const body=await bodyOf(req);
    return json(res,200,{deletion:recycleRecords(deleteMatch[1]==='groups'?'group':'student',decodeURIComponent(deleteMatch[2]),body.confirmName)});
  }
  for(const [route,table,key,validate]of [['students','students','student',validateStudent],['groups','groups','group',validateGroup],['sessions','sessions','session',validateSession]]) {
    if(p===`/api/${route}`&&method==='POST') {const item=put(table,validate(await bodyOf(req),null));return json(res,201,{[key]:item});}
    const match=new RegExp(`^/api/${route}/([^/]+)$`).exec(p);
    if(match&&method==='PUT') {const existing=requireItem(table,decodeURIComponent(match[1]));const item=put(table,validate(await bodyOf(req),existing));return json(res,200,{[key]:item});}
  }
  if(p==='/api/attendance'&&method==='POST') {
    const body=await bodyOf(req),sessionId=string(body.sessionId,'课程',100,true),studentId=string(body.studentId,'学员',100,true);
    enrollment(sessionId,studentId);if(!['present','late','leave','absent','pending'].includes(body.status))fail(400,'考勤状态不正确');
    const attendance=put('attendance',{sessionId,studentId,status:body.status,note:string(body.note,'考勤备注',500)},`${sessionId}:${studentId}`);
    return json(res,200,{attendance});
  }
  if(p==='/api/attendance/bulk'&&method==='POST') {
    const body=await bodyOf(req),session=requireItem('sessions',string(body.sessionId,'课程',100,true),'课程');
    const groupId=string(body.groupId,'项目组',100),groupIds=sessionGroupIds(session);
    if(groupId&&!groupIds.includes(groupId))fail(400,'该项目组不属于本次课程');
    const result=transaction(()=>all('students').filter(s=>groupIds.includes(s.groupId)&&(!groupId||s.groupId===groupId)).map(s=>{const id=`${session.id}:${s.id}`,previous=get('attendance',id);if(previous?.status==='leave')return previous;return put('attendance',{sessionId:session.id,studentId:s.id,status:'present',note:previous?.note||''},id);}));
    return json(res,200,{attendance:result});
  }
  const reviewUpdate=/^\/api\/reviews\/([^/]+)$/.exec(p);
  if((p==='/api/reviews'&&method==='POST')||(reviewUpdate&&method==='PUT')) {
    const body=await bodyOf(req);let existing=null;
    const id=reviewUpdate?decodeURIComponent(reviewUpdate[1]):body.id;
    if(id)existing=requireItem('reviews',string(id,'评价',100,true),'评价');
    if(!existing&&body.type==='day'&&body.studentId&&body.sessionId)existing=all('reviews').find(r=>r.type==='day'&&r.studentId===body.studentId&&r.sessionId===body.sessionId)||null;
    const review=put('reviews',validateReview(body,existing));return json(res,existing?200:201,{review});
  }
  const publishSession=/^\/api\/sessions\/([^/]+)\/publish$/.exec(p);
  if(publishSession&&method==='POST') {
    const session=requireItem('sessions',decodeURIComponent(publishSession[1]),'课程');
    const result=transaction(()=>{put('sessions',{...session,published:true});const reviews=all('reviews').filter(r=>r.sessionId===session.id&&r.type==='day');reviews.forEach(r=>put('reviews',{...r,published:true,updatedAt:new Date().toISOString()}));return {session:{...session,published:true},publishedReviews:reviews.length};});
    return json(res,200,result);
  }
  const publishReview=/^\/api\/reviews\/([^/]+)\/publish$/.exec(p);
  if(publishReview&&method==='POST') {const review=requireItem('reviews',decodeURIComponent(publishReview[1]),'评价');return json(res,200,{review:put('reviews',{...review,published:true,updatedAt:new Date().toISOString()})});}
  if(p==='/api/export'&&method==='GET') {
    const q=url.searchParams,start=q.get('start')?date(q.get('start'),'开始日期'):'0000-01-01',end=q.get('end')?date(q.get('end'),'结束日期'):'9999-12-31';
    if(end<start)fail(400,'结束日期不能早于开始日期');
    const studentId=q.get('studentId'),groupId=q.get('groupId'),type=q.get('type'),sessionId=q.get('sessionId');
    const selectedSession=sessionId?requireItem('sessions',sessionId,'课程'):null;
    const selectedGroups=selectedSession?new Set(sessionGroupIds(selectedSession)):null;
    if(studentId)requireItem('students',studentId,'学员');
    if(groupId)requireItem('groups',groupId,'项目组');
    if(groupId&&selectedGroups&&!selectedGroups.has(groupId))fail(400,'该项目组不属于所选课程');
    if(studentId&&selectedGroups&&!selectedGroups.has(get('students',studentId).groupId))fail(400,'该学员不属于所选课程');
    if(type&&!['day','week','month'].includes(type))fail(400,'评价类型不正确');
    const students=new Map(all('students').map(s=>[s.id,s])),groups=new Map(all('groups').map(g=>[g.id,g])),sessions=new Map(all('sessions').map(s=>[s.id,s]));
    const rows=[['学员编号','孩子姓名','项目组','项目名称','评价类型','开始日期','结束日期','课程名称','评价内容','评价标签','评价老师','发布状态']];
    all('reviews').filter(r=>r.periodStart<=end&&r.periodEnd>=start&&(!selectedGroups||selectedGroups.has(students.get(r.studentId)?.groupId))&&(!studentId||r.studentId===studentId)&&(!groupId||students.get(r.studentId)?.groupId===groupId)&&(!type||r.type===type)).sort((a,b)=>a.periodStart.localeCompare(b.periodStart)).forEach(r=>{const s=students.get(r.studentId),g=groups.get(s?.groupId),course=sessions.get(r.sessionId);rows.push([s?.studentNo,s?.name,g?.name,g?.projectName,{day:'日评价',week:'周评价',month:'月评价'}[r.type],r.periodStart,r.periodEnd,course?.title||'',r.text,r.tags.join('、'),r.teacherName,r.published?'已发布':'草稿']);});
    const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="classroom-reviews.csv"','Cache-Control':'no-store'});return res.end(csv);
  }
  fail(404,'接口不存在');
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'不支持此操作');
    const publicDir=path.join(ROOT,'public');
    let filePath=path.resolve(publicDir,'.'+decodeURIComponent(url.pathname));
    if(!filePath.startsWith(publicDir+path.sep)&&filePath!==publicDir)fail(404,'页面不存在');
    if(url.pathname==='/'||url.pathname==='/parent'||url.pathname==='/parent/')filePath=path.join(publicDir,'index.html');
    if(!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())fail(404,'页面不存在');
    res.writeHead(200,{'Content-Type':MIME[path.extname(filePath)]||'application/octet-stream','Cache-Control':'no-cache'});
    if(req.method==='HEAD')return res.end();fs.createReadStream(filePath).pipe(res);
  }catch(error){if(!res.headersSent)json(res,error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.message:'服务暂时不可用，请稍后重试'});else res.end();}
});
const HOST=process.env.HOST||'127.0.0.1',PORT=Number(process.env.PORT||4173);
server.listen(PORT,HOST,()=>console.log(`AI Classroom console: http://${HOST}:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>{db.close();process.exit(0);});});
