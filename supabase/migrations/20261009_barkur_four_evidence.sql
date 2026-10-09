begin;

-- Retain existing evidence while allowing one email screenshot and three photos.
alter table public.ops_barkur
  drop constraint if exists ops_barkur_evidence_check;
alter table public.ops_barkur
  add constraint ops_barkur_evidence_check
  check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 4);

commit;
