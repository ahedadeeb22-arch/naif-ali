-- Verify client roles cannot bypass protected RPC authorization with direct grants.
begin;
select plan(5);

select ok(
  not has_function_privilege('authenticated', 'public.store_balance(uuid,date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.supplier_balance(uuid,date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.check_revision_readiness(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reconciliation_report(uuid)', 'EXECUTE'),
  'internal balance and readiness helpers are not executable by clients'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'night_orders', 'night_order_lines', 'daily_sheets', 'daily_sheet_revisions',
      'purchase_lines', 'purchase_dispositions', 'daily_sheet_events',
      'opening_balances', 'payment_vouchers', 'journal_entries', 'journal_lines', 'audit_log'
    ]) as protected_table(table_name)
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as operation(privilege)
    where has_table_privilege('authenticated', 'public.' || protected_table.table_name, operation.privilege)
       or has_table_privilege('anon', 'public.' || protected_table.table_name, operation.privilege)
  ),
  'client roles have no direct DML grants on protected operational tables'
);

select ok(
  has_function_privilege('authenticated', 'public.store_statement(uuid,date,date)', 'EXECUTE'),
  'store statement remains callable and performs its own membership check'
);

select ok(
  has_function_privilege('authenticated', 'public.post_revision(uuid,integer,text)', 'EXECUTE'),
  'posting remains callable through its manager-checked RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.save_purchase_line(uuid,integer,jsonb)', 'EXECUTE'),
  'draft edits remain callable through the permission-checked RPC'
);

select * from finish();
rollback;