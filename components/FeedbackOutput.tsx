'use client';

interface Props {
  feedback: string;
  loading: boolean;
  error: string;
  onCopy: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  canSave: boolean;
}

export function FeedbackOutput({
  feedback,
  loading,
  error,
  onCopy,
  onRegenerate,
  onSave,
  canSave,
}: Props) {
  const showCard = loading || error || feedback;

  if (!showCard) return null;

  return (
    <div className="card">
      <div className="card-title">生成结果</div>

      {/* Loading */}
      {loading && (
        <div className="output-area">
          <span className="loading-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      )}

      {/* Error */}
      {!loading && error && <div className="output-error">{error}</div>}

      {/* Feedback */}
      {!loading && feedback && (
        <>
          <div className="output-area">{feedback}</div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={onCopy}>
              复制
            </button>
            <button className="btn btn-ghost" onClick={onRegenerate}>
              换种说法
            </button>
            {canSave && (
              <button className="btn btn-ghost" onClick={onSave}>
                保存到历史
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
