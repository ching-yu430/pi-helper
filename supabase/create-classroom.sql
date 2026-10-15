-- 在 SQL Editor 執行。每次執行會建立一堂新課；請將輸出的學生課堂碼填入 config.js 的 defaultRoomCode；助教碼只私下保管。
-- title 可自行修改。預設期限為建立後 30 天；可在建立前修改，或之後由助教看板調整。
with codes as (
 select encode(extensions.gen_random_bytes(8),'hex') as student_code,
        encode(extensions.gen_random_bytes(16),'hex') as teacher_code
), inserted as (
 insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at)
 select '樹莓派 5 課堂',encode(extensions.digest(student_code,'sha256'),'hex'),
        'sha256-bcrypt
 from codes
 returning id,title,ends_at
)
select inserted.id,inserted.title,inserted.ends_at,codes.student_code as "課堂加入碼_給學生",codes.teacher_code as "助教管理碼_僅助教保管"
from inserted cross join codes;
||extensions.crypt(encode(extensions.digest(teacher_code,'sha256'),'hex'),extensions.gen_salt('bf',10)),now()+interval '30 days'
 from codes
 returning id,title,ends_at
)
select inserted.id,inserted.title,inserted.ends_at,codes.student_code as "課堂加入碼_給學生",codes.teacher_code as "助教管理碼_僅助教保管"
from inserted cross join codes;
