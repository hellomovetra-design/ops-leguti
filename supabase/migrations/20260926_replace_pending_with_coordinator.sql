alter table public.ops_users drop constraint if exists ops_users_role_check;
update public.ops_users set role = 'coordinator' where role = 'pending';
alter table public.ops_users add constraint ops_users_role_check
  check (role in ('super_admin','viewer','coordinator','leader','admin','spv','jr_spv'));
