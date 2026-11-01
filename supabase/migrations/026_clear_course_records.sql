-- Explicit, teacher-authorized clearing. Pairing and sequence replay protection remain intact.
begin;
set local lock_timeout='5s';
create or replace function public.pi_helper_teacher_clear_course_records(
 p_room_code text,p_teacher_code text,p_group_no smallint default null,p_include_board boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; total integer; tasks bigint; runs bigint; board jsonb:='{"reports":0,"help_requests":0}'::jsonb;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 select group_count into total from pi_helper.rooms where id=r for update;
 if p_group_no is not null and (p_group_no<1 or p_group_no>total) then raise exception 'INVALID_GROUP'; end if;
 if p_include_board is null then raise exception 'INVALID_STATE'; end if;
 -- Course events acquire the same device lock before writing tasks and history.
 perform 1 from pi_helper.course_devices where room_id=r and (p_group_no is null or group_no=p_group_no) order by group_no for update;
 select count(*) into runs from pi_helper.course_runs where room_id=r and (p_group_no is null or group_no=p_group_no);
 delete from pi_helper.course_tasks where room_id=r and (p_group_no is null or group_no=p_group_no);
 get diagnostics tasks=row_count;
 -- Task deletion normally clears its history; also remove any orphan history.
 delete from pi_helper.course_runs where room_id=r and (p_group_no is null or group_no=p_group_no);
 update pi_helper.course_devices set received_at=null,network='[]'::jsonb where room_id=r and (p_group_no is null or group_no=p_group_no);
 -- Never reset last_sequence: replaying an already received event cannot restore cleared results.
 if p_include_board then board:=public.pi_helper_teacher_clear_board(p_room_code,p_teacher_code,p_group_no); end if;
 return board||jsonb_build_object('course_tasks',tasks,'course_runs',runs);
end;
$$;
revoke all on function public.pi_helper_teacher_clear_course_records(text,text,smallint,boolean) from public;
grant execute on function public.pi_helper_teacher_clear_course_records(text,text,smallint,boolean) to anon,authenticated;
notify pgrst,'reload schema';
commit;
