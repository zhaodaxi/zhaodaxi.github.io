import { readFileSync } from 'node:fs';

const TYPES = new Set(['rss', 'arxiv', 'hackernews', 'github-trending']);

export function loadConfig(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read source config ${path}: ${error.message}`);
  }

  if (!raw || !Array.isArray(raw.categories) || !Array.isArray(raw.sources)) {
    throw new Error('sources.config.json must contain categories and sources arrays');
  }

  const categories = raw.categories.map((category, index) => {
    if (!category?.id || !category?.name) {
      throw new Error(`categories[${index}] needs id and name`);
    }
    return {
      id: String(category.id),
      name: String(category.name),
      description: String(category.description || ''),
    };
  });
  const categoryIds = new Set(categories.map((category) => category.id));
  const seen = new Set();

  const sources = raw.sources.map((source, index) => {
    const label = `sources[${index}]`;
    if (!source?.id || !source?.name || !source?.type || !source?.category) {
      throw new Error(`${label} needs id, name, type, and category`);
    }
    if (!TYPES.has(source.type)) {
      throw new Error(`${label} has unknown type ${source.type}`);
    }
    if (!categoryIds.has(source.category)) {
      throw new Error(`${label} category ${source.category} is not defined`);
    }
    if (seen.has(source.id)) throw new Error(`duplicate source id ${source.id}`);
    seen.add(source.id);
    if (source.type === 'rss' && !source.url) throw new Error(`${label} rss source needs url`);
    if (source.type === 'arxiv' && !source.categoryQuery) {
      throw new Error(`${label} arxiv source needs categoryQuery`);
    }
    if ((source.type === 'hackernews' || source.type === 'github-trending') && !source.url) {
      throw new Error(`${label} needs url`);
    }
    const limit = source.limit == null ? 10 : Number(source.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error(`${label} limit must be an integer from 1 to 50`);
    }
    if (source.maxAgeDays != null) {
      const age = Number(source.maxAgeDays);
      if (!Number.isInteger(age) || age < 1 || age > 365) {
        throw new Error(`${label} maxAgeDays must be an integer from 1 to 365`);
      }
    }
    return {
      ...source,
      id: String(source.id),
      name: String(source.name),
      type: String(source.type),
      category: String(source.category),
      limit,
      enabled: source.enabled !== false,
      maxAgeDays: source.maxAgeDays == null ? undefined : Number(source.maxAgeDays),
    };
  });

  return {
    timezone: raw.timezone || 'Asia/Shanghai',
    site: raw.site || {},
    categories,
    sources: sources.filter((source) => source.enabled),
  };
}
