-- 既有課堂升級：助教可開關課堂，關閉／過期後仍能檢視紀錄，並可更新登入密碼。
begin;
create or replace function public.pi_helper_teacher_reports(p_room_code text,p_teacher_code text)
returns table(session_id uuid,group_no smallint,stage text,step text,result text,state text,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_room uuid; v_teacher_hash text;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null or length(p_teacher_code)>128 then raise exception 'TEACHER_DENIED'; end if;
 select r.id,r.teacher_hash into v_room,v_teacher_hash from pi_helper.rooms r
 where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if extensions.crypt(p_teacher_code,v_teacher_hash)<>v_teacher_hash then raise exception 'TEACHER_DENIED'; end if;
 return query select r.session_id,r.group_no,r.stage,r.step,r.result,r.state,r.updated_at
 from pi_helper.reports r where r.room_id=v_room order by r.updated_at desc limit 500;
end; $$;
create or replace function public.pi_helper_teacher_set_open(p_room_code text,p_teacher_code text,p_active boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null or length(p_teacher_code)>128 then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if extensions.crypt(p_teacher_code,v_room.teacher_hash)<>v_room.teacher_hash then raise exception 'TEACHER_DENIED'; end if;
 if p_active is null then raise exception 'INVALID_STATE'; end if;
 if p_active and v_room.ends_at<=now() then raise exception 'ROOM_EXPIRED'; end if;
 update pi_helper.rooms set active=p_active where id=v_room.id;
 return p_active;
end; $$;
create or replace function public.pi_helper_teacher_change_password(p_room_code text,p_teacher_code text,p_new_password text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null or length(p_teacher_code)>128 then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex') for update;
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if extensions.crypt(p_teacher_code,v_room.teacher_hash)<>v_room.teacher_hash then raise exception 'TEACHER_DENIED'; end if;
 if p_new_password is null or length(p_new_password)<12 or length(p_new_password)>128 or octet_length(p_new_password)>72 then raise exception 'INVALID_PASSWORD'; end if;
 update pi_helper.rooms set teacher_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf',10)) where id=v_room.id;
 return true;
end; $$;
revoke execute on function public.pi_helper_teacher_reports(text,text) from public,anon,authenticated;
revoke execute on function public.pi_helper_teacher_set_open(text,text,boolean) from public,anon,authenticated;
revoke execute on function public.pi_helper_teacher_change_password(text,text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_reports(text,text) to anon;
grant execute on function public.pi_helper_teacher_set_open(text,text,boolean) to anon;
grant execute on function public.pi_helper_teacher_change_password(text,text,text) to anon;
commit;
