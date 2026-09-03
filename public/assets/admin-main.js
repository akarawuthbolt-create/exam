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
const ADMIN_SESSION_STORAGE_KEY = 'examAdminSessionKey';
let adminKey = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || null;
async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({'Content-Type':'application/json'}, options.headers||{});
  if(options.admin) headers['x-admin-key'] = adminKey || '';
  let res;
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 30000);
  try{
    res = await fetch(API_BASE + path, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal });
  }catch(e){
    if(e.name === 'AbortError') throw new Error('เซิร์ฟเวอร์ตอบกลับช้าเกิน 30 วินาที กรุณาลองบันทึกอีกครั้ง');
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ backend ไม่สำเร็จ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงานอยู่');
  }finally{ clearTimeout(timeoutId); }
  if(res.status===401){ if(options.admin) showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง'); }
  if(!res.ok){
    let msg = 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (HTTP '+res.status+')';
    try{ const j = await res.json(); if(j && j.message) msg = j.message; }catch(e){}
    throw new Error(msg);
  }
  if(res.status===204) return null;
  return res.json();
}
async function apiVerifyAdmin(key){
  const res = await fetch(API_BASE+'/api/admin/verify', {method:'POST', headers:{'x-admin-key':key}});
  if(res.ok) return true;
  const body = await res.json().catch(()=>({}));
  throw new Error(body.message || 'รหัสผู้ดูแลระบบไม่ถูกต้อง');
}
async function apiGetAdminSets(){ return apiFetch('/api/admin/sets', { admin:true }); }
async function apiGetAcademicCalendar(){ return apiFetch('/api/admin/academic-calendar', { admin:true }); }
async function apiSaveAcademicCalendar(academicCalendar, adminPassword){ return apiFetch('/api/admin/academic-calendar', { method:'PUT', body:{academicCalendar,adminPassword}, admin:true }); }
async function apiGetExamAccess(){ return apiFetch('/api/system/exam-access'); }
async function apiSetExamAccess(closed, message){ return apiFetch('/api/admin/system/exam-access', { method:'PUT', body:{closed,message}, admin:true }); }
async function apiGetEnrollmentYears(){ return apiFetch('/api/admin/enrollment-years', { admin:true }); }
async function apiGetEnrollmentRooms(academicYear){ return apiFetch('/api/admin/enrollment-rooms?academicYear='+encodeURIComponent(academicYear), { admin:true }); }
async function apiPreviewPromotion(body){ return apiFetch('/api/admin/student-promotion/preview', { method:'POST', body, admin:true }); }
async function apiPromoteStudents(body){ return apiFetch('/api/admin/student-promotion', { method:'POST', body, admin:true }); }
async function apiUploadQuestionAsset(file){
  const response=await fetch('/api/admin/assets',{method:'POST',headers:{'x-admin-key':adminKey||'','Content-Type':file.type,'x-file-name':encodeURIComponent(file.name)},body:file});
  if(response.status===401){ showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ'); }
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.message||'อัปโหลดไฟล์ไม่สำเร็จ');
  return body;
}
async function apiStartGoogleForms(){ return apiFetch('/api/admin/google-forms/start', { method:'POST', admin:true }); }
async function apiPreviewGoogleForm(connectionId, formUrl){ return apiFetch('/api/admin/google-forms/preview', { method:'POST', body:{formUrl}, headers:{'x-google-forms-connection':connectionId}, admin:true }); }
async function apiListGoogleForms(){ return apiFetch('/api/admin/google-forms/list', { headers:{'x-google-forms-connection':googleFormsConnectionId}, admin:true }); }
async function apiImportGoogleForm(connectionId, formUrl){ return apiFetch('/api/admin/google-forms/import', { method:'POST', body:{formUrl}, headers:{'x-google-forms-connection':connectionId}, admin:true }); }
async function apiPreviewQuestionFile(file){
  const response=await fetch('/api/admin/question-file/preview',{method:'POST',headers:{'x-admin-key':adminKey||'','Content-Type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name)},body:file});
  const body=await response.json().catch(()=>({}));if(response.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!response.ok)throw new Error(body.message||'ไม่สามารถอ่านข้อสอบจากไฟล์นี้ได้');return body;
}
async function apiGoogleFormsStatus(requestId=''){ return apiFetch('/api/admin/google-forms/status?requestId='+encodeURIComponent(requestId), { admin:true }); }
async function apiCreateSet(set){ return apiFetch('/api/sets', { method:'POST', body:set, admin:true }); }
async function apiUpdateSet(key, set){ return apiFetch('/api/sets/'+encodeURIComponent(key), { method:'PUT', body:set, admin:true }); }
async function apiQuickOpenSet(key, open){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/quick-open', { method:'POST', body:{open}, admin:true }); }
async function apiCreateTestLink(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/test-link', { method:'POST', admin:true }); }
async function apiOpenAbsentees(key,hours){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/open-absentees', { method:'POST', body:{hours}, admin:true }); }
async function apiDuplicateSetCall(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/duplicate', { method:'POST', admin:true }); }
async function apiArchiveSetCall(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/archive', { method:'POST', admin:true }); }
async function apiRestoreSetCall(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/restore', { method:'POST', admin:true }); }
async function apiDeleteSetCall(key){ return apiFetch('/api/sets/'+encodeURIComponent(key), { method:'DELETE', admin:true }); }
async function apiPermanentlyDeleteSet(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/permanent', { method:'DELETE', admin:true }); }
async function apiGetResults(setKey, examType, academicYear, semester){
  const qs = [];
  if(setKey) qs.push('setKey='+encodeURIComponent(setKey));
  if(examType) qs.push('examType='+encodeURIComponent(examType));
  if(academicYear) qs.push('academicYear='+encodeURIComponent(academicYear));
  if(semester) qs.push('semester='+encodeURIComponent(semester));
  return apiFetch('/api/results'+(qs.length?('?'+qs.join('&')):''), { admin:true });
}
async function apiGetQuestionAnalysis(setKey){ return apiFetch('/api/question-analysis?setKey='+encodeURIComponent(setKey), { admin:true }); }
async function apiGetAuditLogs(setKey){ return apiFetch('/api/audit-logs'+(setKey?('?setKey='+encodeURIComponent(setKey)):''), { admin:true }); }
async function apiGetOperations(){ return apiFetch('/api/admin/operations', { admin:true }); }
async function apiGetExamPulse(){ return apiFetch('/api/admin/exam-pulse', { admin:true }); }
async function apiRescueExamDraft(key,reason){ return apiFetch('/api/admin/exam-pulse/'+encodeURIComponent(key)+'/rescue', { method:'POST', body:{reason}, admin:true }); }
async function apiDeleteExamPulseDraft(key,reason){ return apiFetch('/api/admin/exam-pulse/'+encodeURIComponent(key), { method:'DELETE', body:{reason}, admin:true }); }
async function apiGetScoreVerificationIssues(){ return apiFetch('/api/admin/operations/score-verification', { admin:true }); }
async function apiRunRestoreDrill(){ return apiFetch('/api/admin/operations/restore-drill', { method:'POST', admin:true }); }
async function apiGetStudents(classRoom){ return apiFetch('/api/students'+(classRoom?('?classRoom='+encodeURIComponent(classRoom)):''), { admin:true }); }
async function apiAddStudent(s){ return apiFetch('/api/students', { method:'POST', body:s, admin:true }); }
async function apiBulkImportStudents(text){ return apiFetch('/api/students/bulk', { method:'POST', body:{text}, admin:true }); }
async function apiImportStudentsExcel(file){
  const res = await fetch('/api/students/import-xlsx', { method:'POST', headers:{'x-admin-key':adminKey || '', 'Content-Type':file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}, body:file });
  const body = await res.json().catch(()=>({})); if(res.status===401){ showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ'); } if(!res.ok) throw new Error(body.message || 'นำเข้า Excel ไม่สำเร็จ'); return body;
}
async function apiRestoreSystemBackup(file){
  const res=await fetch('/api/admin/restore.json',{method:'POST',headers:{'x-admin-key':adminKey||'','x-restore-confirm':'RESTORE','Content-Type':'application/x-exam-backup+json'},body:file});
  const body=await res.json().catch(()=>({}));if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error(body.message||'กู้คืนข้อมูลไม่สำเร็จ');return body;
}
async function apiDeleteStudent(id){ return apiFetch('/api/students/'+encodeURIComponent(id), { method:'DELETE', admin:true }); }
async function apiUpdateStudent(id, body){ return apiFetch('/api/students/'+encodeURIComponent(id), { method:'PUT', body, admin:true }); }
async function apiSetClassExamPeriod(classRoom, examPeriod){ return apiFetch('/api/classes/'+encodeURIComponent(classRoom)+'/exam-period', { method:'POST', body:{examPeriod}, admin:true }); }
async function apiResetStudentPin(id){ return apiFetch('/api/students/'+encodeURIComponent(id)+'/reset-pin', { method:'POST', admin:true }); }
async function apiGetClasses(period){ return apiFetch('/api/classes'+(period?('?period='+encodeURIComponent(period)):''), { admin:true }); }
async function apiGetExamTypes(){ return apiFetch('/api/exam-types'); }
async function apiSetPublished(id, published){ return apiFetch('/api/results/'+encodeURIComponent(id), { method:'PATCH', body:{published}, admin:true }); }
async function apiUpdateDfdScores(id, dfdLevelScores, reason){ return apiFetch('/api/results/'+encodeURIComponent(id), { method:'PATCH', body:{dfdLevelScores,reason}, admin:true }); }
async function apiUpdateWrittenScores(id, writtenManualScores, reason){ return apiFetch('/api/results/'+encodeURIComponent(id), { method:'PATCH', body:{writtenManualScores,reason}, admin:true }); }
async function apiPublishAllForSet(key){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/publish', { method:'POST', admin:true }); }
async function apiGetTeachers(){ return apiFetch('/api/teachers', { admin:true }); }
async function apiAddTeacher(t){ return apiFetch('/api/teachers', { method:'POST', body:t, admin:true }); }
async function apiImportTeachersExcel(file){
  const res=await fetch('/api/teachers/import-xlsx',{method:'POST',headers:{'x-admin-key':adminKey||'','Content-Type':file.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});
  const body=await res.json().catch(()=>({}));if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error(body.message||'นำเข้าบัญชีอาจารย์ไม่สำเร็จ');return body;
}
async function apiDeleteTeacher(id){ return apiFetch('/api/teachers/'+encodeURIComponent(id), { method:'DELETE', admin:true }); }
async function apiResetTeacherPassword(id,password){ return apiFetch('/api/teachers/'+encodeURIComponent(id)+'/password', { method:'PATCH', body:{password}, admin:true }); }
async function apiResetTeacherLoginLockouts(){ return apiFetch('/api/teacher/login-lockouts/reset', { method:'POST', admin:true }); }
async function apiUpdateTeacherProfile(id,department,email){ return apiFetch('/api/teachers/'+encodeURIComponent(id)+'/profile', { method:'PATCH', body:{department,email}, admin:true }); }
async function apiGetScoreEmailStatus(){ return apiFetch('/api/admin/score-emails/status', { admin:true }); }
async function apiSendScoreEmail(teacherId){ return apiFetch('/api/admin/score-emails/'+encodeURIComponent(teacherId)+'/send', { method:'POST', admin:true }); }

function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function escapeHtml(str){ return String(str==null?'':str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(str){ return escapeHtml(str).replace(/\n/g,' '); }
function showToast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2800);
}
async function downloadAdminAsset(path, fallbackName){
  const response=await fetch(path,{headers:{'x-admin-key':adminKey||''}});
  if(response.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');}
  if(!response.ok){let message='ดาวน์โหลดไฟล์ไม่สำเร็จ';try{const body=await response.json();message=body.message||message;}catch(error){}throw new Error(message);}
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a'),disposition=response.headers.get('content-disposition')||'',encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  link.href=url;link.download=encodedName?decodeURIComponent(encodedName):fallbackName;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
window.adminLearningPlanBridge={apiFetch,escapeHtml,escapeAttr,showToast,downloadAdminAsset};
function askChangeReason(action){
  const value=prompt(`กรุณาระบุเหตุผลในการ${action}\n(กดยกเลิกเพื่อไม่ดำเนินการ)`);
  if(value===null) return null;
  const reason=value.trim(); if(!reason){showToast('ต้องระบุเหตุผลก่อนดำเนินการ');return null;} return reason;
}

let EXAM_TYPES = ['กลางภาค','ปลายภาค','บล็อคคอร์ส'];

/* ============ LOGIN ============ */
const adminLoginScreen = document.getElementById('adminLoginScreen');
const adminScreen = document.getElementById('adminScreen');
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
let sessionIdleTimer = null;
function stopSessionTimer(){ if(sessionIdleTimer) clearTimeout(sessionIdleTimer); sessionIdleTimer=null; }
function scheduleSessionExpiry(){ stopSessionTimer(); if(!adminKey) return; sessionIdleTimer=setTimeout(showSessionExpiredDialog,SESSION_IDLE_MS); }
['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,()=>{ if(adminKey) scheduleSessionExpiry(); },{passive:true}));
function showSessionExpiredDialog(){
  if(!adminKey) return;
  adminKey=null; sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); stopSessionTimer();
  document.getElementById('setWizardScreen').classList.add('hidden'); adminScreen.classList.add('hidden');
  const dialog=document.getElementById('sessionExpiredDialog'); if(!dialog.open) dialog.showModal();
}
document.getElementById('sessionReloginBtn').addEventListener('click',()=>{ document.getElementById('sessionExpiredDialog').close(); adminLoginScreen.classList.remove('hidden'); document.getElementById('adminKeyInput').focus(); });
async function tryAdminLogin(){
  const val = document.getElementById('adminKeyInput').value.trim();
  const errBox = document.getElementById('adminLoginError');
  if(!val){ errBox.textContent='กรุณากรอกรหัสผู้ดูแลระบบ'; errBox.style.display='block'; return; }
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  let ok = false; let loginError = null;
  try{ ok = await apiVerifyAdmin(val); }catch(e){ loginError = e; }
  btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ →';
  if(!ok){ errBox.textContent = loginError?.message || 'รหัสผู้ดูแลระบบไม่ถูกต้อง หรือเชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'; errBox.style.display='block'; return; }
  adminKey = val;
  sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, adminKey);
  scheduleSessionExpiry();
  adminLoginScreen.classList.add('hidden'); adminScreen.classList.remove('hidden');
  initAdmin();
}
document.getElementById('adminLoginBtn').addEventListener('click', tryAdminLogin);
document.getElementById('adminKeyInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryAdminLogin(); });
document.getElementById('pageRefreshBtn').addEventListener('click', refreshCurrentPageData);
document.getElementById('adminExitBtn').addEventListener('click', ()=>{
  adminKey = null; sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); stopSessionTimer(); adminScreen.classList.add('hidden'); adminLoginScreen.classList.remove('hidden');
  document.getElementById('adminKeyInput').value=''; document.getElementById('adminLoginError').style.display='none';
});
function organizeAdminSettings(){
  const openDialog=(dialogId)=>document.getElementById(dialogId)?.showModal();
  const movePanelToDialog=(panelId,bodyId,dialogId,summaryHtml)=>{
    const panel=document.getElementById(panelId), body=document.getElementById(bodyId);
    if(!panel||!body) return;
    // The dialog already has its own heading and description. Move only the
    // controls below the original panel heading to avoid duplicate text.
    [...panel.children].slice(2).forEach(child=>body.appendChild(child));
    panel.className='panel settings-menu-card';
    panel.innerHTML=summaryHtml;
    panel.querySelector('button')?.addEventListener('click',()=>openDialog(dialogId));
  };
  movePanelToDialog('academicCalendarPanel','academicCalendarDialogBody','academicCalendarDialog',`<div><h3>🗓️ ปฏิทินการศึกษา</h3><p class="panel-sub">กำหนดภาคเรียนและช่วงวันของแต่ละปีการศึกษา</p></div><button class="btn btn-primary btn-sm" type="button">จัดการปฏิทิน →</button>`);
  movePanelToDialog('adminAccountPanel','adminAccountDialogBody','adminAccountDialog',`<div><h3>👤 บัญชีผู้ดูแล</h3><p class="panel-sub">จัดการการใช้งานบัญชีผู้ดูแลบนเครื่องนี้</p></div><button class="btn btn-ghost btn-sm" type="button">เปิดเมนู →</button>`);
  const filePanel=document.getElementById('studentFileImportPanel');
  if(filePanel) document.getElementById('studentFilesDialogBody')?.appendChild(filePanel);
  const backupPanel=document.getElementById('systemBackupPanel');
  if(backupPanel) document.getElementById('systemBackupDialogBody')?.appendChild(backupPanel);
  document.getElementById('openStudentFilesDialogBtn')?.addEventListener('click',()=>openDialog('studentFilesDialog'));
  document.getElementById('openTeacherImportDialogBtn')?.addEventListener('click',()=>openDialog('teacherImportDialog'));
  document.getElementById('openSystemBackupDialogBtn')?.addEventListener('click',()=>openDialog('systemBackupDialog'));
  [['closeAcademicCalendarDialogBtn','academicCalendarDialog'],['closeStudentFilesDialogBtn','studentFilesDialog'],['closeTeacherImportDialogBtn','teacherImportDialog'],['closeAdminAccountDialogBtn','adminAccountDialog'],['closeSystemBackupDialogBtn','systemBackupDialog']].forEach(([buttonId,dialogId])=>document.getElementById(buttonId)?.addEventListener('click',()=>document.getElementById(dialogId)?.close()));
}
organizeAdminSettings();

let examSystemClosed=false;
function renderExamAccess(){
  const status=document.getElementById('examAccessStatus'), button=document.getElementById('toggleExamAccessBtn'), description=document.getElementById('examAccessDescription');
  if(!status||!button)return;
  status.textContent=examSystemClosed?'🔴 ระบบสอบปิดอยู่':'🟢 ระบบสอบเปิดอยู่';
  status.className='status-pill '+(examSystemClosed?'pending':'pub');
  button.textContent=examSystemClosed?'เปิดระบบสอบ':'ปิดระบบสอบ';
  button.className='btn '+(examSystemClosed?'btn-primary':'btn-danger')+' btn-sm';
  button.disabled=false;
  description.textContent=examSystemClosed?'นักเรียนทุกคนจะเห็นหน้าประกาศปิดระบบและ API การสอบถูกระงับ':'นักเรียนสามารถเข้าสู่ระบบและทำข้อสอบได้ตามปกติ';
}
async function loadExamAccess(){ try{const data=await apiGetExamAccess();examSystemClosed=!!data.closed;renderExamAccess();}catch(error){showToast(error.message);} }
document.getElementById('toggleExamAccessBtn')?.addEventListener('click',async event=>{
  const closing=!examSystemClosed;
  if(closing&&!confirm('ยืนยันปิดระบบสอบ? นักเรียนที่กำลังทำข้อสอบจะไม่สามารถบันทึกหรือส่งคำตอบจนกว่าจะเปิดระบบอีกครั้ง'))return;
  const button=event.currentTarget;button.disabled=true;
  try{const data=await apiSetExamAccess(closing,closing?'ระบบสอบปิดปรับปรุงชั่วคราว กรุณารอประกาศจากอาจารย์ผู้สอน':'');examSystemClosed=!!data.closed;renderExamAccess();showToast(examSystemClosed?'ปิดระบบสอบแล้ว':'เปิดระบบสอบแล้ว');}
  catch(error){showToast(error.message);button.disabled=false;}
});

let academicCalendar=[], academicCalendarLocked=false, calendarEditPassword='';
function calendarDateDisplay(value){ const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m)return '';const year=Number(m[1]);return `${m[3]}/${m[2]}/${year>=2400?year:year+543}`; }
function calendarDateValue(value){ const text=String(value||'').trim(),thai=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(thai){const inputYear=Number(thai[3]),year=inputYear>=2400?inputYear-543:inputYear;return `${String(year).padStart(4,'0')}-${thai[2].padStart(2,'0')}-${thai[1].padStart(2,'0')}`;}const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!iso)return '';const inputYear=Number(iso[1]),year=inputYear>=2400?inputYear-543:inputYear;return `${String(year).padStart(4,'0')}-${iso[2]}-${iso[3]}`; }
const ACADEMIC_TERM_DEFAULTS={1:'เทอม 1',2:'เทอม 2',summer:'ซัมเมอร์'};
function newAcademicTerm(id){ return {id,label:ACADEMIC_TERM_DEFAULTS[id]||id,startsOn:'',endsOn:''}; }
function newAcademicYear(){ const year=String(new Date().getFullYear()+543); return {academicYear:year,terms:[newAcademicTerm('1'),newAcademicTerm('2')]}; }
function renderAcademicCalendar(){
  const host=document.getElementById('academicCalendarRows'); if(!host) return;
  host.innerHTML=academicCalendar.length?academicCalendar.map((year,index)=>`<div class="mini-card" style="margin:0 0 10px;"><div class="toolbar-row"><div class="field" style="margin:0;min-width:120px;"><label>ปีการศึกษา</label><input data-academic-year="${index}" value="${escapeAttr(year.academicYear||'')}" inputmode="numeric" ${academicCalendarLocked?'disabled':''}></div>${academicCalendarLocked?'🔒':'<button class="btn btn-danger btn-sm" type="button" data-remove-academic-year="'+index+'">ลบปี</button>'}</div>${(year.terms||[]).map((term,termIndex)=>`<div class="academic-calendar-row"><div class="field"><label>${escapeHtml(term.label||`เทอม ${termIndex+1}`)}</label><input value="${escapeAttr(term.label||'')}" data-term-label="${index}:${termIndex}" ${academicCalendarLocked?'disabled':''}></div><div class="field"><label>วันเริ่มภาคเรียน</label><input placeholder="dd/mm/yyyy" value="${calendarDateDisplay(term.startsOn)}" data-term-start="${index}:${termIndex}" ${academicCalendarLocked?'disabled':''}></div><div class="field"><label>วันสิ้นสุดภาคเรียน</label><input placeholder="dd/mm/yyyy" value="${calendarDateDisplay(term.endsOn)}" data-term-end="${index}:${termIndex}" ${academicCalendarLocked?'disabled':''}></div></div>`).join('')}</div>`).join(''):'<div class="empty-note">ยังไม่ได้กำหนดปฏิทินการศึกษา</div>';
  host.querySelectorAll('[data-academic-year]').forEach(input=>input.addEventListener('input',event=>{academicCalendar[Number(event.target.dataset.academicYear)].academicYear=event.target.value;}));
  host.querySelectorAll('[data-term-label]').forEach(input=>input.addEventListener('input',event=>{const [year,term]=event.target.dataset.termLabel.split(':').map(Number);academicCalendar[year].terms[term].label=event.target.value;}));
  host.querySelectorAll('[data-term-start],[data-term-end]').forEach(input=>input.addEventListener('change',event=>{const [year,term]=(event.target.dataset.termStart||event.target.dataset.termEnd).split(':').map(Number);academicCalendar[year].terms[term][event.target.dataset.termStart?'startsOn':'endsOn']=calendarDateValue(event.target.value);}));
  host.querySelectorAll('[data-remove-academic-year]').forEach(button=>button.addEventListener('click',()=>{academicCalendar.splice(Number(button.dataset.removeAcademicYear),1);renderAcademicCalendar();}));
}
async function loadAcademicCalendar(){ try{const data=await apiGetAcademicCalendar();academicCalendar=data.academicCalendar||[];academicCalendarLocked=!!data.locked;['addAcademicYearBtn','addAcademicTermSelect','addAcademicTermBtn'].forEach(id=>document.getElementById(id).style.display=academicCalendarLocked?'none':'');document.getElementById('saveAcademicCalendarBtn').textContent=academicCalendarLocked?'🔒 แก้ไขปฏิทิน':'💾 บันทึกปฏิทิน';renderAcademicCalendar();}catch(error){showToast(error.message);} }
document.getElementById('addAcademicYearBtn').addEventListener('click',()=>{academicCalendar.push(newAcademicYear());renderAcademicCalendar();});
document.getElementById('addAcademicTermBtn').addEventListener('click',()=>{const id=document.getElementById('addAcademicTermSelect').value;const year=academicCalendar[academicCalendar.length-1];if(!year)return showToast('กรุณาเพิ่มปีการศึกษาก่อน');if((year.terms||[]).some(term=>term.id===id))return showToast(`ปีการศึกษานี้มี${ACADEMIC_TERM_DEFAULTS[id]}แล้ว`);year.terms.push(newAcademicTerm(id));renderAcademicCalendar();});
document.getElementById('saveAcademicCalendarBtn').addEventListener('click',async event=>{const button=event.currentTarget;if(academicCalendarLocked){calendarEditPassword=prompt('กรอกรหัสแอดมินเพื่อปลดล็อกการแก้ไข')||'';if(!calendarEditPassword)return;academicCalendarLocked=false;renderAcademicCalendar();['addAcademicYearBtn','addAcademicTermSelect','addAcademicTermBtn'].forEach(id=>document.getElementById(id).style.display='');button.textContent='💾 บันทึกปฏิทิน';return;}button.disabled=true;try{await apiSaveAcademicCalendar(academicCalendar,calendarEditPassword);calendarEditPassword='';showToast('บันทึกปฏิทินการศึกษาแล้ว');await loadAcademicCalendar();}catch(error){showToast(error.message);}finally{button.disabled=false;}});

let promotionMappings=[];
function promotionPayload(){ return {sourceYear:document.getElementById('promotionSourceYear').value,targetYear:document.getElementById('promotionTargetYear').value.trim(),mappings:promotionMappings.filter(item=>item.toRoom.trim())}; }
function suggestedPromotionRoom(room){
  const value=String(room||'').trim();
  const vocational=value.match(/^(.*\.)(\d+)(\s*\/\s*\d+)(.*)$/);
  if(vocational){ const level=Number(vocational[2]); return level<3?`${vocational[1]}${level+1}${vocational[3]}${vocational[4]}`:''; }
  const diploma=value.match(/^(.*?)([12])(\d{2})$/);
  if(diploma){ return diploma[2]==='1'?`${diploma[1]}2${diploma[3]}`:''; }
  return '';
}
function isGraduatingRoom(room){
  const value=String(room||'').trim();
  const vocational=value.match(/^(.*\.)(\d+)(\s*\/\s*\d+)(.*)$/);
  if(vocational) return Number(vocational[2])>=3;
  const diploma=value.match(/^(.*?)([12])(\d{2})$/);
  return Boolean(diploma&&diploma[2]==='2');
}
function renderPromotionMappings(message=''){
  const host=document.getElementById('promotionMappingHost'); if(!host) return;
  const visible=Boolean(message||promotionMappings.length); host.classList.toggle('is-open',visible); document.getElementById('promotionConfirmActions').style.display=visible?'flex':'none';
  host.innerHTML=message||`<p class="compact-meta" style="margin:0 0 2px;">ระบบเติมตัวอย่างห้องปีถัดไปให้แล้ว กรุณาตรวจสอบและแก้ไขก่อนยืนยัน</p>${promotionMappings.map((item,index)=>`<div class="mini-card" style="margin:0;"><div class="schedule-time-grid"><div class="field"><label>ห้องเดิม</label><input value="${escapeAttr(item.fromRoom)}" disabled></div><div class="field"><label>ห้องใหม่</label><input data-promotion-room="${index}" value="${escapeAttr(item.toRoom||'')}" placeholder="เช่น CC.2/4"></div><div class="field"><label>รอบเรียน</label><select data-promotion-period="${index}"><option value="">คงเดิม</option>${['เช้า','บ่าย','ทวิภาคี'].map(period=>`<option value="${period}" ${item.examPeriod===period?'selected':''}>${period}</option>`).join('')}</select></div></div><small class="compact-meta">${item.count} คน</small></div>`).join('')}`;
  host.querySelectorAll('[data-promotion-room]').forEach(input=>input.addEventListener('input',event=>promotionMappings[Number(event.target.dataset.promotionRoom)].toRoom=event.target.value));
  host.querySelectorAll('[data-promotion-period]').forEach(input=>input.addEventListener('change',event=>promotionMappings[Number(event.target.dataset.promotionPeriod)].examPeriod=event.target.value));
}
async function loadPromotionYears(){
  try{const years=await apiGetEnrollmentYears();const select=document.getElementById('promotionSourceYear');const previous=select.value;select.innerHTML=years.length?years.map(year=>`<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`).join(''):'<option value="">ยังไม่มีข้อมูลนักเรียน</option>';select.value=years.includes(previous)?previous:(years[years.length-1]||'');if(!document.getElementById('promotionTargetYear').value&&select.value)document.getElementById('promotionTargetYear').value=String(Number(select.value)+1);}catch(error){showToast(error.message);}
}
document.getElementById('openPromotionDialogBtn').addEventListener('click',()=>{document.getElementById('promotionDialog').showModal();loadPromotionYears();});
document.getElementById('closePromotionDialogBtn').addEventListener('click',()=>document.getElementById('promotionDialog').close());
document.getElementById('loadPromotionRoomsBtn').addEventListener('click',async()=>{const sourceYear=document.getElementById('promotionSourceYear').value;if(!sourceYear)return showToast('กรุณาเลือกปีเดิม');try{const rooms=await apiGetEnrollmentRooms(sourceYear);promotionMappings=rooms.filter(item=>!isGraduatingRoom(item.classRoom)).map(item=>({fromRoom:item.classRoom,toRoom:suggestedPromotionRoom(item.classRoom),examPeriod:'',count:item.count}));if(!promotionMappings.length){showToast('ไม่มีห้องที่ต้องเลื่อนชั้นในปีนี้');renderPromotionMappings();return;}renderPromotionMappings();document.getElementById('confirmPromotionBtn').disabled=true;}catch(error){showToast(error.message);}});
document.getElementById('previewPromotionBtn').addEventListener('click',async()=>{try{const data=await apiPreviewPromotion(promotionPayload());renderPromotionMappings(`<div class="empty-note" style="text-align:left;">พร้อมเลื่อนชั้น <b>${data.promoted}</b> คน${data.skipped.length?`<br>ข้าม ${data.skipped.length} คน เพราะมีข้อมูลในปีใหม่แล้ว`:''}<br><button class="btn btn-ghost btn-sm" id="editPromotionMappingsBtn" type="button">← กลับไปแก้ไขการจับคู่</button></div>`);document.getElementById('editPromotionMappingsBtn').addEventListener('click',()=>renderPromotionMappings());document.getElementById('confirmPromotionBtn').disabled=data.promoted===0;}catch(error){showToast(error.message);}});
document.getElementById('confirmPromotionBtn').addEventListener('click',async()=>{const body=promotionPayload();if(!confirm(`ยืนยันเลื่อนชั้นนักเรียนจากปี ${body.sourceYear} ไปปี ${body.targetYear}? ข้อมูลปีเดิมจะยังอยู่ครบ`))return;const button=document.getElementById('confirmPromotionBtn');button.disabled=true;try{const data=await apiPromoteStudents(body);showToast(`เลื่อนชั้นสำเร็จ ${data.promoted} คน`);promotionMappings=[];renderPromotionMappings();await loadPromotionYears();}catch(error){showToast(error.message);}finally{button.disabled=false;}});

async function restoreAdminSession(){
  if(!adminKey) return;
  try{
    await apiVerifyAdmin(adminKey);
    scheduleSessionExpiry();
    adminLoginScreen.classList.add('hidden'); adminScreen.classList.remove('hidden');
    document.documentElement.classList.remove('restoring-session');
    initAdmin();
  }catch(error){
    adminKey=null; sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    document.documentElement.classList.remove('restoring-session');
  }
}
restoreAdminSession();

let currentAdminTab = document.querySelector('.admin-tab-btn.active')?.dataset.atab || 'sets';

function refreshCurrentPageData(){
  const activeTab = currentAdminTab;
  if(activeTab==='dashboard') return refreshDashboard();
  if(activeTab==='students') return refreshStudents();
  if(activeTab==='teachers') return refreshTeachers();
  if(activeTab==='learning-plans' && typeof refreshLearningPlans==='function') return refreshLearningPlans();
  if(activeTab==='results') return refreshResults();
  if(activeTab==='score-emails') return refreshScoreEmails();
  if(activeTab==='operations') return Promise.all([refreshOperations(),refreshExamPulse()]);
  return initAdmin();
}

/* ============ TABS ============ */
function openAdminTab(tab, options={}){
    currentAdminTab=tab;
    document.querySelectorAll('.admin-tab-btn').forEach(b=>b.classList.remove('active'));
    const activeButton=document.querySelector(`.admin-tab-btn[data-atab="${options.keepSettingsActive?'settings':tab}"]`);
    activeButton?.classList.add('active');
    ['dashboard','sets','test-links','library','students','teachers','learning-plans','results','score-emails','operations','settings'].forEach(t=> document.getElementById('atab-'+t).classList.toggle('hidden', tab!==t));
    if(tab==='dashboard') refreshDashboard();
    if(tab==='library') renderLibrarySetList();
    if(tab==='test-links') renderTestLinkSelector();
    if(tab==='operations'){ refreshOperations(); startOperationsStream(); startExamPulse(); } else { stopOperationsStream(); stopExamPulse(); }
    if(tab==='results') refreshResults();
    if(tab==='score-emails') refreshScoreEmails();
    if(tab==='students') refreshStudents();
    if(tab==='teachers') refreshTeachers();
    if(tab==='learning-plans' && typeof refreshLearningPlans==='function') refreshLearningPlans();
}
document.querySelectorAll('.admin-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>openAdminTab(btn.dataset.atab));
});
document.querySelectorAll('[data-settings-target]').forEach(btn=>{
  btn.addEventListener('click',()=>openAdminTab(btn.dataset.settingsTarget,{keepSettingsActive:true}));
});

async function initAdmin(){
  document.getElementById('teacherLoginUrlText').textContent = window.location.origin + '/teacher';
  document.getElementById('setListWrap').innerHTML = '<div class="loading-note">กำลังโหลด...</div>';
  try{ EXAM_TYPES = await apiGetExamTypes(); }catch(e){}
  await loadAcademicCalendar();
  await loadExamAccess();
  await loadPromotionYears();
  const etSel = document.getElementById('examTypeFilterSelect');
  etSel.innerHTML = '<option value="">ทุกประเภทข้อสอบ</option>' + EXAM_TYPES.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  ADMIN_SETS = await apiGetAdminSets().catch(e=>{ showToast(e.message); return []; });
  renderSetList();
  populateSetFilterOptions();
}

async function refreshDashboard(){
  const wrap=document.getElementById('dashboardWrap');
  wrap.innerHTML='<div class="loading-note">กำลังโหลดภาพรวม...</div>';
  try{
    const [students, results]=await Promise.all([apiGetStudents(),apiGetResults()]);
    const submittedStudents=new Set(results.map(result=>result.studentId)).size;
    const scores=results.map(result=>Number(result.overallScore20)).filter(Number.isFinite);
    const average=scores.length ? Math.round((scores.reduce((sum,score)=>sum+score,0)/scores.length)*100)/100 : 0;
    const highest=scores.length ? Math.max(...scores) : 0;
    const lowest=scores.length ? Math.min(...scores) : 0;
    const perSet=new Map(), perClass=new Map();
    results.forEach(result=>{ perSet.set(result.questionTitle||'ไม่ระบุรายวิชา',(perSet.get(result.questionTitle||'ไม่ระบุรายวิชา')||0)+1); perClass.set(result.classRoom||'ไม่ระบุห้อง',(perClass.get(result.classRoom||'ไม่ระบุห้อง')||0)+1); });
    const renderBars=(entries,emptyText)=>{ const sorted=[...entries].sort((a,b)=>b[1]-a[1]).slice(0,6); if(!sorted.length) return `<div class="empty-note">${emptyText}</div>`; const max=sorted[0][1]||1; return sorted.map(([label,value])=>`<div class="dash-bar-row"><span class="dash-bar-label" title="${escapeAttr(label)}">${escapeHtml(label)}</span><span class="dash-bar-track"><i class="dash-bar" style="width:${Math.round(value/max*100)}%"></i></span><b class="dash-bar-value">${value}</b></div>`).join(''); };
    wrap.innerHTML=`<div class="dashboard-stats"><div class="dashboard-stat"><div class="label">นักเรียนทั้งหมด</div><div class="value">${students.length}</div><div class="note">ในรายชื่อระบบ</div></div><div class="dashboard-stat"><div class="label">ส่งข้อสอบแล้ว</div><div class="value">${submittedStudents}</div><div class="note">ยังไม่ส่ง ${Math.max(0,students.length-submittedStudents)} คน</div></div><div class="dashboard-stat"><div class="label">คะแนนเฉลี่ย</div><div class="value">${average}/20</div><div class="note">จากผลสอบ ${results.length} รายการ</div></div><div class="dashboard-stat"><div class="label">คะแนนสูงสุด / ต่ำสุด</div><div class="value">${highest} / ${lowest}</div><div class="note">เต็ม 20 คะแนน</div></div></div><div class="dashboard-grid"><section class="dashboard-panel"><h3>📚 จำนวนการส่ง แยกตามรายวิชา</h3>${renderBars(perSet,'ยังไม่มีผลสอบ')}</section><section class="dashboard-panel"><h3>🏫 จำนวนการส่ง แยกตามห้อง</h3>${renderBars(perClass,'ยังไม่มีผลสอบ')}</section></div>`;
  }catch(error){ wrap.innerHTML='<div class="empty-note">'+escapeHtml(error.message)+'</div>'; }
}
document.getElementById('refreshDashboardBtn').addEventListener('click', refreshDashboard);

/* ======================================================================
   OPERATIONS
   ====================================================================== */
function formatOperationsBytes(value){
  if(value===null || value===undefined) return 'จัดการโดยระบบภายนอก';
  const units=['B','KB','MB','GB']; let size=Number(value)||0,index=0;
  while(size>=1024 && index<units.length-1){size/=1024;index++;}
  return (index?size.toFixed(1):Math.round(size))+' '+units[index];
}
function formatOperationsUptime(seconds){
  const total=Math.max(0,Number(seconds)||0),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60);
  return [days?days+' วัน':'',hours?hours+' ชม.':'',minutes+' นาที'].filter(Boolean).join(' ');
}
async function refreshOperations(){
  const wrap=document.getElementById('operationsWrap');
  wrap.innerHTML='<div class="loading-note">กำลังตรวจสอบระบบ...</div>';
  try{
    const data=await apiGetOperations(),counts=data.counts||{},activity=data.recentActivity||[],requests=data.requests||{},submissions=data.submissions||{},scoreChecks=data.scoreVerification||{},examChecks=data.examReadiness||{},backup=data.backup||{},restore=data.restoreDrill||{},alerts=data.alerts||{},jobs=data.jobs||{},sessions=data.sessions||{},serverLoad=data.serverLoad||{};
    const storageReady=data.storage?.status==='configured';
    const databaseReady=data.database?.status==='connected',backupReady=backup.configured,alertsReady=alerts.configured,restoreHealthy=restore.lastSuccessAt&&(!restore.lastFailureAt||restore.lastSuccessAt>=restore.lastFailureAt);
    const countCards=[['นักเรียน',counts.students],['อาจารย์',counts.teachers],['ชุดข้อสอบ',counts.examSets],['ผลสอบ',counts.results],['ฉบับร่าง',counts.drafts],['เซสชันอาจารย์',counts.activeTeacherSessions]];
    const activityRows=activity.length?activity.map(row=>`<tr><td>${escapeHtml(new Date(row.eventAt).toLocaleString('th-TH'))}</td><td>${escapeHtml(row.action||'-')}</td><td>${escapeHtml(row.actorId||row.actorType||'-')}</td><td>${escapeHtml(row.targetId||'-')}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--sub);">ยังไม่มีกิจกรรมที่บันทึกไว้</td></tr>';
    const failureRows=requests.recentFailures?.length?requests.recentFailures.map(row=>`<tr><td>${escapeHtml(new Date(row.occurredAt).toLocaleString('th-TH'))}</td><td>${escapeHtml(row.method)}</td><td>${escapeHtml(row.path)}</td><td>${Number(row.status)}</td><td>${Number(row.durationMs)} ms</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--green);">ไม่พบข้อผิดพลาดของเซิร์ฟเวอร์นับตั้งแต่เริ่มระบบ</td></tr>';
    const blockedExamRows=(examChecks.blockedSets||[]).length?(examChecks.blockedSets||[]).map(set=>`<div class="mini-card" style="margin:0 0 10px;"><div class="toolbar-row"><div><h4 style="margin:0 0 4px;">${escapeHtml(set.title||set.key||'-')}</h4>${set.courseName&&set.courseName!==set.title?`<div class="panel-sub">${escapeHtml(set.courseName)}</div>`:''}</div><button class="btn btn-primary btn-sm" type="button" data-fix-blocked-exam="${escapeAttr(set.key)}">แก้ไขชุดข้อสอบ</button></div><ul style="margin:10px 0 0;padding-left:22px;">${(set.errors||[]).map(error=>`<li>${escapeHtml(error.message||error.code||'ไม่ผ่านการตรวจความพร้อม')}</li>`).join('')}</ul></div>`).join(''):'<div class="empty-note">ไม่มีชุดข้อสอบที่ถูกบล็อก</div>';
    const loadLevel=serverLoad.level||'normal',loadLabel={normal:'ปกติ',warning:'เริ่มทำงานหนัก',critical:'ภาระสูง'}[loadLevel];
    wrap.innerHTML=`<div id="operationsServerLoad" class="server-load-card server-load-${loadLevel}"><div class="server-load-heading"><div><div class="label">หลอดภาระงานระบบ</div><strong id="operationsServerLoadLabel">${loadLabel}</strong></div><b id="operationsServerLoadPercent">${Number(serverLoad.percent)||0}%</b></div><div class="server-load-track" role="progressbar" aria-label="ภาระงานระบบ" aria-valuenow="${Number(serverLoad.percent)||0}" aria-valuemin="0" aria-valuemax="100"><i id="operationsServerLoadBar" style="width:${Math.min(100,Math.max(0,Number(serverLoad.percent)||0))}%"></i></div><div class="server-load-notes" id="operationsServerLoadNotes">หน่วยความจำ ${Number(serverLoad.components?.heapPercent)||0}% · ส่งข้อสอบ ${Number(serverLoad.components?.submissionPercent)||0}% · คิวส่ง ${Number(serverLoad.components?.submissionQueuePercent)||0}% · งานเบื้องหลัง ${Number(serverLoad.components?.jobQueuePercent)||0}% · หน่วง ${Number(serverLoad.components?.eventLoopDelayMs)||0} ms</div></div><div class="operations-status-grid">
      <div class="operations-card"><div class="label">ระบบ API</div><div class="value operations-ok">● ปกติ</div><div class="note">Uptime ${formatOperationsUptime(data.uptimeSeconds)}</div></div>
      <div class="operations-card"><div class="label">ฐานข้อมูล (Live)</div><div class="value ${databaseReady?'operations-ok':'operations-warn'}">● ${databaseReady?'เชื่อมต่อแล้ว':'ขาดการเชื่อมต่อ'}</div><div class="note">${escapeHtml(data.database.engine)} · ${databaseReady?Number(data.database.latencyMs||0)+' ms':'probe ไม่ผ่าน'} · ${formatOperationsBytes(data.database.sizeBytes)}</div></div>
      <div class="operations-card"><div class="label">พื้นที่เก็บไฟล์</div><div class="value ${storageReady?'operations-ok':'operations-warn'}">● ${storageReady?'พร้อมใช้งาน':'ยังไม่ได้ตั้งค่า'}</div><div class="note">ขนาดไฟล์สูงสุด ${formatOperationsBytes(data.storage.maxBytes)}</div></div>
      <div class="operations-card"><div class="label">Backup อัตโนมัติ</div><div class="value ${backupReady?'operations-ok':'operations-warn'}">● ${backupReady?'เข้ารหัสแล้ว':'ยังไม่ได้ตั้งค่า'}</div><div class="note">${backup.lastSuccessAt?'ล่าสุด '+escapeHtml(new Date(backup.lastSuccessAt).toLocaleString('th-TH')):'ยังไม่มี backup'} · เก็บ ${Number(backup.retentionDays)||0} วัน</div></div>
      <div class="operations-card"><div class="label">Restore Drill</div><div class="value ${restoreHealthy?'operations-ok':'operations-warn'}">● ${restoreHealthy?'กู้คืนได้':restore.lastFailureAt?'ตรวจไม่ผ่าน':'ยังไม่เคยตรวจ'}</div><div class="note">${restore.lastSuccessAt?'สำเร็จล่าสุด '+escapeHtml(new Date(restore.lastSuccessAt).toLocaleString('th-TH')):'ตรวจไฟล์ backup โดยไม่แตะฐานจริง'}</div>${restore.configured?'<button class="btn btn-ghost btn-sm" style="margin-top:9px;" onclick="runRestoreDrill()">ทดสอบตอนนี้</button>':''}</div>
      <div class="operations-card"><div class="label">External Alerts</div><div class="value ${alertsReady?'operations-ok':'operations-warn'}">● ${alertsReady?'พร้อมแจ้งเตือน':'ยังไม่ได้ตั้งค่า'}</div><div class="note">${alerts.lastSuccessAt?'ส่งสำเร็จล่าสุด '+escapeHtml(new Date(alerts.lastSuccessAt).toLocaleString('th-TH')):'Webhook monitoring'}</div></div>
      <div class="operations-card"><div class="label">Shared Sessions</div><div class="value ${sessions.configured&&sessions.connected?'operations-ok':'operations-warn'}">● ${sessions.configured&&sessions.connected?'Redis พร้อมใช้งาน':'Memory instance เดียว'}</div><div class="note">${escapeHtml(sessions.engine||'Memory')} · ${Number(counts.activeTeacherSessions)||0} session อาจารย์</div></div>
      <div class="operations-card"><div class="label">Email Reports</div><div class="value ${data.scoreEmails?.configured?'operations-ok':'operations-warn'}">● ${data.scoreEmails?.configured?'พร้อมส่ง':'ยังไม่ได้ตั้งค่า'}</div><div class="note">พร้อมรับ ${Number(data.scoreEmails?.eligibleTeachers)||0} อาจารย์ · ${Number(data.scoreEmails?.courseSheets)||0} ชีต${data.scoreEmails?.lastRun?' · ล่าสุดสำเร็จ '+Number(data.scoreEmails.lastRun.sent||0)+' ล้มเหลว '+Number(data.scoreEmails.lastRun.failed||0):''}</div></div>
      <div class="operations-card"><div class="label">หน่วยความจำ</div><div class="value">${formatOperationsBytes(data.memory.rssBytes)}</div><div class="note">Heap ${formatOperationsBytes(data.memory.heapUsedBytes)} / ${formatOperationsBytes(data.memory.heapTotalBytes)}</div></div>
    </div><h3 style="margin:0 0 10px;">สถานะการสอบแบบสด <span id="operationsLiveState" class="operations-ok" style="font-size:12px;">● กำลังเชื่อมต่อ</span></h3><div class="operations-count-grid"><div class="operations-card"><div class="label">นักเรียนกำลังทำข้อสอบ</div><div class="value" id="liveActiveStudents">0</div><div class="note">นับจาก draft lock ที่ยัง active</div></div><div class="operations-card"><div class="label">ข้อสอบที่เปิดอยู่</div><div class="value" id="liveActiveExams">0</div></div><div class="operations-card"><div class="label">ส่งผลใน 5 นาที</div><div class="value" id="liveRecentResults">0</div></div><div class="operations-card"><div class="label">ส่งข้อสอบ / รอคิว</div><div class="value" id="liveSubmissionQueue">0 / 0</div></div></div><h3 style="margin:0 0 10px;">การทำงานของ API</h3><div class="operations-count-grid"><div class="operations-card"><div class="label">คำขอทั้งหมด</div><div class="value">${Number(requests.totalRequests)||0}</div><div class="note">ตั้งแต่เริ่มระบบรอบนี้</div></div><div class="operations-card"><div class="label">เวลาตอบสนองเฉลี่ย</div><div class="value">${Number(requests.averageResponseMs)||0} ms</div></div><div class="operations-card"><div class="label">ข้อผิดพลาดของเซิร์ฟเวอร์</div><div class="value ${requests.serverErrors?'operations-warn':'operations-ok'}">${Number(requests.serverErrors)||0}</div><div class="note">${Number(requests.errorRatePercent)||0}% ของคำขอ · ไม่รวมการปิดระบบตามนโยบาย</div></div><div class="operations-card"><div class="label">คำขอที่ระบบปฏิเสธตามสถานะ</div><div class="value">${Number(requests.controlledRejections)||0}</div><div class="note">เช่น ปิดระบบข้อสอบหรือคิวส่งข้อสอบเต็ม ไม่ถือเป็นระบบผิดพลาด</div></div><div class="operations-card"><div class="label">กำลังประมวลผล</div><div class="value">${Number(requests.inFlight)||0}</div></div></div>
    <h3 style="margin:18px 0 10px;">การส่งข้อสอบพร้อมกัน</h3><div class="operations-count-grid"><div class="operations-card"><div class="label">กำลังบันทึก</div><div class="value">${Number(submissions.active)||0} / ${Number(submissions.maxConcurrent)||0}</div></div><div class="operations-card"><div class="label">รอในคิว</div><div class="value ${submissions.pending?'operations-warn':''}">${Number(submissions.pending)||0}</div><div class="note">รองรับสูงสุด ${Number(submissions.maxPending)||0}</div></div><div class="operations-card"><div class="label">สูงสุดพร้อมกัน</div><div class="value">${Number(submissions.peakActive)||0}</div></div><div class="operations-card"><div class="label">ปฏิเสธเพราะระบบเต็ม</div><div class="value ${submissions.overloaded?'operations-warn':'operations-ok'}">${Number(submissions.overloaded)||0}</div></div></div>
    <h3 style="margin:18px 0 10px;">Background Jobs</h3><div class="operations-count-grid"><div class="operations-card"><div class="label">กำลังทำงาน</div><div class="value">${Number(jobs.active)||0} / ${Number(jobs.concurrency)||0}</div></div><div class="operations-card"><div class="label">รอในคิว</div><div class="value ${jobs.pending?'operations-warn':''}">${Number(jobs.pending)||0}</div><div class="note">รองรับสูงสุด ${Number(jobs.maxPending)||0}</div></div><div class="operations-card"><div class="label">สำเร็จ</div><div class="value operations-ok">${Number(jobs.completed)||0}</div></div><div class="operations-card"><div class="label">Retry / ล้มเหลว</div><div class="value ${jobs.failed?'operations-warn':'operations-ok'}">${Number(jobs.retried)||0} / ${Number(jobs.failed)||0}</div></div></div>
    <div class="panel"><h3>🚨 เหตุขัดข้องล่าสุด</h3><p class="panel-sub">เก็บเฉพาะ method, path, status และระยะเวลา ไม่เก็บข้อมูลคำตอบหรือรหัสผ่าน</p><div style="overflow-x:auto;"><table class="result-table"><thead><tr><th>เวลา</th><th>Method</th><th>Path</th><th>Status</th><th>ระยะเวลา</th></tr></thead><tbody>${failureRows}</tbody></table></div></div>
    <h3 style="margin:18px 0 10px;">ความพร้อมของข้อสอบ</h3><div class="operations-count-grid"><div class="operations-card"><div class="label">พร้อมเปิดสอบ</div><div class="value operations-ok">${Number(examChecks.ready)||0}</div></div><button type="button" class="operations-card exam-readiness-detail-btn" aria-controls="examReadinessIssuePanel"><div class="label">ถูกบล็อกเพื่อรอแก้ไข · กดดูรายละเอียด</div><div class="value ${examChecks.blocked?'operations-warn':'operations-ok'}">${Number(examChecks.blocked)||0}</div><div class="note">ข้อสอบที่ไม่ผ่านจะไม่แสดงให้นักเรียนเห็น</div></button></div>
    <div class="panel hidden" id="examReadinessIssuePanel"><h3>🔎 ชุดข้อสอบที่ต้องแก้ไข</h3><p class="panel-sub">แสดงชื่อชุดข้อสอบและสาเหตุที่ระบบยังไม่อนุญาตให้นักเรียนเห็น</p><div>${blockedExamRows}</div></div>
    <h3 style="margin:18px 0 10px;">ความถูกต้องของคะแนน</h3><div class="operations-count-grid"><div class="operations-card"><div class="label">ตรวจสอบผ่าน</div><div class="value operations-ok">${Number(scoreChecks.verified)||0}</div></div><button type="button" class="operations-card score-verification-detail-btn" aria-controls="scoreVerificationIssuePanel" aria-label="ดูรายละเอียดคะแนนไม่ตรง"><div class="label">คะแนนไม่ตรง · กดดูรายละเอียด</div><div class="value ${scoreChecks.mismatch?'operations-warn':'operations-ok'}">${Number(scoreChecks.mismatch)||0}</div><div class="note">รายการนี้จะถูกบล็อกไม่ให้ประกาศ</div></button><button type="button" class="operations-card score-verification-detail-btn" aria-controls="scoreVerificationIssuePanel" aria-label="ดูรายละเอียดรายการที่ตรวจสอบคะแนนไม่ได้"><div class="label">ตรวจสอบไม่ได้ · กดดูรายละเอียด</div><div class="value ${scoreChecks.unverifiable?'operations-warn':'operations-ok'}">${Number(scoreChecks.unverifiable)||0}</div></button></div>
    <div class="panel hidden" id="scoreVerificationIssuePanel"><h3>🔎 รายการคะแนนที่ต้องตรวจสอบ</h3><p class="panel-sub">แสดงเฉพาะคะแนนที่บันทึกกับคะแนนที่คำนวณใหม่ ไม่แสดงคำตอบหรือเฉลย และไม่มีการแก้คะแนนอัตโนมัติ</p><div id="scoreVerificationIssueWrap" style="overflow-x:auto;"></div></div>
    <h3 style="margin:18px 0 10px;">จำนวนข้อมูลในระบบ</h3><div class="operations-count-grid">${countCards.map(([label,value])=>`<div class="operations-card"><div class="label">${label}</div><div class="value">${Number(value)||0}</div></div>`).join('')}</div>
    <div class="panel"><h3>🕘 กิจกรรมล่าสุด</h3><p class="panel-sub">แสดงรายการตรวจสอบย้อนหลังล่าสุด 8 รายการ</p><div style="overflow-x:auto;"><table class="result-table"><thead><tr><th>เวลา</th><th>การทำงาน</th><th>ผู้ดำเนินการ</th><th>เป้าหมาย</th></tr></thead><tbody>${activityRows}</tbody></table></div></div>
    <div class="operations-meta">ตรวจสอบล่าสุด ${escapeHtml(new Date(data.generatedAt).toLocaleString('th-TH'))}</div>`;
    wrap.querySelectorAll('.score-verification-detail-btn').forEach(button=>button.addEventListener('click',openScoreVerificationIssues));
    wrap.querySelector('.exam-readiness-detail-btn')?.addEventListener('click',()=>{const panel=document.getElementById('examReadinessIssuePanel');panel?.classList.toggle('hidden');if(panel&&!panel.classList.contains('hidden'))panel.scrollIntoView({behavior:'smooth',block:'start'});});
    wrap.querySelectorAll('[data-fix-blocked-exam]').forEach(button=>button.addEventListener('click',()=>openEditor(button.dataset.fixBlockedExam)));
  }catch(error){ wrap.innerHTML='<div class="empty-note">ตรวจสอบระบบไม่สำเร็จ: '+escapeHtml(error.message)+'</div>'; }
}
document.getElementById('refreshOperationsBtn').addEventListener('click', refreshOperations);
function pulseAge(seconds){if(seconds===null||seconds===undefined)return '-';return seconds<60?`${seconds} วินาที`:`${Math.floor(seconds/60)} นาที`}
function pulseRemaining(seconds){if(seconds===null||seconds===undefined)return '-';if(seconds<=0)return 'หมดเวลาแล้ว';return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} นาที`}
let examPulseTimer=null;
let examPulseRows=new Map(),examPulseData=[],examPulseFilter='attention',examPulseQuery='',examPulseLoaded=false;
function startExamPulse(){stopExamPulse();refreshExamPulse();examPulseTimer=setInterval(refreshExamPulse,5000);}
function stopExamPulse(){if(examPulseTimer){clearInterval(examPulseTimer);examPulseTimer=null;}}
function pulseEntryVisible(item){if(examPulseFilter==='attention'&&!['offline','ending'].includes(item.status))return false;if(examPulseFilter!=='all'&&examPulseFilter!=='attention'&&item.status!==examPulseFilter)return false;const search=`${item.studentName||''} ${item.studentId||''} ${item.classRoom||''} ${item.examTitle||''}`.toLowerCase();return !examPulseQuery||search.includes(examPulseQuery);}
function makePulseRow(item){const row=document.createElement('article');row.className='pulse-row';row.dataset.draftKey=item.draftKey;row.innerHTML='<div class="pulse-person"><b></b><p></p></div><div class="pulse-meta"><span class="pulse-status"></span><small></small></div><div class="pulse-actions"><button class="btn btn-ghost btn-sm pulse-rescue" type="button">ปลดล็อกเครื่องใหม่</button><button class="btn btn-danger btn-sm pulse-delete" type="button">ลบ</button></div>';row.querySelector('.pulse-rescue').addEventListener('click',()=>rescueExamDraft(item.draftKey,item.studentName||item.studentId));row.querySelector('.pulse-delete').addEventListener('click',()=>deleteExamPulseDraft(item.draftKey,item.studentName||item.studentId));return row;}
function updatePulseRow(row,item){const labels={active:['กำลังทำ','pulse-active'],ending:['ใกล้หมดเวลา','pulse-ending'],offline:['ไม่อัปเดต','pulse-offline'],ended:['หมดเวลา','pulse-ended']},[label,klass]=labels[item.status]||labels.active;row.querySelector('.pulse-person b').textContent=item.studentName||item.studentId;row.querySelector('.pulse-person p').textContent=`${item.studentId} · ${item.classRoom||'-'} · ${item.examTitle}`;const status=row.querySelector('.pulse-status');status.textContent=label;status.className=`pulse-status ${klass}`;row.querySelector('.pulse-meta small').textContent=`บันทึกล่าสุด ${pulseAge(item.lastSavedSeconds)} · เหลือ ${pulseRemaining(item.remainingSeconds)}`;const button=row.querySelector('.pulse-rescue');button.hidden=!item.canRescue;button.dataset.draftKey=item.draftKey;row.querySelector('.pulse-delete').dataset.draftKey=item.draftKey;}
async function rescueExamDraft(draftKey,who){if(!confirm(`ปลดล็อกอุปกรณ์ของ ${who} เพื่อให้เข้าจากเครื่องใหม่ได้หรือไม่?\n\nการทำงานนี้ไม่ต่อเวลาสอบและไม่แก้ไขคำตอบ`))return;const reason=prompt('ระบุเหตุผลสำหรับบันทึกการช่วยเหลือ (เช่น เปลี่ยนเครื่อง/อินเทอร์เน็ตหลุด)');if(!reason?.trim())return;try{await apiRescueExamDraft(draftKey,reason.trim());showToast('ปลดล็อกอุปกรณ์แล้ว นักเรียนสามารถเข้าเครื่องใหม่ได้');refreshExamPulse();}catch(error){showToast(error.message);}}
async function deleteExamPulseDraft(draftKey,who){if(!confirm(`ลบสถานะการทำข้อสอบของ ${who} ทิ้งหรือไม่?\n\nคำตอบที่บันทึกไว้ระหว่างทำจะหายไปทั้งหมด และจะไม่แสดงในรายการนี้อีก การกระทำนี้ย้อนกลับไม่ได้`))return;const reason=prompt('ระบุเหตุผลสำหรับบันทึกการลบ (เช่น ทดสอบระบบ/เข้าผิดวิชา)');if(!reason?.trim())return;try{await apiDeleteExamPulseDraft(draftKey,reason.trim());showToast('ลบสถานะการทำข้อสอบแล้ว');refreshExamPulse();}catch(error){showToast(error.message);}}
function ensureExamPulseLayout(){const wrap=document.getElementById('examPulseWrap');if(examPulseLoaded)return wrap;examPulseLoaded=true;wrap.innerHTML='<div class="operations-count-grid pulse-summary"><div class="operations-card"><div class="label">กำลังทำข้อสอบ</div><div class="value operations-ok" data-pulse-total="active">0</div></div><div class="operations-card"><div class="label">ใกล้หมดเวลา</div><div class="value operations-warn" data-pulse-total="ending">0</div></div><div class="operations-card"><div class="label">ไม่อัปเดตเกิน 90 วินาที</div><div class="value" data-pulse-total="offline">0</div></div></div><div class="panel pulse-panel"><div class="pulse-head"><div><h3>จุดที่ต้องดู</h3><p class="panel-sub">แสดงเฉพาะความเสี่ยงเป็นค่าเริ่มต้น เพื่อเฝ้าห้องสอบขนาดใหญ่ได้ง่าย</p></div><small class="pulse-updated" data-pulse-updated></small></div><div class="pulse-controls"><input class="input" data-pulse-search placeholder="ค้นหาชื่อ รหัส ห้อง หรือข้อสอบ"><select class="filter-select" data-pulse-filter><option value="attention">เฉพาะต้องดู</option><option value="offline">ไม่อัปเดต</option><option value="ending">ใกล้หมดเวลา</option><option value="active">กำลังทำ</option><option value="all">ทั้งหมด</option></select><span class="pulse-visible" data-pulse-visible></span></div><div class="pulse-list" data-pulse-list></div><div class="empty-note hidden" data-pulse-empty>ไม่พบรายการตามตัวกรองนี้</div></div>';const search=wrap.querySelector('[data-pulse-search]'),filter=wrap.querySelector('[data-pulse-filter]');search.addEventListener('input',()=>{examPulseQuery=search.value.trim().toLowerCase();renderExamPulseRows();});filter.addEventListener('change',()=>{examPulseFilter=filter.value;renderExamPulseRows();});return wrap;}
function renderExamPulseRows(){const wrap=document.getElementById('examPulseWrap'),list=wrap.querySelector('[data-pulse-list]'),visible=examPulseData.filter(pulseEntryVisible),nextKeys=new Set(visible.map(item=>item.draftKey));for(const [key,row] of examPulseRows)if(!nextKeys.has(key)){row.remove();examPulseRows.delete(key);}const fragment=document.createDocumentFragment();visible.forEach(item=>{let row=examPulseRows.get(item.draftKey);if(!row){row=makePulseRow(item);examPulseRows.set(item.draftKey,row);}updatePulseRow(row,item);fragment.appendChild(row);});list.replaceChildren(fragment);wrap.querySelector('[data-pulse-empty]').classList.toggle('hidden',visible.length>0);wrap.querySelector('[data-pulse-visible]').textContent=`พบ ${visible.length.toLocaleString('th-TH')} จาก ${examPulseData.length.toLocaleString('th-TH')} คน`;}
async function refreshExamPulse(){
  const wrap=ensureExamPulseLayout();
  try{const data=await apiGetExamPulse(),summary=data.summary||{};examPulseData=data.entries||[];wrap.querySelector('[data-pulse-total="active"]').textContent=Number(summary.active)||0;wrap.querySelector('[data-pulse-total="ending"]').textContent=Number(summary.ending)||0;const offline=wrap.querySelector('[data-pulse-total="offline"]');offline.textContent=Number(summary.offline)||0;offline.className=`value ${summary.offline?'operations-warn':'operations-ok'}`;wrap.querySelector('[data-pulse-updated]').textContent=`อัปเดต ${new Date(data.generatedAt).toLocaleTimeString('th-TH')}`;renderExamPulseRows();}catch(error){if(!examPulseData.length){examPulseLoaded=false;examPulseRows.clear();wrap.innerHTML='<div class="empty-note">โหลด Exam Pulse ไม่สำเร็จ: '+escapeHtml(error.message)+'</div>';}else showToast('อัปเดต Exam Pulse ไม่สำเร็จ');}
}
document.getElementById('refreshExamPulseBtn').addEventListener('click',refreshExamPulse);
async function runRestoreDrill(){ try{ await apiRunRestoreDrill(); showToast('เพิ่มงาน Restore Drill เข้าคิวแล้ว','success'); setTimeout(refreshOperations,500); }catch(error){ showToast(error.message,'error'); } }
const scoreSectionLabel={mc:'ปรนัย',matching:'จับคู่',written:'อัตนัย',overall:'รวม'};
const scoreReasonLabel={score_components_mismatch:'คะแนนรายส่วนหรือคะแนนรวมไม่ตรง',score_mismatch:'คะแนนไม่ตรง',grading_snapshot_corrupt:'ข้อมูลสูตรตรวจขณะส่งข้อสอบถูกแก้ไข',missing_dfd_detail:'รายละเอียด DFD ไม่ครบ',missing_result_or_exam:'ไม่พบผลสอบหรือชุดข้อสอบ',missing_answers:'ไม่พบรายละเอียดคำตอบ'};
async function openScoreVerificationIssues(){
  const panel=document.getElementById('scoreVerificationIssuePanel'),wrap=document.getElementById('scoreVerificationIssueWrap');if(!panel||!wrap)return;panel.classList.remove('hidden');wrap.innerHTML='<div class="loading-note">กำลังตรวจคะแนนซ้ำ...</div>';panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{const data=await apiGetScoreVerificationIssues(),issues=data.issues||[];if(!issues.length){wrap.innerHTML='<div class="empty-note">ไม่พบคะแนนที่ต้องตรวจสอบ</div>';return;}wrap.innerHTML=`<table class="result-table"><thead><tr><th>นักเรียน</th><th>ห้อง</th><th>วิชา</th><th>ส่วนที่ต่าง</th><th>บันทึกอยู่</th><th>คำนวณใหม่</th><th>สาเหตุ</th><th>สถานะ</th></tr></thead><tbody>${issues.map(issue=>{const diffs=issue.differences||[];return `<tr><td>${escapeHtml(issue.studentId)}<br><small>${escapeHtml(issue.studentName||'')}</small></td><td>${escapeHtml(issue.classRoom||'-')}</td><td>${escapeHtml(issue.examTitle||issue.questionKey||'-')}</td><td>${diffs.length?diffs.map(diff=>escapeHtml(scoreSectionLabel[diff.section]||diff.section)).join('<br>'):'-'}</td><td>${diffs.length?diffs.map(diff=>Number(diff.actual)).join('<br>'):'-'}</td><td>${diffs.length?diffs.map(diff=>Number(diff.expected)).join('<br>'):'-'}</td><td>${escapeHtml(scoreReasonLabel[issue.reason]||issue.reason||'-')}</td><td><span class="${issue.status==='mismatch'?'operations-warn':''}">${issue.status==='mismatch'?'คะแนนไม่ตรง':'ตรวจสอบไม่ได้'}</span></td></tr>`;}).join('')}</tbody></table>`;}catch(error){wrap.innerHTML='<div class="empty-note">โหลดรายละเอียดไม่สำเร็จ: '+escapeHtml(error.message)+'</div>';}
}
let operationsStreamController=null,operationsReconnectTimer=null;
function renderLiveOperations(data){
  const set=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=value;};
  set('liveActiveStudents',Number(data.activeStudents)||0);set('liveActiveExams',Number(data.activeExams)||0);set('liveRecentResults',Number(data.resultsLast5Minutes)||0);set('liveSubmissionQueue',`${Number(data.submissions?.active)||0} / ${Number(data.submissions?.pending)||0}`);
  const state=document.getElementById('operationsLiveState');if(state){state.textContent='● สด · '+new Date(data.generatedAt).toLocaleTimeString('th-TH');state.className='operations-ok';}
  const load=data.serverLoad;if(load){const card=document.getElementById('operationsServerLoad'),label=document.getElementById('operationsServerLoadLabel'),percent=document.getElementById('operationsServerLoadPercent'),bar=document.getElementById('operationsServerLoadBar'),notes=document.getElementById('operationsServerLoadNotes'),labels={normal:'ปกติ',warning:'เริ่มทำงานหนัก',critical:'ภาระสูง'};if(card)card.className=`server-load-card server-load-${load.level||'normal'}`;if(label)label.textContent=labels[load.level]||labels.normal;if(percent)percent.textContent=`${Number(load.percent)||0}%`;if(bar)bar.style.width=`${Math.min(100,Math.max(0,Number(load.percent)||0))}%`;if(notes)notes.textContent=`หน่วยความจำ ${Number(load.components?.heapPercent)||0}% · ส่งข้อสอบ ${Number(load.components?.submissionPercent)||0}% · คิวส่ง ${Number(load.components?.submissionQueuePercent)||0}% · งานเบื้องหลัง ${Number(load.components?.jobQueuePercent)||0}% · หน่วง ${Number(load.components?.eventLoopDelayMs)||0} ms`;}
}
function stopOperationsStream(){if(operationsStreamController)operationsStreamController.abort();operationsStreamController=null;if(operationsReconnectTimer)clearTimeout(operationsReconnectTimer);operationsReconnectTimer=null;}
async function startOperationsStream(){
  stopOperationsStream();const controller=new AbortController();operationsStreamController=controller;
  try{
    const response=await fetch('/api/admin/operations/stream',{headers:{'x-admin-key':adminKey||''},signal:controller.signal});
    if(response.status===401){showSessionExpiredDialog();return;}if(!response.ok||!response.body)throw new Error('live stream unavailable');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()||'';for(const event of events){const line=event.split('\n').find(row=>row.startsWith('data: '));if(line)renderLiveOperations(JSON.parse(line.slice(6)));}}
  }catch(error){if(error.name!=='AbortError'){const state=document.getElementById('operationsLiveState');if(state){state.textContent='● กำลังเชื่อมต่อใหม่';state.className='operations-warn';}}}
  finally{if(operationsStreamController===controller)operationsStreamController=null;if(!controller.signal.aborted&&document.querySelector('.admin-tab-btn.active')?.dataset.atab==='operations')operationsReconnectTimer=setTimeout(startOperationsStream,3000);}
}

/* ======================================================================
   TEACHERS
   ====================================================================== */
async function refreshTeachers(){
  const wrap = document.getElementById('teachersWrap');
  wrap.innerHTML = '<div class="loading-note">กำลังโหลด...</div>';
  let teachers;
  try{ teachers = await apiGetTeachers(); }
  catch(e){ wrap.innerHTML = '<div class="empty-note">'+escapeHtml(e.message)+'</div>'; return; }
  TEACHERS_LIST = teachers;
  if(!teachers.length){ wrap.innerHTML = '<div class="empty-note">ยังไม่มีบัญชีอาจารย์ในระบบ</div>'; return; }
  wrap.innerHTML = teachers.map(t=>`
    <div class="teacher-row-card">
      <div class="teacher-row-info"><b>${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}</b><div class="username">สาขาวิชา: ${escapeHtml(t.department||'ยังไม่ได้ระบุ')} · username: ${escapeHtml(t.username)} · ${escapeHtml(t.email||'ยังไม่มีอีเมล')}</div></div>
      <button class="btn btn-primary btn-sm" data-manageteacher="${t.id}">⚙️ จัดการ</button>
    </div>`).join('');
  wrap.querySelectorAll('[data-manageteacher]').forEach(button=>button.addEventListener('click',()=>openManageTeacher(button.dataset.manageteacher)));
}
document.getElementById('exportTeachersBtn').addEventListener('click',async event=>{
  const button=event.currentTarget, original=button.textContent;
  button.disabled=true;button.textContent='กำลังสร้างไฟล์...';
  try{await downloadAdminAsset('/api/teachers/export.xlsx','รายชื่ออาจารย์.xlsx');showToast('ดาวน์โหลดรายชื่ออาจารย์ Excel แล้ว');}
  catch(error){showToast(error.message);}
  finally{button.disabled=false;button.textContent=original;}
});
let manageTeacherId='';
function openManageTeacher(id){
  const teacher=TEACHERS_LIST.find(item=>item.id===id);if(!teacher)return;
  manageTeacherId=id;
  document.getElementById('manageTeacherName').textContent=`${teacher.firstName} ${teacher.lastName}`.trim();
  document.getElementById('manageTeacherUsername').textContent=`username: ${teacher.username}`;
  document.getElementById('manageTeacherDepartment').value=teacher.department||'';
  document.getElementById('manageTeacherEmail').value=teacher.email||'';
  document.getElementById('manageTeacherError').textContent='';
  document.getElementById('manageTeacherDialog').showModal();
}
document.getElementById('cancelManageTeacher').addEventListener('click',()=>document.getElementById('manageTeacherDialog').close());
document.getElementById('saveManageTeacher').addEventListener('click',async()=>{
  const department=document.getElementById('manageTeacherDepartment').value.trim(),email=document.getElementById('manageTeacherEmail').value.trim(),error=document.getElementById('manageTeacherError'),button=document.getElementById('saveManageTeacher');
  if(!department||!email){error.textContent='กรุณากรอกสาขาวิชาและอีเมลให้ครบ';return;}
  button.disabled=true;error.textContent='';
  try{await apiUpdateTeacherProfile(manageTeacherId,department,email);document.getElementById('manageTeacherDialog').close();await refreshTeachers();showToast('บันทึกข้อมูลอาจารย์แล้ว');}catch(e){error.textContent=e.message;}finally{button.disabled=false;}
});
document.getElementById('manageTeacherResetPassword').addEventListener('click',()=>{const teacher=TEACHERS_LIST.find(item=>item.id===manageTeacherId);document.getElementById('manageTeacherDialog').close();openTeacherPasswordReset(manageTeacherId,teacher?`${teacher.firstName} ${teacher.lastName}`:'-');});
document.getElementById('manageTeacherResetLockout').addEventListener('click',async event=>{
  const button=event.currentTarget, original=button.textContent, error=document.getElementById('manageTeacherError');
  button.disabled=true;error.textContent='';
  try{await apiResetTeacherLoginLockouts();showToast('ปลดล็อกการเข้าสู่ระบบของอาจารย์ทุกคนแล้ว');}
  catch(e){error.textContent=e.message;}
  finally{button.disabled=false;button.textContent=original;}
});
document.getElementById('manageTeacherDelete').addEventListener('click',async()=>{if(!confirm('ลบบัญชีอาจารย์นี้? ชุดข้อสอบที่เคยสร้างไว้จะยังอยู่แต่จะไม่ผูกกับบัญชีนี้อีกต่อไป'))return;try{await apiDeleteTeacher(manageTeacherId);document.getElementById('manageTeacherDialog').close();await refreshTeachers();showToast('ลบบัญชีอาจารย์แล้ว');}catch(e){document.getElementById('manageTeacherError').textContent=e.message;}});
let resetTeacherId='';
function openTeacherPasswordReset(id,name){
  resetTeacherId=id;
  document.getElementById('resetTeacherName').textContent=name||'-';
  document.getElementById('resetTeacherPassword').value='';
  document.getElementById('resetTeacherPasswordConfirm').value='';
  document.querySelectorAll('[data-toggle-password]').forEach(button=>{const input=document.getElementById(button.dataset.togglePassword);input.type='password';button.textContent='👁';});
  document.getElementById('resetTeacherPasswordError').textContent='';
  const dialog=document.getElementById('resetTeacherPasswordDialog');dialog.showModal();setTimeout(()=>document.getElementById('resetTeacherPassword').focus(),0);
}
document.getElementById('cancelTeacherPasswordReset').addEventListener('click',()=>document.getElementById('resetTeacherPasswordDialog').close());
document.querySelectorAll('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.togglePassword);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'👁':'🙈';}));
document.getElementById('confirmTeacherPasswordReset').addEventListener('click',async()=>{
  const password=document.getElementById('resetTeacherPassword').value,confirmPassword=document.getElementById('resetTeacherPasswordConfirm').value,error=document.getElementById('resetTeacherPasswordError'),button=document.getElementById('confirmTeacherPasswordReset');
  if(password.length<8){error.textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return;}
  if(password!==confirmPassword){error.textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';return;}
  button.disabled=true;
  try{await apiResetTeacherPassword(resetTeacherId,password);document.getElementById('resetTeacherPasswordDialog').close();showToast('รีเซ็ตรหัสผ่านแล้ว อาจารย์ต้องเข้าสู่ระบบใหม่');}
  catch(e){error.textContent=e.message;}
  finally{button.disabled=false;}
});
document.getElementById('addTeacherBtn').addEventListener('click', async ()=>{
  const firstName = document.getElementById('ftFirst').value.trim();
  const lastName = document.getElementById('ftLast').value.trim();
  const username = document.getElementById('ftUsername').value.trim();
  const password = document.getElementById('ftPassword').value;
  const email = document.getElementById('ftEmail').value.trim();
  const department = document.getElementById('ftDepartment').value.trim();
  if(!firstName || !lastName || !username || !password || !department || !email){ showToast('กรอกข้อมูลอาจารย์ สาขาวิชา และอีเมลให้ครบทุกช่อง'); return; }
  try{
    await apiAddTeacher({firstName, lastName, username, password, department, email});
    ['ftFirst','ftLast','ftUsername','ftPassword','ftDepartment','ftEmail'].forEach(id=>document.getElementById(id).value='');
    refreshTeachers();
    showToast('เพิ่มบัญชีอาจารย์แล้ว');
  }catch(e){ showToast(e.message); }
});
document.getElementById('downloadTeacherTemplateBtn').addEventListener('click',event=>{
  event.preventDefault();
  const link=document.createElement('a');link.href='/api/teachers/import-template.xlsx';
  fetch(link.href,{headers:{'x-admin-key':adminKey||''}}).then(async response=>{if(!response.ok)throw new Error('ดาวน์โหลดไฟล์ตัวอย่างไม่สำเร็จ');const blob=await response.blob();link.href=URL.createObjectURL(blob);link.download='teacher-account-template.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}).catch(error=>showToast(error.message));
});
document.getElementById('downloadStudentTemplateBtn')?.addEventListener('click',event=>{
  event.preventDefault();
  const link=document.createElement('a');link.href='/api/students/import-template.xlsx';
  fetch(link.href,{headers:{'x-admin-key':adminKey||''}}).then(async response=>{if(!response.ok)throw new Error('ดาวน์โหลดไฟล์ตัวอย่างไม่สำเร็จ');const blob=await response.blob();link.href=URL.createObjectURL(blob);link.download='student-import-template.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}).catch(error=>showToast(error.message));
});
document.getElementById('importTeachersExcelBtn').addEventListener('click',async()=>{
  const input=document.getElementById('teacherExcelFile'),file=input.files?.[0],button=document.getElementById('importTeachersExcelBtn'),report=document.getElementById('teacherImportReport');
  if(!file){showToast('กรุณาเลือกไฟล์ Excel');return;}
  button.disabled=true;button.textContent='กำลังนำเข้า...';report.innerHTML='';
  try{const result=await apiImportTeachersExcel(file);input.value='';await refreshTeachers();report.innerHTML=`<div class="empty-note" style="margin-top:12px;">นำเข้าสำเร็จ ${result.imported} บัญชี${result.errors.length?` · พบข้อผิดพลาด ${result.errors.length} แถว<br><small>${result.errors.map(escapeHtml).join('<br>')}</small>`:''}</div>`;showToast(`นำเข้าสำเร็จ ${result.imported} บัญชี`);}
  catch(error){report.innerHTML=`<div class="empty-note" style="margin-top:12px;color:var(--red);">${escapeHtml(error.message)}</div>`;}
  finally{button.disabled=false;button.textContent='นำเข้าบัญชี';}
});

async function refreshScoreEmails(){
  const wrap=document.getElementById('scoreEmailsWrap');
  wrap.innerHTML='<div class="loading-note">กำลังโหลด...</div>';
  try{
    const status=await apiGetScoreEmailStatus();
    if(!status.configured){wrap.innerHTML='<div class="empty-note">ยังไม่ได้ตั้งค่า RESEND_API_KEY และ SCORE_REPORT_FROM_EMAIL ในระบบโฮสต์</div>';return;}
    if(!status.recipients.length){wrap.innerHTML='<div class="empty-note">ยังไม่มีอาจารย์ที่มีผลสอบสำหรับจัดทำรายงาน</div>';return;}
    wrap.innerHTML=status.recipients.map(item=>`<div class="teacher-row-card"><div class="teacher-row-info"><b>${escapeHtml(item.teacherName||'-')}</b><div class="username">${escapeHtml(item.email||'ยังไม่มีอีเมล')}</div><div style="margin-top:7px;">${item.courses.map(course=>`<span class="status-pill" style="margin:2px 4px 2px 0;">${escapeHtml(course)}</span>`).join('')}</div>${item.lastRun?`<div class="username" style="margin-top:6px;">ส่งล่าสุด ${escapeHtml(new Date(item.lastRun.sentAt).toLocaleString('th-TH'))}</div>`:''}</div><button class="btn btn-primary btn-sm" data-send-score-email="${escapeAttr(item.teacherId)}" ${item.email?'':'disabled'}>${item.email?'✉ ส่ง '+item.courses.length+' รายวิชา':'กรุณาเพิ่มอีเมล'}</button></div>`).join('');
    wrap.querySelectorAll('[data-send-score-email]').forEach(button=>button.addEventListener('click',async()=>{const item=status.recipients.find(row=>row.teacherId===button.dataset.sendScoreEmail);if(!item||!confirm(`ส่งรายงานให้อาจารย์ ${item.teacherName}\nรวม ${item.courses.length} รายวิชาในไฟล์เดียวหรือไม่?`))return;button.disabled=true;button.textContent='กำลังเข้าคิว...';try{await apiSendScoreEmail(item.teacherId);showToast('นำรายงานเข้าคิวส่งแล้ว');setTimeout(refreshScoreEmails,1200);}catch(error){showToast(error.message);button.disabled=false;button.textContent='✉ ส่ง '+item.courses.length+' รายวิชา';}}));
  }catch(error){wrap.innerHTML='<div class="empty-note">'+escapeHtml(error.message)+'</div>';}
}
document.getElementById('refreshScoreEmailsBtn').addEventListener('click',refreshScoreEmails);
/* ======================================================================
   EXAM SETS
   ====================================================================== */
let ADMIN_SETS = [];
let setSearchQuery = '';
let TEACHERS_LIST = [];
let editingSet = null;
let editingIsNew = false;
let knownClasses = [];
let knownStudents = [];
let classPeriods = {};

function renderSetList(){
  const wrap = document.getElementById('setListWrap');
  const activeSets = ADMIN_SETS.filter(set=>!set.archived && !set.deletedAt);
  if(!activeSets.length){
    wrap.innerHTML = '<div class="empty-note">ยังไม่มีชุดข้อสอบ กด "เพิ่มชุดข้อสอบใหม่" เพื่อเริ่มสร้างชุดแรก</div>';
    return;
  }
  const query=setSearchQuery.trim().toLowerCase();
  const visibleSets=(query?activeSets.filter(set=>[
    set.courseName,set.title,set.tagline,set.desc,set.examType,set.subjectTeacherName
  ].some(value=>String(value||'').toLowerCase().includes(query))):activeSets).slice().sort((a,b)=>examOpenTimestamp(a)-examOpenTimestamp(b)||String(a.title||'').localeCompare(String(b.title||''),'th'));
  if(!visibleSets.length){
    wrap.innerHTML=`<div class="empty-note">ไม่พบชุดข้อสอบที่ตรงกับ “${escapeHtml(setSearchQuery)}”</div>`;
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
      const classesText = (s.assignedClasses && s.assignedClasses.length) ? s.assignedClasses.join(', ') : 'ทุกห้อง (ยังไม่จำกัดสิทธิ์)';
      const total = computeSetTotal(s);
      const examOpenDate=examOpenDateLabel(s);
      const examStatus=examScheduleStatus(s);
      const originalEnds=(s.examSchedules||[]).filter(item=>!item.absenceOnly).map(item=>normalizedExamTimestamp(item.availableUntil)).filter(Number.isFinite),finalEnd=originalEnds.length?Math.max(...originalEnds):NaN,examFinished=Number.isFinite(finalEnd)&&finalEnd<Date.now(),examNextDay=Number.isFinite(finalEnd)?new Date(finalEnd):null; if(examNextDay)examNextDay.setHours(24,0,0,0); const actionsExpired=!!examNextDay&&Date.now()>=examNextDay.getTime();
      return `<div class="set-card exam-status-${examStatus.key}">
        <div class="set-badge-row"><span class="badge-pill">${escapeHtml(s.examType||'-')}</span>${examOpenDate?`<span class="badge-pill exam-date-pill" title="วันที่เปิดข้อสอบ">วันที่สอบ ${escapeHtml(examOpenDate)}</span>`:''}<span class="badge-pill exam-status-pill status-${examStatus.key}">${escapeHtml(examStatus.label)}</span><span class="badge-pill academic-period-pill">${escapeHtml(s.academicYear&&s.semesterLabel?`${s.academicYear} / ${s.semesterLabel}`:'ยังไม่กำหนดเทอม')}</span></div>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.desc||'')}</p>
        <p style="color:var(--blue);">🏫 ${escapeHtml(classesText)}</p>
        ${s.subjectTeacherName ? `<p>👤 อาจารย์: ${escapeHtml(s.subjectTeacherName)}</p>` : ''}
        <p style="color:${total===20?'var(--green)':'var(--blue)'};">🎯 คะแนนเต็มรวม: ${total} คะแนน · ${total===20?'ข้อสอบปกติ':'บล็อกคอร์ส — แบ่งลงกลางภาค/ปลายภาค'}</p>
        <p style="color:var(--sub);font-size:11.5px;">${s.publishMode==='auto'?'⚡ ประกาศคะแนนอัตโนมัติ':'🔒 ต้องตรวจก่อนประกาศ'}${s.shuffleQuestions?' · 🔀 สุ่มโจทย์':''}${s.shuffleChoices?' · 🔀 สุ่มตัวเลือก':''}</p>
        <div class="set-actions set-actions-clear">
          ${!actionsExpired?`<button class="btn ${s.quickOpen?'btn-danger':examFinished?'btn-ghost':'btn-primary'} btn-sm" data-quick-open="${s.key}" data-open="${s.quickOpen?'0':'1'}">${s.quickOpen?'ยกเลิกการเปิดทันที':'เปิดข้อสอบทันที'}</button><button class="btn btn-ghost btn-sm" data-edit="${s.key}">แก้ไขข้อสอบ</button>`:''}
          ${examFinished?`<button class="btn btn-primary btn-sm" data-open-absentees="${s.key}">เปิดสอบเฉพาะผู้ขาดสอบ</button>`:''}
          <button class="btn btn-ghost btn-sm" data-exam-pdf="${s.key}">ดาวน์โหลดข้อสอบ PDF</button>
          <button class="btn btn-ghost btn-sm" data-archive="${s.key}">เก็บข้อสอบเข้าคลัง</button>
          ${!actionsExpired?`<button class="btn btn-danger btn-sm set-delete-action" data-del="${s.key}">ย้ายไปถังขยะ</button>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div class="course-group">
      <div class="course-group-head" data-togglegroup="1">
        <span class="course-group-title">📚 ${escapeHtml(course)}</span>
        <span class="course-group-count">${sets.length} ชุดข้อสอบ</span>
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
function renderTestLinkSelector(){
  const select=document.getElementById('testLinkSetSelect'); if(!select)return;
  const selected=select.value;
  const sets=ADMIN_SETS.filter(set=>!set.archived&&!set.deletedAt).slice().sort((a,b)=>String(a.courseName||a.title).localeCompare(String(b.courseName||b.title),'th'));
  select.innerHTML='<option value="">-- เลือกชุดข้อสอบ --</option>'+sets.map(set=>`<option value="${escapeAttr(set.key)}">${escapeHtml(set.courseName||set.title)} — ${escapeHtml(set.title)} (${escapeHtml(set.examType||'-')})</option>`).join('');
  select.value=sets.some(set=>set.key===selected)?selected:'';
}
async function createSelectedTestLink(){
  const select=document.getElementById('testLinkSetSelect'),resultEl=document.getElementById('testLinkResult'),key=select?.value;
  if(!key){showToast('กรุณาเลือกชุดข้อสอบ');return;}
  const button=document.getElementById('createTestLinkBtn'); button.disabled=true;
  try{const result=await apiCreateTestLink(key),url=location.origin+result.url;await navigator.clipboard.writeText(url);resultEl.innerHTML=`สร้างลิงก์แล้ว: <a href="${escapeAttr(url)}" target="_blank" rel="noopener">เปิดหน้าทดสอบข้อสอบ</a>`;showToast('สร้างและคัดลอกลิงก์ทดสอบแล้ว — ลิงก์เก่าถูกยกเลิก');}catch(error){showToast(error.message);}finally{button.disabled=false;}
}
async function openForAbsentees(key,button){const value=prompt('เปิดข้อสอบให้ผู้ขาดสอบกี่ชั่วโมง? (1-72)','24');if(value===null)return;const hours=Number(value);if(!Number.isFinite(hours)||hours<1||hours>72){showToast('กรุณาระบุ 1-72 ชั่วโมง');return;}button.disabled=true;try{const result=await apiOpenAbsentees(key,hours);ADMIN_SETS=await apiGetAdminSets();renderSetList();showToast(result.count?`เปิดข้อสอบให้ผู้ขาดสอบ ${result.count} คนแล้ว`:'ไม่พบผู้ขาดสอบที่ต้องเปิดสิทธิ์');}catch(error){button.disabled=false;showToast(error.message);}}
async function toggleQuickOpen(key,open,button){
  if(!open && !confirm('ยกเลิกการเปิดข้อสอบด่วน และกลับไปใช้ตารางสอบเดิม?')) return;
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
  if(!ranges.length)return {key:'unscheduled',label:'ยังไม่กำหนดเวลา',icon:'⚪'};
  if(ranges.some(range=>(!Number.isFinite(range.start)||range.start<=now)&&(!Number.isFinite(range.end)||range.end>=now)))return {key:'live',label:'กำลังสอบ',icon:'●'};
  const starts=ranges.map(range=>range.start).filter(Number.isFinite),ends=ranges.map(range=>range.end).filter(Number.isFinite);
  if(starts.length&&starts.every(start=>start>now))return {key:'upcoming',label:'ยังไม่สอบ',icon:'◷'};
  if(ends.length&&ends.every(end=>end<now))return {key:'finished',label:'สอบแล้ว',icon:'✓'};
  return {key:'upcoming',label:'รอรอบถัดไป',icon:'◷'};
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
  try{ await apiDeleteSetCall(key); ADMIN_SETS = await apiGetAdminSets(); renderSetList(); renderLibrarySetList(); populateSetFilterOptions(); showToast('ย้ายชุดข้อสอบไปถังขยะแล้ว'); }
  catch(e){ showToast(e.message); }
}
document.getElementById('newSetBtn').addEventListener('click', ()=> openEditor(null));
document.getElementById('createTestLinkBtn').addEventListener('click', createSelectedTestLink);
function dfdSetDraft(){ return { ...blankSet(), key:'object_analysis_design_dfd', title:'การวิเคราะห์และออกแบบเชิงวัตถุ: Data Flow Diagram', courseName:'การวิเคราะห์และออกแบบเชิงวัตถุ', tagline:'DFD Drawing Examination', desc:'ข้อสอบวาด Data Flow Diagram (Level 0, 1 และ 2)', delivery:'object-analysis-design', examType:'ปลายภาค', shuffleQuestions:false, shuffleChoices:false }; }
document.getElementById('newDfdSetBtn').addEventListener('click', ()=>{ const existing=ADMIN_SETS.find(set=>set.key==='object_analysis_design_dfd'); openEditor(existing?.key||null, existing?null:dfdSetDraft()); });
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
function formatExamDate(iso){ if(!iso) return ''; const d=new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
function formatExamTime(iso){ if(!iso) return ''; const d=new Date(iso); return `${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}`; }
function parseExamDateTime(dateValue,timeValue){ const date=String(dateValue||'').trim(),time=String(timeValue||'').trim(); if(!date&&!time) return ''; const d=date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),t=time.match(/^(\d{2})[.:](\d{2})$/); if(!d||!t){showToast('กรุณากรอกวัน dd/mm/yyyy และเวลา HH.MM');return '';} const inputYear=Number(d[3]),year=inputYear>=2400?inputYear-543:inputYear; const value=new Date(year,Number(d[2])-1,Number(d[1]),Number(t[1]),Number(t[2])); const valid=value.getFullYear()===year&&value.getMonth()===Number(d[2])-1&&value.getDate()===Number(d[1])&&value.getHours()===Number(t[1])&&value.getMinutes()===Number(t[2]); return valid?value.toISOString():''; }

function blankSet(){
  return {
    key: uid('set'), title:'', courseName:'', educationLevel:'', tagline:'', desc:'', examType: EXAM_TYPES[0]||'กลางภาค', teacherId:null, assignedClasses:[], examSchedules:[], subjectTeacherName:'', subjectTeacherDepartment:'', subjectTeacherEmail:'',
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
  document.getElementById('wizardTitleBar').textContent = editingIsNew ? '🧩 สร้างชุดข้อสอบใหม่' : ('🧩 แก้ไขชุดข้อสอบ: ' + (editingSet.title||''));
  renderWizard();
  // Let the browser paint the editor before requesting values used by later steps.
  const targetSet = editingSet;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ loadEditorReferenceData(targetSet); }));
}
async function loadEditorReferenceData(targetSet){
  const periods=['เช้า','บ่าย','ทวิภาคี'];
  const [classes,students,groups,teachers]=await Promise.all([
    apiGetClasses().catch(()=>[]),
    apiGetStudents().catch(()=>[]),
    Promise.all(periods.map(async period=>[period,await apiGetClasses(period)])).catch(()=>[]),
    apiGetTeachers().catch(()=>[])
  ]);
  if(editingSet!==targetSet) return;
  knownClasses=classes;
  knownStudents=students;
  classPeriods=Object.fromEntries(groups.flatMap(([period,rooms])=>rooms.map(room=>[room,period])));
  TEACHERS_LIST=teachers;
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
  const bar = document.getElementById('wizardStepsBar');
  const stepOrder = editingSet?.delivery==='object-analysis-design' ? ['info','access'] : WIZARD_STEP_ORDER;
  const currentTop = wizardStep.startsWith('section:') ? 'hub' : wizardStep;
  const curIdx = stepOrder.indexOf(currentTop);
  bar.innerHTML = stepOrder.map((key,idx)=>{
    const cls = key===currentTop ? 'active' : (idx<curIdx ? 'done' : '');
    return `<span class="wizard-step-chip ${cls}">${WIZARD_STEP_LABELS[key]}</span>`;
  }).join('<span class="wizard-step-arrow">→</span>');
}

/* ---------- Step 1: basic info ---------- */
function wizardInfoStepHtml(){
  const s = editingSet;
  return `<div class="panel">
    <h3>ข้อมูลชุดข้อสอบ</h3>
    <div class="field-row">
      <div class="field"><label>ชื่อวิชา (ใช้จัดกลุ่มข้อสอบกลางภาค/ปลายภาคเข้าด้วยกัน)</label><input type="text" id="fCourseName" value="${escapeAttr(s.courseName||'')}" placeholder="เช่น คณิตศาสตร์ ม.3"></div>
      <div class="field"><label>ประเภทข้อสอบ</label><select id="fExamType">${EXAM_TYPES.map(t=>`<option value="${escapeAttr(t)}" ${s.examType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ชื่อชุดข้อสอบ (แสดงให้นักเรียนเห็น)</label><input type="text" id="fTitle" value="${escapeAttr(s.title)}" placeholder="เช่น คณิตศาสตร์ ม.3 - กลางภาค"></div>
      <div class="field"><label>ระดับ <span style="color:#DC2626;">*</span></label><select id="fEducationLevel" required><option value="" ${s.educationLevel?'':'selected'} disabled>เลือกระดับ</option><option value="ปวช." ${s.educationLevel==='ปวช.'?'selected':''}>ปวช.</option><option value="ปวส." ${s.educationLevel==='ปวส.'?'selected':''}>ปวส.</option></select></div>
    </div>
    <div class="field"><label>คำอธิบายชุดข้อสอบ</label><textarea id="fDesc" placeholder="อธิบายเนื้อหาโดยย่อ">${escapeHtml(s.desc)}</textarea></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizCancelBtn" type="button">ยกเลิก</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">ถัดไป →</button>
  </div>`;
}

/* ---------- Step 2: classes + teacher ---------- */
function wizardAccessStepHtml(){
  const s = editingSet;
  return `<div class="panel">
    <h3>🏫 ห้องที่มีสิทธิสอบวิชานี้</h3>
    <p class="panel-sub">ถ้าไม่เพิ่มห้องใดเลย ระบบจะเปิดให้ทุกห้องสอบวิชานี้ได้ (ค่าเริ่มต้น)</p>
    <div class="chip-row" id="classChipRow"></div><div id="examSchedulesWrap"></div>
    <div class="add-chip-row">
      <select id="schedulePeriodFilter" class="filter-select" aria-label="กรองรอบเรียน"><option value="">ทุกรอบเรียน</option><option value="เช้า">รอบเช้า</option><option value="บ่าย">รอบบ่าย</option><option value="ทวิภาคี">รอบทวิภาคี</option></select>
      <select id="classGroupSelect" class="filter-select" aria-label="เลือกห้องจากกลุ่ม">
        ${buildGroupedClassOptions(knownClasses)}
      </select>
      <input type="text" id="addClassInput" list="knownClassesList" placeholder="พิมพ์ชื่อห้อง เช่น ม.3/1 แล้วกดเพิ่ม">
      <datalist id="knownClassesList">${knownClasses.map(c=>`<option value="${escapeAttr(c)}">`).join('')}</datalist>
      <button class="btn btn-ghost btn-sm" id="addClassBtn" type="button">+ เพิ่มห้อง</button>
    </div>
  </div>
  <div class="panel">
    <h3>👤 อาจารย์ประจำวิชา</h3>
    <p class="panel-sub">เลือกจากบัญชีอาจารย์ในระบบเพื่อให้อาจารย์เห็นวิชานี้ในระบบของตัวเอง หรือกรอกชื่อเองถ้ายังไม่มีบัญชี</p>
    <div class="field-row">
      <div class="field"><label>เลือกอาจารย์ (ถ้ามีบัญชีในระบบ)</label><select id="fTeacherSelect">
        <option value="">— ไม่ผูกกับบัญชี (กรอกชื่อเอง) —</option>
        ${TEACHERS_LIST.map(t=>`<option value="${t.id}" ${s.teacherId===t.id?'selected':''}>${escapeHtml(t.firstName+' '+t.lastName)} (${escapeHtml(t.username)})</option>`).join('')}
      </select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ชื่ออาจารย์ (แสดงในรายงาน)</label><input type="text" id="fTeacherName" value="${escapeAttr(s.subjectTeacherName||'')}" placeholder="เช่น อ.สมศรี ใจงาม"></div>
      <div class="field"><label>อีเมลอาจารย์ (ถ้ามี)</label><input type="email" id="fTeacherEmail" value="${escapeAttr(s.subjectTeacherEmail||'')}" placeholder="teacher@school.ac.th"></div>
    </div>
    <div class="field"><label>สาขาวิชา</label><input type="text" id="fTeacherDepartment" value="${escapeAttr(s.subjectTeacherDepartment||'')}" placeholder="เช่น เทคโนโลยีสารสนเทศ"></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">← ย้อนกลับ</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">${s.delivery==='object-analysis-design'?'💾 บันทึกข้อสอบ DFD':'ถัดไป →'}</button>
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
  return '<option value="">เลือกห้องจากกลุ่ม</option>'+order.map(group=>{
    const rooms=groups.get(group);
    if(!rooms.length) return '';
    return `<optgroup label="${escapeAttr(group)}">${rooms.map(room=>`<option value="${escapeAttr(room)}">${escapeHtml(room)}</option>`).join('')}</optgroup>`;
  }).join('');
}

/* ---------- Step 3: choose sections ---------- */
function wizardSectionsStepHtml(){
  return `<div class="panel">
    <h3>เลือกส่วนของข้อสอบ</h3>
    <p class="panel-sub">เลือกเฉพาะส่วนที่ต้องการใช้ได้อย่างอิสระ — หากไม่เพิ่มส่วนนั้น นักเรียนจะไม่เห็นส่วนนั้นตอนสอบ</p>
    <div class="section-manager-row" id="sectionManagerRow"></div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">← ย้อนกลับ</button>
    <button class="btn btn-primary" id="wizNextBtn" type="button">ถัดไป → ไปยังรายการส่วนข้อสอบ</button>
  </div>`;
}

/* ---------- Step 4: hub (mirrors the student's exam hub) ---------- */
function wizardHubStepHtml(){
  const s = editingSet;
  const total = computeSetTotal(s);
  const ok = total>0;
  const labels = {mc:'📝 ปรนัย', matching:'🔗 จับคู่', written:'✍️ อัตนัย'};
  const descBy = {mc:'เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ', matching:'จับคู่รายการซ้าย-ขวาให้สัมพันธ์กัน', written:'เขียนตอบด้วยคำพูดของตนเอง'};
  const cards = ['mc','matching','written'].filter(sec=>editingUiEnabled[sec]).map(sec=>{
    const count = sec==='mc' ? s.sections.mc.questions.length : sec==='matching' ? s.sections.matching.left.length : s.sections.written.questions.length;
    return `<div class="lv-card">
      <h3>${labels[sec]}</h3>
      <div class="lv-desc">${descBy[sec]}<br><b>${count} ${sec==='matching'?'คู่':'ข้อ'}</b></div>
      <button class="btn btn-primary" data-entersec="${sec}" type="button">${count>0?'แก้ไขส่วนนี้':'เพิ่มข้อสอบส่วนนี้'}</button>
    </div>`;
  }).join('');
  return `<div class="hub-inner" style="max-width:none;padding:0;">
    <h2>รายการส่วนข้อสอบ</h2>
    <p class="sub">คลิกเข้าไปเพิ่ม/แก้ไขคำถามในแต่ละส่วน — เหมือนหน้าที่นักเรียนเห็นตอนทำข้อสอบ</p>
    <div class="total-indicator ${ok?'ok':'warn'}" style="margin-bottom:16px;">🎯 คะแนนเต็มรวมขณะนี้: ${total} คะแนน · ${total>0?scoreModeSummary(total):'⚠️ กรุณากำหนดคะแนน'}</div>
    <div class="lv-grid">${cards}</div>
  </div>
  <div class="wizard-nav-row">
    <button class="btn btn-ghost" id="wizBackBtn" type="button">← ย้อนกลับไปเลือกส่วน</button>
  </div>`;
}

/* ---------- Section detail step ---------- */
function wizardSectionDetailHtml(sec){
  let html = `<button class="btn btn-ghost btn-sm" id="wizBackToHubBtn" type="button" style="margin-bottom:16px;">← กลับไปยังรายการส่วนข้อสอบ</button>`;
  if(sec==='mc') html += mcSettingsHeaderHtml();
  html += `<div id="sectionDetailBody"></div>`;
  return html;
}
function mcSettingsHeaderHtml(){
  const s = editingSet;
  return `<div class="panel">
    <h3>⚙️ การประกาศผลและการสุ่มข้อสอบ</h3>
    <div class="field-row">
      <div class="field">
        <label>โหมดประกาศผล</label>
        <select id="fPublishMode">
          <option value="manual" ${s.publishMode!=='auto'?'selected':''}>ต้องให้อาจารย์ตรวจสอบก่อนจึงประกาศ (ค่าเริ่มต้น)</option>
          <option value="auto" ${s.publishMode==='auto'?'selected':''}>ประกาศคะแนนให้นักเรียนทันทีที่ส่งคำตอบ</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:normal;color:var(--ink);"><input type="checkbox" id="fShuffleQuestions" ${s.shuffleQuestions?'checked':''} style="width:16px;height:16px;"> สุ่มลำดับโจทย์ (แต่ละคนเห็นข้อสอบเรียงไม่เหมือนกัน)</label>
    </div>
    <div class="field-row">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:normal;color:var(--ink);"><input type="checkbox" id="fShuffleChoices" ${s.shuffleChoices?'checked':''} style="width:16px;height:16px;"> สุ่มลำดับตัวเลือกปรนัย (แต่ละคนเห็นตัวเลือกเรียงไม่เหมือนกัน)</label>
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
      if(confirm('ยกเลิกการแก้ไข? การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป')) closeEditor();
    });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{
      if(!s.title || !s.title.trim()){ alert('กรุณากรอกชื่อชุดข้อสอบ'); return; }
      if(!['ปวช.','ปวส.'].includes(s.educationLevel)){ alert('กรุณาเลือกระดับ ปวช. หรือ ปวส.'); return; }
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
      if(val && !classPeriods[val]){ showToast('ห้อง '+val+' ยังไม่ได้กำหนดรอบเรียน กรุณาตั้งรอบเรียนของห้องก่อน'); return; }
      if(val && classEducationLevelForName(val)!==s.educationLevel){ showToast('กรุณาเลือกห้องระดับ '+s.educationLevel+' ให้ตรงกับชุดข้อสอบ'); return; }
      const selectedPeriod=document.getElementById('schedulePeriodFilter').value;
      if(val && selectedPeriod && classPeriods[val]!==selectedPeriod){ showToast('ห้อง '+val+' ไม่ได้อยู่ในรอบที่กรองไว้'); return; }
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
    document.getElementById('fTeacherSelect').addEventListener('change', (e)=>{
      s.teacherId = e.target.value || null;
      const t = TEACHERS_LIST.find(x=>x.id===e.target.value);
      if(t){ s.subjectTeacherName = t.firstName+' '+t.lastName; s.subjectTeacherEmail=t.email||''; s.subjectTeacherDepartment=t.department||''; document.getElementById('fTeacherName').value=s.subjectTeacherName; document.getElementById('fTeacherEmail').value=s.subjectTeacherEmail; document.getElementById('fTeacherDepartment').value=s.subjectTeacherDepartment; }
    });
    document.getElementById('fTeacherName').addEventListener('input', e=>{ s.subjectTeacherName = e.target.value; });
    document.getElementById('fTeacherEmail').addEventListener('input', e=>{ s.subjectTeacherEmail = e.target.value; });
    document.getElementById('fTeacherDepartment').addEventListener('input', e=>{ s.subjectTeacherDepartment = e.target.value; });
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
  if(wizardStep==='hub'){ const el = document.querySelector('.total-indicator'); if(el){ const total = computeSetTotal(editingSet); const ok = total>0; el.className = 'total-indicator '+(ok?'ok':'warn'); el.textContent = `🎯 คะแนนเต็มรวมขณะนี้: ${total} คะแนน · ${ok?scoreModeSummary(total):'⚠️ กรุณากำหนดคะแนน'}`; } }
}

function scheduleNameForPeriod(period){ return ({เช้า:'รอบเช้า',บ่าย:'รอบบ่าย',ทวิภาคี:'รอบทวิภาคี'})[period]||''; }
function syncExamSchedulesFromAssignedClasses(){
  const s=editingSet, absenceSchedules=(s.examSchedules||[]).filter(item=>item.absenceOnly),previous=new Map((s.examSchedules||[]).filter(item=>!item.absenceOnly).map(item=>[item.name,item])); const groups=new Map();
  s.assignedClasses.forEach(room=>{const name=scheduleNameForPeriod(classPeriods[room]);if(name){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(room);}});
  s.examSchedules=[...groups.entries()].map(([name,classes])=>Object.assign({name,classes,studentIds:[],availableFrom:'',availableUntil:'',lateAccessCode:''},previous.get(name)||{}, {name,classes})).concat(absenceSchedules);
}
function renderExamSchedules(){
  const host=document.getElementById('examSchedulesWrap'); if(!host) return; const s=editingSet;
  const picker=document.getElementById('classGroupSelect'); const selectedPeriod=document.getElementById('schedulePeriodFilter')?.value||'';
  if(picker){picker.innerHTML=buildGroupedClassOptions(knownClasses.filter(room=>!s.assignedClasses.includes(room)&&classEducationLevelForName(room)===s.educationLevel&&(!selectedPeriod||classPeriods[room]===selectedPeriod)));}
  if(!s.examSchedules.length){host.innerHTML='<div class="mini-card" style="margin:14px 0;"><h3 style="margin:0 0 4px;">🗓️ รอบสอบแยกตามห้อง</h3><p class="panel-sub">เลือกห้องด้านล่างก่อน ระบบจะแยกห้องเข้ารอบตามรอบเรียนที่ตั้งไว้ให้ทันที</p></div>';return;}
  host.innerHTML=`<div class="mini-card" style="margin:14px 0;"><h3 style="margin:0 0 4px;">🗓️ รอบสอบแยกตามห้อง</h3><p class="panel-sub">ระบบจัดกลุ่มตามรอบเรียนของห้องอัตโนมัติ กำหนดวันและเวลาเฉพาะเมื่อจำเป็น — เว้นว่างไว้เพื่อเปิดสอบตลอดเวลา</p>${s.examSchedules.map((item,index)=>{const period=classPeriods[item.classes[0]],kind=period==='บ่าย'?'afternoon':period==='ทวิภาคี'?'cooperative':'';return `<div class="exam-schedule-card ${kind}"><div class="schedule-card-head"><div><h4>${escapeHtml(item.name)}</h4><p>แสดงจากรอบเรียนที่กำหนดให้ห้อง</p></div></div><div class="field schedule-room-field"><label>ห้องในรอบนี้</label><div class="chip-row">${item.classes.map((room,roomIndex)=>`<span class="chip">${escapeHtml(room)}<button type="button" data-remove-schedule-room="${index}:${roomIndex}">✕</button></span>`).join('')}</div></div><div class="schedule-time-grid"><div class="field"><label>วันเริ่มสอบ</label><input type="text" data-schedule-start-date="${index}" value="${formatExamDate(item.availableFrom)}" placeholder="dd/mm/yyyy"></div><div class="field"><label>เวลาเริ่มสอบ</label><input type="text" data-schedule-start-time="${index}" value="${formatExamTime(item.availableFrom)}" placeholder="09.00"></div><div class="field"><label>วันสิ้นสุด</label><input type="text" data-schedule-end-date="${index}" value="${formatExamDate(item.availableUntil)}" placeholder="dd/mm/yyyy"></div><div class="field"><label>เวลาสิ้นสุด</label><input type="text" data-schedule-end-time="${index}" value="${formatExamTime(item.availableUntil)}" placeholder="10.00"></div></div></div>`;}).join('')}</div>`;
  host.querySelectorAll('.exam-schedule-card').forEach((card,index)=>{const item=s.examSchedules[index];const field=document.createElement('div');field.className='field schedule-late-code-field';field.innerHTML=`<label>รหัสเข้าสอบหลังเกินเวลาทำข้อสอบหรือเข้าสอบย้อนหลัง (ถ้ามี)</label><input type="text" data-schedule-late-code="${index}" value="${escapeAttr(item.lateAccessCode||'')}" placeholder="เช่น LATE2569">`;card.append(field);});
  host.querySelectorAll('.exam-schedule-card').forEach((card,index)=>{
    const item=s.examSchedules[index]; item.studentIds=Array.isArray(item.studentIds)?item.studentIds:[];
    const field=document.createElement('div'); field.className='schedule-student-access';
    field.innerHTML=`<label>นักเรียนที่มีสิทธิ์สอบเพิ่มเติม (รายคน)</label><div class="chip-row">${item.studentIds.map((id,studentIndex)=>{const student=knownStudents.find(value=>value.studentId===id);return `<span class="chip">${escapeHtml(student?`${student.studentId} ${student.firstName} ${student.lastName} · ${student.classRoom}`:id)}<button type="button" data-remove-schedule-student="${index}:${studentIndex}">✕</button></span>`;}).join('')}</div><div class="schedule-student-picker"><input type="text" data-schedule-student-input="${index}" autocomplete="off" placeholder="พิมพ์รหัสหรือชื่ออย่างน้อย 5 ตัว"><button type="button" class="btn secondary" data-add-schedule-student="${index}">+ เพิ่มรายคน</button></div><div class="schedule-student-results" data-schedule-student-results="${index}"></div><small>ระบบจะเริ่มค้นหาเมื่อพิมพ์ครบ 5 ตัว โดยใช้วันและเวลาของรอบนี้</small>`;
    card.append(field);
  });
  const sync=index=>{const item=s.examSchedules[index];item.availableFrom=parseExamDateTime(host.querySelector(`[data-schedule-start-date="${index}"]`).value,host.querySelector(`[data-schedule-start-time="${index}"]`).value);item.availableUntil=parseExamDateTime(host.querySelector(`[data-schedule-end-date="${index}"]`).value,host.querySelector(`[data-schedule-end-time="${index}"]`).value);item.lateAccessCode=host.querySelector(`[data-schedule-late-code="${index}"]`).value.trim();};
  host.querySelectorAll('[data-schedule-start-date],[data-schedule-start-time],[data-schedule-end-date],[data-schedule-end-time],[data-schedule-late-code]').forEach(input=>input.addEventListener('change',()=>sync(Number(input.dataset.scheduleStartDate??input.dataset.scheduleStartTime??input.dataset.scheduleEndDate??input.dataset.scheduleEndTime??input.dataset.scheduleLateCode))));
  host.querySelectorAll('[data-schedule-late-code]').forEach(input=>input.addEventListener('input',()=>{s.examSchedules[Number(input.dataset.scheduleLateCode)].lateAccessCode=input.value.trim();}));
  host.querySelectorAll('[data-remove-schedule-room]').forEach(button=>button.addEventListener('click',()=>{const [index,room]=button.dataset.removeScheduleRoom.split(':').map(Number),name=s.examSchedules[index].classes[room];s.assignedClasses=s.assignedClasses.filter(item=>item!==name);syncExamSchedulesFromAssignedClasses();renderExamSchedules();renderClassChips();}));
  host.querySelectorAll('[data-add-schedule-student]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.addScheduleStudent),input=host.querySelector(`[data-schedule-student-input="${index}"]`),value=input.value.trim();const student=knownStudents.find(item=>item.studentId===value);if(!student){showToast('ไม่พบรหัสนักเรียนนี้');return;}const prior=s.examSchedules.find(item=>(item.studentIds||[]).includes(student.studentId));if(prior){showToast(`เพิ่มนักเรียนคนนี้ไว้ใน ${prior.name} แล้ว`);return;}s.examSchedules[index].studentIds.push(student.studentId);renderExamSchedules();}));
  host.querySelectorAll('[data-schedule-student-input]').forEach(input=>{let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{const term=input.value.trim().toLocaleLowerCase('th-TH'),index=input.dataset.scheduleStudentInput,list=host.querySelector(`[data-schedule-student-results="${index}"]`);if(term.length<5){list.innerHTML='';return;}const matches=knownStudents.filter(student=>`${student.studentId} ${student.firstName} ${student.lastName} ${student.classRoom}`.toLocaleLowerCase('th-TH').includes(term)).slice(0,20);list.innerHTML=matches.length?matches.map(student=>`<button type="button" class="schedule-student-result" data-student-result="${escapeAttr(student.studentId)}"><b>${escapeHtml(student.studentId)}</b><span>${escapeHtml(`${student.firstName} ${student.lastName}`)}</span><em>${escapeHtml(student.classRoom)}</em></button>`).join(''):'<div class="schedule-student-empty">ไม่พบนักเรียนที่ตรงกับคำค้นหา</div>';list.querySelectorAll('[data-student-result]').forEach(option=>option.addEventListener('click',()=>{input.value=option.dataset.studentResult;list.innerHTML='';input.focus();}));},180);});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();host.querySelector(`[data-add-schedule-student="${input.dataset.scheduleStudentInput}"]`)?.click();}});});
  host.querySelectorAll('[data-remove-schedule-student]').forEach(button=>button.addEventListener('click',()=>{const [index,studentIndex]=button.dataset.removeScheduleStudent.split(':').map(Number);s.examSchedules[index].studentIds.splice(studentIndex,1);renderExamSchedules();}));
}
function renderClassChips(){
  const s = editingSet;
  const row = document.getElementById('classChipRow');
  if(!row) return;
  if(!s.assignedClasses.length){
    row.innerHTML = `<div class="chip-empty-note">ยังไม่ได้จำกัดห้อง — ตอนนี้ทุกห้องสอบวิชานี้ได้</div>`;
    return;
  }
  row.innerHTML = s.assignedClasses.map((c,i)=>`<span class="chip">${escapeHtml(c)}<button type="button" data-rmclass="${i}">✕</button></span>`).join('');
  row.querySelectorAll('[data-rmclass]').forEach(b=>b.addEventListener('click', ()=>{ s.assignedClasses.splice(parseInt(b.dataset.rmclass,10),1); syncExamSchedulesFromAssignedClasses(); renderClassChips(); renderExamSchedules(); }));
}

/* ---------- section manager (add/remove matching & written sections) ---------- */
function renderSectionManager(){
  const row = document.getElementById('sectionManagerRow');
  const labels = {mc:'📝 ปรนัย', matching:'🔗 จับคู่', written:'✍️ อัตนัย'};
  let html = '';
  ['mc','matching','written'].forEach(sec=>{
    if(!editingUiEnabled[sec]) return;
    html += `<span class="section-tag">${labels[sec]}<button type="button" data-rmsection="${sec}" title="ลบส่วนนี้">✕</button></span>`;
  });
  const missing = ['mc','matching','written'].filter(sec=>!editingUiEnabled[sec]);
  if(missing.length){
    html += `<div class="add-section-dropdown">
      <button class="btn btn-ghost btn-sm" id="addSectionBtn" type="button">+ เพิ่มส่วน</button>
      <div class="add-section-menu hidden" id="addSectionMenu">
        ${missing.map(sec=>`<button type="button" data-addsection="${sec}">${sec==='mc'?'📝 เพิ่มส่วนปรนัย':sec==='matching'?'🔗 เพิ่มส่วนจับคู่':'✍️ เพิ่มส่วนอัตนัย'}</button>`).join('')}
      </div>
    </div>`;
  }
  row.innerHTML = html;
  row.querySelectorAll('[data-rmsection]').forEach(b=>b.addEventListener('click', ()=>{
    const sec = b.dataset.rmsection;
    if(!confirm('ลบส่วนนี้? ข้อสอบทั้งหมดในส่วนนี้จะถูกลบไปด้วย')) return;
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
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const s = editingSet.sections.mc;
  wrap.innerHTML = `<div class="panel">
    <div class="section-hero-card"><div><h3>📝 ปรนัย</h3><p>เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ</p></div><span class="section-count-badge">${s.questions.length} ข้อ</span></div>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>คะแนนรวมส่วนนี้ (หารเท่ากันทุกข้อ)</label><input type="number" step="0.5" id="mcSectionPoints" value="${s.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="mcCompactList"></div>
    <button class="add-row-btn" id="addMcBtn" type="button">+ เพิ่มข้อปรนัย</button>
    <button class="add-row-btn" id="toggleMcImportBtn" type="button" style="margin-top:8px;border-color:#A78BFA;color:var(--indigo);">✨ นำเข้าข้อปรนัยจาก ChatGPT</button>
    <div class="mc-import-box hidden" id="mcImportBox">
      <h4>1. สร้างข้อสอบด้วย ChatGPT</h4><p>คัดลอก Prompt นี้ไปวางใน ChatGPT แล้วแก้ไขหัวข้อหรือจำนวนข้อได้ตามต้องการ</p>
      <textarea id="mcPromptText" readonly>${escapeHtml(buildChatGptMcPrompt())}</textarea>
      <div class="editor-actions"><button class="btn btn-ghost btn-sm" id="copyMcPromptBtn" type="button">📋 คัดลอก Prompt</button></div>
      <h4 style="margin-top:16px;">2. วางข้อสอบที่ ChatGPT สร้าง</h4><p>รองรับรูปแบบ: 1. คำถาม / ก. ข. ค. ง. / เฉลย: ข — ตรวจสอบก่อนเพิ่มจริง</p>
      <textarea id="mcImportText" placeholder="1. CPU มีหน้าที่อะไร&#10;ก. แสดงผล&#10;ข. ประมวลผล&#10;ค. เก็บข้อมูล&#10;ง. พิมพ์เอกสาร&#10;เฉลย: ข"></textarea>
      <div class="editor-actions"><button class="btn btn-ghost btn-sm" id="previewMcImportBtn" type="button">ตรวจรูปแบบ</button><button class="btn btn-primary btn-sm" id="applyMcImportBtn" type="button" disabled>เพิ่มข้อที่ตรวจแล้ว</button></div>
      <div class="mc-import-preview" id="mcImportPreview"></div>
    </div>
    <div class="editor-actions"><button class="btn btn-primary" id="saveSetFromMcBtn" type="button">💾 บันทึกชุดข้อสอบ</button></div>
    <div id="mcEditorSlot"></div>
  </div>`;
  renderMcCompactList();
  document.getElementById('mcSectionPoints').addEventListener('input', (e)=>{
    s.sectionPointsTotal = parseFloat(e.target.value)||0;
    applyPointDistribution('mc'); renderMcCompactList();
  });
  document.getElementById('addMcBtn').addEventListener('click', ()=> openQuestionEditor('mc', null));
  bindMcImportEvents();
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
function bindQuestionBankEvents(){
  document.getElementById('saveMcToBankBtn').addEventListener('click', async ()=>{
    if(!editingSet.sections.mc.questions.length){ showToast('ยังไม่มีข้อปรนัยให้เก็บ'); return; }
    try{ const result=await apiFetch('/api/question-bank',{method:'POST',body:{questions:editingSet.sections.mc.questions.map(question=>({...question,courseName:editingSet.courseName||editingSet.title||''}))},admin:true}); showToast(`เพิ่มเข้าคลัง ${result.added} ข้อ`); }catch(error){ showToast(error.message); }
  });
  document.getElementById('loadMcFromBankBtn').addEventListener('click', async ()=>{
    try{
      const questions=await apiFetch('/api/question-bank',{admin:true});
      if(!questions.length){ showToast('คลังข้อสอบยังว่าง'); return; }
      const choices=questions.map((question,index)=>`${index+1}. ${question.text}`).join('\n');
      const selected=prompt(`พิมพ์หมายเลขข้อที่ต้องการ คั่นด้วยจุลภาค\n\n${choices}`); if(!selected) return;
      const indexes=[...new Set(selected.split(',').map(value=>parseInt(value.trim(),10)-1).filter(index=>index>=0&&index<questions.length))];
      if(!indexes.length){ showToast('ไม่พบหมายเลขข้อที่เลือก'); return; }
      editingSet.sections.mc.questions.push(...indexes.map(index=>{const question=questions[index];return {id:uid('mc'),text:question.text,choices:question.choices.slice(),answer:question.answer,points:0};}));
      applyPointDistribution('mc'); renderMcPanel(); showToast(`เพิ่มจากคลัง ${indexes.length} ข้อแล้ว`);
    }catch(error){ showToast(error.message); }
  });
}
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
  const s = editingSet.sections.mc;
  const wrap = document.getElementById('mcCompactList');
  if(!wrap) return;
  wrap.innerHTML = s.questions.map((q,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(q.text||'(ยังไม่ได้กรอกคำถาม)',70))}</span>
      <span class="compact-meta">${q.points||0} คะแนน</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">แก้ไข</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">ลบ</button>
    </div>`).join('') || `<p class="muted-note">ยังไม่มีข้อปรนัย</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('mc', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm('ลบข้อนี้?')) return;
    s.questions.splice(i,1);
    applyPointDistribution('mc');
    if(openQEditor && openQEditor.section==='mc' && openQEditor.index===i) openQEditor=null;
    renderMcPanel();
  }));
}
function mcEditorPanelHtml(index){
  const s = editingSet.sections.mc;
  const isNew = index===null;
  const q = isNew ? {text:'', choices:['','','',''], answer:0} : s.questions[index];
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?'เพิ่มข้อปรนัยใหม่':'แก้ไขข้อที่ '+(index+1)}</div>
    <div class="field"><label>โจทย์</label><textarea id="qeMcText" placeholder="พิมพ์คำถาม...">${escapeHtml(q.text)}</textarea></div>
    ${mcResourceEditorHtml(q,isNew)}
    ${q.choices.map((c,ci)=>`
      <div class="choice-edit-row">
        <input type="radio" name="qeMcAns" data-ci="${ci}" ${q.answer===ci?'checked':''} title="ทำเครื่องหมายคำตอบที่ถูกต้อง">
        <input type="text" class="qeMcChoice" data-ci="${ci}" value="${escapeAttr(c)}" placeholder="ตัวเลือกที่ ${ci+1}">
      </div>`).join('')}
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">ยกเลิก</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?'เพิ่มข้อนี้':'บันทึกการแก้ไข'}</button>
    </div>
  </div>`;
}
function mcResourceEditorHtml(q,isNew){
  const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]}));
  const attachments=(resources.attachments||[]).map(item=>`<li>${escapeHtml(item.name||'ไฟล์แนบ')}</li>`).join('')||'<li>ยังไม่มีไฟล์แนบ</li>';
  return `<div class="field"><label>รูปภาพหรือไฟล์แนบ (ไม่เกิน 5 MB)</label><input id="qeMcAsset" type="file" accept="image/*,.pdf,.docx,.pptx,.zip"><ul id="qeMcAssetList">${attachments}</ul></div>`;
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
  const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]}));
  const attachments=(resources.attachments||[]).map(item=>`<li>${escapeHtml(item.name||'ไฟล์แนบ')}</li>`).join('')||'<li>ยังไม่มีไฟล์แนบ</li>';
  return `<div class="field"><label>รูปภาพหรือไฟล์แนบ (ไม่เกิน 5 MB)</label><input id="qeWAsset" type="file" accept="image/*,.pdf,.docx,.pptx,.zip"><ul id="qeWAssetList">${attachments}</ul></div>`;
}
function writtenCodeResourceEditorHtml(q,isNew){ const resources=isNew?(openQEditor.resources||(openQEditor.resources={attachments:[]})):(q.resources||(q.resources={attachments:[]})); return `<div class="field"><label>โค้ดตั้งต้น/โค้ดประกอบโจทย์ (ถ้ามี)</label><select id="qeWCodeLanguage"><option value="">เลือกภาษา</option>${['C','C++','Java','HTML','SQL','อื่น ๆ'].map(x=>`<option ${resources.language===x?'selected':''}>${x}</option>`).join('')}</select><textarea id="qeWCode" placeholder="วางโค้ดที่ต้องการแสดงในโจทย์">${escapeHtml(resources.code||'')}</textarea></div>`; }
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
  if(!text){ alert('กรุณากรอกคำถาม'); return; }
  const choices = Array.from(document.querySelectorAll('.qeMcChoice')).map(el=>el.value.trim());
  if(choices.some(c=>!c)){ alert('กรุณากรอกตัวเลือกให้ครบทุกช่อง'); return; }
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
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const m = editingSet.sections.matching;
  wrap.innerHTML = `<div class="panel">
    <h3>🔗 ส่วนที่ 2 — จับคู่ <span style="font-weight:400;color:var(--sub);font-size:12px;">(${m.left.length} คู่)</span></h3>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>คะแนนรวมส่วนนี้ (หารเท่ากันทุกคู่)</label><input type="number" step="0.5" id="matchSectionPoints" value="${m.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="matchCompactList"></div>
    <button class="add-row-btn" id="addMatchBtn" type="button">+ เพิ่มคู่จับคู่</button>
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
  const m = editingSet.sections.matching;
  const wrap = document.getElementById('matchCompactList');
  if(!wrap) return;
  wrap.innerHTML = m.left.map((item,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(item.text||'(ว่าง)',30))} ↔ ${escapeHtml(truncateText(m.right[i].text||'(ว่าง)',30))}</span>
      <span class="compact-meta">${m.pointsEach||0} คะแนน</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">แก้ไข</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">ลบ</button>
    </div>`).join('') || `<p class="muted-note">ยังไม่มีคู่จับคู่</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('matching', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm('ลบคู่นี้?')) return;
    const lid = m.left[i].id;
    m.left.splice(i,1); m.right.splice(i,1);
    delete m.correctMap[lid];
    applyPointDistribution('matching');
    if(openQEditor && openQEditor.section==='matching' && openQEditor.index===i) openQEditor=null;
    renderMatchingPanel();
  }));
}
function matchingEditorPanelHtml(index){
  const m = editingSet.sections.matching;
  const isNew = index===null;
  const leftText = isNew ? '' : m.left[index].text;
  const rightText = isNew ? '' : m.right[index].text;
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?'เพิ่มคู่จับคู่ใหม่':'แก้ไขคู่ที่ '+(index+1)}</div>
    <div class="field-row">
      <div class="field"><label>รายการฝั่งซ้าย (โจทย์)</label><input type="text" id="qeMLeft" value="${escapeAttr(leftText)}" placeholder="เช่น CPU"></div>
      <div class="field"><label>รายการฝั่งขวา (คำตอบ)</label><input type="text" id="qeMRight" value="${escapeAttr(rightText)}" placeholder="เช่น หน่วยประมวลผลกลาง"></div>
    </div>
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">ยกเลิก</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?'เพิ่มคู่นี้':'บันทึกการแก้ไข'}</button>
    </div>
  </div>`;
}
function saveMatchingPairFromEditor(index){
  const leftText = document.getElementById('qeMLeft').value.trim();
  const rightText = document.getElementById('qeMRight').value.trim();
  if(!leftText || !rightText){ alert('กรุณากรอกทั้งสองฝั่ง'); return; }
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
  const wrap = document.getElementById('sectionDetailBody');
  if(!wrap) return;
  const s = editingSet.sections.written;
  wrap.innerHTML = `<div class="panel">
    <h3>✍️ ส่วนที่ 3 — อัตนัย <span style="font-weight:400;color:var(--sub);font-size:12px;">(${s.questions.length} ข้อ)</span></h3>
    <div class="field-row">
      <div class="field" style="max-width:260px;"><label>คะแนนรวมส่วนนี้ (หารเท่ากันทุกข้อ)</label><input type="number" step="0.5" id="writtenSectionPoints" value="${s.sectionPointsTotal||0}" min="0"></div>
    </div>
    <div class="compact-list" id="writtenCompactList"></div>
    <button class="add-row-btn" id="addWrittenBtn" type="button">+ เพิ่มข้ออัตนัย</button>
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
  const s = editingSet.sections.written;
  const wrap = document.getElementById('writtenCompactList');
  if(!wrap) return;
  wrap.innerHTML = s.questions.map((q,i)=>`
    <div class="compact-row">
      <span class="compact-idx">${i+1}.</span>
      <span class="compact-text">${escapeHtml(truncateText(q.text||'(ยังไม่ได้กรอกคำถาม)',70))}</span>
      <span class="compact-meta">${q.maxPoints||0} คะแนน</span>
      <button class="btn btn-ghost btn-sm" data-editq="${i}" type="button">แก้ไข</button>
      <button class="btn btn-danger btn-sm" data-delq="${i}" type="button">ลบ</button>
    </div>`).join('') || `<p class="muted-note">ยังไม่มีข้ออัตนัย</p>`;
  wrap.querySelectorAll('[data-editq]').forEach(b=>b.addEventListener('click', ()=> openQuestionEditor('written', parseInt(b.dataset.editq,10))));
  wrap.querySelectorAll('[data-delq]').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.delq,10);
    if(!confirm('ลบข้อนี้?')) return;
    s.questions.splice(i,1);
    applyPointDistribution('written');
    if(openQEditor && openQEditor.section==='written' && openQEditor.index===i) openQEditor=null;
    renderWrittenPanel();
  }));
}
function writtenEditorPanelHtml(index){
  const s = editingSet.sections.written;
  const isNew = index===null;
  const q = isNew ? {text:'', keywords:[], answerType:'text', answerCode:'', language:'c'} : s.questions[index];
  const isCode = q.answerType === 'code';
  return `<div class="q-editor-panel">
    <div class="q-editor-title">${isNew?'เพิ่มข้ออัตนัยใหม่':'แก้ไขข้อที่ '+(index+1)}</div>
    <div class="field"><label>โจทย์</label><textarea id="qeWText" placeholder="พิมพ์คำถาม...">${escapeHtml(q.text)}</textarea></div>
    <div class="field"><label>รูปแบบคำตอบ</label><select id="qeWAnswerType"><option value="text" ${!isCode?'selected':''}>อัตนัย (ตรวจคำสำคัญ)</option><option value="code" ${isCode?'selected':''}>💻 แก้ไขโค้ด (เทียบเฉลย)</option></select></div>
    <div class="field" id="qeWKeywordsWrap" ${isCode?'style="display:none"':''}><label>คำสำคัญสำหรับตรวจเบื้องต้น (คั่นด้วยจุลภาค , )</label><input type="text" id="qeWKeywords" value="${escapeAttr((q.keywords||[]).join(', '))}" placeholder="เช่น ฮาร์ดแวร์, ซอฟต์แวร์"></div>
    <div id="qeWCodeAnswerWrap" ${isCode?'':'style="display:none"'}><div class="field"><label>ภาษา</label><select id="qeWLanguage"><option value="c" ${q.language==='c'?'selected':''}>C</option><option value="cpp" ${q.language==='cpp'?'selected':''}>C++</option><option value="java" ${q.language==='java'?'selected':''}>Java</option></select></div><div class="field"><label>เฉลยโค้ด (ตัดช่องว่างและขึ้นบรรทัดใหม่ก่อนตรวจ)</label><textarea id="qeWAnswerCode" spellcheck="false" style="font-family:ui-monospace,Consolas,monospace;min-height:150px;">${escapeHtml(q.answerCode||'')}</textarea></div>${writtenCodeResourceEditorHtml(q,isNew)}</div><div id="qeWAttachmentWrap" ${isCode?'style="display:none"':''}>${writtenResourceEditorHtml(q,isNew)}</div>
    <div class="editor-actions">
      <button class="btn btn-ghost btn-sm" id="qeCancelBtn" type="button">ยกเลิก</button>
      <button class="btn btn-primary btn-sm" id="qeSaveBtn" type="button">${isNew?'เพิ่มข้อนี้':'บันทึกการแก้ไข'}</button>
    </div>
  </div>`;
}
function saveWrittenQuestionFromEditor(index){
  const text = document.getElementById('qeWText').value.trim();
  if(!text){ alert('กรุณากรอกคำถาม'); return; }
  const answerType = document.getElementById('qeWAnswerType').value;
  const answerCode = document.getElementById('qeWAnswerCode').value.trim();
  if(answerType==='code' && !answerCode){ alert('กรุณากรอกเฉลยโค้ด'); return; }
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
  if(openQEditor){ showToast('กรุณาบันทึกหรือยกเลิกการแก้ไขข้อคำถามก่อน'); return; }
  const s = editingSet;
  if(!editingUiEnabled.mc) Object.assign(s.sections.mc, {questions:[], sectionPointsTotal:0});
  if(!editingUiEnabled.matching) Object.assign(s.sections.matching, {left:[], right:[], correctMap:{}, pointsEach:0, sectionPointsTotal:0});
  if(!editingUiEnabled.written) Object.assign(s.sections.written, {questions:[], sectionPointsTotal:0});
  applyPointDistribution('mc'); applyPointDistribution('matching'); applyPointDistribution('written');
  if(!s.title || !s.title.trim()){ alert('กรุณากรอกชื่อชุดข้อสอบ (ย้อนกลับไปขั้นตอนที่ 1)'); wizardStep='info'; renderWizard(); return; }
  if(!['ปวช.','ปวส.'].includes(s.educationLevel)){ alert('กรุณาเลือกระดับ ปวช. หรือ ปวส. (ย้อนกลับไปขั้นตอนที่ 1)'); wizardStep='info'; renderWizard(); return; }
  const hasExamQuestions=s.sections.mc.questions.length||s.sections.matching.left.length||s.sections.written.questions.length;
  if(s.delivery!=='object-analysis-design' && !hasExamQuestions){ alert('กรุณาเพิ่มข้อสอบอย่างน้อย 1 ข้อ'); wizardStep='sections'; renderWizard(); return; }
  if(s.examSchedules.length){
    const invalid=s.examSchedules.find(item=>!(item.classes||[]).length||((item.availableFrom||item.availableUntil)&&(!item.availableFrom||!item.availableUntil||new Date(item.availableFrom)>=new Date(item.availableUntil))));
    if(invalid){ alert('กรุณาเลือกห้องให้ครบทุกรอบ และหากกำหนดเวลาให้กรอกวัน–เวลาเริ่มและสิ้นสุดให้ครบถ้วน'); wizardStep='access'; renderWizard(); return; }
    s.assignedClasses=[...new Set(s.examSchedules.flatMap(item=>item.classes||[]))];
  }
  isSavingSet = true;
  setSetSaveButtonsLoading(true);
  try{
    const response = editingIsNew ? await apiCreateSet(s) : await apiUpdateSet(s.key, s);
    if(editingIsNew && response?.key) s.key = response.key;
    const savedSet = JSON.parse(JSON.stringify(s));
    const existingIndex = ADMIN_SETS.findIndex(item=>item.key===savedSet.key);
    if(existingIndex >= 0) ADMIN_SETS.splice(existingIndex, 1, savedSet); else ADMIN_SETS.unshift(savedSet);
    closeEditor(); renderSetList(); populateSetFilterOptions();
    showToast('บันทึกชุดข้อสอบเรียบร้อยแล้ว นักเรียนในห้องที่กำหนดจะเห็นวิชานี้ทันที');
    // การรีเฟรชรายการเต็มไม่ควรทำให้หน้าบันทึกค้าง หากเครือข่ายช้า ให้ซิงก์ข้อมูลเบื้องหลังแทน
    apiGetAdminSets().then(sets=>{ ADMIN_SETS=sets; renderSetList(); populateSetFilterOptions(); }).catch(()=>{});
  }catch(e){
    showToast(e.message);
  }finally{
    isSavingSet = false;
    setSetSaveButtonsLoading(false);
  }
}

let studentPage=1; const STUDENT_PAGE_SIZE=50;
async function refreshStudents(){
  const wrap = document.getElementById('studentsWrap');
  wrap.innerHTML = '<div class="loading-note">กำลังโหลด...</div>';
  const classFilter = document.getElementById('classFilterSelect').value;
  let students;
  try{ students = await apiGetStudents(classFilter || undefined); }
  catch(e){ wrap.innerHTML = '<div class="empty-note">'+escapeHtml(e.message)+'</div>'; return; }

  try{
    const classes = await apiGetClasses();
    const sel = document.getElementById('classFilterSelect');
    const current = sel.value;
    sel.innerHTML = '<option value="">ทุกห้อง</option>' + classes.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = current;
    const roomSel=document.getElementById('roomPeriodSelect'); if(roomSel){
      const previous=roomSel.value;
      const periods=['เช้า','บ่าย','ทวิภาคี'];
      const groups=await Promise.all([apiGetClasses('unset'),...periods.map(period=>apiGetClasses(period))]);
      const labels=['ยังไม่ตั้งรอบ','รอบเช้า','รอบบ่าย','รอบทวิภาคี'];
      roomSel.innerHTML='<option value="">เลือกห้องเพื่อกำหนดหรือเปลี่ยนรอบ</option>'+groups.map((rooms,index)=>rooms.length?`<optgroup label="${labels[index]}">${rooms.map(room=>`<option value="${escapeAttr(room)}">${escapeHtml(room)}</option>`).join('')}</optgroup>`:'').join('');
      roomSel.value=previous;
    }
  }catch(e){}

  const search=String(document.getElementById('studentSearchInput').value||'').trim().toLowerCase();
  const matched=search?students.filter(student=>[student.studentId,student.firstName,student.lastName,student.classRoom].some(value=>String(value||'').toLowerCase().includes(search))):students;
  const pageCount=Math.max(1,Math.ceil(matched.length/STUDENT_PAGE_SIZE)); studentPage=Math.min(studentPage,pageCount); students=matched.slice((studentPage-1)*STUDENT_PAGE_SIZE,studentPage*STUDENT_PAGE_SIZE);
  if(!matched.length){
    wrap.innerHTML = '<div class="empty-note">ยังไม่มีรายชื่อนักเรียนในระบบ ลองนำเข้ารายชื่อด้านบน</div>';
    return;
  }
  wrap.innerHTML = `<table class="result-table"><thead><tr>
      <th>รหัสนักเรียน</th><th>ชื่อ</th><th>นามสกุล</th><th>ห้อง</th><th>รอบเรียน</th><th></th>
    </tr></thead><tbody>` + students.map(s=>`
      <tr>
        <td>${escapeHtml(s.studentId)}</td>
        <td>${escapeHtml(s.firstName)}</td>
        <td>${escapeHtml(s.lastName)}</td>
        <td>${escapeHtml(s.classRoom)}</td>
        <td>${escapeHtml(s.examPeriod||'ยังไม่กำหนด')}</td>
        <td><button class="btn btn-ghost btn-sm" data-editstu="${escapeAttr(s.studentId)}">แก้ชื่อ</button> <button class="btn btn-danger btn-sm" data-delstu="${escapeAttr(s.studentId)}">ลบ</button></td>
      </tr>`).join('') + `</tbody></table>`;
  const header = document.createElement('th');
  header.textContent = 'PIN';
  wrap.querySelector('thead tr').insertBefore(header, wrap.querySelector('thead tr').lastElementChild);
  wrap.querySelectorAll('tbody tr').forEach((row, index)=>{
    const student = students[index];
    const pinCell = document.createElement('td');
    const actionCell = row.lastElementChild;
    if(student.hasPin){
      pinCell.innerHTML = '<span class="pub-pill pub-yes">ตั้งแล้ว</span>';
      const resetButton = document.createElement('button');
      resetButton.className = 'btn btn-ghost btn-sm';
      resetButton.textContent = 'รีเซ็ต PIN';
      resetButton.dataset.resetpin = student.studentId;
      actionCell.prepend(resetButton, document.createTextNode(' '));
    } else {
      pinCell.innerHTML = '<span class="pub-pill pub-no">ยังไม่ตั้ง</span>';
    }
    row.insertBefore(pinCell, actionCell);
  });
  wrap.insertAdjacentHTML('beforeend',`<div class="editor-actions"><span class="muted-note">แสดง ${matched.length?((studentPage-1)*STUDENT_PAGE_SIZE+1):0}–${Math.min(studentPage*STUDENT_PAGE_SIZE,matched.length)} จาก ${matched.length} คน</span><button class="btn btn-ghost btn-sm" id="studentPrevBtn" ${studentPage===1?'disabled':''}>← ก่อนหน้า</button><button class="btn btn-ghost btn-sm" id="studentNextBtn" ${studentPage===pageCount?'disabled':''}>ถัดไป →</button></div>`);
  wrap.querySelector('#studentPrevBtn').addEventListener('click',()=>{studentPage--;refreshStudents();}); wrap.querySelector('#studentNextBtn').addEventListener('click',()=>{studentPage++;refreshStudents();});
  wrap.querySelectorAll('[data-editstu]').forEach(button=>button.addEventListener('click',async()=>{
    const student=students.find(item=>item.studentId===button.dataset.editstu); if(!student)return;
    const firstName=prompt('แก้ไขชื่อนักเรียน',student.firstName); if(firstName===null)return;
    const lastName=prompt('แก้ไขนามสกุลนักเรียน',student.lastName); if(lastName===null)return;
    if(!firstName.trim()||!lastName.trim()){showToast('ชื่อและนามสกุลต้องไม่ว่าง');return;}
    button.disabled=true;
    try{await apiUpdateStudent(student.studentId,{firstName:firstName.trim(),lastName:lastName.trim()});showToast('แก้ไขชื่อนักเรียนแล้ว');await refreshStudents();}
    catch(error){showToast(error.message);button.disabled=false;}
  }));
  wrap.querySelectorAll('[data-delstu]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('ลบนักเรียนรหัส '+b.dataset.delstu+' ออกจากระบบ?')) return;
    try{ await apiDeleteStudent(b.dataset.delstu); refreshStudents(); showToast('ลบนักเรียนแล้ว'); }
    catch(e){ showToast(e.message); }
  }));
  wrap.querySelectorAll('[data-resetpin]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('รีเซ็ต PIN ของนักเรียนรหัส '+b.dataset.resetpin+'? นักเรียนจะต้องตั้ง PIN ใหม่')) return;
    try{ await apiResetStudentPin(b.dataset.resetpin); refreshStudents(); showToast('รีเซ็ต PIN แล้ว'); }
    catch(e){ showToast(e.message); }
  }));
}
document.getElementById('refreshStudentsBtn').addEventListener('click', refreshStudents);
document.getElementById('classFilterSelect').addEventListener('change', ()=>{studentPage=1;refreshStudents();});
document.getElementById('studentSearchInput').addEventListener('input',()=>{studentPage=1;refreshStudents();});
document.querySelectorAll('[data-set-room-period]').forEach(button=>button.addEventListener('click',async()=>{ const room=document.getElementById('roomPeriodSelect').value; if(!room){showToast('กรุณาเลือกห้องก่อน');return;} try{const result=await apiSetClassExamPeriod(room,button.dataset.setRoomPeriod);showToast(`กำหนดรอบ${button.dataset.setRoomPeriod} ให้ห้อง ${room} จำนวน ${result.updated} คนแล้ว`);refreshStudents();}catch(error){showToast(error.message);} }));
document.getElementById('addStudentBtn').addEventListener('click', async ()=>{
  const studentId = document.getElementById('fsId').value.trim();
  const firstName = document.getElementById('fsFirst').value.trim();
  const lastName = document.getElementById('fsLast').value.trim();
  const classRoom = document.getElementById('fsClass').value.trim(); const examPeriod=document.getElementById('fsExamPeriod').value;
  if(!studentId || !firstName || !lastName || !classRoom){ showToast('กรอกข้อมูลนักเรียนให้ครบทุกช่อง'); return; }
  try{
    await apiAddStudent({studentId, firstName, lastName, classRoom, examPeriod});
    ['fsId','fsFirst','fsLast','fsClass','fsExamPeriod'].forEach(id=>document.getElementById(id).value='');
    refreshStudents();
    showToast('เพิ่มนักเรียนแล้ว');
  }catch(e){ showToast(e.message); }
});
document.getElementById('bulkImportBtn').addEventListener('click', async ()=>{
  const text = document.getElementById('bulkImportText').value;
  if(!text.trim()){ showToast('กรุณาวางรายชื่อก่อนนำเข้า'); return; }
  const btn = document.getElementById('bulkImportBtn');
  btn.disabled = true; btn.textContent = 'กำลังนำเข้า...';
  try{
    const result = await apiBulkImportStudents(text);
    const report = document.getElementById('importReport');
    report.innerHTML = `<div class="import-report">
      นำเข้าใหม่ ${result.imported} คน · อัปเดตข้อมูลเดิม ${result.updated} คน
      ${result.errors.length ? '<br><span class="err">พบปัญหา ' + result.errors.length + ' บรรทัด:<br>' + result.errors.map(escapeHtml).join('<br>') + '</span>' : ''}
    </div>`;
    document.getElementById('bulkImportText').value = '';
    refreshStudents();
  }catch(e){ showToast(e.message); }
  btn.disabled = false; btn.textContent = 'นำเข้ารายชื่อ';
});
function showImportReport(result){
  document.getElementById('importReport').innerHTML = `<div class="import-report">นำเข้าใหม่ ${result.imported} คน · อัปเดตข้อมูลเดิม ${result.updated} คน${result.errors?.length ? '<br><span class="err">พบปัญหา '+result.errors.length+' แถว:<br>'+result.errors.map(escapeHtml).join('<br>')+'</span>' : ''}</div>`;
}
async function downloadAdminFile(url, filename){
  const res=await fetch(url,{headers:{'x-admin-key':adminKey||''}}); if(res.status===401){ showSessionExpiredDialog(); throw new Error('หมดเวลาการเข้าสู่ระบบ'); } if(!res.ok){ const body=await res.json().catch(()=>({})); throw new Error(body.message||'ดาวน์โหลดไฟล์ไม่สำเร็จ'); }
  const blob=await res.blob(), link=document.createElement('a'), objectUrl=URL.createObjectURL(blob);
  const disposition=res.headers.get('content-disposition')||'';
  const encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const responseName=encodedName ? decodeURIComponent(encodedName) : disposition.match(/filename="?([^";]+)"?/i)?.[1];
  link.href=objectUrl; link.download=filename||responseName||'download'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
}
async function downloadExamPdf(setKey,button){
  const original=button?.textContent||'📄 PDF ต้นฉบับ';
  if(button){button.disabled=true;button.textContent='กำลังสร้าง PDF...';}
  try{ await downloadAdminFile('/api/export/exam.pdf?setKey='+encodeURIComponent(setKey)); showToast('ดาวน์โหลดต้นฉบับข้อสอบ PDF แล้ว'); }
  catch(error){ showToast(error.message); }
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
document.getElementById('importStudentsExcelBtn').addEventListener('click', async ()=>{
  const file=document.getElementById('studentExcelFile').files[0]; if(!file){ showToast('กรุณาเลือกไฟล์ Excel ก่อน'); return; }
  const btn=document.getElementById('importStudentsExcelBtn'); btn.disabled=true; btn.textContent='กำลังนำเข้า...';
  try{ const result=await apiImportStudentsExcel(file); showImportReport(result); document.getElementById('studentExcelFile').value=''; refreshStudents(); }
  catch(error){ showToast(error.message); }
  btn.disabled=false; btn.textContent='นำเข้า Excel';
});
document.getElementById('exportStudentsBtn').addEventListener('click', async ()=>{ try{ await downloadAdminFile('/api/students/export.xlsx','students.xlsx'); showToast('ดาวน์โหลดรายชื่อนักเรียนแล้ว'); }catch(error){ showToast(error.message); } });
async function downloadFullSystemBackup(){
  try{ await downloadAdminFile('/api/admin/backup.json','exam-system-backup.json'); showToast('ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมดแล้ว'); }
  catch(error){ showToast(error.message); }
}
document.getElementById('downloadBackupBtn').addEventListener('click', downloadFullSystemBackup);
document.getElementById('selectRestoreBackupBtn').addEventListener('click',()=>document.getElementById('restoreBackupFile').click());
document.getElementById('restoreBackupFile').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const button=document.getElementById('selectRestoreBackupBtn');
  try{
    if(file.size>25*1024*1024)throw new Error('ไฟล์สำรองต้องมีขนาดไม่เกิน 25 MB');
    const payload=JSON.parse((await file.text()).replace(/^\uFEFF/,'')),db=payload?.database||{};
    const keys=['sets','results','students','teachers','questionBank','drafts','auditLogs'];
    if(![1,2].includes(payload?.version)||!keys.every(key=>Array.isArray(db[key]))||!db.settings)throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูลของระบบ');
    const summary=`ชุดข้อสอบ ${db.sets.length} · ผลสอบ ${db.results.length} · นักเรียน ${db.students.length} · อาจารย์ ${db.teachers.length}`;
    if(!confirm(`ตรวจพบข้อมูลสำรองวันที่ ${new Date(payload.exportedAt).toLocaleString('th-TH')}\n${summary}\n\nการกู้คืนจะแทนที่ข้อมูลปัจจุบันทั้งหมด ต้องการดำเนินการต่อหรือไม่?`))return;
    if(prompt('ขั้นตอนสุดท้าย: พิมพ์ RESTORE เพื่อยืนยันการกู้คืนข้อมูลทั้งหมด')!=='RESTORE')return;
    button.disabled=true;button.textContent='กำลังกู้คืนข้อมูล...';
    const result=await apiRestoreSystemBackup(file);
    alert(`กู้คืนข้อมูลเรียบร้อยแล้ว\nนักเรียน ${result.counts.students} คน · ชุดข้อสอบ ${result.counts.sets} ชุด · ผลสอบ ${result.counts.results} รายการ`);
    window.location.reload();
  }catch(error){showToast(error.message);}
  finally{button.disabled=false;button.textContent='เลือกไฟล์เพื่อกู้คืน';event.target.value='';}
});

/* ======================================================================
   RESULTS + EXCEL EXPORT + PUBLISH
   ====================================================================== */
function populateSetFilterOptions(){
  const sel = document.getElementById('setFilterSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">ทุกรายวิชา</option>' + ADMIN_SETS.map(s=>`<option value="${escapeAttr(s.key)}">${escapeHtml(s.title)}</option>`).join('');
  sel.value = current;
  const years=[...new Set(ADMIN_SETS.map(set=>set.academicYear).filter(Boolean))].sort().reverse();
  const yearSelect=document.getElementById('academicYearFilterSelect'); const currentYear=yearSelect.value;
  yearSelect.innerHTML='<option value="">ทุกปีการศึกษา</option>'+years.map(year=>`<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`).join(''); yearSelect.value=years.includes(currentYear)?currentYear:'';
  const terms=[...new Map(ADMIN_SETS.filter(set=>set.semester).map(set=>[set.semester,set.semesterLabel||`เทอม ${set.semester}`])).entries()];
  const termSelect=document.getElementById('semesterFilterSelect'); const currentTerm=termSelect.value;
  termSelect.innerHTML='<option value="">ทุกภาคเรียน</option>'+terms.map(([id,label])=>`<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`).join(''); termSelect.value=terms.some(([id])=>id===currentTerm)?currentTerm:'';
}
let LAST_RESULTS = [];
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
function renderResultSubjectGroups(records){
  const groups=new Map();
  records.forEach(record=>{
    const key=record.questionKey||record.questionTitle||'unknown';
    if(!groups.has(key)) groups.set(key,{key,title:record.questionTitle||'ไม่ระบุรายวิชา',records:[]});
    groups.get(key).records.push(record);
  });
  return [...groups.values()].map(group=>{const publishedCount=group.records.filter(record=>record.published).length,allPublished=publishedCount===group.records.length,columns=resultScoreColumns(group.records,group.key),scoreMax=resultScoreMax(group.records,group.key);return `<div class="course-group result-subject-group">
    <div class="course-group-head" data-toggleresultgroup="1"><span class="course-group-title">📚 ${escapeHtml(group.title)}</span><span class="course-group-count">${group.records.length} คน · ประกาศแล้ว ${publishedCount} คน · กดเพื่อดูผลสอบ</span><span class="course-group-actions"><button class="btn btn-ghost btn-sm publish-set-btn" type="button" data-publish-set="${escapeAttr(group.key)}" data-title="${escapeAttr(group.title)}" ${allPublished?'disabled':''}>${allPublished?'✅ ประกาศผลแล้ว':'📣 ประกาศผล'}</button><button class="btn btn-analysis btn-sm" type="button" data-question-analysis="${escapeAttr(group.key)}">📊 วิเคราะห์ข้อสอบ</button>${GRADEBOOK_SET_KEYS.has(group.key)?`<button class="btn btn-primary btn-sm" type="button" data-export-gradebook="${escapeAttr(group.key)}">📊 Excel รวมคะแนน</button>`:''}</span></div>
    <div class="course-group-body collapsed" style="overflow-x:auto;"><table class="result-table"><thead><tr>
      <th>วันเวลา</th><th>รหัส</th><th>ชื่อนักเรียน</th><th>ห้อง</th><th>ประเภท</th><th>รายวิชา</th><th>อาจารย์</th>${columns.mc?'<th>ปรนัย</th>':''}${columns.matching?'<th>จับคู่</th>':''}${columns.written?'<th>อัตนัย</th>':''}<th>รวม/${scoreMax}</th><th>คลิกขวา</th><th>คัดลอก</th><th>สลับแท็บ</th><th></th>
    </tr></thead><tbody>${group.records.map(r=>`<tr data-row-id="${r.id}">
      <td>${new Date(r.submittedAt).toLocaleString('th-TH')}</td><td>${escapeHtml(r.studentId)}</td><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.classRoom)}</td><td>${escapeHtml(r.examType||'-')}</td><td>${escapeHtml(r.questionTitle)}</td><td>${escapeHtml(r.subjectTeacherName||'-')}</td>${columns.mc?`<td>${r.sectionScores.mc}</td>`:''}${columns.matching?`<td>${r.sectionScores.matching}</td>`:''}${columns.written?`<td>${r.sectionScores.written}</td>`:''}<td><b>${r.overallScore20}</b></td><td>${r.rightClickAttempts||0}</td><td>${r.copyAttempts||0}</td><td>${r.tabSwitches||0}</td>
      <td><div class="result-row-actions"><button class="btn btn-ghost btn-sm" data-viewdetail="${r.id}">ดูรายละเอียด</button><button class="btn btn-danger btn-sm" data-delres="${r.id}">ลบ</button></div></td>
    </tr>`).join('')}</tbody></table></div></div>`;}).join('');
}
function archivedResultPeriod(record){
  const set=ADMIN_SETS.find(item=>item.key===(record.questionKey||'')); if(!set)return null;
  const regular=(set.examSchedules||[]).filter(item=>item&&!item.absenceOnly),dates=(regular.length?regular.map(item=>item.availableFrom):[set.availableFrom]).map(normalizedExamTimestamp).filter(Number.isFinite);
  const olderThanThirtyDays=dates.length&&Date.now()-Math.max(...dates)>=30*86400000;
  if(!set.archived&&!olderThanThirtyDays)return null;
  const semester=String(set.semester||'').toLowerCase(),term=semester==='summer'?'s':(semester||'?'),yearText=String(set.academicYear||''),shortYear=yearText.length>=2?yearText.slice(-2):'?';
  return {key:`${set.examType||record.examType||'ข้อสอบ'}|${term}|${shortYear}`,label:`ผลสอบ ${set.examType||record.examType||'ข้อสอบ'} ${term}/${shortYear}`,sort:`${yearText.padStart(4,'0')}-${term==='s'?'3':term}`};
}
function renderResultGroups(records){
  const current=[],periods=new Map();
  records.forEach(record=>{const period=archivedResultPeriod(record);if(!period){current.push(record);return;}if(!periods.has(period.key))periods.set(period.key,{...period,records:[]});periods.get(period.key).records.push(record);});
  const currentHtml=renderResultSubjectGroups(current),periodHtml=[...periods.values()].sort((a,b)=>b.sort.localeCompare(a.sort)).map(period=>{const subjects=new Set(period.records.map(record=>record.questionKey||record.questionTitle)).size;return `<section class="result-period-group"><button class="result-period-head" type="button" data-toggle-result-period><span><b>🗂️ ${escapeHtml(period.label)}</b><small>${subjects} รายวิชา · ${period.records.length} ผลสอบ</small></span><span class="result-period-chevron">⌄</span></button><div class="result-period-body collapsed">${renderResultSubjectGroups(period.records)}</div></section>`;}).join('');
  return currentHtml+periodHtml;
}
async function refreshResults(){
  const wrap = document.getElementById('resultsWrap');
  wrap.innerHTML = '<div class="loading-note">กำลังโหลด...</div>';
  const setKey = document.getElementById('setFilterSelect').value;
  const examType = document.getElementById('examTypeFilterSelect').value;
  const academicYear = document.getElementById('academicYearFilterSelect').value;
  const semester = document.getElementById('semesterFilterSelect').value;
  let records;
  try{ const [resultRows,gradebookOptions]=await Promise.all([apiGetResults(setKey || undefined, examType || undefined, academicYear || undefined, semester || undefined),apiFetch('/api/gradebook/options',{admin:true})]); records=resultRows; GRADEBOOK_SET_KEYS=new Set(gradebookOptions.setKeys||[]); }
  catch(e){ wrap.innerHTML = '<div class="empty-note">'+escapeHtml(e.message)+'</div>'; return; }
  LAST_RESULTS = records;
  if(!records || !records.length){
    wrap.innerHTML = '<div class="empty-note">ยังไม่มีผลสอบส่งเข้ามา</div>';
    return;
  }
  wrap.innerHTML = renderResultGroups(records);
  wrap.querySelectorAll('[data-delres]').forEach(b=>b.addEventListener('click', async ()=>{
    const reason=askChangeReason('ลบผลสอบรายการนี้'); if(reason===null) return;
    try{ await apiFetch('/api/results/'+encodeURIComponent(b.dataset.delres), { method:'DELETE', body:{reason}, admin:true }); refreshResults(); }
    catch(e){ showToast(e.message); }
  }));
  wrap.querySelectorAll('[data-publish-set]').forEach(button=>button.addEventListener('click',async event=>{
    event.stopPropagation();
    if(!confirm(`ยืนยันประกาศผลรายวิชา “${button.dataset.title}” ให้นักเรียนทุกคนที่ส่งข้อสอบแล้วหรือไม่?`))return;
    button.disabled=true;button.textContent='กำลังตรวจสอบและประกาศผล...';
    try{const result=await apiPublishAllForSet(button.dataset.publishSet);showToast(`ประกาศผลแล้ว ${result.count} คน`);await refreshResults();}
    catch(error){showToast(error.message);button.disabled=false;button.textContent='📣 ประกาศผล';}
  }));
  wrap.querySelectorAll('[data-viewdetail]').forEach(b=>b.addEventListener('click', ()=> toggleDetailRow(b.dataset.viewdetail)));
  wrap.querySelectorAll('[data-toggleresultgroup]').forEach(head=>head.addEventListener('click',()=>head.nextElementSibling.classList.toggle('collapsed')));
  wrap.querySelectorAll('[data-toggle-result-period]').forEach(head=>head.addEventListener('click',()=>{head.classList.toggle('open');head.nextElementSibling.classList.toggle('collapsed');}));
  wrap.querySelectorAll('[data-question-analysis]').forEach(button=>button.addEventListener('click',event=>{ event.stopPropagation(); showQuestionAnalysis(button.dataset.questionAnalysis); }));
  wrap.querySelectorAll('[data-export-gradebook]').forEach(button=>button.addEventListener('click',event=>{ event.stopPropagation(); downloadGradebook(button.dataset.exportGradebook,button); }));
}
function toggleDetailRow(resultId){
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
      button.disabled=true; button.textContent='กำลังบันทึก...';
      try{ await apiUpdateDfdScores(rec.id, scores, reason); showToast('ปรับคะแนน DFD แล้ว ระบบคำนวณรวม /20 ใหม่แล้ว'); refreshResults(); }
      catch(error){ showToast(error.message); button.disabled=false; button.textContent='บันทึกคะแนนที่ปรับ'; }
    });
  }else if(!set){
    td.innerHTML = renderIntegrityReview(rec) + '<div class="detail-block">ไม่พบข้อมูลชุดข้อสอบต้นฉบับ (อาจถูกลบไปแล้ว)</div>';
  }else{
    const answers = (rec.detail && rec.detail.answers) || {mc:{},matching:{},written:{}};
    let html = '';
    const mcQuestions=set.sections?.mc?.questions||[];
    if(mcQuestions.length) html += `<div class="detail-block"><b>ปรนัย (${rec.sectionScores.mc} คะแนน)</b><br>` + mcQuestions.map((qq,i)=>{
      const picked = answers.mc ? answers.mc[qq.id] : undefined;
      const pickedText = (picked!=null && qq.choices[picked]!=null) ? qq.choices[picked] : '(ไม่ได้ตอบ)';
      const correctText = qq.choices[qq.answer];
      const isCorrect = picked===qq.answer;
      return `${i+1}. ${escapeHtml(qq.text)}<br>&nbsp;&nbsp;ตอบ: ${escapeHtml(pickedText)} ${isCorrect?'✅':'❌ (เฉลย: '+escapeHtml(correctText)+')'}`;
    }).join('<br>') + `</div>`;
    const matchingItems=set.sections?.matching?.left||[];
    if(matchingItems.length) html += `<div class="detail-block"><b>จับคู่ (${rec.sectionScores.matching} คะแนน)</b><br>` + matchingItems.map(item=>{
      const rid = answers.matching ? answers.matching[item.id] : undefined;
      const rightItem = set.sections.matching.right.find(r=>r.id===rid);
      const correctRightItem = set.sections.matching.right.find(r=>r.id===set.sections.matching.correctMap[item.id]);
      const isCorrect = rid === set.sections.matching.correctMap[item.id];
      return `${escapeHtml(item.text)} → ${rightItem?escapeHtml(rightItem.text):'(ไม่ได้จับคู่)'} ${isCorrect?'✅':'❌ (เฉลย: '+escapeHtml(correctRightItem?correctRightItem.text:'-')+')'}`;
    }).join('<br>') + `</div>`;
    const writtenQuestions=set.sections?.written?.questions||[];
    if(writtenQuestions.length) html += `<div class="detail-block"><b>อัตนัย (${rec.sectionScores.written} คะแนน โดยประมาณจากคำสำคัญ)</b><br>` + writtenQuestions.map((qq,i)=>{
      const text = (answers.written && answers.written[qq.id]) || '(ไม่ได้ตอบ)';
      const pts = (rec.detail && rec.detail.writtenPerQuestion) ? rec.detail.writtenPerQuestion[qq.id] : '-';
      const manual=rec.detail?.writtenManualScores?.[qq.id];
      return `${i+1}. ${escapeHtml(qq.text)} (auto: ${pts}/${qq.maxPoints})<br>&nbsp;&nbsp;คำตอบ: ${escapeHtml(text)}<br>&nbsp;&nbsp;คะแนนอาจารย์: <input class="dfd-score-input" data-written-score="${qq.id}" type="number" min="0" max="${qq.maxPoints}" step="0.5" value="${manual??pts}"> / ${qq.maxPoints}`;
    }).join('<br><br>') + `<div class="editor-actions"><button class="btn btn-primary btn-sm" data-save-written>บันทึกคะแนนอัตนัย</button></div></div>`;
    td.innerHTML = renderIntegrityReview(rec) + html;
    td.querySelector('[data-save-written]')?.addEventListener('click', async event=>{ const scores={}; td.querySelectorAll('[data-written-score]').forEach(input=>scores[input.dataset.writtenScore]=Number(input.value)); const reason=askChangeReason('แก้คะแนนอัตนัย'); if(reason===null)return; try{ await apiUpdateWrittenScores(rec.id,scores,reason); showToast('บันทึกคะแนนอัตนัยแล้ว'); refreshResults(); }catch(error){ showToast(error.message); } });
  }
  tr.appendChild(td);
  rowEl.after(tr);
}
function renderDfdReview(rec){
  const levels=rec.detail?.levels || [];
  const scores=rec.detail?.levelScores || [0,0,0];
  const svgFor=level=>{
    const shapes=Array.isArray(level?.shapes)?level.shapes:[];
    const connections=Array.isArray(level?.connections)?level.connections:[];
    const byId=Object.fromEntries(shapes.map(shape=>[shape.id,shape]));
    const center=shape=>({x:(Number(shape.x)||0)+(Number(shape.w)||140)/2,y:(Number(shape.y)||0)+(Number(shape.h)||70)/2});
    const lines=connections.map(conn=>{ const from=byId[conn.fromId],to=byId[conn.toId]; if(!from||!to) return ''; const a=center(from),b=center(to); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#64748B" stroke-width="2"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-5}" text-anchor="middle" font-size="12" fill="#334155">${escapeHtml(conn.label||'')}</text>`; }).join('');
    const nodes=shapes.map(shape=>{ const x=Number(shape.x)||0,y=Number(shape.y)||0,w=Number(shape.w)||140,h=Number(shape.h)||70,label=escapeHtml(shape.label||shape.num||''); const figure=shape.type==='process'?`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="#DBEAFE" stroke="#2563EB"/>`:`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.type==='store'?0:8}" fill="#FFFFFF" stroke="#2563EB"/>`; return `${figure}<text x="${x+w/2}" y="${y+h/2+4}" text-anchor="middle" font-size="13" fill="#0F172A">${label}</text>`; }).join('');
    return `<svg viewBox="0 0 1000 650" role="img" aria-label="แผนภาพ DFD">${lines}${nodes}</svg>`;
  };
  return renderIntegrityReview(rec) + `<div class="detail-block"><b>🧩 ตรวจงาน Data Flow Diagram</b><br>คะแนนรวมปัจจุบัน <b>${rec.overallScore20}/20</b> (Level 0–2 รวม 300 คะแนน แล้วแปลงเป็น 20 คะแนน)</div><div class="dfd-review-grid">${[0,1,2].map(level=>{const data=levels.find(item=>Number(item.level)===level);const shapes=data?.shapes?.length||0,flows=data?.connections?.length||0;return `<section class="dfd-review-card"><h4>Level ${level}</h4><div class="dfd-review-meta">สัญลักษณ์ ${shapes} · เส้นข้อมูล ${flows}</div>${svgFor(data)}<div class="editor-actions"><label>คะแนน /100 <input class="dfd-score-input" data-dfd-score-level="${level}" type="number" min="0" max="100" step="0.5" value="${Number(scores[level])||0}"></label></div></section>`;}).join('')}</div><div class="editor-actions"><button class="btn btn-primary btn-sm" data-save-dfd-score>บันทึกคะแนนที่ปรับ</button></div>`;
}
function renderIntegrityReview(rec){
  const events=(Array.isArray(rec.integrityEvents)?rec.integrityEvents:[]).filter(event=>event.type!=='session_recovered');
  const labels={tab_switch:'สลับแท็บ/หน้าจอ',fullscreen_exit:'ออกจากโหมดเต็มจอ',right_click:'พยายามคลิกขวา',copy:'พยายามคัดลอก',reload:'โหลดหน้าใหม่'};
  const counts=`สลับแท็บ ${rec.tabSwitches||0} · ออกจากเต็มจอ ${rec.fullscreenExitAttempts||0} · คลิกขวา ${rec.rightClickAttempts||0} · คัดลอก ${rec.copyAttempts||0} · โหลดหน้าใหม่ ${rec.reloadCount||0}`;
  const alert=(rec.tabSwitches||0)+(rec.fullscreenExitAttempts||0)+(rec.rightClickAttempts||0)+(rec.copyAttempts||0)+(rec.reloadCount||0)>0;
  return `<section class="integrity-review ${alert?'':'ok'}"><h4>${alert?'⚠ ประวัติเหตุการณ์ระหว่างสอบ':'✓ ไม่พบเหตุการณ์ผิดปกติที่ระบบตรวจจับได้'}</h4><div class="integrity-summary">${counts}</div>${events.length?`<ol class="integrity-events">${events.map(event=>`<li>${escapeHtml(labels[event.type]||event.type)} — ${new Date(event.at).toLocaleString('th-TH')}</li>`).join('')}</ol>`:'<div class="integrity-events">ผลสอบเก่านี้ไม่มีบันทึกเวลารายเหตุการณ์</div>'}</section>`;
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
    document.getElementById('exportQuestionAnalysisDocxBtn').addEventListener('click',()=>downloadQuestionAnalysisDocx(setKey,false));
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
  const original=button.textContent; button.disabled=true; button.textContent='กำลังสร้างไฟล์...';
  try{
    const res=await fetch('/api/export/gradebook.xlsx?setKey='+encodeURIComponent(setKey),{headers:{'x-admin-key':adminKey||''}});
    const errorBody=res.ok?null:await res.json().catch(()=>({})); if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');} if(!res.ok)throw new Error(errorBody?.message||'ส่งออกไฟล์รวมคะแนนไม่สำเร็จ');
    const set=ADMIN_SETS.find(item=>item.key===setKey),courseName=String(set?.courseName||set?.title||'รายวิชา').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim()||'รายวิชา';
    const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=`รวมคะแนนวิชา(${courseName}).xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลด Excel รวมคะแนนแล้ว');
  }catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent=original;}
}
async function downloadQuestionAnalysisDocx(setKey,isTeacher){
  const button=document.getElementById('exportQuestionAnalysisDocxBtn'),original=button?.textContent||'📝 แบบฟอร์ม Word';
  if(button){button.disabled=true;button.textContent='กำลังสร้าง Word...';}
  try{const prefix=isTeacher?'/api/teacher':'/api',headers=isTeacher?{'x-teacher-token':teacherToken||''}:{'x-admin-key':adminKey||''},res=await fetch(prefix+'/export/question-analysis.docx?setKey='+encodeURIComponent(setKey),{headers});if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error('สร้างแบบฟอร์มวิเคราะห์ข้อสอบไม่สำเร็จ');const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'),disposition=res.headers.get('content-disposition')||'',encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];a.href=url;a.download=encodedName?decodeURIComponent(encodedName):'แบบฟอร์มวิเคราะห์ข้อสอบ.docx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลดแบบฟอร์มวิเคราะห์ข้อสอบ Word แล้ว');}catch(error){showToast(error.message);}finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function downloadQuestionAnalysis(setKey){
  const button=document.getElementById('exportQuestionAnalysisBtn'); if(button){button.disabled=true;button.textContent='กำลังสร้างไฟล์...';}
  try{const res=await fetch('/api/export/question-analysis.xlsx?setKey='+encodeURIComponent(setKey),{headers:{'x-admin-key':adminKey||''}});if(res.status===401){showSessionExpiredDialog();throw new Error('หมดเวลาการเข้าสู่ระบบ');}if(!res.ok)throw new Error('ส่งออกตารางวิเคราะห์ไม่สำเร็จ');const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ตารางวิเคราะห์ข้อสอบ.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('ดาวน์โหลดตารางวิเคราะห์ข้อสอบแล้ว');}catch(error){showToast(error.message);}finally{if(button){button.disabled=false;button.textContent='⬇ Export ตารางวิเคราะห์';}}
}
document.getElementById('auditLogBtn').addEventListener('click', showAuditLogs);
document.getElementById('exportExcelBtn').addEventListener('click', async ()=>{
  const setKey = document.getElementById('setFilterSelect').value;
  const examType = document.getElementById('examTypeFilterSelect').value;
  const btn = document.getElementById('exportExcelBtn');
  btn.disabled = true; btn.textContent = 'กำลังสร้างไฟล์...';
  try{
    const qs = [];
    if(setKey) qs.push('setKey='+encodeURIComponent(setKey));
    if(examType) qs.push('examType='+encodeURIComponent(examType));
    const url = '/api/export/results.xlsx' + (qs.length?('?'+qs.join('&')):'');
    const res = await fetch(url, { headers: { 'x-admin-key': adminKey || '' } });
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

})();
