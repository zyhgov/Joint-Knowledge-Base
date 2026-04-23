-- 为 jkb_files 表添加权限和过期时间字段

-- 添加权限控制字段
ALTER TABLE jkb_files 
ADD COLUMN IF NOT EXISTS visible_department_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS visible_workspace_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'public' CHECK (access_level IN ('public', 'workspace', 'department', 'private')),
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- 为现有数据设置默认值
UPDATE jkb_files 
SET 
  access_level = 'public',
  visible_department_ids = '{}',
  visible_workspace_ids = '{}'
WHERE access_level IS NULL;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_jkb_files_access_level ON jkb_files(access_level);
CREATE INDEX IF NOT EXISTS idx_jkb_files_expires_at ON jkb_files(expires_at);
