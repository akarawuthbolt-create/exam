const { sanitizeLearningPlan, validateLearningPlan } = require('../learning-plan');

function plansFrom(db) {
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!Array.isArray(db.settings.learningPlans)) db.settings.learningPlans = [];
  return db.settings.learningPlans;
}

function registerLearningPlanRoutes(app, { readDB, writeDB, requireAdmin, newId, buildLearningPlanDocx }) {
  app.get('/api/admin/learning-plans', requireAdmin, (req, res) => {
    const plans = plansFrom(readDB());
    res.json([...plans].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
  });

  app.post('/api/admin/learning-plans', requireAdmin, async (req, res) => {
    const data = sanitizeLearningPlan(req.body);
    const errors = validateLearningPlan(data);
    if (errors.length) return res.status(400).json({ error: 'invalid_learning_plan', message: errors[0], errors });
    const db = readDB();
    const now = new Date().toISOString();
    const plan = { id: newId('plan'), ...data, createdAt: now, updatedAt: now };
    plansFrom(db).push(plan);
    await writeDB(db);
    res.status(201).json(plan);
  });

  app.put('/api/admin/learning-plans/:id', requireAdmin, async (req, res) => {
    const db = readDB();
    const plans = plansFrom(db);
    const index = plans.findIndex(plan => plan.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบแผนการสอน' });
    const data = sanitizeLearningPlan(req.body);
    const errors = validateLearningPlan(data);
    if (errors.length) return res.status(400).json({ error: 'invalid_learning_plan', message: errors[0], errors });
    plans[index] = { id: plans[index].id, ...data, createdAt: plans[index].createdAt, updatedAt: new Date().toISOString() };
    await writeDB(db);
    res.json(plans[index]);
  });

  app.delete('/api/admin/learning-plans/:id', requireAdmin, async (req, res) => {
    const db = readDB();
    const plans = plansFrom(db);
    const index = plans.findIndex(plan => plan.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'not_found', message: 'ไม่พบแผนการสอน' });
    plans.splice(index, 1);
    await writeDB(db);
    res.json({ ok: true });
  });

  app.get('/api/admin/learning-plans/:id.docx', requireAdmin, async (req, res, next) => {
    try {
      const plan = plansFrom(readDB()).find(item => item.id === req.params.id);
      if (!plan) return res.status(404).json({ error: 'not_found', message: 'ไม่พบแผนการสอน' });
      const buffer = await buildLearningPlanDocx(plan);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`แผนการสอน-${plan.subjectCode || plan.subjectName}.docx`)}`);
      res.send(buffer);
    } catch (error) { next(error); }
  });
}

module.exports = { plansFrom, registerLearningPlanRoutes };
