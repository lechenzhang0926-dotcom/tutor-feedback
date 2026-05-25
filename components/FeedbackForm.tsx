'use client';

import type { CourseType, Tone } from '@/lib/types';
import { COURSE_TYPE_LABEL, TONE_LABEL, MAX_NOTES_LENGTH } from '@/lib/types';

interface FormData {
  studentName: string;
  courseType: CourseType;
  notes: string;
  focus: string;
  keywords: string;
  tone: Tone;
}

interface Props {
  form: FormData;
  onChange: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading: boolean;
  disabled: boolean;
  remaining: number;
}

const courseTypes: CourseType[] = ['regular', 'review', 'trial'];
const tones: Tone[] = ['warm', 'formal', 'lively'];

export function FeedbackForm({ form, onChange, onSubmit, onClear, loading, disabled, remaining }: Props) {
  return (
    <div className="card">
      <div className="card-title">课堂信息</div>

      {/* 学生名字 */}
      <div className="field">
        <label>学生名字</label>
        <input
          type="text"
          className="small"
          placeholder="如：小明"
          maxLength={20}
          value={form.studentName}
          onChange={(e) => onChange('studentName', e.target.value)}
        />
      </div>

      {/* 课程类型 */}
      <div className="field">
        <label>课程类型</label>
        <div className="radio-group">
          {courseTypes.map((t) => (
            <span key={t}>
              <input
                type="radio"
                name="courseType"
                id={`type_${t}`}
                value={t}
                checked={form.courseType === t}
                onChange={() => onChange('courseType', t)}
              />
              <label htmlFor={`type_${t}`}>{COURSE_TYPE_LABEL[t]}</label>
            </span>
          ))}
        </div>
      </div>

      {/* 课堂情况 */}
      <div className="field">
        <label>
          课堂情况 <span className="hint">（必填，想到什么写什么）</span>
        </label>
        <textarea
          placeholder="例：今天学了很多单词，孩子大部分都认识，基础很好，不认识的词回去多复习，重点记一下 present。"
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
        <div style={{ fontSize: '.72rem', color: form.notes.length > MAX_NOTES_LENGTH ? 'var(--danger)' : 'var(--muted)', marginTop: 4 }}>
          {form.notes.length} / {MAX_NOTES_LENGTH}
          {form.notes.length > MAX_NOTES_LENGTH && '  已超出字数限制'}
        </div>
      </div>

      {/* 复习重点 */}
      <div className="field">
        <label>
          复习重点 <span className="hint">（选填）</span>
        </label>
        <input
          type="text"
          placeholder="如：present 的三种用法"
          maxLength={100}
          value={form.focus}
          onChange={(e) => onChange('focus', e.target.value)}
        />
      </div>

      {/* 重点单词 */}
      <div className="field">
        <label>
          重点单词 <span className="hint">（选填，逗号分隔）</span>
        </label>
        <input
          type="text"
          placeholder="如：present, boring, theatre"
          maxLength={100}
          value={form.keywords}
          onChange={(e) => onChange('keywords', e.target.value)}
        />
      </div>

      {/* 语气 */}
      <div className="field">
        <label>语气</label>
        <div className="radio-group">
          {tones.map((t) => (
            <span key={t}>
              <input
                type="radio"
                name="tone"
                id={`tone_${t}`}
                value={t}
                checked={form.tone === t}
                onChange={() => onChange('tone', t)}
              />
              <label htmlFor={`tone_${t}`}>{TONE_LABEL[t]}</label>
            </span>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={loading || disabled}
        >
          {loading ? '生成中' : '生成反馈'}
        </button>
        <button className="btn btn-ghost" onClick={onClear}>
          清空
        </button>
      </div>

      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 8 }}>
        提示：Ctrl+Enter 快速生成
        {remaining > 0 && remaining <= 5 && (
          <span style={{ color: 'var(--danger)', marginLeft: 8 }}>
            今日剩余 {remaining} 次
          </span>
        )}
      </div>
    </div>
  );
}
