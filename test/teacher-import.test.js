const test = require('node:test');
const assert = require('node:assert/strict');
const { ExcelJS } = require('../src/excel-workbook');
const { TEMPLATE_HEADERS, buildTeacherImportTemplate, parseTeacherImport, validateTeacherImportRows } = require('../src/teacher-import');

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
