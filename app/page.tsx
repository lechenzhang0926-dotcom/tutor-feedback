'use client';

import { useState, useCallback } from 'react';
import { RegularFeedbackTab } from '@/components/RegularFeedbackTab';
import { RegularHomeworkTab } from '@/components/RegularHomeworkTab';
import { MeetingReminder } from '@/components/MeetingReminder';
import { StudentProfilesTab } from '@/components/StudentProfilesTab';

type TabId = 'regular-feedback' | 'regular-homework' | 'meeting' | 'students';

const TABS: { id: TabId; label: string }[] = [
  { id: 'regular-feedback', label: '课后反馈' },
  { id: 'regular-homework', label: '正课作业' },
  { id: 'meeting', label: '会议提醒' },
  { id: 'students', label: '学生档案' },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('regular-feedback');
  const [toastMsg, setToastMsg] = useState('');

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

  return (
    <div className="container">
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

      {activeTab === 'regular-feedback' && (
        <RegularFeedbackTab toast={toast} />
      )}

      {activeTab === 'regular-homework' && (
        <RegularHomeworkTab toast={toast} onCopy={handleCopy} />
      )}

      {activeTab === 'meeting' && (
        <MeetingReminder toast={toast} onCopy={handleCopy} />
      )}

      {activeTab === 'students' && (
        <StudentProfilesTab toast={toast} />
      )}

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
