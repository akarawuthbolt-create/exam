const MAX_UNITS = 10;
const MAX_ROWS = 50;

const scalarFields = [
  'subjectName', 'subjectCode', 'subjectCategory', 'curriculum', 'credits', 'weeklyHours',
  'semesterHours', 'theoryHoursPerWeek', 'practicalHoursPerWeek', 'educationLevel',
  'studentProgram', 'occupationalGroup', 'teacherName', 'introductionText',
  'curriculumStandards', 'courseLearningOutcomes', 'courseObjectives', 'courseCompetencies',
  'courseDescription', 'courseJobOutcome', 'standardAgency', 'occupationalStandardField',
  'occupationSector', 'occupationalLevel', 'occupationalStandardUrl', 'departmentHeadName',
  'academicDirectorName', 'teacherApprovalDate', 'departmentHeadApprovalDate',
  'academicDirectorApprovalDate', 'teachingRecordDate', 'teachingConclusion', 'teachingProblems',
  'improvementGuideline', 'departmentHeadRevisionTopic', 'departmentHeadRevisionDetail',
  'departmentHeadDecisionDate', 'academicDirectorComment', 'academicDirectorOtherComment',
  'academicDirectorDecisionDate'
];

const unitFields = [
  'unitNo', 'unitTitle', 'unitHours', 'learningOutcomes', 'referenceStandards', 'element',
  'performanceCriteria', 'assessmentMethod', 'competency', 'objectives', 'content',
  'learningActivities', 'learningResources', 'knowledgeEvidence', 'practicalEvidence',
  'assessmentTools', 'assessmentCriteria'
];

const rowSchemas = {
  competencyRows: ['unitCode', 'unitDescription', 'elementCode', 'elementDescription', 'performanceCriteria', 'assessmentProcedure'],
  dutyRows: ['duty', 'task', 'occupationalElement', 'operationalKnowledge', 'operationalSkills'],
  analysisRows: ['unitName', 'knowledge', 'comprehension', 'implementation', 'analysis', 'synthesis', 'evaluation', 'skill', 'attitude', 'application', 'total', 'priority', 'periods'],
  scheduleRows: ['unitNo', 'unitTitle', 'theoryHours', 'practicalHours', 'totalHours'],
  evaluationRows: ['competency', 'expectedLevel', 'level1', 'level2', 'level3', 'level4', 'level5', 'learnerPercentage'],
  assignments: ['worksheetNo', 'unitNo', 'sessionNo', 'title', 'content', 'theoryHours', 'practicalHours']
};

function cleanText(value, max = 10000) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function cleanObject(source, fields, max = 10000) {
  return Object.fromEntries(fields.map(field => [field, cleanText(source?.[field], max)]));
}

function sanitizeLearningPlan(payload) {
  const plan = cleanObject(payload, scalarFields);
  plan.units = (Array.isArray(payload?.units) ? payload.units : []).slice(0, MAX_UNITS).map((unit, index) => ({
    ...cleanObject(unit, unitFields),
    unitNo: cleanText(unit?.unitNo || index + 1, 20)
  }));
  for (const [key, fields] of Object.entries(rowSchemas)) {
    plan[key] = (Array.isArray(payload?.[key]) ? payload[key] : []).slice(0, MAX_ROWS).map(row => cleanObject(row, fields, 2000));
  }
  return plan;
}

function validateLearningPlan(plan) {
  const errors = [];
  if (!plan.subjectName) errors.push('กรุณากรอกชื่อรายวิชา');
  if (!plan.subjectCode) errors.push('กรุณากรอกรหัสวิชา');
  if (!plan.teacherName) errors.push('กรุณากรอกชื่อผู้สอน');
  if (!plan.units.length) errors.push('กรุณาเพิ่มหน่วยการเรียนอย่างน้อย 1 หน่วย');
  plan.units.forEach((unit, index) => {
    if (!unit.unitTitle) errors.push(`กรุณากรอกชื่อหน่วยที่ ${index + 1}`);
  });
  return errors;
}

module.exports = { MAX_ROWS, MAX_UNITS, rowSchemas, sanitizeLearningPlan, scalarFields, unitFields, validateLearningPlan };
