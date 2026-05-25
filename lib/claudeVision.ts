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
              text: `这是一张上课报告的截图。请仔细阅读截图中的所有文字，按以下格式逐行输出提取到的信息（有就写，没有就跳过该行）：

学生：{学生名字}
日期：{日期，格式如 5月24日}
词库：{词库名称}
训练时间：{训练时间段}
学习进度：{学习进度}

今日共识记词汇：{数值}
学新词汇：{数值}
学新遗忘词汇：{数值}
学新遗忘率：{百分比}
复习词汇：{数值}
复习遗忘词汇：{数值}
复习遗忘率：{百分比}

注意：
1. 只输出提取到的字段，不要添加任何解释或开场白。
2. 数值和文字保持原样，不要改写。
3. 如果截图中某个字段不存在，就不要输出该行。
4. 截图中的"遗忘率 0%"表示全部记住，是好数据。
5. 输出完成后不要加任何结尾语。`,
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
