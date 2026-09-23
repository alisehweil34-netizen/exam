/**
 * auth.js
 * دخول الأستاذ محليًا (لا يتم التحقق من اسم المستخدم/كلمة المرور عبر
 * Firebase Authentication). يبقى Firebase/Firestore مستخدمًا للطلاب
 * والامتحانات، وتُنشأ جلسة Anonymous تقنية للأستاذ حتى تستمر قواعد
 * Firestore في العمل.
 */

const LOCAL_TEACHER_USERNAME = "Masterpiecemwe@gmail.com";
const LOCAL_TEACHER_PASSWORD = "13579Mwe2468";
const LOCAL_TEACHER_NAME = "الأستاذ";
const LOCAL_TEACHER_KEY = "teacher-local-v1-13579Mwe2468";

async function teacherLogin(username, password) {
  if (username.trim().toLowerCase() !== LOCAL_TEACHER_USERNAME.toLowerCase() || password !== LOCAL_TEACHER_PASSWORD) {
    throw { code: "auth/invalid-credential", message: "اسم المستخدم أو كلمة المرور غير صحيحة." };
  }

  // Firebase ليس مسؤولًا عن تسجيل دخول الأستاذ؛ هذه الجلسة المجهولة
  // تستخدم فقط للحصول على uid يمكن لقواعد Firestore ربطه بمستند الأستاذ.
  let cred;
  try {
    cred = auth.currentUser ? { user: auth.currentUser } : await auth.signInAnonymously();
  } catch (err) {
    // تسجيل الأستاذ محلي، لكن Firestore يحتاج هوية Firebase تقنية لحماية البيانات.
    // إذا كان Anonymous Authentication غير مفعّل، أظهر رسالة واضحة بدل رسالة صلاحيات عامة.
    if (err?.code === "auth/operation-not-allowed" || err?.code === "auth/admin-restricted-operation") {
      throw {
        code: "auth/anonymous-disabled",
        message: "تسجيل الأستاذ محليًا جاهز، لكن يجب تفعيل Anonymous Authentication في Firebase Console حتى تتمكن لوحة الأستاذ من الوصول الآمن إلى الامتحانات."
      };
    }
    throw err;
  }
  const uid = cred.user.uid;

  await db.collection(COLLECTIONS.TEACHERS).doc(uid).set({
    name: LOCAL_TEACHER_NAME,
    email: LOCAL_TEACHER_USERNAME,
    role: "teacher",
    localAuth: true,
    localAuthKey: LOCAL_TEACHER_KEY,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  localStorage.setItem("teacher_local_session", "1");
  localStorage.setItem("teacher_local_uid", uid);
  return { uid, name: LOCAL_TEACHER_NAME, email: LOCAL_TEACHER_USERNAME };
}

async function teacherLogout() {
  localStorage.removeItem("teacher_local_session");
  localStorage.removeItem("teacher_local_uid");
  try { await auth.signOut(); } catch (_) {}
  window.location.href = "teacher-login.html";
}

async function changeTeacherDisplayName(newName) {
  const uid = localStorage.getItem("teacher_local_uid");
  if (!uid || localStorage.getItem("teacher_local_session") !== "1") throw new Error("لا توجد جلسة أستاذ نشطة.");
  await db.collection(COLLECTIONS.TEACHERS).doc(uid).update({ name: newName });
}

async function changeTeacherPassword() {
  throw { code: "auth/local-password-change-disabled", message: "كلمة مرور الأستاذ محددة من إعدادات الموقع." };
}

function guardTeacherPage(onReady) {
  if (localStorage.getItem("teacher_local_session") !== "1") {
    window.location.href = "teacher-login.html";
    return;
  }

  const storedUid = localStorage.getItem("teacher_local_uid");
  const continueWithTeacher = async () => {
    try {
      let user = auth.currentUser;
      if (!user) {
        try {
          user = (await auth.signInAnonymously()).user;
        } catch (err) {
          console.error("Anonymous Authentication is required for the teacher dashboard:", err);
          window.location.href = "teacher-login.html?setup=anonymous";
          return;
        }
      }
      if (storedUid && user.uid !== storedUid) {
        localStorage.removeItem("teacher_local_session");
        localStorage.removeItem("teacher_local_uid");
        window.location.href = "teacher-login.html";
        return;
      }
      const uid = user.uid;
      localStorage.setItem("teacher_local_uid", uid);
      const doc = await db.collection(COLLECTIONS.TEACHERS).doc(uid).get();
      if (!doc.exists || doc.data().localAuth !== true) {
        localStorage.removeItem("teacher_local_session");
        window.location.href = "teacher-login.html";
        return;
      }
      onReady({ uid, ...doc.data() });
    } catch (err) {
      console.error(err);
      localStorage.removeItem("teacher_local_session");
      localStorage.removeItem("teacher_local_uid");
      window.location.href = "teacher-login.html";
    }
  };

  continueWithTeacher();
}

/* ============================ الطالب ============================ */
async function ensureStudentSession() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await auth.signInAnonymously();
  return cred.user;
}

async function upsertStudentProfile(uid, fullName) {
  await db.collection(COLLECTIONS.STUDENTS).doc(uid).set(
    { fullName, lastSeenAt: serverTimestamp() },
    { merge: true }
  );
}

async function guardStudentSession() {
  await ensureStudentSession();
  return auth.currentUser;
}
