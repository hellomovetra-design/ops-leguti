-- Auth credentials remain in Supabase Auth; this table only maps login NIK to account.
create table if not exists public.ops_user_employee_links (
  email text primary key check (email = lower(trim(email)) and position('@' in email) > 1),
  employee_nik text not null unique references public.ops_employees(nik) on update cascade on delete restrict,
  updated_at timestamptz not null default now()
);
alter table public.ops_user_employee_links enable row level security;
revoke all on public.ops_user_employee_links from anon, authenticated;
grant all on public.ops_user_employee_links to service_role;
