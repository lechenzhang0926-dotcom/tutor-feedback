// ============================================================
// GET /api/download-pdf?session={sessionId}&name={fileName}
// 从临时目录读取 PDF 并返回，触发浏览器下载
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

const TMP_DIR = path.join(os.tmpdir(), 'tutor-pdfs');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session');
  const fileName = searchParams.get('name');

  if (!sessionId || !fileName) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  // 防止路径遍历攻击
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return NextResponse.json({ error: '无效的文件名' }, { status: 400 });
  }

  if (
    !/^[a-f0-9-]{36}$/.test(sessionId)
  ) {
    return NextResponse.json({ error: '无效的 session' }, { status: 400 });
  }

  const filePath = path.join(TMP_DIR, sessionId, fileName);

  try {
    const buffer = await fs.readFile(filePath);
    const encodedName = encodeURIComponent(fileName);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: '文件不存在或已过期，请重新生成' }, { status: 404 });
  }
}
