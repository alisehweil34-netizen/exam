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
/* ---------- هوية الجهاز (تُخزَّن في 3 أماكن حتى لا يكفي مسح واحد منها) ----------
   معرّف الطالب = معرّف الجهاز/المتصفح، وهو مفتاح المحاولة (امتحان + معرّف).
   لذلك لا يفيد تغيير الاسم في الدخول مرة ثانية بعد التسليم. */
const DEVICE_COOKIE = "exam_device_id";

function _cookieGet(name) {
  try {
    const row = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
    return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
  } catch { return null; }
}
function _cookieSet(name, value) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${60 * 60 * 24 * 365 * 3}; path=/; SameSite=Lax`;
  } catch {}
}
function _idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("no-idb"));
    const req = indexedDB.open("exam_device_db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function _withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((res) => setTimeout(() => res(null), ms))]);
}
async function _idbGet(key) {
  try {
    const d = await _idbOpen();
    return await new Promise((res) => {
      const r = d.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}
async function _idbSet(key, val) {
  try {
    const d = await _idbOpen();
    await new Promise((res) => {
      const tx = d.transaction("kv", "readwrite");
      tx.objectStore("kv").put(val, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => res();
    });
  } catch {}
}

async function ensureStudentSession() {
  let uid = null;
  try { uid = localStorage.getItem(STUDENT_SESSION_KEY); } catch {}
  if (!uid) uid = _cookieGet(DEVICE_COOKIE);
  if (!uid) uid = await _withTimeout(_idbGet(STUDENT_SESSION_KEY), 1500);
  if (!uid) uid = "student-" + simpleId();
  // أعد كتابة المعرّف في كل الأماكن (يستعيد ما تم مسحه منها)
  try { localStorage.setItem(STUDENT_SESSION_KEY, uid); } catch {}
  _cookieSet(DEVICE_COOKIE, uid);
  await _withTimeout(_idbSet(STUDENT_SESSION_KEY, uid), 1500);
  auth.currentUser = { uid, isAnonymous: true };
  return { uid, isAnonymous: true };
}
function upsertStudentProfile(uid, fullName) {
  return db.collection(COLLECTIONS.STUDENTS).doc(uid).set({ fullName, lastSeenAt: serverTimestamp() }, {merge:true});
}
function guardStudentSession() { return ensureStudentSession(); }
