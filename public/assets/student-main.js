(function(){

/* ============ DARK MODE ============ */
const THEME_KEY = 'examTheme';
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById('themeToggleBtn');
  const btnInline = document.getElementById('themeToggleBtnInline');
  btn.textContent = t==='dark' ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
  if(btnInline) btnInline.textContent = t==='dark' ? '☀️' : '🌙';
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
}
function toggleTheme(){ applyTheme(document.documentElement.dataset.theme==='dark' ? 'light' : 'dark'); }
document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
document.getElementById('themeToggleBtnInline').addEventListener('click', toggleTheme);
(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  if(!saved) saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(saved);
})();
/* the floating corner toggle only makes sense outside the exam shell (which has its own inline toggle) */
function setFloatingThemeButtonVisible(visible){
  document.getElementById('themeToggleBtn').classList.toggle('hidden', !visible);
}

/* ============ API CLIENT ============ */
const API_BASE = '';
async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({'Content-Type':'application/json'}, options.headers||{});
  if(app.studentToken) headers['x-student-token'] = app.studentToken;
  let res;
  try{
    res = await fetch(API_BASE + path, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined });
  }catch(e){ throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
  if(!res.ok){
    let msg = 'เกิดข้อผิดพลาด (HTTP '+res.status+')';
    let payload = null;
    try{ payload = await res.json(); if(payload && payload.message) msg = payload.message; }catch(e){}
    const err = new Error(msg); err.payload = payload; err.retryAfterMs = Math.max(0,Number(res.headers.get('Retry-After'))||0)*1000; throw err;
  }
  return res.json();
}
async function apiLookupStudent(id){ return apiFetch('/api/students/'+encodeURIComponent(id)); }
async function apiSetPin(studentId, pin){ return apiFetch('/api/students/'+encodeURIComponent(studentId)+'/set-pin', { method:'POST', body:{pin} }); }
async function apiVerifyPin(studentId, pin){ return apiFetch('/api/students/'+encodeURIComponent(studentId)+'/verify-pin', { method:'POST', body:{pin} }); }
async function apiRecoverPin(studentId, firstName, lastName, pin){ return apiFetch('/api/students/'+encodeURIComponent(studentId)+'/recover-pin', { method:'POST', body:{firstName,lastName,pin} }); }
async function apiLogoutStudent(){ return apiFetch('/api/student/session', { method:'DELETE' }); }
async function apiGetEligibleSets(){ return apiFetch('/api/sets'); }
async function apiSubmitResult(record){ return apiFetch('/api/results', { method:'POST', body:record }); }
async function apiGetMyResults(studentId){ return apiFetch('/api/students/'+encodeURIComponent(studentId)+'/results'); }
async function apiGetExamDraft(key,resitAccessId){ return apiFetch('/api/exam-drafts/'+encodeURIComponent(key)+(resitAccessId?('?resitAccessId='+encodeURIComponent(resitAccessId)):'')); }
async function apiSaveExamDraft(key,draft){ return apiFetch('/api/exam-drafts/'+encodeURIComponent(key),{method:'PUT',body:{draft}}); }
async function apiClearExamDraft(key,resitAccessId){ return apiFetch('/api/exam-drafts/'+encodeURIComponent(key)+(resitAccessId?('?resitAccessId='+encodeURIComponent(resitAccessId)):''),{method:'DELETE'}); }
const EXAM_DEVICE_ID=(()=>{
  let id='';
  try{
    // localStorage survives closing and reopening the browser. Keep the
    // sessionStorage fallback once so an exam already in progress retains its
    // original device identity after this version is deployed.
    id=localStorage.getItem('examDeviceId')||sessionStorage.getItem('examDeviceId')||'';
  }catch(e){}
  if(!id) id='dev_'+crypto.randomUUID().replace(/-/g,'');
  try{localStorage.setItem('examDeviceId',id);}catch(e){try{sessionStorage.setItem('examDeviceId',id);}catch(_){} }
  return id;
})();
async function apiClaimExamDevice(key,resitAccessId){ return apiFetch('/api/exam-drafts/'+encodeURIComponent(key)+'/claim',{method:'POST',body:{resitAccessId,deviceId:EXAM_DEVICE_ID}}); }
async function recoverExamStudentSession(){
  const response=await fetch('/api/student/session/recover-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:app.studentId,questionKey:app.questionKey,resitAccessId:app.resitAccessId||null,deviceId:EXAM_DEVICE_ID})});
  if(!response.ok)return false;const result=await response.json();app.studentToken=result.token;sessionStorage.setItem('examStudentToken',result.token);state.sessionRecoveries=(Number(state.sessionRecoveries)||0)+1;recordIntegrityEvent('session_recovered');saveSession();return true;
}

const SECTION_KEYS = ['mc','matching','written'];
const SECTION_TITLES = {mc:'ส่วนที่ 1 — ปรนัย', matching:'ส่วนที่ 2 — จับคู่', written:'ส่วนที่ 3 — อัตนัย'};
const SECTION_ICON = {mc:'📝', matching:'🔗', written:'✍️'};

/* ============ APP / SESSION STATE ============ */
let app = {
  studentId: null, studentName: '', classRoom: '', studentToken: sessionStorage.getItem('examStudentToken') || '',
  questionKey: null, section: null, lateCode: null,
  draftRevision: 0,
  submittedSections: {mc:false, matching:false, written:false},
  mcState: null, /* {forKey, order:[qid...], choiceOrder:{qid:[origIdx...]}, currentIndex} */
  timeLeft: 60*60, examEndTime: null, globalTimerHandle: null,
  examEnded: false, examInProgress: false, reloadCount: 0
};
let state = { tabSwitches: 0, tabWarningAcknowledged: 0, fullscreenExitAttempts: 0, rightClickAttempts: 0, copyAttempts: 0, sessionRecoveries: 0, integrityEvents: [] };
let draftAnswers = { mc:{}, matching:{}, written:{} };
let mcAnswerAdvancing = false;
let ELIGIBLE_SETS = [];
function setStudentSession(result){
  app.studentToken = result.token;
  app.studentId = result.student.studentId;
  app.studentName = result.student.firstName + ' ' + result.student.lastName;
  app.classRoom = result.student.classRoom;
  sessionStorage.setItem('examStudentToken', result.token);
}
let ELIGIBLE_SETS_BY_KEY = {};
function currentQuestion(){ return ELIGIBLE_SETS_BY_KEY[app.questionKey]; }

function shuffleArray(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function initMcStateIfNeeded(){
  if(app.mcState && app.mcState.forKey===app.questionKey) return;
  const q = currentQuestion();
  const qs = q.sections.mc.questions;
  let order = qs.map(x=>x.id);
  if(q.shuffleQuestions) order = shuffleArray(order);
  const choiceOrder = {};
  qs.forEach(qq=>{
    let idxs = qq.choices.map((_,i)=>i);
    if(q.shuffleChoices) idxs = shuffleArray(idxs);
    choiceOrder[qq.id] = idxs;
  });
  app.mcState = { forKey: app.questionKey, order, choiceOrder, currentIndex: 0 };
}
function firstUnansweredMcIndex(){
  return app.mcState.order.findIndex(qid=>draftAnswers.mc[qid]===undefined);
}

/* ============ SESSION PERSISTENCE (localStorage, per-browser) ============ */
const SESSION_KEY = 'examSession';
let _saveDebounceHandle = null;
let _serverSaveHandle = null;
let _serverSaveInFlight = false;
let _pendingServerPayload = null;
const SERVER_SAVE_DEBOUNCE_MS = 5000;
let pageIsLeaving = false;
let tabSwitchCheckTimer = null;
let lastTabSwitchAt = 0;
function saveSession(){
  if(!app.questionKey) return;
  const payload = {
    studentId: app.studentId, studentName: app.studentName, classRoom: app.classRoom,
    questionKey: app.questionKey, section: app.section, lateCode: app.lateCode || null,
    submittedSections: app.submittedSections, mcState: app.mcState,
    examEndTime: app.examEndTime, examEnded: app.examEnded,
    reloadCount: app.reloadCount, tabSwitches: state.tabSwitches, tabWarningAcknowledged: state.tabWarningAcknowledged,
    fullscreenExitAttempts: state.fullscreenExitAttempts, rightClickAttempts: state.rightClickAttempts, copyAttempts: state.copyAttempts, sessionRecoveries: state.sessionRecoveries||0,
    integrityEvents: state.integrityEvents,
    draftAnswers: draftAnswers, eligibleSets: ELIGIBLE_SETS, draftRevision:app.draftRevision||0
  };
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify(payload)); updateAutosaveTag('saved'); }
  catch(e){ updateAutosaveTag('error'); }
  queueServerSave(payload);
}
function queueServerSave(payload){
  if(!navigator.onLine || !app.studentToken || app.examEnded) return;
  clearTimeout(_serverSaveHandle);
  _pendingServerPayload=payload;
  _serverSaveHandle=setTimeout(flushServerSave,SERVER_SAVE_DEBOUNCE_MS);
}
async function flushServerSave(){
  if(_serverSaveInFlight || !_pendingServerPayload || app.examEnded) return;
  const payload=_pendingServerPayload; _pendingServerPayload=null; _serverSaveInFlight=true;
  const draft={questionKey:payload.questionKey,resitAccessId:app.resitAccessId||null,deviceId:EXAM_DEVICE_ID,revision:app.draftRevision||0,section:payload.section,lateCode:payload.lateCode,submittedSections:payload.submittedSections,mcState:payload.mcState,examEndTime:payload.examEndTime,reloadCount:payload.reloadCount,tabSwitches:payload.tabSwitches,tabWarningAcknowledged:payload.tabWarningAcknowledged,fullscreenExitAttempts:payload.fullscreenExitAttempts,rightClickAttempts:payload.rightClickAttempts,copyAttempts:payload.copyAttempts,sessionRecoveries:payload.sessionRecoveries||0,integrityEvents:payload.integrityEvents,draftAnswers:payload.draftAnswers};
  try{
    let saved;
    try{saved=await apiSaveExamDraft(payload.questionKey,draft);}
    catch(error){if(error.payload?.error!=='draft_conflict') throw error; app.draftRevision=Number(error.payload.currentRevision)||0; draft.revision=app.draftRevision; saved=await apiSaveExamDraft(payload.questionKey,draft);}
    app.draftRevision=Number(saved.revision)||app.draftRevision; updateAutosaveTag('saved');
  }catch(error){updateAutosaveTag('error');}
  finally{_serverSaveInFlight=false;if(_pendingServerPayload) flushServerSave();}
}
function updateAutosaveTag(status){
  const tag = document.getElementById('autosaveTag');
  if(!tag) return;
  const tr = window.I18N ? window.I18N.t : (s=>s);
  if(status==='saving'){
    tag.textContent=tr('💾 กำลังบันทึกอัตโนมัติ...'); tag.classList.add('saving'); return;
  }
  if(status==='error'){
    tag.textContent=tr('⚠ บันทึกอัตโนมัติไม่สำเร็จ'); tag.classList.remove('saving'); tag.classList.add('badge-warn'); return;
  }
  const time = new Date().toLocaleTimeString(window.I18N&&window.I18N.getLang()==='en'?'en-US':'th-TH',{hour:'2-digit',minute:'2-digit'});
  tag.textContent=tr('💾 บันทึกอัตโนมัติแล้ว ')+time; tag.classList.remove('saving','badge-warn');
}
function scheduleSave(){ updateAutosaveTag('saving'); clearTimeout(_saveDebounceHandle); _saveDebounceHandle = setTimeout(saveSession, 500); }
function loadSessionData(){
  try{ const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
function clearSessionData(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }
window.addEventListener('beforeunload', ()=>{ pageIsLeaving = true; if(app.questionKey && !app.examEnded) saveSession(); });
function requestExamFullscreen(){
  if(!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
}
function recordIntegrityEvent(type){
  state.integrityEvents.push({type, at:new Date().toISOString()});
  if(state.integrityEvents.length>50) state.integrityEvents.shift();
}

/* ============ ANTI-CHEAT: block right-click & copy while exam is in progress ============ */
document.addEventListener('contextmenu', (e)=>{
  if(app.examInProgress){ e.preventDefault(); state.rightClickAttempts++; recordIntegrityEvent('right_click'); updateCheatTags(); scheduleSave(); }
});
document.addEventListener('copy', (e)=>{
  if(app.examInProgress){ e.preventDefault(); state.copyAttempts++; recordIntegrityEvent('copy'); updateCheatTags(); scheduleSave(); }
});
document.addEventListener('cut', (e)=>{
  if(app.examInProgress){ e.preventDefault(); state.copyAttempts++; recordIntegrityEvent('copy'); updateCheatTags(); scheduleSave(); }
});
function updateCheatTags(){
  const fs = document.getElementById('fullscreenExitTag');
  const rc = document.getElementById('rightClickTag');
  const cp = document.getElementById('copyTag');
  const tr = window.I18N ? window.I18N.t : (s=>s);
  if(fs){ fs.textContent = tr('ออกจากเต็มจอ')+': '+state.fullscreenExitAttempts+' '+tr('ครั้ง'); fs.classList.toggle('badge-warn', state.fullscreenExitAttempts>0); }
  if(rc){ rc.textContent = tr('คลิกขวา')+': '+state.rightClickAttempts+' '+tr('ครั้ง'); rc.classList.toggle('badge-warn', state.rightClickAttempts>0); }
  if(cp){ cp.textContent = tr('คัดลอก')+': '+state.copyAttempts+' '+tr('ครั้ง'); cp.classList.toggle('badge-warn', state.copyAttempts>0); }
}
function resetAllExamAnswers(){
  draftAnswers={mc:{},matching:{},written:{}};
  app.submittedSections={mc:false,matching:false,written:false};
  matchPendingLeft=null;
  recordIntegrityEvent('answers_reset');
  if(app.section) renderSection(); else showHub();
}
function showTabSwitchWarning(){
  if(app.examEnded||state.tabSwitches<=state.tabWarningAcknowledged||state.tabSwitches>=5)return;
  const isEn = window.I18N && window.I18N.getLang()==='en';
  const text=state.tabSwitches<3
    ? (isEn ? `You have switched tabs/windows ${state.tabSwitches} time(s). At 3 switches, all answers will be cleared.`
            : `คุณสลับแท็บ/หน้าต่างแล้ว ${state.tabSwitches} ครั้ง หากครบ 3 ครั้ง ระบบจะล้างคำตอบทั้งหมด`)
    : (isEn ? `All answers have been cleared because you switched screens 3 times. ${5-state.tabSwitches} more switch(es) and the exam will be submitted immediately.`
            : `ระบบล้างคำตอบทั้งหมดแล้ว เนื่องจากสลับหน้าจอครบ 3 ครั้ง หากสลับเพิ่มอีก ${5-state.tabSwitches} ครั้ง ระบบจะส่งข้อสอบทันที`);
  document.getElementById('tabWarningText').textContent=text;
  document.getElementById('tabWarningModal').classList.remove('hidden');
}
function registerTabSwitch(){
  const now=Date.now();
  if(pageIsLeaving||!app.examInProgress||app.examEnded||now-lastTabSwitchAt<600)return;
  lastTabSwitchAt=now;state.tabSwitches++;recordIntegrityEvent('tab_switch');
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const tag=document.getElementById('tabSwitchTag');tag.textContent=tr('สลับแท็บ')+': '+state.tabSwitches+' '+tr('ครั้ง');tag.classList.add('badge-warn');
  if(state.tabSwitches===3)resetAllExamAnswers();
  saveSession();flushServerSave();
  if(state.tabSwitches>=5){document.getElementById('tabWarningModal').classList.add('hidden');finalizeExam('tabswitch');}
}
document.addEventListener('visibilitychange',()=>{
  clearTimeout(tabSwitchCheckTimer);
  if(document.hidden)tabSwitchCheckTimer=setTimeout(()=>{if(document.hidden)registerTabSwitch();},80);
  else showTabSwitchWarning();
});
window.addEventListener('blur',()=>{clearTimeout(tabSwitchCheckTimer);tabSwitchCheckTimer=setTimeout(()=>{if(!document.hasFocus())registerTabSwitch();},250);});
window.addEventListener('focus',()=>{clearTimeout(tabSwitchCheckTimer);showTabSwitchWarning();});
document.getElementById('tabWarningAckBtn').addEventListener('click', ()=>{
  state.tabWarningAcknowledged = state.tabSwitches;
  saveSession();
  document.getElementById('tabWarningModal').classList.add('hidden');
});
let fullscreenWasActive = false;
document.addEventListener('fullscreenchange', ()=>{
  if(document.fullscreenElement){ fullscreenWasActive = true; return; }
  if(!fullscreenWasActive || !app.examInProgress || app.examEnded) return;
  state.fullscreenExitAttempts++;
  recordIntegrityEvent('fullscreen_exit');
  updateCheatTags(); scheduleSave();
  showToast('ตรวจพบการออกจากโหมดเต็มจอ กรุณากลับเข้าสู่โหมดเต็มจอเพื่อทำข้อสอบต่อ');
});
function hasSuspiciousSplitScreen(){
  if(!app.examInProgress||app.examEnded||document.fullscreenElement||screen.availWidth<900)return false;
  return window.outerWidth<screen.availWidth*.72||window.outerHeight<screen.availHeight*.72;
}
let splitScreenResizeTimer=null;
function checkSplitScreen(){
  const blocked=hasSuspiciousSplitScreen(),overlay=document.getElementById('splitScreenWarning');
  if(blocked&&overlay.classList.contains('hidden'))recordIntegrityEvent('split_screen');
  overlay.classList.toggle('hidden',!blocked);
}
window.addEventListener('resize',()=>{clearTimeout(splitScreenResizeTimer);splitScreenResizeTimer=setTimeout(checkSplitScreen,250);});
document.getElementById('restoreFullscreenBtn').addEventListener('click',()=>{requestExamFullscreen();setTimeout(checkSplitScreen,250);});

/* ============ SCREEN REFS ============ */
const startScreen = document.getElementById('startScreen');
const loginScreen = document.getElementById('loginScreen');
const checkScoreScreen = document.getElementById('checkScoreScreen');
const selectScreen = document.getElementById('selectScreen');
const pinRecoveryScreen = document.getElementById('pinRecoveryScreen');
const countdownOverlay = document.getElementById('countdownOverlay');
const examScreen = document.getElementById('examScreen');
const finalScreen = document.getElementById('finalScreen');
const hubView = document.getElementById('hubView');
const sectionView = document.getElementById('sectionView');
const hubActions = document.getElementById('hubActions');
const sectionActions = document.getElementById('sectionActions');
function hideAllTopScreens(){ [startScreen,loginScreen,checkScoreScreen,selectScreen,pinRecoveryScreen,examScreen,finalScreen].forEach(s=>s.classList.add('hidden')); }
async function examSystemIsClosed(){
  try{
    const response=await fetch('/api/system/exam-access',{cache:'no-store'});
    const status=await response.json();
    if(!status.closed)return false;
    hideAllTopScreens();
    document.getElementById('systemClosedMessage').textContent=status.message||'กรุณารอประกาศจากอาจารย์ผู้สอน';
    document.getElementById('systemClosedScreen').classList.remove('hidden');
    document.documentElement.classList.remove('restoring-session');
    return true;
  }catch(error){return false;}
}

/* ============ START -> LOGIN / CHECK SCORE ============ */
document.getElementById('goLoginBtn').addEventListener('click', ()=>{
  hideAllTopScreens(); loginScreen.classList.remove('hidden');
  document.getElementById('studentIdInput').value=''; document.getElementById('loginError').style.display='none';
  document.getElementById('studentIdInput').focus();
});
document.getElementById('backToStartBtn').addEventListener('click', ()=>{ hideAllTopScreens(); startScreen.classList.remove('hidden'); });
document.getElementById('backToLoginBtn').addEventListener('click', async ()=>{
  if(document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
  stopSelectAutoRefresh();
  const token = app.studentToken;
  try{ if(token) await apiLogoutStudent(); }catch(e){}
  sessionStorage.removeItem('examStudentToken');
  clearSessionData();
  app = {studentId:null,studentName:'',classRoom:'',studentToken:'',questionKey:null,section:null,lateCode:null,draftRevision:0,submittedSections:{mc:false,matching:false,written:false},mcState:null,timeLeft:60*60,examEndTime:null,globalTimerHandle:null,examEnded:false,examInProgress:false,reloadCount:0};
  state = {tabSwitches:0,tabWarningAcknowledged:0,fullscreenExitAttempts:0,rightClickAttempts:0,copyAttempts:0,sessionRecoveries:0,integrityEvents:[]};
  draftAnswers = {mc:{},matching:{},written:{}};
  ELIGIBLE_SETS=[]; ELIGIBLE_SETS_BY_KEY={}; COMPLETED_KEYS=new Set(); pickedKey=null; lateCodeVerified={};
  document.getElementById('studentIdInput').value='';
  document.getElementById('confirmQBtn').disabled=true;
  history.replaceState({},'',location.pathname);
  hideAllTopScreens(); startScreen.classList.remove('hidden');
});

document.getElementById('goCheckScoreBtn').addEventListener('click', ()=>{
  hideAllTopScreens(); checkScoreScreen.classList.remove('hidden');
  document.getElementById('checkIdInput').value=''; document.getElementById('checkError').style.display='none';
  document.getElementById('scoreListWrap').innerHTML='';
});
document.getElementById('backFromCheckBtn').addEventListener('click', ()=>{ hideAllTopScreens(); startScreen.classList.remove('hidden'); });
async function doCheckScore(){
  const val = document.getElementById('checkIdInput').value.trim();
  const errBox = document.getElementById('checkError');
  if(!val){ errBox.textContent='กรุณากรอกรหัสนักเรียน'; errBox.style.display='block'; return; }
  const btn = document.getElementById('doCheckScoreBtn');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try{
    await apiLookupStudent(val); // validate the id exists
    const results = await apiGetMyResults(val);
    errBox.style.display='none';
    const wrap = document.getElementById('scoreListWrap');
    wrap.innerHTML = scoreResultsHtml(results);
  }catch(e){ errBox.textContent = e.message; errBox.style.display='block'; }
  btn.disabled = false; btn.textContent = 'ตรวจสอบ →';
}

function scoreResultsHtml(results){
  if(!results.length) return '<div class="empty-note">ยังไม่พบประวัติการสอบ</div>';
  return `<div style="overflow-x:auto;"><table class="score-table"><thead><tr><th>รายวิชา</th><th>ประเภท</th><th>วันที่สอบ</th><th>สถานะ</th><th>คะแนน</th></tr></thead><tbody>` +
    results.map(r=>`<tr>
      <td>${escapeHtml(r.questionTitle)}${r.attemptType==='resit'?'<br><span class="status-pill pending">สอบซ่อม</span>':''}</td>
      <td>${escapeHtml(r.examType||'-')}</td>
      <td>${new Date(r.submittedAt).toLocaleDateString('th-TH')}</td>
      <td><span class="status-pill ${r.published?'pub':'pending'}">${r.published?'ประกาศแล้ว':'รอประกาศผล'}</span></td>
      <td><b>${r.published ? (r.attemptType==='resit' ? `${r.overallScore20} → ${r.convertedScore}/${r.resitScoreMax}` : `${r.overallScore20}/20`) : '—'}</b></td>
    </tr>`).join('') + `</tbody></table></div>`;
}
document.getElementById('doCheckScoreBtn').addEventListener('click', doCheckScore);
document.getElementById('checkIdInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doCheckScore(); });

async function tryLogin(){
  const val = document.getElementById('studentIdInput').value.trim();
  const errBox = document.getElementById('loginError');
  if(!val){ errBox.textContent='กรุณากรอกรหัสนักเรียน'; errBox.style.display='block'; return; }
  const btn = document.getElementById('checkIdBtn');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try{
    const student = await apiLookupStudent(val);
    pendingLoginStudent = student;
    document.getElementById('studentIdentityConfirmDetails').innerHTML = `<b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b><br>รหัสนักเรียน: ${escapeHtml(student.studentId)}<br>ห้อง: ${escapeHtml(student.classRoom||'-')}`;
    document.getElementById('identityPinVerifyFields').classList.toggle('hidden',!student.hasPin);
    document.getElementById('identityPinSetupFields').classList.toggle('hidden',student.hasPin);
    document.getElementById('identityForgotPinBtn').classList.add('hidden');
    document.getElementById('studentIdentityWarning').textContent=student.hasPin?'ตรวจสอบชื่อ–นามสกุลให้ถูกต้อง แล้วกรอก PIN ของบัญชีนี้':'ตรวจสอบชื่อให้ถูกต้องก่อนตั้ง PIN';
    document.getElementById('identityPinInput').value='';
    document.getElementById('identityPinSetupInput').value='';
    document.getElementById('identityPinSetupConfirmInput').value='';
    document.getElementById('studentIdentityConfirmError').style.display='none';
    document.getElementById('studentIdentityAcceptBtn').textContent=student.hasPin?'ยืนยันและเข้าสู่ระบบ →':'ตั้ง PIN และเข้าสู่ระบบ →';
    updateIdentityActionVisibility();
    document.getElementById('studentIdentityConfirmModal').classList.remove('hidden');
    setTimeout(()=>document.getElementById(student.hasPin?'identityPinInput':'identityPinSetupInput').focus(),0);
  }catch(e){ errBox.textContent = e.message; errBox.style.display='block'; }
  btn.disabled = false; btn.textContent = 'ตรวจสอบสิทธิ์ →';
}
document.getElementById('checkIdBtn').addEventListener('click', tryLogin);
document.getElementById('studentIdInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryLogin(); });

let pendingLoginStudent = null;
let pendingRecoveryStudent = null;
function updateIdentityActionVisibility(){
  const student=pendingLoginStudent;
  const ready=Boolean(student&&(student.hasPin
    ? document.getElementById('identityPinInput').value.trim()
    : document.getElementById('identityPinSetupInput').value.trim()&&document.getElementById('identityPinSetupConfirmInput').value.trim()));
  document.getElementById('studentIdentityAcceptBtn').classList.toggle('hidden',!ready);
  document.getElementById('studentIdentityActions').classList.toggle('single-action',!ready);
}
function clearIdentityPinInputs(){
  document.getElementById('identityPinInput').value='';
  document.getElementById('identityPinSetupInput').value='';
  document.getElementById('identityPinSetupConfirmInput').value='';
}
document.getElementById('studentIdentityRejectBtn').addEventListener('click', ()=>{
  pendingLoginStudent=null;
  clearIdentityPinInputs();
  document.getElementById('studentIdentityConfirmModal').classList.add('hidden');
  const input=document.getElementById('studentIdInput'); input.focus(); input.select();
});
document.getElementById('studentIdentityAcceptBtn').addEventListener('click', async ()=>{
  const student=pendingLoginStudent;
  if(!student)return;
  const error=document.getElementById('studentIdentityConfirmError');
  const button=document.getElementById('studentIdentityAcceptBtn');
  let request;
  if(student.hasPin){
    const pin=document.getElementById('identityPinInput').value.trim();
    if(!pin){error.textContent='กรุณากรอก PIN';error.style.display='block';return;}
    request=()=>apiVerifyPin(student.studentId,pin);
  }else{
    const pin=document.getElementById('identityPinSetupInput').value.trim();
    const confirmPin=document.getElementById('identityPinSetupConfirmInput').value.trim();
    if(!/^\d{4,6}$/.test(pin)){error.textContent='PIN ต้องเป็นตัวเลข 4-6 หลัก';error.style.display='block';return;}
    if(pin!==confirmPin){error.textContent='PIN ทั้งสองช่องไม่ตรงกัน';error.style.display='block';return;}
    request=()=>apiSetPin(student.studentId,pin);
  }
  button.disabled=true;button.textContent='กำลังยืนยัน...';
  try{
    const result=await request();
    if(result.ok===false){error.textContent=result.locked?'PIN ถูกล็อก กรุณากด “ลืม PIN” เพื่อตั้งใหม่':`PIN ไม่ถูกต้อง (เหลือ ${result.remainingAttempts} ครั้ง)`;error.style.display='block';document.getElementById('identityForgotPinBtn').classList.remove('hidden');return;}
    setStudentSession(result);
    pendingLoginStudent=null;
    clearIdentityPinInputs();
    error.style.display='none';
    document.getElementById('studentIdentityConfirmModal').classList.add('hidden');
    await proceedToSelectScreen();
  }catch(e){error.textContent=e.message;error.style.display='block';}
  finally{button.disabled=false;button.textContent=student.hasPin?'ยืนยันและเข้าสู่ระบบ →':'ตั้ง PIN และเข้าสู่ระบบ →';}
});
document.getElementById('identityPinInput').addEventListener('keydown',event=>{if(event.key==='Enter')document.getElementById('studentIdentityAcceptBtn').click();});
document.getElementById('identityPinSetupConfirmInput').addEventListener('keydown',event=>{if(event.key==='Enter')document.getElementById('studentIdentityAcceptBtn').click();});
document.getElementById('identityPinInput').addEventListener('input',updateIdentityActionVisibility);
document.getElementById('identityPinSetupInput').addEventListener('input',updateIdentityActionVisibility);
document.getElementById('identityPinSetupConfirmInput').addEventListener('input',updateIdentityActionVisibility);
document.getElementById('identityForgotPinBtn').addEventListener('click',()=>{
  const student=pendingLoginStudent;
  if(!student)return;
  pendingRecoveryStudent=student;
  pendingLoginStudent=null;
  clearIdentityPinInputs();
  document.getElementById('studentIdentityConfirmModal').classList.add('hidden');
  document.getElementById('pinRecoveryIdentity').innerHTML=`<b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b><br>รหัส ${escapeHtml(student.studentId)} &nbsp;|&nbsp; ห้อง ${escapeHtml(student.classRoom||'-')}`;
  ['pinRecoveryFirstName','pinRecoveryLastName','pinRecoveryPin','pinRecoveryConfirmPin'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pinRecoveryError').style.display='none';
  hideAllTopScreens();pinRecoveryScreen.classList.remove('hidden');
  document.getElementById('pinRecoveryFirstName').focus();
});
document.getElementById('pinRecoveryBackBtn').addEventListener('click',()=>{
  pendingRecoveryStudent=null;
  hideAllTopScreens();loginScreen.classList.remove('hidden');
  const input=document.getElementById('studentIdInput');input.focus();input.select();
});
async function confirmPinRecovery(){
  const student=pendingRecoveryStudent;
  if(!student)return;
  const firstName=document.getElementById('pinRecoveryFirstName').value.trim();
  const lastName=document.getElementById('pinRecoveryLastName').value.trim();
  const pin=document.getElementById('pinRecoveryPin').value.trim();
  const confirmPin=document.getElementById('pinRecoveryConfirmPin').value.trim();
  const error=document.getElementById('pinRecoveryError');
  if(!firstName||!lastName){error.textContent='กรุณากรอกชื่อและนามสกุล';error.style.display='block';return;}
  if(!/^\d{4,6}$/.test(pin)){error.textContent='PIN ต้องเป็นตัวเลข 4-6 หลัก';error.style.display='block';return;}
  if(pin!==confirmPin){error.textContent='PIN ทั้งสองช่องไม่ตรงกัน';error.style.display='block';return;}
  const button=document.getElementById('pinRecoveryConfirmBtn');button.disabled=true;button.textContent='กำลังยืนยัน...';
  try{setStudentSession(await apiRecoverPin(student.studentId,firstName,lastName,pin));pendingRecoveryStudent=null;error.style.display='none';await proceedToSelectScreen();}
  catch(e){error.textContent=e.message;error.style.display='block';}
  finally{button.disabled=false;button.textContent='ยืนยันและตั้ง PIN ใหม่';}
}
document.getElementById('pinRecoveryConfirmBtn').addEventListener('click',confirmPinRecovery);
document.getElementById('pinRecoveryConfirmPin').addEventListener('keydown',event=>{if(event.key==='Enter')confirmPinRecovery();});

async function proceedToSelectScreen(){
  hideAllTopScreens(); selectScreen.classList.remove('hidden');
  document.getElementById('identityBox').innerHTML = `ยืนยันตัวตน: <b>${escapeHtml(app.studentName)}</b> &nbsp;|&nbsp; รหัส ${escapeHtml(app.studentId)} &nbsp;|&nbsp; ห้อง ${escapeHtml(app.classRoom)}`;
  await refreshSelectScreen();
  startSelectAutoRefresh();
}
let pickedKey = null;
let COMPLETED_KEYS = new Set();
let selectRefreshInFlight=false,lastSelectRefreshAt=0,selectAutoRefreshTimer=null;
function startSelectAutoRefresh(){
  if(selectAutoRefreshTimer) clearInterval(selectAutoRefreshTimer);
  selectAutoRefreshTimer=setInterval(()=>{if(!selectScreen.classList.contains('hidden')) refreshSelectScreen({showLoading:false});},15000);
}
function stopSelectAutoRefresh(){if(selectAutoRefreshTimer){clearInterval(selectAutoRefreshTimer);selectAutoRefreshTimer=null;}}
async function refreshSelectScreen({showLoading=true}={}){
  if(selectRefreshInFlight)return;
  selectRefreshInFlight=true;lastSelectRefreshAt=Date.now();
  if(showLoading) document.getElementById('qgridWrap').innerHTML = '<div class="loading-note">กำลังโหลดรายวิชา...</div>';
  try{ ELIGIBLE_SETS = await apiGetEligibleSets(); }
  catch(e){ if(showLoading) document.getElementById('qgridWrap').innerHTML = '<div class="empty-note">'+escapeHtml(e.message)+'</div>';selectRefreshInFlight=false;return; }
  ELIGIBLE_SETS_BY_KEY = {}; ELIGIBLE_SETS.forEach(s=>ELIGIBLE_SETS_BY_KEY[s.key]=s);
  try{
    const mine = await apiGetMyResults(app.studentId);
    COMPLETED_KEYS = new Set(mine.filter(r=>r.attemptType!=='resit').map(r=>r.questionKey));
  }catch(e){
    COMPLETED_KEYS = new Set();
  }
  renderQGrid();
  selectRefreshInFlight=false;
}
window.addEventListener('focus',()=>{if(!selectScreen.classList.contains('hidden')&&Date.now()-lastSelectRefreshAt>5000)refreshSelectScreen({showLoading:false});});
let lateCodeVerified = {}; // {questionKey: code} once verified this session
async function apiVerifyLateCode(key, code){ return apiFetch('/api/sets/'+encodeURIComponent(key)+'/verify-late-code', { method:'POST', body:{code} }); }

function renderQGrid(){
  const wrap = document.getElementById('qgridWrap');
  if(!ELIGIBLE_SETS.length){
    wrap.innerHTML = '<div class="empty-note">ขณะนี้ยังไม่มีรายวิชาที่คุณมีสิทธิสอบ กรุณาติดต่ออาจารย์ผู้สอนหรือผู้ดูแลระบบ</div>';
    return;
  }
  wrap.innerHTML = `<div class="qgrid">` + ELIGIBLE_SETS.map(q=>{
    const isResit = q.accessMode==='resit';
    const done = !isResit && COMPLETED_KEYS.has(q.key);
    const locked = q.lateAccessRequired && !lateCodeVerified[q.key];
    const disabled = done || locked;
    return `<div class="qcard" data-key="${q.key}" ${disabled?'style="opacity:.7;cursor:default;"':''}>
      <h3>${escapeHtml(q.title)}</h3>
      <p>${escapeHtml(q.desc||'')}</p>
      <div class="lvbadges">
        ${done ? `<span class="lvbadge" style="background:var(--green);color:#fff;border-color:var(--green);">✅ ทำข้อสอบแล้ว</span>` : ''}
        ${isResit ? `<span class="lvbadge" style="background:#F59E0B;color:#fff;border-color:#F59E0B;">🛠️ สิทธิ์สอบซ่อม · คะแนนเต็มหลังแปลง ${q.resitScoreMax}</span>` : ''}
        ${locked ? `<span class="lvbadge" style="background:var(--red);color:#fff;border-color:var(--red);">🔒 หมดเวลาลงทะเบียนสอบ</span>` : ''}
        ${q.examType ? `<span class="lvbadge examtype">${escapeHtml(q.examType)}</span>` : ''}
        ${q.delivery==='object-analysis-design' ? `<span class="lvbadge" style="background:#EEF2FF;color:#4338CA;border-color:#C7D2FE;">🧩 วาด Data Flow Diagram · Level 0–2</span>` : `<span class="lvbadge">${SECTION_ICON.mc} ปรนัย ${q.sections.mc.questions.length} ข้อ</span>`}
        ${!q.delivery && q.sections.matching.left.length>0 ? `<span class="lvbadge">${SECTION_ICON.matching} จับคู่ ${q.sections.matching.left.length} คู่</span>` : ''}
        ${!q.delivery && q.sections.written.questions.length>0 ? `<span class="lvbadge">${SECTION_ICON.written} อัตนัย ${q.sections.written.questions.length} ข้อ</span>` : ''}
        ${q.subjectTeacherName ? `<span class="lvbadge">👤 ${escapeHtml(q.subjectTeacherName)}</span>` : ''}
      </div>
      ${locked ? `
        <div class="late-code-box" data-latebox="${q.key}" style="margin-top:10px;">
          <p style="font-size:11.5px;color:var(--sub);margin:0 0 6px;">หมดเวลาลงทะเบียนสอบตามปกติแล้ว (${q.availableUntil?new Date(q.availableUntil).toLocaleString('th-TH'):''}) กรุณาขอรหัสพิเศษจากอาจารย์ผู้สอนเพื่อเข้าสอบย้อนหลัง</p>
          <div style="display:flex;gap:6px;">
            <input type="text" class="name-input" style="margin:0;padding:8px 10px;font-size:13px;" placeholder="รหัสพิเศษ" data-latecode-input="${q.key}">
            <button class="btn btn-ghost btn-sm" data-verify-late="${q.key}" type="button">ยืนยัน</button>
          </div>
          <div class="id-error" data-lateerr="${q.key}" style="margin:6px 0 0;"></div>
        </div>` : ''}
    </div>`;
  }).join('') + `</div>`;

  wrap.querySelectorAll('.qcard').forEach(card=>{
    const key = card.dataset.key;
    const done = ELIGIBLE_SETS_BY_KEY[key].accessMode!=='resit' && COMPLETED_KEYS.has(key);
    const locked = ELIGIBLE_SETS_BY_KEY[key].lateAccessRequired && !lateCodeVerified[key];
    if(done || locked) return; // not directly selectable
    card.addEventListener('click', ()=>{
      wrap.querySelectorAll('.qcard').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      pickedKey = key;
      document.getElementById('confirmQBtn').disabled = false;
    });
  });
  wrap.querySelectorAll('[data-verify-late]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const key = btn.dataset.verifyLate;
      const input = wrap.querySelector(`[data-latecode-input="${key}"]`);
      const errBox = wrap.querySelector(`[data-lateerr="${key}"]`);
      const code = input.value.trim();
      if(!code){ errBox.textContent='กรุณากรอกรหัส'; errBox.style.display='block'; return; }
      btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
      try{
        const res = await apiVerifyLateCode(key, code);
        if(res.ok){ lateCodeVerified[key] = code; renderQGrid(); }
        else { errBox.textContent = 'รหัสไม่ถูกต้อง กรุณาตรวจสอบกับอาจารย์ผู้สอนอีกครั้ง'; errBox.style.display='block'; }
      }catch(err){ errBox.textContent = err.message; errBox.style.display='block'; }
      btn.disabled = false; btn.textContent = 'ยืนยัน';
    });
  });
}
function applyServerDraft(draft){
  if(!draft?.examEndTime || new Date(draft.examEndTime).getTime()<=Date.now()) return false;
  app.section=draft.section||null; app.lateCode=draft.lateCode||null; app.submittedSections=draft.submittedSections||{mc:false,matching:false,written:false};
  app.mcState=draft.mcState||null; app.examEndTime=draft.examEndTime; app.timeLeft=Math.max(0,Math.round((new Date(draft.examEndTime).getTime()-Date.now())/1000));
  app.reloadCount=(Number(draft.reloadCount)||0)+1; state={tabSwitches:Number(draft.tabSwitches)||0,tabWarningAcknowledged:Number(draft.tabWarningAcknowledged)||0,fullscreenExitAttempts:Number(draft.fullscreenExitAttempts)||0,rightClickAttempts:Number(draft.rightClickAttempts)||0,copyAttempts:Number(draft.copyAttempts)||0,sessionRecoveries:Number(draft.sessionRecoveries)||0,integrityEvents:Array.isArray(draft.integrityEvents)?draft.integrityEvents:[]};
  app.draftRevision=Number(draft.revision)||0; draftAnswers=draft.draftAnswers||{mc:{},matching:{},written:{}}; return true;
}
let examPreparing=false;
function setExamPreparing(active){
  examPreparing=active;
  const button=document.getElementById('confirmQBtn');
  button.disabled=active || !pickedKey;
  button.textContent=active?'กำลังเตรียมข้อสอบ...':'เริ่มทำข้อสอบ →';
  selectScreen.classList.toggle('exam-preparing',active);
  document.getElementById('examPreparingOverlay').classList.toggle('hidden',!active);
}
document.getElementById('confirmQBtn').addEventListener('click', async ()=>{
  if(examPreparing) return;
  if(!pickedKey) return;
  if(COMPLETED_KEYS.has(pickedKey) && ELIGIBLE_SETS_BY_KEY[pickedKey].accessMode!=='resit'){ showToast('คุณได้ทำข้อสอบวิชานี้ไปแล้ว ไม่สามารถทำซ้ำได้'); return; }
  const pickedSet = ELIGIBLE_SETS_BY_KEY[pickedKey];
  setExamPreparing(true);
  if(pickedSet.delivery==='object-analysis-design'){ location.href='/object-analysis-design'; return; }
  app.questionKey = pickedKey;
  app.resitAccessId = ELIGIBLE_SETS_BY_KEY[pickedKey].resitAccessId || null;
  app.lateCode = lateCodeVerified[pickedKey] || null;
  try{const claim=await apiClaimExamDevice(pickedKey,app.resitAccessId);app.draftRevision=Number(claim.draft?.revision)||0;}catch(error){setExamPreparing(false);showToast(error.message);return;}
  try{ const remote=await apiGetExamDraft(pickedKey,app.resitAccessId); if(applyServerDraft(remote.draft)) showToast('กู้คืนคำตอบที่บันทึกไว้จากเซิร์ฟเวอร์แล้ว'); }catch(error){}
  requestExamFullscreen();
  selectScreen.classList.add('hidden');
  setExamPreparing(false);
  runCountdown();
});

/* ============ COUNTDOWN -> EXAM ============ */
function runCountdown(){
  countdownOverlay.classList.remove('hidden');
  let n = 3;
  const numEl = document.getElementById('countdownNumber');
  numEl.textContent = n;
  const handle = setInterval(()=>{
    n--;
    if(n<=0){ clearInterval(handle); countdownOverlay.classList.add('hidden'); beginExam(); }
    else { numEl.textContent = n; numEl.style.animation='none'; void numEl.offsetWidth; numEl.style.animation='pop .9s ease'; }
  }, 900);
}
function beginExam(){
  requestExamFullscreen();
  examScreen.classList.remove('hidden');
  setFloatingThemeButtonVisible(false);
  app.examInProgress = true;
  fullscreenWasActive = !!document.fullscreenElement;
  updateCheatTags();
  document.getElementById('nameTag').textContent = '👤 ' + app.studentName + ' (' + app.classRoom + ')';
  document.getElementById('hubQTitle').textContent = 'ชุดข้อสอบ: ' + currentQuestion().title;
  document.getElementById('hubQTagline').textContent = (currentQuestion().examType ? '['+currentQuestion().examType+'] ' : '') + (currentQuestion().tagline||'');
  if(!app.examEndTime){ app.timeLeft = 60*60; app.examEndTime = Date.now() + app.timeLeft*1000; }
  updateReloadTag();
  updateGlobalTimerDisplay();
  showHub();
  saveSession();
  flushServerSave();
  runGlobalTimer();
  setTimeout(checkSplitScreen,300);
}
function runGlobalTimer(){
  clearInterval(app.globalTimerHandle);
  app.globalTimerHandle = setInterval(()=>{
    app.timeLeft = Math.max(0, Math.round((app.examEndTime - Date.now())/1000));
    updateGlobalTimerDisplay();
    if(app.timeLeft % 60 === 0) saveSession();
    if(app.timeLeft<=0){ clearInterval(app.globalTimerHandle); forceTimeUp(); }
  }, 1000);
}
function updateGlobalTimerDisplay(){
  const m = Math.floor(app.timeLeft/60).toString().padStart(2,'0');
  const s = (app.timeLeft%60).toString().padStart(2,'0');
  const el = document.getElementById('timerDisplay');
  el.textContent = m+':'+s;
  el.classList.toggle('warn', app.timeLeft<=600 && app.timeLeft>120);
  el.classList.toggle('danger', app.timeLeft<=120);
}
function updateReloadTag(){
  const tag = document.getElementById('reloadTag');
  if(app.reloadCount>0){ tag.style.display=''; tag.textContent = '🔄 ทำต่อ (โหลดหน้าใหม่ครั้งที่ ' + app.reloadCount + ')'; }
  else tag.style.display='none';
}

/* ============ HUB ============ */
function showHub(){
  app.section = null;
  document.getElementById('topTitle').textContent = 'รายการส่วนข้อสอบ';
  hubActions.classList.remove('hidden');
  sectionActions.classList.add('hidden');
  sectionView.classList.add('hidden');
  hubView.classList.remove('hidden');
  renderHubCards();
  saveSession();
}
function getActiveSections(){
  const q = currentQuestion();
  const active = [];
  if(q.sections.mc.questions.length>0) active.push('mc');
  if(q.sections.matching.left.length>0) active.push('matching');
  if(q.sections.written.questions.length>0) active.push('written');
  return active;
}
function renderHubCards(){
  const tr = window.I18N ? window.I18N.t : (s=>s);
  const grid = document.getElementById('lvGrid');
  const descBy = {mc:tr('เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ'), matching:tr('จับคู่รายการซ้าย-ขวาให้สัมพันธ์กัน'), written:tr('เขียนตอบด้วยคำพูดของตนเอง')};
  const active = getActiveSections();
  grid.innerHTML = active.map(sec=>{
    const done = app.submittedSections[sec];
    const statusHtml = done ? `<span class="lv-status done">${tr('บันทึกคำตอบแล้ว')}</span>` : `<span class="lv-status todo">${tr('ยังไม่ทำ')}</span>`;
    const btnLabel = done ? tr('แก้ไขคำตอบต่อ') : tr('เข้าทำส่วนนี้');
    return `<div class="lv-card">
      <h3>${SECTION_ICON[sec]} ${tr(SECTION_TITLES[sec])}</h3>
      <div class="lv-desc">${descBy[sec]}</div>
      ${statusHtml}
      <button class="btn btn-primary" data-enter="${sec}" ${app.examEnded?'disabled':''}>${btnLabel}</button>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-enter]').forEach(btn=>{ btn.addEventListener('click', ()=> enterSection(btn.dataset.enter)); });
  const anyDone = active.some(sec=>app.submittedSections[sec]);
  document.getElementById('endExamBtn').disabled = !anyDone;
}
function attemptEndExam(){
  const incomplete = findFirstIncomplete();
  if(incomplete){
    showToast('กรุณาตอบให้ครบทุกข้อก่อนส่งคำตอบ กำลังพาไปยังข้อที่ยังไม่ได้ตอบ...');
    jumpToIncomplete(incomplete);
    return;
  }
  document.getElementById('submitConfirmModal').classList.remove('hidden');
}
document.getElementById('cancelExamSubmitBtn').addEventListener('click',()=>document.getElementById('submitConfirmModal').classList.add('hidden'));
document.getElementById('confirmExamSubmitBtn').addEventListener('click',()=>{
  document.getElementById('submitConfirmModal').classList.add('hidden');
  clearInterval(app.globalTimerHandle);
  finalizeExam('manual');
});
document.getElementById('endExamBtn').addEventListener('click', attemptEndExam);
document.getElementById('backToHubBtn').addEventListener('click', showHub);
function isOnlyMcSection(){
  return getActiveSections().length===1;
}

/* ============ COMPLETENESS CHECK ============ */
function findFirstIncomplete(){
  const q = currentQuestion();
  for(const qq of q.sections.mc.questions){
    if(draftAnswers.mc[qq.id]===undefined) return {section:'mc', qid:qq.id};
  }
  for(const item of q.sections.matching.left){
    if(!draftAnswers.matching[item.id]) return {section:'matching', qid:item.id};
  }
  for(const qq of q.sections.written.questions){
    if(!draftAnswers.written[qq.id] || !draftAnswers.written[qq.id].trim()) return {section:'written', qid:qq.id};
  }
  return null;
}
function jumpToIncomplete(inc){
  enterSection(inc.section);
  if(inc.section==='mc'){
    initMcStateIfNeeded();
    const idx = app.mcState.order.indexOf(inc.qid);
    if(idx>=0) app.mcState.currentIndex = idx;
    renderSection();
  } else if(inc.section==='written'){
    renderSection();
    setTimeout(()=>{
      const ta = document.querySelector(`.written-textarea[data-qid="${inc.qid}"],.code-answer[data-qid="${inc.qid}"]`);
      if(ta){ ta.scrollIntoView({behavior:'smooth', block:'center'}); ta.focus(); ta.classList.add('flag-missing'); }
    }, 60);
  } else if(inc.section==='matching'){
    renderSection();
    setTimeout(()=>{
      const el = document.querySelector(`.match-item[data-side="left"][data-id="${inc.qid}"]`);
      if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.classList.add('flag-missing'); }
    }, 60);
  }
}

/* ============ ENTER SECTION ============ */
let matchPendingLeft = null;
function enterSection(sec){
  app.section = sec;
  hubActions.classList.add('hidden');
  sectionActions.classList.remove('hidden');
  hubView.classList.add('hidden');
  sectionView.classList.remove('hidden');
  document.getElementById('topTitle').textContent = (window.I18N?window.I18N.t(SECTION_TITLES[sec]):SECTION_TITLES[sec]) + ' — ' + currentQuestion().title;
  matchPendingLeft = null;
  if(sec==='mc') initMcStateIfNeeded();
  renderSection();
}
function renderSection(){
  const sec = app.section;
  if(sec==='mc') return renderMcSection();
  const q = currentQuestion();
  const s = q.sections[sec];
  const inner = document.getElementById('sectionInner');
  if(!draftAnswers[sec]) draftAnswers[sec] = {};
  let html = `<div class="section-head"><h2>${SECTION_ICON[sec]} ${escapeHtml(s.title)}</h2><p>${escapeHtml(s.desc||'')}</p></div>`;

  if(sec==='matching'){
    const matched = draftAnswers.matching;
    const answeredCount = Object.keys(matched).length;
    const total = s.left.length;
    html += `<div class="progress-badge ${answeredCount===total?'complete':''}">จับคู่แล้ว ${answeredCount}/${total} คู่</div>`;
    const badgeFor = {}; let bi=1;
    Object.keys(matched).forEach(lid=>{ badgeFor[lid+'|'+matched[lid]] = bi++; });
    html += `<div class="match-hint">คลิกรายการทางซ้าย 1 รายการ แล้วคลิกรายการทางขวาที่สัมพันธ์กันเพื่อจับคู่</div>`;
    html += `<div class="match-wrap"><div class="match-col" id="matchLeftCol"><h4>รายการ ก</h4>`;
    html += s.left.map(item=>{
      const r = matched[item.id];
      const isPending = matchPendingLeft===item.id;
      const badge = r ? (badgeFor[item.id+'|'+r] || '') : '';
      return `<div class="match-item ${isPending?'pending':''} ${r?'matched':''}" data-side="left" data-id="${item.id}">
        ${r?`<span class="match-badge">${badge}</span>`:`<span class="noBadge"></span>`}<span>${escapeHtml(item.text)}</span></div>`;
    }).join('');
    html += `</div><div class="match-col" id="matchRightCol"><h4>รายการ ข</h4>`;
    html += s.right.map(item=>{
      let matchedLeft = null;
      Object.entries(matched).forEach(([lid,rid])=>{ if(rid===item.id) matchedLeft = lid; });
      const badge = matchedLeft ? (badgeFor[matchedLeft+'|'+item.id] || '') : '';
      return `<div class="match-item ${matchedLeft?'matched':''}" data-side="right" data-id="${item.id}">
        ${matchedLeft?`<span class="match-badge">${badge}</span>`:`<span class="noBadge"></span>`}<span>${escapeHtml(item.text)}</span></div>`;
    }).join('');
    html += `</div></div>
      <div class="section-actions" style="margin-top:14px;"><button class="btn btn-ghost" id="clearMatchBtn">${(window.I18N?window.I18N.t:s2=>s2)('ล้างการจับคู่ทั้งหมด')}</button></div>`;
  } else if(sec==='written'){
    const answeredCount = s.questions.filter(qq=>draftAnswers.written[qq.id] && draftAnswers.written[qq.id].trim()).length;
    html += `<div class="progress-badge ${answeredCount===s.questions.length?'complete':''}">ตอบแล้ว ${answeredCount}/${s.questions.length} ข้อ</div>`;
    html += s.questions.map((qq,i)=>{
      const val = draftAnswers.written[qq.id] || '';
      const isCode = qq.answerType === 'code';
      const language = ({c:'C',cpp:'C++',java:'Java'})[qq.language] || 'Code';
      const editor = isCode ? `<div class="code-editor"><div class="code-editor-head"><span>main.${qq.language==='java'?'java':qq.language==='cpp'?'cpp':'c'}</span><span>${language} · แก้ไขโค้ด</span></div><div class="code-editor-body"><pre class="code-line-numbers" data-lines-for="${qq.id}">1</pre><textarea class="code-answer" spellcheck="false" autocapitalize="off" autocomplete="off" data-qid="${qq.id}" placeholder="พิมพ์โค้ดที่แก้ไขแล้ว...">${escapeHtml(val)}</textarea></div></div>` : `<textarea class="written-textarea" data-qid="${qq.id}" placeholder="พิมพ์คำตอบที่นี่...">${escapeHtml(val)}</textarea>`;
      return `<div class="qblock"><div class="qnum">ข้อ ${i+1}${isCode?' · เขียนโค้ด':''}</div><div class="qtext">${escapeHtml(qq.text)}</div>${renderQuestionResources(qq)}${editor}</div>`;
    }).join('');
  }

  html += `<div class="section-actions"><button class="btn btn-primary" id="submitSectionBtn">${(window.I18N?window.I18N.t:s2=>s2)('บันทึกคำตอบส่วนนี้')}</button></div>`;
  inner.innerHTML = html;
  bindSectionEvents();
}

function renderMcSection(){
  const q = currentQuestion();
  const s = q.sections.mc;
  const byId = {}; s.questions.forEach(x=>byId[x.id]=x);
  const idx = app.mcState.currentIndex;
  const qid = app.mcState.order[idx];
  const qq = byId[qid];
  const dispOrder = app.mcState.choiceOrder[qid];
  const picked = draftAnswers.mc[qid];
  const answeredCount = s.questions.filter(x=>draftAnswers.mc[x.id]!==undefined).length;
  const total = s.questions.length;
  const isLast = idx === total-1;
  const canSubmit = total > 0 && answeredCount === total;

  const paletteHtml = app.mcState.order.map((oid,i)=>{
    const answered = draftAnswers.mc[oid]!==undefined;
    const cur = i===idx;
    return `<button class="mc-pal-btn ${answered?'answered':''} ${cur?'current':''}" data-jump="${i}" title="${(window.I18N?window.I18N.t('ข้อ'):'ข้อ')} ${i+1}">${i+1}</button>`;
  }).join('');

  const choicesHtml = dispOrder.map(origIdx=>{
    const c = qq.choices[origIdx];
    const isPicked = picked===origIdx;
    return `<label class="choice-item ${isPicked?'picked':''}" data-origidx="${origIdx}">
      <input type="radio" name="mcCurrent" ${isPicked?'checked':''}> <span>${escapeHtml(c)}</span>
      ${isPicked?`<button type="button" class="choice-clear-btn" data-clear="1" title="${(window.I18N?window.I18N.t('ยกเลิกคำตอบข้อนี้'):'ยกเลิกคำตอบข้อนี้')}">✕</button>`:''}
    </label>`;
  }).join('');

  const tr = window.I18N ? window.I18N.t : (s2=>s2);
  const inner = document.getElementById('sectionInner');
  inner.classList.remove('mc-answer-pending');
  inner.innerHTML = `
    <div class="section-head"><h2>${SECTION_ICON.mc} ${escapeHtml(s.title)}</h2><p>${escapeHtml(s.desc||'')}</p></div>
    <div class="mc-map-card">
      <div class="mc-map-head">
        <span class="title">🗺️ ${tr('แผนที่ข้อสอบ')}</span>
        <span class="count">${tr('ตอบแล้ว')} ${answeredCount} / ${total} ${tr('ข้อ')}</span>
      </div>
      <div class="mc-progress-bar"><div class="mc-progress-fill" style="width:${total?Math.round(answeredCount/total*100):0}%;"></div></div>
      <div class="mc-palette">${paletteHtml}</div>
      <div class="mc-legend">
        <span><i class="dot answered"></i> ${tr('ตอบแล้ว')}</span>
        <span><i class="dot todo"></i> ${tr('ยังไม่ตอบ')}</span>
        <span><i class="dot current"></i> ${tr('ข้อที่กำลังทำ')}</span>
      </div>
    </div>
    <div class="qblock">
      <div class="qnum">${tr('ข้อ')} ${idx+1} ${tr('จาก')} ${total}</div>
      <div class="qtext">${escapeHtml(qq.text)}</div>
      ${renderQuestionResources(qq)}
      <div class="choice-list">${choicesHtml}</div>
    </div>
    ${canSubmit && idx>0 ? `<div class="mc-complete-actions"><button class="btn btn-ghost" id="mcPrevBtn">← ${tr('ข้อก่อนหน้า')}</button><button class="btn btn-primary" id="submitSectionBtn">${isOnlyMcSection()?tr('ส่งข้อสอบ'):tr('บันทึกคำตอบส่วนนี้')}</button></div>` : ''}
    ${!canSubmit && idx>0 ? `<div class="mc-nav-row"><button class="btn btn-ghost" id="mcPrevBtn">← ${tr('ข้อก่อนหน้า')}</button></div>` : ''}
    ${canSubmit && idx===0 ? `<div class="section-actions mc-submit-row"><button class="btn btn-primary" id="submitSectionBtn">${isOnlyMcSection()?tr('ส่งข้อสอบ'):tr('บันทึกคำตอบส่วนนี้')}</button></div>` : ''}
  `;

  inner.querySelectorAll('.choice-item').forEach(item=>{
    item.addEventListener('click', (e)=>{
      if(mcAnswerAdvancing) return;
      if(e.target.closest('[data-clear]')){
        e.preventDefault(); e.stopPropagation();
        delete draftAnswers.mc[qid];
        scheduleSave();
        renderMcSection();
        return;
      }
      // A click on a label also triggers its radio input. Prevent the second click from advancing twice.
      e.preventDefault();
      draftAnswers.mc[qid] = parseInt(item.dataset.origidx,10);
      scheduleSave();
      mcAnswerAdvancing = true;
      item.classList.add('choice-confirmed');
      item.querySelector('input').checked = true;
      inner.classList.add('mc-answer-pending');
      setTimeout(()=>{
        if(isLast){
          const incompleteIndex = firstUnansweredMcIndex();
          if(incompleteIndex >= 0) app.mcState.currentIndex = incompleteIndex;
        } else {
          app.mcState.currentIndex++;
        }
        mcAnswerAdvancing = false;
        renderMcSection();
      }, 320);
    });
  });
  inner.querySelectorAll('.mc-pal-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ app.mcState.currentIndex = parseInt(btn.dataset.jump,10); scheduleSave(); renderMcSection(); });
  });
  const prevBtn = document.getElementById('mcPrevBtn');
  if(prevBtn) prevBtn.addEventListener('click', ()=>{ if(app.mcState.currentIndex>0){ app.mcState.currentIndex--; scheduleSave(); renderMcSection(); } });
  const mcSubmitBtn = document.getElementById('submitSectionBtn');
  if(mcSubmitBtn) mcSubmitBtn.addEventListener('click', submitSection);
}

function bindSectionEvents(){
  const sec = app.section;
  if(sec==='matching'){
    document.querySelectorAll('.match-item[data-side="left"]').forEach(item=>{
      item.addEventListener('click', ()=>{
        matchPendingLeft = (matchPendingLeft===item.dataset.id) ? null : item.dataset.id;
        renderSection();
      });
    });
    document.querySelectorAll('.match-item[data-side="right"]').forEach(item=>{
      item.addEventListener('click', ()=>{
        if(!matchPendingLeft) return;
        const rid = item.dataset.id;
        Object.keys(draftAnswers.matching).forEach(lid=>{ if(draftAnswers.matching[lid]===rid) delete draftAnswers.matching[lid]; });
        draftAnswers.matching[matchPendingLeft] = rid;
        matchPendingLeft = null;
        scheduleSave();
        renderSection();
      });
    });
    const clearBtn = document.getElementById('clearMatchBtn');
    if(clearBtn) clearBtn.addEventListener('click', ()=>{ draftAnswers.matching = {}; matchPendingLeft = null; scheduleSave(); renderSection(); });
  } else if(sec==='written'){
    document.querySelectorAll('.written-textarea,.code-answer').forEach(ta=>{
      const updateLines=()=>{ const lines=document.querySelector(`[data-lines-for="${ta.dataset.qid}"]`); if(lines) lines.textContent=Array.from({length:Math.max(1,ta.value.split('\n').length)},(_,i)=>i+1).join('\n'); };
      updateLines();
      ta.addEventListener('input', ()=>{ draftAnswers.written[ta.dataset.qid] = ta.value; ta.classList.remove('flag-missing'); updateLines(); scheduleSave(); });
      if(ta.classList.contains('code-answer')) ta.addEventListener('keydown',event=>{ if(event.key==='Tab'){ event.preventDefault(); const start=ta.selectionStart,end=ta.selectionEnd; ta.value=ta.value.slice(0,start)+'  '+ta.value.slice(end); ta.selectionStart=ta.selectionEnd=start+2; ta.dispatchEvent(new Event('input')); } });
    });
  }
  const submitBtn = document.getElementById('submitSectionBtn');
  if(submitBtn) submitBtn.addEventListener('click', submitSection);
}

/* ============ SUBMIT SECTION (local only — no score is computed or shown here) ============ */
function submitSection(){
  app.submittedSections[app.section] = true;
  saveSession();
  if(app.section==='mc' && isOnlyMcSection()){
    // this exam only has a multiple-choice section — go straight to the final submit prompt
    attemptEndExam();
    return;
  }
  document.getElementById('levelResultModal').classList.remove('hidden');
}
document.getElementById('modalStayBtn').addEventListener('click', ()=>{ document.getElementById('levelResultModal').classList.add('hidden'); });
document.getElementById('modalHubBtn').addEventListener('click', ()=>{ document.getElementById('levelResultModal').classList.add('hidden'); showHub(); });

/* ============ SUBMIT RESULT TO BACKEND (server grades; score is never sent back) ============ */
async function submitFinalAnswers(autoSubmit){
  const record = {
    studentId: app.studentId, studentName: app.studentName, classRoom: app.classRoom,
    questionKey: app.questionKey, resitAccessId: app.resitAccessId || null, deviceId: EXAM_DEVICE_ID, autoSubmit: !!autoSubmit, lateCode: app.lateCode || null,
    tabSwitches: state.tabSwitches, reloadCount: app.reloadCount,
    fullscreenExitAttempts: state.fullscreenExitAttempts, rightClickAttempts: state.rightClickAttempts, copyAttempts: state.copyAttempts, sessionRecoveries: state.sessionRecoveries||0,
    integrityEvents: state.integrityEvents,
    answers: { mc: draftAnswers.mc, matching: draftAnswers.matching, written: draftAnswers.written }
  };
  const MAX_TRIES = 3;
  let lastErr = null;
  for(let attempt=1; attempt<=MAX_TRIES; attempt++){
    try{ return await apiSubmitResult(record); }
    catch(e){
      lastErr = e;
      if(e.payload?.error==='unauthorized'&&await recoverExamStudentSession()){
        record.sessionRecoveries=state.sessionRecoveries||0;
        record.integrityEvents=state.integrityEvents;
        continue;
      }
      // "already submitted" is not something a retry will fix — stop immediately
      if(e.payload && e.payload.error==='already_submitted') break;
      if(attempt<MAX_TRIES) await new Promise(r=>setTimeout(r, e.retryAfterMs || 800));
    }
  }
  console.error('ส่งคำตอบเข้าเซิร์ฟเวอร์ไม่สำเร็จ', lastErr);
  if(lastErr && lastErr.payload && lastErr.payload.error==='already_submitted'){
    // Another device completed this attempt. Treat this device as completed too,
    // then remove its local/server draft instead of trapping the student here.
    showToast('ข้อสอบชุดนี้ส่งจากอุปกรณ์อื่นเรียบร้อยแล้ว กำลังปิดข้อสอบบนเครื่องนี้');
    return {alreadySubmitted:true};
  }
  {
    const tr9 = window.I18N ? window.I18N.t : (s2=>s2);
    if(lastErr && lastErr.payload && lastErr.payload.error==='already_submitted'){
      showToast(tr9('รหัสนักเรียนนี้ได้ทำข้อสอบวิชานี้ไปแล้ว ระบบไม่รับคำตอบซ้ำ'));
    } else {
      const t = document.createElement('div');
      t.className='toast'; t.textContent = tr9('ส่งข้อสอบไม่สำเร็จ: ')+(lastErr?.message||tr9('กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'));
      document.body.appendChild(t); setTimeout(()=>t.remove(),2800);
    }
  }
  throw lastErr;
}

/* ============ END OF EXAM ============ */
let finalSubmissionInProgress=false;
function setSubmissionBusy(active,message='กำลังส่งข้อสอบ...'){
  let overlay=document.getElementById('submitOverlay');
  if(active){
    if(!overlay){overlay=document.createElement('div');overlay.id='submitOverlay';overlay.className='submit-overlay';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','assertive');overlay.innerHTML='<div class="submit-overlay-card"><i class="submit-spinner"></i><b data-submit-message></b><span>กรุณารอสักครู่ และอย่าปิดหน้านี้</span></div>';document.body.appendChild(overlay);}
    overlay.querySelector('[data-submit-message]').textContent=message;
  }else overlay?.remove();
  const button=document.getElementById('endExamBtn');
  if(button){if(active&&!button.dataset.originalText)button.dataset.originalText=button.textContent;button.disabled=active;button.textContent=active?(window.I18N?window.I18N.t('⏳ กำลังส่งข้อสอบ...'):'⏳ กำลังส่งข้อสอบ...'):(button.dataset.originalText||button.textContent);}
}
function forceTimeUp(){ finalizeExam('timeup'); }
async function finalizeExam(reason){
  if(finalSubmissionInProgress) return;
  finalSubmissionInProgress=true;
  const tr0 = window.I18N ? window.I18N.t : (s2=>s2);
  setSubmissionBusy(true,reason==='manual'?tr0('กำลังส่งข้อสอบ...'):tr0('กำลังบันทึกคำตอบอัตโนมัติ...'));
  const auto = reason !== 'manual';
  const activeSections = getActiveSections();
  app.examEnded = true;
  app.examInProgress = false;
  clearInterval(app.globalTimerHandle);
  saveSession();
  clearTimeout(_serverSaveHandle);
  _pendingServerPayload=null;
  for(let wait=0;_serverSaveInFlight&&wait<60;wait++) await new Promise(resolve=>setTimeout(resolve,50));
  let submission;
  try{ submission = await submitFinalAnswers(auto); }
  catch(e){ app.examEnded=false; app.examInProgress=true; finalSubmissionInProgress=false; setSubmissionBusy(false); runGlobalTimer(); return; }
  try{ await apiClearExamDraft(app.questionKey,app.resitAccessId); }catch(error){}
  clearSessionData();
  // Once this subject's exam has ended, the anti-cheat counters for it are done being tracked —
  // clear them immediately so they never carry over into a different subject or a shared device.
  state = { tabSwitches: 0, tabWarningAcknowledged: 0, fullscreenExitAttempts: 0, rightClickAttempts: 0, copyAttempts: 0, sessionRecoveries: 0, integrityEvents: [] };
  examScreen.classList.add('hidden');
  setSubmissionBusy(false);
  setFloatingThemeButtonVisible(true);
  finalScreen.classList.remove('hidden');
  const headlines = {
    manual: 'ส่งคำตอบเรียบร้อยแล้ว',
    timeup: 'หมดเวลาสอบ — ส่งคำตอบอัตโนมัติแล้ว',
    tabswitch: 'ตรวจพบการสลับหน้าจอซ้ำ — ส่งคำตอบอัตโนมัติแล้ว'
  };
  const summaries = {
    manual: 'ระบบได้บันทึกคำตอบทุกส่วนที่คุณทำไว้ และส่งเข้าสู่ระบบเรียบร้อยแล้ว',
    timeup: 'ครบเวลา 60 นาทีแล้ว ระบบปิดการทำข้อสอบและส่งคำตอบของคุณเข้าสู่ระบบให้อัตโนมัติ (แม้จะยังตอบไม่ครบทุกข้อ)',
    tabswitch: 'คุณสลับหน้าจอ/แท็บหลังจากได้รับคำเตือนแล้ว ระบบจึงปิดการทำข้อสอบและส่งคำตอบที่มีอยู่ให้อัตโนมัติ'
  };
  document.getElementById('finalHeadline').textContent = tr0(submission?.alreadySubmitted ? 'ข้อสอบชุดนี้ส่งเรียบร้อยแล้ว' : (headlines[reason] || headlines.manual));
  document.getElementById('finalSummaryText').textContent = tr0(submission?.alreadySubmitted
    ? 'ตรวจพบว่าคำตอบของชุดนี้ถูกส่งจากอุปกรณ์อื่นแล้ว ระบบจึงปิดข้อสอบบนเครื่องนี้และล้างร่างที่ค้างไว้ให้เรียบร้อย'
    : (summaries[reason] || summaries.manual));
  const list = document.getElementById('finalList');
  list.innerHTML = activeSections.map(sec=>{
    const done = app.submittedSections[sec];
    const tr = window.I18N ? window.I18N.t : (s=>s);
    return `<div class="final-row"><span>${tr(SECTION_TITLES[sec])}</span><b>${done ? tr('ส่งคำตอบแล้ว') : tr('ไม่ได้ทำ')}</b></div>`;
  }).join('');
}
document.getElementById('restartAllBtn').addEventListener('click', ()=>{
  finalSubmissionInProgress=false;
  clearSessionData();
  app = {studentId:app.studentId, studentName:app.studentName, classRoom:app.classRoom, studentToken:app.studentToken, questionKey:null, section:null, lateCode:null, draftRevision:0, submittedSections:{mc:false,matching:false,written:false}, mcState:null, timeLeft:60*60, examEndTime:null, globalTimerHandle:null, examEnded:false, examInProgress:false, reloadCount:0};
  state = {tabSwitches:0, tabWarningAcknowledged:0, fullscreenExitAttempts:0, rightClickAttempts:0, copyAttempts:0, sessionRecoveries:0, integrityEvents:[]};
  draftAnswers = {mc:{}, matching:{}, written:{}};
  proceedToSelectScreen();
});

/* ============ RESUME AFTER REFRESH ============ */
function attemptResumeSession(){
  const saved = loadSessionData();
  if(!saved || !saved.questionKey) return false;
  ELIGIBLE_SETS = saved.eligibleSets || [];
  ELIGIBLE_SETS_BY_KEY = {}; ELIGIBLE_SETS.forEach(s=>ELIGIBLE_SETS_BY_KEY[s.key]=s);
  if(!ELIGIBLE_SETS_BY_KEY[saved.questionKey]) return false;
  if(saved.examEnded) return false; // already submitted — start fresh rather than showing a stale confirmation

  app.studentId = saved.studentId; app.studentName = saved.studentName || ''; app.classRoom = saved.classRoom || '';
  app.questionKey = saved.questionKey; app.lateCode = saved.lateCode || null;
  app.draftRevision = Number(saved.draftRevision)||0;
  app.submittedSections = saved.submittedSections || {mc:false, matching:false, written:false};
  app.mcState = saved.mcState || null;
  app.examEndTime = saved.examEndTime;
  app.reloadCount = (saved.reloadCount||0) + 1;
  state.tabSwitches = saved.tabSwitches || 0;
  state.tabWarningAcknowledged = saved.tabWarningAcknowledged || 0;
  state.fullscreenExitAttempts = saved.fullscreenExitAttempts || 0;
  state.rightClickAttempts = saved.rightClickAttempts || 0;
  state.copyAttempts = saved.copyAttempts || 0;
  state.sessionRecoveries = saved.sessionRecoveries || 0;
  state.integrityEvents = Array.isArray(saved.integrityEvents) ? saved.integrityEvents : [];
  recordIntegrityEvent('reload');
  draftAnswers = saved.draftAnswers || {mc:{}, matching:{}, written:{}};

  hideAllTopScreens();
  examScreen.classList.remove('hidden');
  setFloatingThemeButtonVisible(false);
  app.examInProgress = true;
  document.getElementById('nameTag').textContent = '👤 ' + app.studentName + ' (' + app.classRoom + ')';
  document.getElementById('hubQTitle').textContent = 'ชุดข้อสอบ: ' + currentQuestion().title;
  document.getElementById('hubQTagline').textContent = currentQuestion().tagline||'';
  document.getElementById('tabSwitchTag').textContent = 'สลับแท็บ: '+state.tabSwitches+' ครั้ง';
  if(state.tabSwitches>0) document.getElementById('tabSwitchTag').classList.add('badge-warn');
  updateCheatTags();
  updateReloadTag();

  if(state.tabSwitches>=3&&!state.integrityEvents.some(event=>event?.type==='answers_reset')) resetAllExamAnswers();
  if(state.tabSwitches>=5){
    updateGlobalTimerDisplay();
    saveSession();
    setTimeout(()=>finalizeExam('tabswitch'),0);
    return true;
  }

  const remaining = app.examEndTime ? Math.max(0, Math.round((app.examEndTime - Date.now())/1000)) : 0;
  app.timeLeft = remaining;
  if(remaining<=0){ showHub(); saveSession(); forceTimeUp(); return true; }
  if(app.section) enterSection(app.section); else showHub();
  updateGlobalTimerDisplay();
  runGlobalTimer();
  saveSession();
  return true;
}

function renderQuestionResources(question){
  const resources=question?.resources;
  if(!resources || typeof resources!=='object') return '';
  const parts=[];
  if(resources.code) parts.push(`<pre class="question-code"><code>${escapeHtml(resources.code)}</code></pre>`);
  const assets=(resources.attachments||[]).filter(item=>{
    try { const url=new URL(item?.url); return url.protocol==='https:'; } catch(_) { return false; }
  });
  if(assets.length) parts.push(`<div class="question-assets">${assets.map(item=>String(item.type||'').startsWith('image/')
    ? `<img class="question-asset-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name||'รูปภาพประกอบโจทย์')}" loading="lazy">`
    : `<a class="question-asset-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">📎 ${escapeHtml(item.name||'เปิดไฟล์แนบ')}</a>`).join('')}</div>`);
  return parts.length ? `<div class="question-resources">${parts.join('')}</div>` : '';
}

function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function showToast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = window.I18N ? window.I18N.t(msg) : msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2800);
}

async function continueVerifiedStudent(){
  if(!app.studentToken) return false;
  try{
    const result = await apiFetch('/api/student/session');
    app.studentId = result.student.studentId;
    app.studentName = result.student.firstName+' '+result.student.lastName;
    app.classRoom = result.student.classRoom;
    if(new URLSearchParams(location.search).get('continue')==='1') history.replaceState({},'',location.pathname);
    await proceedToSelectScreen();
    document.documentElement.classList.remove('restoring-session');
    return true;
  }catch(e){
    sessionStorage.removeItem('examStudentToken');
    app.studentToken = '';
    document.documentElement.classList.remove('restoring-session');
    return false;
  }
}

/* ============ INIT ============ */
examSystemIsClosed().then(closed=>{
  if(closed)return;
  if(!attemptResumeSession()){
    continueVerifiedStudent().then(continued=>{ if(!continued) startScreen.classList.remove('hidden'); });
  }else document.documentElement.classList.remove('restoring-session');
});

document.addEventListener('i18nchange', ()=>{
  if(!examScreen.classList.contains('hidden')){
    if(app.section) renderSection(); else showHub();
  }
  updateCheatTags();
});

})();
