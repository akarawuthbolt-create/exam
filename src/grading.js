function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function gradeMC(section, answers) {
  answers = answers || {};
  let total = 0;
  (section.questions || []).forEach(question => {
    if (answers[question.id] === question.answer) total += (question.points || 0);
  });
  return round2(total);
}

function gradeMatching(section, answers) {
  answers = answers || {};
  let total = 0;
  (section.left || []).forEach(item => {
    if (answers[item.id] && answers[item.id] === section.correctMap[item.id]) total += (section.pointsEach || 0);
  });
  return round2(total);
}

function keywordScore(text, keywords, maxPoints) {
  if (!text || !text.trim() || !keywords || !keywords.length) return 0;
  const normalizedText = text.toLowerCase();
  const hit = keywords.filter(keyword => normalizedText.includes(String(keyword).toLowerCase())).length;
  return round2((hit / keywords.length) * (maxPoints || 0));
}

// Code-fix questions deliberately do not compile code.  They compare the
// teacher's expected snippet after removing formatting-only whitespace, which
// keeps this fast and safe for short syntax-correction exercises.
function normalizeCodeAnswer(value) {
  return String(value || '').replace(/\s+/g, '');
}

function filterWrittenQuestionsForClass(section, classRoom) {
  // Written code questions apply to every student who can access the exam set.
  // classRoom remains an argument for compatibility with existing callers.
  return section?.questions || [];
}

function normalizeExamDateTime(value) {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2400) return value;
  date.setUTCFullYear(date.getUTCFullYear() - 543);
  return date.toISOString();
}

function gradeWritten(section, answers) {
  answers = answers || {};
  let total = 0;
  const perQuestion = {};
  (section.questions || []).forEach(question => {
    const points = question.answerType === 'code'
      ? (normalizeCodeAnswer(answers[question.id]) === normalizeCodeAnswer(question.answerCode) && normalizeCodeAnswer(question.answerCode) ? Number(question.maxPoints || 0) : 0)
      : keywordScore(answers[question.id] || '', question.keywords, question.maxPoints);
    perQuestion[question.id] = points;
    total += points;
  });
  return { total: round2(total), perQuestion };
}

function getExamSchedule(set, classRoom, studentId) {
  const schedules = Array.isArray(set.examSchedules) ? set.examSchedules.filter(item => item && Array.isArray(item.classes)) : [];
  const requestedStudentId = String(studentId ?? '').trim();
  const isAssignedStudent = item => requestedStudentId && (item.studentIds || []).some(value => String(value ?? '').trim() === requestedStudentId);
  const schedule = schedules.length
    ? schedules.find(item => item.absenceOnly && isAssignedStudent(item)) || schedules.find(isAssignedStudent) || schedules.find(item => (item.classes || []).includes(classRoom)) || schedules.find(item => !(item.classes || []).length) || null
    : { classes: set.assignedClasses || [], studentIds: set.studentIds || [], availableFrom: set.availableFrom, availableUntil: set.availableUntil, lateAccessCode: set.lateAccessCode || '' };
  return schedule ? { ...schedule, availableFrom: normalizeExamDateTime(schedule.availableFrom), availableUntil: normalizeExamDateTime(schedule.availableUntil) } : null;
}
function isPastDeadline(set, classRoom, studentId) {
  if (set.quickOpen) return false;
  const schedule = getExamSchedule(set, classRoom, studentId);
  return !!(schedule?.availableUntil && Date.now() > new Date(schedule.availableUntil).getTime());
}
function isBeforeStart(set, classRoom, studentId) {
  if (set.quickOpen) return false;
  const schedule = getExamSchedule(set, classRoom, studentId);
  return !!(schedule?.availableFrom && Date.now() < new Date(schedule.availableFrom).getTime());
}
function hasExamAccess(set, classRoom, studentId) {
  const schedule = getExamSchedule(set, classRoom, studentId);
  const requestedStudentId = String(studentId ?? '').trim();
  return !!schedule && (!(schedule.classes || []).length || schedule.classes.includes(classRoom) || (requestedStudentId && (schedule.studentIds || []).some(value => String(value ?? '').trim() === requestedStudentId)));
}

function haveAllExamSchedulesEnded(schedules, now = Date.now()) {
  if (!Array.isArray(schedules) || !schedules.length) return false;
  const endTimes = schedules.map(schedule => new Date(normalizeExamDateTime(schedule?.availableUntil)).getTime());
  return endTimes.every(Number.isFinite) && Math.max(...endTimes) < now;
}

// A question may carry more choices than are shown at once (a "distractor pool").
// Only this many are displayed per student, always including the correct one, so
// that a bigger pool doesn't just mean a longer list for every student to read.
const MAX_DISPLAY_CHOICES = 4;

// Deterministic (not cryptographic) 32-bit string hash, used only to seed which
// distractors a given student sees — same student + question always gets the
// same subset, but different students get different ones.
function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(array, random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function displayIndexesForChoices(question, seedKey) {
  const total = (question.choices || []).length;
  if (total <= MAX_DISPLAY_CHOICES) return null;
  const random = seededRandom(hashSeed(seedKey));
  const correctIndex = question.answer;
  const otherIndexes = seededShuffle(
    Array.from({ length: total }, (_, i) => i).filter(i => i !== correctIndex),
    random
  ).slice(0, MAX_DISPLAY_CHOICES - 1);
  return seededShuffle([correctIndex, ...otherIndexes], random);
}

function sanitizeSetForStudent(set, classRoom, studentId) {
  const schedule = getExamSchedule(set, classRoom, studentId);
  return {
    key: set.key, title: set.title, courseName: set.courseName || set.title, tagline: set.tagline, desc: set.desc,
    examType: set.examType || '', assignedClasses: set.assignedClasses || [],
    subjectTeacherName: set.subjectTeacherName || '', shuffleQuestions: !!set.shuffleQuestions,
    availableFrom: schedule?.availableFrom || null,
    shuffleChoices: !!set.shuffleChoices, availableUntil: schedule?.availableUntil || null,
    lateAccessRequired: isPastDeadline(set, classRoom, studentId),
    sections: {
      mc: { title: set.sections.mc.title, desc: set.sections.mc.desc, questions: set.sections.mc.questions.map(q => ({ id: q.id, text: q.text, choices: q.choices, points: q.points, resources: q.resources || null, displayIndexes: displayIndexesForChoices(q, `${studentId}:${q.id}`) })) },
      matching: { title: set.sections.matching.title, desc: set.sections.matching.desc, left: set.sections.matching.left, right: set.sections.matching.right, pointsEach: set.sections.matching.pointsEach },
      written: { title: set.sections.written.title, desc: set.sections.written.desc, questions: filterWrittenQuestionsForClass(set.sections.written, classRoom).map(q => {
        const isCode = q.answerType === 'code';
        const resources = isCode ? { code: q.resources?.code || '', language: q.resources?.language || '' } : (q.resources || null);
        return { id: q.id, text: q.text, maxPoints: q.maxPoints, answerType: q.answerType || 'text', language: q.language || 'c', resources };
      }) }
    }
  };
}

module.exports = { round2, gradeMC, gradeMatching, gradeWritten, normalizeCodeAnswer, filterWrittenQuestionsForClass, normalizeExamDateTime, haveAllExamSchedulesEnded, getExamSchedule, hasExamAccess, isPastDeadline, isBeforeStart, sanitizeSetForStudent };
