const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { ExcelJS, worksheetMatrix } = require('./excel-workbook');

const choiceLetters = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'];
const englishLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').trim();

function answerIndex(value, choices = []) {
  const normalized = clean(value).toLowerCase().replace(/[.)]/g, '');
  let index = choiceLetters.indexOf(normalized);
  if (index < 0) index = englishLetters.indexOf(normalized);
  if (index < 0 && /^\d+$/.test(normalized)) index = Number(normalized) - 1;
  if (index < 0) index = choices.findIndex(choice => clean(choice).toLowerCase() === normalized);
  return index;
}

function normalizeQuestion(question, sourceNumber) {
  const text = clean(question.text);
  const choices = (question.choices || []).map(clean).filter(Boolean);
  const points = Math.max(0, Number(question.points) || 0);
  if (!text) return { error: `ข้อ ${sourceNumber}: ไม่มีข้อความคำถาม` };
  if (choices.length) {
    const answer = answerIndex(question.answer, choices);
    if (choices.length < 2) return { error: `ข้อ ${sourceNumber}: ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก` };
    if (answer < 0 || answer >= choices.length) return { error: `ข้อ ${sourceNumber}: ไม่พบเฉลยหรือเฉลยไม่ตรงกับตัวเลือก` };
    return { question: { type: 'mc', text, choices, answer, sourcePoints: points, sourceNumber: String(sourceNumber) } };
  }
  return { question: { type: 'written', text, keywords: (question.keywords || []).map(clean).filter(Boolean), sourcePoints: points, sourceNumber: String(sourceNumber) } };
}

function parseQuestionText(text, title = 'ข้อสอบนำเข้าจากไฟล์') {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
  const questions = [], skipped = []; let current = null; let currentChoice = -1;
  const finish = () => {
    if (!current) return;
    const result = normalizeQuestion(current, current.number || questions.length + skipped.length + 1);
    if (result.question) questions.push(result.question); else skipped.push(result.error);
    current = null; currentChoice = -1;
  };
  for (const line of lines) {
    const start = line.match(/^(?:ข้อ\s*)?(\d{1,4})[.)]\s*(.+)$/i);
    if (start) { finish(); current = { number: start[1], text: start[2], choices: [], answer: '', keywords: [], points: 0 }; continue; }
    if (!current) continue;
    const choice = line.match(/^([กขคงจฉA-Fa-f])[.)]\s*(.+)$/);
    if (choice) { current.choices.push(choice[2]); currentChoice = current.choices.length - 1; continue; }
    const answer = line.match(/^(?:เฉลย|คำตอบ|answer)\s*[:：]\s*(.+)$/i);
    if (answer) { current.answer = answer[1]; currentChoice = -1; continue; }
    const points = line.match(/^(?:คะแนน|points?)\s*[:：]\s*([\d.]+)/i);
    if (points) { current.points = Number(points[1]) || 0; currentChoice = -1; continue; }
    const keywords = line.match(/^(?:แนวคำตอบ|คำสำคัญ|keywords?)\s*[:：]\s*(.+)$/i);
    if (keywords) { current.keywords = keywords[1].split(/[,;|]/).map(clean).filter(Boolean); currentChoice = -1; continue; }
    if (currentChoice >= 0) current.choices[currentChoice] += ` ${line}`;
    else current.text += ` ${line}`;
  }
  finish();
  return { title, questions, skipped, counts: { mc: questions.filter(item => item.type === 'mc').length, written: questions.filter(item => item.type === 'written').length } };
}

function findColumn(headers, aliases) { return headers.findIndex(header => aliases.includes(clean(header).toLowerCase())); }

async function parseQuestionWorkbook(buffer, title) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const matrix = worksheetMatrix(workbook.worksheets[0], 5000, 30);
  if (matrix.length < 2) throw new Error('ไม่พบข้อมูลข้อสอบในไฟล์ Excel');
  const headers = matrix[0].map(value => clean(value).toLowerCase());
  const columns = {
    text: findColumn(headers, ['คำถาม', 'question', 'โจทย์']), type: findColumn(headers, ['ประเภท', 'type']),
    answer: findColumn(headers, ['เฉลย', 'answer']), points: findColumn(headers, ['คะแนน', 'points', 'point']),
    keywords: findColumn(headers, ['คำสำคัญ', 'keywords', 'แนวคำตอบ']),
    choices: ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'].map((letter, index) => findColumn(headers, [letter, `ตัวเลือก ${letter}`, `choice ${englishLetters[index].toUpperCase()}`, englishLetters[index]]))
  };
  if (columns.text < 0) throw new Error('ไม่พบคอลัมน์ “คำถาม” กรุณาใช้หัวตารางตามรูปแบบที่กำหนด');
  const questions = [], skipped = [];
  matrix.slice(1).filter(row => row.some(value => clean(value))).forEach((row, index) => {
    const choices = columns.choices.map(column => column < 0 ? '' : row[column]).map(clean).filter(Boolean);
    const type = columns.type < 0 ? '' : clean(row[columns.type]).toLowerCase();
    const raw = { text: row[columns.text], choices: type.includes('อัตนัย') || type === 'written' ? [] : choices, answer: columns.answer < 0 ? '' : row[columns.answer], points: columns.points < 0 ? 0 : row[columns.points], keywords: columns.keywords < 0 ? [] : clean(row[columns.keywords]).split(/[,;|]/) };
    const result = normalizeQuestion(raw, index + 1);
    if (result.question) questions.push(result.question); else skipped.push(result.error);
  });
  return { title, questions, skipped, counts: { mc: questions.filter(item => item.type === 'mc').length, written: questions.filter(item => item.type === 'written').length } };
}

async function parseQuestionFile(buffer, filename) {
  const name = clean(filename || 'question-file'); const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  const title = name.replace(/\.[^.]+$/, '') || 'ข้อสอบนำเข้าจากไฟล์';
  if (extension === '.xlsx') return parseQuestionWorkbook(buffer, title);
  let text = '';
  if (extension === '.docx') text = (await mammoth.extractRawText({ buffer })).value;
  else if (extension === '.pdf') text = (await pdfParse(buffer)).text;
  else if (extension === '.txt') text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  else throw new Error('รองรับเฉพาะไฟล์ .docx, .pdf, .xlsx และ .txt');
  const parsed = parseQuestionText(text, title);
  if (!parsed.questions.length && !parsed.skipped.length) throw new Error('ไม่พบรูปแบบข้อสอบที่รองรับในไฟล์นี้');
  return parsed;
}

module.exports = { parseQuestionText, parseQuestionWorkbook, parseQuestionFile, answerIndex };
