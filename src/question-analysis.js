const { ExcelJS, addObjectSheet, workbookBuffer } = require('./excel-workbook');
const { programForClassRoom } = require('./class-programs');

const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const difficultyLabel = value => value < .2
  ? 'ยากเกินไป'
  : value < .4
    ? 'ค่อนข้างยาก'
    : value < .6
      ? 'ยากปานกลาง (เหมาะสมดีมาก)'
      : value <= .8
        ? 'ค่อนข้างง่าย'
        : 'ง่ายเกินไป';

const discriminationLabel = value => value >= .6
  ? 'ดีมาก'
  : value >= .4
    ? 'ดี'
    : value >= .2
      ? 'พอใช้'
      : value >= .1
        ? 'ค่อนข้างต่ำ ควรปรับปรุง'
        : 'ต่ำมาก ต้องปรับปรุง';

function buildQuestionAnalysis(set, results) {
  const questions = set?.sections?.mc?.questions || [];
  const answered = results.filter(row => row?.detail?.answers?.mc && typeof row.detail.answers.mc === 'object');
  const responseScores = answered.map(row => ({ row, score: questions.reduce((sum, question) => sum + (String(row.detail.answers.mc[question.id]) === String(question.answer) ? 1 : 0), 0) }));
  const groupSize = Math.max(1, Math.ceil(responseScores.length * .27));
  const ordered = [...responseScores].sort((a, b) => b.score - a.score);
  const upper = ordered.slice(0, groupSize);
  const lower = ordered.slice(-groupSize);
  const items = questions.map((question, index) => {
    const choices = Array.isArray(question.choices) ? question.choices : [];
    const counts = choices.map(() => 0);
    let correctCount = 0;
    for (const entry of responseScores) {
      const answer = entry.row.detail.answers.mc[question.id];
      const choiceIndex = choices.findIndex((_, itemIndex) => String(itemIndex) === String(answer));
      if (choiceIndex >= 0) counts[choiceIndex]++;
      if (String(answer) === String(question.answer)) correctCount++;
    }
    const upperCorrect = upper.filter(entry => String(entry.row.detail.answers.mc[question.id]) === String(question.answer)).length;
    const lowerCorrect = lower.filter(entry => String(entry.row.detail.answers.mc[question.id]) === String(question.answer)).length;
    const difficulty = responseScores.length ? correctCount / responseScores.length : 0;
    const discrimination = responseScores.length >= 4 ? upperCorrect / groupSize - lowerCorrect / groupSize : null;
    return { number: index + 1, text: question.text || '', choices, correctIndex: Number(question.answer), choiceCounts: counts, respondents: responseScores.length, correctCount, incorrectCount: responseScores.length - correctCount, difficulty: round(difficulty), difficultyLabel: difficultyLabel(difficulty), discrimination: discrimination === null ? null : round(discrimination), discriminationLabel: discrimination === null ? 'ข้อมูลไม่พอ' : discriminationLabel(discrimination) };
  });
  let reliability = null;
  if (items.length > 1 && responseScores.length > 1) {
    const average = responseScores.reduce((sum, entry) => sum + entry.score, 0) / responseScores.length;
    const variance = responseScores.reduce((sum, entry) => sum + (entry.score - average) ** 2, 0) / responseScores.length;
    const sumPq = items.reduce((sum, item) => sum + item.difficulty * (1 - item.difficulty), 0);
    if (variance > 0) reliability = round((items.length / (items.length - 1)) * (1 - sumPq / variance));
  }
  const assignedClasses = Array.isArray(set?.assignedClasses) ? set.assignedClasses : [];
  const programs = [...new Set(assignedClasses.map(programForClassRoom).filter(Boolean))];
  const periodResult = [...results].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).find(row => row.academicYear || row.semester || row.semesterLabel) || {};
  return { setKey: set?.key || '', title: set?.title || '', courseName: set?.courseName || set?.title || '', courseCode: set?.courseCode || '', educationLevel: set?.educationLevel || '', assignedClasses, programs, teacherDepartment: set?.subjectTeacherDepartment || '', semester: set?.semester || periodResult.semester || '', semesterLabel: set?.semesterLabel || periodResult.semesterLabel || '', academicYear: set?.academicYear || periodResult.academicYear || '', teacherName: set?.subjectTeacherName || '', respondents: responseScores.length, questionCount: items.length, reliability, items };
}

async function buildQuestionAnalysisWorkbook(analysis) {
  const workbook = new ExcelJS.Workbook();
  const summary = [{ 'ชุดข้อสอบ': analysis.title, 'จำนวนผู้เข้าสอบ': analysis.respondents, 'จำนวนข้อปรนัย': analysis.questionCount, 'ความเชื่อมั่น KR-20': analysis.reliability ?? 'ข้อมูลไม่พอ' }];
  const items = analysis.items.map(item => ({ 'ข้อ': item.number, 'คำถาม': item.text, 'ผู้ตอบ': item.respondents, 'ตอบถูก': item.correctCount, 'ตอบผิด': item.incorrectCount, 'ค่าความยาก (P)': item.difficulty, 'แปลผลความยาก': item.difficultyLabel, 'อำนาจจำแนก (D)': item.discrimination ?? 'ข้อมูลไม่พอ', 'แปลผลอำนาจจำแนก': item.discriminationLabel, 'เฉลย': item.choices[item.correctIndex] || '' }));
  const choices = analysis.items.flatMap(item => item.choices.map((choice, index) => ({ 'ข้อ': item.number, 'คำถาม': item.text, 'ตัวเลือก': String.fromCharCode(65 + index), 'ข้อความตัวเลือก': choice, 'จำนวนผู้เลือก': item.choiceCounts[index] || 0, 'ร้อยละ': item.respondents ? round((item.choiceCounts[index] || 0) / item.respondents * 100) : 0, 'เป็นคำตอบที่ถูก': index === item.correctIndex ? 'ใช่' : 'ไม่' })));
  addObjectSheet(workbook, 'สรุป', summary);
  addObjectSheet(workbook, 'วิเคราะห์รายข้อ', items);
  addObjectSheet(workbook, 'การเลือกตัวเลือก', choices);
  return workbookBuffer(workbook);
}

module.exports = { buildQuestionAnalysis, buildQuestionAnalysisWorkbook, difficultyLabel, discriminationLabel };
