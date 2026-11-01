begin;
set local lock_timeout='5s';
alter table pi_helper.tool_releases add column if not exists system_revision integer not null default 1;
alter table pi_helper.tool_jobs add column if not exists request_origin text not null default 'browser' check(request_origin in ('browser','desktop'));

-- A course-only update must keep both pairings and the installed system component.
create or replace function pi_helper.tool_update_mode(p_job uuid)
returns text language sql stable set search_path='' as $$
 select case when not j.rebind and old.files ? 'updater' and old.files->>'device'=target.files->>'device'
 and old.system_revision=target.system_revision and target.files ? 'updater'
 then 'user' else 'system' end
 from pi_helper.tool_jobs j join pi_helper.tool_releases target on target.version=j.version
 left join pi_helper.tool_installations i on i.room_id=j.room_id and i.group_no=j.group_no
 left join pi_helper.tool_releases old on old.version=i.version where j.id=p_job;
$$;
create or replace function pi_helper.tool_job_json(p_job uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'group_no',j.group_no,'expected_hostname','pi5-'||lpad(j.group_no::text,2,'0'),
 'version',j.version,'status',j.status,'revision',j.revision,'rebind',j.rebind,
 'request_code',case when j.request_hash is null then null else upper(left(j.request_hash,8)) end,
 'request_active',j.requested_at>now()-interval '20 minutes','approved_until',j.approved_until,
 'approval_expired',j.approved_until is null or j.approved_until<=now(),'claim_until',j.claim_until,'claim_expired',j.claim_until<=now(),
 'request_origin',j.request_origin,'desktop_available',coalesce(old.files ? 'updater',false),
 'desktop_supported',r.files ? 'updater','installed_version',i.version,'update_mode',pi_helper.tool_update_mode(j.id),
 'error_code',j.error_code,'bootstrap_sha256',r.bootstrap_sha256,'updated_at',j.updated_at)
 from pi_helper.tool_jobs j join pi_helper.tool_releases r on r.version=j.version
 left join pi_helper.tool_installations i on i.room_id=j.room_id and i.group_no=j.group_no
 left join pi_helper.tool_releases old on old.version=i.version where j.id=p_job;
$$;
create or replace function pi_helper.desktop_identity(p_course_token text,p_hostname text)
returns pi_helper.course_devices language plpgsql volatile set search_path='' as $$
declare c pi_helper.course_devices%rowtype;
begin
 if p_course_token is null or p_course_token!~'^[a-f0-9]{64}$' then raise exception 'TOOL_DENIED'; end if;
 select d.* into c from pi_helper.course_devices d join pi_helper.rooms r on r.id=d.room_id
 where d.token_hash=encode(extensions.digest(p_course_token,'sha256'),'hex') and d.enabled
 and r.active and r.ends_at>now() and r.group_count>=d.group_no;
 if not found then raise exception 'TOOL_DENIED'; end if;
 if p_hostname is distinct from 'pi5-'||lpad(c.group_no::text,2,'0') then raise exception 'TOOL_HOST_MISMATCH'; end if;
 return c;
end; $$;
revoke all on function pi_helper.tool_update_mode(uuid),pi_helper.desktop_identity(text,text) from public,anon,authenticated;

create or replace function public.pi_helper_tool_desktop_status(p_course_token text,p_hostname text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c pi_helper.course_devices%rowtype; j uuid;
begin
 c:=pi_helper.desktop_identity(p_course_token,p_hostname);
 select id into j from pi_helper.tool_jobs where room_id=c.room_id and group_no=c.group_no;
 return jsonb_build_object('hostname',p_hostname,'installed_version',(select version from pi_helper.tool_installations where room_id=c.room_id and group_no=c.group_no),'job',pi_helper.tool_job_json(j));
end; $$;

create or replace function public.pi_helper_tool_desktop_request(p_course_token text,p_hostname text,p_request_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c pi_helper.course_devices%rowtype; j pi_helper.tool_jobs%rowtype; h text;
begin
 c:=pi_helper.desktop_identity(p_course_token,p_hostname);
 if p_request_secret is null or p_request_secret!~'^[a-f0-9]{64}$' then raise exception 'TOOL_DENIED'; end if;
 select * into j from pi_helper.tool_jobs where room_id=c.room_id and group_no=c.group_no for update;
 -- Recheck credentials after acquiring the job lock (same order as claim/rebind).
 c:=pi_helper.desktop_identity(p_course_token,p_hostname);
 if j.id is null or j.status in ('completed','cancelled') then raise exception 'TOOL_DENIED'; end if;
 if not exists(select 1 from pi_helper.tool_releases where version=j.version and files ? 'updater') then raise exception 'TOOL_VERSION'; end if;
 h:=encode(extensions.digest(p_request_secret,'sha256'),'hex');
 if j.request_origin='desktop' and j.request_hash=h and (j.claim_hash is not null or j.requested_at>now()-interval '20 minutes') then return pi_helper.tool_job_json(j.id); end if;
 if j.claim_hash is not null or j.status='installing' then raise exception 'TOOL_ALREADY_CLAIMED'; end if;
 if j.request_origin='desktop' and j.requested_at>now()-interval '20 minutes' then raise exception 'TOOL_REQUEST_EXISTS'; end if;
 -- Moving a browser request to the Pi always invalidates its old approval.
 update pi_helper.tool_jobs set request_origin='desktop',request_hash=h,requested_at=now(),status='pending',
 approved_until=null,approved_by=null,error_code=null,revision=revision+1,updated_at=now() where id=j.id;
 return pi_helper.tool_job_json(j.id);
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
 if j.request_origin='browser' and j.request_hash=h and j.requested_at>now()-interval '20 minutes' then return pi_helper.tool_job_json(j.id); end if;
 if j.requested_at>now()-interval '20 minutes' then raise exception 'TOOL_REQUEST_EXISTS'; end if;
 update pi_helper.tool_jobs set request_origin='browser',request_hash=h,requested_at=now(),status='pending',approved_until=null,approved_by=null,
 revision=revision+1,updated_at=now() where id=j.id;
 return pi_helper.tool_job_json(j.id);
end; $$;

-- No root device token is disclosed to the desktop app. System updates use the
-- existing privileged claim; this endpoint can only reuse both active pairings.
create or replace function public.pi_helper_tool_desktop_claim(p_course_token text,p_hostname text,p_job_id uuid,p_request_secret text,p_claim_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j pi_helper.tool_jobs%rowtype; c pi_helper.course_devices%rowtype; d pi_helper.devices%rowtype;
begin
 if p_request_secret is null or p_claim_secret is null or p_request_secret!~'^[a-f0-9]{64}$' or p_claim_secret!~'^[a-f0-9]{64}$' then raise exception 'TOOL_DENIED'; end if;
 select * into j from pi_helper.tool_jobs where id=p_job_id for update;
 c:=pi_helper.desktop_identity(p_course_token,p_hostname);
 if j.id is null or j.room_id<>c.room_id or j.group_no<>c.group_no or j.request_origin<>'desktop' or j.status='cancelled'
 or j.request_hash is distinct from encode(extensions.digest(p_request_secret,'sha256'),'hex') then raise exception 'TOOL_DENIED'; end if;
 select * into d from pi_helper.devices where room_id=c.room_id and group_no=c.group_no for update;
 perform 1 from pi_helper.course_devices where room_id=c.room_id and group_no=c.group_no for update;
 c:=pi_helper.desktop_identity(p_course_token,p_hostname);
 if pi_helper.tool_update_mode(j.id)<>'user' or not coalesce(d.enabled,false) then raise exception 'TOOL_SYSTEM_REQUIRED'; end if;
 if j.claim_hash is not null then
  if j.claim_hash<>encode(extensions.digest(p_claim_secret,'sha256'),'hex') then raise exception 'TOOL_ALREADY_CLAIMED'; end if;
  if j.claim_until<=now() or j.status not in ('installing','failed','completed') then raise exception 'TOOL_EXPIRED'; end if;
  if j.claim_device_hash is distinct from d.token_hash or j.claim_course_hash is distinct from c.token_hash then raise exception 'TOOL_DENIED'; end if;
 else
  if j.status<>'approved' or j.approved_until<=now() then raise exception 'TOOL_EXPIRED'; end if;
  update pi_helper.tool_jobs set claim_hash=encode(extensions.digest(p_claim_secret,'sha256'),'hex'),claimed_at=now(),claim_until=now()+interval '1 hour',
  device_reused=true,course_reused=true,claim_device_hash=d.token_hash,claim_course_hash=c.token_hash where id=j.id;
 end if;
 if j.status<>'completed' then update pi_helper.tool_jobs set status='installing',error_code=null,revision=revision+1,updated_at=now() where id=j.id; end if;
 return (select jsonb_build_object('version',j.version,'completed',j.status='completed','files',files,'course_token',p_course_token) from pi_helper.tool_releases where version=j.version);
end; $$;
revoke all on function public.pi_helper_tool_desktop_status(text,text),public.pi_helper_tool_desktop_request(text,text,text),public.pi_helper_tool_desktop_claim(text,text,uuid,text,text) from public;
grant execute on function public.pi_helper_tool_desktop_status(text,text),public.pi_helper_tool_desktop_request(text,text,text),public.pi_helper_tool_desktop_claim(text,text,uuid,text,text) to anon,authenticated;
insert into pi_helper.tool_releases(version,system_revision,bootstrap_sha256,files) values ('1.5.0',2,'10f86be20c049ffc52112de4fda7337dc7640334e27b0f0f8d9d232102c05dac','{"device":"b53c4e04e72bdb55d448e733a0fbb440e6e71f79b2891737e5d53f93735c182d","course":"4d5c8b1d995e90ffa1d64b16c01c98aa37d61585200aff944d29137649c803e1","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42","updater":"79a924ded115db4076b01e53f41798479300fe1873a8db6c46cd8dac696a77ee"}'::jsonb) on conflict(version) do nothing;
notify pgrst,'reload schema';
commit;
