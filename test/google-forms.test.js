const test = require('node:test');
const assert = require('node:assert/strict');
const { formIdFrom, parseGoogleForm, stripQuestionNumber } = require('../src/google-forms');

test('extracts a form id from a Google Forms edit URL', () => {
  assert.equal(formIdFrom('https://docs.google.com/forms/d/abc_123-XYZ/edit'), 'abc_123-XYZ');
  assert.equal(formIdFrom('https://docs.google.com/forms/d/e/1FAIpQLSeHJXXwTemyxZx6atCL81MIV-NppaPoSjVDUrjAFl-YT9V_CA/viewform'), null);
  assert.equal(formIdFrom('not a form'), null);
});

test('imports multiple-choice and written Google Forms questions with images', () => {
  const parsed = parseGoogleForm({ info: { title: 'Quiz' }, items: [
    { imageItem: { image: { contentUri: 'https://example.com/diagram.png', altText: 'แผนภาพ' } } },
    { title: '1. CPU คืออะไร', questionItem: { image: { contentUri: 'https://example.com/cpu.png' }, question: { questionId: 'q1', choiceQuestion: { type: 'RADIO', options: [{ value: 'แสดงผล' }, { value: 'ประมวลผล' }, { value: 'พิมพ์' }, { value: 'บันทึก' }] }, grading: { pointValue: 2, correctAnswers: { answers: [{ value: 'ประมวลผล' }] } } } } },
    { title: 'ข้อ ๒ อธิบายหน้าที่ของ CPU', questionItem: { question: { questionId: 'q2', textQuestion: { paragraph: true }, grading: { pointValue: 5, correctAnswers: { answers: [{ value: 'ประมวลผลข้อมูล' }] } } } } },
    { title: 'เลือกได้หลายข้อ', questionItem: { question: { choiceQuestion: { type: 'CHECKBOX', options: [] } } } }
  ] });
  assert.equal(parsed.title, 'Quiz');
  assert.deepEqual(parsed.questions[0], { sourceId: 'q1', type: 'mc', text: 'CPU คืออะไร', sourceNumber: '1', choices: ['แสดงผล', 'ประมวลผล', 'พิมพ์', 'บันทึก'], answer: 1, sourcePoints: 2, images: [{ contentUri: 'https://example.com/diagram.png', altText: 'แผนภาพ' }, { contentUri: 'https://example.com/cpu.png', altText: '' }] });
  assert.deepEqual(parsed.questions[1], { sourceId: 'q2', type: 'written', text: 'อธิบายหน้าที่ของ CPU', sourceNumber: '๒', keywords: ['ประมวลผลข้อมูล'], sourcePoints: 5, images: [] });
  assert.deepEqual(parsed.counts, { mc: 1, written: 1, images: 2 });
  assert.equal(parsed.skipped.length, 1);
  assert.match(parsed.skipped[0].reason, /หลายคำตอบ/);
});

test('strips only a leading question number', () => {
  assert.deepEqual(stripQuestionNumber('12) TCP/IP คืออะไร'), { text: 'TCP/IP คืออะไร', sourceNumber: '12' });
  assert.deepEqual(stripQuestionNumber('ข้อ ๓. จงอธิบาย'), { text: 'จงอธิบาย', sourceNumber: '๓' });
  assert.deepEqual(stripQuestionNumber('HTML5 คืออะไร'), { text: 'HTML5 คืออะไร', sourceNumber: null });
  assert.deepEqual(stripQuestionNumber('2026 เทคโนโลยีใดได้รับความนิยม'), { text: '2026 เทคโนโลยีใดได้รับความนิยม', sourceNumber: null });
});
