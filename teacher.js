/**
 * teacher.js
 * يغطي هذا الملف صفحتين خاصتين بالأستاذ فقط (محميتين بـ guardTeacherPage):
 *   1) teacher-dashboard.html — الإحصاءات وقائمة الامتحانات وإعدادات الحساب
 *   2) create-exam.html      — إنشاء/تعديل امتحان وإدارة أسئلته والإجابة الصحيحة
 *
 * كل الوظائف هنا تفترض أن guardTeacherPage نجحت بالفعل، لكنها لا تعتمد
 * عليها وحدها كحماية: أي محاولة كتابة غير مصرّح بها سترفضها Firebase
 * Security Rules من جهة الخادم أيضًا.
 */

let currentTeacher = null;

guardTeacherPage((teacher) => {
  currentTeacher = teacher;
  const chip = document.getElementById("userChip");
  if (chip) chip.textContent = `${teacher.name || teacher.email} 👋`;

  if (document.getElementById("statGrid")) initDashboardPage();
  if (document.getElementById("examForm")) initCreateExamPage();
});

/* ======================================================================
   1) لوحة التحكم
   ====================================================================== */

async function initDashboardPage() {
  wireLogoutAndAccount();

  const tbody = document.getElementById("examsTbody");
  const alertBox = document.getElementById("alertBox");

  try {
    const examsSnap = await db
      .collection(COLLECTIONS.EXAMS)
      .where("teacherId", "==", currentTeacher.uid)
      .orderBy("createdAt", "desc")
      .get();

    const exams = examsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // نجلب عدد المحاولات لكل امتحان لعرضه في الجدول ولحساب الإحصاءات الكلية
    const studentUids = new Set();
    let totalAttempts = 0;
    for (const exam of exams) {
      const attemptsSnap = await db.collection(COLLECTIONS.ATTEMPTS).where("examId", "==", exam.id).get();
      exam.attemptsCount = attemptsSnap.size;
      attemptsSnap.forEach((d) => studentUids.add(d.data().studentUid));
      totalAttempts += attemptsSnap.size;
    }

    const now = Date.now();
    const isActive = (e) => e.status === "published" && now >= tsMs(e.startAt) && now <= tsMs(e.endAt);
    const isEnded = (e) => e.status === "closed" || now > tsMs(e.endAt);

    renderStats({
      total: exams.length,
      active: exams.filter(isActive).length,
      ended: exams.filter(isEnded).length,
      students: studentUids.size,
      attempts: totalAttempts,
    });

    if (exams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">لا توجد امتحانات بعد. ابدأ بإنشاء أول امتحان.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    exams.forEach((exam) => tbody.appendChild(buildExamRow(exam)));
  } catch (err) {
    console.error(err);
    showAlert(alertBox, translateFirebaseError(err), "error");
  }
}

function tsMs(v) {
  return v?.toDate ? v.toDate().getTime() : new Date(v).getTime();
}

function renderStats({ total, active, ended, students, attempts }) {
  const grid = document.getElementById("statGrid");
  const cards = grid.querySelectorAll(".stat-card .num");
  const values = [total, active, ended, students, attempts];
  cards.forEach((el, i) => (el.textContent = values[i] ?? "0"));
}

function statusBadge(status) {
  const map = { draft: ["مسودة", "draft"], published: ["منشور", "published"], closed: ["مغلق", "closed"] };
  const [label, cls] = map[status] || [status, "draft"];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function buildExamRow(exam) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${escapeHtml(exam.title)}</td>
    <td>${statusBadge(exam.status)}</td>
    <td class="ltr">${formatDateTime(exam.startAt)}</td>
    <td class="ltr">${formatDateTime(exam.endAt)}</td>
    <td>${exam.durationMinutes} د</td>
    <td>${exam.questionCount || 0}</td>
    <td>${exam.attemptsCount || 0}</td>
    <td>
      <div class="flex gap-8" style="flex-wrap:wrap;">
        <a class="btn btn-outline btn-sm" href="create-exam.html?exam=${exam.id}">تعديل / الأسئلة</a>
        <a class="btn btn-outline btn-sm" href="results.html?exam=${exam.id}">النتائج</a>
        ${exam.status !== "closed" ? `<button class="btn btn-warn btn-sm" data-action="close" data-id="${exam.id}">إغلاق</button>` : ""}
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${exam.id}" data-title="${escapeHtml(exam.title)}">حذف</button>
      </div>
    </td>
  `;
  tr.querySelector('[data-action="close"]')?.addEventListener("click", () => confirmCloseExam(exam.id));
  tr.querySelector('[data-action="delete"]')?.addEventListener("click", () => confirmDeleteExam(exam.id, exam.title));
  return tr;
}

function confirmCloseExam(examId) {
  openConfirm("إغلاق الامتحان", "لن يتمكن أي طالب من الدخول لهذا الامتحان بعد إغلاقه. هل تريد المتابعة؟", async () => {
    await db.collection(COLLECTIONS.EXAMS).doc(examId).update({ status: "closed" });
    location.reload();
  });
}

function confirmDeleteExam(examId, title) {
  openConfirm(
    "حذف الامتحان نهائيًا",
    `سيتم حذف الامتحان "${title}" وجميع أسئلته ومحاولات الطلاب والنتائج المرتبطة به نهائيًا. هذا الإجراء لا يمكن التراجع عنه.`,
    async () => {
      await deleteExamCascade(examId);
      location.reload();
    }
  );
}

async function deleteExamCascade(examId) {
  const collectionsToClean = [
    { name: COLLECTIONS.QUESTIONS, field: "examId" },
    { name: COLLECTIONS.ATTEMPTS, field: "examId" },
    { name: COLLECTIONS.ANSWERS, field: "examId" },
    { name: COLLECTIONS.VIOLATIONS, field: "examId" },
  ];
  for (const col of collectionsToClean) {
    const snap = await db.collection(col.name).where(col.field, "==", examId).get();
    await batchDelete(snap.docs.map((d) => d.ref));
    if (col.name === COLLECTIONS.QUESTIONS) {
      // نحذف أيضًا مفاتيح الإجابة المرتبطة بنفس معرّفات الأسئلة
      const keyRefs = snap.docs.map((d) => db.collection(COLLECTIONS.ANSWER_KEYS).doc(d.id));
      await batchDelete(keyRefs);
    }
  }
  await db.collection(COLLECTIONS.EXAMS).doc(examId).delete();
}

async function batchDelete(refs) {
  const chunkSize = 400;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const batch = db.batch();
    refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function openConfirm(title, message, onConfirm) {
  const modal = document.getElementById("confirmModal");
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  modal.classList.remove("hidden");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  const newOk = okBtn.cloneNode(true); // لإزالة أي مستمعين سابقين
  okBtn.parentNode.replaceChild(newOk, okBtn);
  newOk.addEventListener("click", async () => {
    newOk.disabled = true;
    newOk.textContent = "جاري التنفيذ...";
    try {
      await onConfirm();
    } catch (err) {
      console.error(err);
      alert(translateFirebaseError(err));
      modal.classList.add("hidden");
    }
  });
  cancelBtn.onclick = () => modal.classList.add("hidden");
}

function wireLogoutAndAccount() {
  const logoutLink = document.getElementById("logoutLink");
  logoutLink?.addEventListener("click", (e) => {
    e.preventDefault();
    teacherLogout();
  });

  const accountLink = document.getElementById("accountLink");
  const accountModal = document.getElementById("accountModal");
  if (!accountLink || !accountModal) return;

  accountLink.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("displayNameInput").value = currentTeacher.name || "";
    clearAlert(document.getElementById("accountAlert"));
    accountModal.classList.remove("hidden");
  });
  document.getElementById("closeAccountModal").addEventListener("click", () => accountModal.classList.add("hidden"));

  document.getElementById("saveNameBtn").addEventListener("click", async () => {
    const alertEl = document.getElementById("accountAlert");
    const newName = document.getElementById("displayNameInput").value.trim();
    if (!newName) return showAlert(alertEl, "يرجى إدخال اسم صالح.", "error");
    try {
      await changeTeacherDisplayName(newName);
      currentTeacher.name = newName;
      document.getElementById("userChip").textContent = `${newName} 👋`;
      showAlert(alertEl, "تم تحديث الاسم بنجاح.", "success");
    } catch (err) {
      showAlert(alertEl, translateFirebaseError(err), "error");
    }
  });

  document.getElementById("savePasswordBtn").addEventListener("click", async () => {
    const alertEl = document.getElementById("accountAlert");
    const current = document.getElementById("currentPasswordInput").value;
    const next = document.getElementById("newPasswordInput").value;
    if (!current || !next) return showAlert(alertEl, "يرجى تعبئة كلمة المرور الحالية والجديدة.", "error");
    if (next.length < 6) return showAlert(alertEl, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.", "error");
    try {
      await changeTeacherPassword(current, next);
      showAlert(alertEl, "تم تغيير كلمة المرور بنجاح.", "success");
      document.getElementById("currentPasswordInput").value = "";
      document.getElementById("newPasswordInput").value = "";
    } catch (err) {
      showAlert(alertEl, translateFirebaseError(err), "error");
    }
  });
}

/* ======================================================================
   2) إنشاء / تعديل امتحان + إدارة الأسئلة
   ====================================================================== */

let examCtx = {
  examId: null,
  exam: null,
  questions: [],
};

async function initCreateExamPage() {
  const params = new URLSearchParams(window.location.search);
  examCtx.examId = params.get("exam");
  const alertBox = document.getElementById("alertBox");

  if (examCtx.examId) {
    document.getElementById("pageTitle").textContent = "تعديل الامتحان وإدارة أسئلته";
    try {
      const doc = await db.collection(COLLECTIONS.EXAMS).doc(examCtx.examId).get();
      if (!doc.exists || doc.data().teacherId !== currentTeacher.uid) {
        showAlert(alertBox, "لا تملك صلاحية الوصول لهذا الامتحان.", "error");
        document.getElementById("examForm").classList.add("hidden");
        return;
      }
      examCtx.exam = doc.data();
      fillExamForm(examCtx.exam);
      document.getElementById("questionsSection").classList.remove("hidden");
      await loadQuestions();
    } catch (err) {
      showAlert(alertBox, translateFirebaseError(err), "error");
    }
  }

  wireExamForm();
  wireQuestionModal();
}

function toLocalInputValue(tsOrDate) {
  const date = tsOrDate?.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fillExamForm(exam) {
  document.getElementById("title").value = exam.title;
  document.getElementById("description").value = exam.description || "";
  document.getElementById("examCode").value = exam.examCode;
  document.getElementById("status").value = exam.status;
  document.getElementById("startAt").value = toLocalInputValue(exam.startAt);
  document.getElementById("endAt").value = toLocalInputValue(exam.endAt);
  document.getElementById("durationMinutes").value = exam.durationMinutes;
  document.getElementById("questionCountDisplay").value = exam.questionCount || 0;
  document.getElementById("allowShowAnswers").checked = !!exam.allowShowAnswers;
}

function wireExamForm() {
  const form = document.getElementById("examForm");
  const alertBox = document.getElementById("alertBox");
  const saveBtn = document.getElementById("saveExamBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert(alertBox);

    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const examCode = document.getElementById("examCode").value.trim().toUpperCase();
    const status = document.getElementById("status").value;
    const startAtStr = document.getElementById("startAt").value;
    const endAtStr = document.getElementById("endAt").value;
    const durationMinutes = Number(document.getElementById("durationMinutes").value);
    const allowShowAnswers = document.getElementById("allowShowAnswers").checked;

    if (!title || !examCode || !startAtStr || !endAtStr || !durationMinutes) {
      showAlert(alertBox, "يرجى تعبئة جميع الحقول المطلوبة.", "error");
      return;
    }
    const startAt = new Date(startAtStr);
    const endAt = new Date(endAtStr);
    if (endAt <= startAt) {
      showAlert(alertBox, "يجب أن يكون وقت النهاية بعد وقت البداية.", "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "جاري الحفظ...";

    try {
      // تأكد أن رمز الامتحان غير مستخدم من امتحان آخر لنفس الأستاذ أو غيره
      const dupSnap = await db.collection(COLLECTIONS.EXAMS).where("examCode", "==", examCode).limit(2).get();
      const conflict = dupSnap.docs.find((d) => d.id !== examCtx.examId);
      if (conflict) {
        showAlert(alertBox, "رمز الامتحان هذا مستخدم من قبل، اختر رمزًا آخر.", "error");
        saveBtn.disabled = false;
        saveBtn.textContent = "حفظ بيانات الامتحان";
        return;
      }

      const payload = {
        title,
        description,
        examCode,
        status,
        startAt: firebase.firestore.Timestamp.fromDate(startAt),
        endAt: firebase.firestore.Timestamp.fromDate(endAt),
        durationMinutes,
        allowShowAnswers,
        teacherId: currentTeacher.uid,
      };

      if (examCtx.examId) {
        await db.collection(COLLECTIONS.EXAMS).doc(examCtx.examId).update(payload);
        showAlert(alertBox, "تم حفظ التعديلات بنجاح.", "success");
      } else {
        payload.createdAt = serverTimestamp();
        payload.questionCount = 0;
        const ref = await db.collection(COLLECTIONS.EXAMS).add(payload);
        window.location.href = `create-exam.html?exam=${ref.id}`;
        return;
      }
      saveBtn.disabled = false;
      saveBtn.textContent = "حفظ بيانات الامتحان";
    } catch (err) {
      console.error(err);
      showAlert(alertBox, translateFirebaseError(err), "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "حفظ بيانات الامتحان";
    }
  });
}

/* ---------------------- إدارة الأسئلة ---------------------- */

async function loadQuestions() {
  const snap = await db
    .collection(COLLECTIONS.QUESTIONS)
    .where("examId", "==", examCtx.examId)
    .orderBy("order")
    .get();
  examCtx.questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderQuestionsList();
}

const typeLabels = {
  multiple_choice: "اختيار من متعدد",
  true_false: "صح / خطأ",
  short_answer: "إجابة قصيرة",
  essay: "مقالي",
};

function renderQuestionsList() {
  const list = document.getElementById("questionsList");
  const empty = document.getElementById("noQuestions");
  document.getElementById("qCount").textContent = examCtx.questions.length;

  if (examCtx.questions.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = "";

  examCtx.questions.forEach((q, index) => {
    const card = document.createElement("div");
    card.className = "q-card";
    card.innerHTML = `
      <div class="q-head">
        <div>
          <span class="badge badge-progress">${typeLabels[q.type]}</span>
          <span class="muted small">— ${q.points} ${q.points === 1 ? "درجة" : "درجات"}</span>
        </div>
        <div class="flex gap-8">
          <div class="q-order-btns">
            <button data-act="up" ${index === 0 ? "disabled" : ""} title="نقل لأعلى">▲</button>
            <button data-act="down" ${index === examCtx.questions.length - 1 ? "disabled" : ""} title="نقل لأسفل">▼</button>
          </div>
          <button class="btn btn-outline btn-sm" data-act="edit">تعديل</button>
          <button class="btn btn-danger btn-sm" data-act="delete">حذف</button>
        </div>
      </div>
      <div class="ltr" style="direction:ltr; text-align:left;">${escapeHtml(q.text)}</div>
    `;
    card.querySelector('[data-act="edit"]').addEventListener("click", () => openQuestionModal(q));
    card.querySelector('[data-act="delete"]').addEventListener("click", () => confirmDeleteQuestion(q));
    card.querySelector('[data-act="up"]')?.addEventListener("click", () => moveQuestion(index, -1));
    card.querySelector('[data-act="down"]')?.addEventListener("click", () => moveQuestion(index, 1));
    list.appendChild(card);
  });
}

async function moveQuestion(index, direction) {
  const otherIndex = index + direction;
  if (otherIndex < 0 || otherIndex >= examCtx.questions.length) return;
  const a = examCtx.questions[index];
  const b = examCtx.questions[otherIndex];
  const batch = db.batch();
  batch.update(db.collection(COLLECTIONS.QUESTIONS).doc(a.id), { order: b.order });
  batch.update(db.collection(COLLECTIONS.QUESTIONS).doc(b.id), { order: a.order });
  await batch.commit();
  await loadQuestions();
}

function confirmDeleteQuestion(q) {
  openConfirm("حذف السؤال", "سيتم حذف هذا السؤال نهائيًا من الامتحان. هل تريد المتابعة؟", async () => {
    const batch = db.batch();
    batch.delete(db.collection(COLLECTIONS.QUESTIONS).doc(q.id));
    batch.delete(db.collection(COLLECTIONS.ANSWER_KEYS).doc(q.id));
    await batch.commit();
    await renumberQuestions();
    await syncQuestionCount();
    await loadQuestions();
  });
}

async function renumberQuestions() {
  const snap = await db.collection(COLLECTIONS.QUESTIONS).where("examId", "==", examCtx.examId).orderBy("order").get();
  const batch = db.batch();
  snap.docs.forEach((doc, i) => batch.update(doc.ref, { order: i }));
  await batch.commit();
}

async function syncQuestionCount() {
  const snap = await db.collection(COLLECTIONS.QUESTIONS).where("examId", "==", examCtx.examId).get();
  await db.collection(COLLECTIONS.EXAMS).doc(examCtx.examId).update({ questionCount: snap.size });
  document.getElementById("questionCountDisplay").value = snap.size;
}

let editingQuestionId = null;

function wireQuestionModal() {
  document.getElementById("addQuestionBtn").addEventListener("click", () => openQuestionModal(null));
  document.getElementById("cancelQuestionBtn").addEventListener("click", () => closeQuestionModal());
  document.getElementById("qType").addEventListener("change", updateQuestionModalFields);
  document.getElementById("saveQuestionBtn").addEventListener("click", saveQuestion);
}

function openQuestionModal(question) {
  editingQuestionId = question ? question.id : null;
  document.getElementById("qModalTitle").textContent = question ? "تعديل السؤال" : "إضافة سؤال";
  clearAlert(document.getElementById("qModalAlert"));

  document.getElementById("qType").value = question ? question.type : "multiple_choice";
  document.getElementById("qText").value = question ? question.text : "";
  document.getElementById("qPoints").value = question ? question.points : 1;
  document.getElementById("optA").value = question?.options?.a || "";
  document.getElementById("optB").value = question?.options?.b || "";
  document.getElementById("optC").value = question?.options?.c || "";
  document.getElementById("optD").value = question?.options?.d || "";
  document.getElementById("mcCorrect").value = "a";
  document.getElementById("tfCorrect").value = "true";
  document.getElementById("acceptableAnswers").value = "";

  updateQuestionModalFields();
  document.getElementById("questionModal").classList.remove("hidden");

  if (question) {
    // نجلب مفتاح الإجابة الصحيحة (متاح للأستاذ فقط عبر قواعد الأمان) لتعبئته في النموذج
    db.collection(COLLECTIONS.ANSWER_KEYS)
      .doc(question.id)
      .get()
      .then((keyDoc) => {
        if (!keyDoc.exists) return;
        const key = keyDoc.data();
        if (question.type === "multiple_choice") document.getElementById("mcCorrect").value = key.correctAnswer;
        if (question.type === "true_false") document.getElementById("tfCorrect").value = key.correctAnswer;
        if (question.type === "short_answer") document.getElementById("acceptableAnswers").value = (key.acceptableAnswers || []).join(", ");
      });
  }
}

function closeQuestionModal() {
  document.getElementById("questionModal").classList.add("hidden");
  editingQuestionId = null;
}

function updateQuestionModalFields() {
  const type = document.getElementById("qType").value;
  document.getElementById("mcOptions").classList.toggle("hidden", type !== "multiple_choice");
  document.getElementById("tfOptions").classList.toggle("hidden", type !== "true_false");
  document.getElementById("shortOptions").classList.toggle("hidden", type !== "short_answer");
}

async function saveQuestion() {
  const alertEl = document.getElementById("qModalAlert");
  const type = document.getElementById("qType").value;
  const text = document.getElementById("qText").value.trim();
  const points = Number(document.getElementById("qPoints").value);

  if (!text) return showAlert(alertEl, "يرجى كتابة نص السؤال.", "error");
  if (!(points > 0)) return showAlert(alertEl, "يرجى تحديد درجة صحيحة أكبر من صفر.", "error");

  let options = null;
  let answerKeyData = null;

  if (type === "multiple_choice") {
    const a = document.getElementById("optA").value.trim();
    const b = document.getElementById("optB").value.trim();
    const c = document.getElementById("optC").value.trim();
    const d = document.getElementById("optD").value.trim();
    if (!a || !b || !c || !d) return showAlert(alertEl, "يرجى تعبئة الاختيارات الأربعة كاملة.", "error");
    options = { a, b, c, d };
    answerKeyData = { examId: examCtx.examId, correctAnswer: document.getElementById("mcCorrect").value };
  } else if (type === "true_false") {
    answerKeyData = { examId: examCtx.examId, correctAnswer: document.getElementById("tfCorrect").value };
  } else if (type === "short_answer") {
    const raw = document.getElementById("acceptableAnswers").value.trim();
    if (!raw) return showAlert(alertEl, "يرجى إدخال إجابة صحيحة واحدة على الأقل.", "error");
    const acceptableAnswers = raw.split(",").map((s) => s.trim()).filter(Boolean);
    answerKeyData = { examId: examCtx.examId, acceptableAnswers };
  } else if (type === "essay") {
    answerKeyData = null; // لا يوجد تصحيح تلقائي للمقالي
  }

  try {
    const questionRef = editingQuestionId
      ? db.collection(COLLECTIONS.QUESTIONS).doc(editingQuestionId)
      : db.collection(COLLECTIONS.QUESTIONS).doc();

    const order = editingQuestionId
      ? examCtx.questions.find((q) => q.id === editingQuestionId).order
      : examCtx.questions.length;

    const questionData = { examId: examCtx.examId, type, text, points, order };
    if (options) questionData.options = options;

    const batch = db.batch();
    batch.set(questionRef, questionData);
    if (answerKeyData) {
      batch.set(db.collection(COLLECTIONS.ANSWER_KEYS).doc(questionRef.id), answerKeyData);
    }
    await batch.commit();

    closeQuestionModal();
    await syncQuestionCount();
    await loadQuestions();
  } catch (err) {
    console.error(err);
    showAlert(alertEl, translateFirebaseError(err), "error");
  }
}
