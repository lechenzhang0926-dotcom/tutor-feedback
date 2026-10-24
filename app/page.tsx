'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase, isAuthConfigured } from '@/lib/supabaseClient';
import { seedFromSupabase, clearLocalData } from '@/lib/cloudSync';
import { AuthForm } from '@/components/AuthForm';
import { UserMenu } from '@/components/UserMenu';
import { DashboardTab } from '@/components/DashboardTab';
import { RegularFeedbackTab } from '@/components/RegularFeedbackTab';
import { HomeworkTab } from '@/components/HomeworkTab';
import { MeetingReminder } from '@/components/MeetingReminder';
import { StudentProfilesTab } from '@/components/StudentProfilesTab';
import { EnglishSystemGuide, type ImportFeedbackData, type ImportHomeworkData } from '@/components/EnglishSystemGuide';
import { ExtensionImportListener } from '@/components/ExtensionImportListener';
import { getStudents } from '@/lib/storage';

type TabId = 'dashboard' | 'regular-feedback' | 'homework' | 'meeting' | 'students' | 'import';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'regular-feedback', label: '课后反馈' },
  { id: 'homework', label: '作业' },
  { id: 'meeting', label: '会议提醒' },
  { id: 'students', label: '学生档案' },
  { id: 'import', label: '本地自动化' },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [toastMsg, setToastMsg] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const gotSessionRef = useRef(false);
  // 已经为哪个用户做过云端同步。
  // 关键：同一用户只需同步一次。否则浏览器切回标签页时 Supabase 会自动刷新 token，
  // 触发 onAuthStateChange('TOKEN_REFRESHED')，若再次进入 seeding 分支，
  // 会把整个界面卸载重建 —— 用户正在填的作业内容就全没了。
  const seededUserRef = useRef<string | null>(null);
  const [pendingStudentId, setPendingStudentId] = useState('');
  const [pendingFeedbackData, setPendingFeedbackData] = useState('');
  const [pendingFeedbackNotes, setPendingFeedbackNotes] = useState('');
  const [pendingHomeworkLinks, setPendingHomeworkLinks] = useState<{ link1?: string; link2?: string; link3?: string }>({});

  const ensureSeededThenSetEmail = useCallback(async (email: string) => {
    if (!isAuthConfigured) {
      setUserEmail(email);
      return;
    }

    // 已经同步过同一用户 → 只更新邮箱，绝不重放 seeding 遮罩（否则界面会被卸载）
    if (seededUserRef.current === email) {
      setUserEmail(email);
      return;
    }

    setSeeding(true);
    try {
      await seedFromSupabase();
    } catch {
      // 云端拉取失败也不阻塞使用，继续用本地数据
    } finally {
      seededUserRef.current = email;
      setSeeding(false);
      setUserEmail(email);
    }
  }, []);

  useEffect(() => {
    if (!isAuthConfigured) {
      // 本地模式：不要求登录，直接进入应用
      setUserEmail('local');
      return;
    }
    let cancelled = false;

    supabase!.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session?.user?.email) {
        gotSessionRef.current = true;
        void ensureSeededThenSetEmail(session.user.email);
      }
    }).catch(() => {});

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      // token 后台刷新不代表用户重新登录，直接忽略，避免打断用户操作
      if (event === 'TOKEN_REFRESHED') return;

      if (event === 'SIGNED_OUT' || !session?.user?.email) {
        if (!gotSessionRef.current) return;
        seededUserRef.current = null;
        void clearLocalData().then(() => setUserEmail(null));
        return;
      }

      gotSessionRef.current = true;
      void ensureSeededThenSetEmail(session.user.email);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [ensureSeededThenSetEmail]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  }, []);

  const handleImport = useCallback((studentName?: string) => {
    if (studentName) {
      const students = getStudents();
      const match = students.find(s => s.name === studentName);
      if (match) setPendingStudentId(match.id);
    }
  }, []);

  const handleImportToFeedback = useCallback((data: ImportFeedbackData) => {
    setPendingFeedbackData(data.structuredData);
    setPendingFeedbackNotes(data.notes);
    handleImport(data.studentName);
    setActiveTab('regular-feedback');
    setTimeout(() => { setPendingFeedbackData(''); setPendingFeedbackNotes(''); }, 100);
  }, [handleImport]);

  const handleImportToHomework = useCallback((data: ImportHomeworkData) => {
    setPendingHomeworkLinks({ link1: data.link1, link2: data.link2, link3: data.link3 });
    handleImport(data.studentName);
    setActiveTab('homework');
    setTimeout(() => { setPendingHomeworkLinks({}); }, 100);
  }, [handleImport]);

  const handleImportBoth = useCallback((feedbackData: ImportFeedbackData, homeworkData: ImportHomeworkData) => {
    setPendingFeedbackData(feedbackData.structuredData);
    setPendingFeedbackNotes(feedbackData.notes);
    setPendingHomeworkLinks({ link1: homeworkData.link1, link2: homeworkData.link2, link3: homeworkData.link3 });
    handleImport(feedbackData.studentName || homeworkData.studentName);
    setActiveTab('regular-feedback');
    setTimeout(() => { setPendingFeedbackData(''); setPendingFeedbackNotes(''); setPendingHomeworkLinks({}); }, 100);
    toast('已同时填入课后反馈和正课作业');
  }, [handleImport, toast]);

  const handleImportStudentToFeedback = useCallback((studentName: string) => {
    handleImport(studentName);
    setActiveTab('regular-feedback');
  }, [handleImport]);

  const handleImportStudentToHomework = useCallback((studentName: string) => {
    handleImport(studentName);
    setActiveTab('homework');
  }, [handleImport]);

  const handleSwitchToTab = useCallback((tabId: 'regular-feedback' | 'homework') => {
    setActiveTab(tabId);
  }, []);

  const handleCopy = useCallback(async (text: string) => {
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
  }, [toast]);

  if (!userEmail) {
    return <AuthForm onLogin={() => { supabase!.auth.getSession().then(({ data: { session } }) => { if (session?.user?.email) void ensureSeededThenSetEmail(session.user.email); }).catch(() => {}); }} />;
  }

  if (seeding) {
    return (
      <div className="container">
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
          正在同步你的数据…
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <UserMenu
        email={userEmail === 'local' ? '本地模式（未启用云端）' : userEmail}
        onLogout={async () => {
          if (userEmail === 'local') return;
          try { await supabase?.auth.signOut(); } catch {}
          await clearLocalData();
          setUserEmail(null);
        }}
      />
      <ExtensionImportListener
        toast={toast}
        onImportToFeedback={handleImportStudentToFeedback}
        onImportToHomework={handleImportStudentToHomework}
        onSwitchToTab={handleSwitchToTab}
      />
      <div className="header"><h1>Tutor 课后反馈生成器</h1><div className="sub">把课堂随记变成自然、得体的家长反馈</div></div>

      <div className="tab-nav">
        {TABS.map((tab) => (
          <button key={tab.id} className={`tab-btn${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
        ))}
      </div>

      <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}><DashboardTab onNavigate={(tab) => setActiveTab(tab as TabId)} onSelectStudent={(id) => setPendingStudentId(id)} /></div>
      <div style={{ display: activeTab === 'regular-feedback' ? 'block' : 'none' }}><RegularFeedbackTab toast={toast} preSelectStudentId={pendingStudentId} preFillData={pendingFeedbackData} preFillNotes={pendingFeedbackNotes} /></div>
      <div style={{ display: activeTab === 'homework' ? 'block' : 'none' }}><HomeworkTab toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} preFillLinks={pendingHomeworkLinks.link1 ? pendingHomeworkLinks as { link1: string; link2: string; link3: string } : undefined} /></div>
      <div style={{ display: activeTab === 'meeting' ? 'block' : 'none' }}><MeetingReminder toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} /></div>
      <div style={{ display: activeTab === 'students' ? 'block' : 'none' }}><StudentProfilesTab toast={toast} onNavigate={(tab) => setActiveTab(tab as TabId)} onSelectStudent={(id) => setPendingStudentId(id)} /></div>

      <div style={{ display: activeTab === 'import' ? 'block' : 'none' }}>
        <EnglishSystemGuide toast={toast} onImportToFeedback={handleImportToFeedback} onImportToHomework={handleImportToHomework} onImportBoth={handleImportBoth} />
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
