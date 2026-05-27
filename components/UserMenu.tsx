'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  email: string;
  onLogout: () => void;
}

export function UserMenu({ email, onLogout }: Props) {
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    onLogout();
  }, [onLogout]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
      padding: '10px 0 0', fontSize: '.78rem', color: 'var(--muted)',
    }}>
      <span>{email}</span>
      <button
        onClick={handleLogout}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          padding: '3px 12px', cursor: 'pointer', fontSize: '.78rem',
          color: 'var(--muted)', fontFamily: 'inherit',
        }}
      >
        退出登录
      </button>
    </div>
  );
}
