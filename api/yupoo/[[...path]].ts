import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_YUPOO_HOSTS = ['minkang.x.yupoo.com', 'photo.yupoo.com', 'img.yupoo.com'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : (path as string || '');

  // SSRF protection: reject path traversal and dangerous patterns
  const decoded = decodeURIComponent(pathStr);
  if (decoded.includes('..') || decoded.includes('://') || decoded.startsWith('/')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const targetUrl = `https://minkang.x.yupoo.com/${decoded}`;

  // Validate the final URL hostname
  try {
    const urlObj = new URL(targetUrl);
    if (!ALLOWED_YUPOO_HOSTS.includes(urlObj.hostname)) {
      res.status(403).json({ error: 'Domain not allowed' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error' });
  }
}