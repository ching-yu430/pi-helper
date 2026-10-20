begin;
set local lock_timeout='5s';
-- Existing clients may still send four lesson flags. Preserve the camera flag.
create or replace function pi_helper.course_json(p_room uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('open_lessons','{"camera":false}'::jsonb||s.open_lessons,
 'current_lesson',s.current_lesson,'current_step',s.current_step,'revision',s.revision,
 'teaching_paused',s.teaching_paused,'pause_supported',true,'camera_supported',true)
 from pi_helper.course_settings s where s.room_id=p_room),
 '{"open_lessons":{"flash":true,"ssh":true,"desktop":true,"shutdown":true,"camera":false},"current_lesson":"flash","current_step":0,"revision":0,"teaching_paused":false,"pause_supported":true,"camera_supported":true}'::jsonb);
$$;
create or replace function public.pi_helper_teacher_set_course(p_room_code text,p_teacher_code text,p_open_lessons jsonb,p_current_lesson text,p_current_step integer,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; existing jsonb; k text; maximum integer;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=r for update;
 existing:=pi_helper.course_json(r);
 if p_open_lessons is null or jsonb_typeof(p_open_lessons)<>'object' then raise exception 'INVALID_LESSON'; end if;
 if exists(select 1 from jsonb_object_keys(p_open_lessons) x where x not in ('flash','ssh','desktop','shutdown','camera')) then raise exception 'INVALID_LESSON'; end if;
 foreach k in array array['flash','ssh','desktop','shutdown'] loop
  if jsonb_typeof(p_open_lessons->k) is distinct from 'boolean' then raise exception 'INVALID_LESSON'; end if;
 end loop;
 if p_open_lessons ? 'camera' and jsonb_typeof(p_open_lessons->'camera') is distinct from 'boolean' then raise exception 'INVALID_LESSON'; end if;
 p_open_lessons:=jsonb_build_object('camera',existing->'open_lessons'->'camera')||p_open_lessons;
 if p_open_lessons->'shutdown'<>'true'::jsonb then raise exception 'SHUTDOWN_REQUIRED'; end if;
 maximum:=case p_current_lesson when 'flash' then 13 when 'ssh' then 3 when 'desktop' then 8 when 'shutdown' then 2 when 'camera' then 7 else null end;
 if maximum is null or p_current_step is null or p_current_step<0 or p_current_step>maximum then raise exception 'INVALID_LESSON'; end if;
 if p_revision is null or p_revision<>(existing->>'revision')::bigint then raise exception 'COURSE_CONFLICT'; end if;
 insert into pi_helper.course_settings(room_id,open_lessons,current_lesson,current_step,revision)
 values(r,p_open_lessons,p_current_lesson,p_current_step,1)
 on conflict(room_id) do update set open_lessons=excluded.open_lessons,current_lesson=excluded.current_lesson,
 current_step=excluded.current_step,revision=pi_helper.course_settings.revision+1,updated_at=now();
 return pi_helper.course_json(r);
end; $$;

create table if not exists pi_helper.course_devices (
 room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 group_no smallint not null check(group_no between 1 and 99),token_hash text not null unique,
 enabled boolean not null default true,last_sequence bigint not null default 0,
 paired_at timestamptz not null default now(),received_at timestamptz,network jsonb not null default '[]',
 primary key(room_id,group_no)
);
create table if not exists pi_helper.course_tasks (
 room_id uuid not null,group_no smallint not null,task text not null,run_id uuid not null,
 sequence bigint not null,status text not null check(status in ('running','passed','failed','cancelled')),
 evidence jsonb not null,received_at timestamptz not null default now(),
 primary key(room_id,group_no,task),
 foreign key(room_id,group_no) references pi_helper.course_devices(room_id,group_no) on delete cascade
);
alter table pi_helper.course_devices enable row level security;
alter table pi_helper.course_tasks enable row level security;
revoke all on pi_helper.course_devices,pi_helper.course_tasks from public,anon,authenticated;

create or replace function public.pi_helper_teacher_pair_course(p_room_code text,p_teacher_code text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; token text;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=r for update;
 if p_group_no is null or not exists(select 1 from pi_helper.rooms where id=r and p_group_no between 1 and group_count) then raise exception 'INVALID_GROUP'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into pi_helper.course_devices(room_id,group_no,token_hash) values(r,p_group_no,encode(extensions.digest(token,'sha256'),'hex'))
 on conflict(room_id,group_no) do update set token_hash=excluded.token_hash,enabled=true,last_sequence=0,paired_at=now(),received_at=null,network='[]';
 delete from pi_helper.course_tasks where room_id=r and group_no=p_group_no;
 return jsonb_build_object('course_token',token,'expected_hostname','pi5-'||lpad(p_group_no::text,2,'0'));
end; $$;
create or replace function public.pi_helper_teacher_disable_course(p_room_code text,p_teacher_code text,p_group_no smallint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update pi_helper.course_devices set enabled=false where room_id=pi_helper.require_teacher(p_room_code,p_teacher_code) and group_no=p_group_no;
 return true;
end; $$;

create or replace function public.pi_helper_course_event(p_course_token text,p_event jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare d pi_helper.course_devices%rowtype; v_task text; state text; seq bigint; run uuid; e jsonb; clean jsonb:='{}'; k text; value jsonb; v_network jsonb:='[]'; item jsonb; address inet; valid boolean:=false;
begin
 if p_course_token is null or p_course_token!~'^[a-f0-9]{64}$' then raise exception 'COURSE_DEVICE_DENIED'; end if;
 select * into d from pi_helper.course_devices where token_hash=encode(extensions.digest(p_course_token,'sha256'),'hex') and enabled for update;
 if not found then raise exception 'COURSE_DEVICE_DENIED'; end if;
 if not exists(select 1 from pi_helper.rooms where id=d.room_id and active and ends_at>now() and group_count>=d.group_no) then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_event is null or jsonb_typeof(p_event)<>'object' or octet_length(p_event::text)>8192 then raise exception 'INVALID_COURSE_EVENT'; end if;
 if p_event->>'hostname' is distinct from 'pi5-'||lpad(d.group_no::text,2,'0') then raise exception 'COURSE_HOST_MISMATCH'; end if;
 if coalesce(p_event->>'sequence','')!~'^[1-9][0-9]{0,14}$' or jsonb_typeof(p_event->'sequence') is distinct from 'number' then raise exception 'INVALID_COURSE_EVENT'; end if;
 seq:=(p_event->>'sequence')::bigint;
 -- Retrying an already accepted event is safe, even after a later event arrived.
 if seq<=d.last_sequence then return true; end if;
 if coalesce(p_event->>'run_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_COURSE_EVENT'; end if;
 run:=(p_event->>'run_id')::uuid;v_task:=p_event->>'task';state:=p_event->>'status';e:=p_event->'evidence';
 if v_task is null or v_task not in ('location','folders','hello','write','update','install','environment','camera','photo','camera_exit') or state is null or state not in ('running','passed','failed','cancelled') or jsonb_typeof(e) is distinct from 'object' then raise exception 'INVALID_COURSE_EVENT'; end if;
 foreach k in array array['folders_ok','group_output','new_file','cv2_ok','tk_ok','v4l_ok','readable','released'] loop
  if e ? k then
   value:=e->k;if jsonb_typeof(value)<>'boolean' then raise exception 'INVALID_COURSE_EVENT'; end if;
   clean:=clean||jsonb_build_object(k,value);
  end if;
 end loop;
 foreach k in array array['width','height','photo_count','bytes','warning_count','exit_code'] loop
  if e ? k then
   value:=e->k;if jsonb_typeof(value)<>'number' or value#>>'{}'!~'^[0-9]{1,10}$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   clean:=clean||jsonb_build_object(k,value);
  end if;
 end loop;
 foreach k in array array['cwd','python_version','opencv_version','os','arch','device','file_name','program_version','error_code'] loop
  if e ? k then
   value:=e->k;if jsonb_typeof(value)<>'string' or length(value#>>'{}')>160 or value#>>'{}'~'[[:cntrl:]]' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='cwd' and value#>>'{}' not in ('home','project','photos','other') then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='device' and value#>>'{}'!~'^/dev/video[0-9]{1,3}$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='file_name' and value#>>'{}'!~'^pi5-[0-9]{2}_practice_[0-9_]+_[a-f0-9]{8}\.jpg$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='error_code' and value#>>'{}' not in ('wrong_host','wrong_directory','missing_folder','missing_script','python_failed','wrong_group','write_missing','write_unchanged','apt_failed','apt_network','environment_missing','camera_missing','camera_busy','camera_read','camera_size','save_failed','interrupted','timeout','unknown') then raise exception 'INVALID_COURSE_EVENT'; end if;
   clean:=clean||jsonb_build_object(k,value);
  end if;
 end loop;
 if state='passed' then
  valid:=case v_task
   when 'location' then clean->>'cwd' in ('home','project','photos')
   when 'folders' then clean->'folders_ok'='true'::jsonb
   when 'hello' then clean->'group_output'='true'::jsonb and clean->>'exit_code'='0'
   when 'write' then clean->'group_output'='true'::jsonb and clean->'new_file'='true'::jsonb and clean->>'exit_code'='0'
   when 'update' then clean->>'exit_code'='0' and not clean ? 'error_code'
   when 'install' then clean->>'exit_code'='0'
   when 'environment' then clean->'cv2_ok'='true'::jsonb and clean->'tk_ok'='true'::jsonb and clean->'v4l_ok'='true'::jsonb and clean ? 'device'
   when 'camera' then clean->'readable'='true'::jsonb and (clean->>'width')::bigint>0 and (clean->>'height')::bigint>0
   when 'photo' then clean->'readable'='true'::jsonb and clean->>'width'='1920' and clean->>'height'='1080' and (clean->>'bytes')::bigint>0 and clean ? 'file_name'
   when 'camera_exit' then clean->'released'='true'::jsonb
   else false end;
  if valid is distinct from true then raise exception 'INVALID_COURSE_EVENT'; end if;
  if v_task='photo' and left(clean->>'file_name',6) is distinct from 'pi5-'||lpad(d.group_no::text,2,'0') then raise exception 'COURSE_HOST_MISMATCH'; end if;
 end if;
 if p_event ? 'network' then
  if jsonb_typeof(p_event->'network')<>'array' or jsonb_array_length(p_event->'network')>8 then raise exception 'INVALID_COURSE_EVENT'; end if;
  for item in select * from jsonb_array_elements(p_event->'network') loop
   if jsonb_typeof(item)<>'object' or coalesce(item->>'interface','')!~'^[a-zA-Z0-9_.:-]{1,30}$' or coalesce(item->>'ip','')!~'^[0-9.]{7,15}$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   begin address:=(item->>'ip')::inet;exception when others then raise exception 'INVALID_COURSE_EVENT';end;
   if not (address<<inet '10.0.0.0/8' or address<<inet '172.16.0.0/12' or address<<inet '192.168.0.0/16') then raise exception 'INVALID_COURSE_EVENT'; end if;
   v_network:=v_network||jsonb_build_array(jsonb_build_object('interface',item->>'interface','ip',host(address)));
  end loop;
 else v_network:=d.network;
 end if;
 insert into pi_helper.course_tasks(room_id,group_no,task,run_id,sequence,status,evidence)
 values(d.room_id,d.group_no,v_task,run,seq,state,clean)
 on conflict(room_id,group_no,task) do update set run_id=excluded.run_id,sequence=excluded.sequence,status=excluded.status,evidence=excluded.evidence,received_at=now();
 update pi_helper.course_devices set last_sequence=seq,received_at=now(),network=v_network where room_id=d.room_id and group_no=d.group_no;
 return true;
end; $$;

create or replace function pi_helper.camera_progress(p_room uuid,p_group smallint,p_private boolean)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('group_no',d.group_no,'enabled',d.enabled,'received_at',d.received_at,
 'age_seconds',case when d.received_at is null then null else greatest(0,extract(epoch from now()-d.received_at)) end,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('task',t.task,'status',t.status,'run_id',t.run_id,
 'sequence',t.sequence,'evidence',t.evidence,'received_at',t.received_at) order by t.sequence)
 from pi_helper.course_tasks t where t.room_id=d.room_id and t.group_no=d.group_no),'[]'::jsonb))
 ||case when p_private then jsonb_build_object('network',d.network) else '{}'::jsonb end
 from pi_helper.course_devices d where d.room_id=p_room and d.group_no=p_group),
 jsonb_build_object('group_no',p_group,'enabled',false,'received_at',null,'age_seconds',null,'tasks','[]'::jsonb));
$$;
revoke all on function pi_helper.camera_progress(uuid,smallint,boolean) from public,anon,authenticated;
create or replace function public.pi_helper_student_camera(p_room_code text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 select id into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') and active and ends_at>now() and p_group_no between 1 and group_count;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 return pi_helper.camera_progress(r,p_group_no,false);
end; $$;
create or replace function public.pi_helper_teacher_camera(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 return (select jsonb_agg(pi_helper.camera_progress(r,n::smallint,true) order by n) from generate_series(1,(select group_count from pi_helper.rooms where id=r)) n);
end; $$;
revoke all on function public.pi_helper_teacher_pair_course(text,text,smallint),public.pi_helper_teacher_disable_course(text,text,smallint),public.pi_helper_course_event(text,jsonb),public.pi_helper_student_camera(text,smallint),public.pi_helper_teacher_camera(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_pair_course(text,text,smallint),public.pi_helper_teacher_disable_course(text,text,smallint),public.pi_helper_course_event(text,jsonb),public.pi_helper_student_camera(text,smallint),public.pi_helper_teacher_camera(text,text) to anon;
notify pgrst,'reload schema';
commit;
