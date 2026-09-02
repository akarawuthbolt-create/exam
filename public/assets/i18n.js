/* Shared TH/EN i18n helper for student.html and teacher.html.
   Translation keys are the original Thai strings themselves, so both
   static markup (data-i18n attributes) and JS-generated strings (t('...'))
   can share one dictionary. */
(function(global){
  var LANG_KEY = 'examLang';

  var DICT = {
    // ---- shared / common ----
    'โหมดมืด': 'Dark mode',
    'โหมดสว่าง': 'Light mode',
    'บันทึก': 'Save',
    'ยกเลิก': 'Cancel',
    'ลบ': 'Delete',
    'แก้ไข': 'Edit',
    'เพิ่ม': 'Add',
    'ปิด': 'Close',
    'กลับ': 'Back',
    '← กลับ': '← Back',
    '← ย้อนกลับ': '← Back',
    'ตกลง': 'OK',
    'กำลังโหลด...': 'Loading...',
    'ค้นหา': 'Search',
    'ออกจากระบบ': 'Log out',

    // ================= student.html =================
    'ระบบข้อสอบ — สำหรับนักเรียน': 'Exam System — Student',
    'EXAM SYSTEM · นักเรียน': 'EXAM SYSTEM · Student',
    'SYSTEM MAINTENANCE': 'SYSTEM MAINTENANCE',
    'ระบบสอบปิดให้บริการชั่วคราว': 'The exam system is temporarily unavailable',
    'กรุณารอประกาศจากอาจารย์ผู้สอน': 'Please wait for an announcement from your instructor',
    'ตรวจสอบอีกครั้ง': 'Check again',
    'ระบบข้อสอบออนไลน์': 'Online Exam System',
    'ข้อสอบกลางภาคและปลายภาค 3 รูปแบบ ได้แก่ ปรนัย (เลือกตอบ), จับคู่ และอัตนัย (เขียนตอบ) คะแนนเต็มรวม 20 คะแนนต่อวิชา':
      'Midterm and final exams come in 3 formats: multiple choice, matching, and written answer. Full score is 20 points per subject.',
    '⏱ เวลารวม': '⏱ Total time',
    'นาที': 'minutes',
    '🎯 คะแนนเต็ม': '🎯 Full score',
    'คะแนน': 'points',
    '📝 3 รูปแบบ': '📝 3 formats',
    'ปรนัย/จับคู่/อัตนัย': 'MCQ / Matching / Written',
    '🔒 คะแนน': '🔒 Score',
    'เป็นความลับ': 'is confidential',
    'คำชี้แจง': 'Instructions',
    'ใช้ <b>รหัสนักเรียน</b> ในการเข้าสู่ระบบ ระบบจะดึงชื่อ-สกุลและรายวิชาที่คุณมีสิทธิสอบขึ้นมาให้อัตโนมัติ':
      'Log in using your <b>student ID</b>. The system automatically retrieves your name and the subjects you are eligible to take.',
    'ข้อสอบปรนัยแสดงทีละข้อ เลือกคำตอบแล้วกด "ถัดไป" หรือคลิกหมายเลขข้อเพื่อข้ามไปข้อใดก็ได้':
      'Multiple-choice questions are shown one at a time. Choose an answer and press "Next", or click a question number to jump to it.',
    'ต้องตอบให้ครบทุกข้อในทุกส่วนก่อนจึงจะส่งคำตอบได้ ระบบจะพาไปยังข้อที่ยังไม่ได้ตอบให้อัตโนมัติ':
      'All questions in every section must be answered before submitting. The system will automatically take you to any unanswered question.',
    '<b>คะแนนจะไม่แสดงให้เห็นทันที</b> เพื่อรักษาความลับของข้อสอบ ตรวจสอบผลได้ภายหลังด้วยรหัสนักเรียนของคุณ':
      '<b>Your score will not be shown immediately</b> to keep the exam confidential. You can check the result later using your student ID.',
    '⚠️ <strong>ห้ามคัดลอกข้อความ คลิกขวา สลับแท็บ หรือออกจากโหมดเต็มจอโดยเด็ดขาด</strong><br><span>ระบบจะบันทึกเหตุการณ์ที่เกิดขึ้นระหว่างทำข้อสอบ</span>':
      '⚠️ <strong>Do not copy text, right-click, switch tabs, or exit fullscreen mode.</strong><br><span>The system logs any such events that occur while taking the exam.</span>',
    '📊 ตรวจสอบผลคะแนน': '📊 Check score',
    'เข้าสู่ระบบด้วยรหัสนักเรียน →': 'Log in with student ID →',
    'เข้าสู่ระบบ': 'Log in',
    'กรอกรหัสนักเรียน': 'Enter your student ID',
    'ระบบจะตรวจสอบสิทธิ์และดึงชื่อ-สกุล พร้อมรายวิชาที่คุณต้องสอบขึ้นมาให้อัตโนมัติ':
      'The system will verify your eligibility and automatically retrieve your name and the subjects you need to take.',
    'ตรวจสอบสิทธิ์ →': 'Verify eligibility →',
    'ตรวจสอบก่อนดำเนินการ': 'Confirm before proceeding',
    'นี่คือบัญชีของคุณใช่หรือไม่?': 'Is this your account?',
    'กรุณาตรวจสอบชื่อ–นามสกุลให้ถูกต้องก่อนดำเนินการ': 'Please verify your first and last name are correct before proceeding',
    'กรอก PIN': 'Enter PIN',
    'ตั้ง PIN ตัวเลข 4-6 หลัก': 'Set a 4-6 digit numeric PIN',
    'ยืนยัน PIN อีกครั้ง': 'Confirm PIN again',
    'แก้ไขรหัสนักเรียน': 'Edit student ID',
    'ยืนยันและเข้าสู่ระบบ →': 'Confirm and log in →',
    'ลืม PIN? ยืนยันตัวตนเพื่อตั้งใหม่': 'Forgot PIN? Verify your identity to reset it',
    'ยืนยันตัวตน': 'Verify identity',
    'ตั้ง PIN ใหม่': 'Set a new PIN',
    'กรอกชื่อและนามสกุลให้ตรงกับข้อมูลในระบบ แล้วตั้ง PIN ใหม่': 'Enter your first and last name matching the system records, then set a new PIN',
    'ชื่อ': 'First name',
    'นามสกุล': 'Last name',
    'ตั้ง PIN ใหม่ (4-6 หลัก)': 'Set new PIN (4-6 digits)',
    'ยืนยัน PIN ใหม่': 'Confirm new PIN',
    'ยืนยันและตั้ง PIN ใหม่': 'Confirm and set new PIN',
    'ตรวจสอบผลคะแนน': 'Check score',
    'กรอกรหัสนักเรียนเพื่อดูรายวิชาที่เคยสอบและสถานะการประกาศผล คะแนนจะแสดงเฉพาะวิชาที่อาจารย์ประกาศผลแล้วเท่านั้น':
      'Enter your student ID to see the subjects you have taken and their results status. Scores are only shown for subjects the instructor has published.',
    'ตรวจสอบ →': 'Check →',
    'เลือกรายวิชาที่จะสอบ': 'Select subject to take',
    'รายวิชาที่คุณมีสิทธิสอบ': 'Subjects you are eligible to take',
    'เริ่มทำข้อสอบ →': 'Start exam →',
    'กำลังโหลดรายวิชา...': 'Loading subjects...',
    'กำลังเตรียมข้อสอบ': 'Preparing the exam',
    'กำลังเตรียมข้อสอบ...': 'Preparing the exam...',
    'กรุณารอสักครู่ และไม่ต้องกดซ้ำ': 'Please wait a moment and do not click again',
    'เตรียมตัว...': 'Get ready...',
    'รายการส่วนข้อสอบ': 'Exam sections',
    'สลับแท็บ: 0 ครั้ง': 'Tab switches: 0',
    'ออกจากเต็มจอ: 0 ครั้ง': 'Fullscreen exits: 0',
    'คลิกขวา: 0 ครั้ง': 'Right clicks: 0',
    'คัดลอก: 0 ครั้ง': 'Copies: 0',
    '💾 บันทึกอัตโนมัติพร้อมใช้งาน': '💾 Autosave ready',
    'จบการสอบและส่งคำตอบ': 'End exam and submit',
    'ต้องบันทึกคำตอบอย่างน้อย 1 ส่วนก่อน': 'You must save at least 1 section first',
    '← รายการส่วนข้อสอบ': '← Exam sections',
    'โจทย์: -': 'Exam: -',
    'เลือกทำส่วนใดก่อนก็ได้ เวลารวม 60 นาทีใช้ร่วมกันทุกส่วน คะแนนจะไม่แสดงทันที — ตรวจสอบผลได้ภายหลังจากหน้าแรกของระบบ':
      'You may complete the sections in any order. The 60-minute total time is shared across all sections. Your score will not be shown immediately — check the result later from the system home page.',
    'บันทึกคำตอบแล้ว': 'Answers saved',
    'คำตอบของคุณในส่วนนี้ถูกบันทึกไว้เรียบร้อยแล้ว คุณสามารถกลับมาแก้ไขได้ก่อนจบการสอบ':
      'Your answers for this section have been saved. You can come back and edit them before ending the exam.',
    'แก้ไขต่อ': 'Keep editing',
    'กลับไปหน้ารายการ': 'Back to section list',
    'ยืนยันการส่งข้อสอบ': 'Confirm exam submission',
    'หลังจากนี้จะไม่สามารถแก้ไขคำตอบได้อีก กรุณาตรวจสอบให้เรียบร้อยก่อนส่ง': 'You will not be able to edit your answers after this. Please review carefully before submitting.',
    'กลับไปตรวจคำตอบ': 'Back to review answers',
    'ยืนยันส่งข้อสอบ': 'Confirm submit',
    'ตรวจพบการสลับหน้าจอ': 'Tab switch detected',
    'ระบบจะล้างคำตอบเมื่อสลับหน้าจอครบ 3 ครั้ง และส่งข้อสอบอัตโนมัติเมื่อครบ 5 ครั้ง':
      'Your answers will be cleared after 3 tab switches, and the exam will be submitted automatically after 5.',
    'เข้าใจแล้ว กลับไปทำข้อสอบต่อ': 'Understood, continue the exam',
    'ตรวจพบหน้าต่างสอบมีขนาดเล็กผิดปกติ': 'Abnormally small exam window detected',
    'ไม่อนุญาตให้แบ่งหน้าจอระหว่างทำข้อสอบ กรุณาขยายหน้าต่างให้เต็มพื้นที่ หรือกดกลับเข้าสู่โหมดเต็มจอ':
      'Split screen is not allowed while taking the exam. Please maximize the window or return to fullscreen mode.',
    'กลับเข้าเต็มจอ': 'Return to fullscreen',
    'ส่งคำตอบเรียบร้อยแล้ว': 'Answers submitted',
    'คุณได้ส่งคำตอบเรียบร้อยแล้ว': 'You have submitted your answers',
    'ระบบได้บันทึกคำตอบของคุณเข้าสู่ระบบเรียบร้อยแล้ว': 'Your answers have been saved to the system',
    '🔒 คะแนนของคุณถูกเก็บเป็นความลับ ตรวจสอบผลได้ภายหลังผ่านเมนู "ตรวจสอบผลคะแนน" ที่หน้าแรกของระบบ':
      '🔒 Your score is kept confidential. Check the result later via the "Check score" menu on the system home page.',
    'เลือกวิชาอื่น': 'Choose another subject',

    // ================= teacher.html =================
    'ระบบข้อสอบ — สำหรับอาจารย์ผู้สอน': 'Exam System — Instructor',
    'EXAM SYSTEM · อาจารย์ผู้สอน': 'EXAM SYSTEM · Instructor',
    'เข้าสู่ระบบอาจารย์': 'Instructor login',
    'กรอก username และ password ที่ผู้ดูแลระบบตั้งให้ คุณจะเห็นเฉพาะข้อสอบและผลสอบของวิชาที่คุณสอนเท่านั้น':
      'Enter the username and password set by the administrator. You will only see exams and results for subjects you teach.',
    'สลับโหมดสี': 'Toggle color mode',
    'หมดเวลาการเข้าสู่ระบบ': 'Login session expired',
    'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบอาจารย์ใหม่อีกครั้ง': 'For security, please log in as an instructor again',
    'เข้าสู่ระบบใหม่': 'Log in again',
    'ระบบข้อสอบของฉัน': 'My Exam System',
    '↻ รีเฟรชข้อมูล': '↻ Refresh data',
    'โหลดข้อมูลล่าสุดโดยไม่ออกจากระบบ': 'Load latest data without logging out',
    'ชุดข้อสอบของฉัน': 'My exam sets',
    '🗃️ คลังข้อสอบเก่า': '🗃️ Archived exams',
    'ผลสอบนักเรียน': 'Student results',
    '🖨️ พิมพ์รายชื่อสอบ': '🖨️ Print roster',
    '⚙️ ตั้งค่า': '⚙️ Settings',
    'จัดกลุ่มตามชื่อวิชา — 1 วิชาอาจมีทั้งข้อสอบกลางภาคและปลายภาค คุณเห็นเฉพาะข้อสอบที่คุณสร้างเองเท่านั้น':
      'Grouped by subject name — one subject may have both midterm and final exams. You only see exams you created yourself.',
    'ค้นหาชื่อวิชา หรือชุดข้อสอบ': 'Search subject or exam set name',
    'ค้นหาชุดข้อสอบ': 'Search exam sets',
    '📥 นำเข้าข้อสอบ': '📥 Import exam',
    '+ เพิ่มชุดข้อสอบใหม่': '+ Add new exam set',
    'คลังข้อสอบเก่าของฉัน': 'My archived exams',
    'เก็บต้นแบบข้อสอบจากปีที่ผ่านมาไว้ทำสำเนา ชุดในคลังจะไม่แสดงในชุดข้อสอบของฉัน':
      'Keep exam templates from previous years to duplicate later. Archived sets will not appear in "My exam sets".',
    'ผลสอบที่นักเรียนส่งเข้ามา': 'Submitted student results',
    'คะแนนเป็นความลับจนกว่าจะกด "ประกาศผล" — นักเรียนจะไม่เห็นคะแนนในระบบไม่ว่ากรณีใด ต้องแจ้งผลเองนอกระบบ':
      'Scores remain confidential until you click "Publish results" — students never see scores in the system under any circumstance; results must be announced outside the system.',
    'ทุกประเภทข้อสอบ': 'All exam types',
    'ทุกปีการศึกษา': 'All academic years',
    'ทุกภาคเรียน': 'All semesters',
    'ทุกรายวิชา': 'All subjects',
    '↻ รีเฟรช': '↻ Refresh',
    '⬇ ส่งออก Excel': '⬇ Export Excel',
    'พิมพ์รายชื่อนักเรียนเข้าห้องสอบ': 'Print student roster for exam room',
    'เลือกชุดข้อสอบและห้อง ระบบจะจัดทำใบรายชื่อพร้อมวันสอบ ผู้สอน รายวิชา และลิงก์สอบ':
      'Choose an exam set and class. The system generates a roster with the exam date, instructor, subject, and exam link.',
    'ชุดข้อสอบ / รายวิชา': 'Exam set / subject',
    'เลือกชุดข้อสอบ': 'Select exam set',
    'ชื่อห้อง': 'Class name',
    'เลือกห้อง': 'Select class',
    '+ เพิ่มห้อง': '+ Add class',
    'ห้องสอบ': 'Exam room',
    'ลิงก์สอบ': 'Exam link',
    '🖨️ เปิดตัวอย่างและพิมพ์': '🖨️ Open preview and print',
    '📋 สรุปผู้ขาดสอบ': '📋 Absence summary',
    'ตั้งค่า': 'Settings',
    'จัดการบัญชีและการส่งออกข้อมูล': 'Manage account and data export',
    'บัญชีของฉัน': 'My account',
    'เปลี่ยนรหัสผ่านหรือออกจากระบบเมื่อใช้งานเสร็จ': 'Change your password or log out when finished',
    '🔐 เปลี่ยนรหัสผ่าน': '🔐 Change password',
    'ใช้รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร ระบบจะออกจากอุปกรณ์อื่นเพื่อความปลอดภัย':
      'Use a new password of at least 8 characters. Other devices will be logged out for security.',
    'รหัสผ่านเดิม': 'Current password',
    'รหัสผ่านใหม่': 'New password',
    'ยืนยันรหัสผ่านใหม่': 'Confirm new password',
    'บันทึกรหัสผ่าน': 'Save password',
    '📥 นำเข้าข้อสอบ ': '📥 Import exam',
    'เลือกแหล่งข้อมูลที่ต้องการนำเข้า': 'Choose the source you want to import from',
    '📄 Word / PDF / Excel / TXT': '📄 Word / PDF / Excel / TXT',
    'อ่านข้อสอบจากไฟล์และแสดงตัวอย่างก่อนนำเข้า': 'Read exam questions from a file and preview before importing',
    'เลือกไฟล์ →': 'Choose file →',
    '🟢 Google Forms': '🟢 Google Forms',
    'เชื่อมต่อแบบทดสอบ Google Forms พร้อมเฉลยและคะแนน': 'Connect a Google Forms quiz with answer key and scoring',
    'เชื่อมต่อ Forms →': 'Connect Forms →',
    '📄 นำเข้าข้อสอบจากไฟล์': '📄 Import exam from file',
    'รองรับ Word (.docx), PDF (.pdf), Excel (.xlsx) และข้อความ (.txt)': 'Supports Word (.docx), PDF (.pdf), Excel (.xlsx) and text (.txt)',
    '1. เลือกไฟล์ข้อสอบ': '1. Choose exam file',
    'รูปแบบข้อความ: เลขข้อ ตามด้วยตัวเลือก ก./ข./ค./ง. และบรรทัด <b>เฉลย:</b> สำหรับข้อปรนัย ข้อที่ไม่มีตัวเลือกจะเป็นข้ออัตนัย':
      'Text format: question number followed by choices A./B./C./D. and a line <b>Answer:</b> for multiple choice. Questions without choices are treated as written answer.',
    '📌 ตัวอย่างรูปแบบที่ระบบอ่านได้': '📌 Example formats the system can read',
    'Word / PDF / TXT': 'Word / PDF / TXT',
    'ตัวเลือกต้องอยู่คนละบรรทัด ห้ามทำ 2 คอลัมน์': 'Each choice must be on its own line — do not use 2 columns',
    'Excel (.xlsx)': 'Excel (.xlsx)',
    'ใช้หัวคอลัมน์ “คำถาม”, “ก”, “ข”, “ค”, “ง”, “เฉลย”': 'Use column headers "Question", "A", "B", "C", "D", "Answer"',
    'ตรวจสอบไฟล์': 'Check file',
    'นำเข้าและตั้งค่าชุดข้อสอบ': 'Import and configure exam set',
    '🛠️ อนุมัติสอบซ่อม': '🛠️ Approve resit',
    'กำหนดสิทธิ์สอบซ่อม': 'Set resit eligibility',
    'เลือกช่วงเวลาสำหรับนักเรียนคนนี้ และกำหนดคะแนนเต็มหลังแปลงคะแนน': 'Choose a time window for this student and set the converted full score',
    'วันเริ่มสอบ': 'Start date',
    'เวลาเริ่มสอบ': 'Start time',
    'วันสิ้นสุด': 'End date',
    'เวลาสิ้นสุด': 'End time',
    'คะแนนเต็มหลังแปลง': 'Converted full score',
    'ระบบคำนวณ: คะแนนสอบซ่อม ÷ 20 × คะแนนเต็มที่กำหนด': 'System calculation: resit score ÷ 20 × configured full score',
    'อนุมัติเปิดสอบซ่อม': 'Approve resit',
    '🟢 นำเข้าข้อสอบจาก Google Forms': '🟢 Import exam from Google Forms',
    'จำแนกข้อปรนัยและอัตนัย ตัดเลขข้อซ้ำ และนำเข้ารูปประกอบโดยอัตโนมัติ': 'Automatically classifies multiple-choice and written questions, removes duplicate numbers, and imports images',
    'ขั้นที่ 1: เชื่อมต่อ Google': 'Step 1: Connect Google',
    'ใช้บัญชี Google ที่เป็นเจ้าของ หรือมีสิทธิ์แก้ไข Google Forms ชุดนั้น': 'Use a Google account that owns or can edit that Google Form',
    'เชื่อมต่อ Google': 'Connect Google',
    'ขั้นที่ 2: เลือก Google Forms': 'Step 2: Select Google Forms',
    'เลือกจากรายการ Google Forms ของบัญชีที่เชื่อมต่อ หรือวางลิงก์หน้าแก้ไขของฟอร์ม': 'Choose from the connected account\'s Google Forms list, or paste the form\'s edit-page link',
    'เลือก Google Forms': 'Select Google Forms',
    'วางลิงก์ Google Forms สำหรับแก้ไข': 'Paste the Google Forms edit link',
    'ตรวจสอบแบบฟอร์ม': 'Check form',
    'ขั้นที่ 3: รายละเอียดข้อสอบ': 'Step 3: Exam details',
    '← เลือกฟอร์มใหม่': '← Select a different form',
    '🧩 สร้างชุดข้อสอบใหม่': '🧩 Create new exam set',
    '💾 บันทึกชุดข้อสอบ': '💾 Save exam set',
    '✕ ออกโดยไม่บันทึก': '✕ Exit without saving',
    'ปิด': 'Close',
    '✕': '✕',

    // ---- common JS-generated strings (exam flow, student-main.js) ----
    'สลับแท็บ': 'Tab switches',
    'ครั้ง': 'times',
    'ออกจากเต็มจอ': 'Fullscreen exits',
    'คลิกขวา': 'Right clicks',
    'คัดลอก': 'Copies',
    'ถัดไป': 'Next',
    'ก่อนหน้า': 'Previous',
    'ส่งคำตอบ': 'Submit',
    'บันทึกคำตอบ': 'Save answers',
    'ยังไม่ได้ตอบ': 'Not answered yet',
    'ตอบแล้ว': 'Answered',
    'ข้อ': 'Question',
    'กำลังบันทึก...': 'Saving...',
    'บันทึกแล้ว': 'Saved',
    'บันทึกไม่สำเร็จ': 'Save failed',
    '💾 บันทึกอัตโนมัติพร้อมใช้งาน ': '💾 Autosave ready',
    'เกิดข้อผิดพลาด': 'An error occurred',
    'กรุณาลองใหม่อีกครั้ง': 'Please try again',
    'ไม่พบข้อมูล': 'No data found',
    'ไม่พบรหัสนักเรียนนี้ในระบบ': 'This student ID was not found in the system',
    'กรุณากรอกรหัสนักเรียน': 'Please enter your student ID',
    'กรุณากรอก PIN': 'Please enter your PIN',
    'PIN ไม่ถูกต้อง': 'Incorrect PIN',
    'PIN ต้องเป็นตัวเลข 4-6 หลัก': 'PIN must be 4-6 digits',
    'PIN ไม่ตรงกัน': 'PINs do not match',

    // ---- student-main.js exam-taking flow ----
    '💾 กำลังบันทึกอัตโนมัติ...': '💾 Autosaving...',
    '⚠ บันทึกอัตโนมัติไม่สำเร็จ': '⚠ Autosave failed',
    '💾 บันทึกอัตโนมัติแล้ว ': '💾 Autosaved ',
    'สลับแท็บ/หน้าต่าง': 'Tab/window switches',
    'จาก': 'of',
    'ส่วนที่ 1 — ปรนัย': 'Section 1 — Multiple choice',
    'ส่วนที่ 2 — จับคู่': 'Section 2 — Matching',
    'ส่วนที่ 3 — อัตนัย': 'Section 3 — Written',
    'เลือกคำตอบที่ถูกต้องที่สุดในแต่ละข้อ': 'Choose the best answer for each question',
    'จับคู่รายการซ้าย-ขวาให้สัมพันธ์กัน': 'Match the left and right items correctly',
    'เขียนตอบด้วยคำพูดของตนเอง': 'Answer in your own words',
    'บันทึกคำตอบแล้ว': 'Answers saved',
    'ยังไม่ทำ': 'Not started',
    'แก้ไขคำตอบต่อ': 'Continue editing',
    'เข้าทำส่วนนี้': 'Enter this section',
    'ส่งคำตอบแล้ว': 'Submitted',
    'ไม่ได้ทำ': 'Not attempted',
    'แผนที่ข้อสอบ': 'Exam map',
    'ยังไม่ตอบ': 'Not answered',
    'ข้อที่กำลังทำ': 'Current question',
    'ข้อก่อนหน้า': 'Previous question',
    'บันทึกคำตอบส่วนนี้': 'Save this section',
    'ล้างการจับคู่ทั้งหมด': 'Clear all matches',
    '⏳ กำลังส่งข้อสอบ...': '⏳ Submitting exam...',
    'กำลังส่งข้อสอบ...': 'Submitting exam...',
    'กำลังบันทึกคำตอบอัตโนมัติ...': 'Autosaving answers...',
    'ส่งคำตอบเรียบร้อยแล้ว': 'Answers submitted',
    'หมดเวลาสอบ — ส่งคำตอบอัตโนมัติแล้ว': 'Time is up — answers submitted automatically',
    'ตรวจพบการสลับหน้าจอซ้ำ — ส่งคำตอบอัตโนมัติแล้ว': 'Repeated tab switching detected — answers submitted automatically',
    'ระบบได้บันทึกคำตอบทุกส่วนที่คุณทำไว้ และส่งเข้าสู่ระบบเรียบร้อยแล้ว': 'All the answers you completed have been saved and submitted to the system',
    'ครบเวลา 60 นาทีแล้ว ระบบปิดการทำข้อสอบและส่งคำตอบของคุณเข้าสู่ระบบให้อัตโนมัติ (แม้จะยังตอบไม่ครบทุกข้อ)':
      'The 60-minute time limit has been reached. The system has closed the exam and automatically submitted your answers (even if not all questions were answered).',
    'คุณสลับหน้าจอ/แท็บหลังจากได้รับคำเตือนแล้ว ระบบจึงปิดการทำข้อสอบและส่งคำตอบที่มีอยู่ให้อัตโนมัติ':
      'You switched screens/tabs after receiving a warning, so the system closed the exam and automatically submitted your existing answers.',
    'ข้อสอบชุดนี้ส่งเรียบร้อยแล้ว': 'This exam has already been submitted',
    'ตรวจพบว่าคำตอบของชุดนี้ถูกส่งจากอุปกรณ์อื่นแล้ว ระบบจึงปิดข้อสอบบนเครื่องนี้และล้างร่างที่ค้างไว้ให้เรียบร้อย':
      'It was detected that the answers for this exam were already submitted from another device, so this device\'s exam has been closed and the pending draft cleared.',
    'กรุณาตอบให้ครบทุกข้อก่อนส่งคำตอบ กำลังพาไปยังข้อที่ยังไม่ได้ตอบ...': 'Please answer all questions before submitting. Taking you to the unanswered question...',
    'ตรวจพบการออกจากโหมดเต็มจอ กรุณากลับเข้าสู่โหมดเต็มจอเพื่อทำข้อสอบต่อ': 'Fullscreen exit detected. Please return to fullscreen mode to continue the exam.',
    'คุณได้ทำข้อสอบวิชานี้ไปแล้ว ไม่สามารถทำซ้ำได้': 'You have already taken this exam and cannot retake it',
    'กู้คืนคำตอบที่บันทึกไว้จากเซิร์ฟเวอร์แล้ว': 'Restored saved answers from the server',
    'ข้อสอบชุดนี้ส่งจากอุปกรณ์อื่นเรียบร้อยแล้ว กำลังปิดข้อสอบบนเครื่องนี้': 'This exam was already submitted from another device. Closing the exam on this device.',
    'ยกเลิกคำตอบข้อนี้': 'Clear this answer',
    'รหัสนักเรียนนี้ได้ทำข้อสอบวิชานี้ไปแล้ว ระบบไม่รับคำตอบซ้ำ': 'This student ID has already taken this exam. The system does not accept duplicate submissions.',
    'ส่งข้อสอบไม่สำเร็จ: ': 'Failed to submit exam: ',
    'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่': 'Please check your internet connection and try again',
  };

  var lang = 'th';
  try { lang = localStorage.getItem(LANG_KEY) || 'th'; } catch (e) {}

  function t(str) {
    if (lang === 'th') return str;
    return DICT[str] !== undefined ? DICT[str] : str;
  }

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.innerHTML = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = lang;
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }

  function setLang(l) {
    lang = l === 'en' ? 'en' : 'th';
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyTranslations();
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
    document.dispatchEvent(new CustomEvent('i18nchange', { detail: { lang: lang } }));
  }

  function toggleLang() { setLang(lang === 'th' ? 'en' : 'th'); }

  function initLangToggle(btnId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    function render() { btn.textContent = lang === 'th' ? '🌐 EN' : '🌐 TH'; }
    render();
    btn.addEventListener('click', function () { toggleLang(); render(); });
    onChange(render);
  }

  global.I18N = {
    t: t,
    getLang: function () { return lang; },
    setLang: setLang,
    toggleLang: toggleLang,
    apply: applyTranslations,
    onChange: onChange,
    initLangToggle: initLangToggle
  };

  document.addEventListener('DOMContentLoaded', function () {
    applyTranslations();
    document.querySelectorAll('.lang-toggle').forEach(function (btn) {
      function render() { btn.textContent = lang === 'th' ? '🌐 EN' : '🌐 TH'; }
      render();
      btn.addEventListener('click', function () { toggleLang(); render(); });
      onChange(render);
    });
  });
})(window);
