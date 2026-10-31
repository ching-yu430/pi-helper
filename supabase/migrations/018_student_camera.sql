-- AI student camera verification; append-only, retains earlier devices and tasks.
begin;
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
 if v_task is null or v_task not in ('location','folders','hello','write','update','install','environment','camera','student_camera','photo','camera_exit') or state is null or state not in ('running','passed','failed','cancelled') or jsonb_typeof(e) is distinct from 'object' then raise exception 'INVALID_COURSE_EVENT'; end if;
 foreach k in array array['folders_ok','group_output','new_file','cv2_ok','tk_ok','v4l_ok','readable','released','fresh_photo','camera_reopened'] loop
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
 foreach k in array array['cwd','python_version','opencv_version','os','arch','device','file_name','program_version','error_code','verifier','script_name'] loop
  if e ? k then
   value:=e->k;if jsonb_typeof(value)<>'string' or length(value#>>'{}')>160 or value#>>'{}'~'[[:cntrl:]]' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='cwd' and value#>>'{}' not in ('home','project','photos','other') then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='device' and value#>>'{}'!~'^/dev/video[0-9]{1,3}$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='file_name' and value#>>'{}'!~'^pi5-[0-9]{2}_(practice_[0-9_]+_[a-f0-9]{8}|[0-9]{8}_[0-9]{6}_[0-9]{6})\.jpg$' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='verifier' and value#>>'{}'<>'student-v1' then raise exception 'INVALID_COURSE_EVENT'; end if;
   if k='script_name' and value#>>'{}' is distinct from 'pi5-'||lpad(d.group_no::text,2,'0')||'_camera.py' then raise exception 'COURSE_HOST_MISMATCH'; end if;
   if k='error_code' and value#>>'{}' not in ('wrong_host','wrong_directory','missing_folder','missing_script','python_failed','wrong_group','write_missing','write_unchanged','apt_failed','apt_network','environment_missing','camera_missing','camera_busy','camera_read','camera_size','save_failed','interrupted','timeout','unknown','photo_missing','photo_name','photo_overwritten','photo_limit') then raise exception 'INVALID_COURSE_EVENT'; end if;
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
   when 'student_camera' then clean->>'verifier'='student-v1' and clean->>'exit_code'='0' and clean ? 'script_name'
   when 'camera' then clean->'readable'='true'::jsonb and (clean->>'width')::bigint>0 and (clean->>'height')::bigint>0
   when 'photo' then clean->'readable'='true'::jsonb and clean->>'width'='1920' and clean->>'height'='1080' and (clean->>'bytes')::bigint>0 and clean ? 'file_name' and (case when clean->>'verifier'='student-v1' then clean->'fresh_photo'='true'::jsonb and clean->>'file_name'~'^pi5-[0-9]{2}_[0-9]{8}_[0-9]{6}_[0-9]{6}\.jpg$' else clean->>'file_name'~'^pi5-[0-9]{2}_practice_[0-9_]+_[a-f0-9]{8}\.jpg$' end)
   when 'camera_exit' then case when clean->>'verifier'='student-v1' then clean->'camera_reopened'='true'::jsonb else clean->'released'='true'::jsonb end
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
 select coalesce((select jsonb_build_object('student_camera_supported',true,'group_no',d.group_no,'enabled',d.enabled,'received_at',d.received_at,
 'age_seconds',case when d.received_at is null then null else greatest(0,extract(epoch from now()-d.received_at)) end,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('task',t.task,'status',t.status,'run_id',t.run_id,
 'sequence',t.sequence,'evidence',t.evidence,'received_at',t.received_at) order by t.sequence)
 from pi_helper.course_tasks t where t.room_id=d.room_id and t.group_no=d.group_no),'[]'::jsonb))
 ||case when p_private then jsonb_build_object('network',d.network) else '{}'::jsonb end
 from pi_helper.course_devices d where d.room_id=p_room and d.group_no=p_group),
 jsonb_build_object('student_camera_supported',true,'group_no',p_group,'enabled',false,'received_at',null,'age_seconds',null,'tasks','[]'::jsonb));
$$;
revoke all on function pi_helper.camera_progress(uuid,smallint,boolean) from public,anon,authenticated;

insert into pi_helper.tool_releases(version,bootstrap_sha256,files) values ('1.1.0','f72ae8edbb7d9c1ac1373f3de80d92e82a81cd6f4c2e54ecf711ae42e5fef570','{"device":"8d7c9e27aeff174f269d5c8ce88ad9f79e2dd92c92c29daeb9da5551d44c6d81","course":"c075c9b438eb92ec6e0262f532a650a65f78b3afa779536a3a72f1611e04eb24","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42"}'::jsonb) on conflict(version) do nothing;
notify pgrst,'reload schema';
commit;
