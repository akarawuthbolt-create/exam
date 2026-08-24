const test = require('node:test');
const assert = require('node:assert/strict');
const { ExcelJS, workbookBuffer } = require('../src/excel-workbook');
const JSZip = require('jszip');
const { parseQuestionText, parseQuestionWorkbook, parseQuestionFile } = require('../src/question-file-import');

test('question text import separates multiple-choice and written questions', () => {
  const parsed = parseQuestionText(`1. CPU ทำหน้าที่อะไร\nก. แสดงผล\nข. ประมวลผล\nค. จัดเก็บข้อมูล\nง. รับข้อมูล\nเฉลย: ข\nคะแนน: 2\n2. อธิบายความหมายของ RAM\nแนวคำตอบ: หน่วยความจำ,ชั่วคราว\nคะแนน: 3`, 'พื้นฐานคอมพิวเตอร์');
  assert.equal(parsed.title, 'พื้นฐานคอมพิวเตอร์');
  assert.equal(parsed.counts.mc, 1); assert.equal(parsed.counts.written, 1);
  assert.equal(parsed.questions[0].answer, 1); assert.equal(parsed.questions[0].sourcePoints, 2);
  assert.deepEqual(parsed.questions[1].keywords, ['หน่วยความจำ', 'ชั่วคราว']);
});

test('question Excel import reads standard columns and reports missing answers', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('ข้อสอบ');
  sheet.addRow(['ประเภท', 'คำถาม', 'ก', 'ข', 'ค', 'ง', 'เฉลย', 'คะแนน', 'คำสำคัญ']);
  sheet.addRow(['ปรนัย', '2 + 2 เท่ากับเท่าไร', '2', '3', '4', '5', 'ค', 1, '']);
  sheet.addRow(['อัตนัย', 'อธิบายวิธีคิด', '', '', '', '', '', 2, 'บวก,จำนวน']);
  const parsed = await parseQuestionWorkbook(await workbookBuffer(workbook), 'คณิตศาสตร์');
  assert.equal(parsed.questions.length, 2); assert.equal(parsed.questions[0].answer, 2);
  assert.equal(parsed.questions[1].type, 'written');
});

test('question Word import extracts document text before parsing', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder('_rels').file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word').file('document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. Capital of Thailand?</w:t></w:r></w:p><w:p><w:r><w:t>A. Bangkok</w:t></w:r></w:p><w:p><w:r><w:t>B. Chiang Mai</w:t></w:r></w:p><w:p><w:r><w:t>Answer: A</w:t></w:r></w:p></w:body></w:document>');
  const parsed = await parseQuestionFile(await zip.generateAsync({ type: 'nodebuffer' }), 'geography.docx');
  assert.equal(parsed.counts.mc, 1); assert.equal(parsed.questions[0].answer, 0);
});
