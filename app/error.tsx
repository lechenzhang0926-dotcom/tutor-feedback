'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Tutor 课后反馈生成器</h1>
          <p>页面加载出错，请重试</p>
        </div>
        <div className="auth-body">
          <div className="auth-error">{error.message || '未知错误'}</div>
          <div className="auth-buttons">
            <button className="btn btn-primary" onClick={reset}>
              重新加载
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
