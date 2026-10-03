-- Apply after 20261003_request_inbox.sql. No browser grants / RLS changes.
begin;
do $$
declare item text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach item in array array['ops_inbox_threads','ops_inbox_reads'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then
      execute format('alter publication supabase_realtime add table public.%I',item);
    end if;
  end loop;
end $$;
commit;
