-- 既有課堂可執行；只更新讀取函式，不刪除資料，不更改密碼。
begin;
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
 return query
 select ranked.session_id,ranked.group_no,ranked.stage,ranked.step,ranked.result,ranked.state,ranked.updated_at
 from (
  select r.*,row_number() over(partition by r.group_no order by r.updated_at desc,r.session_id) as position
  from pi_helper.reports r where r.room_id=v_room
 ) ranked where ranked.position<=20 order by ranked.updated_at desc;
end; $$;

revoke execute on function public.pi_helper_teacher_reports(text,text) from public,anon,authenticated;
grant execute on function public.pi_helper_teacher_reports(text,text) to anon;
commit;
