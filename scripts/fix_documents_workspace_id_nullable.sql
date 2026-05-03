-- 修复 jkb_documents.workspace_id 为可空
-- 创建文档时可以不选工作区
ALTER TABLE jkb_documents ALTER COLUMN workspace_id DROP NOT NULL;
