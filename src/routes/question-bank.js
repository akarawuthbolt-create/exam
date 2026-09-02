function sanitizeQuestion(question, newId, ownerId) {
  const text = String(question?.text || '').trim();
  const choices = Array.isArray(question?.choices) ? question.choices.map(choice => String(choice || '').trim()) : [];
  const answer = Number(question?.answer);
  if (!text || choices.length < 4 || choices.length > 8 || choices.some(choice => !choice) || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) return null;
  const sourceResources = question?.resources && typeof question.resources === 'object' ? question.resources : {};
  const attachments = Array.isArray(sourceResources.attachments) ? sourceResources.attachments.slice(0, 8).map(item => ({
    name: String(item?.name || 'ไฟล์แนบ').slice(0, 180), type: String(item?.type || '').slice(0, 100),
    size: Number(item?.size) || 0, url: String(item?.url || '').slice(0, 2000)
  })).filter(item => /^https:\/\//.test(item.url)) : [];
  const resources = {
    code: String(sourceResources.code || '').slice(0, 50000), language: String(sourceResources.language || '').slice(0, 30),
    table: String(sourceResources.table || '').slice(0, 30000), attachments
  };
  return { id: newId('bankq'), ownerId, courseName: String(question.courseName || '').trim(), tags: Array.isArray(question.tags) ? question.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8) : [], text, choices, answer, resources, createdAt: new Date().toISOString() };
}

function registerQuestionBankRoutes(app, { readDB, writeDB, newId, requireAdmin, requireTeacher }) {
  const list = owner => (req, res) => res.json(readDB().questionBank.filter(question => owner === null || question.ownerId === owner || question.ownerId === null));
  const save = owner => async (req, res) => {
    const source = Array.isArray(req.body?.questions) ? req.body.questions : [];
    const db = readDB(); let added = 0;
    source.forEach(question => { const clean = sanitizeQuestion(question, newId, owner); if (clean && !db.questionBank.some(item => item.ownerId === owner && item.text === clean.text)) { db.questionBank.push(clean); added += 1; } });
    await writeDB(db); res.json({ added });
  };
  const remove = owner => async (req, res) => {
    const db = readDB();
    const index = db.questionBank.findIndex(question => question.id === req.params.id && (owner === null || question.ownerId === owner));
    if (index === -1) return res.status(404).json({ error: 'not_found', message: 'ไม่พบข้อคำถามนี้ในคลัง' });
    db.questionBank.splice(index, 1);
    await writeDB(db); res.json({ deleted: true });
  };
  app.get('/api/question-bank', requireAdmin, list(null));
  app.post('/api/question-bank', requireAdmin, save(null));
  app.delete('/api/question-bank/:id', requireAdmin, remove(null));
  app.get('/api/teacher/question-bank', requireTeacher, (req, res) => list(req.teacherId)(req, res));
  app.post('/api/teacher/question-bank', requireTeacher, (req, res) => save(req.teacherId)(req, res));
  app.delete('/api/teacher/question-bank/:id', requireTeacher, (req, res) => remove(req.teacherId)(req, res));
}

module.exports = { registerQuestionBankRoutes };
