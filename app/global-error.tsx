'use client';

import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-header">
              <h1>Tutor 课后反馈生成器</h1>
              <p>应用发生错误，请刷新页面</p>
            </div>
            <div className="auth-body">
              <div className="auth-error">{error.message || '未知错误'}</div>
              <div className="auth-buttons">
                <button className="btn btn-primary" onClick={reset}>
                  重试
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
