-- ============================================================
-- 年度考核测评系统 · 云数据库初始化脚本（Supabase / PostgreSQL）
-- 用法：Supabase 控制台 → SQL Editor → 新建查询 → 粘贴全部内容 → Run
-- 只需执行一次。执行后前端即可多人共享同一份数据。
-- ============================================================

-- 1. 状态表：整份数据存一行（id='main'），结构如下
--    data: { items:[{id,name,max}], config:{items,password}, persons:[{id,name,duty}], records:[...] }
create table if not exists public.kaopin_state (
  id         text primary key,
  data       jsonb      not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kaopin_state enable row level security;

-- 2. 权限策略：允许任何人读写这一行
--    （考核打分在内网/小范围内使用，匿名可读写；若需登录鉴权可改为 authenticated）
drop policy if exists "kaopin_state_read"  on public.kaopin_state;
drop policy if exists "kaopin_state_write" on public.kaopin_state;
create policy "kaopin_state_read"
  on public.kaopin_state for select
  to anon, authenticated
  using (true);
create policy "kaopin_state_write"
  on public.kaopin_state for insert
  to anon, authenticated
  with check (true);
create policy "kaopin_state_update"
  on public.kaopin_state for update
  to anon, authenticated
  using (true) with check (true);

-- 3. 授权给数据接口角色
grant select, insert, update, delete on public.kaopin_state to anon, authenticated;

-- 4. 初始化主记录（已存在则忽略）
insert into public.kaopin_state (id, data)
values ('main', '{"items":[],"config":{"items":[{"id":"i1","name":"政治品德","max":20},{"id":"i2","name":"工作能力","max":20},{"id":"i3","name":"工作态度","max":20},{"id":"i4","name":"业绩贡献","max":20},{"id":"i5","name":"廉洁从业","max":20}],"password":"admin888"},"persons":[],"records":[]}'::jsonb)
on conflict (id) do nothing;

-- 5. （可选）自动维护更新时间
create or replace function public.kaopin_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists kaopin_state_touch on public.kaopin_state;
create trigger kaopin_state_touch
  before update on public.kaopin_state
  for each row execute function public.kaopin_touch_updated_at();

-- ============================================================
-- 完成。回到前端：打开 js/cloud.js，把 SUPABASE_URL 与
-- SUPABASE_ANON_KEY 填成你项目的 Project URL 和 anon / publishable key，
-- 提交到 GitHub 后即可多人共享数据。
-- ============================================================
