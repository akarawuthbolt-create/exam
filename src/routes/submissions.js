const { activeResitAccess, resitScore } = require('../resit');
const { filterWrittenQuestionsForClass } = require('../grading');
const { resultAttemptKey } = require('../result-attempt');
const { buildGradingSnapshot, verifyResultScore } = require('../score-verification');
const { checkExamReadiness } = require('../exam-readiness');
function hasStartedExamDraft(db, studentId, payload, schedule) {
  if (!payload?.autoSubmit || !schedule?.availableUntil) return false;
  const deadline = Date.parse(schedule.availableUntil);
  return (db.drafts || []).some(draft => draft.studentId === studentId && draft.questionKey === payload.questionKey &&
    String(draft.resitAccessId || '') === String(payload.resitAccessId || '') && draft.examEndTime &&
    (!payload.deviceId || draft.deviceId === payload.deviceId) && Number.isFinite(deadline) && Date.parse(draft.savedAt) <= deadline);
}
function registerSubmissionRoutes(app, { readDB, mutateDB, newId, gradeMC, gradeMatching, gradeWritten, getExamSchedule, hasExamAccess, isPastDeadline, isBeforeStart, round2, requireStudent, applyAcademicPeriod, submissionGate }) {
  app.post('/api/results', requireStudent, submissionGate.middleware, async (req, res) => {
    const payload = req.body;
    if (!payload || !payload.questionKey) return res.status(400).json({ error: 'invalid_payload', message: 'ข้อมูลผลสอบไม่ครบ' });
    const db = readDB();
    const student = db.students.find(item => item.studentId === req.studentId);
    if (!student) return res.status(401).json({ error: 'unauthorized' });
    const set = db.sets.find(item => item.key === payload.questionKey);
    if (!set || set.archived) return res.status(404).json({ error: 'not_found', message: 'ไม่พบชุดข้อสอบนี้ในระบบ' });
    const readiness = checkExamReadiness(set);
    if (!readiness.ready) return res.status(409).json({ error: 'exam_not_ready', message: 'ชุดข้อสอบยังไม่ผ่านการตรวจความพร้อม กรุณาแจ้งอาจารย์ผู้สอน', details: readiness.errors });
    applyAcademicPeriod(set, db.settings);
    const resit = payload.resitAccessId ? activeResitAccess(set, student.studentId, payload.resitAccessId) : null;
    if (!resit && isBeforeStart(set, student.classRoom)) return res.status(403).json({ error: 'not_started', message: 'ยังไม่ถึงเวลาเริ่มสอบ' });
    if (!resit && !hasExamAccess(set, student.classRoom)) return res.status(403).json({ error: 'forbidden', message: 'ไม่มีสิทธิ์เข้าสอบชุดนี้' });
    if (payload.resitAccessId && !resit) return res.status(403).json({ error: 'resit_unavailable', message: 'สิทธิ์สอบซ่อมหมดอายุหรือถูกใช้ไปแล้ว' });
    const previousSubmission = db.results.find(item => item.studentId === student.studentId && item.questionKey === payload.questionKey && (resit ? item.resitAccessId === resit.id : item.attemptType !== 'resit'));
    if (previousSubmission) return res.status(200).json({ id: previousSubmission.id, alreadySubmitted: true, message: 'บันทึกคำตอบนี้ไว้เรียบร้อยแล้ว' });
    const schedule=getExamSchedule(set, student.classRoom);
    const validAutoSubmit = hasStartedExamDraft(db, student.studentId, payload, schedule);
    if (!resit && isPastDeadline(set, student.classRoom) && !validAutoSubmit && (!schedule?.lateAccessCode || payload.lateCode !== schedule.lateAccessCode)) return res.status(403).json({ error: 'deadline_passed', message: 'หมดเวลาสอบแล้ว' });
    const answers = payload.answers || {};
    const visibleWrittenQuestions = filterWrittenQuestionsForClass(set.sections.written, student.classRoom);
    if (!payload.autoSubmit) {
      const incomplete = (set.sections.mc.questions || []).some(q => answers.mc?.[q.id] == null) || (set.sections.matching.left || []).some(q => !answers.matching?.[q.id]) || visibleWrittenQuestions.some(q => !String(answers.written?.[q.id] || '').trim());
      if (incomplete) return res.status(400).json({ error: 'incomplete', message: 'ตอบคำถามยังไม่ครบทุกข้อ' });
    }
    const mc = gradeMC(set.sections.mc, answers.mc);
    const matching = gradeMatching(set.sections.matching, answers.matching);
    const written = gradeWritten({ ...set.sections.written, questions: visibleWrittenQuestions }, answers.written);
    const rawScore = round2(mc + matching + written.total);
    const visibleScoreMax = (set.sections.mc.questions || []).reduce((sum, question) => sum + Number(question.points || 0), 0) + (set.sections.matching.left || []).length * Number(set.sections.matching.pointsEach || 0) + visibleWrittenQuestions.reduce((sum, question) => sum + Number(question.maxPoints || 0), 0);
    const overallScore20 = rawScore;
    const integrityEvents = Array.isArray(payload.integrityEvents) ? payload.integrityEvents.filter(event => ['tab_switch','fullscreen_exit','right_click','copy','reload','session_recovered'].includes(event?.type) && !Number.isNaN(Date.parse(event.at))).slice(-50) : [];
    const record = {
      id: newId('result'), studentId: student.studentId, studentName: `${student.firstName} ${student.lastName}`, classRoom: student.classRoom || '',
      questionKey: payload.questionKey, questionTitle: set.title, examType: set.examType || '', subjectTeacherName: set.subjectTeacherName || '', subjectTeacherEmail: set.subjectTeacherEmail || '',
      academicYear: set.academicYear || null, semester: set.semester || null, semesterLabel: set.semesterLabel || null,
      attemptKey: resultAttemptKey(student.studentId, payload.questionKey, resit?.id),
      overallScore20, sectionScores: { mc, matching, written: written.total }, attemptType: resit ? 'resit' : 'normal', resitAccessId: resit?.id || null, sourceResultId: resit?.sourceResultId || null, resitScoreMax: resit?.scoreMax || null,
      tabSwitches: payload.tabSwitches || 0, fullscreenExitAttempts: payload.fullscreenExitAttempts || 0, reloadCount: payload.reloadCount || 0, rightClickAttempts: payload.rightClickAttempts || 0, copyAttempts: payload.copyAttempts || 0, sessionRecoveries: payload.sessionRecoveries || 0,
      integrityEvents, published: false, detail: { answers, writtenPerQuestion: written.perQuestion, rawScore, visibleScoreMax, gradingSnapshot: buildGradingSnapshot(set, student.classRoom) }, submittedAt: new Date().toISOString()
    };
    if (resit) record.convertedScore = resitScore(record.overallScore20, resit.scoreMax);
    record.scoreVerification = { ...verifyResultScore(record, set), verifiedAt: new Date().toISOString() };
    record.published = set.publishMode === 'auto' && record.scoreVerification.status === 'verified';
    try {
      const savedRecord = await mutateDB(latest => {
        const existing = latest.results.find(item => item.attemptKey === record.attemptKey || (item.studentId === student.studentId && item.questionKey === payload.questionKey && (resit ? item.resitAccessId === resit.id : item.attemptType !== 'resit')));
        if (existing) return existing;
        latest.results.push(record);
        latest.drafts = (latest.drafts || []).filter(draft => !(
          draft.studentId === student.studentId && draft.questionKey === payload.questionKey &&
          (resit ? draft.resitAccessId === resit.id : !draft.resitAccessId)
        ));
        if (resit) {
          const latestSet = latest.sets.find(item => item.key === payload.questionKey);
          const latestResit = (latestSet?.resitAccesses || []).find(item => item.id === resit.id);
          if (latestResit) { latestResit.usedResultId = record.id; latestResit.usedAt = record.submittedAt; }
        }
        return record;
      });
      if (savedRecord.id !== record.id) return res.status(200).json({ id: savedRecord.id, alreadySubmitted: true, message: 'บันทึกคำตอบนี้ไว้เรียบร้อยแล้ว' });
    } catch (error) {
      if (error.code === 'DUPLICATE_ATTEMPT' || error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') return res.status(409).json({ error: 'already_submitted', message: 'ทำข้อสอบชุดนี้ไปแล้ว' });
      console.error('Failed to save exam submission.', error);
      return res.status(500).json({ error: 'save_failed', message: 'บันทึกคำตอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    }
    res.status(201).json({ id: record.id, message: 'บันทึกคำตอบเรียบร้อยแล้ว' });
  });
}

module.exports = { registerSubmissionRoutes, hasStartedExamDraft };
