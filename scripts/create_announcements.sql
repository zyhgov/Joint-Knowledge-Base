-- 创建公告与任务系统表

-- 1. 公告/任务主表
CREATE TABLE IF NOT EXISTS jkb_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('announcement', 'notice', 'checkin', 'task')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'draft')),
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'departments', 'workspaces')),
  target_ids TEXT[] DEFAULT NULL,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  start_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_by UUID REFERENCES jkb_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 公告已读/完成记录表
CREATE TABLE IF NOT EXISTS jkb_announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES jkb_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ DEFAULT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(announcement_id, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_jkb_announcements_status ON jkb_announcements(status);
CREATE INDEX IF NOT EXISTS idx_jkb_announcements_type ON jkb_announcements(type);
CREATE INDEX IF NOT EXISTS idx_jkb_announcements_created_by ON jkb_announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_jkb_announcement_reads_user ON jkb_announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_jkb_announcement_reads_announcement ON jkb_announcement_reads(announcement_id);

-- 启用 RLS
ALTER TABLE jkb_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE jkb_announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS 策略：所有认证用户可查看活跃公告（本项目使用自定义认证，不用 auth.uid()）
CREATE POLICY "Anyone can view active announcements" ON jkb_announcements
  FOR SELECT USING (true);

-- RLS 策略：所有认证用户可插入公告（前端代码已做管理员权限检查）
CREATE POLICY "Anyone can insert announcements" ON jkb_announcements
  FOR INSERT WITH CHECK (true);

-- RLS 策略：所有认证用户可更新公告
CREATE POLICY "Anyone can update announcements" ON jkb_announcements
  FOR UPDATE USING (true);

-- RLS 策略：所有认证用户可删除公告
CREATE POLICY "Anyone can delete announcements" ON jkb_announcements
  FOR DELETE USING (true);

-- RLS 策略：用户可管理已读记录
CREATE POLICY "Anyone can manage reads" ON jkb_announcement_reads
  FOR ALL USING (true);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_jkb_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jkb_announcements_updated_at ON jkb_announcements;
CREATE TRIGGER trg_jkb_announcements_updated_at
  BEFORE UPDATE ON jkb_announcements
  FOR EACH ROW EXECUTE FUNCTION update_jkb_announcements_updated_at();
