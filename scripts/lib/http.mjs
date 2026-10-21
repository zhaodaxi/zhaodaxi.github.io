export const USER_AGENT = 'qianyan-digest/1.0 (+https://zhaodaxi.github.io)';

async function fetchTextOnce(url, { timeoutMs, accept, userAgent }) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': userAgent,
        accept,
      },
    });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : error?.message || String(error);
    throw new Error(`${message} (${url})`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchText(url, {
  timeoutMs = 20000,
  accept = 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
  userAgent = USER_AGENT,
  retries = 1,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchTextOnce(url, { timeoutMs, accept, userAgent });
    } catch (error) {
      lastError = error;
      const retryable = /HTTP (429|502|503)/.test(error?.message || '');
      if (!retryable || attempt === retries) break;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, {
    ...options,
    accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON from ${url}`);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
