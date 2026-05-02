-- 转粉加急按钮点击日志表
-- 记录每次点击"转粉加急"按钮的操作，用于统计哪些用户频繁点击
CREATE TABLE IF NOT EXISTS transfer_fan_urgent_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES jkb_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按用户统计
CREATE INDEX IF NOT EXISTS idx_urgent_logs_user_id ON transfer_fan_urgent_logs(user_id);
-- 索引：按时间查询
CREATE INDEX IF NOT EXISTS idx_urgent_logs_created_at ON transfer_fan_urgent_logs(created_at DESC);

-- RLS 策略（宽松模式，应用层控制权限）
ALTER TABLE transfer_fan_urgent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所有人可查看加急日志" ON transfer_fan_urgent_logs
  FOR SELECT USING (true);

CREATE POLICY "所有人可插入加急日志" ON transfer_fan_urgent_logs
  FOR INSERT WITH CHECK (true);
