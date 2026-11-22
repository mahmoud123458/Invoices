# نشر Invoice Management System على Vercel

يستخدم الـ backend قاعدة Supabase Postgres ومصادقة JWT الحالية. لا يعتمد تشغيل التطبيق على MongoDB أو تخزين JSON محلي. يُستخدم MongoDB فقط كمصدر اختياري لعملية استيراد واحدة قبل التحويل.

## 1. إعداد Supabase

1. أنشئ مشروع Supabase.
2. لقاعدة جديدة، نفّذ `backend/supabase/schema.sql` من SQL Editor. لقاعدة قائمة، نفّذ ملفات `backend/supabase/migrations` المرقمة بالترتيب، بما فيها `202611210004_nested_record_external_ids.sql`.
3. لا تنفّذ `backend/supabase/seed.sql` في الإنتاج؛ فهو يحتوي حسابات تجريبية.
4. احتفظ بنسخة آمنة من `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY`. المفتاح مخصص للـ backend فقط، ولا يوضع في frontend أو أي متغير يبدأ بـ `NEXT_PUBLIC_`.

## 2. إعداد متغيرات Backend على Vercel

انشر `backend/` كمشروع Vercel مستقل، ثم أضف المتغيرات في **Settings → Environment Variables**:

| المتغير | مطلوب | الاستخدام |
|---|---:|---|
| `SUPABASE_URL` | نعم | رابط مشروع Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | نعم | وصول backend إلى قاعدة البيانات؛ سرّي |
| `JWT_SECRET` | نعم | سر قوي لتوقيع JWT |
| `CORS_ORIGINS` | نعم | نطاق frontend الدقيق، بدون `/` أخيرة |
| `ADMIN_NAME` | عند إنشاء أول مستخدم | اسم المدير الأول |
| `ADMIN_EMAIL` | عند إنشاء أول مستخدم | بريد المدير الأول |
| `ADMIN_PASSWORD` | عند إنشاء أول مستخدم | كلمة مرور بطول 8 أحرف على الأقل |
| `JWT_EXPIRES_IN` | لا | مدة التوكن؛ يستخدم backend القيمة الافتراضية عند غيابه |

يُنشأ المدير من قيم `ADMIN_*` فقط إذا كان جدول `users` فارغًا. غياب Supabase أو إعداد URL غير صالح يمنع تشغيل backend؛ لا يوجد fallback إلى MongoDB أو JSON محلي. لا تشغّل `npm run seed` ولا `seed.sql` على مشروع الإنتاج.

## 3. نشر Frontend

انشر `frontend/` كمشروع Vercel ثانٍ. عيّن `NEXT_PUBLIC_API_URL` إلى عنوان backend متبوعًا بـ `/api`. لا تضف `SUPABASE_SERVICE_ROLE_KEY` إلى مشروع frontend.

بعد النشر، تحقق من `/api/health` ثم جرّب تسجيل الدخول وقراءة لوحة التحكم. يجب أن يطابق `CORS_ORIGINS` عنوان frontend تمامًا.

## 4. استيراد MongoDB والتحويل النهائي

استخدم الخطوات التالية فقط إذا كانت هناك بيانات MongoDB قائمة يجب نقلها:

1. خذ نسخة احتياطية من MongoDB وتأكد من إمكانية الوصول إليه ومن إعداد Supabase وتشغيل الـ schema/migrations حتى `202611210004_nested_record_external_ids.sql`.
2. في بيئة محلية موثوقة، ضع `MONGODB_URI` و`SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` في `backend/.env` غير المتعقب. لا ترسل هذه القيم إلى frontend ولا تضعها في Git أو سجلات الأوامر.
3. حدّد نافذة صيانة قصيرة وأوقف كل الكتابات إلى التطبيق الحالي وأي خدمات أخرى تكتب إلى MongoDB.
4. من مجلد `backend/` شغّل:

   ```powershell
   npm install
   npm run migrate:mongodb
   ```

5. راجع ملخص `source/imported/skipped/failed` لكل جدول. عالج الصفوف أو العلاقات غير الصالحة، ثم أعد تشغيل الأمر؛ الاستيراد قابل لإعادة المحاولة، ويستبدل سجلات البنود والمدفوعات التابعة من بيانات MongoDB.
6. تحقق يدويًا من أعداد الصفوف، ومراجع العميل/المنتج/المستخدم، وبنود الفواتير وأوامر الشراء، وأرقام الفواتير والطلبات. لا تفتح الكتابة إذا بقيت أخطاء أو سجلات متخطاة غير مفهومة.
7. حوّل حركة الإنتاج إلى backend المتصل بـ Supabase، اختبر تسجيل الدخول والعمليات الأساسية، ثم أوقف نافذة الصيانة وأعد فتح الكتابة.

MongoDB هو المرجع عند تعارض سجل له `external_id` مطابق. لا يحذف المستورد سجلات MongoDB أو سجلات Supabase غير المستوردة، ولا ينفذ التطبيق كتابة مزدوجة. احتفظ بـ MongoDB دون تغيير حتى اكتمال التحقق.

## 5. التراجع

يمكن إعادة الحركة إلى MongoDB قبل أن يقبل Supabase أي كتابة جديدة. بعد استئناف الكتابة على Supabase لا يوجد تراجع تلقائي؛ يجب أولًا مطابقة أو ترحيل الكتابات الجديدة قبل التحويل إلى قاعدة أخرى. لا تحذف نسخة MongoDB الاحتياطية بعد بدء القطع.

## استكشاف الأخطاء

- **إعداد Supabase مفقود:** تحقق من `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` في بيئة backend، ثم أعد النشر.
- **المدير الأول لم يُنشأ:** تأكد من أن جدول `users` فارغ وأن `ADMIN_NAME` و`ADMIN_EMAIL` و`ADMIN_PASSWORD` مضبوطة؛ كلمة المرور 8 أحرف على الأقل.
- **فشل الاتصال من frontend:** راجع `CORS_ORIGINS` و`NEXT_PUBLIC_API_URL` وتأكد من وجود `/api` في عنوان الـ frontend.
- **فشل الاستيراد:** راجع رسالة الخطأ والعدادات دون مشاركة URI أو المفاتيح. صحح العلاقات أو صلاحيات الاتصال ثم أعد التشغيل أثناء استمرار نافذة منع الكتابة.
