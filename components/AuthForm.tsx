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
        setError('');
        // 注册成功后自动登录
        onLogin();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (signInError) throw signInError;

        // 不保持登录：监听页面关闭时登出
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
    <div className="container" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="header">
        <h1>Tutor 课后反馈生成器</h1>
        <div className="sub">把课堂随记变成自然、得体的家长反馈</div>
      </div>

      <div className="card" style={{ marginTop: 32 }}>
        <div className="card-title">{isRegister ? '注册账号' : '登录'}</div>

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

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.84rem', fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(e) => setKeepLoggedIn(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            下次自动登录
          </label>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '.84rem', marginBottom: 12 }}>{error}</div>
        )}

        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
          >
            {isRegister ? '已有账号？登录' : '没有账号？注册'}
          </button>
        </div>
      </div>
    </div>
  );
}
