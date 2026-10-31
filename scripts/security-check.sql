-- Read-only operational metadata audit; no personnel rows or secrets are selected.
select 'ops_tables_without_rls' as check_name,count(*)::text as result
from pg_tables where schemaname='public' and left(tablename,4)='ops_' and not rowsecurity
union all
select 'ops_policies_for_browser_roles',count(*)::text
from pg_policies where schemaname='public' and left(tablename,4)='ops_'
and roles && array['public','anon','authenticated']::name[]
union all
select 'ops_security_definer_functions_executable_anon',count(*)::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and left(p.proname,4)='ops_' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE');

select p.proname,p.prorettype::regtype::text as return_type
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and left(p.proname,4)='ops_' and p.prosecdef
and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));
