-- 站内聊天系统表结构
-- 执行：在 Supabase SQL Editor 中运行

-- 1. 会话表（私聊/群聊）
create table if not exists chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('direct', 'group')),
  name       text,                              -- 群聊名称（私聊为null）
  created_by uuid not null references jkb_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 会话参与者
create table if not exists chat_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_id         uuid not null references jkb_users(id),
  last_read_at    timestamptz,         -- 最后阅读时间（用于未读计数）
  is_muted        boolean not null default false,  -- 个人静音
  joined_at       timestamptz not null default now(),
  unique(conversation_id, user_id)
);

-- 3. 消息表
create table if not exists chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_id       uuid not null references jkb_users(id),
  content         text not null,
  message_type    text not null default 'text' check (message_type in ('text', 'system', 'image')),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  is_deleted      boolean not null default false
);
create index if not exists idx_messages_conversation on chat_messages(conversation_id, created_at desc);

-- 4. 禁言记录
create table if not exists chat_mutes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references jkb_users(id),
  conversation_id uuid references chat_conversations(id) on delete cascade,  -- null=全局禁言
  muted_by        uuid not null references jkb_users(id),
  reason          text,
  expires_at      timestamptz,         -- null=永久
  created_at      timestamptz not null default now()
);

-- 5. 在线状态表
create table if not exists chat_presence (
  user_id      uuid primary key references jkb_users(id),
  last_seen_at timestamptz not null default now(),
  is_online    boolean not null default false
);

-- 启用 Realtime（通过 SQL 直接添加表到 supabase_realtime 发布）
alter table chat_messages replica identity full;
alter table chat_presence replica identity full;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table chat_presence;

-- 注意：本项目使用自定义 auth（jkb_sessions 传 token），不依赖 Supabase Auth 的 auth.uid()
-- 权限控制由前端 ProtectedRoute + 服务层实现，因此不使用 RLS
-- 如果有安全需求，请通过应用层 Service 做校验
