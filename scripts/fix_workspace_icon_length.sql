-- 修复 jkb_workspaces 的 icon 字段长度限制
-- 原来 icon 字段是 varchar(10)，只能存 emoji，现在需要存 URL 或 icon:xxx 格式

ALTER TABLE jkb_workspaces 
ALTER COLUMN icon TYPE TEXT;

-- 为 jkb_files 的 updateFile 支持更多字段
-- 已在之前的迁移中添加了 access_level, visible_department_ids, visible_workspace_ids, expires_at
