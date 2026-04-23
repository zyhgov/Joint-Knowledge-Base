-- =====================================================
-- 修复权限系统 + 添加隐藏功能
-- 执行顺序：在 Supabase SQL Editor 中执行
-- =====================================================

-- =====================================================
-- 1. 创建/替换 get_user_permissions RPC 函数
-- 这是权限加载的核心，确保自定义角色的权限能正确查询
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_permissions(user_uuid UUID)
RETURNS TABLE(permission_code TEXT, permission_id UUID, resource TEXT, action TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.code AS permission_code,
    p.id AS permission_id,
    p.resource,
    p.action
  FROM jkb_user_roles ur
  JOIN jkb_role_permissions rp ON ur.role_id = rp.role_id
  JOIN jkb_permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = user_uuid
  GROUP BY p.code, p.id, p.resource, p.action;
$$;

-- 添加注释
COMMENT ON FUNCTION get_user_permissions(UUID) IS '获取用户所有权限码（通过角色关联查询）';

-- =====================================================
-- 2. 创建 user_has_permission RPC 函数
-- 检查用户是否拥有某个权限
-- =====================================================
CREATE OR REPLACE FUNCTION user_has_permission(user_uuid UUID, perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jkb_user_roles ur
    JOIN jkb_role_permissions rp ON ur.role_id = rp.role_id
    JOIN jkb_permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = user_uuid AND p.code = perm_code
  );
$$;

-- =====================================================
-- 3. 为 jkb_notifications 表添加 is_hidden 列
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jkb_notifications' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE jkb_notifications ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================
-- 4. 为 jkb_announcements 表添加 is_hidden 列
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jkb_announcements' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE jkb_announcements ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================
-- 5. 确保 RLS 策略正确（允许所有查询）
-- 因为项目使用自定义认证，auth.uid() 返回 null
-- =====================================================

-- jkb_permissions 表
DROP POLICY IF EXISTS "Allow read jkb_permissions" ON jkb_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON jkb_permissions;
CREATE POLICY "Allow read jkb_permissions" ON jkb_permissions
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_permissions" ON jkb_permissions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_permissions" ON jkb_permissions
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_permissions" ON jkb_permissions
  FOR DELETE USING (true);

-- jkb_user_roles 表
DROP POLICY IF EXISTS "Allow read jkb_user_roles" ON jkb_user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON jkb_user_roles;
CREATE POLICY "Allow read jkb_user_roles" ON jkb_user_roles
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_user_roles" ON jkb_user_roles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_user_roles" ON jkb_user_roles
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_user_roles" ON jkb_user_roles
  FOR DELETE USING (true);

-- jkb_role_permissions 表
DROP POLICY IF EXISTS "Allow read jkb_role_permissions" ON jkb_role_permissions;
DROP POLICY IF EXISTS "Admins can manage role_permissions" ON jkb_role_permissions;
CREATE POLICY "Allow read jkb_role_permissions" ON jkb_role_permissions
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_role_permissions" ON jkb_role_permissions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_role_permissions" ON jkb_role_permissions
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_role_permissions" ON jkb_role_permissions
  FOR DELETE USING (true);

-- jkb_roles 表
DROP POLICY IF EXISTS "Allow read jkb_roles" ON jkb_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON jkb_roles;
CREATE POLICY "Allow read jkb_roles" ON jkb_roles
  FOR SELECT USING (true);
CREATE POLICY "Allow insert jkb_roles" ON jkb_roles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update jkb_roles" ON jkb_roles
  FOR UPDATE USING (true);
CREATE POLICY "Allow delete jkb_roles" ON jkb_roles
  FOR DELETE USING (true);

-- =====================================================
-- 6. 验证脚本 - 检查权限是否正确设置
-- =====================================================

-- 查看所有角色及其权限码
-- SELECT r.name, r.code, p.code as permission_code, p.resource, p.action
-- FROM jkb_roles r
-- LEFT JOIN jkb_role_permissions rp ON r.id = rp.role_id
-- LEFT JOIN jkb_permissions p ON rp.permission_id = p.id
-- ORDER BY r.level DESC, r.name, p.resource, p.action;

-- 查看特定用户的权限
-- SELECT * FROM get_user_permissions('替换为用户UUID');

-- 查看用户-角色关联
-- SELECT u.display_name, u.phone, r.name as role_name, r.code as role_code
-- FROM jkb_users u
-- LEFT JOIN jkb_user_roles ur ON u.id = ur.user_id
-- LEFT JOIN jkb_roles r ON ur.role_id = r.id
-- ORDER BY u.display_name;
