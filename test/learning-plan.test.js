const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_UNITS, sanitizeLearningPlan, validateLearningPlan } = require('../src/learning-plan');

test('learning plan sanitizes nested units and repeatable rows', () => {
  const plan = sanitizeLearningPlan({
    subjectName: ' การเขียนโปรแกรม ', subjectCode: ' 20001 ', teacherName: 'อาจารย์ทดสอบ',
    units: [{ unitTitle: ' หน่วยแรก ', objectives: ' เข้าใจพื้นฐาน ' }],
    scheduleRows: [{ unitNo: 1, unitTitle: 'หน่วยแรก', ignored: 'ไม่บันทึก' }]
  });
  assert.equal(plan.subjectName, 'การเขียนโปรแกรม');
  assert.deepEqual(plan.units[0], { unitNo: '1', unitTitle: 'หน่วยแรก', unitHours: '', learningOutcomes: '', referenceStandards: '', element: '', performanceCriteria: '', assessmentMethod: '', competency: '', objectives: 'เข้าใจพื้นฐาน', content: '', learningActivities: '', learningResources: '', knowledgeEvidence: '', practicalEvidence: '', assessmentTools: '', assessmentCriteria: '' });
  assert.equal(plan.scheduleRows[0].ignored, undefined);
  assert.deepEqual(validateLearningPlan(plan), []);
});

test('learning plan requires identity fields and at least one named unit', () => {
  const plan = sanitizeLearningPlan({ units: [{}] });
  assert.deepEqual(validateLearningPlan(plan), [
    'กรุณากรอกชื่อรายวิชา', 'กรุณากรอกรหัสวิชา', 'กรุณากรอกชื่อผู้สอน', 'กรุณากรอกชื่อหน่วยที่ 1'
  ]);
});

test('learning plan limits the number of units', () => {
  const plan = sanitizeLearningPlan({ units: Array.from({ length: MAX_UNITS + 5 }, (_, index) => ({ unitTitle: `หน่วย ${index + 1}` })) });
  assert.equal(plan.units.length, MAX_UNITS);
});
