-- ============================================================
-- 权限种子数据 - 在 Supabase SQL Editor 中执行
-- 确保所有权限码存在于 jkb_permissions 表中
-- 幂等：可重复执行，不会报错
-- ============================================================

-- 步骤1：先删除旧的可能冲突的 (resource, action) 记录
-- 保留当前 code 对应的记录，删除同一 (resource, action) 但 code 不同的旧记录
DELETE FROM jkb_permissions
WHERE (resource, action) IN (
  VALUES
    ('file', 'create'), ('file', 'read'), ('file', 'update'), ('file', 'delete'), ('file', 'share'), ('file', 'manage'),
    ('workspace', 'create'), ('workspace', 'read'), ('workspace', 'update'), ('workspace', 'delete'), ('workspace', 'manage'),
    ('document', 'create'), ('document', 'read'), ('document', 'update'), ('document', 'delete'), ('document', 'share'),
    ('user', 'manage'), ('role', 'manage'), ('department', 'manage'),
    ('notification', 'manage'), ('announcement', 'manage')
)
AND code NOT IN (
  'file_create', 'file_read', 'file_edit', 'file_delete', 'file_share', 'file_manage',
  'workspace_create', 'workspace_read', 'workspace_edit', 'workspace_delete', 'workspace_manage',
  'document_create', 'document_read', 'document_edit', 'document_delete', 'document_share',
  'user_manage', 'role_manage', 'department_manage',
  'notification_manage', 'announcement_manage'
);

-- 步骤2：插入权限码（如已存在则跳过）
INSERT INTO jkb_permissions (id, name, code, description, resource, action, created_at)
VALUES
  -- 文件权限
  (gen_random_uuid(), '上传文件', 'file_create', '允许上传新文件', 'file', 'create', now()),
  (gen_random_uuid(), '查看文件', 'file_read', '允许查看文件列表和详情', 'file', 'read', now()),
  (gen_random_uuid(), '编辑文件', 'file_edit', '允许编辑文件信息和属性', 'file', 'update', now()),
  (gen_random_uuid(), '删除文件', 'file_delete', '允许删除文件', 'file', 'delete', now()),
  (gen_random_uuid(), '分享文件', 'file_share', '允许创建文件分享链接', 'file', 'share', now()),
  (gen_random_uuid(), '管理文件', 'file_manage', '管理所有文件的权限和访问', 'file', 'manage', now()),

  -- 工作区权限
  (gen_random_uuid(), '创建工作区', 'workspace_create', '允许创建新工作区', 'workspace', 'create', now()),
  (gen_random_uuid(), '查看工作区', 'workspace_read', '允许查看工作区列表', 'workspace', 'read', now()),
  (gen_random_uuid(), '编辑工作区', 'workspace_edit', '允许编辑工作区信息和设置', 'workspace', 'update', now()),
  (gen_random_uuid(), '删除工作区', 'workspace_delete', '允许删除工作区', 'workspace', 'delete', now()),
  (gen_random_uuid(), '管理工作区', 'workspace_manage', '管理所有工作区的权限和访问', 'workspace', 'manage', now()),

  -- 文档权限
  (gen_random_uuid(), '创建文档', 'document_create', '允许创建新文档', 'document', 'create', now()),
  (gen_random_uuid(), '查看文档', 'document_read', '允许查看文档内容', 'document', 'read', now()),
  (gen_random_uuid(), '编辑文档', 'document_edit', '允许编辑文档内容', 'document', 'update', now()),
  (gen_random_uuid(), '删除文档', 'document_delete', '允许删除文档', 'document', 'delete', now()),
  (gen_random_uuid(), '分享文档', 'document_share', '允许创建文档分享链接', 'document', 'share', now()),

  -- 用户/角色/部门管理
  (gen_random_uuid(), '用户管理', 'user_manage', '允许管理用户（创建、编辑、停用、删除）', 'user', 'manage', now()),
  (gen_random_uuid(), '角色管理', 'role_manage', '允许管理角色和权限分配', 'role', 'manage', now()),
  (gen_random_uuid(), '部门管理', 'department_manage', '允许管理部门（创建、编辑、删除）', 'department', 'manage', now()),

  -- 通知/公告
  (gen_random_uuid(), '通知管理', 'notification_manage', '允许发送和管理通知', 'notification', 'manage', now()),
  (gen_random_uuid(), '公告管理', 'announcement_manage', '允许发布和管理公告与任务', 'announcement', 'manage', now())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action;

-- ============================================================
-- 为现有角色分配默认权限
-- ============================================================

-- admin 角色获取所有权限（如果 admin 角色存在）
DO $$
DECLARE
  admin_role_id UUID;
  perm_id UUID;
BEGIN
  SELECT id INTO admin_role_id FROM jkb_roles WHERE code = 'admin' LIMIT 1;
  IF admin_role_id IS NOT NULL THEN
    FOR perm_id IN SELECT id FROM jkb_permissions LOOP
      INSERT INTO jkb_role_permissions (role_id, permission_id, granted_at)
      VALUES (admin_role_id, perm_id, now())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- member 角色获取基础权限
DO $$
DECLARE
  member_role_id UUID;
  perm_id UUID;
BEGIN
  SELECT id INTO member_role_id FROM jkb_roles WHERE code = 'member' LIMIT 1;
  IF member_role_id IS NOT NULL THEN
    FOR perm_id IN SELECT id FROM jkb_permissions WHERE code IN (
      'file_create', 'file_read', 'file_edit', 'file_share',
      'workspace_create', 'workspace_read',
      'document_create', 'document_read', 'document_edit', 'document_share'
    ) LOOP
      INSERT INTO jkb_role_permissions (role_id, permission_id, granted_at)
      VALUES (member_role_id, perm_id, now())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- guest 角色获取只读权限
DO $$
DECLARE
  guest_role_id UUID;
  perm_id UUID;
BEGIN
  SELECT id INTO guest_role_id FROM jkb_roles WHERE code = 'guest' LIMIT 1;
  IF guest_role_id IS NOT NULL THEN
    FOR perm_id IN SELECT id FROM jkb_permissions WHERE code IN (
      'file_read', 'workspace_read', 'document_read'
    ) LOOP
      INSERT INTO jkb_role_permissions (role_id, permission_id, granted_at)
      VALUES (guest_role_id, perm_id, now())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- 为自定义角色（如运营人员）分配权限示例
-- 取消注释并替换角色 code 来使用
-- ============================================================

-- DO $$
-- DECLARE
--   role_id UUID;
--   perm_id UUID;
-- BEGIN
--   -- 替换 'operator' 为你的自定义角色 code
--   SELECT id INTO role_id FROM jkb_roles WHERE code = 'operator' LIMIT 1;
--   IF role_id IS NOT NULL THEN
--     FOR perm_id IN SELECT id FROM jkb_permissions WHERE code IN (
--       'file_create', 'file_read', 'file_edit', 'file_delete', 'file_share',
--       'workspace_read',
--       'document_create', 'document_read', 'document_edit', 'document_share'
--     ) LOOP
--       INSERT INTO jkb_role_permissions (role_id, permission_id, granted_at)
--       VALUES (role_id, perm_id, now())
--       ON CONFLICT DO NOTHING;
--     END LOOP;
--   END IF;
-- END $$;
