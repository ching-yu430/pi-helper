-- Read-only device telemetry. Each Pi has its own revocable, random credential.
begin;
set local lock_timeout='5s';
create table if not exists pi_helper.devices (
 room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 group_no smallint not null check(group_no between 1 and 99),
 token_hash text not null unique, enabled boolean not null default true,
 paired_at timestamptz not null default now(), received_at timestamptz,
 snapshot jsonb, primary key(room_id,group_no)
);
alter table pi_helper.devices enable row level security;
revoke all on pi_helper.devices from public,anon,authenticated;

create or replace function pi_helper.device_json(p_room uuid,p_group smallint)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('group_no',group_no,'enabled',enabled,
 'received_at',received_at,'age_seconds',case when received_at is null then null else greatest(0,extract(epoch from now()-received_at)) end,
 'snapshot',snapshot) from pi_helper.devices where room_id=p_room and group_no=p_group),
 jsonb_build_object('group_no',p_group,'enabled',false,'received_at',null,'age_seconds',null,'snapshot',null));
$$;
revoke all on function pi_helper.device_json(uuid,smallint) from public,anon,authenticated;

create or replace function public.pi_helper_teacher_pair_device(p_room_code text,p_teacher_code text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; token text; count_groups smallint;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 select group_count into count_groups from pi_helper.rooms where id=r for update;
 if p_group_no is null or p_group_no<1 or p_group_no>count_groups then raise exception 'INVALID_GROUP'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into pi_helper.devices(room_id,group_no,token_hash) values(r,p_group_no,encode(extensions.digest(token,'sha256'),'hex'))
 on conflict(room_id,group_no) do update set token_hash=excluded.token_hash,enabled=true,paired_at=now(),received_at=null,snapshot=null;
 return jsonb_build_object('group_no',p_group_no,'device_token',token,'expected_hostname','pi5-'||lpad(p_group_no::text,2,'0'));
end; $$;

create or replace function public.pi_helper_teacher_disable_device(p_room_code text,p_teacher_code text,p_group_no smallint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 if p_group_no is null or p_group_no<1 or p_group_no>99 then raise exception 'INVALID_GROUP'; end if;
 update pi_helper.devices set enabled=false where room_id=r and group_no=p_group_no;
 return true;
end; $$;

create or replace function public.pi_helper_device_report(p_device_token text,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare d pi_helper.devices%rowtype; clean jsonb; key text; value jsonb;
begin
 if p_device_token is null or p_device_token!~'^[a-f0-9]{64}$' then raise exception 'DEVICE_DENIED'; end if;
 select * into d from pi_helper.devices where token_hash=encode(extensions.digest(p_device_token,'sha256'),'hex') and enabled for update;
 if not found then raise exception 'DEVICE_DENIED'; end if;
 if not exists(select 1 from pi_helper.rooms where id=d.room_id and active and ends_at>now() and group_count>=d.group_no) then raise exception 'ROOM_NOT_FOUND'; end if;
 if d.received_at>now()-interval '15 seconds' then raise exception 'DEVICE_TOO_FREQUENT'; end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>4096 then raise exception 'INVALID_DEVICE_REPORT'; end if;
 if p_snapshot->>'hostname' is null or p_snapshot->>'hostname'!~'^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$' then raise exception 'INVALID_DEVICE_REPORT'; end if;
 if jsonb_typeof(p_snapshot->'hostname') is distinct from 'string' then raise exception 'INVALID_DEVICE_REPORT'; end if;
 clean:=jsonb_build_object('hostname',p_snapshot->>'hostname');
 foreach key in array array['ssh','xrdp'] loop
  value:=p_snapshot->key;
  if value is null or jsonb_typeof(value) is distinct from 'string' or value#>>'{}' not in ('active','inactive','failed','activating','deactivating','unknown','missing') then raise exception 'INVALID_DEVICE_REPORT'; end if;
  clean:=clean||jsonb_build_object(key,value);
 end loop;
 if jsonb_typeof(p_snapshot->'display') is distinct from 'string' or p_snapshot->>'display' not in ('x11','wayland','unknown') then raise exception 'INVALID_DEVICE_REPORT'; end if;
 clean:=clean||jsonb_build_object('display',p_snapshot->'display');
 foreach key in array array['xrdp_installed','xorgxrdp_installed'] loop
  value:=p_snapshot->key;
  if value is null or jsonb_typeof(value) not in ('boolean','null') then raise exception 'INVALID_DEVICE_REPORT'; end if;
  clean:=clean||jsonb_build_object(key,value);
 end loop;
 foreach key in array array['usb_cameras','free_mb','uptime_seconds'] loop
  value:=p_snapshot->key;
  if value is null or (jsonb_typeof(value)<>'null' and (jsonb_typeof(value)<>'number' or value#>>'{}'!~'^[0-9]{1,10}$')) then raise exception 'INVALID_DEVICE_REPORT'; end if;
  if key='usb_cameras' and jsonb_typeof(value)='number' and (value#>>'{}')::numeric>64 then raise exception 'INVALID_DEVICE_REPORT'; end if;
  clean:=clean||jsonb_build_object(key,value);
 end loop;
 value:=p_snapshot->'python_version';
 if value is null or (jsonb_typeof(value)<>'null' and (jsonb_typeof(value)<>'string' or value#>>'{}'!~'^Python [0-9]+\.[0-9]+\.[0-9]+$' or length(value#>>'{}')>40)) then raise exception 'INVALID_DEVICE_REPORT'; end if;
 clean:=clean||jsonb_build_object('python_version',value,'reporter_version','1');
 -- Drop every unrecognised field; never store logs, Wi-Fi credentials or files.
 update pi_helper.devices set received_at=now(),snapshot=clean where room_id=d.room_id and group_no=d.group_no;
 return true;
end; $$;

create or replace function public.pi_helper_teacher_devices(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 return coalesce((select jsonb_agg(pi_helper.device_json(r,n::smallint) order by n)
 from generate_series(1,(select group_count from pi_helper.rooms where id=r)) n),'[]'::jsonb);
end; $$;

create or replace function public.pi_helper_student_device(p_room_code text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 select id into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') and active and ends_at>now() and p_group_no between 1 and group_count;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 return pi_helper.device_json(r,p_group_no);
end; $$;

revoke all on function public.pi_helper_teacher_pair_device(text,text,smallint),public.pi_helper_teacher_disable_device(text,text,smallint),public.pi_helper_device_report(text,jsonb),public.pi_helper_teacher_devices(text,text),public.pi_helper_student_device(text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_pair_device(text,text,smallint),public.pi_helper_teacher_disable_device(text,text,smallint),public.pi_helper_device_report(text,jsonb),public.pi_helper_teacher_devices(text,text),public.pi_helper_student_device(text,smallint) to anon;
notify pgrst,'reload schema';
commit;
