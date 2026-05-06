-- 系统登录日志表（用于系统日志审查页面）
create table if not exists login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references jkb_users(id),
  display_name text,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  location text,
  login_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 索引
create index if not exists idx_login_logs_user on login_logs(user_id);
create index if not exists idx_login_logs_time on login_logs(login_time desc);
create index if not exists idx_login_logs_time_user on login_logs(login_time, user_id);

-- RLS
alter table login_logs enable row level security;
create policy "所有人可插入登录日志" on login_logs for insert with check (true);
create policy "所有人可查看登录日志" on login_logs for select using (true);
