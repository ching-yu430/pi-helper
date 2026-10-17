-- Run after 008_learning_tools.sql and 009_workbench_accounts.sql.
-- Additive and repeatable. Keeps existing classrooms, accounts, reports and course settings.
begin;
set local lock_timeout='5s';
alter table pi_helper.course_settings add column if not exists teaching_paused boolean not null default false;
create or replace function pi_helper.course_json(p_room uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('open_lessons',s.open_lessons,'current_lesson',s.current_lesson,'current_step',s.current_step,'revision',s.revision,'teaching_paused',s.teaching_paused,'pause_supported',true) from pi_helper.course_settings s where s.room_id=p_room),'{"open_lessons":{"flash":true,"ssh":true,"desktop":true,"shutdown":true},"current_lesson":"flash","current_step":0,"revision":0,"teaching_paused":false,"pause_supported":true}'::jsonb);
$$;
revoke all on function pi_helper.course_json(uuid) from public,anon,authenticated;
create or replace function public.pi_helper_teacher_present_course(p_room_code text,p_teacher_code text,p_current_lesson text,p_current_step integer,p_paused boolean,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_policy jsonb;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=v_room for update;
 if p_paused is null then raise exception 'INVALID_STATE'; end if;
 v_policy:=pi_helper.course_json(v_room);
 -- Existing course setter validates the revision, lesson and step under the same room lock.
 perform public.pi_helper_teacher_set_course(p_room_code,p_teacher_code,v_policy->'open_lessons',p_current_lesson,p_current_step,p_revision);
 update pi_helper.course_settings set teaching_paused=p_paused where room_id=v_room;
 return pi_helper.course_json(v_room);
end; $$;
revoke all on function public.pi_helper_teacher_present_course(text,text,text,integer,boolean,bigint) from public;
grant execute on function public.pi_helper_teacher_present_course(text,text,text,integer,boolean,bigint) to anon,authenticated;
notify pgrst,'reload schema';
commit;
