begin;
set local lock_timeout='5s';
create table if not exists pi_helper.tool_releases(version text primary key,bootstrap_sha256 text not null,files jsonb not null);
create table if not exists pi_helper.tool_jobs(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 group_no smallint not null check(group_no between 1 and 99),version text not null references pi_helper.tool_releases(version),
 rebind boolean not null default false,status text not null default 'pending' check(status in ('pending','approved','installing','completed','failed','cancelled')),
 revision bigint not null default 1,request_hash text,requested_at timestamptz,approved_by text,approved_until timestamptz,
 claim_hash text,claimed_at timestamptz,claim_until timestamptz,device_reused boolean,course_reused boolean,claim_device_hash text,claim_course_hash text,
 error_code text,updated_at timestamptz not null default now(),unique(room_id,group_no)
);
create table if not exists pi_helper.tool_installations(room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 group_no smallint not null,version text not null,completed_at timestamptz not null default now(),primary key(room_id,group_no));
alter table pi_helper.tool_releases enable row level security;
alter table pi_helper.tool_jobs enable row level security;
alter table pi_helper.tool_installations enable row level security;
revoke all on pi_helper.tool_releases,pi_helper.tool_jobs,pi_helper.tool_installations from public,anon,authenticated;
insert into pi_helper.tool_releases(version,bootstrap_sha256,files) values ('1.0.0','f72ae8edbb7d9c1ac1373f3de80d92e82a81cd6f4c2e54ecf711ae42e5fef570','{"device":"8d7c9e27aeff174f269d5c8ce88ad9f79e2dd92c92c29daeb9da5551d44c6d81","course":"a54e9fb74364ef566ec4d2bfa278d201178213cc346688fe41f6adbaf6a040b1","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42"}'::jsonb) on conflict(version) do nothing;

create or replace function pi_helper.tool_job_json(p_job uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'group_no',j.group_no,'expected_hostname','pi5-'||lpad(j.group_no::text,2,'0'),
 'version',j.version,'status',j.status,'revision',j.revision,'rebind',j.rebind,
 'request_code',case when j.request_hash is null then null else upper(left(j.request_hash,8)) end,
 'request_active',j.requested_at>now()-interval '20 minutes','approved_until',j.approved_until,
 'approval_expired',j.approved_until is null or j.approved_until<=now(),'claim_until',j.claim_until,
 'error_code',j.error_code,'bootstrap_sha256',r.bootstrap_sha256,'updated_at',j.updated_at)
 from pi_helper.tool_jobs j join pi_helper.tool_releases r on r.version=j.version where j.id=p_job;
$$;
create or replace function pi_helper.tool_room(p_room_code text,p_group_no smallint)
returns uuid language plpgsql stable set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') and active and ends_at>now();
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_group_no is null or p_group_no<1 or p_group_no>r.group_count then raise exception 'INVALID_GROUP'; end if;
 return r.id;
end; $$;
revoke all on function pi_helper.tool_job_json(uuid),pi_helper.tool_room(text,smallint) from public,anon,authenticated;

create or replace function public.pi_helper_teacher_tools(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 return jsonb_build_object('supported',true,'versions',(select jsonb_agg(version order by version) from pi_helper.tool_releases),
 'groups',(select jsonb_agg(jsonb_build_object('group_no',n,'installed_version',i.version,'completed_at',i.completed_at,
 'job',pi_helper.tool_job_json(j.id)) order by n) from generate_series(1,(select group_count from pi_helper.rooms where id=r)) n
 left join pi_helper.tool_jobs j on j.room_id=r and j.group_no=n left join pi_helper.tool_installations i on i.room_id=r and i.group_no=n));
end; $$;
create or replace function public.pi_helper_teacher_assign_tools(p_room_code text,p_teacher_code text,p_groups smallint[],p_version text,p_rebind boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; n smallint; total smallint;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 select group_count into total from pi_helper.rooms where id=r for update;
 if p_rebind is null or p_groups is null or cardinality(p_groups) not between 1 and 99 or exists(select 1 from unnest(p_groups) x where x is null or x<1 or x>total) then raise exception 'INVALID_GROUP'; end if;
 if not exists(select 1 from pi_helper.tool_releases where version=p_version) then raise exception 'TOOL_VERSION'; end if;
 foreach n in array p_groups loop
 insert into pi_helper.tool_jobs(room_id,group_no,version,rebind) values(r,n,p_version,p_rebind)
 on conflict(room_id,group_no) do update set id=gen_random_uuid(),version=excluded.version,rebind=excluded.rebind,status='pending',
 revision=pi_helper.tool_jobs.revision+1,request_hash=null,requested_at=null,approved_by=null,approved_until=null,
 claim_hash=null,claimed_at=null,claim_until=null,device_reused=null,course_reused=null,claim_device_hash=null,claim_course_hash=null,error_code=null,updated_at=now();
 end loop;
 return public.pi_helper_teacher_tools(p_room_code,p_teacher_code);
end; $$;
create or replace function public.pi_helper_student_tool(p_room_code text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; j uuid;
begin
 r:=pi_helper.tool_room(p_room_code,p_group_no);select id into j from pi_helper.tool_jobs where room_id=r and group_no=p_group_no;
 return pi_helper.tool_job_json(j);
end; $$;
create or replace function public.pi_helper_request_tool(p_room_code text,p_group_no smallint,p_request_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; j pi_helper.tool_jobs%rowtype; h text;
begin
 r:=pi_helper.tool_room(p_room_code,p_group_no);
 if p_request_secret is null or p_request_secret!~'^[a-f0-9]{64}$' then raise exception 'TOOL_DENIED'; end if;
 select * into j from pi_helper.tool_jobs where room_id=r and group_no=p_group_no for update;
 if not found or j.status in ('completed','cancelled','installing') or j.claim_hash is not null then raise exception 'TOOL_DENIED'; end if;
 h:=encode(extensions.digest(p_request_secret,'sha256'),'hex');
 if j.request_hash=h and j.requested_at>now()-interval '20 minutes' then return pi_helper.tool_job_json(j.id); end if;
 if j.requested_at>now()-interval '20 minutes' then raise exception 'TOOL_REQUEST_EXISTS'; end if;
 update pi_helper.tool_jobs set request_hash=h,requested_at=now(),status='pending',approved_until=null,approved_by=null,
 revision=revision+1,updated_at=now() where id=j.id;
 return pi_helper.tool_job_json(j.id);
end; $$;
create or replace function public.pi_helper_teacher_approve_tool(p_room_code text,p_teacher_code text,p_job_id uuid,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; j pi_helper.tool_jobs%rowtype; actor jsonb;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 select * into j from pi_helper.tool_jobs where id=p_job_id and room_id=r for update;
 if not found then raise exception 'TOOL_DENIED'; end if;
 perform pi_helper.tool_room(p_room_code,j.group_no);
 if p_revision is null or p_revision<>j.revision then raise exception 'TOOL_CONFLICT'; end if;
 if j.status not in ('pending','approved') or j.requested_at is null or j.requested_at<=now()-interval '20 minutes' then raise exception 'TOOL_EXPIRED'; end if;
 actor:=pi_helper.workbench_identity(r,p_teacher_code);
 update pi_helper.tool_jobs set status='approved',approved_by=actor->>'name',approved_until=now()+interval '10 minutes',
 revision=revision+1,updated_at=now() where id=j.id;
 return pi_helper.tool_job_json(j.id);
end; $$;
create or replace function public.pi_helper_teacher_cancel_tool(p_room_code text,p_teacher_code text,p_job_id uuid,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r uuid; j pi_helper.tool_jobs%rowtype;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);select * into j from pi_helper.tool_jobs where id=p_job_id and room_id=r for update;
 if not found then raise exception 'TOOL_DENIED'; end if;
 if p_revision is null or p_revision<>j.revision then raise exception 'TOOL_CONFLICT'; end if;
 update pi_helper.tool_jobs set status='cancelled',revision=revision+1,updated_at=now() where id=j.id;
 return true;
end; $$;

create or replace function public.pi_helper_tool_claim(p_job_id uuid,p_request_secret text,p_claim_secret text,p_hostname text,p_device_token text default null,p_course_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j pi_helper.tool_jobs%rowtype; d pi_helper.devices%rowtype; c pi_helper.course_devices%rowtype;
 dh text; ch text; dt text; ct text; reused_d boolean; reused_c boolean;
begin
 if p_request_secret is null or p_claim_secret is null or p_request_secret!~'^[a-f0-9]{64}$' or p_claim_secret!~'^[a-f0-9]{64}$' then raise exception 'TOOL_DENIED'; end if;
 select * into j from pi_helper.tool_jobs where id=p_job_id for update;
 if not found or j.status='cancelled' or j.request_hash is distinct from encode(extensions.digest(p_request_secret,'sha256'),'hex') then raise exception 'TOOL_DENIED'; end if;
 if not exists(select 1 from pi_helper.rooms where id=j.room_id and active and ends_at>now() and group_count>=j.group_no) then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_hostname is distinct from 'pi5-'||lpad(j.group_no::text,2,'0') then raise exception 'TOOL_HOST_MISMATCH'; end if;
 dh:=encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex');ch:=encode(extensions.digest(coalesce(p_course_token,''),'sha256'),'hex');
 select * into d from pi_helper.devices where room_id=j.room_id and group_no=j.group_no for update;
 select * into c from pi_helper.course_devices where room_id=j.room_id and group_no=j.group_no for update;
 if j.claim_hash is not null then
  if j.claim_hash<>encode(extensions.digest(p_claim_secret,'sha256'),'hex') then raise exception 'TOOL_ALREADY_CLAIMED'; end if;
  if j.claim_until<=now() or j.status not in ('installing','failed','completed') then raise exception 'TOOL_EXPIRED'; end if;
  reused_d:=j.device_reused;reused_c:=j.course_reused;
 else
  if j.status<>'approved' or j.approved_until<=now() then raise exception 'TOOL_EXPIRED'; end if;
  reused_d:=d.enabled and d.token_hash=dh;reused_c:=c.enabled and c.token_hash=ch;
  if not j.rebind and ((d.token_hash is not null and not coalesce(reused_d,false)) or (c.token_hash is not null and not coalesce(reused_c,false))) then raise exception 'TOOL_REBIND_REQUIRED'; end if;
  update pi_helper.tool_jobs set claim_hash=encode(extensions.digest(p_claim_secret,'sha256'),'hex'),claimed_at=now(),claim_until=now()+interval '1 hour',
  device_reused=coalesce(reused_d,false),course_reused=coalesce(reused_c,false) where id=j.id;
 end if;
 dt:=case when coalesce(reused_d,false) then p_device_token else encode(extensions.digest('device:'||j.id::text||':'||p_claim_secret,'sha256'),'hex') end;
 ct:=case when coalesce(reused_c,false) then p_course_token else encode(extensions.digest('course:'||j.id::text||':'||p_claim_secret,'sha256'),'hex') end;
 if j.claim_hash is not null then
  if d.token_hash is distinct from encode(extensions.digest(dt,'sha256'),'hex') or not d.enabled or c.token_hash is distinct from encode(extensions.digest(ct,'sha256'),'hex') or not c.enabled then raise exception 'TOOL_DENIED'; end if;
 else
  if not coalesce(reused_d,false) then
   insert into pi_helper.devices(room_id,group_no,token_hash) values(j.room_id,j.group_no,encode(extensions.digest(dt,'sha256'),'hex'))
   on conflict(room_id,group_no) do update set token_hash=excluded.token_hash,enabled=true,paired_at=now();
  end if;
  if not coalesce(reused_c,false) then
   insert into pi_helper.course_devices(room_id,group_no,token_hash) values(j.room_id,j.group_no,encode(extensions.digest(ct,'sha256'),'hex'))
   on conflict(room_id,group_no) do update set token_hash=excluded.token_hash,enabled=true,paired_at=now(),last_sequence=0;
  end if;
 end if;
 if j.status<>'completed' then update pi_helper.tool_jobs set status='installing',claim_device_hash=encode(extensions.digest(dt,'sha256'),'hex'),claim_course_hash=encode(extensions.digest(ct,'sha256'),'hex'),revision=revision+1,error_code=null,updated_at=now() where id=j.id;end if;
 return (select jsonb_build_object('version',j.version,'completed',j.status='completed','files',files,'device_token',dt,'course_token',ct) from pi_helper.tool_releases where version=j.version);
end; $$;
create or replace function public.pi_helper_tool_finish(p_job_id uuid,p_claim_secret text,p_status text,p_version text,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j pi_helper.tool_jobs%rowtype;
begin
 select * into j from pi_helper.tool_jobs where id=p_job_id for update;
 if not found or p_claim_secret is null or j.claim_hash is distinct from encode(extensions.digest(p_claim_secret,'sha256'),'hex') or j.status not in ('installing','failed','completed') then raise exception 'TOOL_DENIED'; end if;
 if j.claim_until<=now() then raise exception 'TOOL_EXPIRED'; end if;
 if not exists(select 1 from pi_helper.rooms where id=j.room_id and active and ends_at>now() and group_count>=j.group_no) then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_version is distinct from j.version or p_status is null or p_status not in ('completed','failed') or (p_error_code is not null and p_error_code<>'install_failed') then raise exception 'INVALID_STATE'; end if;
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
revoke all on function public.pi_helper_teacher_tools(text,text),public.pi_helper_teacher_assign_tools(text,text,smallint[],text,boolean),public.pi_helper_student_tool(text,smallint),public.pi_helper_request_tool(text,smallint,text),public.pi_helper_teacher_approve_tool(text,text,uuid,bigint),public.pi_helper_teacher_cancel_tool(text,text,uuid,bigint),public.pi_helper_tool_claim(uuid,text,text,text,text,text),public.pi_helper_tool_finish(uuid,text,text,text,text) from public;
grant execute on function public.pi_helper_teacher_tools(text,text),public.pi_helper_teacher_assign_tools(text,text,smallint[],text,boolean),public.pi_helper_student_tool(text,smallint),public.pi_helper_request_tool(text,smallint,text),public.pi_helper_teacher_approve_tool(text,text,uuid,bigint),public.pi_helper_teacher_cancel_tool(text,text,uuid,bigint),public.pi_helper_tool_claim(uuid,text,text,text,text,text),public.pi_helper_tool_finish(uuid,text,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
