# تشغيل قاعدة البيانات محليًا أو على Supabase

## المتطلبات

- تثبيت Supabase CLI وDocker عند الاختبار المحلي.
- عدم استخدام بيانات إنتاج عند تشغيل الاختبارات أو `db reset`.
- الاحتفاظ بملفات `.env.local` والمفاتيح خارج Git.

## تشغيل محلي

من جذر المشروع:

```powershell
supabase start
supabase db reset
npm run db:test
```

يطبق `db reset` جميع ملفات `supabase/migrations` من الصفر ويدخل بيانات الكتالوج المرجعية. لا تدخل بيانات الاختبار المالية تلقائيًا؛ راجع ملفها واستخدمها في بيئة محلية معزولة فقط.

## تجهيز مشروع سحابي

1. أنشئ مشروع Supabase منفصلًا للتطوير/المعاينة، وخذ نسخة احتياطية قبل أي تحديث على قاعدة قائمة.
2. ثبّت Supabase CLI وسجّل الدخول محليًا، ثم نفّذ `supabase link --project-ref <project-ref>` للمشروع المقصود.
3. راجع migrations بالترتيب، ثم نفّذ `supabase db push` من جهاز المطور. لا تضع access token أو مفاتيح المشروع في ملفات المستودع أو سجلات الأوامر.
4. راجع وجود migration `0006_security_hardening.sql` ضمن السجل المطبق قبل إدخال أي بيانات حقيقية.
5. اضبط `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` في بيئة التطبيق. لا يحتاج عميل الويب إلى `service_role`.

## إنشاء أول مدير

لا يوجد تسجيل عام أو endpoint لترقية المستخدمين. أنشئ حساب Auth من لوحة Supabase، ثم من SQL Editor الموثوق أضف ملفه مرة واحدة بعد أخذ `id` من قائمة المستخدمين:

```sql
insert into public.profiles (user_id, display_name, role, active)
values ('AUTH_USER_UUID', 'اسم المدير', 'admin', true);
```

نفّذ ذلك بصلاحية مالك قاعدة البيانات داخل لوحة Supabase فقط. لا تضف `service_role` للمتصفح ولا تنشئ أول مدير من طلب HTTP عام. بعد ذلك يسجل المدير الدخول وينشئ الحسابات والعضويات عبر مسار إداري موثوق؛ واجهات إدارة المستخدمين لم تُنفذ بعد في التطبيق الحالي.

## بوابة التشغيل

- يجب أن تنجح `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- يجب أن تنجح اختبارات pgTAP، بما فيها اختبار منح الوصول في `supabase/tests/03_security_hardening.sql`.
- لا تعتبر migration ناجحة لمجرد رفعها إلى GitHub؛ تحقق من سجل migrations ومن نتائج الاختبار على المشروع المقصود.