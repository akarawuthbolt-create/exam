/* Admin-only learning plan editor. Kept separate from exam-set editing so the
   multi-unit form can evolve without affecting the live examination flow. */
const { apiFetch, escapeHtml, escapeAttr, showToast, downloadAdminAsset } = window.adminLearningPlanBridge;
let learningPlans = [];
let editingLearningPlan = null;
let learningPlanOpenRowGroup = '';

const learningPlanScalarSections = [
  { title:'1. ข้อมูลรายวิชาและผู้สอน', description:'ข้อมูลหน้าปกและลักษณะรายวิชา', fields:[
    ['subjectName','ชื่อรายวิชา','text',true],['subjectCode','รหัสวิชา','text',true],['subjectCategory','ประเภทวิชา'],
    ['curriculum','หลักสูตร'],['educationLevel','ระดับชั้น'],['studentProgram','สาขาวิชาของผู้เรียน'],
    ['occupationalGroup','กลุ่มอาชีพ'],['teacherName','อาจารย์ประจำวิชา','text',true],['credits','หน่วยกิต','number'],
    ['theoryHoursPerWeek','ทฤษฎี (ชั่วโมง/สัปดาห์)','number'],['practicalHoursPerWeek','ปฏิบัติ (ชั่วโมง/สัปดาห์)','number'],
    ['semesterHours','เวลาเรียนต่อภาค (ชั่วโมง)','number']
  ]},
  { title:'2. รายละเอียดหลักสูตร', description:'ข้อความส่วนคำนำ ผลลัพธ์ จุดประสงค์ สมรรถนะ และคำอธิบายรายวิชา', textareas:[
    ['introductionText','คำนำ'],['curriculumStandards','อ้างอิงมาตรฐานหลักสูตร'],
    ['courseLearningOutcomes','ผลลัพธ์การเรียนรู้ระดับรายวิชา'],['courseObjectives','จุดประสงค์รายวิชา'],
    ['courseCompetencies','สมรรถนะรายวิชา'],['courseDescription','คำอธิบายรายวิชา'],['courseJobOutcome','งาน/ผลลัพธ์ระดับรายวิชา']
  ]},
  { title:'3. มาตรฐานอาชีพและผู้อนุมัติ', description:'กรอกเฉพาะรายการที่ใช้กับรายวิชานี้', fields:[
    ['standardAgency','หน่วยงานรับรองมาตรฐานอาชีพ'],['occupationalStandardField','มาตรฐานอาชีพ/สาขาวิชาชีพ'],
    ['occupationSector','อาชีพ'],['occupationalLevel','ระดับมาตรฐาน'],['occupationalStandardUrl','ลิงก์มาตรฐานอาชีพ','url'],
    ['departmentHeadName','หัวหน้าสาขาวิชา'],['academicDirectorName','รองผู้อำนวยการฝ่ายการศึกษา']
  ]}
];

const learningPlanRowGroups = {
  competencyRows:{ title:'ตารางหน่วยสมรรถนะ', fields:[['unitCode','รหัสหน่วย'],['unitDescription','คำอธิบายหน่วย'],['elementCode','รหัสสมรรถนะย่อย'],['elementDescription','สมรรถนะย่อย'],['performanceCriteria','เกณฑ์การปฏิบัติงาน'],['assessmentProcedure','วิธีประเมิน']] },
  dutyRows:{ title:'ตารางวิเคราะห์งาน', fields:[['duty','งานหลัก'],['task','งานย่อย'],['occupationalElement','สมรรถนะย่อย'],['operationalKnowledge','ความรู้ในการปฏิบัติงาน'],['operationalSkills','ทักษะในการปฏิบัติงาน']] },
  analysisRows:{ title:'ตารางวิเคราะห์หลักสูตร', fields:[['unitName','ชื่อหน่วย'],['knowledge','ความรู้'],['comprehension','ความเข้าใจ'],['implementation','นำไปใช้'],['analysis','วิเคราะห์'],['synthesis','สังเคราะห์'],['evaluation','ประเมินค่า'],['skill','ทักษะ'],['attitude','จิตพิสัย'],['application','ประยุกต์ใช้'],['total','รวม'],['priority','ลำดับ'],['periods','จำนวนคาบ']] },
  scheduleRows:{ title:'กำหนดการสอน', fields:[['unitNo','หน่วยที่'],['unitTitle','ชื่อหน่วย'],['theoryHours','ทฤษฎี'],['practicalHours','ปฏิบัติ'],['totalHours','รวม']] },
  evaluationRows:{ title:'ตารางประเมินสมรรถนะ', fields:[['competency','สมรรถนะ'],['expectedLevel','ระดับคาดหวัง'],['level1','ระดับ 1'],['level2','ระดับ 2'],['level3','ระดับ 3'],['level4','ระดับ 4'],['level5','ระดับ 5'],['learnerPercentage','ร้อยละผู้เรียน']] },
  assignments:{ title:'ใบความรู้ / ใบงาน', fields:[['worksheetNo','ใบงานที่'],['unitNo','หน่วยที่'],['sessionNo','สอนครั้งที่'],['title','ชื่อเรื่อง'],['theoryHours','ทฤษฎี'],['practicalHours','ปฏิบัติ'],['content','รายละเอียดใบงาน']] }
};

const learningPlanPostSection = {
  fields:[
    ['teacherApprovalDate','วันที่ผู้สอนลงนาม','date'],['departmentHeadApprovalDate','วันที่หัวหน้าสาขาตรวจ','date'],
    ['academicDirectorApprovalDate','วันที่รองผู้อำนวยการตรวจ','date'],['teachingRecordDate','วันที่บันทึกหลังสอน','date'],
    ['departmentHeadDecisionDate','วันที่หัวหน้าสาขาอนุมัติ','date'],['academicDirectorDecisionDate','วันที่รองผู้อำนวยการอนุมัติ','date']
  ],
  textareas:[
    ['teachingConclusion','ข้อสรุปหลังการจัดการเรียนรู้'],['teachingProblems','ปัญหาที่พบ'],['improvementGuideline','แนวทางการแก้ปัญหา'],
    ['departmentHeadRevisionTopic','หัวข้อที่ควรปรับปรุง'],['departmentHeadRevisionDetail','รายละเอียดความเห็นหัวหน้าสาขา'],
    ['academicDirectorComment','ความเห็นรองผู้อำนวยการ'],['academicDirectorOtherComment','ความเห็นอื่น ๆ']
  ]
};

const unitFields = [
  ['unitNo','หน่วยที่','text'],['unitTitle','ชื่อหน่วย','text',true],['unitHours','จำนวนชั่วโมง','number'],
  ['learningOutcomes','ผลลัพธ์การเรียนรู้ระดับหน่วย'],['referenceStandards','อ้างอิงมาตรฐาน/เชื่อมโยงกลุ่มอาชีพ'],
  ['element','สมรรถนะย่อย'],['performanceCriteria','เกณฑ์การปฏิบัติงาน'],['assessmentMethod','วิธีประเมิน'],
  ['competency','สมรรถนะประจำหน่วย'],['objectives','จุดประสงค์การเรียนรู้'],['content','สาระการเรียนรู้'],
  ['learningActivities','กิจกรรมการเรียนรู้'],['learningResources','สื่อและแหล่งการเรียนรู้'],
  ['knowledgeEvidence','หลักฐานความรู้'],['practicalEvidence','หลักฐานการปฏิบัติงาน'],
  ['assessmentTools','เครื่องมือประเมิน'],['assessmentCriteria','เกณฑ์การประเมิน']
];

function emptyLearningPlan(){
  return { units:[{unitNo:'1',unitTitle:''}], competencyRows:[], dutyRows:[], analysisRows:[], scheduleRows:[], evaluationRows:[], assignments:[] };
}

function learningPlanDateTime(value){
  if(!value) return '-';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'-':date.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
}

function learningPlanField([name,label,type='text',required=false], value='', prefix='data-plan-field'){
  const safeValue=escapeAttr(value??'');
  return `<div class="field"><label>${escapeHtml(label)}${required?' <span class="required-mark">*</span>':''}</label><input ${prefix}="${escapeAttr(name)}" type="${type}" value="${safeValue}" ${required?'required':''}></div>`;
}

function learningPlanTextarea([name,label], value='', attr='data-plan-field'){
  return `<div class="field learning-plan-wide-field"><label>${escapeHtml(label)}</label><textarea ${attr}="${escapeAttr(name)}" rows="3">${escapeHtml(value??'')}</textarea></div>`;
}

function renderLearningPlanList(){
  const wrap=document.getElementById('learningPlansWrap');
  wrap.innerHTML=`<div class="toolbar-row"><div><h2>สร้างแผนการสอน</h2><p class="sub" style="margin:0;">จัดเก็บข้อมูลตามแบบฟอร์ม Word และเพิ่มหน่วยการเรียนได้หลายหน่วย</p></div><button class="btn btn-primary btn-sm" id="newLearningPlanBtn">＋ สร้างแผนการสอน</button></div>
    ${learningPlans.length?`<div class="learning-plan-list">${learningPlans.map(plan=>`<div class="learning-plan-list-card"><div><h3>${escapeHtml(plan.subjectName||'ยังไม่ระบุชื่อวิชา')}</h3><p>${escapeHtml(plan.subjectCode||'-')} · ผู้สอน ${escapeHtml(plan.teacherName||'-')} · ${plan.units?.length||0} หน่วย</p><span>แก้ไขล่าสุด ${escapeHtml(learningPlanDateTime(plan.updatedAt))}</span></div><div class="editor-actions"><button class="btn btn-primary btn-sm" data-download-learning-plan="${escapeAttr(plan.id)}">⬇ Word</button><button class="btn btn-ghost btn-sm" data-edit-learning-plan="${escapeAttr(plan.id)}">แก้ไข</button><button class="btn btn-danger btn-sm" data-delete-learning-plan="${escapeAttr(plan.id)}">ลบ</button></div></div>`).join('')}</div>`:'<div class="empty-note">ยังไม่มีแผนการสอน กด “สร้างแผนการสอน” เพื่อเริ่มกรอกข้อมูล</div>'}`;
  document.getElementById('newLearningPlanBtn').addEventListener('click',()=>{learningPlanOpenRowGroup='';openLearningPlanEditor(emptyLearningPlan());});
  wrap.querySelectorAll('[data-edit-learning-plan]').forEach(button=>button.addEventListener('click',()=>{learningPlanOpenRowGroup='';openLearningPlanEditor(learningPlans.find(plan=>plan.id===button.dataset.editLearningPlan));}));
  wrap.querySelectorAll('[data-download-learning-plan]').forEach(button=>button.addEventListener('click',()=>downloadLearningPlan(button.dataset.downloadLearningPlan,button)));
  wrap.querySelectorAll('[data-delete-learning-plan]').forEach(button=>button.addEventListener('click',()=>deleteLearningPlan(button.dataset.deleteLearningPlan)));
}

function renderScalarSections(plan){
  return learningPlanScalarSections.map((section,index)=>`<details class="learning-plan-section" ${index<2?'open':''}><summary><span>${escapeHtml(section.title)}</span><small>${escapeHtml(section.description)}</small></summary><div class="learning-plan-section-body"><div class="learning-plan-field-grid">${(section.fields||[]).map(field=>learningPlanField(field,plan[field[0]])).join('')}</div>${(section.textareas||[]).map(field=>learningPlanTextarea(field,plan[field[0]])).join('')}</div></details>`).join('');
}

function renderUnitCard(unit,index,units){
  const textInputs=unitFields.slice(0,3).map(field=>learningPlanField(field,unit[field[0]],'data-unit-field')).join('');
  const textareas=unitFields.slice(3).map(field=>learningPlanTextarea(field,unit[field[0]],'data-unit-field')).join('');
  return `<article class="learning-unit-card" data-unit-index="${index}"><header><div><span>หน่วยการเรียนที่ ${index+1}</span><b>${escapeHtml(unit.unitTitle||'ยังไม่ระบุชื่อหน่วย')}</b></div><div class="learning-unit-actions"><button type="button" class="btn btn-ghost btn-sm" data-move-unit="up" ${index===0?'disabled':''}>↑</button><button type="button" class="btn btn-ghost btn-sm" data-move-unit="down" ${index===units.length-1?'disabled':''}>↓</button><button type="button" class="btn btn-danger btn-sm" data-remove-unit>ลบหน่วย</button></div></header><div class="learning-plan-field-grid">${textInputs}</div><div class="learning-unit-detail-grid">${textareas}</div></article>`;
}

function renderRowGroup(key,rows){
  const group=learningPlanRowGroups[key];
  return `<details class="learning-plan-section" ${learningPlanOpenRowGroup===key?'open':''}><summary><span>${escapeHtml(group.title)}</span><small>${rows.length} รายการ · เพิ่มเฉพาะข้อมูลที่ใช้</small></summary><div class="learning-plan-section-body" data-row-group="${key}"><div class="learning-plan-repeat-rows">${rows.map((row,index)=>renderRepeatRow(key,row,index)).join('')}</div><button class="add-row-btn" type="button" data-add-plan-row="${key}">＋ เพิ่มรายการ</button></div></details>`;
}

function renderRepeatRow(key,row,index){
  const group=learningPlanRowGroups[key];
  return `<div class="learning-plan-repeat-row" data-row-index="${index}"><div class="learning-plan-repeat-head"><b>รายการที่ ${index+1}</b><button class="btn btn-danger btn-sm" type="button" data-remove-plan-row>ลบ</button></div><div class="learning-plan-field-grid">${group.fields.map(field=>learningPlanField(field,row[field[0]],'data-row-field')).join('')}</div></div>`;
}

function openLearningPlanEditor(source){
  editingLearningPlan=JSON.parse(JSON.stringify(source||emptyLearningPlan()));
  if(!Array.isArray(editingLearningPlan.units)||!editingLearningPlan.units.length) editingLearningPlan.units=[{unitNo:'1',unitTitle:''}];
  Object.keys(learningPlanRowGroups).forEach(key=>{ if(!Array.isArray(editingLearningPlan[key])) editingLearningPlan[key]=[]; });
  const wrap=document.getElementById('learningPlansWrap');
  wrap.innerHTML=`<form id="learningPlanForm"><div class="toolbar-row learning-plan-editor-head"><div><h2>${editingLearningPlan.id?'แก้ไข':'สร้าง'}แผนการสอน</h2><p class="sub" style="margin:0;">กรอกข้อมูลตามหัวข้อ สามารถเปิดเฉพาะส่วนที่ต้องการทำงานได้</p></div><div class="editor-actions"><button class="btn btn-ghost btn-sm" type="button" id="cancelLearningPlanBtn">← กลับรายการ</button><button class="btn btn-primary btn-sm" type="submit">💾 บันทึกแผน</button></div></div>
    ${renderScalarSections(editingLearningPlan)}
    <section class="learning-plan-units"><div class="section-hero-card"><div><h3>4. หน่วยการเรียนรู้</h3><p>แต่ละหน่วยเก็บรายละเอียดของตัวเอง และจัดลำดับได้ด้วยปุ่มขึ้น/ลง</p></div><button class="btn btn-primary btn-sm" type="button" id="addLearningUnitBtn">＋ เพิ่มหน่วย</button></div><div id="learningUnitsHost">${editingLearningPlan.units.map(renderUnitCard).join('')}</div></section>
    <div class="section-hero-card"><div><h3>5. ตารางประกอบแผน</h3><p>เพิ่มจำนวนแถวได้ตามข้อมูลจริง ระบบจะนำไปสร้างตารางในเอกสารภายหลัง</p></div></div>${Object.keys(learningPlanRowGroups).map(key=>renderRowGroup(key,editingLearningPlan[key])).join('')}
    <details class="learning-plan-section"><summary><span>6. บันทึกหลังสอนและการอนุมัติ</span><small>ข้อมูลส่วนนี้ไม่บังคับ สามารถกลับมาเติมหลังสอนได้</small></summary><div class="learning-plan-section-body"><div class="learning-plan-field-grid">${learningPlanPostSection.fields.map(field=>learningPlanField(field,editingLearningPlan[field[0]])).join('')}</div>${learningPlanPostSection.textareas.map(field=>learningPlanTextarea(field,editingLearningPlan[field[0]])).join('')}</div></details>
    <div class="learning-plan-savebar"><span id="learningPlanFormStatus">ข้อมูลที่มี <span class="required-mark">*</span> ต้องกรอกให้ครบ</span><div class="editor-actions"><button class="btn btn-ghost" type="button" id="cancelLearningPlanBottomBtn">ยกเลิก</button><button class="btn btn-primary" type="submit">💾 บันทึกแผนการสอน</button></div></div></form>`;
  bindLearningPlanEditor();
  window.scrollTo({top:0,behavior:'smooth'});
}

function syncLearningPlanEditor(){ editingLearningPlan=collectLearningPlanForm(false); }

function collectLearningPlanForm(validate=true){
  const form=document.getElementById('learningPlanForm');
  const plan={};
  form.querySelectorAll('[data-plan-field]').forEach(input=>plan[input.dataset.planField]=input.value);
  plan.units=[...form.querySelectorAll('[data-unit-index]')].map(card=>{const unit={};card.querySelectorAll('[data-unit-field]').forEach(input=>unit[input.dataset.unitField]=input.value);return unit;});
  Object.keys(learningPlanRowGroups).forEach(key=>{plan[key]=[...form.querySelector(`[data-row-group="${key}"]`).querySelectorAll('[data-row-index]')].map(card=>{const row={};card.querySelectorAll('[data-row-field]').forEach(input=>row[input.dataset.rowField]=input.value);return row;});});
  if(editingLearningPlan?.id) plan.id=editingLearningPlan.id;
  if(validate){
    if(!plan.subjectName.trim()) throw new Error('กรุณากรอกชื่อรายวิชา');
    if(!plan.subjectCode.trim()) throw new Error('กรุณากรอกรหัสวิชา');
    if(!plan.teacherName.trim()) throw new Error('กรุณากรอกชื่อผู้สอน');
    const missing=plan.units.findIndex(unit=>!unit.unitTitle.trim());
    if(missing>=0) throw new Error(`กรุณากรอกชื่อหน่วยที่ ${missing+1}`);
  }
  return plan;
}

function bindLearningPlanEditor(){
  const form=document.getElementById('learningPlanForm');
  const cancel=()=>{ if(confirm('กลับหน้ารายการโดยไม่บันทึกการแก้ไขหรือไม่?')) renderLearningPlanList(); };
  document.getElementById('cancelLearningPlanBtn').addEventListener('click',cancel);
  document.getElementById('cancelLearningPlanBottomBtn').addEventListener('click',cancel);
  document.getElementById('addLearningUnitBtn').addEventListener('click',()=>{syncLearningPlanEditor();if(editingLearningPlan.units.length>=10)return showToast('แบบฟอร์มรองรับสูงสุด 10 หน่วยตามสารบัญต้นฉบับ');editingLearningPlan.units.push({unitNo:String(editingLearningPlan.units.length+1),unitTitle:''});openLearningPlanEditor(editingLearningPlan);});
  form.addEventListener('click',event=>{
    const unitCard=event.target.closest('[data-unit-index]');
    if(event.target.closest('[data-remove-unit]')&&unitCard){syncLearningPlanEditor();if(editingLearningPlan.units.length===1)return showToast('ต้องมีอย่างน้อย 1 หน่วย');editingLearningPlan.units.splice(Number(unitCard.dataset.unitIndex),1);openLearningPlanEditor(editingLearningPlan);return;}
    const move=event.target.closest('[data-move-unit]');
    if(move&&unitCard){syncLearningPlanEditor();const index=Number(unitCard.dataset.unitIndex),next=move.dataset.moveUnit==='up'?index-1:index+1;if(next<0||next>=editingLearningPlan.units.length)return;[editingLearningPlan.units[index],editingLearningPlan.units[next]]=[editingLearningPlan.units[next],editingLearningPlan.units[index]];openLearningPlanEditor(editingLearningPlan);return;}
    const add=event.target.closest('[data-add-plan-row]');
    if(add){syncLearningPlanEditor();learningPlanOpenRowGroup=add.dataset.addPlanRow;editingLearningPlan[add.dataset.addPlanRow].push({});openLearningPlanEditor(editingLearningPlan);return;}
    const remove=event.target.closest('[data-remove-plan-row]');
    if(remove){const group=remove.closest('[data-row-group]'),row=remove.closest('[data-row-index]');syncLearningPlanEditor();learningPlanOpenRowGroup=group.dataset.rowGroup;editingLearningPlan[group.dataset.rowGroup].splice(Number(row.dataset.rowIndex),1);openLearningPlanEditor(editingLearningPlan);}
  });
  form.addEventListener('submit',saveLearningPlan);
}

async function saveLearningPlan(event){
  event.preventDefault();
  const buttons=[...event.currentTarget.querySelectorAll('button[type="submit"]')],status=document.getElementById('learningPlanFormStatus');
  try{
    const plan=collectLearningPlanForm();buttons.forEach(button=>button.disabled=true);status.textContent='กำลังบันทึก...';
    const saved=await apiFetch(plan.id?'/api/admin/learning-plans/'+encodeURIComponent(plan.id):'/api/admin/learning-plans',{method:plan.id?'PUT':'POST',body:plan,admin:true});
    showToast('บันทึกแผนการสอนแล้ว');editingLearningPlan=saved;await refreshLearningPlans();
  }catch(error){showToast(error.message);status.textContent=error.message;}finally{buttons.forEach(button=>button.disabled=false);}
}

async function deleteLearningPlan(id){
  const plan=learningPlans.find(item=>item.id===id);if(!plan||!confirm(`ลบแผนการสอน “${plan.subjectName}” หรือไม่?`))return;
  try{await apiFetch('/api/admin/learning-plans/'+encodeURIComponent(id),{method:'DELETE',admin:true});showToast('ลบแผนการสอนแล้ว');await refreshLearningPlans();}catch(error){showToast(error.message);}
}

async function downloadLearningPlan(id,button){
  const original=button.textContent;button.disabled=true;button.textContent='กำลังสร้าง...';
  try{await downloadAdminAsset('/api/admin/learning-plans/'+encodeURIComponent(id)+'.docx','แผนการสอน.docx');showToast('ดาวน์โหลดแผนการสอน Word แล้ว');}catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent=original;}
}

async function refreshLearningPlans(){
  const wrap=document.getElementById('learningPlansWrap');if(!wrap)return;
  wrap.innerHTML='<div class="loading-note">กำลังโหลดแผนการสอน...</div>';
  try{learningPlans=await apiFetch('/api/admin/learning-plans',{admin:true});renderLearningPlanList();}catch(error){wrap.innerHTML=`<div class="empty-note">${escapeHtml(error.message)}</div>`;}
}
