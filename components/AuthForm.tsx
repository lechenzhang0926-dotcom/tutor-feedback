'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  onLogin: () => void;
}

export function AuthForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
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
            supabase.auth.signOut();
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
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, isRegister, keepLoggedIn, onLogin]);

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
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
            >
              {isRegister ? '已有账号？去登录' : '没有账号？注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
