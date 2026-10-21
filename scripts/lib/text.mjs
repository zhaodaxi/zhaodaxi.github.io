const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
};

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|spm$|ref$|ref_src$|source$|gi$)/i;

export function decodeEntities(input) {
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}

export function stripHtml(input) {
  if (!input) return '';
  let text = String(input);
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<\s*br\s*\/?>/gi, '\n');
  text = text.replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(decodeEntities(text));
  text = text.replace(/\u00a0/g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{2,}/g, '\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export function truncate(input, max = 280) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function parsedUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function scrubUrl(url) {
  const arxiv = url.pathname.match(/\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i);
  if (arxiv && /(^|\.)arxiv\.org$/i.test(url.hostname)) {
    return new URL(`https://arxiv.org/abs/${arxiv[1]}`);
  }
  url.hash = '';
  if (url.protocol === 'http:') url.protocol = 'https:';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url;
}

export function cleanUrl(raw) {
  const url = parsedUrl(raw);
  if (!url) return String(raw || '').trim();
  return scrubUrl(url).toString();
}

export function normalizeUrl(raw) {
  const url = parsedUrl(raw);
  if (!url) return String(raw || '').trim();
  const cleaned = scrubUrl(url);
  cleaned.hostname = cleaned.hostname.toLowerCase().replace(/^www\./, '');
  return cleaned.toString();
}

export function tidySummary(title, summary) {
  let text = String(summary || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^来源：[^\s]+\s+文章链接：https?:\/\/\S+\s*/i, '');
  const heading = String(title || '').replace(/\s+/g, ' ').trim();
  if (heading && text.toLowerCase().startsWith(heading.toLowerCase())) {
    text = text.slice(heading.length).replace(/^[\s:：\-–—|]+/, '').trim();
  }
  if ([...text].length < 12) return '';
  if (/^(点击查看原文|read more|continue reading)\b/i.test(text)) return '';
  return text;
}

export function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .slice(0, 180);
}

export function cjkRatio(input) {
  const chars = [...String(input || '')].filter((char) => /\S/u.test(char));
  if (chars.length === 0) return 0;
  const cjk = chars.filter((char) => /\p{Script=Han}/u.test(char)).length;
  return cjk / chars.length;
}

export function shanghaiDate(now = new Date(), timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isFresh(iso, maxAgeDays, now = new Date()) {
  if (!maxAgeDays) return true;
  if (!iso) return true;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return true;
  return now.getTime() - time <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
