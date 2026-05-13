-- ============================================================
-- 协作表格分享链接表
-- 支持过期时间、密码保护、编辑权限控制
-- 自定义认证项目，RLS 全部用 true 放行
-- ============================================================

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

-- Row Level Security
ALTER TABLE spreadsheet_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有人可插入分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可查看分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可更新分享" ON spreadsheet_shares;
DROP POLICY IF EXISTS "所有人可删除分享" ON spreadsheet_shares;

CREATE POLICY "所有人可插入分享" ON spreadsheet_shares FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可查看分享" ON spreadsheet_shares FOR SELECT USING (true);
CREATE POLICY "所有人可更新分享" ON spreadsheet_shares FOR UPDATE USING (true);
CREATE POLICY "所有人可删除分享" ON spreadsheet_shares FOR DELETE USING (true);

-- 索引：通过 share_code 快速查找
CREATE INDEX IF NOT EXISTS idx_spreadsheet_shares_code ON spreadsheet_shares(share_code);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_shares_sheet ON spreadsheet_shares(spreadsheet_id);

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
