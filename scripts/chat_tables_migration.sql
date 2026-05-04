-- 站内聊天系统增量更新
-- 执行方式：在 Supabase SQL Editor 中运行

-- 1. 会话表新增字段
alter table chat_conversations add column if not exists avatar_url text;
alter table chat_conversations add column if not exists disbanded_at timestamptz;

-- 2. 消息表新增状态字段
 alter table chat_messages add column if not exists status text not null default 'sent'
   check (status in ('sending', 'sent', 'failed', 'read'));
alter table chat_messages add column if not exists recalled_at timestamptz;

-- 3. 消息已读记录表
create table if not exists chat_message_reads (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  user_id    uuid not null references jkb_users(id),
  read_at    timestamptz not null default now(),
  unique(message_id, user_id)
);
create index if not exists idx_message_reads_message on chat_message_reads(message_id);
create index if not exists idx_message_reads_user on chat_message_reads(user_id);
