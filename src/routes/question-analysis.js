function registerQuestionAnalysisRoutes(app, { readDB, requireAdmin, requireTeacher, buildQuestionAnalysis, buildQuestionAnalysisWorkbook, buildQuestionAnalysisDocx, applyAcademicPeriod }) {
  const analysisData = (db, set) => {
    const analysisSet = { ...set };
    if ((!analysisSet.academicYear || !analysisSet.semesterLabel) && applyAcademicPeriod) applyAcademicPeriod(analysisSet, db.settings);
    return buildQuestionAnalysis(analysisSet, db.results.filter(row => row.questionKey === set.key));
  };
  const sendJson = (req, res, allowedKeys) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.query.setKey && allowedKeys.has(item.key));
    if (!set) return res.status(404).json({ error: 'not_found', message: 'ไม่พบชุดข้อสอบ หรือไม่มีสิทธิ์เข้าถึง' });
    res.json(analysisData(db, set));
  };
  const sendDocx = async (req, res, allowedKeys) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.query.setKey && allowedKeys.has(item.key));
    if (!set) return res.status(404).json({ error: 'not_found', message: 'ไม่พบชุดข้อสอบ หรือไม่มีสิทธิ์เข้าถึง' });
    const file = await buildQuestionAnalysisDocx(analysisData(db, set));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`วิเคราะห์ข้อสอบ-${set.courseName || set.title || set.key}.docx`)}`);
    res.send(file);
  };
  const sendWorkbook = async (req, res, allowedKeys) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.query.setKey && allowedKeys.has(item.key));
    if (!set) return res.status(404).json({ error: 'not_found', message: 'ไม่พบชุดข้อสอบ หรือไม่มีสิทธิ์เข้าถึง' });
    const file = await buildQuestionAnalysisWorkbook(analysisData(db, set));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="question-analysis.xlsx"');
    res.send(file);
  };
  app.get('/api/question-analysis', requireAdmin, (req, res) => sendJson(req, res, new Set(readDB().sets.map(set => set.key))));
  app.get('/api/export/question-analysis.xlsx', requireAdmin, (req, res, next) => sendWorkbook(req, res, new Set(readDB().sets.map(set => set.key))).catch(next));
  app.get('/api/export/question-analysis.docx', requireAdmin, (req, res, next) => sendDocx(req, res, new Set(readDB().sets.map(set => set.key))).catch(next));
  app.get('/api/teacher/question-analysis', requireTeacher, (req, res) => { const db = readDB(); sendJson(req, res, new Set(db.sets.filter(set => set.teacherId === req.teacherId).map(set => set.key))); });
  app.get('/api/teacher/export/question-analysis.xlsx', requireTeacher, (req, res, next) => { const db = readDB(); sendWorkbook(req, res, new Set(db.sets.filter(set => set.teacherId === req.teacherId).map(set => set.key))).catch(next); });
  app.get('/api/teacher/export/question-analysis.docx', requireTeacher, (req, res, next) => { const db = readDB(); sendDocx(req, res, new Set(db.sets.filter(set => set.teacherId === req.teacherId).map(set => set.key))).catch(next); });
}
module.exports = { registerQuestionAnalysisRoutes };
