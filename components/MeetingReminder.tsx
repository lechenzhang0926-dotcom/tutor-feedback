'use client';

import { useState, useCallback } from 'react';
import { getStudents, getStudentById } from '@/lib/storage';

type MeetingType = 'regular' | 'anti-forgetting' | 'both';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
}

export function MeetingReminder({ toast, onCopy }: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('regular');
  const [studentName, setStudentName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [message, setMessage] = useState('');

  // --------------- 生成消息 ---------------

  const handleGenerate = useCallback(() => {
    if (!studentName.trim()) {
      toast('请输入学生名字');
      return;
    }
    if (!meetingTime.trim()) {
      toast('请查询或输入会议时间');
      return;
    }

    const typeLabel =
      meetingType === 'both'
        ? '正课+抗遗忘'
        : meetingType === 'anti-forgetting'
          ? '抗遗忘'
          : '正课';

    const timeFormatted = formatRelativeTime(meetingTime.trim());

    const msg = `⏰⏰下次${typeLabel}时间在${timeFormatted}，这是会议号#腾讯会议：${meetingId.trim()} 请${studentName.trim()}同学查收`;

    setMessage(msg);
  }, [meetingType, studentName, meetingId, meetingTime, toast]);

  // --------------- Render ---------------

  return (
    <div className="card">
      <div className="card-title">会议提醒</div>

      <div className="field">
        <label>课程类型</label>
        <div className="radio-group">
          <input
            type="radio" name="mt" id="mt_regular"
            checked={meetingType === 'regular'}
            onChange={() => setMeetingType('regular')}
          />
          <label htmlFor="mt_regular">正课</label>

          <input
            type="radio" name="mt" id="mt_anti"
            checked={meetingType === 'anti-forgetting'}
            onChange={() => setMeetingType('anti-forgetting')}
          />
          <label htmlFor="mt_anti">抗遗忘</label>

          <input
            type="radio" name="mt" id="mt_both"
            checked={meetingType === 'both'}
            onChange={() => setMeetingType('both')}
          />
          <label htmlFor="mt_both">正课+抗遗忘</label>
        </div>
      </div>

      <div className="field">
        <label>选择学生 <span className="hint">（选填，自动填入名字）</span></label>
        <select
          value={selectedStudentId}
          onChange={(e) => {
            setSelectedStudentId(e.target.value);
            const s = getStudentById(e.target.value);
            if (s) setStudentName(s.name);
          }}
          style={{ width: '100%', padding: '8px 12px', fontSize: '.88rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
        >
          <option value="">{getStudents().length === 0 ? '暂无学生，请先在学生档案中新增' : '手动输入名字'}</option>
          {getStudents().map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>学生名字</label>
        <input
          type="text"
          className="small"
          placeholder="如：周妍"
          maxLength={20}
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>腾讯会议号</label>
        <input
          type="text"
          placeholder="793-508-153"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
        />
      </div>

      <div className="field">
        <label>会议时间</label>
        <input
          type="text"
          placeholder="如：明天晚上7点45 或 5月25日 19:45"
          value={meetingTime}
          onChange={(e) => setMeetingTime(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleGenerate}>
          生成消息
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 12 }}>
          <div className="output-area">{message}</div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => onCopy(message)}>
              复制消息
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 把会议时间格式化为相对表达，如"明天的晚上7点45" */
function formatRelativeTime(input: string): string {
  // 如果已经是自然语言格式，直接返回
  if (input.includes('明天') || input.includes('后天') || input.includes('今天')) {
    return input;
  }

  // 尝试解析 "5月25日 19:45" 或 "5月25日 19:45:00" 等
  const match = input.match(/(\d{1,2})月(\d{1,2})日\D*(\d{1,2}):(\d{2})/);
  if (!match) return input;

  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const hour = parseInt(match[3]);
  const minute = parseInt(match[4]);

  const now = new Date();
  const target = new Date(now.getFullYear(), month - 1, day, hour, minute);

  // 如果目标日期已过，假定明年
  if (target < now) {
    target.setFullYear(target.getFullYear() + 1);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  let dayLabel: string;
  if (targetDay.getTime() === today.getTime()) {
    dayLabel = '今天';
  } else if (targetDay.getTime() === tomorrow.getTime()) {
    dayLabel = '明天';
  } else if (targetDay.getTime() === dayAfterTomorrow.getTime()) {
    dayLabel = '后天';
  } else {
    dayLabel = `${month}月${day}日`;
  }

  // 时间段
  let period: string;
  if (hour < 6) period = '凌晨';
  else if (hour < 9) period = '早上';
  else if (hour < 12) period = '上午';
  else if (hour < 14) period = '中午';
  else if (hour < 18) period = '下午';
  else if (hour < 21) period = '晚上';
  else period = '深夜';

  const hourStr = hour > 12 ? String(hour - 12) : String(hour);
  const minuteStr = minute > 0 ? `点${String(minute).padStart(2, '0')}` : '点';

  return `${dayLabel}的${period}${hourStr}${minuteStr}`;
}
