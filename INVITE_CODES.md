# 邀请码功能使用说明

> 作用：只有拿到邀请码的人才能注册账号。避免网站地址被转发后，陌生人注册消耗你的 API 额度。

---

## 一、先跑 SQL（只做一次）

打开 Supabase 项目 → **SQL Editor** → **New query**

把 `supabase/invite-codes.sql` 的**全部内容**粘贴进去 → 点 **Run**。

> 前提：之前已经跑过 `supabase/schema.sql`（建那三张表）。

跑完后执行区最后会返回一行结果，里面有一串 12 位随机码 —— **这就是你的第一个邀请码，先留着给自己注册用。**

---

## 二、给自己注册

打开网站，点「没有账号？注册」，会多出一个 **邀请码** 输入框，把你刚才拿到的码填进去即可。

---

## 三、给老师发邀请码

每次有新老师要用：

1. 打开 Supabase → SQL Editor → New query
2. 执行下面这段（把 `note` 改成老师的名字，方便以后查）：

```sql
insert into public.invite_codes (code, note, max_uses)
values (
  (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random()*31)::int + 1, 1), '')
     from generate_series(1, 12)),
  '张老师',
  1
)
returning code;
```

3. 结果里会显示新生成的 12 位码，复制发给对方

**每个码默认只能用 1 次**（注册 1 个账号就失效），这样能精确控制人数。

---

## 四、常用管理操作

在 SQL Editor 里执行：

```sql
-- 查看所有邀请码的使用情况
select code, note, used_count, max_uses, expires_at, disabled, created_at
  from public.invite_codes
 order by created_at desc;

-- 作废某个码（比如发错人了）
update public.invite_codes set disabled = true where code = 'XXXXXXXXXXXX';

-- 一个码想给多个人用（比如给整个教研组 5 个名额）
update public.invite_codes set max_uses = 5 where code = 'XXXXXXXXXXXX';

-- 设置 7 天后过期
update public.invite_codes
   set expires_at = now() + interval '7 days'
 where code = 'XXXXXXXXXXXX';

-- 删除某个码
delete from public.invite_codes where code = 'XXXXXXXXXXXX';
```

---

## 五、它是怎么防绕过的（技术说明）

校验发生在 **数据库层**，不是前端：

```
用户提交注册
   ↓
Supabase Auth 准备写入 auth.users
   ↓
触发器 trg_enforce_invite_code 拦截
   ↓
用一条 UPDATE 原子地「校验 + 扣减次数」
   · 码不存在 / 已禁用 / 次数用完 / 已过期 → 抛异常，注册失败
   · 有效 → 放行，used_count + 1
   ↓
注册成功
```

这意味着：

- ✅ 直接调 Supabase API 注册，不填邀请码 → **失败**
- ✅ 改前端代码把邀请码输入框删掉 → **失败**
- ✅ 拿 anon key 去查邀请码表 → **查不到**（表开了 RLS 且没有任何策略）
- ✅ 并发抢同一个码 → 只会有一条 UPDATE 成功，不会超用

**唯一的旁路**：`app_metadata.bypass_invite = 'true'`。这个字段只有持有 `service_role` 密钥的调用方（也就是你，在服务端/控制台）能设置，前端无法伪造。

---

## 六、注意事项

1. **邀请码别用有规律的**（比如 `AAA111`）。现在生成的是 12 位随机码，够用。
2. **RPC 预校验可以枚举**：`validate_invite_code` 会给前端返回 true/false。理论上有人能暴力猜，但 12 位随机（32^12 ≈ 1.15×10^18）猜不出来。如果你特别在意，可以把 `validate_invite_code` 那段的 `grant execute` 删掉 —— 代价是注册失败时的错误提示会变笼统。
3. **管理员手动建账号**：用 Supabase 控制台的 Authentication → Users → Add user 建账号时，会因为没有邀请码被拦截。解决办法：用 SQL 先插入一个邀请码给它用；或者调用 Admin API 时在 `app_metadata` 里传 `{"bypass_invite": "true"}`。
4. **现有账号不受影响**：这个功能只拦「新注册」，已经注册过的账号照常登录。

---

## 七、和「关闭公开注册」的关系

Supabase 后台有个 `Disable signup` 开关（Authentication → Sign In / Providers → Email）。

- 打开它 → **任何人都注册不了**，包括有邀请码的人
- 关着它（默认）+ 本邀请码功能 → **有码才能注册**

**建议保持 `Disable signup` 关闭**，用邀请码控制。这样你还能通过发码来加人，不用每次去后台手动建账号。
