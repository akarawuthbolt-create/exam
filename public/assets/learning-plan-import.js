(function exposeLearningPlanImporter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.learningPlanImporter = api;
})(typeof window !== 'undefined' ? window : null, function createLearningPlanImporter() {
  const text = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
  const lines = value => (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(item => text(item).replace(/^📌\s*/, '').trim())
    .filter(item => item && !/^\(คุณครูสามารถพิจารณา/.test(item));
  const numbered = value => lines(value).map((item, index) => /^\d+[.)]\s/.test(item) ? item : `${index + 1}. ${item}`).join('\n');
  const pick = (data, key) => data?.[key] ?? data?.[`lp_${key}`];
  const normalizeName = value => text(value).replace(/\s+/g, ' ');
  const findUnit = (rows, name) => (Array.isArray(rows) ? rows : []).find(row => normalizeName(row?.unitName) === normalizeName(name));

  function parseUnitTable(markdown) {
    return text(markdown).split('\n').map(row => row.trim()).filter(row => /^\|/.test(row)).map(row =>
      row.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
    ).filter(cells => /^\d+$/.test(cells[0] || '')).slice(0, 10).map(cells => ({
      unitNo: cells[0], unitTitle: cells[1], topics: text(cells[2]).replace(/<br\s*\/?\s*>/gi, '\n').replace(/^\s*-\s*/gm, ''),
      theoryHours: cells[3], practicalHours: cells[4], totalHours: cells[5]
    }));
  }

  function formatObjectives(row) {
    if (!row) return '';
    return [
      ['ด้านความรู้', row.cognitive], ['ด้านทักษะ', row.psychomotor],
      ['ด้านคุณลักษณะ', row.affective], ['ด้านการประยุกต์ใช้', row.application]
    ].filter(([, value]) => lines(value).length).map(([label, value]) => `${label}\n${numbered(value)}`).join('\n\n');
  }

  function formatActivities(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
      if (typeof item === 'string') return `${index + 1}. ${text(item)}`;
      const head = [`สัปดาห์ที่ ${item.week || '-'}`, item.phase, item.name].filter(Boolean).join(' - ');
      return [head, item.teacherAction && `ผู้สอน: ${text(item.teacherAction)}`, item.studentAction && `ผู้เรียน: ${text(item.studentAction)}`].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  function formatMedia(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
      if (typeof item === 'string') return `${index + 1}. ${text(item)}`;
      return `${index + 1}. ${text(item.name || item.type || 'สื่อการเรียนรู้')}${item.description ? ` - ${text(item.description)}` : ''}${item.usage ? `\n   การใช้: ${text(item.usage)}` : ''}`;
    }).join('\n');
  }

  function assignmentRows(activityRows, unitNo) {
    return (Array.isArray(activityRows?.assignments) ? activityRows.assignments : []).map((item, index) => ({
      worksheetNo: String(index + 1), unitNo: String(unitNo), sessionNo: String(item.weekStart || item.weekEnd || ''),
      title: text(item.name), theoryHours: '', practicalHours: '',
      content: [text(item.description), lines(item.deliverables).length ? `ชิ้นงานที่ส่ง:\n${numbered(item.deliverables)}` : ''].filter(Boolean).join('\n\n')
    }));
  }

  function importLearningPlanJson(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
    const form = pick(data, 'formData') || {};
    const unitRows = parseUnitTable(pick(data, 'unitDivisionPlan'));
    if (!unitRows.length) throw new Error('ไม่พบตารางแบ่งหน่วยการเรียนรู้ในไฟล์นี้');
    const lo = pick(data, 'loResults'), competencies = pick(data, 'compResults'), objectives = pick(data, 'objResults');
    const concepts = pick(data, 'conceptResults'), activities = pick(data, 'activitiesResults');
    const plan = {
      subjectName: text(form.courseName), subjectCode: text(form.courseCode), credits: text(form.credits),
      subjectCategory: form.courseCategory === 'vocational' ? 'วิชาชีพ' : text(form.courseCategory),
      curriculum: form.courseCategory === 'vocational' ? 'ประกาศนียบัตรวิชาชีพ' : '',
      curriculumStandards: text(form.standardRef), courseLearningOutcomes: text(form.learningOutcomes),
      courseObjectives: text(form.objectives), courseCompetencies: text(form.competencies), courseDescription: text(form.description),
      theoryHoursPerWeek: text(form.ratio).split('-')[0] || '', practicalHoursPerWeek: text(form.ratio).split('-')[1] || '',
      semesterHours: String(unitRows.reduce((sum, unit) => sum + (Number(unit.totalHours) || 0), 0) || ''),
      teacherName: '', competencyRows: [], dutyRows: [], analysisRows: [], evaluationRows: [], assignments: []
    };
    plan.units = unitRows.map(unit => {
      const activity = findUnit(activities, unit.unitTitle);
      const comp = findUnit(competencies, unit.unitTitle);
      return {
        unitNo: unit.unitNo, unitTitle: unit.unitTitle, unitHours: unit.totalHours,
        learningOutcomes: text(findUnit(lo, unit.unitTitle)?.outcome), referenceStandards: text(form.standardRef), element: '',
        performanceCriteria: numbered(activity?.performanceCriteria), assessmentMethod: numbered(activity?.assessmentMethods),
        competency: numbered(comp?.competencies), objectives: formatObjectives(findUnit(objectives, unit.unitTitle)),
        content: numbered(findUnit(concepts, unit.unitTitle)?.concept) || numbered(unit.topics.split('\n')),
        learningActivities: formatActivities(activity?.activities), learningResources: formatMedia(activity?.media),
        knowledgeEvidence: numbered(activity?.knowledgeEvidence), practicalEvidence: numbered(activity?.performanceEvidence),
        assessmentTools: numbered(activity?.assessmentTools), assessmentCriteria: numbered(activity?.performanceCriteria)
      };
    });
    plan.scheduleRows = unitRows.map(unit => ({ unitNo: unit.unitNo, unitTitle: unit.unitTitle, theoryHours: unit.theoryHours, practicalHours: unit.practicalHours, totalHours: unit.totalHours }));
    unitRows.forEach(unit => { plan.assignments.push(...assignmentRows(findUnit(activities, unit.unitTitle), unit.unitNo)); });
    return { plan, summary: { units: plan.units.length, completeActivities: plan.units.filter(unit => unit.learningActivities).length } };
  }

  return { importLearningPlanJson, parseUnitTable };
});
