-- 僅在首次建立新課堂時執行一次。先執行 install.sql。
-- 學生課堂碼填入 config.js；管理員密碼只私下保管，不能提交 Git。
with codes as (
 select encode(extensions.gen_random_bytes(8),'hex') as student_code,
        encode(extensions.gen_random_bytes(16),'hex') as teacher_code
), inserted as (
 insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at)
 select '樹莓派 5 課堂',encode(extensions.digest(student_code,'sha256'),'hex'),
        'sha256-bcrypt$'||extensions.crypt(encode(extensions.digest(teacher_code,'sha256'),'hex'),extensions.gen_salt('bf',10)),now()+interval '30 days'
 from codes returning id,title,ends_at
)
select inserted.id,inserted.title,inserted.ends_at,codes.student_code as "課堂加入碼_給學生",codes.teacher_code as "助教管理碼_僅助教保管"
from inserted cross join codes;
