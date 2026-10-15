-- 既有課堂升級：清除採 cleared_at 隱藏，保留原始紀錄，不改帳密。
-- 在 Supabase SQL Editor 一次執行；本套件未代為修改正式資料庫。
begin;
alter table pi_helper.reports add column if not exists cleared_at timestamptz;
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

revoke execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.pi_helper_student_report(text,uuid,text,smallint,text,text,text,text,bigint) to anon;
revoke execute on function public.pi_helper_teacher_reports(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_reports(text,text) to anon;
commit;
