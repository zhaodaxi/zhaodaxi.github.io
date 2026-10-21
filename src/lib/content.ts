import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Metrics = {
  points?: number;
  comments?: number;
  stars?: string;
  starsToday?: string;
  language?: string;
};

export type DigestItem = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  category: string;
  summary: string;
  summaryZh?: string;
  publishedAt?: string;
  author?: string;
  discussionUrl?: string;
  tags?: string[];
  metrics?: Metrics;
};

export type SourceReport = {
  id: string;
  name: string;
  category: string;
  status: 'ok' | 'empty' | 'error';
  count: number;
  message?: string;
};

export type Digest = {
  date: string;
  timezone: string;
  generatedAt: string;
  items: DigestItem[];
  reports: SourceReport[];
};

export type Category = {
  id: string;
  name: string;
  description: string;
};

export type SiteConfig = {
  timezone: string;
  site: {
    name?: string;
    tagline?: string;
    description?: string;
    updateHint?: string;
  };
  categories: Category[];
  sources: unknown[];
};

const digestDir = join(process.cwd(), 'data', 'digests');

export function loadConfig(): SiteConfig {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'sources.config.json'), 'utf8')) as SiteConfig;
  return raw;
}

export function loadDigests(): Digest[] {
  let files: string[] = [];
  try {
    files = readdirSync(digestDir);
  } catch {
    return [];
  }
  return files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => JSON.parse(readFileSync(join(digestDir, file), 'utf8')) as Digest)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function categoryName(categories: Category[], id: string) {
  return categories.find((category) => category.id === id)?.name || id;
}
