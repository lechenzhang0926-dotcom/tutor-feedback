'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AuthForm } from '@/components/AuthForm';
import { UserMenu } from '@/components/UserMenu';
import { DashboardTab } from '@/components/DashboardTab';
import { RegularFeedbackTab } from '@/components/RegularFeedbackTab';
import { RegularHomeworkTab } from '@/components/RegularHomeworkTab';
import { MeetingReminder } from '@/components/MeetingReminder';
import { StudentProfilesTab } from '@/components/StudentProfilesTab';
import { EnglishSystemGuide, type ImportFeedbackData, type ImportHomeworkData } from '@/components/EnglishSystemGuide';
import { ExtensionImportListener } from '@/components/ExtensionImportListener';
import { getStudents } from '@/lib/storage';

type TabId = 'dashboard' | 'regular-feedback' | 'regular-homework' | 'meeting' | 'students' | 'import';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'regular-feedback', label: '课后反馈' },
  { id: 'regular-homework', label: '正课作业' },
  { id: 'meeting', label: '会议提醒' },
  { id: 'students', label: '学生档案' },
  { id: 'import', label: '本地自动化' },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [toastMsg, setToastMsg] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const gotSessionRef = useRef(false);
  const [pendingStudentId, setPendingStudentId] = useState('');
  const [pendingFeedbackData, setPendingFeedbackData] = useState('');
  const [pendingFeedbackNotes, setPendingFeedbackNotes] = useState('');
  const [pendingHomeworkLinks, setPendingHomeworkLinks] = useState<{ link1?: string; link2?: string; link3?: string }>({});

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session?.user?.email) {
        gotSessionRef.current = true;
        setUserEmail(session.user.email);
      }
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!gotSessionRef.current && !session?.user?.email) return;
      gotSessionRef.current = true;
      setUserEmail(session?.user?.email || null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

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
    setActiveTab('regular-homework');
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
    setActiveTab('regular-homework');
  }, [handleImport]);

  const handleSwitchToTab = useCallback((tabId: 'regular-feedback' | 'regular-homework') => {
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
    return <AuthForm onLogin={() => { supabase.auth.getSession().then(({ data: { session } }) => { setUserEmail(session?.user?.email || null); }).catch(() => {}); }} />;
  }

  return (
    <div className="container">
      <UserMenu email={userEmail} onLogout={() => setUserEmail(null)} />
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
      <div style={{ display: activeTab === 'regular-homework' ? 'block' : 'none' }}><RegularHomeworkTab toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} preFillLinks={pendingHomeworkLinks.link1 ? pendingHomeworkLinks as { link1: string; link2: string; link3: string } : undefined} /></div>
      <div style={{ display: activeTab === 'meeting' ? 'block' : 'none' }}><MeetingReminder toast={toast} onCopy={handleCopy} preSelectStudentId={pendingStudentId} /></div>
      <div style={{ display: activeTab === 'students' ? 'block' : 'none' }}><StudentProfilesTab toast={toast} onNavigate={(tab) => setActiveTab(tab as TabId)} onSelectStudent={(id) => setPendingStudentId(id)} /></div>

      <div style={{ display: activeTab === 'import' ? 'block' : 'none' }}>
        <EnglishSystemGuide toast={toast} onImportToFeedback={handleImportToFeedback} onImportToHomework={handleImportToHomework} onImportBoth={handleImportBoth} />
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
