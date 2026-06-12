-- 人工转粉工单扩展字段（一次性完整脚本）
-- 在 Supabase SQL Editor 中执行

-- 1. 申请原因类型
ALTER TABLE transfer_fan_orders ADD COLUMN IF NOT EXISTS reason_type TEXT;
COMMENT ON COLUMN transfer_fan_orders.reason_type IS '申请原因: seat_rest=坐席休息, seat_resign=坐席离职, wechat_transfer=微信用户转粉, other=其他原因';

-- 2. 其他原因详情（最多50字）
ALTER TABLE transfer_fan_orders ADD COLUMN IF NOT EXISTS reason_detail TEXT;
COMMENT ON COLUMN transfer_fan_orders.reason_detail IS '其他原因详情，最多50字';

-- 3. 坐席用户ID（UUID 类型，与 jkb_users.id 一致）
-- 如果之前已建为 TEXT，先转为 UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transfer_fan_orders'
      AND column_name = 'seat_user_id'
      AND data_type = 'text'
  ) THEN
    -- 先删除可能存在的旧外键（如果之前尝试过）
    ALTER TABLE transfer_fan_orders DROP CONSTRAINT IF EXISTS transfer_fan_orders_seat_user_id_fkey;
    -- 将 TEXT 列转为 UUID（null 值不受影响，非 null 值必须是合法 UUID）
    ALTER TABLE transfer_fan_orders ALTER COLUMN seat_user_id TYPE uuid USING seat_user_id::uuid;
  END IF;
END $$;

-- 如果列不存在，则新建为 UUID
ALTER TABLE transfer_fan_orders ADD COLUMN IF NOT EXISTS seat_user_id uuid;
COMMENT ON COLUMN transfer_fan_orders.seat_user_id IS '坐席用户ID，关联 jkb_users(id)';

-- 4. 附件图片URL数组
ALTER TABLE transfer_fan_orders ADD COLUMN IF NOT EXISTS attachment_urls JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN transfer_fan_orders.attachment_urls IS '附件图片URL数组 [{url, key, uploaded_at}]';

-- 5. 坐席用户外键（Supabase PostgREST 关联查询依赖此约束）
ALTER TABLE transfer_fan_orders
  DROP CONSTRAINT IF EXISTS transfer_fan_orders_seat_user_id_fkey,
  ADD CONSTRAINT transfer_fan_orders_seat_user_id_fkey
  FOREIGN KEY (seat_user_id) REFERENCES jkb_users(id) ON DELETE SET NULL;

-- 6. 索引
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_seat_user_id ON transfer_fan_orders(seat_user_id) WHERE seat_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_fan_orders_reason_type ON transfer_fan_orders(reason_type) WHERE reason_type IS NOT NULL;
