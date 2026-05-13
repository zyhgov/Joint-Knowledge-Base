-- ============================================================
-- 协作表格（Univer Sheets）数据表
-- 注意：自定义认证不可依赖 auth.uid()，所有 RLS 策略用 true 放行
-- 权限在应用层（spreadsheetService）控制
-- ============================================================

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

-- Row Level Security
ALTER TABLE spreadsheets ENABLE ROW LEVEL SECURITY;

-- 自定义认证项目不能使用 auth.uid()，所有策略用 true 放行
DROP POLICY IF EXISTS "创建者可管理自己的表格" ON spreadsheets;
DROP POLICY IF EXISTS "管理员可管理所有表格" ON spreadsheets;
DROP POLICY IF EXISTS "可查看公开表格" ON spreadsheets;
DROP POLICY IF EXISTS "可查看部门级表格" ON spreadsheets;

CREATE POLICY "所有人可插入表格" ON spreadsheets FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可查看表格" ON spreadsheets FOR SELECT USING (true);
CREATE POLICY "所有人可更新表格" ON spreadsheets FOR UPDATE USING (true);
CREATE POLICY "所有人可删除表格" ON spreadsheets FOR DELETE USING (true);

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
