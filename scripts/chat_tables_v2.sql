-- 站内聊天系统增量更新 v2
-- 执行方式：在 Supabase SQL Editor 中运行

-- 1. 会话参与者表新增置顶时间戳字段
alter table chat_participants add column if not exists pinned_at timestamptz;

-- 启用 Realtime（chat_message_reads 也需要实时推送）
alter table chat_message_reads replica identity full;
alter publication supabase_realtime add table chat_message_reads;
