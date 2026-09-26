alter table public.ops_problems add column if not exists status text not null default 'open';
