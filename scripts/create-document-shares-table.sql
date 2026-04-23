-- ============================================================
-- 文档分享表 - 在 Supabase SQL Editor 中执行
-- ============================================================

CREATE TABLE IF NOT EXISTS jkb_document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES jkb_documents(id) ON DELETE CASCADE,
  share_code VARCHAR(20) NOT NULL UNIQUE,
  share_type VARCHAR(20) NOT NULL DEFAULT 'public',  -- public / password / time_limited / password_time
  password VARCHAR(100),
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  allow_edit BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_doc_shares_document_id ON jkb_document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_share_code ON jkb_document_shares(share_code);
CREATE INDEX IF NOT EXISTS idx_doc_shares_created_by ON jkb_document_shares(created_by);

-- 为 jkb_documents 添加新字段（如果不存在）
-- 注意：如果字段已存在会报错，可忽略
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) DEFAULT 'public';
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS visible_department_ids UUID[] DEFAULT '{}';
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS visible_workspace_ids UUID[] DEFAULT '{}';

-- RLS 策略
ALTER TABLE jkb_document_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "文档分享-所有人可读" ON jkb_document_shares
  FOR SELECT USING (true);

CREATE POLICY "文档分享-创建者可写" ON jkb_document_shares
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "文档分享-创建者可更新" ON jkb_document_shares
  FOR UPDATE USING (true);

CREATE POLICY "文档分享-创建者可删除" ON jkb_document_shares
  FOR DELETE USING (true);
