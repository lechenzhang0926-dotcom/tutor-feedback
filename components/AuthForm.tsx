'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  onLogin: () => void;
}

export function AuthForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  // 邀请码是否已启用？
  // null = 还在探测；true = 数据库里已执行 invite-codes.sql；false = 还没启用
  // 这样设计的好处：没跑 SQL 时，注册流程与原来完全一致（不出现邀请码输入框），
  // 一旦在 Supabase 里执行了脚本，页面下次打开就自动开始要求邀请码，无需重新发版。
  const [inviteEnabled, setInviteEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase || inviteEnabled !== null) return;
    let cancelled = false;
    void (async () => {
      const { error: probeErr } = await supabase!.rpc('validate_invite_code', {
        p_code: '__probe__',
      });
      if (cancelled) return;
      // PGRST202 = 找不到这个函数 → 说明还没跑 invite-codes.sql
      const missing =
        !!probeErr &&
        (probeErr.code === 'PGRST202' || /Could not find the function/i.test(probeErr.message));
      setInviteEnabled(!missing);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteEnabled]);

  const handleSubmit = useCallback(async () => {
    if (!supabase) {
      setError('登录服务未配置');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }
    if (isRegister && inviteEnabled && !inviteCode.trim()) {
      setError('请填写邀请码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        const code = inviteCode.trim().toUpperCase();

        if (inviteEnabled && code) {
          // 先问一下服务端这个码能不能用，好在提交前给出明确提示
          // （真正的把关在数据库触发器里，这里只是让错误信息更友好）
          const { data: codeOk, error: checkErr } = await supabase.rpc('validate_invite_code', {
            p_code: code,
          });
          if (checkErr) {
            // RPC 异常时不阻断注册，交由数据库触发器做最终判断
            console.warn('[AuthForm] 邀请码预校验失败，继续尝试注册:', checkErr.message);
          } else if (codeOk === false) {
            throw new Error('邀请码无效或已用完，请向管理员确认');
          }
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: inviteEnabled && code ? { invite_code: code } : {},
          },
        });
        if (signUpError) throw signUpError;
        onLogin();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (signInError) throw signInError;

        if (!keepLoggedIn) {
          window.addEventListener('beforeunload', () => {
            void supabase!.auth.signOut();
          });
        }

        onLogin();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      if (msg.includes('Invalid login credentials')) {
        setError('邮箱或密码错误');
      } else if (msg.includes('already registered')) {
        setError('该邮箱已注册，请直接登录');
      } else if (msg.includes('邀请码')) {
        // 数据库触发器抛出的中文提示，直接展示
        setError(msg);
      } else if (msg.includes('Database error saving new user')) {
        // Supabase 会把触发器的异常统一包装成这条，无法区分具体原因
        setError('注册失败：邀请码无效、已用完，或该邮箱已注册');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, inviteCode, isRegister, keepLoggedIn, onLogin, inviteEnabled]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Tutor 课后反馈生成器</h1>
          <p>登录后开始生成课堂反馈和作业提醒</p>
        </div>

        <div className="auth-body">
          <div className="field">
            <label>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="your@email.com"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="至少 6 位"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          {isRegister && inviteEnabled === true && (
            <div className="field">
              <label>邀请码</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="12 位邀请码，向管理员索取"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                style={{ letterSpacing: '0.08em', fontFamily: 'ui-monospace, monospace' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </div>
          )}

          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(e) => setKeepLoggedIn(e.target.checked)}
            />
            <span>下次自动登录</span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <div className="auth-buttons">
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? '处理中...' : isRegister ? '注册' : '登录'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { setIsRegister(!isRegister); setError(''); setInviteCode(''); }}
            >
              {isRegister ? '已有账号？去登录' : '没有账号？注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
