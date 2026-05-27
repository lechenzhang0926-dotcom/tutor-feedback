// ============================================================
// Claude Vision API — 理解截图内容，提取结构化数据
// ============================================================

export async function extractReportFromImage(imageBase64: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('未配置 ANTHROPIC_API_KEY，请在 .env.local 中设置');
  }

  // 推断图片类型
  const mediaType = imageBase64.startsWith('data:image/png')
    ? 'image/png'
    : imageBase64.startsWith('data:image/jpeg')
      ? 'image/jpeg'
      : 'image/jpg';

  // 去掉 data:image/xxx;base64, 前缀
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `这是一张上课报告（可能是正课报告或抗遗忘复习报告）的截图。请提取截图中的全部文字信息，逐行输出。

输出格式：保持截图中的原始标签名称不变，按截图中的顺序逐行输出。例如：
学生：睿泽
日期：5月24日
词库：小学短语体验词库
今日共识记词汇：70个
正确率：100%
需复习：0个
已复习：47个
遗忘数：0个

注意：
1. 读截图中的每一个标签和数值，全部输出，不要遗漏。
2. 标签名和截图保持一致，不要改写或标准化。
3. 数值和符号原样复制。
4. 只输出提取到的内容，不要加解释或开场白。`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Claude API 请求失败 (${res.status})`
    );
  }

  const json = await res.json();
  const text = json.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error('Claude 返回为空，请重试');
  }

  return text;
}
