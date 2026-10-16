-- Apply after update-learning-tools.sql and update-workbench-accounts.sql.
-- Does not clear any records until a teacher explicitly uses the clear action.
begin;
set local lock_timeout='5s';
do $$ begin
 if to_regprocedure('pi_helper.workbench_identity(uuid,text)') is null then
  raise exception 'Apply update-workbench-accounts.sql before update-board-clear.sql';
 end if;
end; $$;
alter table pi_helper.help_requests add column if not exists cleared_at timestamptz;

-- Clear reports and help together. Retain report sessions for student authentication.
create or replace function public.pi_helper_teacher_clear_board(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_reports bigint; v_help bigint; v_time timestamptz;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 if p_group_no is not null and (p_group_no<1 or p_group_no>99) then raise exception 'INVALID_GROUP'; end if;
 perform 1 from pi_helper.rooms where id=v_room for update;
 v_time:=clock_timestamp();
 update pi_helper.reports set cleared_at=v_time
 where room_id=v_room and cleared_at is null and (p_group_no is null or group_no=p_group_no);
 get diagnostics v_reports=row_count;
 -- Resolved frees the existing active-session index; cleared_at distinguishes clearing from solving.
 update pi_helper.help_requests set cleared_at=v_time,status='resolved',resolved_by=null,assignee=null,revision=revision+1,updated_at=v_time
 where room_id=v_room and cleared_at is null and (p_group_no is null or group_no=p_group_no);
 get diagnostics v_help=row_count;
 return jsonb_build_object('reports',v_reports,'help_requests',v_help);
end; $$;

-- Old website versions also clear both types of record after this migration.
create or replace function public.pi_helper_teacher_clear_reports(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.pi_helper_teacher_clear_board(p_room_code,p_teacher_code,p_group_no);
 return (result->>'reports')::bigint+(result->>'help_requests')::bigint;
end; $$;

create or replace function public.pi_helper_request_help(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,p_request_id uuid,p_stage text,p_step text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_active boolean; v_end timestamptz; v_groups integer; result pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 select active,ends_at,group_count into v_active,v_end,v_groups from pi_helper.rooms where id=v_room for update;
 if not v_active or v_end<=now() then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_group_no is null or p_group_no<1 or p_group_no>v_groups then raise exception 'INVALID_GROUP'; end if;
 if p_request_id is null or p_stage is null or length(p_stage)>30 or p_step is null or length(p_step)>200 or p_message is null or length(p_message) not between 1 and 500 then raise exception 'INVALID_REPORT'; end if;
 perform 1 from pi_helper.reports where room_id=v_room and session_id=p_session_id for update;
 select * into result from pi_helper.help_requests where id=p_request_id;
 if found then
  if result.room_id<>v_room or result.session_id<>p_session_id then raise exception 'SESSION_DENIED'; end if;
  if result.cleared_at is not null then raise exception 'HELP_CLEARED'; end if;
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
 (select * from pi_helper.help_requests where room_id=v_room and cleared_at is null and (status<>'resolved' or updated_at>now()-interval '1 day') order by requested_at desc limit 500) h),'[]'::jsonb);
end; $$;

create or replace function public.pi_helper_teacher_update_help(p_room_code text,p_teacher_code text,p_id uuid,p_status text,p_assignee text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; r pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=v_room for update;
 p_assignee:=pi_helper.workbench_identity(v_room,p_teacher_code)->>'name';
 select * into r from pi_helper.help_requests where room_id=v_room and id=p_id and cleared_at is null for update;
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
declare v_room uuid; result jsonb; cleared pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 select jsonb_agg(to_jsonb(h)-'room_id'-'session_id' order by h.requested_at desc) into result from
 (select * from pi_helper.help_requests where room_id=v_room and session_id=p_session_id and group_no=p_group_no and cleared_at is null order by requested_at desc limit 10) h;
 if result is not null then return result; end if;
 select * into cleared from pi_helper.help_requests where room_id=v_room and session_id=p_session_id and group_no=p_group_no and cleared_at is not null order by cleared_at desc,requested_at desc limit 1;
 if found then
  -- An explicit marker lets students distinguish clearing from a failed or stale empty response.
  return jsonb_build_array(jsonb_build_object('id',cleared.id,'status','cleared','revision',cleared.revision,'cleared_at',cleared.cleared_at));
 end if;
 return '[]'::jsonb;
end; $$;

create or replace function public.pi_helper_student_confirm_help(p_room_code text,p_session_id uuid,p_session_secret text,p_group_no smallint,p_id uuid,p_resolved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; r pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_student(p_room_code,p_session_id,p_session_secret,p_group_no);
 perform 1 from pi_helper.rooms where id=v_room for update;
 select * into r from pi_helper.help_requests where room_id=v_room and session_id=p_session_id and group_no=p_group_no and id=p_id and cleared_at is null for update;
 if not found then raise exception 'HELP_NOT_FOUND'; end if;
 if r.status<>'waiting' or p_resolved is null then raise exception 'HELP_NOT_WAITING'; end if;
 update pi_helper.help_requests set status=case when p_resolved then 'resolved' else 'open' end,
 assignee=case when p_resolved then assignee else null end,resolved_by=case when p_resolved then 'student' else null end,revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return to_jsonb(r)-'room_id'-'session_id';
end; $$;

revoke all on function public.pi_helper_teacher_clear_board(text,text,smallint),public.pi_helper_teacher_clear_reports(text,text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_clear_board(text,text,smallint),public.pi_helper_teacher_clear_reports(text,text,smallint) to anon;
notify pgrst,'reload schema';
commit;
