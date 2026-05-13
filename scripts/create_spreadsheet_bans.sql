-- 创建表格封禁表
CREATE TABLE IF NOT EXISTS public.spreadsheet_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  banned_by TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spreadsheet_id, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_spreadsheet_bans_spreadsheet_id ON public.spreadsheet_bans(spreadsheet_id);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_bans_user_id ON public.spreadsheet_bans(user_id);

-- 行级安全策略
ALTER TABLE public.spreadsheet_bans ENABLE ROW LEVEL SECURITY;

-- 创建者和管理员可读
CREATE POLICY "创建者可读封禁记录" ON public.spreadsheet_bans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.spreadsheets s
      WHERE s.id::text = spreadsheet_id::text AND s.created_by::text = current_setting('app.user_id', true)::text
    )
  );

-- 创建者和管理员可写入
CREATE POLICY "创建者可管理封禁记录" ON public.spreadsheet_bans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.spreadsheets s
      WHERE s.id::text = spreadsheet_id::text AND s.created_by::text = current_setting('app.user_id', true)::text
    )
  );
