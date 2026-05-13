-- ============================================================
-- 为已有的 spreadsheets 表补充缺失列
-- 因为 CREATE TABLE IF NOT EXISTS 不会修改已有表结构
-- ============================================================

ALTER TABLE spreadsheets ADD COLUMN IF NOT EXISTS edit_permission TEXT DEFAULT 'editable' CHECK (edit_permission IN ('editable', 'readonly'));
ALTER TABLE spreadsheets ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '';
ALTER TABLE spreadsheets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
