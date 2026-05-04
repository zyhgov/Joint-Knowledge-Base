-- 为群聊添加简介字段
alter table chat_conversations add column if not exists description text;
