'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AuthForm } from '@/components/AuthForm';
import { UserMenu } from '@/components/UserMenu';
import { DashboardTab } from '@/components/DashboardTab';
import { RegularFeedbackTab } from '@/components/RegularFeedbackTab';
import { RegularHomeworkTab } from '@/components/RegularHomeworkTab';
import { MeetingReminder } from '@/components/MeetingReminder';
import { StudentProfilesTab } from '@/components/StudentProfilesTab';

type TabId = 'dashboard' | 'regular-feedback' | 'regular-homework' | 'meeting' | 'students';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'regular-feedback', label: '课后反馈' },
  { id: 'regular-homework', label: '正课作业' },
  { id: 'meeting', label: '会议提醒' },
  { id: 'students', label: '学生档案' },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [toastMsg, setToastMsg] = useState('');
  const [userEmail, setUserEmail] = useState<string | null | 'loading'>('loading');
  const [pendingStudentId, setPendingStudentId] = useState('');

  useEffect(() => {
    let cancelled = false;

    // 3 秒后如果 Supabase 没响应，直接放行到登录页
    const timeout = setTimeout(() => {
      setUserEmail((prev) => (prev === 'loading' ? null : prev));
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        clearTimeout(timeout);
        setUserEmail(session?.user?.email || null);
      }
    }).catch(() => {
      if (!cancelled) {
        clearTimeout(timeout);
        setUserEmail(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      setUserEmail(session?.user?.email || null);
    });

    return () => { cancelled = true; clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  }, []);

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('已复制到剪贴板');
    },
    [toast]
  );

  if (userEmail === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Tutor 课后反馈生成器</h1>
          </div>
          <div className="auth-body" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.88rem' }}>
            检查登录状态...
          </div>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return <AuthForm onLogin={() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUserEmail(session?.user?.email || null);
      }).catch(() => {});
    }} />;
  }

  return (
    <div className="container">
      <UserMenu email={userEmail} onLogout={() => setUserEmail(null)} />

      <div className="header">
        <h1>Tutor 课后反馈生成器</h1>
        <div className="sub">把课堂随记变成自然、得体的家长反馈</div>
      </div>

      <div className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
        <DashboardTab
          onNavigate={(tab) => setActiveTab(tab as TabId)}
          onSelectStudent={(id) => setPendingStudentId(id)}
        />
      </div>

      <div style={{ display: activeTab === 'regular-feedback' ? 'block' : 'none' }}>
        <RegularFeedbackTab toast={toast} preSelectStudentId={pendingStudentId} />
      </div>

      <div style={{ display: activeTab === 'regular-homework' ? 'block' : 'none' }}>
        <RegularHomeworkTab toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} />
      </div>

      <div style={{ display: activeTab === 'meeting' ? 'block' : 'none' }}>
        <MeetingReminder toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} />
      </div>

      <div style={{ display: activeTab === 'students' ? 'block' : 'none' }}>
        <StudentProfilesTab toast={toast} onNavigate={(tab) => setActiveTab(tab as TabId)} onSelectStudent={(id) => setPendingStudentId(id)} />
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
