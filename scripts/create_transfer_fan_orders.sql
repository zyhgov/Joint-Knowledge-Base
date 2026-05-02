-- 创建转粉工单系统表

-- 1. 转粉工单主表
CREATE TABLE IF NOT EXISTS transfer_fan_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_ids TEXT[] NOT NULL DEFAULT '{}',      -- 源用户ID数组
  target_user_id UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,  -- 目标用户
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'pending', 'processed', 'cancelled', 'rejected')),
  reject_reason TEXT DEFAULT NULL,                    -- 驳回原因
  remark TEXT DEFAULT NULL,                           -- 创建人备注
  created_by UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,  -- 创建人
  processed_by UUID DEFAULT NULL REFERENCES jkb_users(id) ON DELETE SET NULL,  -- 处理人
  processed_at TIMESTAMPTZ DEFAULT NULL,               -- 处理时间
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_status ON transfer_fan_orders(status);
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_target_user ON transfer_fan_orders(target_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_created_by ON transfer_fan_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_processed_by ON transfer_fan_orders(processed_by);
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_created_at ON transfer_fan_orders(created_at DESC);

-- 启用 RLS
ALTER TABLE transfer_fan_orders ENABLE ROW LEVEL SECURITY;

-- RLS 策略：所有认证用户可查看
CREATE POLICY "Anyone can view transfer fan orders" ON transfer_fan_orders
  FOR SELECT USING (true);

-- RLS 策略：所有认证用户可插入
CREATE POLICY "Anyone can insert transfer fan orders" ON transfer_fan_orders
  FOR INSERT WITH CHECK (true);

-- RLS 策略：所有认证用户可更新（前端代码已做权限检查）
CREATE POLICY "Anyone can update transfer fan orders" ON transfer_fan_orders
  FOR UPDATE USING (true);

-- RLS 策略：所有认证用户可删除
CREATE POLICY "Anyone can delete transfer fan orders" ON transfer_fan_orders
  FOR DELETE USING (true);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_transfer_fan_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transfer_fan_orders_updated_at ON transfer_fan_orders;
CREATE TRIGGER trg_transfer_fan_orders_updated_at
  BEFORE UPDATE ON transfer_fan_orders
  FOR EACH ROW EXECUTE FUNCTION update_transfer_fan_orders_updated_at();
