begin;
create or replace function public.ops_transfer_team(p_from text,p_to text,p_members jsonb default null,p_expected jsonb default null,p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 source_person public.ops_employees; target_person public.ops_employees;
 member public.ops_employees; courier public.ops_courier_master;
 selection jsonb; team jsonb; actor text; claims jsonb; headers jsonb;
 changed integer:=0; master_changed integer:=0; leader_id text; leader_name text;
 before_master jsonb; after_master jsonb;
begin
 if p_from is null or p_to is null or p_from=p_to then raise exception 'Pilih dua atasan berbeda.'; end if;
 -- Same lock order as employee edit and monthly courier import.
 if p_apply then
  perform 1 from public.ops_courier_master_revision where singleton for update;
  if not found then raise exception 'Master kurir belum siap.'; end if;
  perform 1 from public.ops_employees order by nik for update;
 end if;
 select * into source_person from public.ops_employees where nik=p_from;
 if not found then raise exception 'Atasan asal tidak ditemukan.'; end if;
 select * into target_person from public.ops_employees where nik=p_to;
 if not found or not target_person.active or target_person.position !~* '(leader|coordinator|koordinator|supervisor|spv)' then
  raise exception 'Tujuan harus Leader, Koordinator, atau SPV aktif.';
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.name,e.nik),'[]'::jsonb) into team
 from public.ops_employees e where e.nik<>p_from and
  (e.superior_nik=p_from or (e.superior_nik is null and public.ops_resolve_superior_nik(e.superior)=p_from));
 if not p_apply then
  return jsonb_build_object('source',to_jsonb(source_person),'target',to_jsonb(target_person),'members',team);
 end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 actor:=nullif(trim(headers->>'x-ops-actor'),'');
 if claims->>'role' is distinct from 'service_role' or actor is null then raise exception 'Akses pengelola diperlukan.'; end if;
 if p_expected->'source' is distinct from to_jsonb(source_person) or p_expected->'target' is distinct from to_jsonb(target_person) then
  raise exception 'Data atasan berubah. Muat ulang pratinjau.';
 end if;
 if jsonb_typeof(p_members) is distinct from 'array' then raise exception 'Pilih anggota tim.'; end if;
 if jsonb_array_length(p_members)<1 or jsonb_array_length(p_members)>1000 then raise exception 'Pilih 1–1000 anggota tim.'; end if;
 if (select count(distinct value->>'nik') from jsonb_array_elements(p_members))<>jsonb_array_length(p_members) then raise exception 'Anggota tim tidak valid.'; end if;
 if target_person.position ~* 'inbound.*delivery.*leader' then leader_id:=target_person.nik; leader_name:=target_person.name; end if;
 for selection in select value from jsonb_array_elements(p_members) loop
  select * into member from public.ops_employees where nik=selection->>'nik';
  if not found or to_jsonb(member) is distinct from selection or not (team @> jsonb_build_array(selection)) then
   raise exception 'Data anggota berubah. Muat ulang pratinjau.';
  end if;
  if member.nik=p_to then raise exception 'Anggota tidak boleh menjadi atasannya sendiri.'; end if;
  -- Existing hierarchy trigger rejects cycles. Any failure rolls back the entire team.
  update public.ops_employees set superior_nik=p_to,superior=target_person.name where nik=member.nik;
  changed:=changed+1;
  if member.position ~* '(kurir|rider|driver)' then
   for courier in select * from public.ops_courier_master where employee_nik=member.nik for update loop
    before_master:=to_jsonb(courier);
    update public.ops_courier_master set leader_nik=leader_id,leader=coalesce(leader_name,''),updated_at=now()
     where id=courier.id returning to_jsonb(ops_courier_master.*) into after_master;
    if (before_master-'updated_at') is distinct from (after_master-'updated_at') then
     insert into public.ops_courier_master_changes(courier_id,actor_email,changes,source_month)
      values(courier.id,actor,jsonb_build_object('source','team_transfer','from_nik',p_from,'to_nik',p_to,'before',before_master,'after',after_master),coalesce(courier.source_month,date_trunc('month',now())::date));
     master_changed:=master_changed+1;
    end if;
   end loop;
  end if;
 end loop;
 if master_changed>0 then update public.ops_courier_master_revision set revision=revision+1 where singleton; end if;
 return jsonb_build_object('ok',true,'count',changed,'courier_count',master_changed);
end $$;
revoke all on function public.ops_transfer_team(text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ops_transfer_team(text,text,jsonb,jsonb,boolean) to service_role;
commit;
