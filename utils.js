/**
 * دوال مساعدة عامة تُستخدم في أكثر من صفحة.
 * يجب تحميل هذا الملف بعد firebase-config.js وقبل باقي ملفات الصفحة.
 */

/** يعرض رسالة تنبيه داخل عنصر معيّن (success | error | warn | info) */
function showAlert(containerEl, message, type = "info") {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  const box = document.createElement("div");
  box.className = `alert alert-${type}`;
  box.textContent = message;
  containerEl.appendChild(box);
  containerEl.classList.remove("hidden");
}

function clearAlert(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  containerEl.classList.add("hidden");
}

/** يترجم رسائل أخطاء Firebase الشائعة إلى نص عربي مفهوم */
function translateFirebaseError(error) {
  const code = error && error.code ? error.code : "";
  const map = {
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/user-disabled": "تم تعطيل هذا الحساب.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة.",
    "auth/too-many-requests": "محاولات كثيرة خاطئة، يرجى المحاولة لاحقًا.",
    "auth/network-request-failed": "تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت.",
    "auth/requires-recent-login": "لأسباب أمنية، يرجى تسجيل الخروج والدخول مجددًا قبل تنفيذ هذا الإجراء.",
    "auth/weak-password": "كلمة المرور ضعيفة جدًا، اختر كلمة مرور أقوى (6 أحرف على الأقل).",
    "auth/anonymous-disabled": "تسجيل الأستاذ محلي، لكن يجب تفعيل Anonymous Authentication في Firebase Console حتى تعمل لوحة الأستاذ مع قاعدة بيانات الامتحانات.",
    "auth/operation-not-allowed": "يجب تفعيل Anonymous Authentication في Firebase Console حتى تعمل لوحة الأستاذ.",
    "auth/admin-restricted-operation": "يجب تفعيل Anonymous Authentication في Firebase Console حتى تعمل لوحة الأستاذ.",
    "permission-denied": "ليست لديك صلاحية لتنفيذ هذا الإجراء. تأكد من نشر firestore.rules وتفعيل Anonymous Authentication.",
    unavailable: "تعذر الاتصال بقاعدة البيانات، تحقق من اتصال الإنترنت.",
  };
  return map[code] || error?.message || "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.";
}

/** تنسيق Firestore Timestamp أو Date إلى نص عربي مقروء */
function formatDateTime(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** يحوّل ثواني إلى صيغة MM:SS أو HH:MM:SS */
function formatCountdown(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/** تطهير بسيط للنص قبل إدراجه في HTML لمنع XSS عند استخدام innerHTML */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** توحيد اسم الطالب لأغراض المقارنة (إزالة المسافات الزائدة والتطويل) */
function normalizeName(name) {
  return (name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0640]/g, "") // إزالة حرف التطويل
    .toLowerCase();
}

/** يولّد معرّفًا فريدًا بسيطًا (يُستخدم لبعض المعرّفات غير الحساسة) */
function simpleId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** يعطّل عمليات النسخ/اللصق/القائمة اليمنى/التحديد داخل صفحة الامتحان
 *  تنبيه: هذه إجراءات تجميلية فقط ولا تمنع غشًا حقيقيًا، فالمتصفح
 *  لا يمنح أي موقع سيطرة كاملة على جهاز المستخدم. الحماية الحقيقية
 *  تكون عبر تصميم قاعدة البيانات وقواعد الأمان.
 */
function applyAntiCheatUiRestrictions(rootEl) {
  const target = rootEl || document;
  target.addEventListener("contextmenu", (e) => e.preventDefault());
  target.addEventListener("copy", (e) => e.preventDefault());
  target.addEventListener("cut", (e) => e.preventDefault());
  target.addEventListener("paste", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    const blockedCombos =
      (e.ctrlKey || e.metaKey) && ["c", "x", "v", "p", "u", "s"].includes(e.key.toLowerCase());
    const devTools = e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase()));
    if (blockedCombos || devTools) e.preventDefault();
  });
  document.body.classList.add("no-select");
}

/** يبني عنصر Timestamp من Firestore بأمان (server) */
function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

/**
 * يتحقق أن الامتحان منشور وأن الوقت الحالي داخل نافذة الامتحان.
 * تُستخدم في أكثر من صفحة (دخول الطالب وصفحة الامتحان نفسها) كفحص أولي
 * لتحسين تجربة المستخدم — الفحص الحاسم والنهائي دائمًا هو قواعد الأمان
 * وقت إنشاء المحاولة الفعلية.
 */
function validateExamWindow(exam) {
  if (exam.status === "draft") {
    return { ok: false, message: "هذا الامتحان غير منشور بعد، يرجى مراجعة الأستاذ." };
  }
  if (exam.status === "closed") {
    return { ok: false, message: "تم إغلاق هذا الامتحان من قبل الأستاذ." };
  }
  const now = Date.now();
  const start = exam.startAt?.toDate ? exam.startAt.toDate().getTime() : new Date(exam.startAt).getTime();
  const end = exam.endAt?.toDate ? exam.endAt.toDate().getTime() : new Date(exam.endAt).getTime();
  if (now < start) {
    return { ok: false, message: `لم يبدأ الامتحان بعد. موعد البدء: ${formatDateTime(exam.startAt)}` };
  }
  if (now > end) {
    return { ok: false, message: "انتهى الوقت المخصص لهذا الامتحان." };
  }
  return { ok: true };
}
