// ============================================================
// DeepSeek API 调用 — 仅服务端
// 从 process.env.DEEPSEEK_API_KEY 读取密钥
// 客户端代码绝不引用此文件
// ============================================================

export async function generateFeedback(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.82
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error (${res.status})`);
  }

  const json = await res.json();
  const result = json.choices?.[0]?.message?.content?.trim();

  if (!result) {
    throw new Error('API returned empty response');
  }

  return result;
}
