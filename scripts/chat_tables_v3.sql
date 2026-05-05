-- 站内聊天系统增量更新 v3
-- 执行方式：在 Supabase SQL Editor 中运行

-- 1. 更新消息类型 check 约束，增加 'file' 类型
-- 由于 Supabase 不支持直接修改 check 约束，先删旧约束再加新约束
alter table chat_messages drop constraint if exists chat_messages_message_type_check;
alter table chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('text', 'system', 'image', 'file'));

-- 2. 聊天文件过期清理存储过程（通过 pg_cron 或手动调用）
-- 清理超过3天的聊天文件消息的 R2 引用（后续可通过外部 Worker 触发删除 R2 对象）
create or replace function cleanup_expired_chat_files()
returns void
language plpgsql
as $$
declare
  expired record;
begin
  for expired in
    select id, content from chat_messages
    where message_type = 'file'
      and created_at < now() - interval '3 days'
      and is_deleted = false
  loop
    update chat_messages set is_deleted = true, deleted_at = now()
    where id = expired.id;
  end loop;
end;
$$;
