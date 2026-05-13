-- ============================================================
-- 协作表格在线用户心跳表
-- 用户进入编辑器时插入/更新，离开时删除
-- 列表页通过 Realtime 订阅实时显示在线用户
-- 自定义认证项目，RLS 全部用 true 放行
-- ============================================================

CREATE TABLE IF NOT EXISTS spreadsheet_presence (
  spreadsheet_id UUID REFERENCES spreadsheets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES jkb_users(id) NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (spreadsheet_id, user_id)
);

ALTER TABLE spreadsheet_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有人可查看在线状态" ON spreadsheet_presence;
DROP POLICY IF EXISTS "所有人可更新在线状态" ON spreadsheet_presence;
DROP POLICY IF EXISTS "所有人可插入在线状态" ON spreadsheet_presence;
DROP POLICY IF EXISTS "所有人可删除在线状态" ON spreadsheet_presence;

CREATE POLICY "所有人可查看在线状态" ON spreadsheet_presence FOR SELECT USING (true);
CREATE POLICY "所有人可更新在线状态" ON spreadsheet_presence FOR UPDATE USING (true);
CREATE POLICY "所有人可插入在线状态" ON spreadsheet_presence FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可删除在线状态" ON spreadsheet_presence FOR DELETE USING (true);

-- 加入 Realtime 发布（让前端实时订阅）
ALTER PUBLICATION supabase_realtime ADD TABLE spreadsheet_presence;

-- 索引
CREATE INDEX IF NOT EXISTS idx_presence_spreadsheet ON spreadsheet_presence(spreadsheet_id);

NOTIFY pgrst, 'reload schema';
