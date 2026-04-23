-- ============================================================
-- 修复生产环境 RLS 策略
-- 自定义认证项目不可依赖 auth.uid()，所有 RLS 策略需用 true 放行
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 修复 jkb_document_shares 的 INSERT 策略
-- 原: WITH CHECK (auth.uid() IS NOT NULL) → 自定义认证下 auth.uid() 为 NULL，导致 INSERT 被拒绝
DROP POLICY IF EXISTS "文档分享-创建者可写" ON jkb_document_shares;
DROP POLICY IF EXISTS "文档分享-认证用户可插入" ON jkb_document_shares;
CREATE POLICY "文档分享-认证用户可插入" ON jkb_document_shares
  FOR INSERT WITH CHECK (true);

-- 2. 确认 jkb_documents 的 RLS 策略正确（应该已经正确，但确认一下）
DROP POLICY IF EXISTS "所有人可查看文档" ON jkb_documents;
DROP POLICY IF EXISTS "所有人可创建文档" ON jkb_documents;
DROP POLICY IF EXISTS "所有人可更新文档" ON jkb_documents;
DROP POLICY IF EXISTS "所有人可删除文档" ON jkb_documents;

CREATE POLICY "所有人可查看文档" ON jkb_documents FOR SELECT USING (true);
CREATE POLICY "所有人可创建文档" ON jkb_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "所有人可更新文档" ON jkb_documents FOR UPDATE USING (true);
CREATE POLICY "所有人可删除文档" ON jkb_documents FOR DELETE USING (true);

-- 3. 确认 jkb_users 的 SELECT 策略允许读取（文档列表需要查创建者信息）
DROP POLICY IF EXISTS "Allow read jkb_users" ON jkb_users;
CREATE POLICY "Allow read jkb_users" ON jkb_users FOR SELECT USING (true);

-- 4. 确保外键关系存在（PostgREST 需要外键才能做 jkb_users(display_name) 关联查询）
-- 如果 created_by 列没有外键，添加它
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
    AND table_name = 'jkb_documents'
    AND constraint_name = 'jkb_documents_created_by_fkey'
  ) THEN
    ALTER TABLE jkb_documents
      ADD CONSTRAINT jkb_documents_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES jkb_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. 刷新 PostgREST schema cache（通知 Supabase 重新加载表结构）
-- 这一步很重要！如果不刷新，PostgREST 可能不识别新增的外键
-- 在 Supabase Dashboard → Database → Extensions 中确认 pg_cron 可用
-- 或者手动执行：NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';
