-- Allow operational leadership roles to be stored in ops_users.
alter table public.ops_users drop constraint if exists ops_users_role_check;
alter table public.ops_users add constraint ops_users_role_check check (role in ('coordinator','leader','admin','spv','jr_spv'));
