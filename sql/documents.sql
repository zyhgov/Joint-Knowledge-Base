-- ================================================
-- 协作文档功能 - 数据库表
-- 在 Supabase SQL Editor 中执行
-- ================================================

-- 1. 文档表（如果表已存在则添加可能缺失的列）
CREATE TABLE IF NOT EXISTS jkb_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '无标题文档',
  workspace_id UUID REFERENCES jkb_workspaces(id) ON DELETE SET NULL,
  created_by UUID REFERENCES jkb_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_public BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ
);

-- 如果表已存在但缺少 is_public 列，手动执行：
-- ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
-- ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. 文档成员表（权限控制）
CREATE TABLE IF NOT EXISTS jkb_document_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES jkb_documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES jkb_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(document_id, user_id)
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON jkb_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON jkb_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON jkb_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_members_document ON jkb_document_members(document_id);
CREATE INDEX IF NOT EXISTS idx_document_members_user ON jkb_document_members(user_id);

-- 4. RLS 策略
-- 注意：项目使用自定义认证（非 Supabase Auth），auth.uid() 始终为 NULL
-- 因此 RLS 策略不能依赖 auth.uid()，权限控制在应用层完成
-- 文档表使用宽松策略，前端 + 服务层做权限过滤

ALTER TABLE jkb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jkb_document_members ENABLE ROW LEVEL SECURITY;

-- 文档：所有人可查看（应用层按 created_by / workspace 过滤）
CREATE POLICY "所有人可查看文档" ON jkb_documents
  FOR SELECT USING (true);

-- 文档：所有人可创建（应用层校验登录状态）
CREATE POLICY "所有人可创建文档" ON jkb_documents
  FOR INSERT WITH CHECK (true);

-- 文档：所有人可更新（应用层校验 owner/editor 权限）
CREATE POLICY "所有人可更新文档" ON jkb_documents
  FOR UPDATE USING (true);

-- 文档：所有人可删除（应用层校验 owner 权限）
CREATE POLICY "所有人可删除文档" ON jkb_documents
  FOR DELETE USING (true);

-- 文档成员：所有人可查看
CREATE POLICY "所有人可查看文档成员" ON jkb_document_members
  FOR SELECT USING (true);

-- 文档成员：所有人可管理（应用层校验权限）
CREATE POLICY "所有人可管理文档成员" ON jkb_document_members
  FOR ALL USING (true);

-- 5. 自动添加创建者为 owner 的触发器
CREATE OR REPLACE FUNCTION add_document_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO jkb_document_members (document_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_add_document_owner ON jkb_documents;
CREATE TRIGGER trigger_add_document_owner
  AFTER INSERT ON jkb_documents
  FOR EACH ROW
  EXECUTE FUNCTION add_document_owner();

-- 6. 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_timestamp ON jkb_documents;
CREATE TRIGGER trigger_update_document_timestamp
  BEFORE UPDATE ON jkb_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_document_timestamp();
  
  -- 7. 文档在线状态表
  CREATE TABLE IF NOT EXISTS jkb_document_presence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID REFERENCES jkb_documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES jkb_users(id) ON DELETE CASCADE,
    user_name TEXT,
    last_active_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(document_id, user_id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_document_presence_document ON jkb_document_presence(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_presence_last_active ON jkb_document_presence(last_active_at);
  
  ALTER TABLE jkb_document_presence ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "所有人可查看在线状态" ON jkb_document_presence FOR SELECT USING (true);
  CREATE POLICY "所有人可管理在线状态" ON jkb_document_presence FOR ALL USING (true);
  
  -- 自动清理超过5分钟未活跃的记录（通过应用层定时执行）
  -- DELETE FROM jkb_document_presence WHERE last_active_at < now() - interval '5 minutes';
