-- Run once in the project's Supabase SQL Editor after 007_group_count.sql.
-- Additive: existing classrooms, passwords, reports and expiry dates are preserved.
begin;
set local lock_timeout='5s';
create table if not exists pi_helper.course_settings (
 room_id uuid primary key references pi_helper.rooms(id) on delete cascade,
 open_lessons jsonb not null default '{"flash":true,"ssh":true,"desktop":true,"shutdown":true}'::jsonb,
 current_lesson text not null default 'flash',current_step integer not null default 0,
 revision bigint not null default 1,updated_at timestamptz not null default now()
);
create table if not exists pi_helper.help_requests (
 id uuid primary key,room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 session_id uuid not null,group_no smallint not null check(group_no between 1 and 99),
 stage text not null check(length(stage)<=30),step text not null check(length(step)<=200),
 message text not null check(length(message)<=500),
 status text not null default 'open' check(status in ('open','claimed','waiting','resolved')),
 assignee text check(length(assignee) between 1 and 40),
 resolved_by text check(resolved_by in ('teacher','student')),
 revision bigint not null default 1,requested_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists help_one_active_session on pi_helper.help_requests(room_id,session_id) where status<>'resolved';
create index if not exists help_room_status on pi_helper.help_requests(room_id,status,requested_at);
alter table pi_helper.course_settings enable row level security;
alter table pi_helper.help_requests enable row level security;
revoke all on pi_helper.course_settings,pi_helper.help_requests from public,anon,authenticated;

create or replace function pi_helper.require_teacher(p_room_code text,p_teacher_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select * into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found or not pi_helper.password_matches(p_teacher_code,r.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 return r.id;
end; $$;
create or replace function pi_helper.require_student(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_room uuid;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 or p_session_secret is null or length(p_session_secret) not between 32 and 128 then raise exception 'SESSION_DENIED'; end if;
 select r.id into v_room from pi_helper.rooms r join pi_helper.reports s on s.room_id=r.id
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') and s.session_id=p_session_id
 and s.group_no=p_group_no and s.token_hash=encode(extensions.digest(p_session_secret,'sha256'),'hex');
 if not found then raise exception 'SESSION_DENIED'; end if;
 return v_room;
end; $$;
create or replace function pi_helper.course_json(p_room uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('open_lessons',s.open_lessons,'current_lesson',s.current_lesson,'current_step',s.current_step,'revision',s.revision) from pi_helper.course_settings s where s.room_id=p_room),'{"open_lessons":{"flash":true,"ssh":true,"desktop":true,"shutdown":true},"current_lesson":"flash","current_step":0,"revision":0}'::jsonb);
$$;
revoke all on function pi_helper.require_teacher(text,text),pi_helper.require_student(text,uuid,text,smallint),pi_helper.course_json(uuid) from public,anon,authenticated;

create or replace function public.pi_helper_course_settings(p_room_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select id into v_room from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') and active and ends_at>now();
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 return pi_helper.course_json(v_room);
end; $$;
create or replace function public.pi_helper_teacher_course_settings(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return pi_helper.course_json(pi_helper.require_teacher(p_room_code,p_teacher_code)); end; $$;
create or replace function public.pi_helper_teacher_set_course(p_room_code text,p_teacher_code text,p_open_lessons jsonb,p_current_lesson text,p_current_step integer,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_existing bigint; v_key text; v_max integer;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 -- Serialize both the initial insert and later edits across teachers.
 perform 1 from pi_helper.rooms where id=v_room for update;
 if p_open_lessons is null or jsonb_typeof(p_open_lessons)<>'object' then raise exception 'INVALID_LESSON'; end if;
 if (select count(*) from jsonb_object_keys(p_open_lessons))<>4 then raise exception 'INVALID_LESSON'; end if;
 foreach v_key in array array['flash','ssh','desktop','shutdown'] loop
  if jsonb_typeof(p_open_lessons->v_key) is distinct from 'boolean' then raise exception 'INVALID_LESSON'; end if;
 end loop;
 if p_open_lessons->'shutdown'<>'true'::jsonb then raise exception 'SHUTDOWN_REQUIRED'; end if;
 v_max:=case p_current_lesson when 'flash' then 13 when 'ssh' then 3 when 'desktop' then 8 when 'shutdown' then 2 else null end;
 if v_max is null or p_current_step is null or p_current_step<0 or p_current_step>v_max then raise exception 'INVALID_LESSON'; end if;
 select revision into v_existing from pi_helper.course_settings where room_id=v_room;
 if p_revision is null or p_revision<>coalesce(v_existing,0) then raise exception 'COURSE_CONFLICT'; end if;
 insert into pi_helper.course_settings(room_id,open_lessons,current_lesson,current_step,revision)
 values(v_room,p_open_lessons,p_current_lesson,p_current_step,1)
 on conflict(room_id) do update set open_lessons=excluded.open_lessons,current_lesson=excluded.current_lesson,current_step=excluded.current_step,revision=pi_helper.course_settings.revision+1,updated_at=now();
 return pi_helper.course_json(v_room);
end; $$;

create or replace function public.pi_helper_request_help(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,p_request_id uuid,p_stage text,p_step text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_active boolean; v_end timestamptz; v_groups integer; result pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 select active,ends_at,group_count into v_active,v_end,v_groups from pi_helper.rooms where id=v_room;
 if not v_active or v_end<=now() then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_group_no is null or p_group_no<1 or p_group_no>v_groups then raise exception 'INVALID_GROUP'; end if;
 if p_request_id is null or p_stage is null or length(p_stage)>30 or p_step is null or length(p_step)>200 or p_message is null or length(p_message) not between 1 and 500 then raise exception 'INVALID_REPORT'; end if;
 perform 1 from pi_helper.reports where room_id=v_room and session_id=p_session_id for update;
 select * into result from pi_helper.help_requests where id=p_request_id;
 if found then
  if result.room_id<>v_room or result.session_id<>p_session_id then raise exception 'SESSION_DENIED'; end if;
  return to_jsonb(result)-'room_id'-'session_id';
 end if;
 insert into pi_helper.help_requests(id,room_id,session_id,group_no,stage,step,message)
 values(p_request_id,v_room,p_session_id,p_group_no,p_stage,p_step,p_message)
 on conflict(room_id,session_id) where status<>'resolved' do update set
 stage=excluded.stage,step=excluded.step,message=excluded.message,
 status=case when pi_helper.help_requests.status='waiting' then 'open' else pi_helper.help_requests.status end,
 assignee=case when pi_helper.help_requests.status='waiting' then null else pi_helper.help_requests.assignee end,
 revision=pi_helper.help_requests.revision+1,updated_at=now()
 returning * into result;
 return to_jsonb(result)-'room_id'-'session_id';
end; $$;
create or replace function public.pi_helper_teacher_help(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 return coalesce((select jsonb_agg(to_jsonb(h)-'room_id'-'session_id' order by h.requested_at) from
 (select * from pi_helper.help_requests where room_id=v_room and (status<>'resolved' or updated_at>now()-interval '1 day') order by requested_at desc limit 500) h),'[]'::jsonb);
end; $$;
create or replace function public.pi_helper_teacher_update_help(p_room_code text,p_teacher_code text,p_id uuid,p_status text,p_assignee text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; r pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 select * into r from pi_helper.help_requests where room_id=v_room and id=p_id for update;
 if not found then raise exception 'HELP_NOT_FOUND'; end if;
 if p_revision is null or p_revision<>r.revision then raise exception 'HELP_CONFLICT'; end if;
 if p_status is null or p_status not in ('open','claimed','waiting','resolved') or r.status='resolved' then raise exception 'INVALID_STATE'; end if;
 if p_status in ('claimed','waiting') and (p_assignee is null or length(trim(p_assignee)) not between 1 and 40) then raise exception 'INVALID_ASSIGNEE'; end if;
 update pi_helper.help_requests set status=p_status,assignee=case when p_status='open' then null else nullif(trim(p_assignee),'') end,
 resolved_by=case when p_status='resolved' then 'teacher' else null end,revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return to_jsonb(r)-'room_id'-'session_id';
end; $$;
create or replace function public.pi_helper_student_help(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 return coalesce((select jsonb_agg(to_jsonb(h)-'room_id'-'session_id' order by h.requested_at desc) from
 (select * from pi_helper.help_requests where room_id=v_room and session_id=p_session_id and group_no=p_group_no order by requested_at desc limit 10) h),'[]'::jsonb);
end; $$;
create or replace function public.pi_helper_student_confirm_help(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,p_id uuid,p_resolved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; r pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 select * into r from pi_helper.help_requests where room_id=v_room and session_id=p_session_id and group_no=p_group_no and id=p_id for update;
 if not found then raise exception 'HELP_NOT_FOUND'; end if;
 if r.status<>'waiting' or p_resolved is null then raise exception 'HELP_NOT_WAITING'; end if;
 update pi_helper.help_requests set status=case when p_resolved then 'resolved' else 'open' end,
 assignee=case when p_resolved then assignee else null end,resolved_by=case when p_resolved then 'student' else null end,revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return to_jsonb(r)-'room_id'-'session_id';
end; $$;
revoke all on function public.pi_helper_course_settings(text),public.pi_helper_teacher_course_settings(text,text),public.pi_helper_teacher_set_course(text,text,jsonb,text,integer,bigint),public.pi_helper_request_help(text,uuid,text,smallint,uuid,text,text,text),public.pi_helper_teacher_help(text,text),public.pi_helper_teacher_update_help(text,text,uuid,text,text,bigint),public.pi_helper_student_help(text,uuid,text,smallint),public.pi_helper_student_confirm_help(text,uuid,text,smallint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.pi_helper_course_settings(text),public.pi_helper_teacher_course_settings(text,text),public.pi_helper_teacher_set_course(text,text,jsonb,text,integer,bigint),public.pi_helper_request_help(text,uuid,text,smallint,uuid,text,text,text),public.pi_helper_teacher_help(text,text),public.pi_helper_teacher_update_help(text,text,uuid,text,text,bigint),public.pi_helper_student_help(text,uuid,text,smallint),public.pi_helper_student_confirm_help(text,uuid,text,smallint,uuid,boolean) to anon;
notify pgrst,'reload schema';
commit;
