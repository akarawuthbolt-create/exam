const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { replaceVisibleText, visibleText } = require('./question-analysis-docx');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'learning-plan-template.docx');

function replaceToken(xml, name, value) {
  return replaceVisibleText(xml, `{{${name}}}`, String(value ?? ''));
}

function fullName(plan) {
  return [plan.subjectCode, plan.subjectName].filter(Boolean).join(' ') || '-';
}

function scalarValues(plan) {
  const values = {
    course: plan.subjectName, course_code: plan.subjectCode, course_label: fullName(plan), category: plan.subjectCategory,
    curriculum: plan.curriculum, career_group: plan.occupationalGroup, program: plan.studentProgram, teacher: plan.teacherName,
    credits: plan.credits, weekly_hours: plan.weeklyHours || [plan.theoryHoursPerWeek, plan.practicalHoursPerWeek].filter(Boolean).join('/'),
    semester_hours: plan.semesterHours, theory_hours_per_week: plan.theoryHoursPerWeek, practical_hours_per_week: plan.practicalHoursPerWeek,
    education_level: plan.educationLevel, introduction_text: plan.introductionText, curriculum_standards: plan.curriculumStandards,
    course_learning_outcomes: plan.courseLearningOutcomes, course_objectives: plan.courseObjectives,
    course_competencies: plan.courseCompetencies, course_description: plan.courseDescription, job_outcome: plan.courseJobOutcome,
    standard_agency: plan.standardAgency, occupational_standard_field: plan.occupationalStandardField,
    occupation_sector: plan.occupationSector, occupational_level: plan.occupationalLevel, occupational_standard_url: plan.occupationalStandardUrl,
    dept_head: plan.departmentHeadName, director: plan.academicDirectorName, teacher_date: plan.teacherApprovalDate,
    dept_date: plan.departmentHeadApprovalDate, director_date: plan.academicDirectorApprovalDate,
    teaching_record_date: plan.teachingRecordDate, teaching_conclusion: plan.teachingConclusion,
    teaching_problems: plan.teachingProblems, improvement_guideline: plan.improvementGuideline,
    department_head_revision_topic: plan.departmentHeadRevisionTopic, department_head_revision_detail: plan.departmentHeadRevisionDetail,
    dept_decision_date: plan.departmentHeadDecisionDate, academic_director_comment: plan.academicDirectorComment,
    academic_director_other_comment: plan.academicDirectorOtherComment, director_decision_date: plan.academicDirectorDecisionDate,
    teacher_sign: '', dept_sign: '', director_sign: ''
  };
  for (let index = 0; index < 10; index++) values[`unit_${index + 1}_title`] = plan.units?.[index]?.unitTitle || '';
  return values;
}

const rowDefinitions = [
  ['uc_code', 'competencyRows', { uc_code:'unitCode', uc_desc:'unitDescription', eoc_code:'elementCode', eoc_desc:'elementDescription', criteria:'performanceCriteria', assess_method:'assessmentProcedure' }],
  ['duty', 'dutyRows', { duty:'duty', task:'task', occ_element:'occupationalElement', op_knowledge:'operationalKnowledge', op_skills:'operationalSkills' }],
  ['a_unit', 'analysisRows', { a_unit:'unitName', a_know:'knowledge', a_comp:'comprehension', a_use:'implementation', a_analysis:'analysis', a_synth:'synthesis', a_eval:'evaluation', a_skill:'skill', a_attitude:'attitude', a_apply:'application', a_total:'total', a_priority:'priority', a_periods:'periods' }],
  ['s_no', 'scheduleRows', { s_no:'unitNo', s_unit:'unitTitle', s_theory:'theoryHours', s_practice:'practicalHours', s_total:'totalHours' }],
  ['e_comp', 'evaluationRows', { e_comp:'competency', e_expect:'expectedLevel', e_l1:'level1', e_l2:'level2', e_l3:'level3', e_l4:'level4', e_l5:'level5', e_percent:'learnerPercentage' }]
];

function renderPrototypeRows(xml, plan) {
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  for (const [marker, sourceKey, fields] of rowDefinitions) {
    const prototype = rows.find(row => visibleText(row).includes(`{{${marker}}}`));
    if (!prototype) throw new Error(`ไม่พบแถวต้นแบบ {{${marker}}}`);
    const sourceRows = plan[sourceKey]?.length ? plan[sourceKey] : [{}];
    const rendered = sourceRows.map(source => {
      let row = prototype;
      for (const [token, field] of Object.entries(fields)) row = replaceToken(row, token, source[field] || '');
      return row;
    }).join('');
    xml = xml.replace(prototype, rendered);
  }
  return xml;
}

function unitValues(unit) {
  return {
    unit_no: unit.unitNo, unit_title: unit.unitTitle, unit_hours: unit.unitHours,
    unit_learning_outcomes: unit.learningOutcomes, unit_reference_standards: unit.referenceStandards,
    unit_element: unit.element, unit_performance_criteria: unit.performanceCriteria,
    unit_assessment_method: unit.assessmentMethod, unit_competency: unit.competency,
    unit_objectives: unit.objectives, unit_content: unit.content, learning_activities: unit.learningActivities,
    learning_resources: unit.learningResources, knowledge_evidence: unit.knowledgeEvidence,
    practical_evidence: unit.practicalEvidence, assessment_tools: unit.assessmentTools,
    assessment_criteria: unit.assessmentCriteria
  };
}

function tableStartBefore(xml, marker) {
  const matches = [...xml.slice(0, marker).matchAll(/<w:tbl(?=[\s>])[^>]*>/g)];
  return matches.length ? matches[matches.length - 1].index : -1;
}

function repeatUnitSection(xml, units) {
  const first = xml.indexOf('{{unit_learning_outcomes}}');
  const last = xml.indexOf('{{assessment_criteria}}');
  if (first < 0 || last < 0) throw new Error('ไม่พบส่วนต้นแบบหน่วยการเรียน');
  const start = tableStartBefore(xml, first);
  const endTag = xml.indexOf('</w:tbl>', last);
  if (start < 0 || endTag < 0) throw new Error('โครงสร้างตารางหน่วยการเรียนไม่ครบ');
  const end = endTag + '</w:tbl>'.length;
  const prototype = xml.slice(start, end);
  const rendered = units.map(unit => {
    let block = prototype;
    for (const [name, value] of Object.entries(unitValues(unit))) block = replaceToken(block, name, value || '');
    return block;
  }).join('');
  return xml.slice(0, start) + rendered + xml.slice(end);
}

function repeatAssignments(xml, assignments) {
  const marker = xml.indexOf('{{sheet_no}}');
  if (marker < 0) return xml;
  const start = tableStartBefore(xml, marker);
  const endTag = xml.indexOf('</w:tbl>', marker);
  const end = endTag + '</w:tbl>'.length;
  const prototype = xml.slice(start, end);
  const source = assignments?.length ? assignments : [{}];
  const rendered = source.map(item => {
    let table = prototype;
    const values = { sheet_no:item.worksheetNo, session_no:item.sessionNo, assignment_title:item.title, assignment_content:item.content, theory_hours:item.theoryHours, practical_hours:item.practicalHours, unit_no:item.unitNo };
    for (const [name, value] of Object.entries(values)) table = replaceToken(table, name, value || '');
    return table;
  }).join('');
  return xml.slice(0, start) + rendered + xml.slice(end);
}

async function buildLearningPlanDocx(plan) {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE_PATH));
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('เทมเพลตแผนการสอนไม่มี word/document.xml');
  let xml = await part.async('string');
  xml = repeatUnitSection(xml, plan.units || []);
  xml = repeatAssignments(xml, plan.assignments || []);
  xml = renderPrototypeRows(xml, plan);
  for (const [name, value] of Object.entries(scalarValues(plan))) xml = replaceToken(xml, name, value || '');
  while (true) {
    const remaining = visibleText(xml).match(/\{\{[a-z0-9_]+\}\}/)?.[0];
    if (!remaining) break;
    xml = replaceVisibleText(xml, remaining, '');
  }
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type:'nodebuffer', compression:'DEFLATE' });
}

module.exports = { buildLearningPlanDocx, repeatAssignments, repeatUnitSection, renderPrototypeRows, scalarValues, unitValues };
