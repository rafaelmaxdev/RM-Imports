import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getCorsOrigin } from '../../server/lib/cors.js';
import { clientIp, consumeRateLimit } from '../../server/lib/security.js';

const ALLOWED_YUPOO_HOSTS = ['minkang.x.yupoo.com', 'photo.yupoo.com', 'img.yupoo.com'];
const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'application/json', 'text/plain']);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

function badGateway(res: VercelResponse) {
  return res.status(502).json({ error: 'Bad gateway' });
}

async function readResponseBody(response: Response): Promise<string | null> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabase) {
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(supabase, 'yupoo', ip, 30, 60)) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : (path as string || '');

  // SSRF protection: reject path traversal and dangerous patterns
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathStr);
  } catch {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) return badGateway(res);

      const contentType = response.headers.get('content-type');
      const mimeType = contentType?.split(';', 1)[0].trim().toLowerCase();
      if (!contentType || !mimeType || !ALLOWED_CONTENT_TYPES.has(mimeType)) return badGateway(res);

      const contentLength = response.headers.get('content-length');
      if (contentLength !== null) {
        const length = Number(contentLength);
        if (!Number.isFinite(length) || length < 0 || length > MAX_RESPONSE_BYTES) return badGateway(res);
      }

      const text = await readResponseBody(response);
      if (text === null) return badGateway(res);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req.headers));
      return res.status(response.status).send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    badGateway(res);
  }
}
