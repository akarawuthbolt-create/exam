const { programForClassRoom, levelForClassRoom } = require('../class-programs');

function registerTeacherClassRoutes(app, { readDB, requireTeacher, getExamSchedule }) {
  app.get('/api/teacher/classes', requireTeacher, (req, res) => {
    const period=String(req.query.period||''); const classes = [...new Set(readDB().students.filter(student=>!period||(period==='unset'?!student.examPeriod:student.examPeriod===period)).map(student => student.classRoom))].sort();
    res.json(classes);
  });

  app.get('/api/teacher/students', requireTeacher, (req, res) => {
    const students = readDB().students.map(student => ({
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      classRoom: student.classRoom,
      examPeriod: student.examPeriod || ''
    })).sort((a, b) => String(a.classRoom).localeCompare(String(b.classRoom), 'th', { numeric: true }) || String(a.studentId).localeCompare(String(b.studentId), 'th', { numeric: true }));
    res.json(students);
  });

  app.get('/api/teacher/exam-roster', requireTeacher, (req, res) => {
    const setKey = String(req.query.setKey || '').trim();
    const classRoom = String(req.query.classRoom || '').trim();
    if (!setKey || !classRoom) return res.status(400).json({ error: 'validation_error', message: 'กรุณาเลือกชุดข้อสอบและห้องเรียน' });

    const db = readDB();
    const set = db.sets.find(item => item.key === setKey && item.teacherId === req.teacherId);
    if (!set) return res.status(404).json({ error: 'not_found', message: 'ไม่พบชุดข้อสอบนี้' });
    if (Array.isArray(set.assignedClasses) && set.assignedClasses.length && !set.assignedClasses.includes(classRoom)) {
      return res.status(403).json({ error: 'forbidden', message: 'ห้องนี้ไม่ได้รับมอบหมายให้ทำข้อสอบชุดนี้' });
    }

    const students = db.students
      .filter(student => student.classRoom === classRoom)
      .sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), 'th', { numeric: true }))
      .map((student, index) => ({
        number: index + 1,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        examPeriod: student.examPeriod || ''
      }));
    const schedule = typeof getExamSchedule === 'function' ? getExamSchedule(set, classRoom) : null;
    const forwardedProto = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host = req.get?.('host') || 'localhost';

    res.json({
      classRoom,
      program: programForClassRoom(classRoom),
      educationLevel: levelForClassRoom(classRoom).replace(/\.\d+$/, ''),
      examPeriod: students.find(student => student.examPeriod)?.examPeriod || '',
      exam: {
        key: set.key,
        title: set.title || '',
        courseName: set.courseName || set.title || '',
        examType: set.examType || '',
        academicYear: set.academicYear || '',
        semesterLabel: set.semesterLabel || '',
        teacherName: set.subjectTeacherName || '',
        availableFrom: schedule?.availableFrom || null,
        availableUntil: schedule?.availableUntil || null,
        examLink: `${protocol}://${host}/`
      },
      students
    });
  });
}

module.exports = { registerTeacherClassRoutes };
