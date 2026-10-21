import { fetchJson, fetchText, sleep } from './http.mjs';
import { parseFeed } from './rss.mjs';
import { stripHtml, truncate } from './text.mjs';

let arxivChain = Promise.resolve();

function withArxivSlot(fn) {
  const run = arxivChain.then(fn, fn);
  arxivChain = run.then(() => sleep(1000), () => sleep(1000));
  return run;
}

function cleanArxivSummary(summary) {
  return summary.replace(/^arXiv:\S+\s+Announce Type:\s+\w+\s+Abstract:\s*/i, '').trim();
}

export async function fetchRss(source) {
  const xml = await fetchText(source.url, { timeoutMs: 25000 });
  const items = parseFeed(xml);
  if (items.length === 0) throw new Error(`no entries in feed ${source.url}`);
  return items;
}

export async function fetchArxiv(source) {
  const endpoint = source.url || `https://rss.arxiv.org/rss/${source.categoryQuery}`;
  return withArxivSlot(async () => {
    const xml = await fetchText(endpoint, { timeoutMs: 30000 });
    const items = parseFeed(xml)
      .filter((item) => !item.announceType || item.announceType === 'new')
      .map((item) => ({
        title: item.title,
        url: item.url,
        summary: truncate(cleanArxivSummary(item.summary), 360),
        publishedAt: item.publishedAt,
        author: item.author,
        tags: item.tags?.length ? item.tags : [source.categoryQuery],
      }));
    if (items.length === 0) throw new Error(`no new arXiv submissions for ${source.categoryQuery}`);
    return items;
  });
}

export async function fetchHackerNews(source) {
  const base = String(source.url || 'https://hacker-news.firebaseio.com/v0').replace(/\/$/, '');
  const limit = source.limit || 12;
  const ids = await fetchJson(`${base}/topstories.json`, { timeoutMs: 20000 });
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('Hacker News returned no story ids');

  const wanted = ids.slice(0, Math.min(limit * 3, 60));
  const stories = new Array(wanted.length);
  await mapLimit(wanted, 8, async (id, index) => {
    try {
      const item = await fetchJson(`${base}/item/${id}.json`, { timeoutMs: 15000 });
      if (!item || item.type !== 'story' || item.dead || item.deleted || !item.title) return;
      const discussionUrl = `https://news.ycombinator.com/item?id=${item.id}`;
      stories[index] = {
        title: item.title,
        url: item.url || discussionUrl,
        summary: '',
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : '',
        author: item.by || '',
        discussionUrl: item.url ? discussionUrl : '',
        metrics: {
          points: Number.isFinite(item.score) ? item.score : undefined,
          comments: Number.isFinite(item.descendants) ? item.descendants : undefined,
        },
      };
    } catch (error) {
      console.error(`[qianyan] hn item ${id}: ${error.message}`);
    }
  });

  const ranked = stories.filter(Boolean);
  if (ranked.length === 0) throw new Error('Hacker News returned no stories');
  return ranked;
}

async function mapLimit(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function parseGithubTrendingHtml(html) {
  const chunks = String(html || '').split('<article class="Box-row">').slice(1);
  const items = [];
  for (const chunk of chunks) {
    const href = chunk.match(/<h2[^>]*>[\s\S]*?href="(\/[^"/]+\/[^"/]+)"/i)?.[1];
    if (!href) continue;
    const slug = href.replace(/^\//, '');
    const description = truncate(stripHtml(chunk.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ''), 280);
    const language = stripHtml(chunk.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\//i)?.[1] || '');
    const starsToday = chunk.match(/([\d,]+)\s+stars today/i)?.[1] || '';
    const stars = chunk.match(new RegExp(`href="${href}/stargazers"[\\s\\S]*?([\\d,]+)\\s*</a>`, 'i'))?.[1] || '';
    items.push({
      title: slug,
      url: `https://github.com${href}`,
      summary: description,
      publishedAt: '',
      metrics: {
        language: language || undefined,
        stars: stars || undefined,
        starsToday: starsToday || undefined,
      },
    });
  }
  return items;
}

export async function fetchGithubTrending(source) {
  let items = [];
  let htmlError = null;
  try {
    const html = await fetchText(source.url, { timeoutMs: 25000, accept: 'text/html,application/xhtml+xml' });
    items = parseGithubTrendingHtml(html);
    if (items.length < 3) throw new Error(`parsed only ${items.length} repositories`);
  } catch (error) {
    htmlError = error;
    console.error(`[qianyan] github trending page: ${error.message}`);
  }

  if (items.length < 3 && source.fallbackUrl) {
    console.error(`[qianyan] github trending using fallback ${source.fallbackUrl}`);
    const xml = await fetchText(source.fallbackUrl, { timeoutMs: 25000 });
    items = parseFeed(xml).map((item) => ({
      ...item,
      title: item.title.replace(/\s+/g, ''),
    }));
  }

  if (items.length === 0) {
    throw htmlError || new Error('GitHub Trending returned no repositories');
  }
  return items;
}

export const fetchers = {
  rss: fetchRss,
  arxiv: fetchArxiv,
  hackernews: fetchHackerNews,
  'github-trending': fetchGithubTrending,
};
