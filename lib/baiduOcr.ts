// ============================================================
// 百度 OCR API — 通用文字识别（高精度版）
// 每月 1000 次免费，识别速度快，中文准确
// ============================================================

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const apiKey = process.env.BAIDU_OCR_API_KEY;
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('未配置百度 OCR 密钥，请在 .env.local 中设置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY');
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

  const res = await fetch(url, { method: 'POST' });

  if (!res.ok) {
    throw new Error(`获取百度 OCR token 失败 (${res.status})`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`百度 OCR token 错误: ${json.error_description || json.error}`);
  }

  cachedToken = json.access_token as string;
  // token 有效期 30 天，提前 1 天刷新
  tokenExpiry = Date.now() + (json.expires_in - 86400) * 1000;

  return cachedToken!;
}

export async function ocrImage(imageBase64: string): Promise<string> {
  const token = await getAccessToken();

  // 去掉 data:image/xxx;base64, 前缀
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const params = new URLSearchParams();
  params.append('image', base64Data);
  params.append('language_type', 'CHN_ENG');
  params.append('detect_direction', 'false');
  params.append('paragraph', 'false');

  const res = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    throw new Error(`百度 OCR 请求失败 (${res.status})`);
  }

  const json = await res.json();

  if (json.error_code) {
    throw new Error(`百度 OCR 错误: ${json.error_msg} (code ${json.error_code})`);
  }

  const words = json.words_result as Array<{ words: string }> | undefined;
  if (!words || words.length === 0) {
    throw new Error('图片中未识别到文字');
  }

  return words.map((w) => w.words).join('\n');
}
