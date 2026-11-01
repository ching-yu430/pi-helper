-- Rebinding uses first-install instructions; teacher progress visibility is shared.
begin;
set local lock_timeout='5s';
alter table pi_helper.course_settings add column if not exists teacher_progress_visible boolean not null default true;

create or replace function pi_helper.tool_job_json(p_job uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'group_no',j.group_no,'expected_hostname','pi5-'||lpad(j.group_no::text,2,'0'),
 'version',j.version,'status',j.status,'revision',j.revision,'rebind',j.rebind,
 'request_code',case when j.request_hash is null then null else upper(left(j.request_hash,8)) end,
 'request_active',j.requested_at>now()-interval '20 minutes','approved_until',j.approved_until,
 'approval_expired',j.approved_until is null or j.approved_until<=now(),'claim_until',j.claim_until,'claim_expired',j.claim_until<=now(),
 'request_origin',j.request_origin,'desktop_available',not j.rebind and coalesce(old.files ? 'updater',false),
 'desktop_supported',r.files ? 'updater','installed_version',i.version,'update_mode',pi_helper.tool_update_mode(j.id),
 'error_code',j.error_code,'bootstrap_sha256',r.bootstrap_sha256,'updated_at',j.updated_at)
 from pi_helper.tool_jobs j join pi_helper.tool_releases r on r.version=j.version
 left join pi_helper.tool_installations i on i.room_id=j.room_id and i.group_no=j.group_no
 left join pi_helper.tool_releases old on old.version=i.version where j.id=p_job;
$$;
create or replace function pi_helper.course_json(p_room uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('open_lessons','{"camera":false}'::jsonb||s.open_lessons,
 'current_lesson',s.current_lesson,'current_step',s.current_step,'revision',s.revision,
 'teaching_paused',s.teaching_paused,'pause_supported',true,'camera_supported',true,
 'camera_checks_supported',true,'camera_checks_enabled',s.camera_checks_enabled,
 'teacher_progress_supported',true,'teacher_progress_visible',s.teacher_progress_visible)
 from pi_helper.course_settings s where s.room_id=p_room),
 '{"open_lessons":{"flash":true,"ssh":true,"desktop":true,"shutdown":true,"camera":false},"current_lesson":"flash","current_step":0,"revision":0,"teaching_paused":false,"pause_supported":true,"camera_supported":true,"camera_checks_supported":true,"camera_checks_enabled":false,"teacher_progress_supported":true,"teacher_progress_visible":true}'::jsonb);
$$;
revoke all on function pi_helper.course_json(uuid) from public,anon,authenticated;
create or replace function public.pi_helper_teacher_set_teacher_progress(p_room_code text,p_teacher_code text,p_visible boolean,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; existing jsonb;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 perform 1 from pi_helper.rooms where id=r for update;
 existing:=pi_helper.course_json(r);
 if p_visible is null then raise exception 'INVALID_STATE'; end if;
 if p_revision is null or p_revision<>(existing->>'revision')::bigint then raise exception 'COURSE_CONFLICT'; end if;
 insert into pi_helper.course_settings(room_id,open_lessons,current_lesson,current_step,revision,teacher_progress_visible)
 values(r,existing->'open_lessons',existing->>'current_lesson',(existing->>'current_step')::integer,1,p_visible)
 on conflict(room_id) do update set teacher_progress_visible=excluded.teacher_progress_visible,
 revision=pi_helper.course_settings.revision+1,updated_at=now();
 return pi_helper.course_json(r);
end;
$$;
revoke all on function public.pi_helper_teacher_set_teacher_progress(text,text,boolean,bigint) from public;
grant execute on function public.pi_helper_teacher_set_teacher_progress(text,text,boolean,bigint) to anon,authenticated;
notify pgrst,'reload schema';
commit;
