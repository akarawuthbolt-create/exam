const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'question-analysis-template.docx');

const difficultyAnalysisLine = value => value < .2
  ? 'ยากเกินไป'
  : value < .4
    ? 'ค่อนข้างยาก'
    : value < .6
      ? 'ยากปานกลาง (เหมาะสมดีมาก)'
      : value <= .8
        ? 'ค่อนข้างง่าย'
        : 'ง่ายเกินไป';

const discriminationAnalysisLine = value => value >= .6
  ? 'ดีมาก'
  : value >= .4
    ? 'ดี'
    : value >= .2
      ? 'พอใช้'
      : value >= .1
        ? 'ค่อนข้างต่ำ ควรปรับปรุง'
        : 'ต่ำมาก ต้องปรับปรุง';

function analysisStatus(item) {
  const difficultyOk = item.difficulty >= .2 && item.difficulty <= .8;
  const discriminationOk = item.discrimination !== null && item.discrimination >= .2;
  return { difficultyOk, discriminationOk, accepted: difficultyOk && discriminationOk };
}

function buildSummary(analysis) {
  const standardCount = analysis.items.filter(item => analysisStatus(item).accepted).length;
  const percent = analysis.questionCount ? Math.round(standardCount / analysis.questionCount * 10000) / 100 : 0;
  return { standardCount, rejectedCount: analysis.questionCount - standardCount, percent, rejectedPercent: Math.round((100 - percent) * 100) / 100 };
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function textNodes(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => {
    const start = match.index + match[0].indexOf('>') + 1;
    return { content: match[1], start, end: start + match[1].length };
  });
}

function visibleText(xml) {
  return textNodes(xml).map(node => node.content).join('');
}

function replaceVisibleText(xml, needle, value, replaceAll = true) {
  let output = xml;
  while (true) {
    const nodes = textNodes(output);
    const combined = nodes.map(node => node.content).join('');
    const foundAt = combined.indexOf(needle);
    if (foundAt < 0) return output;
    const foundEnd = foundAt + needle.length;
    let cursor = 0, startNode = -1, endNode = -1, startOffset = 0, endOffset = 0;
    for (let index = 0; index < nodes.length; index++) {
      const next = cursor + nodes[index].content.length;
      if (startNode < 0 && foundAt >= cursor && foundAt < next) { startNode = index; startOffset = foundAt - cursor; }
      if (foundEnd > cursor && foundEnd <= next) { endNode = index; endOffset = foundEnd - cursor; break; }
      cursor = next;
    }
    if (startNode < 0 || endNode < 0) return output;
    const replacements = [];
    for (let index = startNode; index <= endNode; index++) {
      const node = nodes[index];
      const prefix = index === startNode ? node.content.slice(0, startOffset) : '';
      const suffix = index === endNode ? node.content.slice(endOffset) : '';
      replacements.push({ start: node.start, end: node.end, content: prefix + (index === startNode ? xmlEscape(value) : '') + suffix });
    }
    for (const replacement of replacements.reverse()) output = output.slice(0, replacement.start) + replacement.content + output.slice(replacement.end);
    if (!replaceAll) return output;
  }
}

function replaceToken(xml, name, value) {
  return replaceVisibleText(xml, `{{${name}}}`, value);
}

function classYears(classRooms) {
  return [...new Set((classRooms || []).map(room => String(room).match(/\.([1-9])[^.]*$/)?.[1]).filter(Boolean))].join(', ') || '-';
}

function scalarValues(analysis) {
  const summary = buildSummary(analysis);
  const choiceCounts = [...new Set(analysis.items.map(item => item.choices.length).filter(Boolean))];
  return {
    course_name: analysis.courseName || analysis.title || '-',
    course_code: analysis.courseCode || '-',
    education_level: String(analysis.educationLevel || '-').replace(/\.$/, ''),
    class_year: classYears(analysis.assignedClasses),
    semester: analysis.semester || analysis.semesterLabel || '-',
    academic_year: analysis.academicYear || '-',
    teacher_name: analysis.teacherName || '-',
    respondents: analysis.respondents,
    question_count: analysis.questionCount,
    choice_count: choiceCounts.length === 1 ? choiceCounts[0] : choiceCounts.length ? choiceCounts.join(', ') : '-',
    standard_count: summary.standardCount,
    standard_percent: summary.percent,
    rejected_count: summary.rejectedCount,
    rejected_percent: summary.rejectedPercent,
    bank_count: summary.standardCount,
    reliability: analysis.reliability === null ? 'ข้อมูลไม่เพียงพอ' : analysis.reliability
  };
}

function itemValues(item) {
  const status = analysisStatus(item);
  return {
    item_no: item.number,
    correct_count: status.accepted ? '✓' : '',
    incorrect_count: status.accepted ? '' : '✓',
    difficulty: Number(item.difficulty).toFixed(2),
    discrimination: item.discrimination === null ? 'ข้อมูลไม่พอ' : Number(item.discrimination).toFixed(2),
    difficulty_analysis_line: difficultyAnalysisLine(Number(item.difficulty)),
    discrimination_analysis_line: item.discrimination === null ? 'ข้อมูลไม่พอ' : discriminationAnalysisLine(Number(item.discrimination))
  };
}

function keepRowTogether(row) {
  if (row.includes('<w:cantSplit')) return row;
  if (row.includes('<w:trPr>')) return row.replace('<w:trPr>', '<w:trPr><w:cantSplit/>');
  return row.replace(/(<w:tr\b[^>]*>)/, '$1<w:trPr><w:cantSplit/></w:trPr>');
}

function repeatHeaderRow(row) {
  if (row.includes('<w:tblHeader')) return row;
  if (row.includes('<w:trPr>')) return row.replace('<w:trPr>', '<w:trPr><w:tblHeader/>');
  return row.replace(/(<w:tr\b[^>]*>)/, '$1<w:trPr><w:tblHeader/></w:trPr>');
}

function formatAnalysisTable(xml) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, table => {
    let rowIndex = 0;
    return table
      .replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, row => keepRowTogether(rowIndex++ < 2 ? repeatHeaderRow(row) : row))
      .replace(/<w:sz w:val="\d+"\/>/g, '<w:sz w:val="32"/>')
      .replace(/<w:szCs w:val="\d+"\/>/g, '<w:szCs w:val="32"/>');
  });
}

async function buildQuestionAnalysisDocx(analysis) {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE_PATH));
  const documentPart = zip.file('word/document.xml');
  if (!documentPart) throw new Error('เทมเพลต Word ไม่มี word/document.xml');
  let xml = await documentPart.async('string');
  xml = replaceVisibleText(xml, '{{program}}', analysis.teacherDepartment || '-', false);
  xml = replaceVisibleText(xml, '{{program}}', (analysis.programs || []).join(', ') || '-', false);
  xml = replaceVisibleText(xml, '................................', '{{course_code}}');
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  const prototype = rows.find(row => visibleText(row).includes('{{item_no}}'));
  if (!prototype) throw new Error('ไม่พบแถว {{item_no}} ในเทมเพลต Word');
  const sourceItems = analysis.items.length ? analysis.items : [{ number: '-', correctCount: '-', incorrectCount: '-', difficulty: 0, discrimination: null }];
  const renderedRows = sourceItems.map(item => {
    let row = prototype;
    for (const [name, value] of Object.entries(itemValues(item))) row = replaceToken(row, name, value);
    row = replaceVisibleText(row, 'เกณฑ์ ', 'เกณฑ์');
    return row;
  }).join('');
  xml = xml.replace(prototype, renderedRows);
  for (const [name, value] of Object.entries(scalarValues(analysis))) xml = replaceToken(xml, name, value);
  xml = formatAnalysisTable(xml);
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { analysisStatus, buildQuestionAnalysisDocx, buildSummary, classYears, difficultyAnalysisLine, discriminationAnalysisLine, formatAnalysisTable, itemValues, keepRowTogether, repeatHeaderRow, replaceVisibleText, scalarValues, visibleText };
