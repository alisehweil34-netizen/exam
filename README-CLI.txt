نشر نظام الامتحانات عبر Firebase CLI

1) ثبّت Firebase CLI:
   npm install -g firebase-tools

2) سجّل الدخول:
   firebase login

3) افتح هذا المجلد في Terminal / PowerShell.

4) تأكد أن المشروع الصحيح محدد:
   firebase use
   أو:
   firebase use aaaaaaaa-c48f5

5) انشر قواعد Firestore والفهارس:
   firebase deploy --only firestore:rules,firestore:indexes

6) إذا أردت نشر الموقع أيضًا:
   firebase deploy --only hosting

7) لنظام تسجيل دخول الأستاذ المحلي، يجب تفعيل Anonymous Authentication من:
   Firebase Console > Authentication > Sign-in method > Anonymous > Enable

ملاحظات:
- Firebase Authentication بالبريد وكلمة المرور غير مستخدم لتسجيل دخول الأستاذ.
- تسجيل دخول الأستاذ يتم محليًا بالبيانات الموجودة في auth.js.
- Firebase/Firestore يبقى مستخدمًا للطلاب والامتحانات والنتائج.
- لا تغيّر firestore.rules إلى allow read, write: if true؛ لأن ذلك يفتح قاعدة البيانات.
- إذا كان مشروع Firebase لديك ليس aaaaaaaa-c48f5، عدّل قيمة projectId في firebase-config.js وقيمة default في .firebaserc قبل النشر.
