-- ============================================================
-- 邀请码功能
--
-- 用法：在 Supabase 控制台 → SQL Editor 里，把本文件全部内容粘贴执行一次。
-- 前提：已执行过 supabase/schema.sql。
--
-- 设计要点（重要）：
--   校验发生在数据库层面（auth.users 的 BEFORE INSERT 触发器），
--   而不是前端。所以：
--     · 改前端代码、用 API 直接注册，都绕不过去
--     · 前端只负责「提示」，不承担安全职责
--
-- 管理员旁路：
--   只有持有 service_role key 的调用方能设置 app_metadata.bypass_invite = 'true'。
--   前端（anon key）无法伪造，所以这是安全的后门。
-- ============================================================

-- ---------------- 邀请码表 ----------------
create table if not exists public.invite_codes (
  code        text primary key,
  note        text,                    -- 备注：给谁用的
  max_uses    integer not null default 1,   -- 最多可用次数
  used_count  integer not null default 0,   -- 已用次数
  expires_at  timestamptz,             -- 过期时间，null = 永不过期
  disabled    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists invite_codes_created_idx on public.invite_codes (created_at desc);

-- ---------------- 权限：只允许服务端管理 ----------------
alter table public.invite_codes enable row level security;

-- 刻意不创建任何 select/insert/update 策略。
-- 效果：anon 和普通登录用户都读不到、写不了邀请码表；
--       只有 service_role（后台/控制台）能操作。
-- 这样别人无法拿 anon key 把邀请码全部列出来。

-- ---------------- 校验用的内部函数 ----------------
-- 判断一个邀请码当前是否可用（不消耗次数）
create or replace function public.is_invite_code_valid(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return false;
  end if;

  select exists (
    select 1
    from public.invite_codes
    where code = trim(p_code)
      and disabled = false
      and used_count < max_uses
      and (expires_at is null or expires_at > now())
  ) into ok;

  return coalesce(ok, false);
end;
$$;

-- 前端注册前的预校验接口（只返回 true/false，不泄露任何邀请码信息）
create or replace function public.validate_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_invite_code_valid(p_code);
$$;

grant execute on function public.validate_invite_code(text) to anon, authenticated;

-- ---------------- 注册时的强制校验（核心） ----------------
create or replace function public.enforce_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_code_id text;
begin
  -- 管理员旁路：只有 service_role 能设置 app_metadata，前端伪造不了
  if coalesce(new.raw_app_meta_data->>'bypass_invite', '') = 'true' then
    return new;
  end if;

  v_code := trim(coalesce(new.raw_user_meta_data->>'invite_code', ''));

  if v_code = '' then
    raise exception '需要邀请码才能注册' using errcode = '23514';
  end if;

  -- 原子扣减：一条语句同时完成「校验 + 占用一次」，
  -- 避免并发下同一个邀请码被超用。
  update public.invite_codes
     set used_count = used_count + 1
   where code = v_code
     and disabled = false
     and used_count < max_uses
     and (expires_at is null or expires_at > now())
  returning code into v_code_id;

  if v_code_id is null then
    raise exception '邀请码无效或已用完' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invite_code on auth.users;
create trigger trg_enforce_invite_code
  before insert on auth.users
  for each row execute function public.enforce_invite_code();

-- ============================================================
-- 邀请码管理（在 SQL Editor 里执行）
-- ============================================================

-- 生成一个新邀请码（12 位随机，给某个老师用，最多注册 1 个账号）
-- 执行后下方结果里就是新码，复制发给对方即可。
insert into public.invite_codes (code, note, max_uses)
values (
  -- 12 位随机码：字母数字混合，排除易混淆的 0/O/1/l/I
  (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random()*31)::int + 1, 1), '')
     from generate_series(1, 12)),
  '示例：给某某老师',
  1
)
returning code, note, max_uses, expires_at;

-- ---------------- 常用管理语句（按需执行） ----------------

-- 查看所有邀请码及使用情况
-- select code, note, used_count, max_uses, expires_at, disabled, created_at
--   from public.invite_codes order by created_at desc;

-- 作废某个邀请码
-- update public.invite_codes set disabled = true where code = 'XXXXXXXXXXXX';

-- 给某个码增加可用次数
-- update public.invite_codes set max_uses = max_uses + 5 where code = 'XXXXXXXXXXXX';

-- 设置 7 天后过期
-- update public.invite_codes set expires_at = now() + interval '7 days' where code = 'XXXXXXXXXXXX';

-- 删除某个邀请码
-- delete from public.invite_codes where code = 'XXXXXXXXXXXX';
