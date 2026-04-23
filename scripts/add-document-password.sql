-- 为 jkb_documents 表添加 password 字段（文档密码保护）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS password TEXT;

-- 添加 access_level 字段（如果不存在）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'public';

-- 添加 visible_department_ids 字段（如果不存在）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS visible_department_ids UUID[] DEFAULT '{}';

-- 添加 visible_workspace_ids 字段（如果不存在）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS visible_workspace_ids UUID[] DEFAULT '{}';

-- 添加 tags 字段（如果不存在）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 添加 is_deleted 字段（如果不存在）
ALTER TABLE jkb_documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
