function formIdFrom(value) {
  const text = String(value || '').trim();
  if (/forms\/d\/e\//.test(text)) return null;
  const match = text.match(/forms\/d\/([a-zA-Z0-9_-]+)/) || text.match(/^([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function stripQuestionNumber(value) {
  const text = String(value || '').trim();
  const match = text.match(/^\s*(?:ข้อ\s*([0-9๐-๙]+)\s*(?:[.)]|[-:])?\s+|([0-9๐-๙]+)\s*(?:[.)]|[-:])\s+)/i);
  if (!match) return { text, sourceNumber: null };
  const stripped = text.slice(match[0].length).trim();
  return { text: stripped || text, sourceNumber: match[1] || match[2] };
}

function googleImage(image) {
  if (!image?.contentUri) return null;
  return { contentUri: String(image.contentUri), altText: String(image.altText || '').trim() };
}

function parseGoogleForm(form) {
  const questions = [];
  const skipped = [];
  let pendingImages = [];
  for (const item of form?.items || []) {
    const standaloneImage = googleImage(item.imageItem?.image);
    if (standaloneImage) { pendingImages.push(standaloneImage); continue; }
    const question = item.questionItem?.question;
    const choices = question?.choiceQuestion;
    const textQuestion = question?.textQuestion;
    if (!question || (!choices && !textQuestion)) {
      if (item.questionItem) skipped.push({ title: String(item.title || 'ไม่มีชื่อข้อ'), reason: 'ยังไม่รองรับคำถามชนิดนี้' });
      continue;
    }
    const numbered = stripQuestionNumber(item.title);
    const directImage = googleImage(item.questionItem?.image);
    const images = [...pendingImages, ...(directImage ? [directImage] : [])];
    pendingImages = [];
    if (textQuestion) {
      const correctAnswers = (question.grading?.correctAnswers?.answers || []).map(answer => String(answer.value || '').trim()).filter(Boolean);
      const rawPoints = Number(question.grading?.pointValue);
      const pointsMissing = !Number.isFinite(rawPoints) || rawPoints <= 0;
      const sourcePoints = pointsMissing ? 1 : rawPoints;
      questions.push({ sourceId: question.questionId || item.itemId || '', type: 'written', text: numbered.text, sourceNumber: numbered.sourceNumber, keywords: correctAnswers, sourcePoints, pointsMissing, images });
      continue;
    }
    if (!['RADIO', 'DROP_DOWN'].includes(choices.type)) {
      skipped.push({ title: String(item.title || 'ไม่มีชื่อข้อ'), reason: choices.type === 'CHECKBOX' ? 'คำถามหลายคำตอบยังไม่รองรับ' : 'ยังไม่รองรับคำถามชนิดนี้' });
      continue;
    }
    const options = (choices.options || []).map(option => String(option.value || '').trim());
    const answerValue = question.grading?.correctAnswers?.answers?.[0]?.value;
    const answer = options.indexOf(answerValue);
    if (options.length < 2 || options.some(option => !option) || new Set(options).size !== options.length) {
      skipped.push({ title: String(item.title || 'ไม่มีชื่อข้อ'), reason: 'ต้องมีตัวเลือกที่ไม่ซ้ำกันอย่างน้อย 2 ตัวเลือก' });
      continue;
    }
    if (answer < 0) {
      skipped.push({ title: String(item.title || 'ไม่มีชื่อข้อ'), reason: 'ไม่พบเฉลยของข้อสอบ' });
      continue;
    }
    const rawPoints = Number(question.grading?.pointValue);
    const pointsMissing = !Number.isFinite(rawPoints) || rawPoints <= 0;
    const sourcePoints = pointsMissing ? 1 : rawPoints;
    questions.push({ sourceId: question.questionId || item.itemId || '', type: 'mc', text: numbered.text, sourceNumber: numbered.sourceNumber, choices: options, answer, sourcePoints, pointsMissing, images });
  }
  return { title: String(form?.info?.title || 'Google Forms'), questions, skipped, counts: { mc: questions.filter(question => question.type === 'mc').length, written: questions.filter(question => question.type === 'written').length, images: questions.reduce((sum, question) => sum + question.images.length, 0), pointsMissing: questions.filter(question => question.pointsMissing).length } };
}

module.exports = { formIdFrom, parseGoogleForm, stripQuestionNumber };
