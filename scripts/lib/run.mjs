import { isFresh, tidySummary } from './text.mjs';

export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function reportMessage(error) {
  const message = error?.message ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export async function runSources(sources, fetchers, { concurrency = 4, now = new Date() } = {}) {
  const reports = new Array(sources.length);
  const buckets = new Array(sources.length);

  await mapPool(sources, concurrency, async (source, index) => {
    try {
      const fetcher = fetchers[source.type];
      if (!fetcher) throw new Error(`unknown source type ${source.type}`);
      const fetched = await fetcher(source, { now });
      if (!Array.isArray(fetched)) throw new Error('fetcher did not return an array');
      const fresh = fetched
        .filter((item) => item && item.title && /^https?:\/\//i.test(item.url || ''))
        .filter((item) => isFresh(item.publishedAt, source.maxAgeDays, now))
        .slice(0, source.limit || 10)
        .map((item, position) => {
          const { announceType: _announceType, ...rest } = item;
          const title = String(item.title).replace(/\s+/g, ' ').trim();
          return {
            ...rest,
            title,
            url: String(item.url).trim(),
            summary: tidySummary(title, item.summary || ''),
            position,
            sourceId: source.id,
            sourceName: source.name,
            category: source.category,
          };
        });
      buckets[index] = fresh;
      reports[index] = {
        id: source.id,
        name: source.name,
        category: source.category,
        status: fresh.length ? 'ok' : 'empty',
        count: fresh.length,
      };
      console.log(`[qianyan] ${fresh.length ? 'ok' : 'empty'} ${source.id} ${fresh.length}`);
    } catch (error) {
      buckets[index] = [];
      const message = reportMessage(error);
      reports[index] = {
        id: source.id,
        name: source.name,
        category: source.category,
        status: 'error',
        count: 0,
        message,
      };
      console.error(`[qianyan] fail ${source.id}: ${message}`);
    }
  });

  return {
    reports,
    items: buckets.flat(),
  };
}
