-- Run after update-learning-tools.sql. Preserves existing administrator password and classroom data.
begin;
set local lock_timeout='5s';
alter table pi_helper.rooms add column if not exists manager_name text not null default '管理員';
create table if not exists pi_helper.workbench_accounts (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references pi_helper.rooms(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 40),
 password_hash text not null,password_tag text not null,
 active boolean not null default true,updated_at timestamptz not null default now(),
 unique(room_id,password_tag)
);
create unique index if not exists workbench_account_name on pi_helper.workbench_accounts(room_id,lower(name));
alter table pi_helper.workbench_accounts enable row level security;
revoke all on pi_helper.workbench_accounts from public,anon,authenticated;

-- Preserve verification of legacy hashes while hashing all new passwords before bcrypt.
create or replace function pi_helper.password_matches(p_password text,p_hash text)
returns boolean language sql set search_path='' as $$
 select case when p_password is null or p_password='' or p_hash is null then false
 when left(p_hash,14)='sha256-bcrypt$' then
 extensions.crypt(encode(extensions.digest(p_password,'sha256'),'hex'),substr(p_hash,15))=substr(p_hash,15)
 when octet_length(p_password)>72 then false
 else extensions.crypt(p_password,p_hash)=p_hash end;
$$;
create or replace function pi_helper.workbench_identity(p_room uuid,p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype; a pi_helper.workbench_accounts%rowtype;
begin
 if p_password is null or p_password='' then return null; end if;
 select * into r from pi_helper.rooms where id=p_room;
 if not found then return null; end if;
 if pi_helper.password_matches(p_password,r.teacher_hash) then
  return jsonb_build_object('id',null,'name',r.manager_name,'admin',true);
 end if;
 select * into a from pi_helper.workbench_accounts where room_id=p_room and active
 and password_tag=encode(extensions.digest(p_room::text||':'||p_password,'sha256'),'hex');
 if found and pi_helper.password_matches(p_password,a.password_hash) then
  return jsonb_build_object('id',a.id,'name',a.name,'admin',false);
 end if;
 return null;
end; $$;
create or replace function pi_helper.teacher_authorized(p_room uuid,p_password text)
returns boolean language sql security definer set search_path='' as $$
 select pi_helper.workbench_identity(p_room,p_password) is not null;
$$;
create or replace function public.pi_helper_workbench_identity(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; identity jsonb;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 then raise exception 'TEACHER_DENIED'; end if;
 select id into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 identity:=pi_helper.workbench_identity(r,p_teacher_code);
 if identity is null then raise exception 'TEACHER_DENIED'; end if;
 return identity;
end; $$;
create or replace function public.pi_helper_workbench_accounts(p_room_code text,p_teacher_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; actor jsonb;
begin
 select id into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 actor:=pi_helper.workbench_identity(r,p_teacher_code);
 if actor is null then raise exception 'TEACHER_DENIED'; end if;
 if not (actor->>'admin')::boolean then raise exception 'ADMIN_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name) from pi_helper.workbench_accounts where room_id=r),'[]'::jsonb);
end; $$;
create or replace function public.pi_helper_workbench_save_account(p_room_code text,p_teacher_code text,p_id uuid,p_name text,p_new_password text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype; actor jsonb; target uuid; tag text; hash text; result pi_helper.workbench_accounts%rowtype;
begin
 select * into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 actor:=pi_helper.workbench_identity(r.id,p_teacher_code);
 if actor is null then raise exception 'TEACHER_DENIED'; end if;
 if not (actor->>'admin')::boolean and (p_id is null or p_id::text is distinct from actor->>'id') then raise exception 'ADMIN_REQUIRED'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 40 then raise exception 'INVALID_ACCOUNT_NAME'; end if;
 if p_active is null then raise exception 'INVALID_STATE'; end if;
 if not (actor->>'admin')::boolean and not p_active then raise exception 'ADMIN_REQUIRED'; end if;
 target:=coalesce(p_id,gen_random_uuid());
 if p_id is not null then
  select * into result from pi_helper.workbench_accounts where id=p_id and room_id=r.id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 end if;
 if p_new_password is null or p_new_password='' then
  if p_id is null then raise exception 'ACCOUNT_PASSWORD_REQUIRED'; end if;
  tag:=result.password_tag;hash:=result.password_hash;
 else
  tag:=encode(extensions.digest(r.id::text||':'||p_new_password,'sha256'),'hex');
  if pi_helper.password_matches(p_new_password,r.teacher_hash) or exists(select 1 from pi_helper.workbench_accounts where room_id=r.id and password_tag=tag and id<>target) then raise exception 'ACCOUNT_PASSWORD_USED'; end if;
  hash:='sha256-bcrypt$'||extensions.crypt(encode(extensions.digest(p_new_password,'sha256'),'hex'),extensions.gen_salt('bf',10));
 end if;
 if lower(trim(p_name))=lower(r.manager_name) or exists(select 1 from pi_helper.workbench_accounts where room_id=r.id and lower(name)=lower(trim(p_name)) and id<>target) then raise exception 'ACCOUNT_NAME_USED'; end if;
 if p_id is null and (select count(*) from pi_helper.workbench_accounts where room_id=r.id)>=50 then raise exception 'ACCOUNT_LIMIT'; end if;
 insert into pi_helper.workbench_accounts(id,room_id,name,password_hash,password_tag,active) values(target,r.id,trim(p_name),hash,tag,p_active)
 on conflict(id) do update set name=excluded.name,password_hash=excluded.password_hash,password_tag=excluded.password_tag,active=excluded.active,updated_at=now()
 returning * into result;
 return jsonb_build_object('id',result.id,'name',result.name,'active',result.active);
end; $$;
create or replace function public.pi_helper_workbench_admin_name(p_room_code text,p_teacher_code text,p_name text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 select * into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found or not pi_helper.password_matches(p_teacher_code,r.teacher_hash) then raise exception 'TEACHER_DENIED'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 40 then raise exception 'INVALID_ACCOUNT_NAME'; end if;
 if exists(select 1 from pi_helper.workbench_accounts where room_id=r.id and lower(name)=lower(trim(p_name))) then raise exception 'ACCOUNT_NAME_USED'; end if;
 update pi_helper.rooms set manager_name=trim(p_name) where id=r.id;
 return true;
end; $$;
create or replace function public.pi_helper_teacher_room_info(p_room_code text,p_teacher_code text)
returns table(title text,ends_at timestamptz,active boolean)
language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.teacher_authorized(v_room.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
 return query select v_room.title,v_room.ends_at,v_room.active;
end; $$;

create or replace function public.pi_helper_teacher_set_expiry(p_room_code text,p_teacher_code text,p_ends_at timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.teacher_authorized(v_room.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
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
 if not pi_helper.teacher_authorized(v_room.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
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
 if p_new_password is null or p_new_password='' then raise exception 'ACCOUNT_PASSWORD_REQUIRED'; end if;
 if exists(select 1 from pi_helper.workbench_accounts where room_id=v_room.id and password_tag=encode(extensions.digest(v_room.id::text||':'||p_new_password,'sha256'),'hex')) then raise exception 'ACCOUNT_PASSWORD_USED'; end if;
 update pi_helper.rooms set teacher_hash='sha256-bcrypt$'||extensions.crypt(encode(extensions.digest(p_new_password,'sha256'),'hex'),extensions.gen_salt('bf',10)) where id=v_room.id;
 return true;
end; $$;

create or replace function public.pi_helper_teacher_clear_reports(p_room_code text,p_teacher_code text,p_group_no smallint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype; v_count bigint;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 if p_group_no is not null and (p_group_no<1 or p_group_no>99) then raise exception 'INVALID_GROUP'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if not pi_helper.teacher_authorized(v_room.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
 update pi_helper.reports r set cleared_at=clock_timestamp()
 where r.room_id=v_room.id and r.cleared_at is null and (p_group_no is null or r.group_no=p_group_no);
 get diagnostics v_count=row_count;
 return v_count;
end; $$;

create or replace function public.pi_helper_group_settings(p_room_code text,p_teacher_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)<8 or length(p_room_code)>80 then raise exception 'ROOM_NOT_FOUND'; end if;
 select rooms.* into r from pi_helper.rooms rooms where rooms.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if p_teacher_code is not null then
  if not pi_helper.teacher_authorized(r.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
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
 if not pi_helper.teacher_authorized(r.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
 update pi_helper.rooms set group_count=p_group_count where id=r.id;
 return p_group_count;
end; $$;

create or replace function pi_helper.require_teacher(p_room_code text,p_teacher_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code) not between 8 and 80 or p_teacher_code is null then raise exception 'TEACHER_DENIED'; end if;
 select * into r from pi_helper.rooms where join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found or not pi_helper.teacher_authorized(r.id,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
 return r.id;
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
 if not pi_helper.teacher_authorized(v_room,p_teacher_code) then raise exception 'TEACHER_DENIED'; end if;
 return query
 select ranked.session_id,ranked.group_no,ranked.stage,ranked.step,ranked.result,ranked.state,ranked.updated_at
 from (
  select r.*,row_number() over(partition by r.group_no order by r.updated_at desc,r.session_id) as position
  from pi_helper.reports r where r.room_id=v_room and r.cleared_at is null
 ) ranked where ranked.position<=20 order by ranked.updated_at desc;
end; $$;

create or replace function public.pi_helper_teacher_update_help(p_room_code text,p_teacher_code text,p_id uuid,p_status text,p_assignee text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; r pi_helper.help_requests%rowtype;
begin
 v_room:=pi_helper.require_teacher(p_room_code,p_teacher_code);
 p_assignee:=pi_helper.workbench_identity(v_room,p_teacher_code)->>'name';
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

revoke all on function pi_helper.workbench_identity(uuid,text),pi_helper.teacher_authorized(uuid,text) from public,anon,authenticated;
revoke all on function public.pi_helper_workbench_identity(text,text),public.pi_helper_workbench_accounts(text,text),public.pi_helper_workbench_save_account(text,text,uuid,text,text,boolean),public.pi_helper_workbench_admin_name(text,text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_workbench_identity(text,text),public.pi_helper_workbench_accounts(text,text),public.pi_helper_workbench_save_account(text,text,uuid,text,text,boolean),public.pi_helper_workbench_admin_name(text,text,text) to anon;
notify pgrst,'reload schema';
commit;
