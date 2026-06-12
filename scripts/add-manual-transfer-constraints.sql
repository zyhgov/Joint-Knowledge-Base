-- 人工转粉工单必填字段约束
-- 执行该脚本后，插入 transfer_fan_orders 时若缺少必填字段将被数据库拒绝

-- 创建校验函数
CREATE OR REPLACE FUNCTION check_manual_transfer_required_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- 只有新提交的工单需要校验
  IF NEW.status IN ('submitted', 'pending') THEN
    IF NEW.reason_type IS NULL OR NEW.reason_type = '' THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: 申请原因为必填项，系统已更新，请刷新页面后重试';
    END IF;
    
    IF NEW.seat_user_id IS NULL THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: 转前坐席为必填项，系统已更新，请刷新页面后重试';
    END IF;
    
    IF NEW.attachment_urls IS NULL OR NEW.attachment_urls = '[]'::jsonb THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: 情况截图为必填项，系统已更新，请刷新页面后重试';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器（仅 INSERT 时触发，不影响已有数据）
DROP TRIGGER IF EXISTS trg_check_manual_transfer_required_fields ON transfer_fan_orders;
CREATE TRIGGER trg_check_manual_transfer_required_fields
  BEFORE INSERT ON transfer_fan_orders
  FOR EACH ROW
  EXECUTE FUNCTION check_manual_transfer_required_fields();
