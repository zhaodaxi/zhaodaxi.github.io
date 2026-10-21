import { createHash } from 'node:crypto';
import { cleanUrl, normalizeUrl, titleKey, unique } from './text.mjs';

export function itemId(url) {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 16);
}

function mergeInto(existing, item) {
  if ((item.summary || '').length > (existing.summary || '').length) existing.summary = item.summary;
  if (item.summaryZh && !existing.summaryZh) existing.summaryZh = item.summaryZh;
  if (!existing.publishedAt && item.publishedAt) existing.publishedAt = item.publishedAt;
  if (!existing.author && item.author) existing.author = item.author;
  if (item.discussionUrl && !existing.discussionUrl) existing.discussionUrl = item.discussionUrl;
  const tags = unique([...(existing.tags || []), ...(item.tags || [])]);
  if (tags.length) existing.tags = tags;
  if (item.metrics) existing.metrics = { ...item.metrics, ...(existing.metrics || {}) };
}

export function dedupeItems(items) {
  const byUrl = new Map();
  const byTitle = new Map();
  const out = [];

  for (const item of items) {
    const urlKey = normalizeUrl(item.url);
    const key = titleKey(item.title);
    const existing = byUrl.get(urlKey) || (key.length >= 12 ? byTitle.get(key) : undefined);
    if (!existing) {
      const copy = {
        ...item,
        url: cleanUrl(item.url),
        id: itemId(urlKey || item.url),
        tags: item.tags ? [...item.tags] : undefined,
        metrics: item.metrics ? { ...item.metrics } : undefined,
      };
      out.push(copy);
      if (urlKey) byUrl.set(urlKey, copy);
      if (key.length >= 12) byTitle.set(key, copy);
      continue;
    }
    mergeInto(existing, item);
    if (urlKey) byUrl.set(urlKey, existing);
    if (key.length >= 12) byTitle.set(key, existing);
  }

  return out;
}
