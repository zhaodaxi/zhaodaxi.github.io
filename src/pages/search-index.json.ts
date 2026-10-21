import type { APIRoute } from 'astro';
import { categoryName, loadConfig, loadDigests } from '../lib/content';

export const GET: APIRoute = () => {
  const config = loadConfig();
  const seen = new Set<string>();
  const index = [];

  for (const digest of loadDigests()) {
    for (const item of digest.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      index.push({
        t: item.title,
        u: item.url,
        s: item.sourceName,
        c: item.category,
        cn: categoryName(config.categories, item.category),
        d: digest.date,
        x: (item.summaryZh || item.summary || '').slice(0, 180),
        id: item.id,
      });
    }
  }

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
