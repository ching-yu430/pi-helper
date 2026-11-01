-- Fix installer cross-UID bytecode cleanup and expose bounded failure stages.
begin;
create or replace function public.pi_helper_tool_finish(p_job_id uuid,p_claim_secret text,p_status text,p_version text,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j pi_helper.tool_jobs%rowtype;
begin
 select * into j from pi_helper.tool_jobs where id=p_job_id for update;
 if not found or p_claim_secret is null or j.claim_hash is distinct from encode(extensions.digest(p_claim_secret,'sha256'),'hex') or j.status not in ('installing','failed','completed') then raise exception 'TOOL_DENIED'; end if;
 if j.claim_until<=now() then raise exception 'TOOL_EXPIRED'; end if;
 if not exists(select 1 from pi_helper.rooms where id=j.room_id and active and ends_at>now() and group_count>=j.group_no) then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_version is distinct from j.version or p_status is null or p_status not in ('completed','failed') or (p_error_code is not null and p_error_code not in ('install_failed','install_sudo','install_read_config','install_claim','install_download','install_write_files','install_course_setup','install_device_setup','install_cleanup','install_course_report','install_verify','install_save')) then raise exception 'INVALID_STATE'; end if;
 if j.status='completed' then if p_status='completed' then return true; else raise exception 'TOOL_DENIED'; end if;end if;
 if p_status='completed' then
  if not exists(select 1 from pi_helper.devices where room_id=j.room_id and group_no=j.group_no and enabled and token_hash=j.claim_device_hash and received_at>=j.claimed_at)
  or not exists(select 1 from pi_helper.course_devices c join pi_helper.course_tasks t using(room_id,group_no) where c.room_id=j.room_id and c.group_no=j.group_no and c.enabled and c.token_hash=j.claim_course_hash and t.task='location' and t.status='passed' and t.received_at>=j.claimed_at) then raise exception 'TOOL_NOT_VERIFIED'; end if;
  insert into pi_helper.tool_installations(room_id,group_no,version) values(j.room_id,j.group_no,j.version)
  on conflict(room_id,group_no) do update set version=excluded.version,completed_at=now();
 end if;
 update pi_helper.tool_jobs set status=p_status,error_code=p_error_code,revision=revision+1,updated_at=now() where id=j.id;
 return true;
end; $$;
insert into pi_helper.tool_releases(version,bootstrap_sha256,files) values ('1.4.0','a01f2fb21079882c70774e7e14ee3581224efd7cf7a1188cd942f43269d14064','{"device":"b53c4e04e72bdb55d448e733a0fbb440e6e71f79b2891737e5d53f93735c182d","course":"4d5c8b1d995e90ffa1d64b16c01c98aa37d61585200aff944d29137649c803e1","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42"}'::jsonb) on conflict(version) do nothing;
notify pgrst,'reload schema';
commit;
