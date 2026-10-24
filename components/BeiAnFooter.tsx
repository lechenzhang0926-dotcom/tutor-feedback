// ============================================================
// 备案号页脚
//
// 中国大陆法规要求：网站首页底部必须展示 ICP 备案号，
// 并链接到工信部备案查询网站；完成公安联网备案后同样需要展示。
//
// 用法：在服务器环境变量里设置（不配置则整个页脚不渲染）
//   ICP_BEIAN=粤ICP备2026XXXXXX号
//   GONGAN_BEIAN=粤公网安备4403XXXXXXXX号
//   GONGAN_CODE=4403XXXXXXXX  （公安备案号的数字部分，用于拼接链接）
//
// 注意：故意不用 NEXT_PUBLIC_ 前缀 —— 这两个值在服务端读取，
// 改环境变量后重启容器即可生效，不需要重新构建镜像。
// ============================================================

export default function BeiAnFooter() {
  const icp = process.env.ICP_BEIAN?.trim();
  const gongan = process.env.GONGAN_BEIAN?.trim();
  const gonganCode = process.env.GONGAN_CODE?.trim();

  if (!icp && !gongan) return null;

  return (
    <footer
      style={{
        padding: '20px 16px 28px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--muted)',
        lineHeight: 1.9,
      }}
    >
      {icp && (
        <div>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--muted)', textDecoration: 'none' }}
          >
            {icp}
          </a>
        </div>
      )}
      {gongan && (
        <div>
          <a
            href={
              gonganCode
                ? `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(gonganCode)}`
                : 'https://beian.mps.gov.cn/'
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span aria-hidden="true">🛡</span>
            {gongan}
          </a>
        </div>
      )}
    </footer>
  );
}
