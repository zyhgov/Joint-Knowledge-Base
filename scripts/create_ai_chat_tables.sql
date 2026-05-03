-- AI 对话功能数据库表
-- 在 Supabase SQL Editor 中执行

-- 1. AI 对话会话表
CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false
);

-- 2. AI 对话消息表
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. AI 对话封禁表
CREATE TABLE IF NOT EXISTS ai_user_bans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES jkb_users(id) ON DELETE SET NULL,
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 4. AI 知识预设表（单行，存储系统提示词）
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES jkb_users(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON ai_chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_user_bans_user ON ai_user_bans(user_id);

-- RLS 策略（宽松模式，应用层控制权限）
ALTER TABLE ai_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所有人可查看会话" ON ai_chat_conversations FOR SELECT USING (true);
CREATE POLICY "所有人可管理会话" ON ai_chat_conversations FOR ALL USING (true);
CREATE POLICY "所有人可查看消息" ON ai_chat_messages FOR SELECT USING (true);
CREATE POLICY "所有人可管理消息" ON ai_chat_messages FOR ALL USING (true);
CREATE POLICY "所有人可查看封禁" ON ai_user_bans FOR SELECT USING (true);
CREATE POLICY "所有人可管理封禁" ON ai_user_bans FOR ALL USING (true);

-- ai_knowledge_base RLS
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有人可查看知识预设" ON ai_knowledge_base FOR SELECT USING (true);
CREATE POLICY "所有人可管理知识预设" ON ai_knowledge_base FOR ALL USING (true);


-- 5. AI 预设问题表
CREATE TABLE IF NOT EXISTS ai_preset_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  is_hidden BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_preset_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有人可查看预设问题" ON ai_preset_questions FOR SELECT USING (true);
CREATE POLICY "所有人可管理预设问题" ON ai_preset_questions FOR ALL USING (true);
