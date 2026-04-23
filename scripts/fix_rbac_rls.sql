-- 修复 RBAC 权限查询相关表的 RLS 策略
-- 本项目使用自定义认证（不用 Supabase Auth），auth.uid() 返回 null
-- 需要确保 jkb_user_roles, jkb_role_permissions, jkb_permissions 表可被查询

-- =====================================================
-- jkb_user_roles 表
-- =====================================================

-- 先删除可能存在的旧策略（基于 auth.uid() 的策略会导致查询失败）
DROP POLICY IF EXISTS "Users can view own roles" ON jkb_user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON jkb_user_roles;

-- 创建新策略（允许所有查询）
CREATE POLICY "Allow read jkb_user_roles" ON jkb_user_roles
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_user_roles" ON jkb_user_roles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_user_roles" ON jkb_user_roles
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_user_roles" ON jkb_user_roles
  FOR DELETE USING (true);

-- =====================================================
-- jkb_role_permissions 表
-- =====================================================

DROP POLICY IF EXISTS "Allow read role_permissions" ON jkb_role_permissions;
DROP POLICY IF EXISTS "Admins can manage role_permissions" ON jkb_role_permissions;

CREATE POLICY "Allow read jkb_role_permissions" ON jkb_role_permissions
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_role_permissions" ON jkb_role_permissions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_role_permissions" ON jkb_role_permissions
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_role_permissions" ON jkb_role_permissions
  FOR DELETE USING (true);

-- =====================================================
-- jkb_permissions 表
-- =====================================================

DROP POLICY IF EXISTS "Allow read permissions" ON jkb_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON jkb_permissions;

CREATE POLICY "Allow read jkb_permissions" ON jkb_permissions
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_permissions" ON jkb_permissions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_permissions" ON jkb_permissions
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_permissions" ON jkb_permissions
  FOR DELETE USING (true);

-- =====================================================
-- jkb_roles 表（确保也能查询）
-- =====================================================

DROP POLICY IF EXISTS "Allow read roles" ON jkb_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON jkb_roles;

CREATE POLICY "Allow read jkb_roles" ON jkb_roles
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_roles" ON jkb_roles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_roles" ON jkb_roles
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_roles" ON jkb_roles
  FOR DELETE USING (true);
