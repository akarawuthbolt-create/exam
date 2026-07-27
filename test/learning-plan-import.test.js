const test = require('node:test');
const assert = require('node:assert/strict');
const { importLearningPlanJson, parseUnitTable } = require('../public/assets/learning-plan-import');

const unitTable = `| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | หัวข้อเรื่อง | ทฤษฎี | ปฏิบัติ | รวม |
| --- | --- | --- | --- | --- | --- |
| 1 | อาเรย์ | - แนวคิดอาเรย์<br>- การใช้งาน | 1 | 2 | 3 |
| 2 | สแต็ก | - แนวคิดสแต็ก | 2 | 4 | 6 |`;

test('learning plan JSON importer maps generated units without inventing missing activities', () => {
  const imported = importLearningPlanJson({
    formData: { courseCode:'21900-1002', courseName:'โครงสร้างข้อมูล', credits:'2', ratio:'1-2-2', courseCategory:'vocational' },
    unitDivisionPlan: unitTable,
    loResults: [{ unitName:'อาเรย์', outcome:'ใช้อาเรย์ได้' }, { unitName:'สแต็ก', outcome:'ใช้สแต็กได้' }],
    compResults: [{ unitName:'อาเรย์', competencies:['จัดการอาเรย์'] }],
    objResults: [{ unitName:'อาเรย์', cognitive:['📌 เรื่อง: อาเรย์','อธิบายอาเรย์ได้','(คุณครูสามารถพิจารณาเลือกใช้ตามความเหมาะสม)'] }],
    conceptResults: [{ unitName:'อาเรย์', concept:['แนวคิดอาเรย์'] }],
    activitiesResults: [{ unitName:'อาเรย์', activities:[{week:1,phase:'ขั้นนำ',name:'ถามตอบ',teacherAction:'ตั้งคำถาม',studentAction:'ตอบคำถาม'}], assessmentTools:['แบบสังเกต'] }]
  });
  assert.equal(imported.plan.subjectName, 'โครงสร้างข้อมูล');
  assert.equal(imported.plan.units.length, 2);
  assert.equal(imported.plan.units[0].unitHours, '3');
  assert.match(imported.plan.units[0].learningActivities, /ผู้สอน: ตั้งคำถาม/);
  assert.equal(imported.plan.units[1].learningActivities, '');
  assert.deepEqual(imported.summary, { units:2, completeActivities:1 });
  assert.equal(imported.plan.scheduleRows[1].practicalHours, '4');
});

test('learning plan JSON importer accepts lp-prefixed backup fields', () => {
  const imported = importLearningPlanJson({ lp_formData:{courseCode:'1',courseName:'ทดสอบ'}, lp_unitDivisionPlan:unitTable });
  assert.equal(imported.plan.subjectCode, '1');
  assert.equal(imported.plan.units[0].content, '1. แนวคิดอาเรย์\n2. การใช้งาน');
});

test('unit table parser rejects headers and keeps only numbered units', () => {
  assert.deepEqual(parseUnitTable(unitTable).map(row => row.unitNo), ['1','2']);
});
