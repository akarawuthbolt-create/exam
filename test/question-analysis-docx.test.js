const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { analysisStatus, buildQuestionAnalysisDocx, buildSummary, classYears, difficultyAnalysisLine, discriminationAnalysisLine, itemValues, replaceVisibleText, visibleText } = require('../src/question-analysis-docx');

test('Word placeholder replacement preserves whitespace text-node attributes', () => {
  const xml = '<w:r><w:t>อยู่ในเกณฑ์</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>{{result}}</w:t></w:r>';
  const replaced = replaceVisibleText(xml, 'เกณฑ์ ', 'เกณฑ์');
  assert.match(replaced, /<w:t xml:space="preserve"><\/w:t>/);
  assert.doesNotMatch(replaced, /<w:txml:/);
});

test('Word question analysis translates difficulty and discrimination at every boundary', () => {
  assert.deepEqual([.19, .2, .39, .4, .59, .6, .8, .81].map(difficultyAnalysisLine), [
    'ยากเกินไป', 'ค่อนข้างยาก', 'ค่อนข้างยาก', 'ยากปานกลาง (เหมาะสมดีมาก)',
    'ยากปานกลาง (เหมาะสมดีมาก)', 'ค่อนข้างง่าย', 'ค่อนข้างง่าย', 'ง่ายเกินไป'
  ]);
  assert.deepEqual([.6, .59, .4, .39, .2, .19, .1, .09, 0].map(discriminationAnalysisLine), [
    'ดีมาก', 'ดี', 'ดี', 'พอใช้', 'พอใช้', 'ค่อนข้างต่ำ ควรปรับปรุง',
    'ค่อนข้างต่ำ ควรปรับปรุง', 'ต่ำมาก ต้องปรับปรุง', 'ต่ำมาก ต้องปรับปรุง'
  ]);
});

test('Word question analysis applies the documented item-quality thresholds', async () => {
  const accepted = { number: 1, choices: ['ก', 'ข', 'ค', 'ง'], correctCount: 7, incorrectCount: 3, difficulty: .7, discrimination: .3 };
  const rejected = { number: 2, choices: ['ก', 'ข', 'ค', 'ง'], correctCount: 9, incorrectCount: 1, difficulty: .9, discrimination: .1 };
  assert.equal(analysisStatus(accepted).accepted, true);
  assert.equal(analysisStatus(rejected).accepted, false);
  assert.equal(itemValues(accepted).correct_count, '✓');
  assert.equal(itemValues(accepted).incorrect_count, '');
  assert.equal(itemValues(rejected).correct_count, '');
  assert.equal(itemValues(rejected).incorrect_count, '✓');
  assert.equal(itemValues(accepted).difficulty_analysis_line, 'ค่อนข้างง่าย');
  assert.equal(itemValues(accepted).discrimination_analysis_line, 'พอใช้');
  assert.equal(itemValues(rejected).difficulty_analysis_line, 'ง่ายเกินไป');
  assert.equal(itemValues(rejected).discrimination_analysis_line, 'ค่อนข้างต่ำ ควรปรับปรุง');
  assert.deepEqual(buildSummary({ items: [accepted, rejected], questionCount: 2 }), { standardCount: 1, rejectedCount: 1, percent: 50, rejectedPercent: 50 });
  const buffer = await buildQuestionAnalysisDocx({ title: 'วิชาทดสอบ', courseName: 'วิชาทดสอบ', assignedClasses: ['CIT.1/1'], teacherDepartment: 'สาขาของครู', programs: ['สาขาของนักเรียน'], respondents: 10, questionCount: 2, reliability: .75, items: [accepted, rejected] });
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 1000);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/สาขาของครู/g) || []).length, 1);
  assert.equal((xml.match(/สาขาของนักเรียน/g) || []).length, 1);
  assert.equal(visibleText(xml).includes('{{'), false);
  assert.equal(visibleText(xml).includes('เกณฑ์ '), false);
  assert.ok(visibleText(xml).includes('ข้อสอบอยู่ในเกณฑ์ค่อนข้างง่าย'));
  assert.ok(visibleText(xml).includes('มีค่าอำนาจจำแนกอยู่ในเกณฑ์พอใช้'));
  assert.equal((visibleText(xml).match(/ข้อสอบอยู่ในเกณฑ์/g) || []).length, 2);
  assert.ok((xml.match(/<w:cantSplit\/>/g) || []).length >= 4);
  assert.ok((xml.match(/<w:tblHeader\/>/g) || []).length >= 2);
  const tableXml = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)?.[0] || '';
  assert.equal(/<w:sz(?:Cs)? w:val="(?!32")/.test(tableXml), false);
});

test('Word question analysis derives class years from classroom codes', () => {
  assert.equal(classYears(['CC.1/4']), '1');
  assert.equal(classYears(['CC.2/4', 'CC.3/4', 'CC.2/5']), '2, 3');
  assert.equal(classYears(['สม.151']), '1');
  assert.equal(classYears(['สช.251']), '2');
  assert.equal(classYears(['IEP.M.131']), '1');
  assert.equal(classYears(['สม.151', 'สช.251', 'IEP.M.131']), '1, 2');
  assert.equal(classYears([]), '-');
});
