/**
 * auth.js
 * يدير هذا الملف:
 *  - تسجيل دخول/خروج الأستاذ (Firebase Authentication بالبريد وكلمة المرور)
 *  - إنشاء جلسة مجهولة للطالب (Firebase Anonymous Authentication) لتوليد
 *    هوية (uid) موثوقة يمكن لقواعد الأمان الاعتماد عليها، بدل الاعتماد
 *    على الاسم فقط.
 *  - دوال حراسة الصفحات (Route Guards) تمنع الوصول غير المصرح به حتى
 *    لو كتب المستخدم الرابط يدويًا.
 */

/* ============================ الأستاذ ============================ */

/** تسجيل دخول الأستاذ بالبريد الإلكتروني وكلمة المرور */
async function teacherLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  // تحقق أن هذا المستخدم مسجّل فعليًا كأستاذ في قاعدة البيانات،
  // وإلا نرفض اعتباره أستاذًا حتى لو نجح تسجيل الدخول في Authentication.
  const doc = await db.collection(COLLECTIONS.TEACHERS).doc(cred.user.uid).get();
  if (!doc.exists) {
    await auth.signOut();
    throw { code: "auth/not-a-teacher", message: "هذا الحساب غير مسجّل كحساب أستاذ." };
  }
  return { uid: cred.user.uid, ...doc.data() };
}

async function teacherLogout() {
  await auth.signOut();
  window.location.href = "teacher-login.html";
}

/** تغيير اسم العرض الخاص بالأستاذ (يُحفظ في مستند teachers) */
async function changeTeacherDisplayName(newName) {
  const user = auth.currentUser;
  if (!user) throw new Error("لا توجد جلسة أستاذ نشطة.");
  await db.collection(COLLECTIONS.TEACHERS).doc(user.uid).update({ name: newName });
  await user.updateProfile({ displayName: newName });
}

/**
 * تغيير كلمة مرور الأستاذ بطريقة آمنة:
 * يجب إعادة التحقق من الهوية (Re-authenticate) بكلمة المرور الحالية
 * قبل السماح بتغييرها، وهذا ما توفره واجهة Firebase Authentication.
 */
async function changeTeacherPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("لا توجد جلسة أستاذ نشطة.");
  const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
  await user.reauthenticateWithCredential(credential);
  await user.updatePassword(newPassword);
}

/**
 * حارس صفحات الأستاذ: يُستدعى في أعلى كل صفحة خاصة بالأستاذ.
 * لا يعتمد فقط على هذا التحقق في الواجهة الأمامية — فحتى لو تجاوزه
 * مستخدم عبر Developer Tools، فإن Firebase Security Rules ستمنعه من
 * قراءة/كتابة أي بيانات فعلية خاصة بالأستاذ (راجع firestore.rules).
 * @param {(teacher:{uid:string,name:string,email:string}) => void} onReady
 */
function guardTeacherPage(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user || user.isAnonymous) {
      window.location.href = "teacher-login.html";
      return;
    }
    try {
      const doc = await db.collection(COLLECTIONS.TEACHERS).doc(user.uid).get();
      if (!doc.exists) {
        // هذا المستخدم موثّق في Authentication لكنه ليس أستاذًا مسجّلًا
        await auth.signOut();
        window.location.href = "teacher-login.html";
        return;
      }
      onReady({ uid: user.uid, ...doc.data() });
    } catch (err) {
      console.error(err);
      window.location.href = "teacher-login.html";
    }
  });
}

/* ============================ الطالب ============================ */

/**
 * يضمن وجود جلسة Firebase مجهولة (Anonymous) للطالب في هذا المتصفح.
 * هذه الجلسة تبقى محفوظة بعد تحديث الصفحة، وتمنح الطالب uid ثابتًا
 * تعتمد عليه قواعد الأمان لمنع إنشاء أكثر من محاولة واحدة لكل امتحان.
 *
 * ملاحظة مهمة (حدود النظام): إذا مسح الطالب بيانات المتصفح، أو استخدم
 * متصفحًا/جهازًا آخر، فسيحصل على uid جديد. الاسم الرباعي وحده ليس كافيًا
 * كوسيلة أمان، ولا يمكن لموقع ثابت بدون كلمات مرور للطلاب منع هذا
 * السيناريو بشكل مطلق. لتخفيف الأثر، يقوم النظام أيضًا بفحص توعوي
 * (وليس أمنيًا) للاسم المكرر قبل إنشاء محاولة جديدة (انظر student.js).
 */
async function ensureStudentSession() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await auth.signInAnonymously();
  return cred.user;
}

/** يحفظ/يحدّث بيانات الطالب الأساسية (اسمه) المرتبطة بـ uid الحالي */
async function upsertStudentProfile(uid, fullName) {
  await db.collection(COLLECTIONS.STUDENTS).doc(uid).set(
    {
      fullName,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * حارس صفحة الامتحان: يتأكد من وجود جلسة طالب (Anonymous) قبل تنفيذ
 * أي عملية. لا يفرّق هذا وحده بين طالب وآخر — الفرق الحقيقي في الصلاحيات
 * يأتي من مطابقة uid داخل مستندات المحاولة (attempts) عبر قواعد الأمان.
 */
async function guardStudentSession() {
  await ensureStudentSession();
  return auth.currentUser;
}
