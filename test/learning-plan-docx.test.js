const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { buildLearningPlanDocx } = require('../src/learning-plan-docx');
const { visibleText } = require('../src/question-analysis-docx');

test('learning plan Word export repeats unit sections and fills repeatable rows', async () => {
  const buffer = await buildLearningPlanDocx({
    subjectName:'การเขียนโปรแกรม', subjectCode:'20001', teacherName:'อาจารย์ทดสอบ',
    units:[
      { unitNo:'1', unitTitle:'พื้นฐาน', objectives:'เข้าใจพื้นฐาน', learningActivities:'สาธิต' },
      { unitNo:'2', unitTitle:'เงื่อนไข', objectives:'เขียนเงื่อนไข', learningActivities:'ฝึกปฏิบัติ' }
    ],
    competencyRows:[{ unitCode:'U1', unitDescription:'พื้นฐาน' }],
    dutyRows:[], analysisRows:[], scheduleRows:[{unitNo:'1',unitTitle:'พื้นฐาน',totalHours:'6'}], evaluationRows:[],
    assignments:[{ worksheetNo:'1', unitNo:'1', sessionNo:'1', title:'แบบฝึกพื้นฐาน', content:'ตอบคำถาม' }]
  });
  assert.equal(buffer.subarray(0,2).toString(),'PK');
  const zip=await JSZip.loadAsync(buffer);
  const xml=await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:tbl(?=[\s>])/g)||[]).length,(xml.match(/<\/w:tbl>/g)||[]).length);
  assert.equal((xml.match(/<w:tr(?=[\s>])/g)||[]).length,(xml.match(/<\/w:tr>/g)||[]).length);
  const text=visibleText(xml);
  assert.equal(text.includes('{{'),false);
  assert.ok((text.match(/เข้าใจพื้นฐาน/g)||[]).length>=1);
  assert.ok((text.match(/เขียนเงื่อนไข/g)||[]).length>=1);
  assert.ok(text.includes('แบบฝึกพื้นฐาน'));
  assert.ok(text.includes('U1'));
});
