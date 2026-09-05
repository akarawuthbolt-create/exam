const test = require('node:test');
const assert = require('node:assert/strict');
const { ExcelJS } = require('../src/excel-workbook');
const { TEMPLATE_HEADERS, EXPORT_HEADERS, buildTeacherImportTemplate, buildTeacherExport, parseTeacherImport, validateTeacherImportRows } = require('../src/teacher-import');

test('teacher import template contains example columns and instruction sheet', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTeacherImportTemplate());
  assert.deepEqual(workbook.worksheets[0].getRow(1).values.slice(1), TEMPLATE_HEADERS);
  assert.equal(workbook.worksheets[0].getCell('A2').value, 'สมชาย');
  assert.equal(workbook.worksheets[1].name, 'คำอธิบาย');
});

test('teacher import parses valid rows and reports duplicates and invalid data', async () => {
  const buffer = await buildTeacherImportTemplate();
  const rows = await parseTeacherImport(buffer);
  const valid = validateTeacherImportRows(rows, []);
  assert.equal(valid.accepted.length, 1);
  assert.equal(valid.errors.length, 0);
  const duplicate = validateTeacherImportRows(rows, ['somchai']);
  assert.equal(duplicate.accepted.length, 0);
  assert.match(duplicate.errors[0], /Username ซ้ำ/);
});

test('teacher export excludes passwords and formats teacher list columns', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTeacherExport([{
    firstName: 'สมชาย', lastName: 'ใจดี', username: 'somchai', department: 'เทคโนโลยีสารสนเทศ',
    email: 'somchai@school.ac.th', passwordHash: 'must-not-export', createdAt: '2026-09-02T09:30:00.000Z', lastLoginAt: '2026-09-03T11:30:00.000Z'
  }]));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.name, 'รายชื่ออาจารย์');
  assert.deepEqual(sheet.getRow(1).values.slice(1), EXPORT_HEADERS);
  assert.deepEqual(sheet.getRow(2).values.slice(1, 8), [1, 'สมชาย', 'ใจดี', 'somchai', 'ไม่แสดง (เข้ารหัส)', 'เทคโนโลยีสารสนเทศ', 'somchai@school.ac.th']);
  assert.equal(sheet.getRow(2).getCell(9).value.toISOString(), '2026-09-03T11:30:00.000Z');
  assert.doesNotMatch(JSON.stringify(sheet.getRow(2).values), /must-not-export/);
});
