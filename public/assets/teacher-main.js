(function(){

/* ============ THEME ============ */
const STAFF_THEME_STORAGE_KEY = 'examStaffTheme';
function applyTheme(theme){
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try{ localStorage.setItem(STAFF_THEME_STORAGE_KEY,next); }catch(error){}
  const button=document.getElementById('themeToggleBtn');
  if(button) button.textContent=next==='dark' ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
}
try{ applyTheme(localStorage.getItem(STAFF_THEME_STORAGE_KEY)||'light'); }catch(error){ applyTheme('light'); }
document.getElementById('themeToggleBtn').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));

/* ============ API CLIENT ============ */
const API_BASE = '';
const TEACHER_SESSION_STORAGE_KEY = 'examTeacherSession';
const savedTeacherSession = (()=>{ try{return JSON.parse(sessionStorage.getItem(TEACHER_SESSION_STORAGE_KEY)||'null');}catch(error){return null;} })();
let teacherToken = savedTeacherSession?.token || null;
let teacherInfo = savedTeacherSession?.teacherInfo || null; // {teacherId, firstName, lastName}
function saveTeacherSession(){ if(teacherToken&&teacherInfo) sessionStorage.setItem(TEACHER_SESSION_STORAGE_KEY,JSON.stringify({token:teacherToken,teacherInfo})); }
function clearTeacherSession(){ sessionStorage.removeItem(TEACHER_SESSION_STORAGE_KEY); }
async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({'Content-Type':'application/json'}, options.headers||{});
  if(options.auth) headers['x-teacher-token'] = teacherToken || '';
  let res;
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 30000);
  try{
    res = await fetch(API_BASE + path, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal });
  }catch(e){
    if(e.name === 'AbortError') throw new Error('เซิร์ฟเวอร์ตอบกลับช้าเกิน 30 วินาที กรุณาลองบันทึกอีกครั้ง');
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ backend ไม่สำเร็จ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงานอยู่');
  }finally{ clearTimeout(timeoutId); }
  if(res.status===401){ if(options.auth) showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง'); }
  if(!res.ok){
    let msg = 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (HTTP '+res.status+')';
    try{ const j = await res.json(); if(j && j.message) msg = j.message; }catch(e){}
    throw new Error(msg);
  }
  if(res.status===204) return null;
  return res.json();
}
async function apiTeacherLogin(username, password){
  const res = await fetch(API_BASE+'/api/teacher/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password}) });
  if(!res.ok){ let msg='username หรือ password ไม่ถูกต้อง'; try{ const j = await res.json(); if(j&&j.message) msg=j.message; }catch(e){} throw new Error(msg); }
  return res.json();
}
async function apiChangeTeacherPassword(currentPassword, newPassword){ return apiFetch('/api/teacher/change-password', { method:'POST', body:{currentPassword, newPassword}, auth:true }); }
async function apiGetAdminSets(){ return apiFetch('/api/teacher/sets', { auth:true }); }
async function apiUploadQuestionAsset(file){
  const response=await fetch('/api/teacher/assets',{method:'POST',headers:{'x-teacher-token':teacherToken||'','Content-Type':file.type,'x-file-name':encodeURIComponent(file.name)},body:file});
  if(response.status===401){ showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ'); }
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.message||'อัปโหลดไฟล์ไม่สำเร็จ');
  return body;
}
async function apiStartGoogleForms(){ return apiFetch('/api/teacher/google-forms/start', { method:'POST', auth:true }); }
async function apiPreviewGoogleForm(connectionId, formUrl){ return apiFetch('/api/teacher/google-forms/preview', { method:'POST', body:{formUrl}, headers:{'x-google-forms-connection':connectionId}, auth:true }); }
async function apiListGoogleForms(){ return apiFetch('/api/teacher/google-forms/list', { headers:{'x-google-forms-connection':googleFormsConnectionId}, auth:true }); }
async function apiImportGoogleForm(connectionId, formUrl){ return apiFetch('/api/teacher/google-forms/import', { method:'POST', body:{formUrl}, headers:{'x-google-forms-connection':connectionId}, auth:true }); }
async function apiGoogleFormsStatus(requestId=''){ return apiFetch('/api/teacher/google-forms/status?requestId='+encodeURIComponent(requestId), { auth:true }); }
async function apiPreviewQuestionFile(file){
  const response=await fetch('/api/teacher/question-file/preview',{method:'POST',headers:{'x-teacher-token':teacherToken||'','Content-Type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});
  const body=await response.json().catch(()=>({}));if(response.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!response.ok)throw new Error(body.message||'ไม่สามารถอ่านข้อสอบจากไฟล์นี้ได้');return body;
}
async function apiCreateSet(set){ return apiFetch('/api/teacher/sets', { method:'POST', body:set, auth:true }); }
async function apiUpdateSet(key, set){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key), { method:'PUT', body:set, auth:true }); }
async function apiQuickOpenSet(key, open){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/quick-open', { method:'POST', body:{open}, auth:true }); }
async function apiOpenAbsentees(key,hours){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/open-absentees', { method:'POST', body:{hours}, auth:true }); }
async function apiDuplicateSetCall(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/duplicate', { method:'POST', auth:true }); }
async function apiArchiveSetCall(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/archive', { method:'POST', auth:true }); }
async function apiRestoreSetCall(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/restore', { method:'POST', auth:true }); }
async function apiDeleteSetCall(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key), { method:'DELETE', auth:true }); }
async function apiPermanentlyDeleteSet(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/permanent', { method:'DELETE', auth:true }); }
async function apiGetResults(setKey, examType, academicYear, semester){
  const qs = [];
  if(setKey) qs.push('setKey='+encodeURIComponent(setKey));
  if(examType) qs.push('examType='+encodeURIComponent(examType));
  if(academicYear) qs.push('academicYear='+encodeURIComponent(academicYear));
  if(semester) qs.push('semester='+encodeURIComponent(semester));
  return apiFetch('/api/teacher/results'+(qs.length?('?'+qs.join('&')):''), { auth:true });
}
async function apiGetQuestionAnalysis(setKey){ return apiFetch('/api/teacher/question-analysis?setKey='+encodeURIComponent(setKey), { auth:true }); }
async function apiGetAuditLogs(setKey){ return apiFetch('/api/teacher/audit-logs'+(setKey?('?setKey='+encodeURIComponent(setKey)):''), { auth:true }); }
async function apiGetClasses(period){ return apiFetch('/api/teacher/classes'+(period?('?period='+encodeURIComponent(period)):''), { auth:true }); }
async function apiGetStudents(){ return apiFetch('/api/teacher/students', { auth:true }); }
async function apiGetExamRoster(setKey,classRoom){ return apiFetch('/api/teacher/exam-roster?setKey='+encodeURIComponent(setKey)+'&classRoom='+encodeURIComponent(classRoom), { auth:true }); }
async function apiGetAbsenceSummary(setKey,classRooms){ return apiFetch('/api/teacher/exam-absence-summary?setKey='+encodeURIComponent(setKey)+'&classRooms='+encodeURIComponent(classRooms.join(',')), { auth:true }); }
async function apiGetExamTypes(){ return apiFetch('/api/exam-types'); }
async function apiSetPublished(id, published){ return apiFetch('/api/teacher/results/'+encodeURIComponent(id), { method:'PATCH', body:{published}, auth:true }); }
async function apiUpdateDfdScores(id, dfdLevelScores, reason){ return apiFetch('/api/teacher/results/'+encodeURIComponent(id), { method:'PATCH', body:{dfdLevelScores,reason}, auth:true }); }
async function apiUpdateWrittenScores(id, writtenManualScores, reason){ return apiFetch('/api/teacher/results/'+encodeURIComponent(id), { method:'PATCH', body:{writtenManualScores,reason}, auth:true }); }
async function apiPublishAllForSet(key){ return apiFetch('/api/teacher/sets/'+encodeURIComponent(key)+'/publish', { method:'POST', auth:true }); }
async function apiOpenResit(resultId, body){ return apiFetch('/api/teacher/results/'+encodeURIComponent(resultId)+'/resit', { method:'POST', body, auth:true }); }

function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function escapeHtml(str){ return String(str==null?'':str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(str){ return escapeHtml(str).replace(/\n/g,' '); }
function showToast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent=window.I18N?window.I18N.t(msg):msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2800);
}
function askChangeReason(action){
  const value=prompt(`กรุณาระบุเหตุผลในการ${action}\n(กดยกเลิกเพื่อไม่ดำเนินการ)`);
  if(value===null) return null;
  const reason=value.trim(); if(!reason){showToast('ต้องระบุเหตุผลก่อนดำเนินการ');return null;} return reason;
}

let EXAM_TYPES = ['กลางภาค','ปลายภาค'];

/* ============ LOGIN ============ */
const adminLoginScreen = document.getElementById('adminLoginScreen');
const adminScreen = document.getElementById('adminScreen');
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
let sessionIdleTimer = null;
function stopSessionTimer(){ if(sessionIdleTimer) clearTimeout(sessionIdleTimer); sessionIdleTimer=null; }
function scheduleSessionExpiry(){ stopSessionTimer(); if(!teacherToken) return; sessionIdleTimer=setTimeout(showSessionExpiredDialog,SESSION_IDLE_MS); }
['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,()=>{ if(teacherToken) scheduleSessionExpiry(); },{passive:true}));
function showSessionExpiredDialog(){
  if(!teacherToken) return;
  teacherToken=null; teacherInfo=null; clearTeacherSession(); stopSessionTimer();
  document.getElementById('setWizardScreen').classList.add('hidden'); adminScreen.classList.add('hidden');
  const dialog=document.getElementById('sessionExpiredDialog'); if(!dialog.open) dialog.showModal();
}
document.getElementById('sessionReloginBtn').addEventListener('click',()=>{ document.getElementById('sessionExpiredDialog').close(); adminLoginScreen.classList.remove('hidden'); document.getElementById('teacherUsernameInput').focus(); });
async function tryAdminLogin(){
  const username = document.getElementById('teacherUsernameInput').value.trim();
  const password = document.getElementById('teacherPasswordInput').value;
  const errBox = document.getElementById('adminLoginError');
  if(!username || !password){ errBox.textContent='กรุณากรอก username และ password'; errBox.style.display='block'; return; }
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try{
    const result = await apiTeacherLogin(username, password);
    teacherToken = result.token;
    scheduleSessionExpiry();
    teacherInfo = result;
    saveTeacherSession();
    errBox.style.display='none';
    document.getElementById('teacherNameLabel').textContent = result.firstName + ' ' + result.lastName;
    adminLoginScreen.classList.add('hidden'); adminScreen.classList.remove('hidden');
    initAdmin();
  }catch(e){
    errBox.textContent = e.message; errBox.style.display='block';
  }
  btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ →';
}
document.getElementById('teacherLoginForm').addEventListener('submit', (e)=>{ e.preventDefault(); tryAdminLogin(); });
document.getElementById('pageRefreshBtn').addEventListener('click', refreshCurrentPageData);
const changePasswordDialog = document.getElementById('changePasswordDialog');
document.getElementById('changePasswordBtn').addEventListener('click', ()=>{
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordError').textContent='';
  changePasswordDialog.showModal();
  document.getElementById('currentPasswordInput').focus();
});
document.getElementById('cancelChangePasswordBtn').addEventListener('click', ()=>changePasswordDialog.close());
document.getElementById('changePasswordForm').addEventListener('submit', async (event)=>{
  event.preventDefault();
  const currentPassword=document.getElementById('currentPasswordInput').value;
  const newPassword=document.getElementById('newPasswordInput').value;
  const confirmPassword=document.getElementById('confirmPasswordInput').value;
  const error=document.getElementById('changePasswordError');
  const saveBtn=document.getElementById('savePasswordBtn');
  error.textContent='';
  if(newPassword.length<8){ error.textContent='รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'; return; }
  if(newPassword!==confirmPassword){ error.textContent='ยืนยันรหัสผ่านใหม่ไม่ตรงกัน'; return; }
  saveBtn.disabled=true; saveBtn.textContent='กำลังบันทึก...';
  try{
    const result=await apiChangeTeacherPassword(currentPassword, newPassword);
    teacherToken=result.token;
    saveTeacherSession();
    changePasswordDialog.close();
    showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  }catch(e){ error.textContent=e.message; }
  saveBtn.disabled=false; saveBtn.textContent='บันทึกรหัสผ่าน';
});
document.getElementById('adminExitBtn').addEventListener('click', ()=>{
  teacherToken = null; teacherInfo = null; clearTeacherSession(); stopSessionTimer();
  adminScreen.classList.add('hidden'); adminLoginScreen.classList.remove('hidden');
  document.getElementById('teacherUsernameInput').value=''; document.getElementById('teacherPasswordInput').value='';
  document.getElementById('adminLoginError').style.display='none';
});

async function restoreTeacherSession(){
  if(!teacherToken||!teacherInfo) return;
  document.getElementById('teacherNameLabel').textContent = `${teacherInfo.firstName||''} ${teacherInfo.lastName||''}`.trim();
  try{
    await apiGetAdminSets();
    scheduleSessionExpiry();
    adminLoginScreen.classList.add('hidden'); adminScreen.classList.remove('hidden');
    document.documentElement.classList.remove('restoring-session');
    initAdmin();
  }catch(error){
    teacherToken=null; teacherInfo=null; clearTeacherSession();
    document.documentElement.classList.remove('restoring-session');
  }
}
restoreTeacherSession();

function refreshCurrentPageData(){
  const activeTab = document.querySelector('.admin-tab-btn.active')?.dataset.atab;
  if(activeTab==='results') return refreshResults();
  if(activeTab==='roster') return initRosterTab();
  return initAdmin();
}

/* ============ TABS ============ */
document.querySelectorAll('.admin-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.admin-tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ['sets','library','results','roster','settings'].forEach(t=> document.getElementById('atab-'+t).classList.toggle('hidden', btn.dataset.atab!==t));
    if(btn.dataset.atab==='results') refreshResults();
    if(btn.dataset.atab==='library') renderLibrarySetList();
    if(btn.dataset.atab==='roster') initRosterTab();
  });
});

async function initAdmin(){
  document.getElementById('setListWrap').innerHTML = '<div class="loading-note">กำลังโหลด...</div>';
  try{ EXAM_TYPES = await apiGetExamTypes(); }catch(e){}
  const etSel = document.getElementById('examTypeFilterSelect');
  etSel.innerHTML = '<option value="">ทุกประเภทข้อสอบ</option>' + EXAM_TYPES.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  ADMIN_SETS = await apiGetAdminSets().catch(e=>{ showToast(e.message); return []; });
  renderSetList();
  populateSetFilterOptions();
  populateRosterSetOptions();
}
/* ======================================================================
   EXAM SETS
   ====================================================================== */
let ADMIN_SETS = [];
let setSearchQuery = '';
let editingSet = null;
let editingIsNew = false;
let knownClasses = [];
let knownStudents = [];
let classPeriods = {};

function renderSetList(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const wrap = document.getElementById('setListWrap');
  const activeSets = ADMIN_SETS.filter(set=>!set.archived && !set.deletedAt);
  if(!activeSets.length){
    wrap.innerHTML = `<div class="empty-note">${tr('ยังไม่มีชุดข้อสอบ กด "เพิ่มชุดข้อสอบใหม่" เพื่อเริ่มสร้างชุดแรก')}</div>`;
    return;
  }
  const query=setSearchQuery.trim().toLowerCase();
  const visibleSets=(query?activeSets.filter(set=>[
    set.courseName,set.title,set.tagline,set.desc,set.examType,set.subjectTeacherName
  ].some(value=>String(value||'').toLowerCase().includes(query))):activeSets).slice().sort((a,b)=>examOpenTimestamp(a)-examOpenTimestamp(b)||String(a.title||'').localeCompare(String(b.title||''),'th'));
  if(!visibleSets.length){
    wrap.innerHTML=`<div class="empty-note">${tr('ไม่พบชุดข้อสอบที่ตรงกับ')} "${escapeHtml(setSearchQuery)}"</div>`;
    return;
  }
  const groups = {};
  visibleSets.forEach(s=>{
    const key = s.courseName || s.title;
    if(!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  wrap.innerHTML = Object.entries(groups).map(([course, sets])=>{
    const cardsHtml = sets.map(s=>{
      const classesText = (s.assignedClasses && s.assignedClasses.length) ? s.assignedClasses.join(', ') : tr('ทุกห้อง (ยังไม่จำกัดสิทธิ์)');
      const total = computeSetTotal(s);
      const examOpenDate=examOpenDateLabel(s);
      const examStatus=examScheduleStatus(s);
      const originalEnds=(s.examSchedules||[]).filter(item=>!item.absenceOnly).map(item=>normalizedExamTimestamp(item.availableUntil)).filter(Number.isFinite),finalEnd=originalEnds.length?Math.max(...originalEnds):NaN,examFinished=Number.isFinite(finalEnd)&&finalEnd<Date.now(),examNextDay=Number.isFinite(finalEnd)?new Date(finalEnd):null; if(examNextDay)examNextDay.setHours(24,0,0,0); const actionsExpired=!!examNextDay&&Date.now()>=examNextDay.getTime();
      return `<div class="set-card exam-status-${examStatus.key}">
        <div class="set-badge-row"><span class="badge-pill">${escapeHtml(s.examType||'-')}</span>${examOpenDate?`<span class="badge-pill exam-date-pill" title="${tr('วันที่เปิดข้อสอบ')}">${tr('วันที่สอบ')} ${escapeHtml(examOpenDate)}</span>`:''}<span class="badge-pill exam-status-pill status-${examStatus.key}">${escapeHtml(tr(examStatus.label))}</span><span class="badge-pill academic-period-pill">${escapeHtml(s.academicYear&&s.semesterLabel?`${s.academicYear} / ${s.semesterLabel}`:tr('ยังไม่กำหนดเทอม'))}</span></div>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.desc||'')}</p>
        <p style="color:var(--blue);">🏫 ${escapeHtml(classesText)}</p>
        ${s.subjectTeacherName ? `<p>👤 ${tr('อาจารย์')}: ${escapeHtml(s.subjectTeacherName)}</p>` : ''}
        <p style="color:${total===20?'var(--green)':'var(--blue)'};">🎯 ${tr('คะแนนเต็มรวม')}: ${total} ${tr('คะแนน')} · ${total===20?tr('ข้อสอบปกติ'):tr('บล็อกคอร์ส — แบ่งลงกลางภาค/ปลายภาค')}</p>
        <p style="color:var(--sub);font-size:11.5px;">${s.publishMode==='auto'?tr('⚡ ประกาศคะแนนอัตโนมัติ'):tr('🔒 ต้องตรวจก่อนประกาศ')}${s.shuffleQuestions?' · '+tr('🔀 สุ่มโจทย์'):''}${s.shuffleChoices?' · '+tr('🔀 สุ่มตัวเลือก'):''}</p>
        <div class="set-actions set-actions-clear">
          ${!actionsExpired?`<button class="btn ${s.quickOpen?'btn-danger':examFinished?'btn-ghost':'btn-primary'} btn-sm" data-quick-open="${s.key}" data-open="${s.quickOpen?'0':'1'}">${s.quickOpen?tr('ยกเลิกการเปิดทันที'):tr('เปิดข้อสอบทันที')}</button><button class="btn btn-ghost btn-sm" data-edit="${s.key}">${tr('แก้ไขข้อสอบ')}</button>`:''}
          ${examFinished?`<button class="btn btn-primary btn-sm" data-open-absentees="${s.key}">${tr('เปิดสอบเฉพาะผู้ขาดสอบ')}</button>`:''}
          <button class="btn btn-ghost btn-sm" data-exam-pdf="${s.key}">${tr('ดาวน์โหลดข้อสอบ PDF')}</button>
          <button class="btn btn-ghost btn-sm" data-archive="${s.key}">${tr('เก็บข้อสอบเข้าคลัง')}</button>
          ${!actionsExpired?`<button class="btn btn-danger btn-sm set-delete-action" data-del="${s.key}">${tr('ย้ายไปถังขยะ')}</button>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div class="course-group">
      <div class="course-group-head" data-togglegroup="1">
        <span class="course-group-title">📚 ${escapeHtml(course)}</span>
        <span class="course-group-count">${sets.length} ${tr('ชุดข้อสอบ')}</span>
      </div>
      <div class="set-list course-group-body collapsed">${cardsHtml}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-quick-open]').forEach(b=>b.addEventListener('click', ()=>toggleQuickOpen(b.dataset.quickOpen,b.dataset.open==='1',b)));
  wrap.querySelectorAll('[data-open-absentees]').forEach(b=>b.addEventListener('click', ()=>openForAbsentees(b.dataset.openAbsentees,b)));
  wrap.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openEditor(b.dataset.edit)));
  wrap.querySelectorAll('[data-exam-pdf]').forEach(b=>b.addEventListener('click', ()=>downloadExamPdf(b.dataset.examPdf,b)));
  wrap.querySelectorAll('[data-archive]').forEach(b=>b.addEventListener('click', ()=>archiveSet(b.dataset.archive)));
  wrap.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>deleteSet(b.dataset.del)));
  wrap.querySelectorAll('[data-togglegroup]').forEach(head=>head.addEventListener('click', ()=>{
    head.nextElementSibling.classList.toggle('collapsed');
  }));
}
async function openForAbsentees(key,button){const tr=window.I18N?window.I18N.t:(s=>s);const value=prompt(tr('เปิดข้อสอบให้ผู้ขาดสอบกี่ชั่วโมง? (1-72)'),'24');if(value===null)return;const hours=Number(value);if(!Number.isFinite(hours)||hours<1||hours>72){showToast('กรุณาระบุ 1-72 ชั่วโมง');return;}button.disabled=true;try{const result=await apiOpenAbsentees(key,hours);ADMIN_SETS=await apiGetAdminSets();renderSetList();showToast(result.count?tr('เปิดข้อสอบให้ผู้ขาดสอบ')+` ${result.count} `+tr('คนแล้ว'):'ไม่พบผู้ขาดสอบที่ต้องเปิดสิทธิ์');}catch(error){button.disabled=false;showToast(error.message);}}
async function toggleQuickOpen(key,open,button){
  const tr=window.I18N?window.I18N.t:(s=>s);
  if(!open && !confirm(tr('ยกเลิกการเปิดข้อสอบด่วน และกลับไปใช้ตารางสอบเดิม?'))) return;
  button.disabled=true;
  try{
    await apiQuickOpenSet(key,open);
    const set=ADMIN_SETS.find(item=>item.key===key);
    if(set){ set.quickOpen=open; set.quickOpenedAt=open?new Date().toISOString():null; }
    renderSetList();
    showToast(open?'เปิดข้อสอบให้นักเรียนในห้องที่กำหนดแล้ว':'ยกเลิกเปิดด่วน และกลับไปใช้ตารางสอบเดิมแล้ว');
  }catch(error){ button.disabled=false; showToast(error.message); }
}
function normalizedExamTimestamp(value){const date=new Date(value);if(Number.isNaN(date.getTime()))return NaN;if(date.getUTCFullYear()>=2400)date.setUTCFullYear(date.getUTCFullYear()-543);return date.getTime();}
function examOpenDateLabel(set){
  const values=(set.examSchedules||[]).map(schedule=>schedule?.availableFrom).filter(Boolean);
  if(set.availableFrom)values.push(set.availableFrom);
  const timestamps=values.map(normalizedExamTimestamp).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!timestamps.length)return '';
  return new Date(timestamps[0]).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function examOpenTimestamp(set){
  const values=(set.examSchedules||[]).map(schedule=>schedule?.availableFrom).filter(Boolean);
  if(set.availableFrom)values.push(set.availableFrom);
  const timestamps=values.map(normalizedExamTimestamp).filter(Number.isFinite);
  return timestamps.length?Math.min(...timestamps):Number.MAX_SAFE_INTEGER;
}
function examScheduleStatus(set,now=Date.now()){
  if(set.quickOpen)return {key:'live',label:'เปิดด่วนอยู่',icon:'⚡'};
  const schedules=(set.examSchedules||[]).length?set.examSchedules:[{availableFrom:set.availableFrom,availableUntil:set.availableUntil}];
  const ranges=schedules.map(schedule=>({start:normalizedExamTimestamp(schedule?.availableFrom),end:normalizedExamTimestamp(schedule?.availableUntil)})).filter(range=>Number.isFinite(range.start)||Number.isFinite(range.end));
  if(!ranges.length)return {key:'unscheduled',label:'ยังไม่กำหนดเวลา',icon:'⚠'};
  if(ranges.some(range=>(!Number.isFinite(range.start)||range.start<=now)&&(!Number.isFinite(range.end)||range.end>=now)))return {key:'live',label:'กำลังสอบ',icon:'●'};
  const starts=ranges.map(range=>range.start).filter(Number.isFinite),ends=ranges.map(range=>range.end).filter(Number.isFinite);
  if(starts.length&&starts.every(start=>start>now))return {key:'upcoming',label:'ยังไม่สอบ',icon:'●'};
  if(ends.length&&ends.every(end=>end<now))return {key:'finished',label:'สอบแล้ว',icon:'✓'};
  return {key:'upcoming',label:'รอรอบถัดไป',icon:'●'};
}
function renderLibrarySetList(){
  const wrap=document.getElementById('librarySetListWrap');
  const archived=ADMIN_SETS.filter(set=>set.archived && !set.deletedAt).sort((a,b)=>Date.parse(b.archivedAt||0)-Date.parse(a.archivedAt||0));
  const trashed=ADMIN_SETS.filter(set=>set.deletedAt);
  if(!archived.length && !trashed.length){ wrap.innerHTML='<div class="empty-note">ยังไม่มีข้อสอบในคลังหรือถังขยะ</div>'; return; }
  const archiveHtml=archived.length?`<div class="library-list"><div class="library-list-head"><span>ชุดข้อสอบ</span><span>ห้อง / รอบสอบ</span><span>ประเภท / ภาคเรียน</span><span>วันที่เก็บ</span><span>การจัดการ</span></div>${archived.map(s=>{const regular=(s.examSchedules||[]).filter(item=>!item.absenceOnly),rooms=[...new Set((regular.length?regular.flatMap(item=>item.classes||[]):s.assignedClasses||[]).filter(room=>room&&room!=='__ABSENCE_ONLY__'))],rounds=[...new Set(regular.map(item=>item.name).filter(Boolean))];return `<article class="library-row"><div class="library-title"><span class="library-icon">📚</span><div><h3>${escapeHtml(s.title)}</h3>${s.courseName&&s.courseName!==s.title?`<p>${escapeHtml(s.courseName)}</p>`:''}</div></div><div class="library-scope" title="${escapeHtml(`ห้อง: ${rooms.join(', ')||'-'} | รอบ: ${rounds.join(', ')||'-'}`)}"><p><b>ห้อง</b> ${escapeHtml(rooms.join(', ')||'-')}</p><p><b>รอบ</b> ${escapeHtml(rounds.join(', ')||'-')}</p></div><div class="library-meta"><span class="badge-pill">${escapeHtml(s.examType||'-')}</span><span class="library-term">${escapeHtml(s.academicYear&&s.semesterLabel?`${s.academicYear} / ${s.semesterLabel}`:'ไม่ระบุภาคเรียน')}</span></div><div class="library-date"><small>เก็บเข้าคลัง</small><strong>${s.archivedAt?new Date(s.archivedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}):'-'}</strong>${s.autoArchivedAt?'<em>อัตโนมัติ</em>':''}</div><div class="library-actions"><button class="btn btn-primary btn-sm" data-library-dup="${s.key}">＋ ทำสำเนา</button><button class="btn btn-ghost btn-sm" data-restore="${s.key}">↩ นำกลับ</button></div></article>`;}).join('')}</div>`:'<div class="empty-note">ยังไม่มีข้อสอบในคลัง</div>';
  const trashHtml=trashed.length?`<div style="margin-top:28px;"><h3>ถังขยะชุดข้อสอบ</h3><p class="panel-sub">ลบชุดข้อสอบถาวรได้ โดยผลสอบที่ส่งแล้วจะยังคงอยู่</p><div class="set-list">${trashed.map(s=>`<div class="set-card"><span class="badge-pill" style="background:#fee2e2;color:#b91c1c;">ถังขยะ</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.courseName||'')}</p><p style="color:var(--sub);">ลบเมื่อ ${new Date(s.deletedAt).toLocaleString('th-TH')}</p><div class="set-actions"><button class="btn btn-primary btn-sm" data-restore="${s.key}">กู้คืนชุดข้อสอบ</button><button class="btn btn-danger btn-sm" data-permanent-delete="${s.key}">ลบถาวร</button></div></div>`).join('')}</div></div>`:'';
  wrap.innerHTML=archiveHtml+trashHtml;
  wrap.querySelectorAll('[data-library-dup]').forEach(b=>b.addEventListener('click',()=>duplicateSet(b.dataset.libraryDup)));
  wrap.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>restoreSet(b.dataset.restore)));
  wrap.querySelectorAll('[data-permanent-delete]').forEach(b=>b.addEventListener('click',()=>permanentlyDeleteSet(b.dataset.permanentDelete)));
}
async function permanentlyDeleteSet(key){const set=ADMIN_SETS.find(item=>item.key===key);if(!confirm(`ลบชุดข้อสอบ “${set?.title||''}” ถาวรหรือไม่?\n\nผลสอบที่ส่งแล้วจะยังคงอยู่และดูย้อนหลังได้`))return;try{await apiPermanentlyDeleteSet(key);ADMIN_SETS=await apiGetAdminSets();renderSetList();renderLibrarySetList();populateSetFilterOptions();showToast('ลบชุดข้อสอบแล้ว ผลสอบเดิมยังคงอยู่');}catch(error){showToast(error.message);}}
function computeSetTotal(s){
  let t = 0;
  t += (s.sections.mc.questions||[]).reduce((a,q)=>a+(Number(q.points)||0),0);
  t += (s.sections.matching.left||[]).length * (Number(s.sections.matching.pointsEach)||0);
  t += (s.sections.written.questions||[]).reduce((a,q)=>a+(Number(q.maxPoints)||0),0);
  return Math.round(t*100)/100;
}
function scoreModeSummary(total){
  return total===20 ? '✓ ข้อสอบปกติ' : '✓ บล็อกคอร์ส — ระบบจะแปลงเป็นน้ำหนัก 40 และแบ่งกลางภาค/ปลายภาค';
}
async function duplicateSet(key){
  try{ const copy=await apiDuplicateSetCall(key); ADMIN_SETS = await apiGetAdminSets(); renderSetList(); renderLibrarySetList(); populateSetFilterOptions(); showToast('ทำสำเนาชุดข้อสอบแล้ว กรุณาตั้งห้องและวันสอบใหม่'); openEditor(copy.key); }
  catch(e){ showToast(e.message); }
}
async function archiveSet(key){
  if(!confirm('ย้ายชุดข้อสอบนี้ไปคลังข้อสอบเก่า?')) return;
  try{ await apiArchiveSetCall(key); ADMIN_SETS=await apiGetAdminSets(); renderSetList(); renderLibrarySetList(); populateSetFilterOptions(); showToast('ย้ายชุดข้อสอบเข้าคลังแล้ว'); }catch(e){showToast(e.message);}
}
async function restoreSet(key){
  try{ await apiRestoreSetCall(key); ADMIN_SETS=await apiGetAdminSets(); renderSetList(); renderLibrarySetList(); populateSetFilterOptions(); showToast('นำชุดข้อสอบกลับรายการหลักแล้ว'); }catch(e){showToast(e.message);}
}
async function deleteSet(key){
  if(!confirm('ย้ายชุดข้อสอบนี้ไปถังขยะ? กู้คืนได้ภายหลัง')) return;
  try{ await apiDeleteSetCall(key); ADMIN_SETS = await apiGetAdminSets(); renderSetList(); populateSetFilterOptions(); showToast('ย้ายชุดข้อสอบไปถังขยะแล้ว'); }
  catch(e){ showToast(e.message); }
}
document.getElementById('newSetBtn').addEventListener('click', ()=> openEditor(null));
function dfdSetDraft(){ return { ...blankSet(), key:'object_analysis_design_dfd', title:'การวิเคราะห์และออกแบบเชิงวัตถุ: Data Flow Diagram', courseName:'การวิเคราะห์และออกแบบเชิงวัตถุ', tagline:'DFD Drawing Examination', desc:'ข้อสอบวาด Data Flow Diagram (Level 0, 1 และ 2)', delivery:'object-analysis-design', examType:'ปลายภาค', shuffleQuestions:false, shuffleChoices:false }; }
const examImportChoiceDialog=document.getElementById('examImportChoiceDialog');
document.getElementById('openExamImportDialogBtn').addEventListener('click',()=>examImportChoiceDialog.showModal());
document.getElementById('closeExamImportChoiceDialog').addEventListener('click',()=>examImportChoiceDialog.close());
document.getElementById('chooseGoogleFormsImportBtn').addEventListener('click',()=>{examImportChoiceDialog.close();openGoogleFormsSetDialog();});
document.getElementById('setSearchInput').addEventListener('input',event=>{ setSearchQuery=event.target.value; renderSetList(); });

function round2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function distributeEvenly(total, count){
  total = Number(total)||0;
  if(count<=0) return [];
  const per = Math.floor((total/count)*100)/100;
  const arr = new Array(count).fill(per);
  const diff = round2(total - round2(per*count));
  arr[count-1] = round2(arr[count-1] + diff);
  return arr;
}
function applyPointDistribution(sec){
  const s = editingSet.sections[sec];
  const total = Number(s.sectionPointsTotal)||0;
  if(sec==='mc'){
    const arr = distributeEvenly(total, s.questions.length);
    s.questions.forEach((q,i)=>{ q.points = arr[i]!==undefined?arr[i]:0; });
  } else if(sec==='matching'){
    s.pointsEach = s.left.length>0 ? round2(total/s.left.length) : 0;
  } else if(sec==='written'){
    const arr = distributeEvenly(total, s.questions.length);
    s.questions.forEach((q,i)=>{ q.maxPoints = arr[i]!==undefined?arr[i]:0; });
  }
}
function truncateText(t,n){ t=t||''; return t.length>n ? t.slice(0,n)+'…' : t; }
function toDatetimeLocalValue(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseManualDateTime(value){
  const text=String(value||'').trim(); if(!text) return '';
  if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(text)){ showToast('กรุณากรอกวันเวลา เช่น 2026-07-20 09:00'); return ''; }
  const date=new Date(text.replace(' ','T')); if(Number.isNaN(date.getTime())){ showToast('วันเวลาที่กรอกไม่ถูกต้อง'); return ''; }
  return date.toISOString();
}
function normalizedExamDate(value){
  const date=new Date(value);
  if(!Number.isNaN(date.getTime())&&date.getFullYear()>=2400) date.setFullYear(date.getFullYear()-543);
  return date;
}
function formatExamDate(iso){ if(!iso) return ''; const d=normalizedExamDate(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`; }
function formatExamTime(iso){ if(!iso) return ''; const d=new Date(iso); return `${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}`; }
function parseExamDateTime(dateValue,timeValue){ const date=String(dateValue||'').trim(),time=String(timeValue||'').trim(); if(!date&&!time) return ''; const d=date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),t=time.match(/^(\d{2})[.:](\d{2})$/); if(!d||!t){showToast('กรุณากรอกวัน dd/mm/yyyy และเวลา HH.MM');return '';} const inputYear=Number(d[3]),year=inputYear>=2400?inputYear-543:inputYear; const value=new Date(year,Number(d[2])-1,Number(d[1]),Number(t[1]),Number(t[2])); const valid=value.getFullYear()===year&&value.getMonth()===Number(d[2])-1&&value.getDate()===Number(d[1])&&value.getHours()===Number(t[1])&&value.getMinutes()===Number(t[2]); return valid?value.toISOString():''; }

function blankSet(){
  return {
    key: uid('set'), title:'', courseName:'', educationLevel:'', tagline:'', desc:'', examType: EXAM_TYPES[0]||'กลางภาค', teacherId:null, assignedClasses:[], examSchedules:[], subjectTeacherName:'', subjectTeacherEmail:'',
    shuffleQuestions:true, shuffleChoices:true, publishMode:'manual', availableUntil:'', lateAccessCode:'',
    sections:{
      mc:{ title:'ส่วนที่ 1 — ปรนัย (เลือกตอบ)', desc:'เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียวในแต่ละข้อ', questions:[], sectionPointsTotal:20 },
      matching:{ title:'ส่วนที่ 2 — จับคู่', desc:'จับคู่รายการซ้าย-ขวาให้สัมพันธ์กัน', left:[], right:[], correctMap:{}, pointsEach:0, sectionPointsTotal:0 },
      written:{ title:'ส่วนที่ 3 — อัตนัย (เขียนตอบ)', desc:'ตอบคำถามด้วยคำพูดของตนเอง', questions:[], sectionPointsTotal:0 }
    }
  };
}
let editingUiEnabled = {mc:false, matching:false, written:false};
let openQEditor = null; // {section:'mc'|'matching'|'written', index:number|null} — null index = adding new
let activeExamScheduleIndex = 0;
let wizardStep = 'info'; // 'info'|'access'|'sections'|'hub'|'section:mc'|'section:matching'|'section:written'
const WIZARD_STEP_ORDER = ['info','access','sections','hub'];
const WIZARD_STEP_LABELS = {info:'1. ข้อมูล', access:'2. สิทธิ์ & อาจารย์', sections:'3. เลือกส่วน', hub:'4. รายการส่วนข้อสอบ'};

function openEditor(key, draftSet=null){
  editingIsNew = !key;
  editingSet = key ? JSON.parse(JSON.stringify(ADMIN_SETS.find(s=>s.key===key))) : (draftSet ? JSON.parse(JSON.stringify(draftSet)) : blankSet());
  if(teacherInfo){
    editingSet.teacherId = teacherInfo.teacherId;
    editingSet.subjectTeacherName = `${teacherInfo.firstName} ${teacherInfo.lastName}`.trim();
    editingSet.subjectTeacherEmail = '';
  }
  if(!editingSet.assignedClasses) editingSet.assignedClasses = [];
  if(!Array.isArray(editingSet.examSchedules)) editingSet.examSchedules = [];
  if(!editingSet.examSchedules.length && (editingSet.availableFrom || editingSet.availableUntil || editingSet.assignedClasses.length)) editingSet.examSchedules=[{name:'รอบเช้า',classes:[...(editingSet.assignedClasses||[])],availableFrom:editingSet.availableFrom||'',availableUntil:editingSet.availableUntil||'',lateAccessCode:editingSet.lateAccessCode||''}];
  if(!editingSet.examType) editingSet.examType = EXAM_TYPES[0]||'กลางภาค';
  if(editingSet.courseName===undefined || editingSet.courseName==='') editingSet.courseName = editingSet.title || '';
  if(!['ปวช.','ปวส.'].includes(editingSet.educationLevel)) editingSet.educationLevel = '';
  if(editingSet.teacherId===undefined) editingSet.teacherId = null;
  if(editingSet.shuffleQuestions===undefined) editingSet.shuffleQuestions = false;
  if(editingSet.shuffleChoices===undefined) editingSet.shuffleChoices = false;
  if(!editingSet.publishMode) editingSet.publishMode = 'manual';
  if(editingSet.availableUntil===undefined) editingSet.availableUntil = '';
  if(editingSet.lateAccessCode===undefined) editingSet.lateAccessCode = '';
  if(editingSet.sections.mc.sectionPointsTotal===undefined) editingSet.sections.mc.sectionPointsTotal = round2(editingSet.sections.mc.questions.reduce((a,q)=>a+(Number(q.points)||0),0));
  if(editingSet.sections.matching.sectionPointsTotal===undefined) editingSet.sections.matching.sectionPointsTotal = round2((Number(editingSet.sections.matching.pointsEach)||0) * editingSet.sections.matching.left.length);
  if(editingSet.sections.written.sectionPointsTotal===undefined) editingSet.sections.written.sectionPointsTotal = round2(editingSet.sections.written.questions.reduce((a,q)=>a+(Number(q.maxPoints)||0),0));
  editingUiEnabled = { mc: editingSet.sections.mc.questions.length>0, matching: editingSet.sections.matching.left.length>0, written: editingSet.sections.written.questions.length>0 };
  openQEditor = null;
  wizardStep = 'info';
  adminScreen.classList.add('hidden');
  document.getElementById('setWizardScreen').classList.remove('hidden');
  { const tr9 = window.I18N ? window.I18N.t : (s=>s); document.getElementById('wizardTitleBar').textContent = editingIsNew ? tr9('🧩 สร้างชุดข้อสอบใหม่') : (tr9('🧩 แก้ไขชุดข้อสอบ')+': ' + (editingSet.title||'')); }
  renderWizard();
  // Let the browser paint the editor before requesting values used by later steps.
  const targetSet = editingSet;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ loadEditorReferenceData(targetSet); }));
}
async function loadEditorReferenceData(targetSet){
  const periods=['เช้า','บ่าย','ทวิภาคี'];
  const [classes,students,groups]=await Promise.all([
    apiGetClasses().catch(()=>[]),
    apiGetStudents().catch(()=>[]),
    Promise.all(periods.map(async period=>[period,await apiGetClasses(period)])).catch(()=>[])
  ]);
  if(editingSet!==targetSet) return;
  knownClasses=classes;
  knownStudents=students;
  classPeriods=Object.fromEntries(groups.flatMap(([period,rooms])=>rooms.map(room=>[room,period])));
}
function closeEditor(){
  editingSet = null;
  openQEditor = null;
  document.getElementById('setWizardScreen').classList.add('hidden');
  adminScreen.classList.remove('hidden');
}
document.getElementById('wizardExitBtn').addEventListener('click', ()=>{
  if(confirm('ออกจากการแก้ไขโดยไม่บันทึก? การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป')) closeEditor();
});
document.getElementById('wizSaveBtn').addEventListener('click', saveEditingSet);

function renderWizard(){
  renderWizardStepsBar();
  const body = document.getElementById('wizardBody');
  if(wizardStep==='info') body.innerHTML = wizardInfoStepHtml();
  else if(wizardStep==='access') body.innerHTML = wizardAccessStepHtml();
  else if(wizardStep==='sections') body.innerHTML = wizardSectionsStepHtml();
  else if(wizardStep==='hub') body.innerHTML = wizardHubStepHtml();
  else if(wizardStep.startsWith('section:')) body.innerHTML = wizardSectionDetailHtml(wizardStep.split(':')[1]);
  bindWizardStepEvents();
  document.getElementById('setWizardScreen').scrollTop = 0;
}
function renderWizardStepsBar(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const bar = document.getElementById('wizardStepsBar');
  const stepOrder = editingSet?.delivery==='object-analysis-design' ? ['info','access'] : WIZARD_STEP_ORDER;
  const currentTop = wizardStep.startsWith('section:') ? 'hub' : wizardStep;
  const curIdx = stepOrder.indexOf(currentTop);
  bar.innerHTML = stepOrder.map((key,idx)=>{
    const cls = key===currentTop ? 'active' : (idx<curIdx ? 'done' : '');
    return `<span class="wizard-step-chip ${cls}">${tr(WIZARD_STEP_LABELS[key])}</span>`;
  }).join('<span class="wizard-step-arrow">→</span>');
}

/* ---------- Step 1: basic info ---------- */
function wizardInfoStepHtml(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet;
  return `<div class="panel">
    <h3>${tr('ข้อมูลชุดข้อสอบ')}</h3>
    <div class="field-row">
      <div class="field"><label>${tr('ชื่อวิชา (ใช้จัดกลุ่มข้อสอบกลางภาค/ปลายภาคเข้าด้วยกัน)')}</label><input type="text" id="fCourseName" value="${escapeAttr(s.courseName||'')}" placeholder="เช่น คณิตศาสตร์ ม.3"></div>
      <div class="field"><label>${tr('ประเภทข้อสอบ')}</label><select id="fExamType">${EXAM_TYPES.map(t=>`<option value="${escapeAttr(t)}" ${s.examType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${tr('ชื่อชุดข้อสอบ (แสดงให้นักเรียนเห็น)')}</label><input type="text" id="fTitle" value="${escapeAttr(s.title)}" placeholder="เช่น คณิตศาสตร์ ม.3 - กลางภาค"></div>
      <div class="field"><label>${tr('ระดับ')} <span style="color:#DC2626;">*</span></label><select id="fEducationLevel" required><option value="" ${s.educationLevel?'':'selected'} disabled>${tr('เลือกระดับ')}</option><option value="ปวช." ${s.educationLevel==='ปวช.'?'selected':''}>ปวช.</option><option value="ปวส." ${s.educationLevel==='ปวส.'?'selected':''}>ปวส.</option></select></div>
    </div>
    <div class="field"><label>${tr('คำอธิบายชุดข้อสอบ')}</label><textarea id="fDesc" placeholder="${tr('อธิบายเนื้อหาโดยย่อ')}">${escapeHtml(s.desc)}</textarea></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizCancelBtn" type="button">${tr('ยกเลิก')}</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">${tr('ถัดไป →')}</button>
  </div>`;
}

/* ---------- Step 2: classes + teacher ---------- */
function wizardAccessStepHtml(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet;
  return `<div class="panel">
    <h3>${tr('🏫 ห้องที่มีสิทธิสอบวิชานี้')}</h3>
    <p class="panel-sub">${tr('ถ้าไม่เพิ่มห้องใดเลย ระบบจะเปิดให้ทุกห้องสอบวิชานี้ได้ (ค่าเริ่มต้น)')}</p>
    <div class="chip-row" id="classChipRow"></div><div id="examSchedulesWrap"></div>
    <div class="add-chip-row">
      <select id="schedulePeriodFilter" class="filter-select" aria-label="${tr('กรองรอบเรียน')}"><option value="">${tr('ทุกรอบเรียน')}</option><option value="เช้า">${tr('รอบเช้า')}</option><option value="บ่าย">${tr('รอบบ่าย')}</option><option value="ทวิภาคี">${tr('รอบทวิภาคี')}</option></select>
      <select id="classGroupSelect" class="filter-select" aria-label="${tr('เลือกห้องจากกลุ่ม')}">
        ${buildGroupedClassOptions(knownClasses)}
      </select>
      <input type="text" id="addClassInput" list="knownClassesList" placeholder="${tr('พิมพ์ชื่อห้อง เช่น ม.3/1 แล้วกดเพิ่ม')}">
      <datalist id="knownClassesList">${knownClasses.map(c=>`<option value="${escapeAttr(c)}">`).join('')}</datalist>
      <button class="btn btn-ghost btn-sm" id="addClassBtn" type="button">${tr('+ เพิ่มห้อง')}</button>
    </div>
  </div>
  <div class="panel">
    <h3>${tr('👤 ข้อมูลอาจารย์ประจำวิชา')}</h3>
    <p class="panel-sub">${tr('ระบบดึงจากบัญชีอาจารย์ที่กำลังเข้าสู่ระบบ และจะบันทึกข้อมูลนี้ลงในรายงานโดยอัตโนมัติ')}</p>
    <div class="mini-card"><b>👤 ${escapeHtml(s.subjectTeacherName || `${teacherInfo?.firstName||''} ${teacherInfo?.lastName||''}`.trim())}</b><br><span style="font-size:12px;color:var(--sub);">${tr('ข้อมูลผู้สอนจากบัญชีที่ล็อกอิน')}</span></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">${tr('← ย้อนกลับ')}</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">${s.delivery==='object-analysis-design'?tr('💾 บันทึกข้อสอบ DFD'):tr('ถัดไป →')}</button>
  </div>`;
}

function classGroupForName(className){
  const name=String(className||'').trim();
  // รองรับ CIT.1/5, ม.3/1, ปวช.2/1, สธ.151, ปวส.2xx เป็นต้น
  if(/ปวส\.?\s*1/i.test(name)) return 'ปวส.1';
  if(/ปวส\.?\s*2/i.test(name)) return 'ปวส.2';
  if(/\.\s*1101(?:\s|\(|$)/i.test(name)) return 'ปวส.1';
  if(/\.\s*2101(?:\s|\(|$)/i.test(name)) return 'ปวส.2';
  if(/ปวช\.?\s*1/i.test(name)) return 'ปวช.1';
  if(/ปวช\.?\s*2/i.test(name)) return 'ปวช.2';
  if(/ปวช\.?\s*3/i.test(name)) return 'ปวช.3';
  if(/\[[MC]\]\s*1\d{2}\b/i.test(name)) return 'ปวส.1';
  if(/\[[MC]\]\s*2\d{2}\b/i.test(name)) return 'ปวส.2';
  if(/\.\s*1\/\d+/i.test(name)) return 'ปวช.1';
  if(/\.\s*2\/\d+/i.test(name)) return 'ปวช.2';
  if(/\.\s*3\/\d+/i.test(name)) return 'ปวช.3';
  if(/\.\s*1\d{2}\b/i.test(name)) return 'ปวส.1';
  if(/\.\s*2\d{2}\b/i.test(name)) return 'ปวส.2';
  if(/^ม\.\s*1\//i.test(name)) return 'ปวช.1';
  if(/^ม\.\s*2\//i.test(name)) return 'ปวช.2';
  if(/^ม\.\s*3\//i.test(name)) return 'ปวช.3';
  return 'ห้องอื่น ๆ';
}
function classEducationLevelForName(className){
  const group=classGroupForName(className);
  if(group.startsWith('ปวช.')) return 'ปวช.';
  if(group.startsWith('ปวส.')) return 'ปวส.';
  return '';
}

function compareClassRooms(a,b){
  const left=String(a||''), right=String(b||'');
  const leftNumbers=left.match(/\d+/g)||[], rightNumbers=right.match(/\d+/g)||[];
  const count=Math.max(leftNumbers.length,rightNumbers.length);
  for(let index=0;index<count;index++){
    if(leftNumbers[index]===undefined) return -1;
    if(rightNumbers[index]===undefined) return 1;
    const difference=Number(leftNumbers[index])-Number(rightNumbers[index]);
    if(difference) return difference;
  }
  return left.localeCompare(right,'th');
}
function buildGroupedClassOptions(classes){
  const order=['ปวช.1','ปวช.2','ปวช.3','ปวส.1','ปวส.2','ห้องอื่น ๆ'];
  const groups=new Map(order.map(group=>[group,[]]));
  [...new Set(classes||[])].sort(compareClassRooms).forEach(className=>{
    groups.get(classGroupForName(className)).push(className);
  });
  return `<option value="">${(window.I18N?window.I18N.t:s2=>s2)('เลือกห้องจากกลุ่ม')}</option>`+order.map(group=>{
    const rooms=groups.get(group);
    if(!rooms.length) return '';
    return `<optgroup label="${escapeAttr(group)}">${rooms.map(room=>`<option value="${escapeAttr(room)}">${escapeHtml(room)}</option>`).join('')}</optgroup>`;
  }).join('');
}

/* ---------- Step 3: choose sections ---------- */
function wizardSectionsStepHtml(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  return `<div class="panel">
    <h3>${tr('เลือกส่วนของข้อสอบ')}</h3>
    <p class="panel-sub">${tr('เลือกเฉพาะส่วนที่ต้องการใช้ได้อย่างอิสระ — หากไม่เพิ่มส่วนนั้น นักเรียนจะไม่เห็นส่วนนั้นตอนสอบ')}</p>
    <div class="section-manager-row" id="sectionManagerRow"></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">${tr('← ย้อนกลับ')}</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">${tr('ถัดไป → ไปยังรายการส่วนข้อสอบ')}</button>
  </div>`;
}

/* ---------- Step 4: hub (mirrors the student's exam hub) ---------- */
function wizardHubStepHtml(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet;
  const total = computeSetTotal(s);
  const ok = total>0;
  const labels = {mc:tr('📝 ปรนัย'), matching:tr('🔗 จับคู่'), written:tr('✍️ อัตนัย')};
  const descBy = {mc:tr('เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ'), matching:tr('จับคู่รายการซ้าย-ขวาให้สัมพันธ์กัน'), written:tr('เขียนตอบด้วยคำพูดของตนเอง')};
  const cards = ['mc','matching','written'].filter(sec=>editingUiEnabled[sec]).map(sec=>{
    const count = sec==='mc' ? s.sections.mc.questions.length : sec==='matching' ? s.sections.matching.left.length : s.sections.written.questions.length;
    return `<div class="lv-card">
      <h3>${labels[sec]}</h3>
      <div class="lv-desc">${descBy[sec]}<br><b>${count} ${sec==='matching'?tr('คู่'):tr('ข้อ')}</b></div>
      <button class="btn btn-primary" data-entersec="${sec}" type="button">${count>0?tr('แก้ไขส่วนนี้'):tr('เพิ่มข้อสอบส่วนนี้')}</button>
    </div>`;
  }).join('');
  return `<div class="hub-inner" style="max-width:none;padding:0;">
    <h2>${tr('รายการส่วนข้อสอบ')}</h2>
    <p class="sub">${tr('คลิกเข้าไปเพิ่ม/แก้ไขคำถามในแต่ละส่วน — เหมือนหน้าที่นักเรียนเห็นตอนทำข้อสอบ')}</p>
    <div class="total-indicator ${ok?'ok':'warn'}" style="margin-bottom:16px;">🎯 ${tr('คะแนนเต็มรวมขณะนี้')}: ${total} ${tr('คะแนน')} · ${total>0?scoreModeSummary(total):tr('⚠️ กรุณากำหนดคะแนน')}</div>
    <div class="lv-grid">${cards}</div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">${tr('← ย้อนกลับไปเลือกส่วน')}</button>
  </div>`;
}

/* ---------- Section detail step ---------- */
function wizardSectionDetailHtml(sec){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  let html = `<button class="btn btn-ghost btn-sm" id="wizBackToHubBtn" type="button" style="margin-bottom:16px;">${tr('← กลับไปยังรายการส่วนข้อสอบ')}</button>`;
  if(sec==='mc') html += mcSettingsHeaderHtml();
  html += `<div id="sectionDetailBody"></div>`;
  return html;
}
function mcSettingsHeaderHtml(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet;
  return `<div class="panel">
    <h3>${tr('⚙️ การประกาศผลและการสุ่มข้อสอบ')}</h3>
    <div class="field-row">
      <div class="field">
        <label>${tr('โหมดประกาศผล')}</label>
        <select id="fPublishMode">
          <option value="manual" ${s.publishMode!=='auto'?'selected':''}>${tr('ต้องให้อาจารย์ตรวจสอบก่อนจึงประกาศ (ค่าเริ่มต้น)')}</option>
          <option value="auto" ${s.publishMode==='auto'?'selected':''}>${tr('ประกาศคะแนนให้นักเรียนทันทีที่ส่งคำตอบ')}</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:normal;color:var(--ink);"><input type="checkbox" id="fShuffleQuestions" ${s.shuffleQuestions?'checked':''} style="width:16px;height:16px;"> ${tr('สุ่มลำดับโจทย์ (แต่ละคนเห็นข้อสอบเรียงไม่เหมือนกัน)')}</label>
    </div>
    <div class="field-row">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:normal;color:var(--ink);"><input type="checkbox" id="fShuffleChoices" ${s.shuffleChoices?'checked':''} style="width:16px;height:16px;"> ${tr('สุ่มลำดับตัวเลือกปรนัย (แต่ละคนเห็นตัวเลือกเรียงไม่เหมือนกัน)')}</label>
    </div>
  </div>`;
}

function bindWizardStepEvents(){
  const s = editingSet;
  if(wizardStep==='info'){
    document.getElementById('fCourseName').addEventListener('input', e=>{ s.courseName = e.target.value; });
    document.getElementById('fExamType').addEventListener('change', e=>{ s.examType = e.target.value; });
    document.getElementById('fTitle').addEventListener('input', e=>{ s.title = e.target.value; });
    document.getElementById('fEducationLevel').addEventListener('change', e=>{ s.educationLevel = e.target.value; });
    document.getElementById('fDesc').addEventListener('input', e=>{ s.desc = e.target.value; });
    document.getElementById('wizCancelBtn').addEventListener('click', ()=>{
      if(confirm(window.I18N?window.I18N.t('ยกเลิกการแก้ไข? การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป'):'ยกเลิกการแก้ไข? การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป')) closeEditor();
    });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{
      if(!s.title || !s.title.trim()){ alert(window.I18N?window.I18N.t('กรุณากรอกชื่อชุดข้อสอบ'):'กรุณากรอกชื่อชุดข้อสอบ'); return; }
      if(!['ปวช.','ปวส.'].includes(s.educationLevel)){ alert(window.I18N?window.I18N.t('กรุณาเลือกระดับ ปวช. หรือ ปวส.'):'กรุณาเลือกระดับ ปวช. หรือ ปวส.'); return; }
      if(!s.courseName || !s.courseName.trim()) s.courseName = s.title;
      wizardStep = 'access'; renderWizard();
    });
  } else if(wizardStep==='access'){
    renderClassChips();
    syncExamSchedulesFromAssignedClasses();
    renderExamSchedules();
    document.getElementById('addClassBtn').addEventListener('click', ()=>{
      const inp = document.getElementById('addClassInput');
      const picker = document.getElementById('classGroupSelect');
      const val = picker.value || inp.value.trim();
      const trw = window.I18N ? window.I18N.t : (s2=>s2);
      if(val && !classPeriods[val]){ showToast(trw('ห้อง')+' '+val+' '+trw('ยังไม่ได้กำหนดรอบเรียน กรุณาตั้งรอบเรียนของห้องก่อน')); return; }
      if(val && classEducationLevelForName(val)!==s.educationLevel){ showToast(trw('กรุณาเลือกห้องระดับ')+' '+s.educationLevel+' '+trw('ให้ตรงกับชุดข้อสอบ')); return; }
      const selectedPeriod=document.getElementById('schedulePeriodFilter').value;
      if(val && selectedPeriod && classPeriods[val]!==selectedPeriod){ showToast(trw('ห้อง')+' '+val+' '+trw('ไม่ได้อยู่ในรอบที่กรองไว้')); return; }
      if(val && !s.assignedClasses.includes(val)){ s.assignedClasses.push(val); syncExamSchedulesFromAssignedClasses(); renderExamSchedules(); }
      inp.value=''; picker.value=''; renderClassChips();
    });
    document.getElementById('classGroupSelect').addEventListener('change', (e)=>{
      if(e.target.value) document.getElementById('addClassBtn').click();
    });
    document.getElementById('schedulePeriodFilter').addEventListener('change', renderExamSchedules);
    document.getElementById('addClassInput').addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ e.preventDefault(); document.getElementById('addClassBtn').click(); }
    });
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ wizardStep='info'; renderWizard(); });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{ if(s.delivery==='object-analysis-design') return saveEditingSet(); wizardStep='sections'; renderWizard(); });
  } else if(wizardStep==='sections'){
    renderSectionManager();
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ wizardStep='access'; renderWizard(); });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{ wizardStep='hub'; renderWizard(); });
  } else if(wizardStep==='hub'){
    document.querySelectorAll('[data-entersec]').forEach(b=>b.addEventListener('click', ()=>{
      wizardStep = 'section:'+b.dataset.entersec; openQEditor=null; renderWizard();
    }));
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ wizardStep='sections'; renderWizard(); });
  } else if(wizardStep.startsWith('section:')){
    const sec = wizardStep.split(':')[1];
    if(sec==='mc'){
      document.getElementById('fPublishMode').addEventListener('change', e=>{ s.publishMode = e.target.value; });
      document.getElementById('fShuffleQuestions').addEventListener('change', e=>{ s.shuffleQuestions = e.target.checked; });
      document.getElementById('fShuffleChoices').addEventListener('change', e=>{ s.shuffleChoices = e.target.checked; });
      renderMcPanel();
    } else if(sec==='matching') renderMatchingPanel();
    else if(sec==='written') renderWrittenPanel();
    document.getElementById('wizBackToHubBtn').addEventListener('click', ()=>{ wizardStep='hub'; openQEditor=null; renderWizard(); });
  }
}

function updateTotalIndicator(){
  // in the wizard, the running total is only shown on the hub step; safe no-op elsewhere
  if(wizardStep==='hub'){ const tr = window.I18N ? window.I18N.t : (s=>s); const el = document.querySelector('.total-indicator'); if(el){ const total = computeSetTotal(editingSet); const ok = total>0; el.className = 'total-indicator '+(ok?'ok':'warn'); el.textContent = `🎯 ${tr('คะแนนเต็มรวมขณะนี้')}: ${total} ${tr('คะแนน')} · ${ok?scoreModeSummary(total):tr('⚠️ กรุณากำหนดคะแนน')}`; } }
}

function scheduleNameForPeriod(period){ return ({เช้า:'รอบเช้า',บ่าย:'รอบบ่าย',ทวิภาคี:'รอบทวิภาคี'})[period]||''; }
function syncExamSchedulesFromAssignedClasses(){
  const s=editingSet, absenceSchedules=(s.examSchedules||[]).filter(item=>item.absenceOnly),previous=new Map((s.examSchedules||[]).filter(item=>!item.absenceOnly).map(item=>[item.name,item])); const groups=new Map();
  s.assignedClasses.forEach(room=>{const name=scheduleNameForPeriod(classPeriods[room]);if(name){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(room);}});
  s.examSchedules=[...groups.entries()].map(([name,classes])=>Object.assign({name,classes,studentIds:[],availableFrom:'',availableUntil:'',lateAccessCode:''},previous.get(name)||{}, {name,classes})).concat(absenceSchedules);
}
function renderExamSchedules(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const host=document.getElementById('examSchedulesWrap'); if(!host) return; const s=editingSet;
  const picker=document.getElementById('classGroupSelect'); const selectedPeriod=document.getElementById('schedulePeriodFilter')?.value||'';
  if(picker){picker.innerHTML=buildGroupedClassOptions(knownClasses.filter(room=>!s.assignedClasses.includes(room)&&classEducationLevelForName(room)===s.educationLevel&&(!selectedPeriod||classPeriods[room]===selectedPeriod)));}
  if(!s.examSchedules.length){host.innerHTML=`<div class="mini-card" style="margin:14px 0;"><h3 style="margin:0 0 4px;">🗓️ ${tr('รอบสอบแยกตามห้อง')}</h3><p class="panel-sub">${tr('เลือกห้องด้านล่างก่อน ระบบจะแยกห้องเข้ารอบตามรอบเรียนที่ตั้งไว้ให้ทันที')}</p></div>`;return;}
  host.innerHTML=`<div class="mini-card" style="margin:14px 0;"><h3 style="margin:0 0 4px;">🗓️ ${tr('รอบสอบแยกตามห้อง')}</h3><p class="panel-sub">${tr('ระบบจัดกลุ่มตามรอบเรียนของห้องอัตโนมัติ กำหนดวันและเวลาเฉพาะเมื่อจำเป็น — เว้นว่างไว้เพื่อเปิดสอบตลอดเวลา')}</p>${s.examSchedules.map((item,index)=>{const period=classPeriods[item.classes[0]],kind=period==='บ่าย'?'afternoon':period==='ทวิภาคี'?'cooperative':'';return `<div class="exam-schedule-card ${kind}"><div class="schedule-card-head"><div><h4>${escapeHtml(tr(item.name))}</h4><p>${tr('แสดงจากรอบเรียนที่กำหนดให้ห้อง')}</p></div></div><div class="field schedule-room-field"><label>${tr('ห้องในรอบนี้')}</label><div class="chip-row">${item.classes.map((room,roomIndex)=>`<span class="chip">${escapeHtml(room)}<button type="button" data-remove-schedule-room="${index}:${roomIndex}">✕</button></span>`).join('')}</div></div><div class="schedule-time-grid"><div class="field"><label>${tr('วันเริ่มสอบ')}</label><input type="text" data-schedule-start-date="${index}" value="${formatExamDate(item.availableFrom)}" placeholder="dd/mm/yyyy"></div><div class="field"><label>${tr('เวลาเริ่มสอบ')}</label><input type="text" data-schedule-start-time="${index}" value="${formatExamTime(item.availableFrom)}" placeholder="09.00"></div><div class="field"><label>${tr('วันสิ้นสุด')}</label><input type="text" data-schedule-end-date="${index}" value="${formatExamDate(item.availableUntil)}" placeholder="dd/mm/yyyy"></div><div class="field"><label>${tr('เวลาสิ้นสุด')}</label><input type="text" data-schedule-end-time="${index}" value="${formatExamTime(item.availableUntil)}" placeholder="10.00"></div></div></div>`;}).join('')}</div>`;
  host.querySelectorAll('.exam-schedule-card').forEach((card,index)=>{const item=s.examSchedules[index];const field=document.createElement('div');field.className='field schedule-late-code-field';field.innerHTML=`<label>${tr('รหัสเข้าสอบหลังเกินเวลาทำข้อสอบหรือเข้าสอบย้อนหลัง (ถ้ามี)')}</label><input type="text" data-schedule-late-code="${index}" value="${escapeAttr(item.lateAccessCode||'')}" placeholder="เช่น LATE2569">`;card.append(field);});
  host.querySelectorAll('.exam-schedule-card').forEach((card,index)=>{
    const item=s.examSchedules[index]; item.studentIds=Array.isArray(item.studentIds)?item.studentIds:[];
    const field=document.createElement('div'); field.className='schedule-student-access';
    field.innerHTML=`<label>${tr('นักเรียนที่มีสิทธิ์สอบเพิ่มเติม (รายคน)')}</label><div class="chip-row">${item.studentIds.map((id,studentIndex)=>{const student=knownStudents.find(value=>value.studentId===id);return `<span class="chip">${escapeHtml(student?`${student.studentId} ${student.firstName} ${student.lastName} · ${student.classRoom}`:id)}<button type="button" data-remove-schedule-student="${index}:${studentIndex}">✕</button></span>`;}).join('')}</div><div class="schedule-student-picker"><input type="text" data-schedule-student-input="${index}" autocomplete="off" placeholder="${tr('พิมพ์รหัสหรือชื่ออย่างน้อย 5 ตัว')}"><button type="button" class="btn secondary" data-add-schedule-student="${index}">${tr('+ เพิ่มรายคน')}</button></div><div class="schedule-student-results" data-schedule-student-results="${index}"></div><small>${tr('ระบบจะเริ่มค้นหาเมื่อพิมพ์ครบ 5 ตัว โดยใช้วันและเวลาของรอบนี้')}</small>`;
    card.append(field);
  });
  const sync=index=>{const item=s.examSchedules[index];item.availableFrom=parseExamDateTime(host.querySelector(`[data-schedule-start-date="${index}"]`).value,host.querySelector(`[data-schedule-start-time="${index}"]`).value);item.availableUntil=parseExamDateTime(host.querySelector(`[data-schedule-end-date="${index}"]`).value,host.querySelector(`[data-schedule-end-time="${index}"]`).value);item.lateAccessCode=host.querySelector(`[data-schedule-late-code="${index}"]`).value.trim();};
  host.querySelectorAll('[data-schedule-start-date],[data-schedule-start-time],[data-schedule-end-date],[data-schedule-end-time],[data-schedule-late-code]').forEach(input=>input.addEventListener('change',()=>sync(Number(input.dataset.scheduleStartDate??input.dataset.scheduleStartTime??input.dataset.scheduleEndDate??input.dataset.scheduleEndTime??input.dataset.scheduleLateCode))));
  host.querySelectorAll('[data-schedule-late-code]').forEach(input=>input.addEventListener('input',()=>{s.examSchedules[Number(input.dataset.scheduleLateCode)].lateAccessCode=input.value.trim();}));
  host.querySelectorAll('[data-remove-schedule-room]').forEach(button=>button.addEventListener('click',()=>{const [index,room]=button.dataset.removeScheduleRoom.split(':').map(Number),name=s.examSchedules[index].classes[room];s.assignedClasses=s.assignedClasses.filter(item=>item!==name);syncExamSchedulesFromAssignedClasses();renderExamSchedules();renderClassChips();}));
  host.querySelectorAll('[data-add-schedule-student]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.addScheduleStudent),input=host.querySelector(`[data-schedule-student-input="${index}"]`),value=input.value.trim();const student=knownStudents.find(item=>item.studentId===value);if(!student){showToast('ไม่พบรหัสนักเรียนนี้');return;}const prior=s.examSchedules.find(item=>(item.studentIds||[]).includes(student.studentId));if(prior){showToast(tr('เพิ่มนักเรียนคนนี้ไว้ใน')+` ${tr(prior.name)} `+tr('แล้ว'));return;}s.examSchedules[index].studentIds.push(student.studentId);renderExamSchedules();}));
  host.querySelectorAll('[data-schedule-student-input]').forEach(input=>{let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{const term=input.value.trim().toLocaleLowerCase('th-TH'),index=input.dataset.scheduleStudentInput,list=host.querySelector(`[data-schedule-student-results="${index}"]`);if(term.length<5){list.innerHTML='';return;}const matches=knownStudents.filter(student=>`${student.studentId} ${student.firstName} ${student.lastName} ${student.classRoom}`.toLocaleLowerCase('th-TH').includes(term)).slice(0,20);list.innerHTML=matches.length?matches.map(student=>`<button type="button" class="schedule-student-result" data-student-result="${escapeAttr(student.studentId)}"><b>${escapeHtml(student.studentId)}</b><span>${escapeHtml(`${student.firstName} ${student.lastName}`)}</span><em>${escapeHtml(student.classRoom)}</em></button>`).join(''):`<div class="schedule-student-empty">${tr('ไม่พบนักเรียนที่ตรงกับคำค้นหา')}</div>`;list.querySelectorAll('[data-student-result]').forEach(option=>option.addEventListener('click',()=>{input.value=option.dataset.studentResult;list.innerHTML='';input.focus();}));},180);});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();host.querySelector(`[data-add-schedule-student="${input.dataset.scheduleStudentInput}"]`)?.click();}});});
  host.querySelectorAll('[data-remove-schedule-student]').forEach(button=>button.addEventListener('click',()=>{const [index,studentIndex]=button.dataset.removeScheduleStudent.split(':').map(Number);s.examSchedules[index].studentIds.splice(studentIndex,1);renderExamSchedules();}));
}
function renderClassChips(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet;
  const row = document.getElementById('classChipRow');
  if(!row) return;
  if(!s.assignedClasses.length){
    row.innerHTML = `<div class="chip-empty-note">${tr('ยังไม่ได้จำกัดห้อง — ตอนนี้ทุกห้องสอบวิชานี้ได้')}</div>`;
    return;
  }
  row.innerHTML = s.assignedClasses.map((c,i)=>`<span class="chip">${escapeHtml(c)}<button type="button" data-rmclass="${i}">✕</button></span>`).join('');
  row.querySelectorAll('[data-rmclass]').forEach(b=>b.addEventListener('click', ()=>{ s.assignedClasses.splice(parseInt(b.dataset.rmclass,10),1); syncExamSchedulesFromAssignedClasses(); renderClassChips(); renderExamSchedules(); }));
}

/* ---------- section manager (add/remove matching & written sections) ---------- */
function renderSectionManager(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const row = document.getElementById('sectionManagerRow');
  const labels = {mc:tr('📝 ปรนัย'), matching:tr('🔗 จับคู่'), written:tr('✍️ อัตนัย')};
  let html = '';
  ['mc','matching','written'].forEach(sec=>{
    if(!editingUiEnabled[sec]) return;
    html += `<span class="section-tag">${labels[sec]}<button type="button" data-rmsection="${sec}" title="${tr('ลบส่วนนี้')}">✕</button></span>`;
  });
  const missing = ['mc','matching','written'].filter(sec=>!editingUiEnabled[sec]);
  if(missing.length){
    html += `<div class="add-section-dropdown">
      <button class="btn btn-ghost btn-sm" id="addSectionBtn" type="button">${tr('+ เพิ่มส่วน')}</button>
      <div class="add-section-menu hidden" id="addSectionMenu">
        ${missing.map(sec=>`<button type="button" data-addsection="${sec}">${sec==='mc'?tr('📝 เพิ่มส่วนปรนัย'):sec==='matching'?tr('🔗 เพิ่มส่วนจับคู่'):tr('✍️ เพิ่มส่วนอัตนัย')}</button>`).join('')}
      </div>
    </div>`;
  }
  row.innerHTML = html;
  row.querySelectorAll('[data-rmsection]').forEach(b=>b.addEventListener('click', ()=>{
    const sec = b.dataset.rmsection;
    if(!confirm(tr('ลบส่วนนี้? ข้อสอบทั้งหมดในส่วนนี้จะถูกลบไปด้วย'))) return;
    editingUiEnabled[sec] = false;
    if(sec==='mc'){ Object.assign(editingSet.sections.mc, {questions:[], sectionPointsTotal:0}); }
    if(sec==='matching'){ Object.assign(editingSet.sections.matching, {left:[], right:[], correctMap:{}, pointsEach:0, sectionPointsTotal:0}); }
    if(sec==='written'){ Object.assign(editingSet.sections.written, {questions:[], sectionPointsTotal:0}); }
    if(openQEditor && openQEditor.section===sec) openQEditor = null;
    renderSectionManager();
  }));
  const addBtn = document.getElementById('addSectionBtn');
  if(addBtn) addBtn.addEventListener('click', (e)=>{ e.stopPropagation(); document.getElementById('addSectionMenu').classList.toggle('hidden'); });
  row.querySelectorAll('[data-addsection]').forEach(b=>b.addEventListener('click', ()=>{
    editingUiEnabled[b.dataset.addsection] = true;
    renderSectionManager();
  }));
}
document.addEventListener('click', (e)=>{
  const menu = document.getElementById('addSectionMenu');
  const btn = document.getElementById('addSectionBtn');
  if(menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target!==btn){ menu.classList.add('hidden'); }
});

/* ---------- shared one-at-a-time question editor ---------- */
function openQuestionEditor(section, index){
  openQEditor = { section, index };
  if(section==='mc') renderMcPanel();
  else if(section==='matching') renderMatchingPanel();
  else if(section==='written') renderWrittenPanel();
  setTimeout(()=>{ const el = document.querySelector('.q-editor-panel'); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 30);
}
function closeQuestionEditor(){
  const sec = openQEditor ? openQEditor.section : null;
  openQEditor = null;
  if(sec==='mc') renderMcPanel();
  else if(sec==='matching') renderMatchingPanel();
  else if(sec==='written') renderWrittenPanel();
}
function bindEditorPanelEvents(section, index){
  document.getElementById('qeCancelBtn').addEventListener('click', closeQuestionEditor);
  document.getElementById('qeSaveBtn').addEventListener('click', ()=>{
    if(section==='mc') saveMcQuestionFromEditor(index);
    else if(section==='matching') saveMatchingPairFromEditor(index);
    else if(section==='written') saveWrittenQuestionFromEditor(index);
  });
  if(section==='mc') bindMcResourceUpload();
  if(section==='written') { bindWrittenResourceUpload(); document.getElementById('qeWAnswerType')?.addEventListener('change',event=>{const isCode=event.target.value==='code';document.getElementById('qeWKeywordsWrap').style.display=isCode?'none':'';document.getElementById('qeWCodeAnswerWrap').style.display=isCode?'':'none';document.getElementById('qeWAttachmentWrap').style.display=isCode?'none':'';}); }
}

/* ---------- MC section ---------- */
function renderMcPanel(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const s = editingSet.sections.mc;
  wrap.innerHTML = `<div class="panel">
    <div class="section-hero-card"><div><h3>${tr('📝 ปรนัย')}</h3><p>${tr('เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ')}</p></div><span class="section-count-badge">${s.questions.length} ${tr('ข้อ')}</span></div>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>${tr('คะแนนรวมส่วนนี้ (หารเท่ากันทุกข้อ)')}</label><input type="number" step="0.5" id="mcSectionPoints" value="${s.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="mcCompactList"></div>
    <button class="add-row-btn" id="addMcBtn" type="button">${tr('+ เพิ่มข้อปรนัย')}</button>
    <div class="editor-actions" style="margin-top:8px;justify-content:flex-start;">
      <button class="btn btn-ghost btn-sm" id="loadMcFromBankBtn" type="button">${tr('📚 เลือกจากคลังคำถาม')}</button>
      <button class="btn btn-ghost btn-sm" id="saveMcToBankBtn" type="button">${tr('💾 บันทึกข้อทั้งหมดในส่วนนี้เข้าคลัง')}</button>
    </div>
    <button class="add-row-btn" id="toggleMcImportBtn" type="button" style="margin-top:8px;border-color:#A78BFA;color:var(--indigo);">${tr('✨ นำเข้าข้อปรนัยจาก ChatGPT')}</button>
    <div class="mc-import-box hidden" id="mcImportBox">
      <h4>${tr('1. สร้างข้อสอบด้วย ChatGPT')}</h4><p>${tr('คัดลอก Prompt นี้ไปวางใน ChatGPT แล้วแก้ไขหัวข้อหรือจำนวนข้อได้ตามต้องการ')}</p>
      <textarea id="mcPromptText" readonly>${escapeHtml(buildChatGptMcPrompt())}</textarea>
      <div class="editor-actions"><button class="btn btn-ghost btn-sm" id="copyMcPromptBtn" type="button">${tr('📋 คัดลอก Prompt')}</button></div>
      <h4 style="margin-top:16px;">${tr('2. วางข้อสอบที่ ChatGPT สร้าง')}</h4><p>${tr('รองรับรูปแบบ: 1. คำถาม / ก. ข. ค. ง. / เฉลย: ข — ตรวจสอบก่อนเพิ่มจริง')}</p>
      <textarea id="mcImportText" placeholder="1. CPU มีหน้าที่อะไร&#10;ก. แสดงผล&#10;ข. ประมวลผล&#10;ค. เก็บข้อมูล&#10;ง. พิมพ์เอกสาร&#10;เฉลย: ข"></textarea>
      <div class="editor-actions"><button class="btn btn-ghost btn-sm" id="previewMcImportBtn" type="button">${tr('ตรวจรูปแบบ')}</button><button class="btn btn-primary btn-sm" id="applyMcImportBtn" type="button" disabled>${tr('เพิ่มข้อที่ตรวจแล้ว')}</button></div>
      <div class="mc-import-preview" id="mcImportPreview"></div>
    </div>
    <div class="editor-actions"><button class="btn btn-primary" id="saveSetFromMcBtn" type="button">${tr('💾 บันทึกชุดข้อสอบ')}</button></div>
    <div id="mcEditorSlot"></div>
  </div>`;
  renderMcCompactList();
  document.getElementById('mcSectionPoints').addEventListener('input', (e)=>{
    s.sectionPointsTotal = parseFloat(e.target.value)||0;
    applyPointDistribution('mc'); renderMcCompactList();
  });
  document.getElementById('addMcBtn').addEventListener('click', ()=> openQuestionEditor('mc', null));
  bindMcImportEvents();
  bindQuestionBankEvents();
  document.getElementById('saveSetFromMcBtn').addEventListener('click', saveEditingSet);
  renderOpenEditorIfNeeded('mc');
}
let googleFormsConnectionId = null;
let googleFormsPreview = null;
let googleFormsPoll = null;
function googleFormsPreviewHtml(preview){
  const cards=(preview.questions||[]).map((question,index)=>`<div class="google-form-question-preview"><div><span class="status-pill">${question.type==='written'?'อัตนัย':'ปรนัย'}</span>${question.sourceNumber?`<span class="google-form-source-number">เลขข้อเดิม ${escapeHtml(question.sourceNumber)}</span>`:''}</div><b>ข้อ ${index+1}. ${escapeHtml(question.text||'ไม่มีข้อความคำถาม')}</b><small>${question.type==='written'?`คำตอบข้อความ${question.keywords?.length?' · มีแนวคำตอบ':''}`:`${question.choices?.length||0} ตัวเลือก · มีเฉลย`} · ${Number(question.sourcePoints)||0} คะแนน${question.images?.length?` · มีรูป ${question.images.length} รูป`:''}</small>${question.images?.length?`<div class="google-form-preview-images">${question.images.map(image=>`<img src="${escapeAttr(image.contentUri)}" alt="${escapeAttr(image.altText||'รูปประกอบคำถาม')}" loading="lazy">`).join('')}</div>`:''}</div>`).join('');
  return `<div class="google-form-preview-summary"><span class="ok">นำเข้าได้ ${preview.questions?.length||0} ข้อ</span><span>ปรนัย ${preview.counts?.mc||0}</span><span>อัตนัย ${preview.counts?.written||0}</span><span>รูป ${preview.counts?.images||0}</span></div>${cards}${preview.skipped?.length?`<div class="bad google-form-skipped">ข้าม ${preview.skipped.length} ข้อ: ${preview.skipped.map(item=>escapeHtml(item.title+' — '+item.reason)).join(' · ')}</div>`:''}`;
}
function applyGoogleQuestionsToSet(target,preview){
  const mc=(preview.questions||[]).filter(question=>question.type==='mc');
  const written=(preview.questions||[]).filter(question=>question.type==='written');
  target.sections.mc.questions.push(...mc.map(question=>({id:uid('mc'),text:question.text,choices:question.choices.slice(),answer:question.answer,points:Number(question.sourcePoints)||0,resources:question.resources||{attachments:[]}})));
  target.sections.written.questions.push(...written.map(question=>({id:uid('w'),text:question.text,keywords:(question.keywords||[]).slice(),answerType:'text',maxPoints:Number(question.sourcePoints)||0,resources:question.resources||{attachments:[]}})));
  return {mc:mc.length,written:written.length};
}
function setGoogleFormsConnection(connectionId){
  googleFormsConnectionId=connectionId;
  if(googleFormsPoll) clearInterval(googleFormsPoll);
  googleFormsPoll=null;
  const note=document.getElementById('googleFormsConnectionNote'); if(note) note.textContent='เชื่อมต่อ Google แล้ว — วางลิงก์แบบทดสอบเพื่อเริ่มตรวจสอบ';
  showToast('เชื่อมต่อ Google สำเร็จ');
}
function waitForGoogleFormsConnection(requestId){
  if(googleFormsPoll) clearInterval(googleFormsPoll);
  let tries=0;
  googleFormsPoll=setInterval(async()=>{ try{ const status=await apiGoogleFormsStatus(requestId); if(status.connected) return setGoogleFormsConnection(status.connectionId); if(++tries>=60){ clearInterval(googleFormsPoll); googleFormsPoll=null; } }catch(_){ clearInterval(googleFormsPoll); googleFormsPoll=null; } },1000);
}
window.addEventListener('message', event=>{
  if(event.origin!==window.location.origin || event.data?.type!=='google-forms-connected') return;
  setGoogleFormsConnection(event.data.connectionId);
});
function bindGoogleFormsImportEvents(){
  const box=document.getElementById('googleFormsImportBox');
  document.getElementById('toggleGoogleFormsImportBtn').addEventListener('click', ()=>box.classList.toggle('hidden'));
  document.getElementById('connectGoogleFormsBtn').addEventListener('click', async()=>{ try{ const result=await apiStartGoogleForms(); const popup=window.open(result.authorizationUrl,'googleFormsAuth','width=560,height=700'); if(!popup) showToast('กรุณาอนุญาตให้เปิดหน้าต่างเชื่อมต่อ Google'); else waitForGoogleFormsConnection(result.requestId); }catch(error){ showToast(error.message); } });
  document.getElementById('previewGoogleFormsBtn').addEventListener('click', async()=>{
    const output=document.getElementById('googleFormsPreview'); const formUrl=document.getElementById('googleFormsUrl').value.trim();
    if(!googleFormsConnectionId){ showToast('กรุณาเชื่อมต่อ Google ก่อน'); return; } if(!formUrl){ showToast('กรุณาวางลิงก์ Google Forms'); return; }
    output.textContent='กำลังตรวจสอบแบบฟอร์ม...';
    try{ googleFormsPreview=await apiPreviewGoogleForm(googleFormsConnectionId,formUrl); document.getElementById('applyGoogleFormsBtn').disabled=!googleFormsPreview.questions.length; output.innerHTML=googleFormsPreviewHtml(googleFormsPreview); }catch(error){ googleFormsPreview=null; document.getElementById('applyGoogleFormsBtn').disabled=true; output.textContent=error.message; }
  });
  document.getElementById('applyGoogleFormsBtn').addEventListener('click', async()=>{ if(!googleFormsPreview?.questions.length) return; const button=document.getElementById('applyGoogleFormsBtn'),formUrl=document.getElementById('googleFormsUrl').value.trim(); button.disabled=true;button.textContent='กำลังนำเข้าและเก็บรูป...';try{const imported=await apiImportGoogleForm(googleFormsConnectionId,formUrl),counts=applyGoogleQuestionsToSet(editingSet,imported);renderMcPanel();showToast(`นำเข้าแล้ว: ปรนัย ${counts.mc} · อัตนัย ${counts.written}${imported.warnings?.length?' · รูปบางรายการไม่สำเร็จ':''}`);}catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent='นำเข้าและตั้งค่าชุดข้อสอบ';} });
}
function updateGoogleFormsSetDialog(){
  const connected=Boolean(googleFormsConnectionId);
  document.getElementById('googleFormsConnectStep').classList.toggle('hidden',connected);
  document.getElementById('googleFormsImportStep').classList.toggle('hidden',!connected);
}
async function openGoogleFormsSetDialog(){
  googleFormsPreview=null;
  showGoogleFormsSetReview(false);
  document.getElementById('googleFormsSetPreview').textContent='';
  document.getElementById('applyGoogleFormsSetBtn').disabled=true;
  if(!googleFormsConnectionId){ try{ const status=await apiGoogleFormsStatus(); if(status.connected) googleFormsConnectionId=status.connectionId; }catch(_){} }
  updateGoogleFormsSetDialog();
  document.getElementById('googleFormsSetDialog').showModal();
}
function setGoogleFormsConnection(connectionId){
  googleFormsConnectionId=connectionId;
  if(googleFormsPoll) clearInterval(googleFormsPoll);
  googleFormsPoll=null;
  updateGoogleFormsSetDialog();
  showToast('เชื่อมต่อ Google สำเร็จ — วางลิงก์แบบฟอร์มได้เลย');
}
function googleFormsDraftSet(preview){
  const draft=blankSet();
  draft.title=preview.title||'';
  draft.courseName=preview.title||'';
  applyGoogleQuestionsToSet(draft,preview);
  return draft;
}
function showGoogleFormsSetReview(show){
  document.getElementById('googleFormsPickerView').classList.toggle('hidden',show);
  const review=document.getElementById('googleFormsReviewView');review.classList.toggle('hidden',!show);
  if(show){review.classList.remove('google-forms-reveal');void review.offsetWidth;review.classList.add('google-forms-reveal');}
}
function bindGoogleFormsSetImportEvents(){
  const dialog=document.getElementById('googleFormsSetDialog');
  document.getElementById('closeGoogleFormsSetDialog').addEventListener('click',()=>dialog.close());
  document.getElementById('backToGoogleFormsPickerBtn').addEventListener('click',()=>showGoogleFormsSetReview(false));
  const reconnectGoogleForms=async()=>{
    try{const result=await apiStartGoogleForms();const popup=window.open(result.authorizationUrl,'googleFormsAuth','width=560,height=700');if(!popup)showToast('กรุณาอนุญาตให้เปิดหน้าต่างเชื่อมต่อ Google');else waitForGoogleFormsConnection(result.requestId);}catch(error){showToast(error.message);}
  };
  document.getElementById('connectGoogleFormsSetBtn').addEventListener('click',reconnectGoogleForms);
  document.getElementById('previewGoogleFormsSetBtn').addEventListener('click',async()=>{
    const output=document.getElementById('googleFormsSetPreview'); const formUrl=document.getElementById('googleFormsSetUrl').value.trim();
    if(!googleFormsConnectionId){showToast('กรุณาเชื่อมต่อ Google ก่อน');return;} if(!formUrl){showToast('กรุณาวางลิงก์ Google Forms');return;}
    output.textContent='กำลังตรวจสอบแบบฟอร์ม...';
    try{googleFormsPreview=await apiPreviewGoogleForm(googleFormsConnectionId,formUrl);document.getElementById('applyGoogleFormsSetBtn').disabled=!googleFormsPreview.questions.length;output.innerHTML=googleFormsPreviewHtml(googleFormsPreview);showGoogleFormsSetReview(true);}catch(error){googleFormsPreview=null;document.getElementById('applyGoogleFormsSetBtn').disabled=true;output.textContent=error.message;}
  });
  document.getElementById('listGoogleFormsSetBtn').addEventListener('click',async()=>{
    if(!googleFormsConnectionId){showToast('กรุณาเชื่อมต่อ Google ก่อน');return;}
    const output=document.getElementById('googleFormsListPreview');output.textContent='กำลังโหลดรายการ Google Forms...';
    try{const result=await apiListGoogleForms(),forms=result.forms||[];output.innerHTML=forms.length?forms.map(form=>`<button type="button" class="btn btn-ghost btn-sm" style="display:block;width:100%;text-align:left;margin:6px 0;" data-google-form-url="${escapeAttr(form.editUrl)}">📝 ${escapeHtml(form.title)}<small style="display:block;color:var(--sub);margin-top:3px;">แก้ไขล่าสุด ${form.modifiedTime?escapeHtml(new Date(form.modifiedTime).toLocaleString('th-TH')):'-'}</small></button>`).join(''):'ไม่พบ Google Forms ในบัญชีนี้';}catch(error){output.textContent=error.message;}
  });
  document.getElementById('googleFormsListPreview').addEventListener('click',event=>{const button=event.target.closest('[data-google-form-url]');if(!button)return;button.classList.add('google-form-choice-loading');button.insertAdjacentHTML('beforeend','<span class="google-forms-loading">กำลังตรวจสอบข้อสอบ...</span>');document.getElementById('googleFormsSetUrl').value=button.dataset.googleFormUrl;document.getElementById('previewGoogleFormsSetBtn').click();});
  document.getElementById('applyGoogleFormsSetBtn').addEventListener('click',async()=>{
    if(!googleFormsPreview?.questions.length)return;
    const button=document.getElementById('applyGoogleFormsSetBtn'),formUrl=document.getElementById('googleFormsSetUrl').value.trim();button.disabled=true;button.textContent='กำลังนำเข้าและเก็บรูป...';
    try{const imported=await apiImportGoogleForm(googleFormsConnectionId,formUrl);dialog.close();openEditor(null,googleFormsDraftSet(imported));showToast(`นำเข้าข้อสอบ ${imported.questions.length} ข้อแล้ว${imported.warnings?.length?' · รูปบางรายการไม่สำเร็จ':''}`);}catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent='นำเข้าและตั้งค่าชุดข้อสอบ';}
  });
}
bindGoogleFormsSetImportEvents();
let questionFilePreview=null;
function questionFilePreviewHtml(preview){
  const cards=(preview.questions||[]).map((question,index)=>`<div class="google-form-question-preview"><div><span class="status-pill">${question.type==='written'?'อัตนัย':'ปรนัย'}</span><span class="google-form-source-number">ข้อเดิม ${escapeHtml(question.sourceNumber||index+1)}</span></div><b>ข้อ ${index+1}. ${escapeHtml(question.text)}</b><small>${question.type==='written'?`คำสำคัญ ${(question.keywords||[]).length} รายการ`:`${question.choices.length} ตัวเลือก · เฉลยข้อ ${question.answer+1}`} · ${Number(question.sourcePoints)||0} คะแนน</small></div>`).join('');
  return `<div class="google-form-preview-summary"><span class="ok">นำเข้าได้ ${preview.questions?.length||0} ข้อ</span><span>ปรนัย ${preview.counts?.mc||0}</span><span>อัตนัย ${preview.counts?.written||0}</span></div>${cards}${preview.skipped?.length?`<div class="bad google-form-skipped">ข้าม ${preview.skipped.length} รายการ:<br>${preview.skipped.map(escapeHtml).join('<br>')}</div>`:''}`;
}
function bindQuestionFileImportEvents(){
  const dialog=document.getElementById('questionFileImportDialog'),input=document.getElementById('questionImportFile'),output=document.getElementById('questionFilePreview'),apply=document.getElementById('applyQuestionFileBtn');
  document.getElementById('chooseQuestionFileImportBtn').addEventListener('click',()=>{examImportChoiceDialog.close();questionFilePreview=null;input.value='';output.textContent='';apply.disabled=true;dialog.showModal();});
  document.getElementById('closeQuestionFileImportDialog').addEventListener('click',()=>dialog.close());
  document.getElementById('backToExamImportChoiceBtn').addEventListener('click',()=>{dialog.close();examImportChoiceDialog.showModal();});
  document.getElementById('previewQuestionFileBtn').addEventListener('click',async()=>{const file=input.files?.[0];if(!file){showToast('กรุณาเลือกไฟล์ข้อสอบ');return;}output.textContent='กำลังอ่านข้อความและตรวจสอบรูปแบบ...';apply.disabled=true;try{questionFilePreview=await apiPreviewQuestionFile(file);output.innerHTML=questionFilePreviewHtml(questionFilePreview);apply.disabled=!questionFilePreview.questions.length;}catch(error){questionFilePreview=null;output.textContent=error.message;}});
  apply.addEventListener('click',()=>{if(!questionFilePreview?.questions.length)return;const draft=googleFormsDraftSet(questionFilePreview);dialog.close();openEditor(null,draft);showToast(`นำเข้าข้อสอบ ${questionFilePreview.questions.length} ข้อแล้ว กรุณาตรวจเฉลยและคะแนนก่อนบันทึก`);});
}
bindQuestionFileImportEvents();
const questionBankDialog = document.getElementById('questionBankDialog');
let questionBankCache = null;
let questionBankSelected = new Set();
function bindQuestionBankEvents(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  document.getElementById('saveMcToBankBtn').addEventListener('click', async ()=>{
    if(!editingSet.sections.mc.questions.length){ showToast('ยังไม่มีข้อปรนัยให้เก็บ'); return; }
    try{ const result=await apiFetch('/api/teacher/question-bank',{method:'POST',body:{questions:editingSet.sections.mc.questions.map(question=>({...question,courseName:editingSet.courseName||editingSet.title||''}))},auth:true}); showToast(tr('เพิ่มเข้าคลัง')+` ${result.added} `+tr('ข้อ')); }catch(error){ showToast(error.message); }
  });
  document.getElementById('loadMcFromBankBtn').addEventListener('click', openQuestionBankDialog);
}
async function openQuestionBankDialog(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  questionBankSelected = new Set();
  document.getElementById('questionBankSearchInput').value = '';
  const list = document.getElementById('questionBankList');
  list.innerHTML = `<div class="loading-note">${tr('กำลังโหลด...')}</div>`;
  questionBankDialog.showModal();
  try{
    questionBankCache = await apiFetch('/api/teacher/question-bank',{auth:true});
  }catch(error){
    list.innerHTML = `<div class="empty-note">${escapeHtml(error.message)}</div>`;
    return;
  }
  renderQuestionBankList();
}
function renderQuestionBankList(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const list = document.getElementById('questionBankList');
  const query = document.getElementById('questionBankSearchInput').value.trim().toLowerCase();
  const items = (questionBankCache||[]).filter(q => !query || q.text.toLowerCase().includes(query) || (q.courseName||'').toLowerCase().includes(query));
  if(!(questionBankCache||[]).length){ list.innerHTML = `<div class="empty-note">${tr('คลังข้อสอบยังว่าง')}</div>`; updateQuestionBankSelectedCount(); return; }
  if(!items.length){ list.innerHTML = `<div class="empty-note">${tr('ไม่พบข้อคำถามที่ตรงกับคำค้นหา')}</div>`; updateQuestionBankSelectedCount(); return; }
  list.innerHTML = items.map(q=>`
    <label class="question-bank-row" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;">
      <input type="checkbox" data-bank-id="${escapeAttr(q.id)}" ${questionBankSelected.has(q.id)?'checked':''} style="margin-top:3px;">
      <span style="flex:1;min-width:0;">
        <span style="display:block;font-weight:600;font-size:13.5px;">${escapeHtml(truncateText(q.text,140))}</span>
        <span style="display:block;color:var(--sub);font-size:12px;margin-top:2px;">${q.courseName?escapeHtml(q.courseName)+' · ':''}${q.choices.length} ${tr('ตัวเลือก')}</span>
      </span>
      <button type="button" class="btn btn-ghost btn-sm" data-bank-delete="${escapeAttr(q.id)}" title="${tr('ลบออกจากคลัง')}">🗑️</button>
    </label>`).join('');
  list.querySelectorAll('[data-bank-id]').forEach(input=>input.addEventListener('change', ()=>{
    if(input.checked) questionBankSelected.add(input.dataset.bankId); else questionBankSelected.delete(input.dataset.bankId);
    updateQuestionBankSelectedCount();
  }));
  list.querySelectorAll('[data-bank-delete]').forEach(button=>button.addEventListener('click', async (event)=>{
    event.preventDefault(); event.stopPropagation();
    if(!confirm(tr('ลบข้อนี้ออกจากคลังถาวร?'))) return;
    const id = button.dataset.bankDelete;
    try{
      await apiFetch('/api/teacher/question-bank/'+encodeURIComponent(id),{method:'DELETE',auth:true});
      questionBankCache = questionBankCache.filter(q=>q.id!==id);
      questionBankSelected.delete(id);
      renderQuestionBankList();
    }catch(error){ showToast(error.message); }
  }));
  updateQuestionBankSelectedCount();
}
function updateQuestionBankSelectedCount(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  document.getElementById('questionBankSelectedCount').textContent = questionBankSelected.size ? `${tr('เลือกแล้ว')} ${questionBankSelected.size} ${tr('ข้อ')}` : '';
  document.getElementById('addSelectedBankQuestionsBtn').disabled = !questionBankSelected.size;
}
document.getElementById('questionBankSearchInput').addEventListener('input', renderQuestionBankList);
document.getElementById('closeQuestionBankDialog').addEventListener('click', ()=>questionBankDialog.close());
document.getElementById('addSelectedBankQuestionsBtn').addEventListener('click', ()=>{
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const chosen = (questionBankCache||[]).filter(q=>questionBankSelected.has(q.id));
  if(!chosen.length) return;
  editingSet.sections.mc.questions.push(...chosen.map(question=>({id:uid('mc'), text:question.text, choices:question.choices.slice(), answer:question.answer, points:0, resources:question.resources?JSON.parse(JSON.stringify(question.resources)):undefined})));
  applyPointDistribution('mc'); renderMcPanel();
  showToast(tr('เพิ่มจากคลัง')+` ${chosen.length} `+tr('ข้อแล้ว'));
  questionBankDialog.close();
});
function parseChatGptMc(text){
  const questions=[]; const errors=[]; let current=null; let target=null;
  const answerIndex = token => ({'ก':0,'ข':1,'ค':2,'ง':3,'a':0,'b':1,'c':2,'d':3,'1':0,'2':1,'3':2,'4':3}[String(token).trim().toLowerCase()]);
  const finish = () => {
    if(!current) return;
    const choices = Array.from({length:4}, (_, index)=>(current.choices[index]||'').trim());
    if(!current.text.trim() || choices.length!==4 || choices.some(choice=>!choice) || current.answer===undefined) errors.push(`ข้อ ${current.number||'?'}: ต้องมีคำถาม ตัวเลือก 4 ข้อ และเฉลย`);
    else questions.push({text:current.text.trim(), choices, answer:current.answer});
  };
  String(text||'').replace(/\r/g,'').split('\n').forEach(line=>{
    const question = line.match(/^\s*(\d+)\s*[.)]\s*(.+)$/);
    const choice = line.match(/^\s*([กขคงa-dA-D1-4])\s*[.)]\s*(.+)$/);
    const answer = line.match(/^\s*(?:เฉลย|คำตอบ)\s*[:：]\s*([กขคงa-dA-D1-4])/i);
    if(question){ finish(); current={number:question[1],text:question[2],choices:[],answer:undefined}; target='text'; }
    else if(!current) { if(line.trim()) errors.push(`ไม่พบเลขข้อคำถาม: ${line.trim().slice(0,40)}`); }
    else if(choice){ current.choices[answerIndex(choice[1])] = choice[2]; target='choice'; }
    else if(answer){ current.answer=answerIndex(answer[1]); target=null; }
    else if(line.trim() && target==='text') current.text += ' '+line.trim();
    else if(line.trim() && target==='choice') current.choices[current.choices.length-1] = (current.choices[current.choices.length-1]||'')+' '+line.trim();
  });
  finish(); return {questions,errors};
}
function buildChatGptMcPrompt(){
  const course = editingSet?.courseName || editingSet?.title || '[ชื่อวิชา]';
  const examType = editingSet?.examType || '[ประเภทข้อสอบ]';
  const description = editingSet?.desc ? `\nรายละเอียดรายวิชา: ${editingSet.desc}` : '';
  return `ช่วยสร้างข้อสอบปรนัยสำหรับวิชา “${course}” ประเภท “${examType}” จำนวน 10 ข้อ\nหัวข้อเนื้อหา: [ระบุหัวข้อที่ต้องการออกข้อสอบ]${description}\n\nเงื่อนไข:\n- แต่ละข้อมีตัวเลือก 4 ตัวเลือก\n- ใช้ภาษาไทยที่ชัดเจน เหมาะกับผู้เรียน\n- มีคำตอบถูกเพียงข้อเดียว\n- กระจายระดับความยากง่าย\n- ห้ามมีคำอธิบายก่อนหรือหลังข้อสอบ\n- ส่งผลลัพธ์ตามรูปแบบนี้เท่านั้น:\n\n1. [คำถาม]\nก. [ตัวเลือก]\nข. [ตัวเลือก]\nค. [ตัวเลือก]\nง. [ตัวเลือก]\nเฉลย: ก`;
}
async function copyMcPrompt(){
  const text = document.getElementById('mcPromptText').value;
  try{ await navigator.clipboard.writeText(text); }
  catch(e){ const area=document.createElement('textarea'); area.value=text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); }
  showToast('คัดลอก Prompt แล้ว — นำไปวางใน ChatGPT ได้เลย');
}
function bindMcImportEvents(){
  let parsed = null;
  const box=document.getElementById('mcImportBox'), preview=document.getElementById('mcImportPreview'), apply=document.getElementById('applyMcImportBtn');
  document.getElementById('toggleMcImportBtn').addEventListener('click', ()=>box.classList.toggle('hidden'));
  document.getElementById('copyMcPromptBtn').addEventListener('click', copyMcPrompt);
  document.getElementById('previewMcImportBtn').addEventListener('click', ()=>{
    parsed=parseChatGptMc(document.getElementById('mcImportText').value);
    preview.innerHTML = `<span class="ok">✓ อ่านได้ ${parsed.questions.length} ข้อ</span>${parsed.errors.length?`<br><span class="bad">⚠ ${parsed.errors.map(escapeHtml).join('<br>')}</span>`:''}`;
    apply.disabled = parsed.questions.length===0;
  });
  apply.addEventListener('click', ()=>{
    if(!parsed?.questions.length) return;
    editingSet.sections.mc.questions.push(...parsed.questions.map(question=>({id:uid('mc'),...question,points:0})));
    applyPointDistribution('mc'); renderMcPanel(); showToast(`เพิ่มข้อปรนัย ${parsed.questions.length} ข้อแล้ว`);
  });
}
function renderMcCompactList(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet.sections.mc;
  const wrap = document.getElementById('mcCompactList');
  if(!wrap) return;
  wrap.innerHTML = s.questions.map((q,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(q.text||tr('(ยังไม่ได้กรอกคำถาม)'),70))}</span>
      <span class="compact-meta">${q.points||0} ${tr('คะแนน')}</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">${tr('แก้ไข')}</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">${tr('ลบ')}</button>
    </div>`).join('') || `<p class="muted-note">${tr('ยังไม่มีข้อปรนัย')}</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('mc', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm(tr('ลบข้อนี้?'))) return;
    s.questions.splice(i,1);
    applyPointDistribution('mc');
    if(openQEditor && openQEditor.section==='mc' && openQEditor.index===i) openQEditor=null;
    renderMcPanel();
  }));
}
function mcEditorPanelHtml(index){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet.sections.mc;
  const isNew = index===null;
  const q = isNew ? {text:'', choices:['','','',''], answer:0} : s.questions[index];
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?tr('เพิ่มข้อปรนัยใหม่'):tr('แก้ไขข้อที่')+' '+(index+1)}</div>
    <div class="field"><label>${tr('โจทย์')}</label><textarea id="qeMcText" placeholder="${tr('พิมพ์คำถาม...')}">${escapeHtml(q.text)}</textarea></div>
    ${mcResourceEditorHtml(q,isNew)}
    ${q.choices.map((c,ci)=>`
      <div class="choice-edit-row">
        <input type="radio" name="qeMcAns" data-ci="${ci}" ${q.answer===ci?'checked':''} title="${tr('ทำเครื่องหมายคำตอบที่ถูกต้อง')}">
        <input type="text" class="qeMcChoice" data-ci="${ci}" value="${escapeAttr(c)}" placeholder="${tr('ตัวเลือกที่')} ${ci+1}">
      </div>`).join('')}
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">${tr('ยกเลิก')}</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?tr('เพิ่มข้อนี้'):tr('บันทึกการแก้ไข')}</button>
    </div>
  </div>`;
}
function mcResourceEditorHtml(q,isNew){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]}));
  const attachments=(resources.attachments||[]).map(item=>`<li>${escapeHtml(item.name||tr('ไฟล์แนบ'))}</li>`).join('')||`<li>${tr('ยังไม่มีไฟล์แนบ')}</li>`;
  return `<div class="field"><label>${tr('รูปภาพหรือไฟล์แนบ (ไม่เกิน 5 MB)')}</label><input id="qeMcAsset" type="file" accept="image/*,.pdf,.docx,.pptx,.zip"><ul id="qeMcAssetList">${attachments}</ul></div>`;
}
function bindMcResourceUpload(){
  const input=document.getElementById('qeMcAsset');
  if(!input) return;
  input.addEventListener('change',async()=>{
    const file=input.files?.[0]; if(!file) return;
    input.disabled=true;
    try{ const asset=await apiUploadQuestionAsset(file); openQEditor.resources=openQEditor.resources||{attachments:[]}; openQEditor.resources.attachments.push(asset); document.getElementById('qeMcAssetList').innerHTML=openQEditor.resources.attachments.map(item=>`<li>${escapeHtml(item.name)}</li>`).join(''); showToast('อัปโหลดไฟล์แล้ว'); }
    catch(error){ showToast(error.message); }
    finally{ input.value=''; input.disabled=false; }
  });
}
function writtenResourceEditorHtml(q,isNew){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]}));
  const attachments=(resources.attachments||[]).map(item=>`<li>${escapeHtml(item.name||tr('ไฟล์แนบ'))}</li>`).join('')||`<li>${tr('ยังไม่มีไฟล์แนบ')}</li>`;
  return `<div class="field"><label>${tr('รูปภาพหรือไฟล์แนบ (ไม่เกิน 5 MB)')}</label><input id="qeWAsset" type="file" accept="image/*,.pdf,.docx,.pptx,.zip"><ul id="qeWAssetList">${attachments}</ul></div>`;
}
function writtenCodeResourceEditorHtml(q,isNew){ const tr = window.I18N ? window.I18N.t : (s=>s); const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]})); return `<div class="field"><label>${tr('โค้ดตั้งต้น/โค้ดประกอบโจทย์ (ถ้ามี)')}</label><select id="qeWCodeLanguage"><option value="">${tr('เลือกภาษา')}</option>${['C','C++','Java','HTML','SQL','อื่น ๆ'].map(x=>`<option ${resources.language===x?'selected':''}>${tr(x)}</option>`).join('')}</select><textarea id="qeWCode" placeholder="${tr('วางโค้ดที่ต้องการแสดงในโจทย์')}">${escapeHtml(resources.code||'')}</textarea></div>`; }
function bindWrittenResourceUpload(){
  const input=document.getElementById('qeWAsset');
  if(!input) return;
  input.addEventListener('change',async()=>{
    const file=input.files?.[0]; if(!file) return;
    input.disabled=true;
    try{ const asset=await apiUploadQuestionAsset(file); openQEditor.resources=openQEditor.resources||{attachments:[]}; openQEditor.resources.attachments.push(asset); document.getElementById('qeWAssetList').innerHTML=openQEditor.resources.attachments.map(item=>`<li>${escapeHtml(item.name)}</li>`).join(''); showToast('อัปโหลดไฟล์แล้ว'); }
    catch(error){ showToast(error.message); }
    finally{ input.value=''; input.disabled=false; }
  });
}
function saveMcQuestionFromEditor(index){
  const text = document.getElementById('qeMcText').value.trim();
  if(!text){ alert(window.I18N?window.I18N.t('กรุณากรอกคำถาม'):'กรุณากรอกคำถาม'); return; }
  const choices = Array.from(document.querySelectorAll('.qeMcChoice')).map(el=>el.value.trim());
  if(choices.some(c=>!c)){ alert(window.I18N?window.I18N.t('กรุณากรอกตัวเลือกให้ครบทุกช่อง'):'กรุณากรอกตัวเลือกให้ครบทุกช่อง'); return; }
  const answerRadio = document.querySelector('input[name="qeMcAns"]:checked');
  const answer = answerRadio ? parseInt(answerRadio.dataset.ci,10) : 0;
  const s = editingSet.sections.mc;
  const old=index===null?{}:s.questions[index];
  const resources=openQEditor.resources||old.resources||{attachments:[]};
  if(index===null) s.questions.push({id:uid('mc'), text, choices, answer, points:0, resources});
  else Object.assign(s.questions[index], {text, choices, answer, resources});
  applyPointDistribution('mc');
  closeQuestionEditor();
}

/* ---------- Matching section ---------- */
function renderMatchingPanel(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const m = editingSet.sections.matching;
  wrap.innerHTML = `<div class="panel">
    <h3>${tr('🔗 ส่วนที่ 2 — จับคู่')} <span style="font-weight:400;color:var(--sub);font-size:12px;">(${m.left.length} ${tr('คู่')})</span></h3>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>${tr('คะแนนรวมส่วนนี้ (หารเท่ากันทุกคู่)')}</label><input type="number" step="0.5" id="matchSectionPoints" value="${m.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="matchCompactList"></div>
    <button class="add-row-btn" id="addMatchBtn" type="button">${tr('+ เพิ่มคู่จับคู่')}</button>
    <div id="matchingEditorSlot"></div>
  </div>`;
  renderMatchCompactList();
  document.getElementById('matchSectionPoints').addEventListener('input', (e)=>{
    m.sectionPointsTotal = parseFloat(e.target.value)||0;
    applyPointDistribution('matching'); renderMatchCompactList();
  });
  document.getElementById('addMatchBtn').addEventListener('click', ()=> openQuestionEditor('matching', null));
  renderOpenEditorIfNeeded('matching');
}
function renderMatchCompactList(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const m = editingSet.sections.matching;
  const wrap = document.getElementById('matchCompactList');
  if(!wrap) return;
  wrap.innerHTML = m.left.map((item,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(item.text||tr('(ว่าง)'),30))} ↔ ${escapeHtml(truncateText(m.right[i].text||tr('(ว่าง)'),30))}</span>
      <span class="compact-meta">${m.pointsEach||0} ${tr('คะแนน')}</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">${tr('แก้ไข')}</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">${tr('ลบ')}</button>
    </div>`).join('') || `<p class="muted-note">${tr('ยังไม่มีคู่จับคู่')}</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('matching', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm(tr('ลบคู่นี้?'))) return;
    const lid = m.left[i].id;
    m.left.splice(i,1); m.right.splice(i,1);
    delete m.correctMap[lid];
    applyPointDistribution('matching');
    if(openQEditor && openQEditor.section==='matching' && openQEditor.index===i) openQEditor=null;
    renderMatchingPanel();
  }));
}
function matchingEditorPanelHtml(index){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const m = editingSet.sections.matching;
  const isNew = index===null;
  const leftText = isNew ? '' : m.left[index].text;
  const rightText = isNew ? '' : m.right[index].text;
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?tr('เพิ่มคู่จับคู่ใหม่'):tr('แก้ไขคู่ที่')+' '+(index+1)}</div>
    <div class="field-row">
      <div class="field"><label>${tr('รายการฝั่งซ้าย (โจทย์)')}</label><input type="text" id="qeMLeft" value="${escapeAttr(leftText)}" placeholder="เช่น CPU"></div>
      <div class="field"><label>${tr('รายการฝั่งขวา (คำตอบ)')}</label><input type="text" id="qeMRight" value="${escapeAttr(rightText)}" placeholder="เช่น หน่วยประมวลผลกลาง"></div>
    </div>
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">${tr('ยกเลิก')}</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?tr('เพิ่มคู่นี้'):tr('บันทึกการแก้ไข')}</button>
    </div>
  </div>`;
}
function saveMatchingPairFromEditor(index){
  const leftText = document.getElementById('qeMLeft').value.trim();
  const rightText = document.getElementById('qeMRight').value.trim();
  if(!leftText || !rightText){ alert(window.I18N?window.I18N.t('กรุณากรอกทั้งสองฝั่ง'):'กรุณากรอกทั้งสองฝั่ง'); return; }
  const m = editingSet.sections.matching;
  if(index===null){
    const lid = uid('l'), rid = uid('r');
    m.left.push({id:lid, text:leftText});
    m.right.push({id:rid, text:rightText});
    m.correctMap[lid] = rid;
  } else {
    m.left[index].text = leftText;
    m.right[index].text = rightText;
  }
  applyPointDistribution('matching');
  closeQuestionEditor();
}

/* ---------- Written section ---------- */
function renderWrittenPanel(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const s = editingSet.sections.written;
  wrap.innerHTML = `<div class="panel">
    <h3>${tr('✍️ ส่วนที่ 3 — อัตนัย')} <span style="font-weight:400;color:var(--sub);font-size:12px;">(${s.questions.length} ${tr('ข้อ')})</span></h3>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>${tr('คะแนนรวมส่วนนี้ (หารเท่ากันทุกข้อ)')}</label><input type="number" step="0.5" id="writtenSectionPoints" value="${s.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="writtenCompactList"></div>
    <button class="add-row-btn" id="addWrittenBtn" type="button">${tr('+ เพิ่มข้ออัตนัย')}</button>
    <div id="writtenEditorSlot"></div>
  </div>`;
  renderWrittenCompactList();
  document.getElementById('writtenSectionPoints').addEventListener('input', (e)=>{
    s.sectionPointsTotal = parseFloat(e.target.value)||0;
    applyPointDistribution('written'); renderWrittenCompactList();
  });
  document.getElementById('addWrittenBtn').addEventListener('click', ()=> openQuestionEditor('written', null));
  renderOpenEditorIfNeeded('written');
}
function renderWrittenCompactList(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet.sections.written;
  const wrap = document.getElementById('writtenCompactList');
  if(!wrap) return;
  wrap.innerHTML = s.questions.map((q,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(q.text||tr('(ยังไม่ได้กรอกคำถาม)'),70))}</span>
      <span class="compact-meta">${q.maxPoints||0} ${tr('คะแนน')}</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">${tr('แก้ไข')}</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">${tr('ลบ')}</button>
    </div>`).join('') || `<p class="muted-note">${tr('ยังไม่มีข้ออัตนัย')}</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('written', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm(tr('ลบข้อนี้?'))) return;
    s.questions.splice(i,1);
    applyPointDistribution('written');
    if(openQEditor && openQEditor.section==='written' && openQEditor.index===i) openQEditor=null;
    renderWrittenPanel();
  }));
}
function writtenEditorPanelHtml(index){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const s = editingSet.sections.written;
  const isNew = index===null;
  const q = isNew ? {text:'', keywords:[], answerType:'text', answerCode:'', language:'c'} : s.questions[index];
  const isCode = q.answerType === 'code';
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?tr('เพิ่มข้ออัตนัยใหม่'):tr('แก้ไขข้อที่')+' '+(index+1)}</div>
    <div class="field"><label>${tr('โจทย์')}</label><textarea id="qeWText" placeholder="${tr('พิมพ์คำถาม...')}">${escapeHtml(q.text)}</textarea></div>
    <div class="field"><label>${tr('รูปแบบคำตอบ')}</label><select id="qeWAnswerType"><option value="text" ${!isCode?'selected':''}>${tr('อัตนัย (ตรวจคำสำคัญ)')}</option><option value="code" ${isCode?'selected':''}>${tr('💻 แก้ไขโค้ด (เทียบเฉลย)')}</option></select></div>
    <div class="field" id="qeWKeywordsWrap" ${isCode?'style="display:none"':''}><label>${tr('คำสำคัญสำหรับตรวจเบื้องต้น (คั่นด้วยจุลภาค , )')}</label><input type="text" id="qeWKeywords" value="${escapeAttr((q.keywords||[]).join(', '))}" placeholder="เช่น ฮาร์ดแวร์, ซอฟต์แวร์"></div>
    <div id="qeWCodeAnswerWrap" ${isCode?'':'style="display:none"'}><div class="field"><label>${tr('ภาษา')}</label><select id="qeWLanguage"><option value="c" ${q.language==='c'?'selected':''}>C</option><option value="cpp" ${q.language==='cpp'?'selected':''}>C++</option><option value="java" ${q.language==='java'?'selected':''}>Java</option></select></div><div class="field"><label>${tr('เฉลยโค้ด (ตัดช่องว่างและขึ้นบรรทัดใหม่ก่อนตรวจ)')}</label><textarea id="qeWAnswerCode" spellcheck="false" style="font-family:ui-monospace,Consolas,monospace;min-height:150px;">${escapeHtml(q.answerCode||'')}</textarea></div>${writtenCodeResourceEditorHtml(q,isNew)}</div><div id="qeWAttachmentWrap" ${isCode?'style="display:none"':''}>${writtenResourceEditorHtml(q,isNew)}</div>
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">${tr('ยกเลิก')}</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?tr('เพิ่มข้อนี้'):tr('บันทึกการแก้ไข')}</button>
    </div>
  </div>`;
}
function saveWrittenQuestionFromEditor(index){
  const text = document.getElementById('qeWText').value.trim();
  if(!text){ alert(window.I18N?window.I18N.t('กรุณากรอกคำถาม'):'กรุณากรอกคำถาม'); return; }
  const answerType = document.getElementById('qeWAnswerType').value;
  const answerCode = document.getElementById('qeWAnswerCode').value.trim();
  if(answerType==='code' && !answerCode){ alert(window.I18N?window.I18N.t('กรุณากรอกเฉลยโค้ด'):'กรุณากรอกเฉลยโค้ด'); return; }
  const keywords = answerType==='code' ? [] : document.getElementById('qeWKeywords').value.split(',').map(k=>k.trim()).filter(Boolean);
  const s = editingSet.sections.written;
  const old=index===null?{}:s.questions[index];
  const resources=openQEditor.resources||old.resources||{attachments:[]};
  resources.code=answerType==='code'?(document.getElementById('qeWCode')?.value.trim()||''):'';
  resources.language=answerType==='code'?(document.getElementById('qeWCodeLanguage')?.value||''):'';
  delete resources.table;
  const language=document.getElementById('qeWLanguage').value;
  if(answerType==='code') resources.attachments=[];
  if(index===null) s.questions.push({id:uid('w'), text, keywords, answerType, answerCode, language, maxPoints:0, resources});
  else { Object.assign(s.questions[index], {text, keywords, answerType, answerCode, language, resources}); delete s.questions[index].eligibleClassRooms; }
  applyPointDistribution('written');
  closeQuestionEditor();
}

function renderOpenEditorIfNeeded(section){
  const slotId = section==='mc' ? 'mcEditorSlot' : section==='matching' ? 'matchingEditorSlot' : 'writtenEditorSlot';
  const slot = document.getElementById(slotId);
  if(!slot) return;
  if(!openQEditor || openQEditor.section!==section){ slot.innerHTML=''; return; }
  if(section==='mc') slot.innerHTML = mcEditorPanelHtml(openQEditor.index);
  if(section==='matching') slot.innerHTML = matchingEditorPanelHtml(openQEditor.index);
  if(section==='written') slot.innerHTML = writtenEditorPanelHtml(openQEditor.index);
  bindEditorPanelEvents(section, openQEditor.index);
}

let isSavingSet = false;
function setSetSaveButtonsLoading(loading){
  document.querySelectorAll('#wizSaveBtn,#saveSetFromMcBtn').forEach(button=>{
    button.disabled=loading;
    button.innerHTML=loading?'<span class="button-spinner"></span>กำลังบันทึก...':'💾 บันทึกชุดข้อสอบ';
  });
}
async function saveEditingSet(){
  if(isSavingSet) return;
  const tr = window.I18N ? window.I18N.t : (s=>s);
  if(openQEditor){ showToast('กรุณาบันทึกหรือยกเลิกการแก้ไขข้อคำถามก่อน'); return; }
  const s = editingSet;
  if(!editingUiEnabled.mc) Object.assign(s.sections.mc, {questions:[], sectionPointsTotal:0});
  if(!editingUiEnabled.matching) Object.assign(s.sections.matching, {left:[], right:[], correctMap:{}, pointsEach:0, sectionPointsTotal:0});
  if(!editingUiEnabled.written) Object.assign(s.sections.written, {questions:[], sectionPointsTotal:0});
  applyPointDistribution('mc'); applyPointDistribution('matching'); applyPointDistribution('written');
  if(!s.title || !s.title.trim()){ alert(tr('กรุณากรอกชื่อชุดข้อสอบ (ย้อนกลับไปขั้นตอนที่ 1)')); wizardStep='info'; renderWizard(); return; }
  if(!['ปวช.','ปวส.'].includes(s.educationLevel)){ alert(tr('กรุณาเลือกระดับ ปวช. หรือ ปวส. (ย้อนกลับไปขั้นตอนที่ 1)')); wizardStep='info'; renderWizard(); return; }
  const hasExamQuestions=s.sections.mc.questions.length||s.sections.matching.left.length||s.sections.written.questions.length;
  if(s.delivery!=='object-analysis-design' && !hasExamQuestions){ alert(tr('กรุณาเพิ่มข้อสอบอย่างน้อย 1 ข้อ')); wizardStep='sections'; renderWizard(); return; }
  if(s.examSchedules.length){
    const invalid=s.examSchedules.find(item=>!(item.classes||[]).length||((item.availableFrom||item.availableUntil)&&(!item.availableFrom||!item.availableUntil||new Date(item.availableFrom)>=new Date(item.availableUntil))));
    if(invalid){ alert(tr('กรุณาเลือกห้องให้ครบทุกรอบ และหากกำหนดเวลาให้กรอกวัน–เวลาเริ่มและสิ้นสุดให้ครบถ้วน')); wizardStep='access'; renderWizard(); return; }
    s.assignedClasses=[...new Set(s.examSchedules.flatMap(item=>item.classes||[]))];
  }
  isSavingSet = true;
  setSetSaveButtonsLoading(true);
  try{
    const response = editingIsNew ? await apiCreateSet(s) : await apiUpdateSet(s.key, s);
    if(editingIsNew && response?.key) s.key = response.key;
    if(response) Object.assign(s,{academicYear:response.academicYear||null,semester:response.semester||null,semesterLabel:response.semesterLabel||null});
    const savedSet = JSON.parse(JSON.stringify(s));
    const existingIndex = ADMIN_SETS.findIndex(item=>item.key===savedSet.key);
    if(existingIndex >= 0) ADMIN_SETS.splice(existingIndex, 1, savedSet); else ADMIN_SETS.unshift(savedSet);
    closeEditor(); renderSetList(); populateSetFilterOptions();
    showToast('บันทึกชุดข้อสอบเรียบร้อยแล้ว นักเรียนในห้องที่กำหนดจะเห็นวิชานี้ทันที');
    // รีเฟรชข้อมูลเต็มในเบื้องหลัง เพื่อไม่ให้ปุ่มค้างเมื่อเครือข่ายตอบช้า
    apiGetAdminSets().then(sets=>{ ADMIN_SETS=sets; renderSetList(); populateSetFilterOptions(); }).catch(()=>{});
  }catch(e){
    showToast(e.message);
  }finally{
    isSavingSet = false;
    setSetSaveButtonsLoading(false);
  }
}

/* ======================================================================
   RESULTS + EXCEL EXPORT + PUBLISH
   ====================================================================== */
function populateSetFilterOptions(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const sel = document.getElementById('setFilterSelect');
  const current = sel.value;
  sel.innerHTML = `<option value="">${tr('ทุกรายวิชา')}</option>` + ADMIN_SETS.map(s=>`<option value="${escapeAttr(s.key)}">${escapeHtml(s.title)}</option>`).join('');
  sel.value = current;
  const years=[...new Set(ADMIN_SETS.map(set=>set.academicYear).filter(Boolean))].sort().reverse();
  const yearSelect=document.getElementById('academicYearFilterSelect'); const currentYear=yearSelect.value;
  yearSelect.innerHTML=`<option value="">${tr('ทุกปีการศึกษา')}</option>`+years.map(year=>`<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`).join(''); yearSelect.value=years.includes(currentYear)?currentYear:'';
  const terms=[...new Map(ADMIN_SETS.filter(set=>set.semester).map(set=>[set.semester,set.semesterLabel||tr('เทอม')+` ${set.semester}`])).entries()];
  const termSelect=document.getElementById('semesterFilterSelect'); const currentTerm=termSelect.value;
  termSelect.innerHTML=`<option value="">${tr('ทุกภาคเรียน')}</option>`+terms.map(([id,label])=>`<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`).join(''); termSelect.value=terms.some(([id])=>id===currentTerm)?currentTerm:'';
}
let LAST_RESULTS = [];
let activeResitResult = null;
const resitDialog = document.getElementById('resitDialog');
const resitForm = document.getElementById('resitForm');
const resitDialogError = document.getElementById('resitDialogError');
const approveResitBtn = document.getElementById('approveResitBtn');

function closeResitDialog(){
  if(resitDialog.open) resitDialog.close();
  activeResitResult=null;
  resitDialogError.textContent='';
}
function openResitDialog(resultId){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const result=LAST_RESULTS.find(item=>item.id===resultId);
  if(!result) return showToast('ไม่พบข้อมูลผลสอบรายการนี้');
  activeResitResult=result;
  const from=new Date(), until=new Date(from.getTime()+24*60*60*1000);
  document.getElementById('resitStudentSummary').innerHTML=`<b>${escapeHtml(result.studentName)}</b> (${escapeHtml(result.studentId)})<br>${escapeHtml(result.questionTitle)} · ${tr('คะแนนเดิม')} ${Number(result.overallScore20||0).toFixed(2)}/20`;
  document.getElementById('resitStartDate').value=formatExamDate(from.toISOString());
  document.getElementById('resitStartTime').value=formatExamTime(from.toISOString());
  document.getElementById('resitEndDate').value=formatExamDate(until.toISOString());
  document.getElementById('resitEndTime').value=formatExamTime(until.toISOString());
  document.getElementById('resitScoreMax').value='20';
  resitDialogError.textContent='';
  resitDialog.showModal();
}
document.getElementById('closeResitDialog').addEventListener('click',closeResitDialog);
document.getElementById('cancelResitDialog').addEventListener('click',closeResitDialog);
resitForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!activeResitResult) return;
  const availableFrom=parseExamDateTime(document.getElementById('resitStartDate').value,document.getElementById('resitStartTime').value);
  const availableUntil=parseExamDateTime(document.getElementById('resitEndDate').value,document.getElementById('resitEndTime').value);
  const scoreMax=Number(document.getElementById('resitScoreMax').value);
  const tr9 = window.I18N ? window.I18N.t : (s=>s);
  if(!availableFrom||!availableUntil){ resitDialogError.textContent=tr9('กรุณากรอกวันและเวลาให้ถูกต้อง'); return; }
  if(new Date(availableUntil)<=new Date(availableFrom)){ resitDialogError.textContent=tr9('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มสอบ'); return; }
  if(!Number.isFinite(scoreMax)||scoreMax<=0||scoreMax>100){ resitDialogError.textContent=tr9('คะแนนเต็มต้องอยู่ระหว่าง 0.01–100'); return; }
  resitDialogError.textContent=''; approveResitBtn.disabled=true; approveResitBtn.innerHTML='<span class="button-spinner"></span>'+tr9('กำลังอนุมัติ...');
  try{
    await apiOpenResit(activeResitResult.id,{availableFrom,availableUntil,scoreMax});
    closeResitDialog(); showToast('อนุมัติเปิดสอบซ่อมแล้ว'); refreshResults();
  }catch(error){ resitDialogError.textContent=error.message; }
  finally{ approveResitBtn.disabled=false; approveResitBtn.textContent=tr9('อนุมัติเปิดสอบซ่อม'); }
});

let GRADEBOOK_SET_KEYS = new Set();
function resultScoreColumns(records,key){
  const set=ADMIN_SETS.find(item=>item.key===key),dfd=records.some(record=>record.detail?.type==='dfd');
  const snapshots=records.map(record=>record.detail?.gradingSnapshot).filter(Boolean);
  return {mc:dfd||!!set?.sections?.mc?.questions?.length||snapshots.some(item=>item.mc?.questions?.length),matching:dfd||!!set?.sections?.matching?.left?.length||snapshots.some(item=>item.matching?.left?.length),written:dfd||!!set?.sections?.written?.questions?.length||snapshots.some(item=>item.written?.questions?.length)};
}
function resultScoreMax(records,key){
  const visibleMax=records.map(record=>Number(record.detail?.visibleScoreMax)).find(score=>Number.isFinite(score)&&score>0);
  if(Number.isFinite(visibleMax)) return Math.round(visibleMax*100)/100;
  if(records.some(record=>record.detail?.type==='dfd')) return 20;
  const set=ADMIN_SETS.find(item=>item.key===key),setMax=set?computeSetTotal(set):0;
  return setMax>0?setMax:20;
}
const RESULT_EXPANSION_STORAGE_KEY = 'teacherResultsExpansionState';
function loadResultExpansionState(){
  try{
    const saved=JSON.parse(localStorage.getItem(RESULT_EXPANSION_STORAGE_KEY)||'{}');
    return {groups:new Set(Array.isArray(saved.groups)?saved.groups:[]),periods:new Set(Array.isArray(saved.periods)?saved.periods:[])};
  }catch(error){ return {groups:new Set(),periods:new Set()}; }
}
let resultExpansionState=loadResultExpansionState();
function saveResultExpansionState(){
  try{localStorage.setItem(RESULT_EXPANSION_STORAGE_KEY,JSON.stringify({groups:[...resultExpansionState.groups],periods:[...resultExpansionState.periods]}));}catch(error){}
}
function setResultExpansion(type,key,expanded){
  const items=resultExpansionState[type];
  if(expanded) items.add(key); else items.delete(key);
  saveResultExpansionState();
}
function renderResultSubjectGroups(records){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const groups=new Map();
  records.forEach(record=>{
    const key=record.questionKey||record.questionTitle||'unknown';
    if(!groups.has(key)) groups.set(key,{key,title:record.questionTitle||tr('ไม่ระบุรายวิชา'),records:[]});
    groups.get(key).records.push(record);
  });
  return [...groups.values()].map(group=>{const publishedCount=group.records.filter(record=>record.published).length,allPublished=publishedCount===group.records.length,columns=resultScoreColumns(group.records,group.key),scoreMax=resultScoreMax(group.records,group.key),expanded=resultExpansionState.groups.has(group.key);return `<div class="course-group result-subject-group">
    <div class="course-group-head" data-toggleresultgroup="1" data-result-group-key="${escapeAttr(group.key)}"><span class="course-group-title">📚 ${escapeHtml(group.title)}</span><span class="course-group-count">${group.records.length} ${tr('คน')} · ${tr('ประกาศแล้ว')} ${publishedCount} ${tr('คน')} · ${tr('กดเพื่อดูผลสอบ')}</span><span class="course-group-actions"><button class="btn btn-ghost btn-sm publish-set-btn" type="button" data-publish-set="${escapeAttr(group.key)}" data-title="${escapeAttr(group.title)}" ${allPublished?'disabled':''}>${allPublished?tr('✅ ประกาศผลแล้ว'):tr('📣 ประกาศผล')}</button><button class="btn btn-analysis btn-sm" type="button" data-question-analysis="${escapeAttr(group.key)}">${tr('📊 วิเคราะห์ข้อสอบ')}</button>${GRADEBOOK_SET_KEYS.has(group.key)?`<button class="btn btn-primary btn-sm" type="button" data-export-gradebook="${escapeAttr(group.key)}">${tr('📊 Excel รวมคะแนน')}</button>`:''}</span></div>
    <div class="course-group-body ${expanded?'':'collapsed'}" style="overflow-x:auto;"><table class="result-table"><thead><tr>
      <th>${tr('วันเวลา')}</th><th>${tr('รหัส')}</th><th>${tr('ชื่อนักเรียน')}</th><th>${tr('ห้อง')}</th><th>${tr('ประเภท')}</th><th>${tr('รายวิชา')}</th><th>${tr('อาจารย์')}</th>${columns.mc?`<th>${tr('ปรนัย')}</th>`:''}${columns.matching?`<th>${tr('จับคู่')}</th>`:''}${columns.written?`<th>${tr('อัตนัย')}</th>`:''}<th>${tr('รวม')}/${scoreMax}</th><th>${tr('คลิกขวา')}</th><th>${tr('คัดลอก')}</th><th>${tr('สลับแท็บ')}</th><th></th>
    </tr></thead><tbody>${group.records.map(r=>`<tr data-row-id="${r.id}">
      <td>${new Date(r.submittedAt).toLocaleString(window.I18N&&window.I18N.getLang()==='en'?'en-US':'th-TH')}</td><td>${escapeHtml(r.studentId)}</td><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.classRoom)}</td><td>${escapeHtml(r.examType||'-')}</td><td>${escapeHtml(r.questionTitle)}</td><td>${escapeHtml(r.subjectTeacherName||'-')}</td>${columns.mc?`<td>${r.sectionScores.mc}</td>`:''}${columns.matching?`<td>${r.sectionScores.matching}</td>`:''}${columns.written?`<td>${r.sectionScores.written}</td>`:''}<td><b>${r.overallScore20}</b></td><td>${r.rightClickAttempts||0}</td><td>${r.copyAttempts||0}</td><td>${r.tabSwitches||0}</td>
      <td><div class="result-row-actions"><button class="btn btn-ghost btn-sm" data-viewdetail="${r.id}">${tr('ดูรายละเอียด')}</button>${r.attemptType!=='resit'?`<button class="btn btn-ghost btn-sm" data-openresit="${r.id}">${tr('🛠️ เปิดสอบซ่อม')}</button>`:''}<button class="btn btn-danger btn-sm" data-delres="${r.id}">${tr('ลบ')}</button></div></td>
    </tr>`).join('')}</tbody></table></div></div>`;}).join('');
}

function archivedResultPeriod(record){
  const set=ADMIN_SETS.find(item=>item.key===(record.questionKey||'')); if(!set)return null;
  const regular=(set.examSchedules||[]).filter(item=>item&&!item.absenceOnly),dates=(regular.length?regular.map(item=>item.availableFrom):[set.availableFrom]).map(normalizedExamTimestamp).filter(Number.isFinite);
  const olderThanThirtyDays=dates.length&&Date.now()-Math.max(...dates)>=30*86400000;
  if(!set.archived&&!olderThanThirtyDays)return null;
  const semester=String(set.semester||'').toLowerCase(),term=semester==='summer'?'s':(semester||'?'),yearText=String(set.academicYear||''),shortYear=yearText.length>=2?yearText.slice(-2):'?';
  const trp = window.I18N ? window.I18N.t : (s=>s);
  return {key:`${set.examType||record.examType||'ข้อสอบ'}|${term}|${shortYear}`,label:`${trp('ผลสอบ')} ${trp(set.examType||record.examType||'ข้อสอบ')} ${term}/${shortYear}`,sort:`${yearText.padStart(4,'0')}-${term==='s'?'3':term}`};
}
function renderResultGroups(records){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const current=[],periods=new Map();
  records.forEach(record=>{const period=archivedResultPeriod(record);if(!period){current.push(record);return;}if(!periods.has(period.key))periods.set(period.key,{...period,records:[]});periods.get(period.key).records.push(record);});
  const currentHtml=renderResultSubjectGroups(current),periodHtml=[...periods.values()].sort((a,b)=>b.sort.localeCompare(a.sort)).map(period=>{const subjects=new Set(period.records.map(record=>record.questionKey||record.questionTitle)).size,expanded=resultExpansionState.periods.has(period.key);return `<section class="result-period-group"><button class="result-period-head ${expanded?'open':''}" type="button" data-toggle-result-period data-result-period-key="${escapeAttr(period.key)}"><span><b>🗂️ ${escapeHtml(period.label)}</b><small>${subjects} ${tr('รายวิชา')} · ${period.records.length} ${tr('ผลสอบ')}</small></span><span class="result-period-chevron">⌄</span></button><div class="result-period-body ${expanded?'':'collapsed'}">${renderResultSubjectGroups(period.records)}</div></section>`;}).join('');
  return currentHtml+periodHtml;
}
async function refreshResults(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const wrap = document.getElementById('resultsWrap');
  wrap.innerHTML = `<div class="loading-note">${tr('กำลังโหลด...')}</div>`;
  const setKey = document.getElementById('setFilterSelect').value;
  const examType = document.getElementById('examTypeFilterSelect').value;
  const academicYear = document.getElementById('academicYearFilterSelect').value;
  const semester = document.getElementById('semesterFilterSelect').value;
  let records;
  try{ const [resultRows,gradebookOptions]=await Promise.all([apiGetResults(setKey || undefined, examType || undefined, academicYear || undefined, semester || undefined),apiFetch('/api/teacher/gradebook/options',{auth:true})]); records=resultRows; GRADEBOOK_SET_KEYS=new Set(gradebookOptions.setKeys||[]); }
  catch(e){ wrap.innerHTML = '<div class="empty-note">'+escapeHtml(e.message)+'</div>'; return; }
  LAST_RESULTS = records;
  if(!records || !records.length){
    wrap.innerHTML = `<div class="empty-note">${tr('ยังไม่มีผลสอบส่งเข้ามา')}</div>`;
    return;
  }
  wrap.innerHTML = renderResultGroups(records);
  wrap.querySelectorAll('[data-delres]').forEach(b=>b.addEventListener('click', async ()=>{
    const reason=askChangeReason('ลบผลสอบรายการนี้'); if(reason===null) return;
    try{ await apiFetch('/api/teacher/results/'+encodeURIComponent(b.dataset.delres), { method:'DELETE', body:{reason}, auth:true }); refreshResults(); }
    catch(e){ showToast(e.message); }
  }));
  wrap.querySelectorAll('[data-publish-set]').forEach(button=>button.addEventListener('click',async event=>{
    event.stopPropagation();
    if(!confirm(tr('ยืนยันประกาศผลรายวิชา')+` "${button.dataset.title}" `+tr('ให้นักเรียนทุกคนที่ส่งข้อสอบแล้วหรือไม่?')))return;
    button.disabled=true;button.textContent=tr('กำลังตรวจสอบและประกาศผล...');
    try{const result=await apiPublishAllForSet(button.dataset.publishSet);showToast(tr('ประกาศผลแล้ว')+` ${result.count} `+tr('คน'));await refreshResults();}
    catch(error){showToast(error.message);button.disabled=false;button.textContent=tr('📣 ประกาศผล');}
  }));
  wrap.querySelectorAll('[data-openresit]').forEach(b=>b.addEventListener('click', ()=>openResitDialog(b.dataset.openresit)));
  wrap.querySelectorAll('[data-viewdetail]').forEach(b=>b.addEventListener('click', ()=> toggleDetailRow(b.dataset.viewdetail)));
  wrap.querySelectorAll('[data-toggleresultgroup]').forEach(head=>head.addEventListener('click',event=>{if(event.target.closest('button'))return;const body=head.nextElementSibling,expanded=body.classList.contains('collapsed');body.classList.toggle('collapsed');setResultExpansion('groups',head.dataset.resultGroupKey,expanded);}));
  wrap.querySelectorAll('[data-toggle-result-period]').forEach(head=>head.addEventListener('click',()=>{const body=head.nextElementSibling,expanded=body.classList.contains('collapsed');head.classList.toggle('open');body.classList.toggle('collapsed');setResultExpansion('periods',head.dataset.resultPeriodKey,expanded);}));
  wrap.querySelectorAll('[data-question-analysis]').forEach(button=>button.addEventListener('click',event=>{ event.stopPropagation(); showQuestionAnalysis(button.dataset.questionAnalysis); }));
  wrap.querySelectorAll('[data-export-gradebook]').forEach(button=>button.addEventListener('click',event=>{ event.stopPropagation(); downloadGradebook(button.dataset.exportGradebook,button); }));
}
function toggleDetailRow(resultId){
  const tr9 = window.I18N ? window.I18N.t : (s=>s);
  const existing = document.querySelector(`tr.detail-row[data-for="${resultId}"]`);
  if(existing){ existing.remove(); return; }
  const rec = LAST_RESULTS.find(x=>x.id===resultId);
  const set = ADMIN_SETS.find(s=>s.key===rec.questionKey);
  const rowEl = document.querySelector(`tr[data-row-id="${resultId}"]`);
  if(!rowEl) return;
  const tr = document.createElement('tr');
  tr.className = 'detail-row'; tr.dataset.for = resultId;
  const columns=resultScoreColumns([rec],rec.questionKey);
  const td = document.createElement('td'); td.colSpan = 12+Number(columns.mc)+Number(columns.matching)+Number(columns.written);
  if(rec.detail?.type==='dfd'){
    td.innerHTML = renderDfdReview(rec);
    td.querySelector('[data-save-dfd-score]').addEventListener('click', async (event)=>{
      const button=event.currentTarget;
      const scores=[0,1,2].map(level=>Number(td.querySelector(`[data-dfd-score-level="${level}"]`).value));
      if(scores.some(score=>!Number.isFinite(score)||score<0||score>100)){ showToast('แต่ละ Level ต้องมีคะแนน 0–100'); return; }
      const reason=askChangeReason('แก้คะแนน DFD'); if(reason===null) return;
      button.disabled=true; button.textContent=tr9('กำลังบันทึก...');
      try{ await apiUpdateDfdScores(rec.id, scores, reason); showToast('ปรับคะแนน DFD แล้ว ระบบคำนวณรวม /20 ใหม่แล้ว'); refreshResults(); }
      catch(error){ showToast(error.message); button.disabled=false; button.textContent=tr9('บันทึกคะแนนที่ปรับ'); }
    });
  }else if(!set){
    td.innerHTML = renderIntegrityReview(rec) + `<div class="detail-block">${tr9('ไม่พบข้อมูลชุดข้อสอบต้นฉบับ (อาจถูกลบไปแล้ว)')}</div>`;
  }else{
    const answers = (rec.detail && rec.detail.answers) || {mc:{},matching:{},written:{}};
    let html = '';
    const mcQuestions=set.sections?.mc?.questions||[];
    if(mcQuestions.length) html += `<div class="detail-block"><b>${tr9('ปรนัย')} (${rec.sectionScores.mc} ${tr9('คะแนน')})</b><br>` + mcQuestions.map((qq,i)=>{
      const picked = answers.mc ? answers.mc[qq.id] : undefined;
      const pickedText = (picked!=null && qq.choices[picked]!=null) ? qq.choices[picked] : `(${tr9('ไม่ได้ตอบ')})`;
      const correctText = qq.choices[qq.answer];
      const isCorrect = picked===qq.answer;
      return `${i+1}. ${escapeHtml(qq.text)}<br>&nbsp;&nbsp;${tr9('ตอบ')}: ${escapeHtml(pickedText)} ${isCorrect?'✅':'❌ ('+tr9('เฉลย')+': '+escapeHtml(correctText)+')'}`;
    }).join('<br>') + `</div>`;
    const matchingItems=set.sections?.matching?.left||[];
    if(matchingItems.length) html += `<div class="detail-block"><b>${tr9('จับคู่')} (${rec.sectionScores.matching} ${tr9('คะแนน')})</b><br>` + matchingItems.map(item=>{
      const rid = answers.matching ? answers.matching[item.id] : undefined;
      const rightItem = set.sections.matching.right.find(r=>r.id===rid);
      const correctRightItem = set.sections.matching.right.find(r=>r.id===set.sections.matching.correctMap[item.id]);
      const isCorrect = rid === set.sections.matching.correctMap[item.id];
      return `${escapeHtml(item.text)} → ${rightItem?escapeHtml(rightItem.text):`(${tr9('ไม่ได้จับคู่')})`} ${isCorrect?'✅':'❌ ('+tr9('เฉลย')+': '+escapeHtml(correctRightItem?correctRightItem.text:'-')+')'}`;
    }).join('<br>') + `</div>`;
    const writtenQuestions=set.sections?.written?.questions||[];
    if(writtenQuestions.length) html += `<div class="detail-block"><b>${tr9('อัตนัย')} (${rec.sectionScores.written} ${tr9('คะแนน โดยประมาณจากคำสำคัญ')})</b><br>` + writtenQuestions.map((qq,i)=>{
      const text = (answers.written && answers.written[qq.id]) || `(${tr9('ไม่ได้ตอบ')})`;
      const pts = (rec.detail && rec.detail.writtenPerQuestion) ? rec.detail.writtenPerQuestion[qq.id] : '-';
      const manual=rec.detail?.writtenManualScores?.[qq.id];
      return `${i+1}. ${escapeHtml(qq.text)} (auto: ${pts}/${qq.maxPoints})<br>&nbsp;&nbsp;${tr9('คำตอบ')}: ${escapeHtml(text)}<br>&nbsp;&nbsp;${tr9('คะแนนอาจารย์')}: <input class="dfd-score-input" data-written-score="${qq.id}" type="number" min="0" max="${qq.maxPoints}" step="0.5" value="${manual??pts}"> / ${qq.maxPoints}`;
    }).join('<br><br>') + `<div class="editor-actions"><button class="btn btn-primary btn-sm" data-save-written>${tr9('บันทึกคะแนนอัตนัย')}</button></div></div>`;
    td.innerHTML = renderIntegrityReview(rec) + html;
    td.querySelector('[data-save-written]')?.addEventListener('click', async event=>{ const scores={}; td.querySelectorAll('[data-written-score]').forEach(input=>scores[input.dataset.writtenScore]=Number(input.value)); const reason=askChangeReason('แก้คะแนนอัตนัย'); if(reason===null)return; try{ await apiUpdateWrittenScores(rec.id,scores,reason); showToast('บันทึกคะแนนอัตนัยแล้ว'); refreshResults(); }catch(error){ showToast(error.message); } });
  }
  tr.appendChild(td);
  rowEl.after(tr);
}
function renderDfdReview(rec){
  const tr9 = window.I18N ? window.I18N.t : (s=>s);
  const levels=rec.detail?.levels || [];
  const scores=rec.detail?.levelScores || [0,0,0];
  const svgFor=level=>{
    const shapes=Array.isArray(level?.shapes)?level.shapes:[];
    const connections=Array.isArray(level?.connections)?level.connections:[];
    const byId=Object.fromEntries(shapes.map(shape=>[shape.id,shape]));
    const center=shape=>({x:(Number(shape.x)||0)+(Number(shape.w)||140)/2,y:(Number(shape.y)||0)+(Number(shape.h)||70)/2});
    const lines=connections.map(conn=>{ const from=byId[conn.fromId],to=byId[conn.toId]; if(!from||!to) return ''; const a=center(from),b=center(to); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#64748B" stroke-width="2"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-5}" text-anchor="middle" font-size="12" fill="#334155">${escapeHtml(conn.label||'')}</text>`; }).join('');
    const nodes=shapes.map(shape=>{ const x=Number(shape.x)||0,y=Number(shape.y)||0,w=Number(shape.w)||140,h=Number(shape.h)||70,label=escapeHtml(shape.label||shape.num||''); const figure=shape.type==='process'?`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="#DBEAFE" stroke="#2563EB"/>`:`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.type==='store'?0:8}" fill="#FFFFFF" stroke="#2563EB"/>`; return `${figure}<text x="${x+w/2}" y="${y+h/2+4}" text-anchor="middle" font-size="13" fill="#0F172A">${label}</text>`; }).join('');
    return `<svg viewBox="0 0 1000 650" role="img" aria-label="${tr9('แผนภาพ DFD')}">${lines}${nodes}</svg>`;
  };
  return renderIntegrityReview(rec) + `<div class="detail-block"><b>${tr9('🧩 ตรวจงาน Data Flow Diagram')}</b><br>${tr9('คะแนนรวมปัจจุบัน')} <b>${rec.overallScore20}/20</b> (${tr9('Level 0–2 รวม 300 คะแนน แล้วแปลงเป็น 20 คะแนน')})</div><div class="dfd-review-grid">${[0,1,2].map(level=>{const data=levels.find(item=>Number(item.level)===level);const shapes=data?.shapes?.length||0,flows=data?.connections?.length||0;return `<section class="dfd-review-card"><h4>Level ${level}</h4><div class="dfd-review-meta">${tr9('สัญลักษณ์')} ${shapes} · ${tr9('เส้นข้อมูล')} ${flows}</div>${svgFor(data)}<div class="editor-actions"><label>${tr9('คะแนน')} /100 <input class="dfd-score-input" data-dfd-score-level="${level}" type="number" min="0" max="100" step="0.5" value="${Number(scores[level])||0}"></label></div></section>`;}).join('')}</div><div class="editor-actions"><button class="btn btn-primary btn-sm" data-save-dfd-score>${tr9('บันทึกคะแนนที่ปรับ')}</button></div>`;
}
function renderIntegrityReview(rec){
  const tr9 = window.I18N ? window.I18N.t : (s=>s);
  const events=(Array.isArray(rec.integrityEvents)?rec.integrityEvents:[]).filter(event=>event.type!=='session_recovered');
  const labels={tab_switch:tr9('สลับแท็บ/หน้าจอ'),fullscreen_exit:tr9('ออกจากโหมดเต็มจอ'),right_click:tr9('พยายามคลิกขวา'),copy:tr9('พยายามคัดลอก'),reload:tr9('โหลดหน้าใหม่')};
  const counts=`${tr9('สลับแท็บ')} ${rec.tabSwitches||0} · ${tr9('ออกจากเต็มจอ')} ${rec.fullscreenExitAttempts||0} · ${tr9('คลิกขวา')} ${rec.rightClickAttempts||0} · ${tr9('คัดลอก')} ${rec.copyAttempts||0} · ${tr9('โหลดหน้าใหม่')} ${rec.reloadCount||0}`;
  const alert=(rec.tabSwitches||0)+(rec.fullscreenExitAttempts||0)+(rec.rightClickAttempts||0)+(rec.copyAttempts||0)+(rec.reloadCount||0)>0;
  return `<section class="integrity-review ${alert?'':'ok'}"><h4>${alert?tr9('⚠ ประวัติเหตุการณ์ระหว่างสอบ'):tr9('✓ ไม่พบเหตุการณ์ผิดปกติที่ระบบตรวจจับได้')}</h4><div class="integrity-summary">${counts}</div>${events.length?`<ol class="integrity-events">${events.map(event=>`<li>${escapeHtml(labels[event.type]||event.type)} — ${new Date(event.at).toLocaleString(window.I18N&&window.I18N.getLang()==='en'?'en-US':'th-TH')}</li>`).join('')}</ol>`:`<div class="integrity-events">${tr9('ผลสอบเก่านี้ไม่มีบันทึกเวลารายเหตุการณ์')}</div>`}</section>`;
}
document.getElementById('refreshResultsBtn').addEventListener('click', refreshResults);
document.getElementById('setFilterSelect').addEventListener('change', refreshResults);
document.getElementById('examTypeFilterSelect').addEventListener('change', refreshResults);
document.getElementById('academicYearFilterSelect').addEventListener('change', refreshResults);
document.getElementById('semesterFilterSelect').addEventListener('change', refreshResults);
async function showQuestionAnalysis(requestedSetKey){
  const directSetKey=typeof requestedSetKey==='string'?requestedSetKey:'';
  const setKey=directSetKey||document.getElementById('setFilterSelect').value;
  if(directSetKey) document.getElementById('setFilterSelect').value=directSetKey;
  if(!setKey){ showToast('กรุณาเลือกรายวิชาที่ต้องการวิเคราะห์ก่อน'); return; }
  const wrap=document.getElementById('resultsWrap'); wrap.innerHTML='<div class="loading-note">กำลังวิเคราะห์คำตอบรายข้อ...</div>';
  try{
    const data=await apiGetQuestionAnalysis(setKey);
    const reliability=data.reliability===null?'ข้อมูลไม่พอ':data.reliability;
    wrap.innerHTML=`<div class="panel"><div class="toolbar-row"><div><h3>📊 วิเคราะห์ข้อสอบ: ${escapeHtml(data.title)}</h3><p class="panel-sub">ผู้เข้าสอบ ${data.respondents} คน · ข้อปรนัย ${data.questionCount} ข้อ · KR-20: ${reliability}</p></div><div class="editor-actions"><button class="btn btn-ghost btn-sm" id="backToResultsBtn">← กลับผลสอบ</button><button class="btn btn-primary btn-sm" id="exportQuestionAnalysisBtn">⬇ Export ตารางวิเคราะห์</button></div></div><div class="empty-note" style="text-align:left;margin-bottom:14px;">P = สัดส่วนผู้ตอบถูก (ยิ่งสูงยิ่งง่าย) · D = อำนาจจำแนกจากกลุ่มคะแนนสูง/ต่ำ 27% (≥ .20 ใช้ได้) · ควรมีผู้เข้าสอบอย่างน้อย 10 คนเพื่อใช้ตัดสินใจ</div><table class="result-table"><thead><tr><th>ข้อ</th><th>โจทย์ / การเลือกคำตอบ</th><th>ถูก / ผู้ตอบ</th><th>ความยาก (P)</th><th>อำนาจจำแนก (D)</th></tr></thead><tbody>${data.items.map(item=>`<tr><td><b>${item.number}</b></td><td><b>${escapeHtml(item.text)}</b><div style="margin-top:7px;font-size:12px;color:var(--sub);">${item.choices.map((choice,index)=>`<span style="display:inline-block;margin:0 9px 4px 0;${index===item.correctIndex?'color:var(--green);font-weight:700;':''}">${String.fromCharCode(65+index)}. ${escapeHtml(choice)} ${index===item.correctIndex?'✓':''} (${item.choiceCounts[index]||0})</span>`).join('')}</div></td><td>${item.correctCount} / ${item.respondents}</td><td><b>${item.difficulty}</b><br><span class="compact-meta">${item.difficultyLabel}</span></td><td><b>${item.discrimination===null?'-':item.discrimination}</b><br><span class="compact-meta">${item.discriminationLabel}</span></td></tr>`).join('')}</tbody></table></div>`;
    document.getElementById('exportQuestionAnalysisBtn').insertAdjacentHTML('afterend','<button class="btn btn-primary btn-sm" id="exportQuestionAnalysisDocxBtn">📝 แบบฟอร์ม Word</button>');
    document.getElementById('backToResultsBtn').addEventListener('click',refreshResults);
    document.getElementById('exportQuestionAnalysisBtn').addEventListener('click',()=>downloadQuestionAnalysis(setKey));
    document.getElementById('exportQuestionAnalysisDocxBtn').addEventListener('click',()=>downloadQuestionAnalysisDocx(setKey,true));
  }catch(error){ wrap.innerHTML='<div class="empty-note">'+escapeHtml(error.message)+'</div>'; }
}
async function showAuditLogs(){
  const setKey=document.getElementById('setFilterSelect').value;
  const wrap=document.getElementById('resultsWrap'); wrap.innerHTML='<div class="loading-note">กำลังโหลดประวัติการแก้ไข...</div>';
  try{
    const rows=await apiGetAuditLogs(setKey);
    const labels={result_updated:'แก้ไขผลสอบ',result_deleted:'ลบผลสอบ',set_results_published:'ประกาศผลทั้งวิชา'};
    wrap.innerHTML=`<div class="panel"><div class="toolbar-row"><div><h3>🕘 ประวัติการแก้ไขคะแนน</h3><p class="panel-sub">${setKey?'แสดงเฉพาะวิชาที่เลือก':'แสดงประวัติล่าสุดทั้งหมด'} · สูงสุด 500 รายการ</p></div><button class="btn btn-ghost btn-sm" id="backToResultsBtn">← กลับผลสอบ</button></div>${rows.length?`<table class="result-table"><thead><tr><th>วันเวลา</th><th>ผู้กระทำ</th><th>การดำเนินการ</th><th>นักเรียน / รายการ</th><th>ก่อน → หลัง</th><th>เหตุผล</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${new Date(row.eventAt).toLocaleString('th-TH')}</td><td>${row.actorType==='teacher'?`ครู ${escapeHtml(row.actorId||'-')}`:'ผู้ดูแลระบบ'}</td><td><b>${escapeHtml(labels[row.action]||row.action)}</b></td><td>${escapeHtml(row.before?.studentId||row.targetId||'-')}</td><td>${row.action==='result_updated'?`${escapeHtml(row.before?.overallScore??'-')} → <b>${escapeHtml(row.after?.overallScore??'-')}</b>`:'-'}</td><td>${escapeHtml(row.reason||'-')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-note">ยังไม่มีประวัติการแก้ไขคะแนน</div>'}</div>`;
    document.getElementById('backToResultsBtn').addEventListener('click',refreshResults);
  }catch(error){wrap.innerHTML='<div class="empty-note">'+escapeHtml(error.message)+'</div>';}
}
async function downloadGradebook(setKey,button){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const original=button.textContent; button.disabled=true; button.textContent=tr('กำลังสร้างไฟล์...');
  try{
    const res=await fetch('/api/teacher/export/gradebook.xlsx?setKey='+encodeURIComponent(setKey),{headers:{'x-teacher-token':teacherToken||''}});
    const errorBody=res.ok?null:await res.json().catch(()=>({})); if(res.status===401){showSessionExpiredDialog();throw new Error(tr('หมดเวลาการเข้าสู่ระบบ'));} if(!res.ok)throw new Error(errorBody?.message||tr('ส่งออกไฟล์รวมคะแนนไม่สำเร็จ'));
    const set=ADMIN_SETS.find(item=>item.key===setKey),courseName=String(set?.courseName||set?.title||'รายวิชา').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim()||'รายวิชา';
    const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=`รวมคะแนนวิชา(${courseName}).xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลด Excel รวมคะแนนแล้ว');
  }catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent=original;}
}
async function downloadExamPdf(setKey,button){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const original=button?.textContent||'📄 PDF ต้นฉบับ';
  if(button){button.disabled=true;button.textContent=tr('กำลังสร้าง PDF...');}
  try{
    const res=await fetch('/api/teacher/export/exam.pdf?setKey='+encodeURIComponent(setKey),{headers:{'x-teacher-token':teacherToken||''}});
    if(res.status===401){showSessionExpiredDialog();throw new Error(tr('หมดเวลาการเข้าสู่ระบบ'));}
    if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(body.message||tr('สร้าง PDF ไม่สำเร็จ'));}
    const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    const disposition=res.headers.get('content-disposition')||'';
    const encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename=encodedName ? decodeURIComponent(encodedName) : disposition.match(/filename="?([^";]+)"?/i)?.[1]||'ต้นฉบับข้อสอบ.pdf';
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลดต้นฉบับข้อสอบ PDF แล้ว');
  }catch(error){showToast(error.message);}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function downloadQuestionAnalysisDocx(setKey,isTeacher){
  const button=document.getElementById('exportQuestionAnalysisDocxBtn'),original=button?.textContent||'📝 แบบฟอร์ม Word';
  if(button){button.disabled=true;button.textContent='กำลังสร้าง Word...';}
  try{const prefix=isTeacher?'/api/teacher':'/api',headers=isTeacher?{'x-teacher-token':teacherToken||''}:{'x-admin-key':adminKey||''},res=await fetch(prefix+'/export/question-analysis.docx?setKey='+encodeURIComponent(setKey),{headers});if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error('สร้างแบบฟอร์มวิเคราะห์ข้อสอบไม่สำเร็จ');const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'),disposition=res.headers.get('content-disposition')||'',encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];a.href=url;a.download=encodedName?decodeURIComponent(encodedName):'แบบฟอร์มวิเคราะห์ข้อสอบ.docx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลดแบบฟอร์มวิเคราะห์ข้อสอบ Word แล้ว');}catch(error){showToast(error.message);}finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function downloadQuestionAnalysis(setKey){
  const button=document.getElementById('exportQuestionAnalysisBtn'); if(button){button.disabled=true;button.textContent='กำลังสร้างไฟล์...';}
  try{const res=await fetch('/api/teacher/export/question-analysis.xlsx?setKey='+encodeURIComponent(setKey),{headers:{'x-teacher-token':teacherToken||''}});if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error('ส่งออกตารางวิเคราะห์ไม่สำเร็จ');const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ตารางวิเคราะห์ข้อสอบ.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลดตารางวิเคราะห์ข้อสอบแล้ว');}catch(error){showToast(error.message);}finally{if(button){button.disabled=false;button.textContent='⬇ Export ตารางวิเคราะห์';}}
}
document.getElementById('exportExcelBtn').addEventListener('click', async ()=>{
  const setKey = document.getElementById('setFilterSelect').value;
  const examType = document.getElementById('examTypeFilterSelect').value;
  const btn = document.getElementById('exportExcelBtn');
  btn.disabled = true; btn.textContent = 'กำลังสร้างไฟล์...';
  try{
    const qs = [];
    if(setKey) qs.push('setKey='+encodeURIComponent(setKey));
    if(examType) qs.push('examType='+encodeURIComponent(examType));
    const url = '/api/teacher/export/results.xlsx' + (qs.length?('?'+qs.join('&')):'');
    const res = await fetch(url, { headers: { 'x-teacher-token': teacherToken || '' } });
    if(res.status===401){ showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ'); }
    if(!res.ok){ throw new Error('ส่งออก Excel ไม่สำเร็จ (HTTP '+res.status+')'); }
    const blob = await res.blob();
    const a = document.createElement('a');
    const dlUrl = URL.createObjectURL(blob);
    a.href = dlUrl;
    a.download = (setKey||examType) ? 'ผลสอบ.xlsx' : 'ผลสอบทั้งหมด.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(dlUrl);
    showToast('ดาวน์โหลดไฟล์ Excel แล้ว');
  }catch(e){ showToast(e.message); }
  btn.disabled = false; btn.textContent = '⬇ ส่งออก Excel';
});

/* ============ PRINTABLE EXAM ROSTER ============ */
let selectedRosterClasses=[];
function renderSelectedRosterClasses(){
  const host=document.getElementById('rosterSelectedClasses'); if(!host) return;
  host.innerHTML=selectedRosterClasses.map(room=>`<span class="roster-room-chip">${escapeHtml(room)}<button type="button" data-remove-roster-room="${escapeAttr(room)}" aria-label="ลบห้อง ${escapeAttr(room)}">×</button></span>`).join('');
  document.getElementById('printRosterBtn').disabled=!selectedRosterClasses.length;
  host.querySelectorAll('[data-remove-roster-room]').forEach(button=>button.addEventListener('click',()=>{selectedRosterClasses=selectedRosterClasses.filter(room=>room!==button.dataset.removeRosterRoom);renderSelectedRosterClasses();updateRosterClassOptions(false);}));
}
function populateRosterSetOptions(){
  const select=document.getElementById('rosterSetSelect'); if(!select) return;
  const previous=select.value;
  const sets=ADMIN_SETS.filter(set=>!set.archived&&!set.deletedAt);
  select.innerHTML='<option value="">เลือกชุดข้อสอบ</option>'+sets.map(set=>`<option value="${escapeAttr(set.key)}">${escapeHtml(set.courseName||set.title)} — ${escapeHtml(set.examType||'ข้อสอบ')}</option>`).join('');
  if(sets.some(set=>set.key===previous)) select.value=previous;
  updateRosterClassOptions();
}
async function updateRosterClassOptions(reset=true){
  const set=ADMIN_SETS.find(item=>item.key===document.getElementById('rosterSetSelect')?.value);
  const select=document.getElementById('rosterClassSelect'); if(!select) return;
  if(reset){selectedRosterClasses=[];renderSelectedRosterClasses();}
  select.disabled=true;
  if(!set){select.innerHTML='<option value="">เลือกห้อง</option>';document.getElementById('addRosterClassBtn').disabled=true;return;}
  let source=set.assignedClasses||[];
  if(!source.length){try{source=await apiGetClasses();}catch(error){showToast(error.message);source=[];}}
  const classes=[...new Set(source)].sort((a,b)=>String(a).localeCompare(String(b),'th',{numeric:true}));
  select.innerHTML='<option value="">เลือกห้อง</option>'+classes.filter(room=>!selectedRosterClasses.includes(room)).map(room=>`<option value="${escapeAttr(room)}">${escapeHtml(room)}</option>`).join('');
  select.disabled=!classes.length;
  document.getElementById('addRosterClassBtn').disabled=true;
}
function initRosterTab(){
  populateRosterSetOptions();
  const link=document.getElementById('rosterExamLinkInput'); if(link&&!link.value) link.value=location.origin+'/';
}
function thaiRosterDate(value){
  if(!value) return 'ไม่กำหนดวันสอบ';
  const date=normalizedExamDate(value); if(Number.isNaN(date.getTime())) return 'ไม่กำหนดวันสอบ';
  return new Intl.DateTimeFormat('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
}
function rosterTime(value){
  if(!value) return '-';
  const date=new Date(value); if(Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(':','.');
}
function compactRosterRoomNames(rooms){
  const groups=new Map(),result=[];
  rooms.forEach(room=>{const text=String(room||''),match=text.match(/^([^.]+)\.(.+)$/);if(!match){result.push(text);return;}const [,prefix,suffix]=match;if(!groups.has(suffix))groups.set(suffix,[]);groups.get(suffix).push(prefix);});
  groups.forEach((prefixes,suffix)=>result.push(`${prefixes.join('.')}.${suffix}`));
  return result.join(', ');
}
function buildRosterPrintHtml(rosters,options){
  const list=Array.isArray(rosters)?rosters:[rosters],first=list[0]||{},exam=first.exam||{},totalRows=list.reduce((sum,data)=>sum+(data.students||[]).length,0),units=totalRows+(list.length*9)+8,scale=Math.max(.55,Math.min(1,44/Math.max(1,units))),documentHeight=274/scale;
  const sections=list.map(data=>{const students=data.students||[],blankRows=list.length===1?Math.max(5,18-students.length):1,rows=students.map(student=>{const studentId=String(student.studentId||'');return `<tr><td>${student.number}</td><td class="student-id${studentId.length>8?' student-id-long':''}">${escapeHtml(studentId)}</td><td class="student-name">${escapeHtml(`${student.firstName||''} ${student.lastName||''}`.trim())}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;}).join('')+Array.from({length:blankRows},()=>'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join(''),period=data.examPeriod?`รอบ ${data.examPeriod}`:'';return `<section class="roster-block"><header class="header"><div class="school"><img class="school-logo" src="/assets/college-logo.jpg" alt="ตราวิทยาลัย"><div><h1>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1><p>18 ซอย จรัญสนิทวงศ์ 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กรุงเทพมหานคร 10700</p><p class="class-line">${escapeHtml(data.educationLevel||'-')} ${escapeHtml(data.classRoom)} &nbsp; ${escapeHtml(period)}</p></div></div><div class="exam-head"><h2>ห้องสอบที่ ${escapeHtml(options.examRoom||'-')}</h2><strong>ใบรายชื่อสอบ${escapeHtml(data.exam?.examType||'')}</strong><p>ปีการศึกษา ${escapeHtml(data.exam?.academicYear||'-')}</p><p>สาขาวิชา ${escapeHtml(data.program||'-')}</p></div></header><table><thead><tr><th>เลขที่</th><th>รหัสนักศึกษา</th><th>ชื่อ - นามสกุล</th><th>เก็บ</th><th>กลาง</th><th>ปลาย</th><th>รวม</th><th>เกรด</th><th>ลายเซ็น</th></tr></thead><tbody>${rows}</tbody></table></section>`;}).join('');
  const scheduleGroups=new Map();list.forEach(data=>{const item=data.exam||{},key=`${item.availableFrom||''}|${item.availableUntil||''}|${options.examRoom||''}`;if(!scheduleGroups.has(key))scheduleGroups.set(key,{exam:item,rooms:[]});scheduleGroups.get(key).rooms.push(data.classRoom);});
  const scheduleLines=[...scheduleGroups.values()].map(group=>{const item=group.exam,time=(item.availableFrom||item.availableUntil)?`${rosterTime(item.availableFrom)} - ${rosterTime(item.availableUntil)}`:'ไม่กำหนดเวลา',roomLabel=list.length>1?compactRosterRoomNames(group.rooms):'';return `<p><span class="label">วันสอบ ${escapeHtml(roomLabel)}</span> ${escapeHtml(thaiRosterDate(item.availableFrom))} &nbsp; เวลา ${escapeHtml(time)} &nbsp; ห้องสอบ ${escapeHtml(options.examRoom||'-')}</p>`;}).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายชื่อสอบ ${escapeHtml(list.map(data=>data.classRoom).join(', '))}</title><style>
  @font-face{font-family:"THSarabunPSK";src:url("/assets/fonts/th-sarabun/THSarabunNew-webfont.woff") format("woff");font-style:normal;font-weight:400;font-display:block}@font-face{font-family:"THSarabunPSK";src:url("/assets/fonts/th-sarabun/THSarabunNew_bold-webfont.woff") format("woff");font-style:normal;font-weight:700;font-display:block}@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{font-family:"THSarabunPSK","TH Sarabun New",Tahoma,sans-serif;color:#111;margin:0;font-size:17px}.print-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;font-family:Tahoma,sans-serif;font-size:14px}.print-tools button{font:inherit;padding:7px 16px;border:0;border-radius:7px;background:#1d4ed8;color:#fff;cursor:pointer;white-space:nowrap}.document{display:flex;flex-direction:column;min-height:${documentHeight.toFixed(2)}mm;zoom:${scale.toFixed(3)}}.roster-block+.roster-block{margin-top:20px}.header{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:14px;align-items:end;margin-bottom:8px}.school{display:flex;align-items:center;gap:13px}.school-logo{width:88px;height:88px;object-fit:contain;flex:0 0 auto;filter:grayscale(1) contrast(1.25)}.school h1{font-size:14px;line-height:1.2;margin:0 0 3px}.school p{font-size:14px;line-height:1.2;margin:1px 0}.class-line{font-size:14px;line-height:1.2;font-weight:800;color:#111;margin-top:4px!important}.exam-head{text-align:center;font-size:16px;line-height:1.12}.exam-head p{font-size:16px;line-height:1.12;margin:1px 0}.exam-head h2{font-size:16px;line-height:1.12;text-decoration:underline;color:#111;margin:0 0 5px;font-weight:800}.exam-head strong{font-size:16px;line-height:1.12}.exam-head strong+p{font-size:16px;line-height:1.12;font-weight:800;margin:2px 0}.exam-head p:last-child{font-size:16px;line-height:1.12;font-weight:700;white-space:nowrap}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}th,td{border:1px solid #111;padding:3px 4px;height:26px;text-align:center;vertical-align:middle;line-height:1.08;overflow:hidden}th{font-size:14px;font-weight:800;padding-top:5px;padding-bottom:5px;line-height:1.15}th:nth-child(1){width:7%}th:nth-child(2){width:14%}th:nth-child(3){width:36%}th:nth-child(4),th:nth-child(5),th:nth-child(6),th:nth-child(7),th:nth-child(8){width:6%}th:nth-child(9){width:13%}.student-id{white-space:nowrap;font-variant-numeric:tabular-nums}.student-id-long{font-size:14px;letter-spacing:-.2px}.student-name{text-align:left;padding-left:8px;white-space:nowrap;text-overflow:ellipsis}.details{margin-top:auto;padding-top:14px;font-size:16px;line-height:1.2;font-weight:500}.details p{margin:1px 0}.label{color:#111;font-weight:800}.exam-link{color:#111;text-decoration:none;overflow-wrap:anywhere}@media print{body{padding:11mm}.print-tools{display:none}}
  .school h1,.class-line{font-size:16px;line-height:1.35}.school p:not(.class-line){font-size:12px;line-height:1.35}.exam-head,.exam-head h2,.exam-head strong,.exam-head p,.exam-head strong+p,.exam-head p:last-child{line-height:1.3}.details{line-height:1.4}.details p{margin:2px 0}table,th,.student-id-long{font-size:12px}
  </style></head><body onload="Promise.resolve(document.fonts&&document.fonts.ready).then(function(){setTimeout(function(){window.focus();window.print()},100)})"><div class="print-tools"><span>หากหน้าต่างพิมพ์ไม่เปิดอัตโนมัติ ให้กดปุ่มนี้ หรือกด Ctrl+P</span><button type="button" onclick="window.focus();window.print()">เปิดหน้าพิมพ์</button></div><main class="document">${sections}<section class="details">${scheduleLines}<p><span class="label">อาจารย์ผู้สอน</span> ${escapeHtml(exam.teacherName||'-')}</p><p><span class="label">รายวิชา</span> ${escapeHtml(exam.courseName||exam.title||'-')}</p><p><span class="label">ลิงก์สอบ</span> <span class="exam-link">${escapeHtml(options.examLink||exam.examLink||'-')}</span></p></section></main></body></html>`;
}
document.getElementById('rosterSetSelect').addEventListener('change',updateRosterClassOptions);
document.getElementById('rosterClassSelect').addEventListener('change',event=>{document.getElementById('addRosterClassBtn').disabled=!event.target.value;});
document.getElementById('addRosterClassBtn').addEventListener('click',()=>{const select=document.getElementById('rosterClassSelect'),room=select.value;if(!room||selectedRosterClasses.includes(room))return;selectedRosterClasses.push(room);renderSelectedRosterClasses();updateRosterClassOptions(false);});
document.getElementById('printRosterBtn').addEventListener('click',async()=>{
  const setKey=document.getElementById('rosterSetSelect').value;
  if(!setKey||!selectedRosterClasses.length){showToast('กรุณาเลือกชุดข้อสอบและเพิ่มห้องอย่างน้อย 1 ห้อง');return;}
  const popup=window.open('','_blank'); if(!popup){showToast('เบราว์เซอร์บล็อกหน้าต่างตัวอย่าง กรุณาอนุญาต pop-up');return;}
  popup.document.write('<p style="font-family:sans-serif;padding:24px">กำลังจัดทำใบรายชื่อ...</p>');
  const options={examRoom:document.getElementById('rosterExamRoomInput').value.trim(),examLink:document.getElementById('rosterExamLinkInput').value.trim()};
  try{const data=await Promise.all(selectedRosterClasses.map(classRoom=>apiGetExamRoster(setKey,classRoom)));popup.document.open();popup.document.write(buildRosterPrintHtml(data,options));popup.document.close();const fontsReady=popup.document.fonts?.ready||Promise.resolve();await fontsReady;const printNow=()=>{if(popup.closed)return;popup.focus();popup.print();};popup.document.querySelector('.print-tools button')?.addEventListener('click',printNow);setTimeout(printNow,150);}
  catch(error){popup.close();showToast(error.message);}
});
document.getElementById('absenceSummaryBtn').addEventListener('click',async()=>{
  const setKey=document.getElementById('rosterSetSelect').value,wrap=document.getElementById('absenceSummaryWrap');
  if(!setKey||!selectedRosterClasses.length){showToast('กรุณาเลือกชุดข้อสอบและเพิ่มห้องอย่างน้อย 1 ห้อง');return;}
  wrap.innerHTML='<div class="loading-note">กำลังสรุปรายชื่อ...</div>';wrap.classList.remove('hidden');
  try{const data=await apiGetAbsenceSummary(setKey,selectedRosterClasses),labels={submitted:'ส่งแล้ว',in_progress:'กำลังสอบ',absent:'ขาดสอบ',pending:'ยังไม่ถึงเวลาสรุป'},order=['absent','in_progress','pending','submitted'];wrap.innerHTML=`<div class="absence-head"><div><h3>สรุปผู้ขาดสอบ</h3><p>${escapeHtml(data.title)} · ${data.total} คน</p></div><button type="button" class="btn btn-ghost btn-sm" id="closeAbsenceSummary">✕ ปิด</button></div><div class="absence-stats"><div><b>${data.total}</b><span>ผู้มีสิทธิ์</span></div><div class="ok"><b>${data.counts.submitted}</b><span>ส่งแล้ว</span></div><div class="live"><b>${data.counts.in_progress}</b><span>กำลังสอบ</span></div><div class="danger"><b>${data.counts.absent}</b><span>ขาดสอบ</span></div></div><div class="absence-list">${order.flatMap(status=>data.students.filter(student=>student.status===status).map(student=>`<div class="absence-row status-${status}"><span class="absence-status">${labels[status]}</span><b>${escapeHtml(student.studentId)}</b><span>${escapeHtml(`${student.firstName} ${student.lastName}`)}</span><em>${escapeHtml(student.classRoom)}${student.additionalAccess?' · สิทธิ์รายคน':''}</em></div>`)).join('')}</div>`;document.getElementById('closeAbsenceSummary').addEventListener('click',()=>wrap.classList.add('hidden'));}
  catch(error){wrap.innerHTML='';wrap.classList.add('hidden');showToast(error.message);}
});

document.addEventListener('i18nchange', ()=>{
  if(!adminScreen.classList.contains('hidden')) refreshCurrentPageData();
  if(editingSet && !document.getElementById('setWizardScreen').classList.contains('hidden')){
    const tr9 = window.I18N ? window.I18N.t : (s=>s);
    document.getElementById('wizardTitleBar').textContent = editingIsNew ? tr9('🧩 สร้างชุดข้อสอบใหม่') : (tr9('🧩 แก้ไขชุดข้อสอบ')+': ' + (editingSet.title||''));
    renderWizard();
  }
});

})();
