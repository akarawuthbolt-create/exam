const { programForClassRoom, levelForClassRoom } = require('../class-programs');

function registerTeacherClassRoutes(app, { readDB, requireTeacher, getExamSchedule }) {
  const rosterStudents = (db, schedule, classRoom) => {
    const regular = db.students.filter(student => student.classRoom === classRoom).sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), 'th', { numeric: true }));
    const regularIds = new Set(regular.map(student => student.studentId));
    const additionalIds = new Set(Array.isArray(schedule?.studentIds) ? schedule.studentIds : []);
    const additional = db.students.filter(student => additionalIds.has(student.studentId) && !regularIds.has(student.studentId)).sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), 'th', { numeric: true }));
    return [...regular, ...additional].map(student => ({ ...student, additionalAccess: additionalIds.has(student.studentId) && !regularIds.has(student.studentId) }));
  };
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

    const schedule = typeof getExamSchedule === 'function' ? getExamSchedule(set, classRoom) : null;
    const students = rosterStudents(db, schedule, classRoom)
      .map((student, index) => ({
        number: index + 1,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        examPeriod: student.examPeriod || '',
        additionalAccess: student.additionalAccess
      }));
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

  app.get('/api/teacher/exam-absence-summary', requireTeacher, (req, res) => {
    const setKey = String(req.query.setKey || '').trim();
    const classRooms = String(req.query.classRooms || '').split(',').map(value => value.trim()).filter(Boolean);
    const db = readDB(); const set = db.sets.find(item => item.key === setKey && item.teacherId === req.teacherId);
    if (!set || !classRooms.length) return res.status(400).json({ error: 'validation_error', message: 'กรุณาเลือกชุดข้อสอบและห้องเรียน' });
    if (classRooms.some(room => Array.isArray(set.assignedClasses) && set.assignedClasses.length && !set.assignedClasses.includes(room))) return res.status(403).json({ error: 'forbidden' });
    const submittedIds = new Set(db.results.filter(row => row.questionKey === set.key && row.attemptType !== 'resit').map(row => row.studentId));
    const activeIds = new Set((db.drafts || []).filter(draft => draft.questionKey === set.key && new Date(draft.lockUntil || 0).getTime() > Date.now()).map(draft => draft.studentId));
    const seen = new Set(); const students = [];
    classRooms.forEach(classRoom => {
      const schedule = typeof getExamSchedule === 'function' ? getExamSchedule(set, classRoom) : null;
      const ended = !!schedule?.availableUntil && Date.now() > new Date(schedule.availableUntil).getTime();
      rosterStudents(db, schedule, classRoom).forEach(student => {
        if (seen.has(student.studentId)) return; seen.add(student.studentId);
        const status = submittedIds.has(student.studentId) ? 'submitted' : activeIds.has(student.studentId) ? 'in_progress' : ended ? 'absent' : 'pending';
        students.push({ studentId: student.studentId, firstName: student.firstName, lastName: student.lastName, classRoom: student.classRoom, rosterRoom: classRoom, additionalAccess: student.additionalAccess, status });
      });
    });
    const counts = Object.fromEntries(['submitted','in_progress','absent','pending'].map(status => [status, students.filter(student => student.status === status).length]));
    res.json({ setKey, title: set.courseName || set.title || '', total: students.length, counts, students });
  });
}

module.exports = { registerTeacherClassRoutes };
