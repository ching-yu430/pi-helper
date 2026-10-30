begin;
set local lock_timeout='5s';
-- Keep the latest results API unchanged. History is teacher-only, and contains
-- only evidence already validated by pi_helper_course_event (never raw stdout).
create table if not exists pi_helper.course_runs (
 room_id uuid not null,group_no smallint not null,task text not null,run_id uuid not null,
 sequence bigint not null,status text not null check(status in ('running','passed','failed','cancelled')),
 evidence jsonb not null,started_at timestamptz,finished_at timestamptz,
 received_at timestamptz not null,
 primary key(room_id,group_no,task,run_id),
 foreign key(room_id,group_no) references pi_helper.course_devices(room_id,group_no) on delete cascade
);
alter table pi_helper.course_runs enable row level security;
revoke all on pi_helper.course_runs from public,anon,authenticated;
-- Existing results have no trustworthy start time; do not invent one.
insert into pi_helper.course_runs(room_id,group_no,task,run_id,sequence,status,evidence,received_at,finished_at)
 select room_id,group_no,task,run_id,sequence,status,evidence,received_at,
 case when status<>'running' then received_at else null end from pi_helper.course_tasks
 on conflict do nothing;
create or replace function pi_helper.record_course_run()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into pi_helper.course_runs(room_id,group_no,task,run_id,sequence,status,evidence,started_at,finished_at,received_at)
 values(new.room_id,new.group_no,new.task,new.run_id,new.sequence,new.status,new.evidence,
 case when new.status='running' then new.received_at else null end,
 case when new.status<>'running' then new.received_at else null end,new.received_at)
 on conflict(room_id,group_no,task,run_id) do update set
 sequence=excluded.sequence,status=excluded.status,evidence=excluded.evidence,
 started_at=coalesce(pi_helper.course_runs.started_at,excluded.started_at),
 finished_at=excluded.finished_at,received_at=excluded.received_at;
 -- A bounded history keeps repeated retries from growing the dashboard forever.
 delete from pi_helper.course_runs h where h.room_id=new.room_id and h.group_no=new.group_no and h.task=new.task
 and h.run_id not in (select run_id from pi_helper.course_runs where room_id=new.room_id and group_no=new.group_no and task=new.task order by sequence desc limit 10);
 return new;
end; $$;
revoke all on function pi_helper.record_course_run() from public,anon,authenticated;
drop trigger if exists course_run_history on pi_helper.course_tasks;
create trigger course_run_history after insert or update on pi_helper.course_tasks for each row execute function pi_helper.record_course_run();
-- Legacy re-pair explicitly deletes task results. Match that reset, while
-- normal updates and unified rebinds retain the existing cloud history.
create or replace function pi_helper.clear_course_run_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from pi_helper.course_runs where room_id=old.room_id and group_no=old.group_no and task=old.task;
 return old;
end; $$;
revoke all on function pi_helper.clear_course_run_history() from public,anon,authenticated;
drop trigger if exists course_run_reset on pi_helper.course_tasks;
create trigger course_run_reset after delete on pi_helper.course_tasks for each row execute function pi_helper.clear_course_run_history();
create or replace function public.pi_helper_teacher_course_runs(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 r:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 if p_group_no is not null and not exists(select 1 from pi_helper.rooms where id=r and p_group_no between 1 and group_count) then raise exception 'INVALID_GROUP'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('group_no',n,'runs',coalesce((
 select jsonb_agg(jsonb_build_object('task',h.task,'run_id',h.run_id,'sequence',h.sequence,'status',h.status,
 'evidence',h.evidence,'started_at',h.started_at,'finished_at',h.finished_at,'received_at',h.received_at) order by h.sequence desc)
 from pi_helper.course_runs h where h.room_id=r and h.group_no=n),'[]'::jsonb)) order by n),'[]'::jsonb)
 from generate_series(1,(select group_count from pi_helper.rooms where id=r)) n where p_group_no is null or n=p_group_no);
end; $$;
revoke all on function public.pi_helper_teacher_course_runs(text,text,smallint) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_course_runs(text,text,smallint) to anon;
notify pgrst,'reload schema';
commit;
