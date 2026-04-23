-- ============================================================
-- 创建 jkb_folders 表（文件管理文件夹系统）
-- 注意：在 Supabase SQL Editor 中执行
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jkb_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.jkb_folders(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.jkb_users(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT '📁',
  sort_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  -- 权限控制
  workspace_ids UUID[] DEFAULT '{}',
  access_level TEXT DEFAULT 'public' CHECK (access_level IN ('public', 'workspace', 'department', 'private')),
  visible_department_ids UUID[] DEFAULT '{}',
  visible_workspace_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_jkb_folders_parent_id ON public.jkb_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_jkb_folders_owner_id ON public.jkb_folders(owner_id);

-- RLS 策略
ALTER TABLE public.jkb_folders ENABLE ROW LEVEL SECURITY;

-- 允许所有人查看
CREATE POLICY "Allow read jkb_folders" ON public.jkb_folders
  FOR SELECT USING (true);

-- 允许登录用户创建
CREATE POLICY "Allow insert jkb_folders" ON public.jkb_folders
  FOR INSERT WITH CHECK (true);

-- 允许所有人更新
CREATE POLICY "Allow update jkb_folders" ON public.jkb_folders
  FOR UPDATE USING (true);

-- 允许所有人删除
CREATE POLICY "Allow delete jkb_folders" ON public.jkb_folders
  FOR DELETE USING (true);

-- ============================================================
-- 启用 Supabase Realtime
-- 在 Supabase Dashboard > Database > Replication 中也需要启用
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.jkb_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jkb_announcements;

-- ============================================================
-- 修复 jkb_files 表：添加 is_deleted 和 folder_id 列（如果不存在）
-- ============================================================

-- 添加 is_deleted 列
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jkb_files' AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE public.jkb_files ADD COLUMN is_deleted BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 添加 deleted_at 列
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jkb_files' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.jkb_files ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- 添加 folder_id 列
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jkb_files' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE public.jkb_files ADD COLUMN folder_id UUID REFERENCES public.jkb_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 修复 jkb_notifications 表：添加 is_hidden 列（如果不存在）
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jkb_notifications' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE public.jkb_notifications ADD COLUMN is_hidden BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 修复 jkb_announcements 表：添加 is_hidden 列（如果不存在）
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jkb_announcements' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE public.jkb_announcements ADD COLUMN is_hidden BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 确保 jkb_files RLS 策略允许查询（自定义认证不依赖 auth.uid()）
-- ============================================================

-- 删除可能存在的基于 auth.uid() 的限制性策略
DROP POLICY IF EXISTS "Users can view own files" ON public.jkb_files;
DROP POLICY IF EXISTS "Users can insert own files" ON public.jkb_files;

-- 创建宽松策略（权限由前端过滤）
CREATE POLICY "Allow read jkb_files" ON public.jkb_files
  FOR SELECT USING (true);

-- 插入策略
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_files' AND policyname = 'Allow insert jkb_files'
  ) THEN
    CREATE POLICY "Allow insert jkb_files" ON public.jkb_files
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 更新策略
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_files' AND policyname = 'Allow update jkb_files'
  ) THEN
    CREATE POLICY "Allow update jkb_files" ON public.jkb_files
      FOR UPDATE USING (true);
  END IF;
END $$;

-- 删除策略
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_files' AND policyname = 'Allow delete jkb_files'
  ) THEN
    CREATE POLICY "Allow delete jkb_files" ON public.jkb_files
      FOR DELETE USING (true);
  END IF;
END $$;

-- ============================================================
-- 确保 jkb_notifications RLS 策略允许查询
-- ============================================================

DROP POLICY IF EXISTS "Users can view own notifications" ON public.jkb_notifications;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_notifications' AND policyname = 'Allow read jkb_notifications'
  ) THEN
    CREATE POLICY "Allow read jkb_notifications" ON public.jkb_notifications
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_notifications' AND policyname = 'Allow insert jkb_notifications'
  ) THEN
    CREATE POLICY "Allow insert jkb_notifications" ON public.jkb_notifications
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_notifications' AND policyname = 'Allow update jkb_notifications'
  ) THEN
    CREATE POLICY "Allow update jkb_notifications" ON public.jkb_notifications
      FOR UPDATE USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_notifications' AND policyname = 'Allow delete jkb_notifications'
  ) THEN
    CREATE POLICY "Allow delete jkb_notifications" ON public.jkb_notifications
      FOR DELETE USING (true);
  END IF;
END $$;

-- ============================================================
-- 确保 jkb_announcements RLS 策略允许查询
-- ============================================================

DROP POLICY IF EXISTS "Users can view announcements" ON public.jkb_announcements;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_announcements' AND policyname = 'Allow read jkb_announcements'
  ) THEN
    CREATE POLICY "Allow read jkb_announcements" ON public.jkb_announcements
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_announcements' AND policyname = 'Allow insert jkb_announcements'
  ) THEN
    CREATE POLICY "Allow insert jkb_announcements" ON public.jkb_announcements
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_announcements' AND policyname = 'Allow update jkb_announcements'
  ) THEN
    CREATE POLICY "Allow update jkb_announcements" ON public.jkb_announcements
      FOR UPDATE USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_announcements' AND policyname = 'Allow delete jkb_announcements'
  ) THEN
    CREATE POLICY "Allow delete jkb_announcements" ON public.jkb_announcements
      FOR DELETE USING (true);
  END IF;
END $$;

-- ============================================================
-- 确保 RBAC 相关表 RLS 策略允许查询（自定义认证不依赖 auth.uid()）
-- ============================================================

-- jkb_roles
ALTER TABLE public.jkb_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_roles" ON public.jkb_roles;
CREATE POLICY "Allow read jkb_roles" ON public.jkb_roles
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_roles' AND policyname = 'Allow insert jkb_roles'
  ) THEN
    CREATE POLICY "Allow insert jkb_roles" ON public.jkb_roles
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_roles' AND policyname = 'Allow update jkb_roles'
  ) THEN
    CREATE POLICY "Allow update jkb_roles" ON public.jkb_roles
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_roles' AND policyname = 'Allow delete jkb_roles'
  ) THEN
    CREATE POLICY "Allow delete jkb_roles" ON public.jkb_roles
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_user_roles
ALTER TABLE public.jkb_user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_user_roles" ON public.jkb_user_roles;
CREATE POLICY "Allow read jkb_user_roles" ON public.jkb_user_roles
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_roles' AND policyname = 'Allow insert jkb_user_roles'
  ) THEN
    CREATE POLICY "Allow insert jkb_user_roles" ON public.jkb_user_roles
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_roles' AND policyname = 'Allow update jkb_user_roles'
  ) THEN
    CREATE POLICY "Allow update jkb_user_roles" ON public.jkb_user_roles
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_roles' AND policyname = 'Allow delete jkb_user_roles'
  ) THEN
    CREATE POLICY "Allow delete jkb_user_roles" ON public.jkb_user_roles
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_permissions
ALTER TABLE public.jkb_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_permissions" ON public.jkb_permissions;
CREATE POLICY "Allow read jkb_permissions" ON public.jkb_permissions
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_permissions' AND policyname = 'Allow insert jkb_permissions'
  ) THEN
    CREATE POLICY "Allow insert jkb_permissions" ON public.jkb_permissions
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_permissions' AND policyname = 'Allow update jkb_permissions'
  ) THEN
    CREATE POLICY "Allow update jkb_permissions" ON public.jkb_permissions
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_permissions' AND policyname = 'Allow delete jkb_permissions'
  ) THEN
    CREATE POLICY "Allow delete jkb_permissions" ON public.jkb_permissions
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_role_permissions
ALTER TABLE public.jkb_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_role_permissions" ON public.jkb_role_permissions;
CREATE POLICY "Allow read jkb_role_permissions" ON public.jkb_role_permissions
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_role_permissions' AND policyname = 'Allow insert jkb_role_permissions'
  ) THEN
    CREATE POLICY "Allow insert jkb_role_permissions" ON public.jkb_role_permissions
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_role_permissions' AND policyname = 'Allow update jkb_role_permissions'
  ) THEN
    CREATE POLICY "Allow update jkb_role_permissions" ON public.jkb_role_permissions
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_role_permissions' AND policyname = 'Allow delete jkb_role_permissions'
  ) THEN
    CREATE POLICY "Allow delete jkb_role_permissions" ON public.jkb_role_permissions
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_users
ALTER TABLE public.jkb_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_users" ON public.jkb_users;
CREATE POLICY "Allow read jkb_users" ON public.jkb_users
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_users' AND policyname = 'Allow insert jkb_users'
  ) THEN
    CREATE POLICY "Allow insert jkb_users" ON public.jkb_users
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_users' AND policyname = 'Allow update jkb_users'
  ) THEN
    CREATE POLICY "Allow update jkb_users" ON public.jkb_users
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_users' AND policyname = 'Allow delete jkb_users'
  ) THEN
    CREATE POLICY "Allow delete jkb_users" ON public.jkb_users
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_sessions
ALTER TABLE public.jkb_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all jkb_sessions" ON public.jkb_sessions;
CREATE POLICY "Allow all jkb_sessions" ON public.jkb_sessions
  FOR ALL USING (true);

-- jkb_departments
ALTER TABLE public.jkb_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_departments" ON public.jkb_departments;
CREATE POLICY "Allow read jkb_departments" ON public.jkb_departments
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_departments' AND policyname = 'Allow insert jkb_departments'
  ) THEN
    CREATE POLICY "Allow insert jkb_departments" ON public.jkb_departments
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_departments' AND policyname = 'Allow update jkb_departments'
  ) THEN
    CREATE POLICY "Allow update jkb_departments" ON public.jkb_departments
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_departments' AND policyname = 'Allow delete jkb_departments'
  ) THEN
    CREATE POLICY "Allow delete jkb_departments" ON public.jkb_departments
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_user_departments
ALTER TABLE public.jkb_user_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_user_departments" ON public.jkb_user_departments;
CREATE POLICY "Allow read jkb_user_departments" ON public.jkb_user_departments
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_departments' AND policyname = 'Allow insert jkb_user_departments'
  ) THEN
    CREATE POLICY "Allow insert jkb_user_departments" ON public.jkb_user_departments
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_departments' AND policyname = 'Allow update jkb_user_departments'
  ) THEN
    CREATE POLICY "Allow update jkb_user_departments" ON public.jkb_user_departments
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_user_departments' AND policyname = 'Allow delete jkb_user_departments'
  ) THEN
    CREATE POLICY "Allow delete jkb_user_departments" ON public.jkb_user_departments
      FOR DELETE USING (true);
  END IF;
END $$;

-- jkb_workspaces
ALTER TABLE public.jkb_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read jkb_workspaces" ON public.jkb_workspaces;
CREATE POLICY "Allow read jkb_workspaces" ON public.jkb_workspaces
  FOR SELECT USING (true);
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_workspaces' AND policyname = 'Allow insert jkb_workspaces'
  ) THEN
    CREATE POLICY "Allow insert jkb_workspaces" ON public.jkb_workspaces
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_workspaces' AND policyname = 'Allow update jkb_workspaces'
  ) THEN
    CREATE POLICY "Allow update jkb_workspaces" ON public.jkb_workspaces
      FOR UPDATE USING (true);
  END IF;
END $$;
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_workspaces' AND policyname = 'Allow delete jkb_workspaces'
  ) THEN
    CREATE POLICY "Allow delete jkb_workspaces" ON public.jkb_workspaces
      FOR DELETE USING (true);
  END IF;
END $$;

-- ============================================================
-- 修复 jkb_notification_reads 表（如果不存在则创建）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jkb_notification_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.jkb_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.jkb_users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT true,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

ALTER TABLE public.jkb_notification_reads ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'jkb_notification_reads' AND policyname = 'Allow all jkb_notification_reads'
  ) THEN
    CREATE POLICY "Allow all jkb_notification_reads" ON public.jkb_notification_reads
      FOR ALL USING (true);
  END IF;
END $$;
