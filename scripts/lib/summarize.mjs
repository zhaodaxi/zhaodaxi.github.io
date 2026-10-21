import { cjkRatio, truncate } from './text.mjs';

const SYSTEM_PROMPT = [
  '你是科技新闻编辑。根据每条材料写一句简体中文摘要，不超过 60 个字。',
  '不要编造材料里没有的事实，不要加引号、编号或前缀。',
  '如果材料本身已经是中文，压缩成一句即可。',
  '只输出 JSON 数组，形如 [{"id":"...","summaryZh":"..."}]，不要输出其他文字。',
].join('');

export function selectForSummary(items, limit = 40) {
  return items
    .filter((item) => cjkRatio(`${item.title || ''} ${item.summary || ''}`) < 0.35)
    .filter((item) => !item.summaryZh)
    .slice(0, limit);
}

function messageText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

export function parseSummaryPayload(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('summary response has no JSON array');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('summary response is not an array');
  return parsed;
}

async function summarizeBatch(batch, { endpoint, model, apiKey }) {
  const payload = batch.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.sourceName,
    text: truncate(item.summary || item.title, 500),
  }));
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`summary API HTTP ${response.status}`);
  const data = await response.json();
  return parseSummaryPayload(messageText(data));
}

export async function applySummaries(items, env = process.env) {
  const apiKey = env.SUMMARY_API_KEY?.trim();
  if (!apiKey) {
    console.log('[qianyan] SUMMARY_API_KEY unset; skip Chinese summaries');
    return items;
  }

  const base = (env.SUMMARY_API_BASE || 'https://api.openai.com/v1').trim().replace(/\/$/, '');
  const model = (env.SUMMARY_MODEL || 'gpt-4o-mini').trim();
  const limit = Number(env.SUMMARY_LIMIT || 40);
  const selected = selectForSummary(items, Number.isFinite(limit) ? limit : 40);
  if (selected.length === 0) return items;

  console.log(`[qianyan] summarizing ${selected.length} item(s) with ${model}`);
  const byId = new Map(items.map((item) => [item.id, item]));
  const endpoint = `${base}/chat/completions`;

  for (let index = 0; index < selected.length; index += 8) {
    const batch = selected.slice(index, index + 8);
    try {
      const rows = await summarizeBatch(batch, { endpoint, model, apiKey });
      for (const row of rows) {
        const target = byId.get(row?.id);
        const summary = truncate(String(row?.summaryZh || '').trim(), 80);
        if (target && summary) target.summaryZh = summary;
      }
    } catch (error) {
      console.error(`[qianyan] summary batch skipped: ${error.message}`);
    }
  }

  return items;
}
