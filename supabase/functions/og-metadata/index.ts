import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface OgMetadata {
  title: string | null;
  description: string | null;
  image_url: string | null;
}

const REDIRECT_HOSTS = new Set([
  'l.facebook.com',
  'lm.facebook.com',
  'l.messenger.com',
]);

const REDIRECT_QUERY_KEYS = ['u', 'url', 'q', 'target'];

function unwrapRedirectUrl(inputUrl: string): string {
  let current = inputUrl;

  // Handle nested redirect wrappers safely with a small hop limit.
  for (let i = 0; i < 3; i += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current;
    }

    if (!REDIRECT_HOSTS.has(parsed.hostname)) return current;

    const next = REDIRECT_QUERY_KEYS
      .map((key) => parsed.searchParams.get(key))
      .find((value): value is string => Boolean(value));

    if (!next) return current;

    try {
      current = decodeURIComponent(next);
    } catch {
      current = next;
    }
  }

  return current;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function extractOgMetadata(html: string): OgMetadata {
  const result: OgMetadata = {
    title: null,
    description: null,
    image_url: null,
  };

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) result.title = ogTitle[1].trim();

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
  if (ogDesc) result.description = ogDesc[1].trim() || null;

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImage) result.image_url = ogImage[1].trim();

  if (!result.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].trim();
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return jsonResponse({ error: 'URL is required' }, 400);
    }

    const normalizedUrl = unwrapRedirectUrl(url.trim());
    const parsed = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return jsonResponse({ error: 'Invalid URL protocol' }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        // Use a browser-like UA because many sites block unknown bots.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return jsonResponse({
        title: null,
        description: null,
        image_url: null,
        warning: `Source returned status ${response.status}`,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return jsonResponse({
        title: null,
        description: null,
        image_url: null,
        warning: 'URL did not return HTML content',
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return jsonResponse({
        title: null,
        description: null,
        image_url: null,
        warning: 'No response body',
      });
    }

    let html = '';
    let size = 0;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_SIZE) break;
      html += decoder.decode(value, { stream: true });
    }

    const metadata = extractOgMetadata(html);

    return jsonResponse(metadata);
  } catch (err) {
    console.error('og-metadata error:', err);
    return jsonResponse({
      title: null,
      description: null,
      image_url: null,
      warning: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
