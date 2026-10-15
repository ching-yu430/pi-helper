-- 既有課堂升級：允許助教查看及修改截止時間（不需重建課堂）。
begin;
create or replace function public.pi_helper_teacher_room_info(p_room_code text,p_teacher_code text)
returns table(title text,ends_at timestamptz,active boolean)
language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null or length(p_teacher_code)>128 then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if extensions.crypt(p_teacher_code,v_room.teacher_hash)<>v_room.teacher_hash then raise exception 'TEACHER_DENIED'; end if;
 return query select v_room.title,v_room.ends_at,v_room.active;
end; $$;
create or replace function public.pi_helper_teacher_set_expiry(p_room_code text,p_teacher_code text,p_ends_at timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_room pi_helper.rooms%rowtype;
begin
 if p_room_code is null or length(p_room_code)>80 or p_teacher_code is null or length(p_teacher_code)>128 then raise exception 'TEACHER_DENIED'; end if;
 select r.* into v_room from pi_helper.rooms r where r.join_hash=encode(extensions.digest(p_room_code,'sha256'),'hex');
 if not found then raise exception 'TEACHER_DENIED'; end if;
 if extensions.crypt(p_teacher_code,v_room.teacher_hash)<>v_room.teacher_hash then raise exception 'TEACHER_DENIED'; end if;
 if p_ends_at is null or not isfinite(p_ends_at) or p_ends_at<=now() then raise exception 'INVALID_EXPIRY'; end if;
 update pi_helper.rooms set ends_at=p_ends_at where id=v_room.id;
 return p_ends_at;
end; $$;
revoke execute on function public.pi_helper_teacher_room_info(text,text) from public,anon,authenticated;
revoke execute on function public.pi_helper_teacher_set_expiry(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_room_info(text,text) to anon;
grant execute on function public.pi_helper_teacher_set_expiry(text,text,timestamptz) to anon;
commit;
