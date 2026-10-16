-- 在 Supabase SQL Editor 執行一次。只建立本工具專用的 schema、資料表與函式。
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists pi_helper;
revoke all on schema pi_helper from public, anon, authenticated;
create table if not exists pi_helper.rooms (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 join_hash text unique not null,
 teacher_hash text not null,
 active boolean not null default true,
 ends_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists pi_helper.reports (
 room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 session_id uuid not null,
 token_hash text not null,
 group_no smallint not null check(group_no between 1 and 9),
 stage text not null check(length(stage)<=30),
 step text not null check(length(step)<=200),
 result text not null check(length(result)<=500),
 state text not null check(state in ('working','need_help','done','ended')),
 cleared_at timestamptz,
 revision bigint not null,
 updated_at timestamptz not null default now(),
 primary key(room_id,session_id)
);
alter table pi_helper.reports add column if not exists cleared_at timestamptz;
alter table pi_helper.rooms enable row level security;
alter table pi_helper.reports enable row level security;
revoke all on all tables in schema pi_helper from public, anon, authenticated;
create index if not exists reports_room_updated on pi_helper.reports(room_id,updated_at desc);

create or replace function public.pi_helper_student_join(p_room_code text)
returns text language plpgsql security definer set search_path='' as $$
declare v_title text;
begin
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select r.title into v_title from pi_helper.rooms r
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex')
 and r.active and r.ends_at>now();
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 return v_title;
end; $$;

create or replace function public.pi_helper_student_report(
 p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,
 p_stage text,p_step text,p_result text,p_status text,p_revision bigint)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_token text; v_time timestamptz;
begin
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select r.id into v_room from pi_helper.rooms r
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex')
 and r.active and r.ends_at>now();
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_session_id is null or p_session_secret is null or length(p_session_secret)<32 or length(p_session_secret)>128
 or p_group_no is null or p_group_no<1 or p_group_no>9 or p_revision is null or p_revision<1
 or p_stage is null or length(p_stage)>30 or p_step is null or length(p_step)>200
 or p_result is null or length(p_result)>500 or p_status is null or p_status not in ('working','need_help','done','ended')
 then raise exception 'INVALID_REPORT'; end if;
 v_token:=encode(extensions.digest(p_session_secret,'sha256'),'hex');
 insert into pi_helper.reports as current_report(room_id,session_id,token_hash,group_no,stage,step,result,state,revision,updated_at)
 values(v_room,p_session_id,v_token,p_group_no,p_stage,p_step,p_result,p_status,p_revision,now())
 on conflict(room_id,session_id) do update set
 stage=excluded.stage,step=excluded.step,result=excluded.result,state=excluded.state,
 revision=excluded.revision,updated_at=now(),cleared_at=null
 where current_report.token_hash=excluded.token_hash and current_report.group_no=excluded.group_no
 and current_report.revision<excluded.revision
 returning updated_at into v_time;
 if v_time is null then
  select r.updated_at into v_time from pi_helper.reports r
  where r.room_id=v_room and r.session_id=p_session_id and r.token_hash=v_token and r.group_no=p_group_no;
  if not found then raise exception 'SESSION_DENIED'; end if;
 end if;
 return v_time;
end; $$;

revoke execute on function public.pi_helper_student_join(text) from public,anon,authenticated;
revoke execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.pi_helper_student_join(text) to anon;
grant execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) to anon;
create or replace function pi_helper.password_matches(p_password text,p_hash text)
returns boolean language sql set search_path='' as $$
 select case when p_password is null or p_password='' or p_hash is null then false
 when left(p_hash,14)='sha256-bcrypt$' then
 extensions.crypt(encode(extensions.digest(p_password,'sha256'),'hex'),substr(p_hash,15))=substr(p_hash,15)
 else extensions.crypt(p_password,p_hash)=p_hash end;
$$;
revoke execute on function pi_helper.password_matches(text,text) from public,anon,authenticated;
create or replace function public.pi_helper_teacher_reports(p_room_code text,p_teacher_code text)
returns table(session_id uuid,group_no smallint,stage text,step text,result text,state text,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_teacher_hash text;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.id,r.teacher_hash into v_room,v_teacher_hash from pi_helper.rooms r
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 return query
 select ranked.session_id,ranked.group_no,ranked.stage,ranked.step,ranked.result,ranked.state,ranked.updated_at
 from (
  select r.*,row_number() over(partition by r.group_no order by r.updated_at desc,r.session_id) as position
  from pi_helper.reports r where r.room_id=v_room and r.cleared_at is null
 ) ranked where ranked.position<=20 order by ranked.updated_at desc;
end; $$;
create or replace function public.pi_helper_teacher_room_info(p_room_code text,p_teacher_code text)
returns table(title text,ends_at timestamptz,active boolean)
language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 return query select v_room.title,v_room.ends_at,v_room.active;
end; $$;
create or replace function public.pi_helper_teacher_set_expiry(p_room_code text,p_teacher_code text,p_ends_at timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 if p_ends_at is null or not isfinite(p_ends_at) or p_ends_at<=now() then raise exception 'INVALID_EXPIRY'; end if;
 update pi_helper.rooms set ends_at=p_ends_at where id=v_room.id;
 return p_ends_at;
end; $$;
create or replace function public.pi_helper_teacher_set_open(p_room_code text,p_teacher_code text,p_active boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 if p_active is null then raise exception 'INVALID_STATE'; end if;
 if p_active and v_room.ends_at<=now() then raise exception 'ROOM_EXPIRED'; end if;
 update pi_helper.rooms set active=p_active where id=v_room.id;
 return p_active;
end; $$;
create or replace function public.pi_helper_teacher_change_password(p_room_code text,p_teacher_code text,p_new_password text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 if p_new_password is null or p_new_password='' then raise exception 'INVALID_PASSWORD'; end if;
 update pi_helper.rooms set teacher_hash='sha256-bcrypt$'||extensions.crypt(encode(extensions.digest(p_new_password,'sha256'),'hex'),extensions.gen_salt('bf',10)) where id=v_room.id;
 return true;
end; $$;
revoke execute on function public.pi_helper_teacher_room_info(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_room_info(text,text) to anon;
revoke execute on function public.pi_helper_teacher_set_expiry(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_set_expiry(text,text,timestamptz) to anon;
revoke execute on function public.pi_helper_teacher_reports(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_reports(text,text) to anon;
revoke execute on function public.pi_helper_teacher_set_open(text,text,boolean) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_set_open(text,text,boolean) to anon;
revoke execute on function public.pi_helper_teacher_change_password(text,text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_change_password(text,text,text) to anon;
create or replace function public.pi_helper_teacher_clear_reports(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype; v_count bigint;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 if p_group_no is not null and (p_group_no<1 or p_group_no>9) then raise exception 'INVALID_GROUP'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 update pi_helper.reports r set cleared_at=clock_timestamp()
 where r.room_id=v_room.id and r.cleared_at is null and (p_group_no is null or r.group_no=p_group_no);
 get diagnostics v_count=row_count;
 return v_count;
end; $$;
revoke execute on function public.pi_helper_teacher_clear_reports(text,text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_clear_reports(text,text,smallint) to anon;

commit;

-- 可設定組數功能
begin;
set local lock_timeout='5s';
alter table pi_helper.rooms add column if not exists group_count smallint not null default 9 check(group_count between 1 and 99);
alter table pi_helper.reports drop constraint if exists reports_group_no_check;
alter table pi_helper.reports add constraint reports_group_no_check check(group_no between 1 and 99);
create or replace function public.pi_helper_group_settings(p_room_code text,p_teacher_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select rooms.* into r from pi_helper.rooms rooms where rooms.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_teacher_code is not null then
  if not pi_helper.password_matches(p_teacher_code,r.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 elsif not r.active or r.ends_at<=now() then raise exception 'ROOM_NOT_FOUND'; end if;
 return jsonb_build_object('group_count',r.group_count);
end; $$;
create or replace function public.pi_helper_teacher_set_group_count(p_room_code text,p_teacher_code text,p_group_count smallint)
returns smallint language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_group_count is null or p_group_count<1 or p_group_count>99 then raise exception 'INVALID_GROUP_COUNT'; end if;
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select rooms.* into r from pi_helper.rooms rooms where rooms.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,r.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 update pi_helper.rooms set group_count=p_group_count where id=r.id;
 return p_group_count;
end; $$;
revoke execute on function public.pi_helper_group_settings(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_group_settings(text,text) to anon;
revoke execute on function public.pi_helper_teacher_set_group_count(text,text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_set_group_count(text,text,smallint) to anon;
create or replace function public.pi_helper_student_report(
 p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,
 p_stage text,p_step text,p_result text,p_status text,p_revision bigint)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_groups smallint; v_token text; v_time timestamptz;
begin
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select r.id,r.group_count into v_room,v_groups from pi_helper.rooms r
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex')
 and r.active and r.ends_at>now();
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_session_id is null or p_session_secret is null or length(p_session_secret)<32 or length(p_session_secret)>128
 or p_group_no is null or p_group_no<1 or p_group_no>v_groups or p_revision is null or p_revision<1
 or p_stage is null or length(p_stage)>30 or p_step is null or length(p_step)>200
 or p_result is null or length(p_result)>500 or p_status is null or p_status not in ('working','need_help','done','ended')
 then raise exception 'INVALID_REPORT'; end if;
 v_token:=encode(extensions.digest(p_session_secret,'sha256'),'hex');
 insert into pi_helper.reports as current_report(room_id,session_id,token_hash,group_no,stage,step,result,state,revision,updated_at)
 values(v_room,p_session_id,v_token,p_group_no,p_stage,p_step,p_result,p_status,p_revision,now())
 on conflict(room_id,session_id) do update set
 stage=excluded.stage,step=excluded.step,result=excluded.result,state=excluded.state,
 revision=excluded.revision,updated_at=now(),cleared_at=null
 where current_report.token_hash=excluded.token_hash and current_report.group_no=excluded.group_no
 and current_report.revision<excluded.revision
 returning updated_at into v_time;
 if v_time is null then
  select r.updated_at into v_time from pi_helper.reports r
  where r.room_id=v_room and r.session_id=p_session_id and r.token_hash=v_token and r.group_no=p_group_no;
  if not found then raise exception 'SESSION_DENIED'; end if;
 end if;
 return v_time;
end; $$;


create or replace function public.pi_helper_teacher_clear_reports(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype; v_count bigint;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 if p_group_no is not null and (p_group_no<1 or p_group_no>99) then raise exception 'INVALID_GROUP'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.password_matches(p_teacher_code,v_room.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 update pi_helper.reports r set cleared_at=clock_timestamp()
 where r.room_id=v_room.id and r.cleared_at is null and (p_group_no is null or r.group_no=p_group_no);
 get diagnostics v_count=row_count;
 return v_count;
end; $$;

revoke execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) to anon;
revoke execute on function public.pi_helper_teacher_clear_reports(text,text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_clear_reports(text,text,smallint) to anon;
commit;
