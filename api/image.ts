import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_DOMAINS = [
  "photo.yupoo.com",
  "img.yupoo.com",
  "yupoo.com",
];

function isAllowedUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url, redirect } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!isAllowedUrl(url)) {
    return res.status(403).json({ error: "Domain not allowed" });
  }

  // Strategy 1: Redirect 302 — browser fetches directly from Yupoo.
  // Zero Origin Transfer on Vercel. Use ?redirect=1 or default behavior.
  // Strategy 2: Proxy fallback — for cases where direct access fails (CORS/403).
  // Use ?redirect=0 to force proxy.
  const shouldRedirect = redirect !== '0';

  if (shouldRedirect) {
    // 302 redirect: browser fetches image directly from Yupoo.
    // This eliminates Origin Transfer on Vercel entirely.
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');
    res.redirect(302, url);
    return;
  }

  // Fallback: proxy the image through the serverless function.
  // Only used when direct access fails (CORS/403).
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://minkang.x.yupoo.com/',
      },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch image' });
      return;
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');

    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).json({ error: 'Proxy error' });
  }
}
