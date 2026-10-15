-- 在 SQL Editor 執行。每次執行會建立一堂新課；不用把產生的代碼寫入 config.js。
-- title 可自行修改。請在建立前修改截止日期；之後可由助教看板調整。
with codes as (
 select encode(extensions.gen_random_bytes(8),'hex') as student_code,
        encode(extensions.gen_random_bytes(16),'hex') as teacher_code
), inserted as (
 insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at)
 select '樹莓派 5 課堂',encode(extensions.digest(student_code,'sha256'),'hex'),
        extensions.crypt(teacher_code,extensions.gen_salt('bf',8)),'2027-01-31 23:59:59+08'::timestamptz
 from codes
 returning id,title,ends_at
)
select inserted.id,inserted.title,inserted.ends_at,codes.student_code as "課堂加入碼_給學生",codes.teacher_code as "助教管理碼_僅助教保管"
from inserted cross join codes;
