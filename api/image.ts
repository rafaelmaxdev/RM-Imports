import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { isR2Configured, uploadToR2 } from '../server/lib/r2.js';
import { getCorsOrigin } from '../server/lib/cors.js';
import { clientIp, consumeRateLimit } from '../server/lib/security.js';
import { fetchImage, ImageFetchError } from '../server/lib/image-fetch.js';

const ALLOWED_DOMAINS = [
  "photo.yupoo.com",
  "img.yupoo.com",
  "yupoo.com",
];

const BUCKET = 'images';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

function urlToKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 24);
  const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] || 'jpg';
  return `${hash}.${ext}`;
}

/** Strip Yupoo size suffix to get a base URL for comparison.
 *  e.g. ".../small.jpg" and ".../medium.jpg" both normalize to ".../_base.jpg" */
function normalizeYupooUrl(url: string): string {
  return url.replace(/\/(small|medium|large)\.jpg$/i, '/_base.jpg');
}

/** Domain whitelist check as secondary validation */
function isAllowedDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

let allowedUrlsCache: { urls: Set<string>; timestamp: number } | null = null;
const CACHE_TTL = 1_800_000; // 30 minutes (increased from 5min to reduce DB queries)

async function isAllowedImage(url: string, db: NonNullable<typeof supabase>): Promise<boolean> {
  // First check: domain whitelist (fast, no DB call)
  if (!isAllowedDomain(url)) {
    return false;
  }

  // Second check: URL must belong to a product in our catalog
  if (!allowedUrlsCache || Date.now() - allowedUrlsCache.timestamp > CACHE_TTL) {
    const urls = new Set<string>();
    const PAGE_SIZE = 500;
    let offset = 0;

    while (true) {
      const { data } = await db
        .from('produtos')
        .select('imagem_urls, imagem_urls_feminina')
        .range(offset, offset + PAGE_SIZE - 1);

      if (!data || data.length === 0) break;

      for (const row of data) {
        for (const field of [row.imagem_urls, row.imagem_urls_feminina] as (string[] | string | null | undefined)[]) {
          const arr = field;
          if (Array.isArray(arr)) {
            for (const u of arr) {
              // Store normalized URLs so size variants (small/medium/large) all match
              if (typeof u === 'string' && u) urls.add(normalizeYupooUrl(u));
            }
          }
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    allowedUrlsCache = { urls, timestamp: Date.now() };
  }

  return allowedUrlsCache.urls.has(normalizeYupooUrl(url));
}

export const config = {
  maxDuration: 25,
};

const CDN_HEADERS = {
  'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400',
  'CDN-Cache-Control': 'public, max-age=2592000',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabase) {
    res.status(500).json({ error: "Serviço indisponível." });
    return;
  }

  const db = supabase;
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (!await consumeRateLimit(db, "image", ip, 60, 60)) {
    res.status(429).json({ error: "Muitas requisições. Aguarde um momento." }); return;
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const storageKey = urlToKey(url);

  // ── Step 1: Check if image is already cached ──
  // Try R2 first (zero egress), then fall back to Supabase Storage.
  // If cached, redirect to the public URL — no bytes proxied through API.
  try {
    const { data, error } = await db
      .from('image_cache')
      .select('storage_key, content_type, r2_url')
      .eq('url_hash', storageKey)
      .single();

    if (data && !error) {
      // Prefer R2 URL (zero egress) if available
      if (data.r2_url) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');
        res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req.headers));
        res.redirect(302, data.r2_url);
        return;
      }

      // Fall back to Supabase Storage URL
      const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(data.storage_key);
      const publicUrl = publicUrlData.publicUrl;

      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
      res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');
      res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req.headers));
      res.redirect(302, publicUrl);
      return;
    }
  } catch {
    // Cache miss or table doesn't exist yet — fall through to fetch
  }

  // ── Step 2: Validate URL belongs to a product in our database ──
  // Only needed for uncached images (first request for this URL).
  // Cached images skip this check entirely (Step 1).
  if (!(await isAllowedImage(url, db))) {
    return res.status(403).json({ error: 'URL not from catalog' });
  }

  // ── Step 3: Fetch from Yupoo ──
  try {
    const { buffer: bufferData, contentType } = await fetchImage(url, ALLOWED_DOMAINS, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://minkang.x.yupoo.com/',
    });

    // 4. Upload to R2 (zero egress) or fall back to Supabase Storage
    const uploadPromise = (async () => {
      let r2Url: string | null = null;

      if (isR2Configured()) {
        try {
          r2Url = await uploadToR2(storageKey, bufferData, contentType);
        } catch (err) {
          console.warn('[api/image] R2 upload failed, falling back to Supabase Storage:', err);
        }
      }

      if (!r2Url) {
        // Fallback: upload to Supabase Storage
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(storageKey, bufferData, {
            contentType,
            upsert: true,
            cacheControl: 'public, max-age=31536000',
          });
        if (uploadError) {
          console.error('[api/image] Supabase Storage upload failed:', uploadError.message);
          return;
        }
      }

      // Record in image_cache table
      await db
        .from('image_cache')
        .upsert({
          url_hash: storageKey,
          storage_key: storageKey,
          content_type: contentType,
          r2_url: r2Url,
        }, { onConflict: 'url_hash' });
    })();

    // Return image with aggressive CDN caching — Vercel CDN caches for 30 days
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req.headers));
    for (const [key, value] of Object.entries(CDN_HEADERS)) {
      res.setHeader(key, value);
    }
    res.send(bufferData);

    await uploadPromise;
  } catch (error) {
    // Proxy error — don't cache, let browser retry on next load
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    if (error instanceof ImageFetchError) {
      res.status(502).json({ error: 'Upstream image fetch failed' });
      return;
    }
    res.status(504).json({ error: 'Image proxy timeout' });
  }
}
