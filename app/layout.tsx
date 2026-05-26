import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tutor 课后反馈生成器',
  description: '把课堂随记变成自然、得体的家长反馈',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 装饰元素 */}
        <div className="bg-decorations" aria-hidden="true">
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
          <div className="bg-blob bg-blob-3" />
        </div>
        {children}
      </body>
    </html>
  );
}
