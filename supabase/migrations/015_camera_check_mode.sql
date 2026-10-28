-- Shared classroom setting. Existing classrooms start with manual navigation.
begin;
set local lock_timeout='5s';
alter table pi_helper.course_settings add column if not exists camera_checks_enabled boolean not null default false;
create or replace function pi_helper.course_json(p_room uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('open_lessons','{"camera":false}'::jsonb||s.open_lessons,
 'current_lesson',s.current_lesson,'current_step',s.current_step,'revision',s.revision,
 'teaching_paused',s.teaching_paused,'pause_supported',true,'camera_supported',true,
 'camera_checks_supported',true,'camera_checks_enabled',s.camera_checks_enabled)
 from pi_helper.course_settings s where s.room_id=p_room),
 '{"open_lessons":{"flash":true,"ssh":true,"desktop":true,"shutdown":true,"camera":false},"current_lesson":"flash","current_step":0,"revision":0,"teaching_paused":false,"pause_supported":true,"camera_supported":true,"camera_checks_supported":true,"camera_checks_enabled":false}'::jsonb);
$$;
revoke all on function pi_helper.course_json(uuid) from public,anon,authenticated;
create or replace function public.pi_helper_teacher_set_camera_checks(p_room_code text,p_teacher_code text,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; existing jsonb;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=r for update;
 existing:=pi_helper.course_json(r);
 if p_enabled is null then raise exception 'INVALID_STATE'; end if;
 if p_revision is null or p_revision<>(existing->>'revision')::bigint then raise exception 'COURSE_CONFLICT'; end if;
 insert into pi_helper.course_settings(room_id,open_lessons,current_lesson,current_step,revision,camera_checks_enabled)
 values(r,existing->'open_lessons',existing->>'current_lesson',(existing->>'current_step')::integer,1,p_enabled)
 on conflict(room_id) do update set camera_checks_enabled=excluded.camera_checks_enabled,
 revision=pi_helper.course_settings.revision+1,updated_at=now();
 return pi_helper.course_json(r);
end;
$$;
revoke all on function public.pi_helper_teacher_set_camera_checks(text,text,boolean,bigint) from public;
grant execute on function public.pi_helper_teacher_set_camera_checks(text,text,boolean,bigint) to anon,authenticated;
notify pgrst,'reload schema';
commit;
