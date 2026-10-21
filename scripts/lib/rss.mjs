import { XMLParser } from 'fast-xml-parser';
import { stripHtml, truncate } from './text.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  processEntities: true,
});

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    if (typeof node['#text'] === 'string' || typeof node['#text'] === 'number') return String(node['#text']);
    if (typeof node['#cdata'] === 'string') return node['#cdata'];
  }
  return '';
}

function field(entry, names) {
  for (const name of names) {
    if (entry && entry[name] != null) return entry[name];
  }
  return undefined;
}

function pickLink(entry) {
  const links = asArray(entry.link);
  let alternate = '';
  let any = '';
  for (const link of links) {
    if (typeof link === 'string' && /^https?:\/\//i.test(link)) return link.trim();
    if (link && typeof link === 'object') {
      const href = String(link['@_href'] || '');
      if (!/^https?:\/\//i.test(href)) continue;
      const rel = link['@_rel'] || 'alternate';
      if (rel === 'alternate' && !alternate) alternate = href;
      if (!any) any = href;
    }
  }
  if (alternate) return alternate;
  if (any) return any;
  const id = textOf(entry.id).trim();
  return /^https?:\/\//i.test(id) ? id : '';
}

function parseDate(value) {
  const raw = textOf(value).trim();
  if (!raw) return '';
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return '';
  return new Date(time).toISOString();
}

function shortenAuthors(name) {
  const text = name.replace(/\s+/g, ' ').trim();
  if (text.length <= 140) return text;
  return `${text.slice(0, 137).trimEnd()}…`;
}

function authorOf(entry) {
  const direct = field(entry, ['creator', 'dc:creator', 'author']);
  if (typeof direct === 'string') return shortenAuthors(direct);
  const names = asArray(direct)
    .map((author) => {
      if (typeof author === 'string') return author;
      return textOf(author?.name || author);
    })
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= 3) return shortenAuthors(names.join(', '));
  return shortenAuthors(`${names.slice(0, 3).join(', ')} +${names.length - 3}`);
}

function normalizeEntry(entry) {
  const title = stripHtml(textOf(field(entry, ['title']))).replace(/\s+/g, ' ').trim();
  const url = pickLink(entry);
  const summarySource = field(entry, [
    'content:encoded',
    'encoded',
    'description',
    'summary',
    'content',
  ]);
  const publishedAt = parseDate(field(entry, ['pubDate', 'published', 'updated', 'dc:date', 'date']));
  const announceType = textOf(field(entry, ['arxiv:announce_type', 'announce_type'])).trim().toLowerCase();
  const categories = asArray(entry.category)
    .map((category) => textOf(category).replace(/\s+/g, ' ').trim())
    .filter((category) => /^[a-z-]+\.[A-Za-z]{2,}$/.test(category));
  return {
    title,
    url,
    summary: truncate(stripHtml(textOf(summarySource)), 500),
    publishedAt,
    author: authorOf(entry),
    tags: categories.length ? categories : undefined,
    announceType,
  };
}

export function parseFeed(xml) {
  const doc = parser.parse(String(xml || ''));
  const nodes = asArray(doc?.rss?.channel?.item ?? doc?.feed?.entry);
  return nodes
    .map(normalizeEntry)
    .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}
