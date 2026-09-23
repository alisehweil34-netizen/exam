/* Local authentication and route guards. No external authentication service. */
const TEACHER_USERNAME = "Masterpiecemwe@gmail.com";
const TEACHER_DEFAULT_PASSWORD = "13579Mwe2468";
const TEACHER_SESSION_KEY = "exam_teacher_session";
const STUDENT_SESSION_KEY = "exam_student_session";

function getTeacherRecord() {
  const saved = localStorage.getItem("exam_teacher_record");
  if (saved) {
    try { return JSON.parse(saved); } catch {}
  }
  const record = { uid: "teacher-local-1", email: TEACHER_USERNAME, name: "الأستاذ", password: TEACHER_DEFAULT_PASSWORD };
  localStorage.setItem("exam_teacher_record", JSON.stringify(record));
  return record;
}
const auth = {
  currentUser: null,
  onAuthStateChanged(callback) {
    const uid = localStorage.getItem(TEACHER_SESSION_KEY);
    const studentUid = localStorage.getItem(STUDENT_SESSION_KEY);
    if (uid === "1") {
      const record = getTeacherRecord();
      this.currentUser = { uid: record.uid, email: record.email, isAnonymous: false };
    } else if (studentUid) {
      this.currentUser = { uid: studentUid, isAnonymous: true };
    } else {
      this.currentUser = null;
    }
    if (typeof callback === "function") callback(this.currentUser);
    return () => {};
  }
};

function teacherLogin(username, password) {
  const record = getTeacherRecord();
  if (username.trim().toLowerCase() !== record.email.toLowerCase() || password !== record.password) {
    throw { code: "auth/wrong-password", message: "اسم المستخدم أو كلمة المرور غير صحيحة." };
  }
  localStorage.setItem(TEACHER_SESSION_KEY, "1");
  auth.currentUser = { uid: record.uid, email: record.email, isAnonymous: false };
  return { uid: record.uid, email: record.email, name: record.name };
}
function teacherLogout() {
  localStorage.removeItem(TEACHER_SESSION_KEY);
  window.location.href = "teacher-login.html";
}
function changeTeacherDisplayName(newName) {
  const record = getTeacherRecord();
  record.name = newName;
  localStorage.setItem("exam_teacher_record", JSON.stringify(record));
}
function changeTeacherPassword(currentPassword, newPassword) {
  const record = getTeacherRecord();
  if (record.password !== currentPassword) throw { code: "auth/wrong-password", message: "كلمة المرور الحالية غير صحيحة." };
  record.password = newPassword;
  localStorage.setItem("exam_teacher_record", JSON.stringify(record));
}
function guardTeacherPage(onReady) {
  if (localStorage.getItem(TEACHER_SESSION_KEY) !== "1") {
    window.location.href = "teacher-login.html";
    return;
  }
  const record = getTeacherRecord();
  onReady({ uid: record.uid, email: record.email, name: record.name });
}
function ensureStudentSession() {
  let uid = localStorage.getItem(STUDENT_SESSION_KEY);
  if (!uid) {
    uid = "student-" + simpleId();
    localStorage.setItem(STUDENT_SESSION_KEY, uid);
  }
  auth.currentUser = { uid, isAnonymous: true };
  return { uid, isAnonymous: true };
}
function upsertStudentProfile(uid, fullName) {
  return db.collection(COLLECTIONS.STUDENTS).doc(uid).set({ fullName, lastSeenAt: serverTimestamp() }, {merge:true});
}
function guardStudentSession() { return ensureStudentSession(); }
