import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tutor 课后反馈生成器',
  description: '把课堂随记变成自然、得体的家长反馈',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
