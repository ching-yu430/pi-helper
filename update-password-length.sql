-- 助教密碼不設長度限制；先以 SHA-256 摘要再雜湊，避免 bcrypt 截斷長密碼。
begin;
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
 return query select r.session_id,r.group_no,r.stage,r.step,r.result,r.state,r.updated_at
 from pi_helper.reports r where r.room_id=v_room order by r.updated_at desc limit 500;
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
commit;
