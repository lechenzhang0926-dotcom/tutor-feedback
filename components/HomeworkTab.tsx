'use client';

import { useState, useEffect } from 'react';
import { RegularHomeworkTab } from '@/components/RegularHomeworkTab';
import { BatchHomeworkTab } from '@/components/BatchHomeworkTab';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
  preSelectStudentId?: string;
  preFillLinks?: { link1: string; link2: string; link3: string };
}

type Mode = 'single' | 'batch';

const MODE_KEY = 'tutor_homework_mode';

export function HomeworkTab({ toast, onCopy, preSelectStudentId, preFillLinks }: Props) {
  const [mode, setMode] = useState<Mode>('single');

  // 读取上次选择的模式
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'single' || saved === 'batch') setMode(saved);
    } catch {
      // 忽略
    }
  }, []);

  // 从其他 Tab 带入预填链接时，强制切到单学生模式
  useEffect(() => {
    if (preFillLinks && (preFillLinks.link1 || preFillLinks.link2 || preFillLinks.link3)) {
      setMode('single');
    }
  }, [preFillLinks]);

  const changeMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // 忽略
    }
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="hw-seg">
            <button className={mode === 'single' ? 'active' : ''} onClick={() => changeMode('single')}>
              单学生
            </button>
            <button className={mode === 'batch' ? 'active' : ''} onClick={() => changeMode('batch')}>
              多学生批量
            </button>
          </div>
          <span className="hint">
            {mode === 'single'
              ? '一个学生的作业1~4 + 群消息'
              : '粘贴所有学生链接，按学生顺序批量生成群消息与 PDF'}
          </span>
        </div>
      </div>

      {mode === 'single' ? (
        <RegularHomeworkTab
          toast={toast}
          onCopy={onCopy}
          preSelectStudentId={preSelectStudentId}
          preFillLinks={preFillLinks}
        />
      ) : (
        <BatchHomeworkTab toast={toast} onCopy={onCopy} />
      )}
    </>
  );
}
