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
    <div className="top-bar">
      <div className="top-bar-user">
        <span>{email}</span>
        <button className="top-bar-logout" onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </div>
  );
}
