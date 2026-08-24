const { ExcelJS, workbookBuffer, worksheetMatrix } = require('./excel-workbook');
const { validateTeacherPayload } = require('./validation');

const TEMPLATE_HEADERS = ['ชื่อ', 'นามสกุล', 'Username', 'Password', 'สาขาวิชา', 'อีเมล'];
const HEADER_ALIASES = {
  firstName: ['ชื่อ', 'firstname', 'first_name'],
  lastName: ['นามสกุล', 'lastname', 'last_name'],
  username: ['username', 'ชื่อผู้ใช้', 'ชื่อบัญชี'],
  password: ['password', 'รหัสผ่าน'],
  department: ['สาขาวิชา', 'แผนกวิชา', 'department'],
  email: ['อีเมล', 'email', 'e-mail']
};

function normalizedHeader(value) { return String(value ?? '').trim().toLowerCase(); }

async function buildTeacherImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Exam System';
  const sheet = workbook.addWorksheet('บัญชีอาจารย์');
  sheet.addRow(TEMPLATE_HEADERS);
  sheet.addRow(['สมชาย', 'ใจดี', 'somchai', 'Teacher1234', 'เทคโนโลยีสารสนเทศ', 'somchai@school.ac.th']);
  sheet.columns = [{ width: 20 }, { width: 22 }, { width: 20 }, { width: 22 }, { width: 30 }, { width: 32 }];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = 'A1:F1';
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 24;

  const help = workbook.addWorksheet('คำอธิบาย');
  help.addRows([
    ['คอลัมน์', 'จำเป็น', 'รูปแบบข้อมูล'],
    ['ชื่อ', 'จำเป็น', 'ชื่ออาจารย์ 1-100 ตัวอักษร'],
    ['นามสกุล', 'จำเป็น', 'นามสกุล 1-100 ตัวอักษร'],
    ['Username', 'จำเป็น', '3-50 ตัว ใช้เฉพาะภาษาอังกฤษ ตัวเลข จุด ขีดล่าง หรือขีดกลาง และต้องไม่ซ้ำ'],
    ['Password', 'จำเป็น', '8-200 ตัวอักษร ระบบจะเข้ารหัสก่อนจัดเก็บ'],
    ['สาขาวิชา', 'จำเป็น', 'ชื่อสาขาหรือแผนกวิชา 1-150 ตัวอักษร'],
    ['อีเมล', 'ไม่บังคับ', 'รูปแบบ name@example.com ใช้สำหรับรับรายงานคะแนน'],
    ['', '', 'กรอกข้อมูลต่อจากแถวตัวอย่างในชีต “บัญชีอาจารย์” หรือลบแถวตัวอย่างก่อนนำเข้า']
  ]);
  help.columns = [{ width: 22 }, { width: 14 }, { width: 78 }];
  help.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  help.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  help.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  return workbookBuffer(workbook);
}

async function parseTeacherImport(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const matrix = worksheetMatrix(workbook.worksheets[0], 5000, 20);
  if (!matrix.length) throw new Error('ไม่พบข้อมูลในไฟล์ Excel');
  const headers = matrix[0].map(normalizedHeader);
  const indexes = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    indexes[field] = headers.findIndex(header => aliases.includes(header));
  }
  const missing = Object.entries(indexes).filter(([field, index]) => field !== 'email' && index < 0).map(([field]) => field);
  if (missing.length) throw new Error(`คอลัมน์ไม่ครบ กรุณาใช้ไฟล์ตัวอย่าง (${missing.join(', ')})`);
  return matrix.slice(1)
    .filter(row => row.some(value => String(value ?? '').trim()))
    .map((row, offset) => ({
      rowNumber: offset + 2,
      payload: Object.fromEntries(Object.entries(indexes).map(([field, index]) => [field, index < 0 ? '' : String(row[index] ?? '').trim()]))
    }));
}

function validateTeacherImportRows(rows, existingUsernames = []) {
  const known = new Set(existingUsernames);
  const accepted = [], errors = [];
  for (const row of rows) {
    const validationErrors = validateTeacherPayload(row.payload);
    if (known.has(row.payload.username)) validationErrors.push('Username ซ้ำกับบัญชีที่มีอยู่หรือแถวก่อนหน้า');
    if (validationErrors.length) errors.push(`แถว ${row.rowNumber}: ${validationErrors.join(', ')}`);
    else { known.add(row.payload.username); accepted.push(row.payload); }
  }
  return { accepted, errors };
}

module.exports = { TEMPLATE_HEADERS, buildTeacherImportTemplate, parseTeacherImport, validateTeacherImportRows };
