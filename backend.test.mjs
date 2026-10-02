import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root=path.dirname(fileURLToPath(import.meta.url));

test('classroom backend: authentication, persistence, parent privacy and exports',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-test-'));
  let server,base,cookie='';
  async function start(){
    const env={...process.env,DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1'};
    delete env.TEACHER_PASSWORD;
    server=spawn(process.execPath,['--experimental-sqlite',path.join(root,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});
    let output='',errors='';server.stderr.on('data',chunk=>errors+=chunk.toString());
    base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Server start timed out: ${errors}`)),10000);
      server.stdout.on('data',chunk=>{output+=chunk.toString();const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match){clearTimeout(timer);resolve(match[0]);}});
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${errors}`));});
    });
  }
  async function stop(){if(server&&server.exitCode===null){await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});}}
  async function call(route,{method='GET',body,auth=true,origin}={}){
    const headers={};if(auth&&cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;
    const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();return {status:response.status,result,headers:response.headers};
  }
  async function login(){const result=await call('/api/auth/login',{method:'POST',auth:false,body:{username:'teacher',password:'SpaceClass2026!'}});assert.equal(result.status,200);cookie=result.headers.get('set-cookie').split(';')[0];return result;}
  t.after(async()=>{await stop();fs.rmSync(directory,{recursive:true,force:true});});
  await start();
  let boot,groupId,studentId,sessionId,weekId;

  await t.test('teacher records require cookie and reject cross-origin writes',async()=>{
    assert.equal((await call('/api/bootstrap',{auth:false})).status,401);
    assert.equal((await call('/api/export',{auth:false})).status,401);
    assert.equal((await call('/api/auth/login',{method:'POST',auth:false,body:{username:'teacher',password:'incorrect'}})).status,401);
    const result=await login();assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.match(result.headers.get('set-cookie'),/SameSite=Strict/);
    assert.equal((await call('/api/auth/me')).result.user.name,'星辰老师');
    assert.equal((await call('/api/groups',{method:'POST',origin:'https://untrusted.example',body:{name:'Blocked'}})).status,403);
    boot=(await call('/api/bootstrap')).result;assert.equal(boot.students.length,6);assert.equal(boot.groups.length,1);
    const disk=fs.readFileSync(path.join(directory,'classroom.sqlite'));assert.equal(disk.includes(Buffer.from('SpaceClass2026!')),false);
  });

  await t.test('bulk attendance preserves leave and enrolled students are validated',async()=>{
    const result=await call('/api/attendance/bulk',{method:'POST',body:{sessionId:'s-today'}});
    assert.equal(result.status,200);assert.equal(result.result.attendance.length,6);
    assert.equal(result.result.attendance.find(a=>a.studentId==='s-003').status,'leave');
    assert.equal(result.result.attendance.filter(a=>a.status==='present').length,5);
    assert.equal((await call('/api/attendance',{method:'POST',body:{sessionId:'s-today',studentId:'s-001',status:'invisible'}})).status,400);
  });

  await t.test('parent header, collision, sibling and draft responses disclose only allowed fields',async()=>{
    const header=await call('/api/parent/session/s-today',{auth:false});assert.equal(header.status,200);assert.equal(header.result.session.content,undefined);assert.equal(header.result.students,undefined);
    const collision=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'2468'}});
    assert.deepEqual(collision.result,{needsMoreDigits:true});
    const disambiguated=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'12468'}});
    assert.equal(disambiguated.result.children.length,1);assert.equal(disambiguated.result.children[0].name,'陈一诺');
    const siblings=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'1388'}});
    assert.equal(siblings.result.children.length,2);assert.equal(siblings.result.children[0].reviews.length,1);
    for(const child of siblings.result.children){assert.deepEqual(Object.keys(child).sort(),['attendance','avatar','groupName','name','nickname','projectName','reviews']);assert.equal(child.parentPhone,undefined);assert.equal(child.id,undefined);}
    assert.equal(JSON.stringify(siblings.result).includes('13800001388'),false);
    const draft=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'5678'}});
    assert.deepEqual(draft.result.children[0].reviews,[]);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'12'}})).status,400);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'9999'}})).status,404);
  });

  await t.test('create and update profiles, group, session and reviews with validation',async()=>{
    const group=await call('/api/groups',{method:'POST',body:{name:'机器人组',projectName:'月球车',captain:'小测',introduction:'探索机械控制'}});assert.equal(group.status,201);groupId=group.result.group.id;
    const student=await call('/api/students',{method:'POST',body:{studentNo:'TEST001',name:'测试孩子',nickname:'小测',grade:'三年级',gender:'男',parentName:'测试家长',parentPhone:'13000004321',avatar:'',groupId}});assert.equal(student.status,201);studentId=student.result.student.id;
    assert.equal((await call('/api/students',{method:'POST',body:{...student.result.student,name:'重复编号'}})).status,409);
    assert.equal((await call(`/api/students/${studentId}`,{method:'PUT',body:{avatar:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
    const updated=await call(`/api/students/${studentId}`,{method:'PUT',body:{nickname:'测试员'}});assert.equal(updated.result.student.nickname,'测试员');
    const session=await call('/api/sessions',{method:'POST',body:{groupId,title:'机器人的第一步',date:'2026-09-29',startTime:'10:00',endTime:'11:30',content:'PRIVATE DRAFT CONTENT'}});assert.equal(session.status,201);sessionId=session.result.session.id;
    assert.equal((await call('/api/attendance',{method:'POST',body:{sessionId,studentId:'s-001',status:'present'}})).status,400);
    assert.equal((await call('/api/sessions',{method:'POST',body:{groupId,title:'错误日期',date:'2026-02-30',startTime:'10:00',endTime:'11:30'}})).status,400);
    const day=await call('/api/reviews',{method:'POST',body:{studentId,sessionId,type:'day',text:'PRIVATE DRAFT REVIEW',tags:['专注']}});assert.equal(day.status,201);
    const week=await call('/api/reviews',{method:'POST',body:{studentId,type:'week',periodStart:'2026-09-28',periodEnd:'2026-10-04',text:'=HYPERLINK("https://example.com")',tags:['协作'],published:false}});assert.equal(week.status,201);weekId=week.result.review.id;
    const before=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId,suffix:'4321'}});assert.equal(before.result.session.content,'');assert.deepEqual(before.result.children[0].reviews,[]);
  });

  await t.test('session publication publishes only linked daily drafts, separate week publication works',async()=>{
    const result=await call(`/api/sessions/${sessionId}/publish`,{method:'POST'});assert.equal(result.status,200);assert.equal(result.result.publishedReviews,1);
    const after=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId,suffix:'4321'}});assert.equal(after.result.session.content,'PRIVATE DRAFT CONTENT');assert.equal(after.result.children[0].reviews.length,1);assert.equal(after.result.children[0].reviews[0].text,'PRIVATE DRAFT REVIEW');
    const reviews=(await call('/api/bootstrap')).result.reviews;assert.equal(reviews.find(r=>r.id===weekId).published,false);
    assert.equal((await call(`/api/reviews/${weekId}/publish`,{method:'POST'})).result.review.published,true);
    const withWeek=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId,suffix:'4321'}});assert.equal(withWeek.result.children[0].reviews.length,2);
  });

  await t.test('group and date edits cannot detach existing classroom history',async()=>{
    const attendanceTransfer=await call('/api/students/s-003',{method:'PUT',body:{groupId}});
    assert.equal(attendanceTransfer.status,400);assert.match(attendanceTransfer.result.error,/已有考勤或评价记录/);
    const reviewTransfer=await call(`/api/students/${studentId}`,{method:'PUT',body:{groupId:'g-space'}});
    assert.equal(reviewTransfer.status,400);assert.match(reviewTransfer.result.error,/历史课程与家长反馈/);
    const dateChange=await call(`/api/sessions/${sessionId}`,{method:'PUT',body:{date:'2026-10-01'}});
    assert.equal(dateChange.status,400);assert.match(dateChange.result.error,/已有日评价/);
    const records=(await call('/api/bootstrap')).result;
    assert.equal(records.students.find(s=>s.id===studentId).groupId,groupId);
    assert.equal(records.sessions.find(s=>s.id===sessionId).date,'2026-09-29');
    assert.equal(records.reviews.find(r=>r.sessionId===sessionId&&r.type==='day').periodStart,'2026-09-29');
    const unchangedGroup=await call(`/api/students/${studentId}`,{method:'PUT',body:{groupId,nickname:'测试员'}});
    assert.equal(unchangedGroup.status,200);
    assert.equal((await call(`/api/sessions/${sessionId}`,{method:'PUT',body:{date:'2026-09-29',title:'机器人的第一步'}})).status,200);
    const newStudent=await call('/api/students',{method:'POST',body:{studentNo:'MOVE001',name:'待分组孩子',grade:'二年级',parentName:'家长',parentPhone:'13000009988',groupId}});
    const transfer=await call(`/api/students/${newStudent.result.student.id}`,{method:'PUT',body:{groupId:'g-space'}});
    assert.equal(transfer.status,200);assert.equal(transfer.result.student.groupId,'g-space');
    const newSession=await call('/api/sessions',{method:'POST',body:{groupId,title:'待开课',date:'2026-10-01',startTime:'10:00',endTime:'11:00'}});
    const moveDate=await call(`/api/sessions/${newSession.result.session.id}`,{method:'PUT',body:{date:'2026-10-02'}});
    assert.equal(moveDate.status,200);assert.equal(moveDate.result.session.date,'2026-10-02');
  });

  await t.test('CSV date overlap and group/student filters include quoted safe cell values',async()=>{
    const response=await fetch(`${base}/api/export?start=2026-10-01&end=2026-10-01&studentId=${studentId}&groupId=${groupId}&type=week`,{headers:{Cookie:cookie}});
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
    const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);const csv=bytes.toString('utf8');
    assert.match(csv,/测试孩子/);assert.match(csv,/周评价/);assert.match(csv,/"'=HYPERLINK\(""https:\/\/example.com""\)"/);assert.doesNotMatch(csv,/陈一诺/);
    assert.equal((await call('/api/export?start=2026-10-02&end=2026-10-01')).status,400);
  });

  await t.test('legacy metadata remains readable and untouched by startup or normal edits',async()=>{
    const tables=['students','groups','sessions','attendance','reviews'];
    await stop();
    const legacy=new DatabaseSync(path.join(directory,'classroom.sqlite'));
    legacy.exec('CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    legacy.prepare('INSERT INTO classrooms (id,data) VALUES (?,?)').run('classroom-default',JSON.stringify({id:'classroom-default',name:'旧版元数据'}));
    for(const table of tables)for(const row of legacy.prepare(`SELECT id,data FROM ${table}`).all()){
      const record={...JSON.parse(row.data),classId:'classroom-default'};
      if(table==='sessions')delete record.groupIds;
      legacy.prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(record),row.id);
    }
    const snapshots=Object.fromEntries([...tables,'classrooms'].map(table=>[table,legacy.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all()]));
    legacy.close();await start();
    const records=(await call('/api/bootstrap')).result;
    assert.equal(records.classroom,undefined);assert.equal(records.classrooms,undefined);
    for(const table of tables){assert.equal(records[table].length,snapshots[table].length);assert.ok(records[table].every(item=>item.classId==='classroom-default'));}
    assert.equal((await call('/api/classrooms')).status,404);
    assert.equal((await call('/api/classrooms',{method:'POST',body:{name:'不再支持'}})).status,404);
    const stored=new DatabaseSync(path.join(directory,'classroom.sqlite'),{readOnly:true});
    for(const table of [...tables,'classrooms'])assert.deepEqual(stored.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all(),snapshots[table]);
    stored.close();
    const edits=[
      [`/api/students/${studentId}`,'PUT',{nickname:'测试员'},'student'],
      [`/api/groups/${groupId}`,'PUT',{name:'机器人组'},'group'],
      [`/api/sessions/${sessionId}`,'PUT',{title:'机器人的第一步'},'session'],
      [`/api/reviews/${weekId}`,'PUT',{text:records.reviews.find(r=>r.id===weekId).text},'review'],
      ['/api/attendance','POST',{sessionId:'s-today',studentId:'s-003',status:'leave',note:'家长已告知今日请假'},'attendance'],
    ];
    for(const [route,method,body,key]of edits){const response=await call(route,{method,body});assert.equal(response.status,200);assert.equal(response.result[key].classId,'classroom-default');}
    const parent=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'1388'}});
    assert.equal(parent.status,200);assert.deepEqual(parent.result.children.map(k=>k.name),['林子墨','林子涵']);assert.equal(JSON.stringify(parent.result).includes('classId'),false);
    const beforeGroup=(await call('/api/bootstrap')).result;
    const newGroup=await call('/api/groups',{method:'POST',body:{name:'全新项目组',projectName:'自由探索'}});
    assert.equal(newGroup.status,201);assert.equal(newGroup.result.group.classId,undefined);
    const afterGroup=(await call('/api/bootstrap')).result;
    assert.equal(afterGroup.groups.length,beforeGroup.groups.length+1);
    for(const table of ['students','sessions','attendance','reviews'])assert.deepEqual(afterGroup[table],beforeGroup[table]);
  });

  const collectionNames=['groups','students','sessions','attendance','reviews'];
  const sortedRecords=data=>Object.fromEntries(collectionNames.map(table=>[table,data[table].map(record=>JSON.stringify(record)).sort()]));
  const activeRecords=async()=>sortedRecords((await call('/api/bootstrap')).result);
  let removalGroup,removalStudents=[],removalSessions=[];
  await t.test('prepare independent records for recoverable deletions',async()=>{
    removalGroup=(await call('/api/groups',{method:'POST',body:{name:'删除测试组',projectName:'恢复实验'}})).result.group;
    for(let i=1;i<=2;i++)removalStudents.push((await call('/api/students',{method:'POST',body:{studentNo:`DEL00${i}`,name:`删除测试学员${i}`,grade:'二年级',parentName:`恢复家长${i}`,parentPhone:`1300000674${i}`,groupId:removalGroup.id}})).result.student);
    for(let i=1;i<=2;i++)removalSessions.push((await call('/api/sessions',{method:'POST',body:{groupId:removalGroup.id,title:`恢复课程${i}`,date:`2026-10-0${i}`,startTime:'10:00',endTime:'11:00',content:'恢复后仍可读取的内容'}})).result.session);
    for(const course of removalSessions)for(const student of removalStudents){
      assert.equal((await call('/api/attendance',{method:'POST',body:{sessionId:course.id,studentId:student.id,status:'present',note:'保留备注'}})).status,200);
      assert.equal((await call('/api/reviews',{method:'POST',body:{sessionId:course.id,studentId:student.id,type:'day',text:`${student.name}的课堂反馈`}})).status,201);
    }
    for(const student of removalStudents)assert.equal((await call('/api/reviews',{method:'POST',body:{studentId:student.id,type:'week',periodStart:'2026-09-28',periodEnd:'2026-10-04',text:'一起保存的周评价',published:true}})).status,201);
    for(const course of removalSessions)assert.equal((await call(`/api/sessions/${course.id}/publish`,{method:'POST'})).status,200);
  });

  await t.test('deletions require login, same origin and an exact confirmation name',async()=>{
    const before=await activeRecords(),kid=removalStudents[0];
    assert.equal((await call(`/api/students/${kid.id}`,{method:'DELETE',auth:false,body:{confirmName:kid.name}})).status,401);
    assert.equal((await call(`/api/groups/${removalGroup.id}`,{method:'DELETE',auth:false,body:{confirmName:removalGroup.name}})).status,401);
    assert.equal((await call('/api/deletions',{auth:false})).status,401);
    assert.equal((await call('/api/deletions/missing/restore',{method:'POST',auth:false})).status,401);
    assert.equal((await call(`/api/students/${kid.id}`,{method:'DELETE',origin:'https://untrusted.example',body:{confirmName:kid.name}})).status,403);
    assert.equal((await call('/api/deletions/missing/restore',{method:'POST',origin:'https://untrusted.example'})).status,403);
    for(const confirmName of ['',kid.name+' ', '另一个孩子',null])assert.equal((await call(`/api/students/${kid.id}`,{method:'DELETE',body:{confirmName}})).status,400);
    assert.equal((await call(`/api/groups/${removalGroup.id}`,{method:'DELETE',body:{confirmName:'其他项目组'}})).status,400);
    assert.equal((await call('/api/students/not-a-student',{method:'DELETE',body:{confirmName:'不存在'}})).status,404);
    assert.deepEqual(await activeRecords(),before);assert.deepEqual((await call('/api/deletions')).result.deletions,[]);
  });

  await t.test('deleting one student cascades only their attendance and reviews and can restore them',async()=>{
    const before=(await call('/api/bootstrap')).result,kid=removalStudents[0];
    const response=await call(`/api/students/${kid.id}`,{method:'DELETE',body:{confirmName:kid.name}});
    assert.equal(response.status,200);const deletion=response.result.deletion;
    assert.equal(deletion.type,'student');assert.equal(deletion.name,kid.name);
    assert.deepEqual(deletion.counts,{groups:0,students:1,sessions:0,attendance:2,reviews:3});
    const after=(await call('/api/bootstrap')).result;
    const expected={...before,students:before.students.filter(s=>s.id!==kid.id),attendance:before.attendance.filter(a=>a.studentId!==kid.id),reviews:before.reviews.filter(r=>r.studentId!==kid.id)};
    assert.deepEqual(sortedRecords(after),sortedRecords(expected));
    const listed=(await call('/api/deletions')).result.deletions;assert.deepEqual(listed,[deletion]);assert.deepEqual(Object.keys(listed[0]).sort(),['counts','deletedAt','id','name','type']);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:removalSessions[0].id,suffix:'6741'}})).status,404);
    const exported=await fetch(base+'/api/export',{headers:{Cookie:cookie}});assert.doesNotMatch(await exported.text(),/删除测试学员1/);
    assert.equal((await call(`/api/deletions/${deletion.id}/restore`,{method:'POST'})).result.restored,true);
    assert.deepEqual(await activeRecords(),sortedRecords(before));assert.deepEqual((await call('/api/deletions')).result.deletions,[]);
    assert.equal((await call(`/api/deletions/${deletion.id}/restore`,{method:'POST'})).status,404);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:removalSessions[0].id,suffix:'6741'}})).result.children[0].reviews.length,2);
  });

  await t.test('group deletion cascades its records only and its recycle snapshot survives restart',async()=>{
    const before=(await call('/api/bootstrap')).result;
    const response=await call(`/api/groups/${removalGroup.id}`,{method:'DELETE',body:{confirmName:removalGroup.name}});
    assert.equal(response.status,200);const deletion=response.result.deletion;
    assert.equal(deletion.type,'group');assert.deepEqual(deletion.counts,{groups:1,students:2,sessions:2,attendance:4,reviews:6});
    const kidIds=new Set(removalStudents.map(s=>s.id)),courseIds=new Set(removalSessions.map(s=>s.id));
    const expected={...before,groups:before.groups.filter(g=>g.id!==removalGroup.id),students:before.students.filter(s=>!kidIds.has(s.id)),sessions:before.sessions.filter(s=>!courseIds.has(s.id)),attendance:before.attendance.filter(a=>!kidIds.has(a.studentId)&&!courseIds.has(a.sessionId)),reviews:before.reviews.filter(r=>!kidIds.has(r.studentId)&&!courseIds.has(r.sessionId))};
    assert.deepEqual(await activeRecords(),sortedRecords(expected));
    assert.equal((await call(`/api/parent/session/${removalSessions[0].id}`,{auth:false})).status,404);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:removalSessions[0].id,suffix:'6741'}})).status,404);
    await stop();await start();assert.deepEqual((await call('/api/deletions')).result.deletions,[deletion]);assert.deepEqual(await activeRecords(),sortedRecords(expected));
    const restored=await call(`/api/deletions/${deletion.id}/restore`,{method:'POST'});assert.equal(restored.status,200);assert.deepEqual(restored.result.deletion,deletion);
    assert.deepEqual(await activeRecords(),sortedRecords(before));
    assert.equal((await call(`/api/parent/session/${removalSessions[0].id}`,{auth:false})).status,200);
    assert.equal((await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:removalSessions[0].id,suffix:'6741'}})).result.children[0].name,removalStudents[0].name);
  });

  await t.test('restore rejects missing dependencies and occupied IDs without partial restoration',async()=>{
    const before=await activeRecords(),kid=removalStudents[0];
    const studentDeletion=(await call(`/api/students/${kid.id}`,{method:'DELETE',body:{confirmName:kid.name}})).result.deletion;
    const groupDeletion=(await call(`/api/groups/${removalGroup.id}`,{method:'DELETE',body:{confirmName:removalGroup.name}})).result.deletion;
    let remaining=await activeRecords();
    const missingGroup=await call(`/api/deletions/${studentDeletion.id}/restore`,{method:'POST'});assert.equal(missingGroup.status,409);assert.match(missingGroup.result.error,/先恢复项目组/);assert.deepEqual(await activeRecords(),remaining);
    await stop();const database=new DatabaseSync(path.join(directory,'classroom.sqlite'));
    database.prepare('INSERT INTO groups (id,data) VALUES (?,?)').run(removalGroup.id,JSON.stringify(removalGroup));database.close();await start();
    remaining=await activeRecords();
    const missingCourse=await call(`/api/deletions/${studentDeletion.id}/restore`,{method:'POST'});assert.equal(missingCourse.status,409);assert.match(missingCourse.result.error,/关联课程已删除/);assert.deepEqual(await activeRecords(),remaining);
    const occupied=await call(`/api/deletions/${groupDeletion.id}/restore`,{method:'POST'});assert.equal(occupied.status,409);assert.match(occupied.result.error,/原记录编号已被占用/);assert.deepEqual(await activeRecords(),remaining);
    const saved=(await call('/api/deletions')).result.deletions;assert.equal(saved.length,2);assert.ok(saved.some(d=>d.id===studentDeletion.id));assert.ok(saved.some(d=>d.id===groupDeletion.id));
    await stop();const clean=new DatabaseSync(path.join(directory,'classroom.sqlite'));clean.prepare('DELETE FROM groups WHERE id=?').run(removalGroup.id);clean.close();await start();
    assert.equal((await call(`/api/deletions/${groupDeletion.id}/restore`,{method:'POST'})).status,200);
    assert.equal((await call(`/api/deletions/${studentDeletion.id}/restore`,{method:'POST'})).status,200);
    assert.deepEqual(await activeRecords(),before);assert.deepEqual((await call('/api/deletions')).result.deletions,[]);
  });

  await t.test('student number conflicts preserve all pending group records until resolved',async()=>{
    const before=await activeRecords();
    const deletion=(await call(`/api/groups/${removalGroup.id}`,{method:'DELETE',body:{confirmName:removalGroup.name}})).result.deletion;
    const replacement=(await call('/api/students',{method:'POST',body:{studentNo:removalStudents[0].studentNo,name:'编号占用者',grade:'二年级',parentName:'临时家长',parentPhone:'13000009966',groupId:'g-space'}})).result.student;
    const remaining=await activeRecords();
    const conflict=await call(`/api/deletions/${deletion.id}/restore`,{method:'POST'});assert.equal(conflict.status,409);assert.match(conflict.result.error,/学员编号 DEL001 已被使用/);assert.deepEqual(await activeRecords(),remaining);assert.ok((await call('/api/deletions')).result.deletions.some(d=>d.id===deletion.id));
    assert.equal((await call(`/api/students/${replacement.id}`,{method:'PUT',body:{studentNo:'DEL-REPLACEMENT'}})).status,200);
    assert.equal((await call(`/api/deletions/${deletion.id}/restore`,{method:'POST'})).status,200);
    assert.equal((await call(`/api/students/${replacement.id}`,{method:'DELETE',body:{confirmName:replacement.name}})).status,200);
    assert.deepEqual(await activeRecords(),before);
  });

  await t.test('SQLite records and auth survive restart; logout revokes session',async()=>{
    await stop();await start();assert.equal((await call('/api/auth/me')).status,200);
    const records=(await call('/api/bootstrap')).result;assert.equal(records.students.find(s=>s.id===studentId).nickname,'测试员');assert.equal(records.sessions.find(s=>s.id===sessionId).published,true);assert.equal(records.reviews.find(r=>r.id===weekId).published,true);
    assert.equal((await call('/api/auth/logout',{method:'POST'})).status,200);assert.equal((await call('/api/bootstrap')).status,401);
  });

  await t.test('parent lookup throttles repeated attempts',async()=>{
    let last;for(let i=0;i<31;i++)last=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:'s-today',suffix:'9999'}});assert.equal(last.status,429);
  });
});

test('multi-group courses: enrollment, privacy, exports and overlapping recoveries',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-multi-test-'));
  let server,base,cookie='';
  async function start(){
    const env={...process.env,DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1'};delete env.TEACHER_PASSWORD;
    server=spawn(process.execPath,['--experimental-sqlite',path.join(root,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});
    let output='',errors='';server.stderr.on('data',chunk=>errors+=chunk.toString());
    base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Server start timed out: ${errors}`)),10000);
      server.stdout.on('data',chunk=>{output+=chunk.toString();const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match){clearTimeout(timer);resolve(match[0]);}});
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${errors}`));});
    });
  }
  async function stop(){if(server&&server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});}
  async function call(route,{method='GET',body,auth=true}={}){
    const headers={};if(auth&&cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,result:await response.json(),headers:response.headers};
  }
  async function create(route,body,key){const response=await call(route,{method:'POST',body});assert.equal(response.status,201,JSON.stringify(response.result));return response.result[key];}
  const group=name=>create('/api/groups',{name,projectName:`${name}项目`},'group');
  let sequence=0;
  const student=(groupId,name,phone)=>create('/api/students',{groupId,name,studentNo:`MULTI-${++sequence}`,grade:'三年级',parentName:'测试家长',parentPhone:phone},'student');
  const course=(groupIds,title='多小队课堂')=>create('/api/sessions',{groupIds,title,date:'2026-10-01',startTime:'09:00',endTime:'10:00',content:'共同学习内容'},'session');
  const record=async(sessionId,studentId,text)=>{
    assert.equal((await call('/api/attendance',{method:'POST',body:{sessionId,studentId,status:'present'}})).status,200);
    return create('/api/reviews',{sessionId,studentId,type:'day',text},'review');
  };
  const remove=async g=>{const r=await call(`/api/groups/${g.id}`,{method:'DELETE',body:{confirmName:g.name}});assert.equal(r.status,200);return r.result.deletion;};
  const restore=id=>call(`/api/deletions/${id}/restore`,{method:'POST'});
  const boot=async()=>(await call('/api/bootstrap')).result;
  t.after(async()=>{await stop();fs.rmSync(directory,{recursive:true,force:true});});
  await start();
  const login=await call('/api/auth/login',{method:'POST',body:{username:'teacher',password:'SpaceClass2026!'}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  let first,second,outside,one,two,sibling,outsider,session;

  await t.test('legacy courses normalize at read; new courses accept unique existing groups',async()=>{
    first=await group('一队');second=await group('二队');outside=await group('课外组');
    one=await student(first.id,'第一队孩子','13100001234');two=await student(second.id,'第二队孩子','13200001234');sibling=await student(second.id,'跨队兄妹','13100001234');outsider=await student(outside.id,'课外学员','13300005678');
    const payload={title:'错误课程',date:'2026-10-01',startTime:'09:00',endTime:'10:00'};
    for(const groupIds of [[],null,'invalid',['missing']])assert.ok([400,404].includes((await call('/api/sessions',{method:'POST',body:{...payload,groupIds}})).status));
    session=await course([first.id,second.id,first.id]);assert.deepEqual(session.groupIds,[first.id,second.id]);assert.equal(session.groupId,first.id);
    const update=await call(`/api/sessions/${session.id}`,{method:'PUT',body:{content:'共同更新的内容'}});assert.equal(update.status,200);assert.deepEqual(update.result.session.groupIds,[first.id,second.id]);
    const legacy=(await boot()).sessions.find(s=>s.id==='s-today');assert.deepEqual(legacy.groupIds,['g-space']);
  });

  await t.test('attendance scopes one group or the full course; reviews validate all enrolled groups',async()=>{
    await call('/api/attendance',{method:'POST',body:{sessionId:session.id,studentId:sibling.id,status:'leave',note:'保留请假'}});
    const firstOnly=await call('/api/attendance/bulk',{method:'POST',body:{sessionId:session.id,groupId:first.id}});assert.equal(firstOnly.status,200);assert.deepEqual(firstOnly.result.attendance.map(a=>a.studentId),[one.id]);
    const partial=(await boot()).attendance.filter(a=>a.sessionId===session.id);assert.equal(partial.some(a=>a.studentId===two.id),false);
    const all=await call('/api/attendance/bulk',{method:'POST',body:{sessionId:session.id}});assert.equal(all.result.attendance.length,3);assert.equal(all.result.attendance.find(a=>a.studentId===sibling.id).status,'leave');
    assert.equal((await call('/api/attendance/bulk',{method:'POST',body:{sessionId:session.id,groupId:outside.id}})).status,400);
    assert.equal((await call('/api/attendance',{method:'POST',body:{sessionId:session.id,studentId:outsider.id,status:'present'}})).status,400);
    await record(session.id,one.id,'第一小队日评价');await record(session.id,two.id,'第二小队日评价');
    assert.equal((await call('/api/reviews',{method:'POST',body:{sessionId:session.id,studentId:outsider.id,type:'day',text:'不应成功'}})).status,400);
    const removed=await call(`/api/sessions/${session.id}`,{method:'PUT',body:{groupIds:[first.id]}});assert.equal(removed.status,400);assert.match(removed.result.error,/已有本课程的考勤或评价/);
    assert.equal((await call(`/api/sessions/${session.id}`,{method:'PUT',body:{groupIds:[first.id,second.id,outside.id]}})).status,200);
    assert.equal((await call(`/api/sessions/${session.id}`,{method:'PUT',body:{groupIds:[first.id,second.id]}})).status,200);
    const legacyChange=await call(`/api/sessions/${session.id}`,{method:'PUT',body:{groupId:first.id}});assert.equal(legacyChange.status,400);
  });

  await t.test('one parent link resolves cross-group siblings while withholding colliding families and metadata',async()=>{
    const header=await call(`/api/parent/session/${session.id}`,{auth:false});assert.equal(header.result.session.groupName,undefined);assert.equal(header.result.session.groupIds,undefined);assert.equal(header.result.session.projectName,undefined);assert.equal(header.result.session.content,undefined);
    const collision=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:session.id,suffix:'1234'}});assert.deepEqual(collision.result,{needsMoreDigits:true});
    assert.equal((await call(`/api/sessions/${session.id}/publish`,{method:'POST'})).result.publishedReviews,2);
    const family=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:session.id,suffix:one.parentPhone}});assert.equal(family.status,200);assert.equal(family.result.children.length,2);assert.deepEqual(new Set(family.result.children.map(c=>c.groupName)),new Set([first.name,second.name]));assert.equal(family.result.session.content,'共同更新的内容');
    assert.equal(family.result.children.find(c=>c.name===one.name).reviews[0].text,'第一小队日评价');assert.equal(family.result.children.some(c=>c.name===two.name),false);assert.equal(JSON.stringify(family.result).includes(one.parentPhone),false);
    const other=await call('/api/parent/lookup',{method:'POST',auth:false,body:{sessionId:session.id,suffix:two.parentPhone}});assert.equal(other.result.children[0].projectName,second.projectName);assert.equal(other.result.children[0].reviews[0].text,'第二小队日评价');
  });

  await t.test('course export scopes enrolled students while retaining date overlap and period reviews',async()=>{
    await create('/api/reviews',{studentId:two.id,type:'week',periodStart:'2026-09-28',periodEnd:'2026-10-04',text:'课内周评价'},'review');
    await create('/api/reviews',{studentId:one.id,type:'month',periodStart:'2026-10-01',periodEnd:'2026-10-31',text:'课内月评价'},'review');
    await create('/api/reviews',{studentId:outsider.id,type:'week',periodStart:'2026-09-28',periodEnd:'2026-10-04',text:'课外周评价'},'review');
    const exportText=async extra=>{const response=await fetch(`${base}/api/export?sessionId=${session.id}&start=2026-10-01&end=2026-10-01${extra}`,{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.text();};
    const csv=await exportText('');for(const text of ['第一小队日评价','第二小队日评价','课内周评价','课内月评价'])assert.ok(csv.includes(text));assert.ok(!csv.includes('课外周评价'));
    const filtered=await exportText(`&groupId=${second.id}`);assert.ok(filtered.includes('课内周评价'));assert.ok(!filtered.includes('第一小队日评价'));assert.ok(!filtered.includes('课内月评价'));
    assert.equal((await call(`/api/export?sessionId=${session.id}&groupId=${outside.id}`)).status,400);assert.equal((await call(`/api/export?sessionId=${session.id}&studentId=${outsider.id}`)).status,400);
  });

  await t.test('shared course deletion preserves other groups and restores links without overwriting later content',async()=>{
    const before=await boot(),deletion=await remove(first);
    assert.equal(deletion.counts.sessions,0);assert.equal(deletion.counts.sharedSessions,1);assert.equal(deletion.counts.students,1);
    const after=await boot(),remaining=after.sessions.find(s=>s.id===session.id);assert.deepEqual(remaining.groupIds,[second.id]);assert.equal(after.students.some(s=>s.id===one.id),false);assert.ok(after.students.some(s=>s.id===two.id));assert.ok(after.reviews.some(r=>r.studentId===two.id));assert.equal(after.reviews.some(r=>r.studentId===one.id),false);
    assert.equal((await call(`/api/sessions/${session.id}`,{method:'PUT',body:{title:'删除后修改的课程名',content:'保留后续编辑'}})).status,200);
    const restored=await restore(deletion.id);assert.equal(restored.status,200,JSON.stringify(restored.result));
    const result=await boot(),restoredCourse=result.sessions.find(s=>s.id===session.id);assert.deepEqual(new Set(restoredCourse.groupIds),new Set([first.id,second.id]));assert.equal(restoredCourse.title,'删除后修改的课程名');assert.equal(restoredCourse.content,'保留后续编辑');
    assert.deepEqual(result.reviews.filter(r=>r.studentId===one.id),before.reviews.filter(r=>r.studentId===one.id));
  });

  for(const order of ['earlier-first','later-first'])await t.test(`overlapping group deletions restore ${order} with latest shared course fields`,async()=>{
    const a=await group(`重叠甲-${order}`),b=await group(`重叠乙-${order}`),kidA=await student(a.id,`甲学员-${order}`,'13500006789'),kidB=await student(b.id,`乙学员-${order}`,'13600006790');
    const shared=await course([a.id,b.id],`顺序恢复-${order}`);await record(shared.id,kidA.id,'甲组历史');await record(shared.id,kidB.id,'乙组历史');
    const deletionA=await remove(a);assert.equal(deletionA.counts.sharedSessions,1);
    await call(`/api/sessions/${shared.id}`,{method:'PUT',body:{title:'中途改名',content:'中途编辑内容'}});
    const deletionB=await remove(b);assert.equal(deletionB.counts.sessions,1);assert.equal((await boot()).sessions.some(s=>s.id===shared.id),false);
    await stop();await start();
    const [firstRestore,secondRestore]=order==='earlier-first'?[deletionA,deletionB]:[deletionB,deletionA];
    const firstResult=await restore(firstRestore.id);assert.equal(firstResult.status,200,JSON.stringify(firstResult.result));
    const half=await boot();assert.equal(half.sessions.find(s=>s.id===shared.id).title,'中途改名');assert.deepEqual(half.sessions.find(s=>s.id===shared.id).groupIds,[order==='earlier-first'?a.id:b.id]);assert.equal(half.reviews.filter(r=>r.sessionId===shared.id).length,1);
    assert.equal((await call(`/api/sessions/${shared.id}`,{method:'PUT',body:{content:'恢复一组后又修改'}})).status,200);
    const secondResult=await restore(secondRestore.id);assert.equal(secondResult.status,200,JSON.stringify(secondResult.result));
    const result=await boot(),finalCourse=result.sessions.find(s=>s.id===shared.id);assert.deepEqual(new Set(finalCourse.groupIds),new Set([a.id,b.id]));assert.equal(finalCourse.title,'中途改名');assert.equal(finalCourse.content,'恢复一组后又修改');assert.equal(result.reviews.filter(r=>r.sessionId===shared.id).length,2);assert.equal(result.attendance.filter(r=>r.sessionId===shared.id).length,2);
    assert.equal((await call('/api/deletions')).result.deletions.length,0);
  });

  await t.test('legacy recycle snapshots without membership patches or groupIds still restore',async()=>{
    const oldGroup=await group('旧版回收组'),kid=await student(oldGroup.id,'旧版回收学员','13800007788'),oldCourse=await course([oldGroup.id],'旧版课程');await record(oldCourse.id,kid.id,'旧版反馈');
    const deletion=await remove(oldGroup);
    await stop();
    const database=new DatabaseSync(path.join(directory,'classroom.sqlite'));
    const saved=JSON.parse(database.prepare('SELECT data FROM deleted_records WHERE id=?').get(deletion.id).data);
    delete saved.snapshot.sessionLinks;
    for(const row of saved.snapshot.sessions){const session=JSON.parse(row.data);delete session.groupIds;row.data=JSON.stringify(session);}
    database.prepare('UPDATE deleted_records SET data=? WHERE id=?').run(JSON.stringify(saved),deletion.id);database.close();await start();
    const result=await restore(deletion.id);assert.equal(result.status,200,JSON.stringify(result.result));
    const restored=await boot();assert.deepEqual(restored.sessions.find(s=>s.id===oldCourse.id).groupIds,[oldGroup.id]);assert.equal(restored.reviews.find(r=>r.studentId===kid.id).text,'旧版反馈');
  });

  await t.test('shared-course date conflicts reject restoration atomically and can be resolved',async()=>{
    const a=await group('日期甲'),b=await group('日期乙'),kid=await student(a.id,'日期学员','13700004567'),shared=await course([a.id,b.id]);await record(shared.id,kid.id,'不可错配的日评价');
    const deletion=await remove(a);assert.equal((await call(`/api/sessions/${shared.id}`,{method:'PUT',body:{date:'2026-10-02'}})).status,200);
    const before=await boot();const conflict=await restore(deletion.id);assert.equal(conflict.status,409);assert.match(conflict.result.error,/原课程日期已改变/);assert.deepEqual(await boot(),before);assert.ok((await call('/api/deletions')).result.deletions.some(d=>d.id===deletion.id));
    await call(`/api/sessions/${shared.id}`,{method:'PUT',body:{date:'2026-10-01'}});assert.equal((await restore(deletion.id)).status,200);
  });
});
