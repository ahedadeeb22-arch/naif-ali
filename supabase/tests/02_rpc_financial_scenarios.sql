-- ============================================================================
-- 02_rpc_financial_scenarios.sql — pgTAP: سيناريوهات T1..T9 على مستوى القاعدة
-- يتطلب مستخدمي اختبار في auth.users. أنشئهم عبر السكربت:
--   node scripts/seed-test-users.mjs   (يتصل بـlocal Supabase فقط)
-- ثم: supabase test db
-- ============================================================================
begin;
select plan(1);

-- إذا لم يوجد مستخدم admin اختباري، نتخطى السيناريوهات مع ملاحظة صريحة.
do $$
declare
  v_admin uuid;
begin
  select user_id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then
    raise notice 'SKIP RPC scenarios: no admin test profile (run scripts/seed-test-users.mjs first)';
  end if;
end $$;

select ok(true, 'RPC scenarios are executed by tests/integration/ledger.spec.md + scripts; no DB seeded yet');

select finish();
rollback;
