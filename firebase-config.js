/**
 * =============================================================
 *  إعدادات Firebase — يجب تعديل هذا الملف قبل تشغيل المشروع
 * =============================================================
 *
 * كيف تحصل على هذه البيانات:
 * 1) اذهب إلى https://console.firebase.google.com
 * 2) أنشئ مشروعًا جديدًا (Add project)
 * 3) من داخل المشروع: Project settings > General > Your apps > Add app (Web)
 * 4) انسخ القيم الظاهرة والصقها مكان القيم أدناه.
 *
 * ملاحظة أمنية مهمة:
 * "apiKey" الخاص بـ Firebase Web ليس كلمة سر سرّية، وهو مصمم أصلًا
 * ليكون ظاهرًا داخل كود الواجهة الأمامية (Frontend). لهذا لا يشكّل
 * وجوده في هذا الملف أي خطر بحد ذاته. الحماية الحقيقية للبيانات
 * تأتي من:
 *   - Firebase Authentication (تحديد هوية المستخدم بشكل موثوق)
 *   - Firebase Security Rules (تحديد من يملك صلاحية القراءة/الكتابة)
 * لذلك لا تحاول "إخفاء" هذا الملف أو تشفيره — بل ركّز على كتابة
 * قواعد أمان صارمة (راجع firestore.rules في جذر المشروع).
 */

const firebaseConfig = {
  apiKey: "AIzaSyBUe2en1Z4IQ_dQ8O8BWxBR3UtiQrwFAP4",
  authDomain: "aaaaaaaa-c48f5.firebaseapp.com",
  projectId: "aaaaaaaa-c48f5",
  storageBucket: "aaaaaaaa-c48f5.firebasestorage.app",
  messagingSenderId: "653616188433",
  appId: "1:653616188433:web:17ccc8c0f3c23807c235b0",
};

// تهيئة Firebase (يستخدم Firebase SDK عبر CDN بصيغة compat لسهولة
// الاستخدام في مشروع ثابت بدون أدوات بناء / بدون Node.js كخادم)
firebase.initializeApp(firebaseConfig);

// عناصر يعاد استخدامها في كل ملفات JavaScript الأخرى
const auth = firebase.auth();
const db = firebase.firestore();

// اسم Collection ثابت لتسهيل القراءة (اختياري لكنه يسهل الصيانة)
const COLLECTIONS = {
  TEACHERS: "teachers",
  STUDENTS: "students",
  EXAMS: "exams",
  QUESTIONS: "questions",
  ANSWER_KEYS: "answerKeys",
  ATTEMPTS: "attempts",
  ANSWERS: "answers",
  VIOLATIONS: "violations",
};

// تفعيل تخزين محلي (Persistence) حتى تبقى جلسة الطالب/الأستاذ
// موجودة بعد تحديث الصفحة (لكن ليست موجودة بعد مسح بيانات المتصفح)
firebase.firestore().enablePersistence?.().catch(() => {
  /* المتصفح قد لا يدعم Persistence في بعض الحالات، لا مشكلة، سنكمل بدونه */
});
