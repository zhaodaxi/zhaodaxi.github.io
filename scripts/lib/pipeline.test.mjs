import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.mjs';
import { dedupeItems } from './dedupe.mjs';
import { parseFeed } from './rss.mjs';
import { runSources } from './run.mjs';
import { parseGithubTrendingHtml } from './sources.mjs';
import { applySummaries, parseSummaryPayload, selectForSummary } from './summarize.mjs';
import { cjkRatio, cleanUrl, isFresh, normalizeUrl, stripHtml, tidySummary, titleKey } from './text.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p><script>alert(1)</script>'), 'Hello world');
  assert.equal(stripHtml('A &#8211; B'), 'A – B');
});

test('normalizeUrl drops tracking params and unifies arXiv links', () => {
  assert.equal(
    cleanUrl('https://www.infoq.cn/article/abc?utm_source=rss&utm_medium=article'),
    'https://www.infoq.cn/article/abc',
  );
  assert.equal(
    normalizeUrl('http://www.Example.com/post/?utm_source=tw&id=1'),
    'https://example.com/post?id=1',
  );
  assert.equal(
    normalizeUrl('https://arxiv.org/pdf/2401.12345v2.pdf'),
    'https://arxiv.org/abs/2401.12345',
  );
  assert.equal(
    normalizeUrl('http://arxiv.org/abs/2401.12345'),
    'https://arxiv.org/abs/2401.12345',
  );
});

test('tidySummary drops boilerplate and a repeated title', () => {
  assert.equal(
    tidySummary('Title here', 'Title here The rest of the summary is long enough.'),
    'The rest of the summary is long enough.',
  );
  assert.equal(tidySummary('标题', '点击查看原文>'), '');
  assert.equal(
    tidySummary('论文', '来源：CVer 文章链接：https://mp.weixin.qq.com/s/abc 王教授团队论文被会议录用，这是正文。'),
    '王教授团队论文被会议录用，这是正文。',
  );
});

test('titleKey and cjkRatio', () => {
  assert.equal(titleKey('Hello, World!'), 'helloworld');
  assert.ok(cjkRatio('量子位发布新模型') > 0.8);
  assert.ok(cjkRatio('A new model from OpenAI') < 0.1);
});

test('isFresh respects max age and keeps undated items', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  assert.equal(isFresh('2026-10-20T00:00:00Z', 3, now), true);
  assert.equal(isFresh('2026-10-01T00:00:00Z', 3, now), false);
  assert.equal(isFresh('', 3, now), true);
  assert.equal(isFresh('2020-01-01T00:00:00Z', undefined, now), true);
});

test('parseFeed reads RSS and Atom', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item>
    <title>One &amp; Two</title>
    <link>https://example.com/one?utm_source=rss</link>
    <pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate>
    <description><![CDATA[<p>Hello <b>there</b></p>]]></description>
  </item></channel></rss>`;
  const [item] = parseFeed(rss);
  assert.equal(item.title, 'One & Two');
  assert.equal(item.url, 'https://example.com/one?utm_source=rss');
  assert.equal(item.summary, 'Hello there');
  assert.equal(item.publishedAt, '2026-10-21T00:00:00.000Z');

  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Paper\nTitle</title>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <published>2026-10-20T12:00:00Z</published>
    <summary>An abstract.</summary>
    <author><name>Ada Lovelace</name></author>
    <link rel="alternate" href="http://arxiv.org/abs/2401.00001v1"/>
  </entry></feed>`;
  const [paper] = parseFeed(atom);
  assert.equal(paper.title, 'Paper Title');
  assert.equal(paper.url, 'http://arxiv.org/abs/2401.00001v1');
  assert.equal(paper.author, 'Ada Lovelace');
});

test('dedupe merges the same url and the same title', () => {
  const items = dedupeItems([
    {
      title: 'Same Paper',
      url: 'https://arxiv.org/pdf/2401.12345v1.pdf',
      summary: 'short',
      sourceId: 'arxiv-cs-ai',
      sourceName: 'arXiv cs.AI',
      category: 'papers',
      tags: ['cs.AI'],
    },
    {
      title: 'Same Paper',
      url: 'https://arxiv.org/abs/2401.12345v2',
      summary: 'a much longer abstract about the same work',
      sourceId: 'arxiv-cs-lg',
      sourceName: 'arXiv cs.LG',
      category: 'papers',
      tags: ['cs.LG'],
      metrics: { points: 10 },
    },
    {
      title: 'A Sufficiently Long Shared Headline',
      url: 'https://example.com/blog',
      summary: 'blog',
      sourceId: 'blog',
      sourceName: 'Blog',
      category: 'research',
    },
    {
      title: 'A Sufficiently Long Shared Headline',
      url: 'https://news.ycombinator.com/item?id=1',
      summary: '',
      sourceId: 'hn',
      sourceName: 'HN',
      category: 'community',
      discussionUrl: 'https://news.ycombinator.com/item?id=1',
      metrics: { points: 40 },
    },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].summary, 'a much longer abstract about the same work');
  assert.deepEqual(items[0].tags, ['cs.AI', 'cs.LG']);
  assert.equal(items[0].url, 'https://arxiv.org/abs/2401.12345');
  assert.equal(items[0].sourceId, 'arxiv-cs-ai');
  assert.equal(items[0].metrics.points, 10);
  assert.equal(items[1].sourceId, 'blog');
  assert.equal(items[1].discussionUrl, 'https://news.ycombinator.com/item?id=1');
  assert.equal(items[1].metrics.points, 40);
  assert.ok(titleKey(items[1].title).length >= 12);
});

test('parseGithubTrendingHtml extracts repo, description, and stars', () => {
  const html = `
    <article class="Box-row">
      <h2 class="h3 lh-condensed"><a href="/owner/demo-repo">owner / demo-repo</a></h2>
      <p class="col-9 color-fg-muted my-1">A useful tool.</p>
      <span itemprop="programmingLanguage">Python</span>
      <a href="/owner/demo-repo/stargazers">1,234</a>
      <span>89 stars today</span>
    </article>`;
  const [repo] = parseGithubTrendingHtml(html);
  assert.equal(repo.title, 'owner/demo-repo');
  assert.equal(repo.url, 'https://github.com/owner/demo-repo');
  assert.equal(repo.summary, 'A useful tool.');
  assert.equal(repo.metrics.language, 'Python');
  assert.equal(repo.metrics.stars, '1,234');
  assert.equal(repo.metrics.starsToday, '89');
});

test('runSources skips a failing source and keeps the others', async () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const sources = [
    { id: 'good', name: 'Good', category: 'cn', type: 'rss', limit: 2, maxAgeDays: 3 },
    { id: 'bad', name: 'Bad', category: 'cn', type: 'rss', limit: 2 },
    { id: 'stale', name: 'Stale', category: 'cn', type: 'rss', limit: 2, maxAgeDays: 1 },
  ];
  const fetchers = {
    rss: async (source) => {
      if (source.id === 'bad') throw new Error('HTTP 503 for https://example.test/feed');
      if (source.id === 'stale') {
        return [{ title: 'Old', url: 'https://example.com/old', publishedAt: '2026-09-01T00:00:00Z', summary: '' }];
      }
      return [
        { title: 'New', url: 'https://example.com/new', publishedAt: '2026-10-20T00:00:00Z', summary: 'hi' },
        { title: 'Also', url: 'https://example.com/also', publishedAt: '2026-10-20T00:00:00Z', summary: '' },
        { title: 'Extra', url: 'https://example.com/extra', publishedAt: '2026-10-20T00:00:00Z', summary: '' },
      ];
    },
  };
  const { reports, items } = await runSources(sources, fetchers, { concurrency: 3, now });
  assert.equal(reports[0].status, 'ok');
  assert.equal(reports[0].count, 2);
  assert.equal(reports[1].status, 'error');
  assert.match(reports[1].message, /503/);
  assert.equal(reports[2].status, 'empty');
  assert.equal(items.length, 2);
  assert.equal(items[0].sourceId, 'good');
});

test('summaries are skipped without an API key', async () => {
  const items = [{ id: 'a', title: 'Hello model release', summary: 'English text', sourceName: 'X' }];
  const result = await applySummaries(items, {});
  assert.equal(result[0].summaryZh, undefined);
  assert.equal(selectForSummary([
    { id: 'a', title: 'Hello model release', summary: 'English text' },
    { id: 'b', title: '量子位发布', summary: '这是一条中文新闻' },
  ]).map((item) => item.id).join(), 'a');
  assert.deepEqual(parseSummaryPayload('```json\n[{"id":"a","summaryZh":"一句中文"}]\n```'), [
    { id: 'a', summaryZh: '一句中文' },
  ]);
});

test('shipped source config is valid', () => {
  const config = loadConfig(join(root, 'sources.config.json'));
  assert.ok(config.sources.length >= 10);
  assert.ok(config.categories.some((category) => category.id === 'cn'));
  const ids = config.sources.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length);
});
