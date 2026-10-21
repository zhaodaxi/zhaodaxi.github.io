import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { dedupeItems } from './lib/dedupe.mjs';
import { runSources } from './lib/run.mjs';
import { fetchers } from './lib/sources.mjs';
import { applySummaries } from './lib/summarize.mjs';
import { shanghaiDate } from './lib/text.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readDateArg(argv) {
  const index = argv.indexOf('--date');
  if (index === -1) return '';
  const value = argv[index + 1] || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  return value;
}

function sortItems(items, categories, sources) {
  const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
  const sourceOrder = new Map(sources.map((source, index) => [source.id, index]));
  return [...items].sort((a, b) => {
    const categoryDelta = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
    if (categoryDelta !== 0) return categoryDelta;
    const sourceDelta = (sourceOrder.get(a.sourceId) ?? 99) - (sourceOrder.get(b.sourceId) ?? 99);
    if (sourceDelta !== 0) return sourceDelta;
    return (a.position ?? 0) - (b.position ?? 0);
  }).map(({ position, ...item }) => item);
}

export async function buildDigest({ config, now = new Date(), date } = {}) {
  const active = config.sources.filter((source) => source.enabled !== false);
  const { reports, items } = await runSources(active, fetchers, { concurrency: 5, now });
  const deduped = dedupeItems(items);
  console.log(`[qianyan] ${items.length} fetched, ${items.length - deduped.length} duplicates removed`);
  const summarized = await applySummaries(deduped);
  return {
    date: date || shanghaiDate(now, config.timezone),
    timezone: config.timezone,
    generatedAt: now.toISOString(),
    items: sortItems(summarized, config.categories, config.sources),
    reports,
  };
}

async function main() {
  const config = loadConfig(join(root, 'sources.config.json'));
  const date = readDateArg(process.argv.slice(2));
  const now = new Date();
  console.log(`[qianyan] fetching ${config.sources.length} sources for ${date || shanghaiDate(now, config.timezone)}`);
  const digest = await buildDigest({ config, now, date });
  const ok = digest.reports.some((report) => report.status === 'ok');
  if (!ok) {
    console.error('[qianyan] every source failed or was empty; digest not written');
    process.exitCode = 1;
    return;
  }

  const dir = join(root, 'data', 'digests');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${digest.date}.json`);
  await writeFile(file, `${JSON.stringify(digest, null, 2)}\n`);
  const failed = digest.reports.filter((report) => report.status === 'error').length;
  console.log(`[qianyan] wrote ${file} (${digest.items.length} items, ${failed} source failures)`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[qianyan] ${error.message}`);
    process.exitCode = 1;
  });
}
