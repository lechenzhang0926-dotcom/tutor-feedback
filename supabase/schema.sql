-- ============================================================
-- Tutor 课后反馈生成器 — Supabase 表结构 + 行级权限（RLS）
--
-- 用法：在 Supabase 控制台 → SQL Editor 里，把本文件全部内容粘贴执行一次。
-- 作用：建 3 张表（学生档案 / 反馈历史 / 每日用量），并开启 RLS，
--       保证每个登录用户只能读写自己的数据（auth.uid() = user_id）。
-- ============================================================

-- ---------------- 学生档案 ----------------
create table if not exists public.students (
  id                 text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  student_no         text,
  textbook           text,
  common_weak_words  jsonb not null default '[]'::jsonb,
  common_issues      jsonb not null default '[]'::jsonb,
  strengths          jsonb not null default '[]'::jsonb,
  recent_feedbacks  jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists students_user_id_idx on public.students (user_id);

-- ---------------- 反馈历史 ----------------
create table if not exists public.feedback_history (
  id               text primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  student_name     text,
  course_type      text,
  tone             text,
  original_notes   text,
  focus            text,
  keywords         text,
  feedback         text,
  created_at       timestamptz not null default now()
);

create index if not exists feedback_history_user_id_idx on public.feedback_history (user_id);

-- ---------------- 每日生成用量（限流） ----------------
create table if not exists public.daily_usage (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  day      text not null,
  count    integer not null default 0
);

-- ---------------- 开启行级安全 + 策略 ----------------
alter table public.students        enable row level security;
alter table public.feedback_history enable row level security;
alter table public.daily_usage     enable row level security;

-- 每张表：本人只能碰自己的行（select/insert/update/delete 都受限）
drop policy if exists "students own rows" on public.students;
create policy "students own rows" on public.students
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "history own rows" on public.feedback_history;
create policy "history own rows" on public.feedback_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "usage own rows" on public.daily_usage;
create policy "usage own rows" on public.daily_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
