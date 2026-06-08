import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { isR2Configured, uploadToR2, checkR2Exists, getR2PublicUrl } from './lib/r2';

const ALLOWED_DOMAINS = [
  "photo.yupoo.com",
  "img.yupoo.com",
  "yupoo.com",
];

const BUCKET = 'images';

// Fail loudly if service role key is missing
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.warn("[api/image] SUPABASE_SERVICE_ROLE_KEY not set — image cache will not work correctly");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey || process.env.VITE_SUPABASE_ANON_KEY!
);

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

async function isAllowedImage(url: string): Promise<boolean> {
  // First check: domain whitelist (fast, no DB call)
  if (!isAllowedDomain(url)) {
    return false;
  }

  // Second check: URL must belong to a product in our catalog
  if (!allowedUrlsCache || Date.now() - allowedUrlsCache.timestamp > CACHE_TTL) {
    const { data } = await supabase
      .from('produtos')
      .select('imagem_urls, imagem_urls_feminina')
      .limit(500);

    const urls = new Set<string>();
    if (data) {
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
  'Access-Control-Allow-Origin': '*',
};

/** Fetch with timeout to avoid hanging on slow upstreams */
async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { data, error } = await supabase
      .from('image_cache')
      .select('storage_key, content_type, r2_url')
      .eq('url_hash', storageKey)
      .single();

    if (data && !error) {
      // Prefer R2 URL (zero egress) if available
      if (data.r2_url) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.redirect(302, data.r2_url);
        return;
      }

      // Fall back to Supabase Storage URL
      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_key);
      const publicUrl = publicUrlData.publicUrl;

      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
      res.setHeader('CDN-Cache-Control', 'public, max-age=2592000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.redirect(302, publicUrl);
      return;
    }
  } catch {
    // Cache miss or table doesn't exist yet — fall through to fetch
  }

  // ── Step 2: Validate URL belongs to a product in our database ──
  // Only needed for uncached images (first request for this URL).
  // Cached images skip this check entirely (Step 1).
  if (!(await isAllowedImage(url))) {
    return res.status(403).json({ error: 'URL not from catalog' });
  }

  // ── Step 3: Fetch from Yupoo ──
  try {
    const response = await fetchWithTimeout(url, 15000, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://minkang.x.yupoo.com/',
      },
    });

    if (!response.ok) {
      // Yupoo returned an error — don't cache this, let browser retry later
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.status(502).json({ error: 'Upstream image fetch failed' });
      return;
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const bufferData = Buffer.from(buffer);

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
        const { error: uploadError } = await supabase.storage
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
      await supabase
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
    for (const [key, value] of Object.entries(CDN_HEADERS)) {
      res.setHeader(key, value);
    }
    res.send(bufferData);

    await uploadPromise;
  } catch {
    // Proxy error — don't cache, let browser retry on next load
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.status(504).json({ error: 'Image proxy timeout' });
  }
}