-- ============================================================
-- 协作表格完整建表脚本（可重复执行，不会报错）
-- 包含：spreadsheets 主表 + spreadsheet_shares 分享表
-- 注意：自定义认证不可依赖 auth.uid()，所有 RLS 用 true 放行
-- ============================================================

-- ========== 1. spreadsheets 主表 ==========

CREATE TABLE IF NOT EXISTS spreadsheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '未命名表格',
  snapshot JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES jkb_users(id) NOT NULL,
  access_level TEXT DEFAULT 'private' CHECK (access_level IN ('public', 'department', 'private')),
  edit_permission TEXT DEFAULT 'editable' CHECK (edit_permission IN ('editable', 'readonly')),
  icon TEXT DEFAULT '',
  description TEXT DEFAULT '',
  visible_department_ids UUID[] DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 先删除所有已有策略，再重新创建
ALTER TABLE spreadsheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "创建者可管理自己的表格" ON spreadsheets;
DROP POLICY IF EXISTS "管理员可管理所有表格" ON spreadsheets;
DROP POLICY IF EXISTS "可查看公开表格" ON spreadsheets;
DROP POLICY IF EXISTS "可查看部门级表格" ON spreadsheets;
DROP POLICY IF EXISTS "所有人可插入表格" ON spreadsheets;
DROP POLICY IF EXISTS "所有人可查看表格" ON spreadsheets;
DROP POLICY IF EXISTS "所有人可更新表格" ON spreadsheets;
DROP POLICY IF EXISTS "所有人可删除表格" ON spreadsheets;

CREATE POLICY "所有人可插入表格" ON spreadsheets FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可查看表格" ON spreadsheets FOR SELECT USING (true);
CREATE POLICY "所有人可更新表格" ON spreadsheets FOR UPDATE USING (true);
CREATE POLICY "所有人可删除表格" ON spreadsheets FOR DELETE USING (true);

-- ========== 2. spreadsheet_shares 分享表 ==========

CREATE TABLE IF NOT EXISTS spreadsheet_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spreadsheet_id UUID REFERENCES spreadsheets(id) ON DELETE CASCADE NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  can_edit BOOLEAN DEFAULT false,
  created_by UUID REFERENCES jkb_users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE spreadsheet_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有人可插入分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可查看分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可更新分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可删除分享" ON spreadsheet_shares;

CREATE POLICY "所有人可插入分享" ON spreadsheet_shares FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可查看分享" ON spreadsheet_shares FOR SELECT USING (true);
CREATE POLICY "所有人可更新分享" ON spreadsheet_shares FOR UPDATE USING (true);
CREATE POLICY "所有人可删除分享" ON spreadsheet_shares FOR DELETE USING (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_spreadsheet_shares_code ON spreadsheet_shares(share_code);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_shares_sheet ON spreadsheet_shares(spreadsheet_id);

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
