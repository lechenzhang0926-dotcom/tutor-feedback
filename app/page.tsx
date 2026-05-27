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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingStudentId, setPendingStudentId] = useState('');

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUserEmail(session?.user?.email || null);
      } catch {
        setUserEmail(null);
      }
      setAuthChecked(true);
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
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

  if (!authChecked) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Tutor 课后反馈生成器</h1>
            <p>正在加载...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return <AuthForm onLogin={() => {}} />;
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
        <RegularHomeworkTab toast={toast} onCopy={handleCopy} />
      </div>

      <div style={{ display: activeTab === 'meeting' ? 'block' : 'none' }}>
        <MeetingReminder toast={toast} onCopy={handleCopy} />
      </div>

      <div style={{ display: activeTab === 'students' ? 'block' : 'none' }}>
        <StudentProfilesTab toast={toast} onNavigate={(tab) => setActiveTab(tab as TabId)} onSelectStudent={(id) => setPendingStudentId(id)} />
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
