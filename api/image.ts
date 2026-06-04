import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

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
      .select('imagem_urls')
      .limit(500);

    const urls = new Set<string>();
    if (data) {
      for (const row of data) {
        const arr = row.imagem_urls;
        if (Array.isArray(arr)) {
          for (const u of arr) {
            // Store normalized URLs so size variants (small/medium/large) all match
            if (typeof u === 'string' && u) urls.add(normalizeYupooUrl(u));
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

  // ── Step 1: Check if image is already cached in Supabase Storage ──
  // If cached, we skip the expensive isAllowedImage() check — the URL was
  // already validated when it was first cached. This eliminates a DB query
  // for the vast majority of requests.
  try {
    const { data, error } = await supabase
      .from('image_cache')
      .select('storage_key, content_type')
      .eq('url_hash', storageKey)
      .single();

    if (data && !error) {
      // Serve the image directly from Supabase Storage (NOT a redirect).
      // This allows Vercel's CDN to cache the actual image bytes,
      // eliminating Supabase bandwidth on subsequent requests.
      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_key);
      const publicUrl = publicUrlData.publicUrl;

      try {
        const imgResponse = await fetchWithTimeout(publicUrl, 10000);
        if (imgResponse.ok) {
          const contentType = data.content_type || imgResponse.headers.get('content-type') || 'image/jpeg';

          res.setHeader('Content-Type', contentType);
          for (const [key, value] of Object.entries(CDN_HEADERS)) {
            res.setHeader(key, value);
          }

          // Stream the image instead of buffering — reduces memory and TTFB
          const buffer = await imgResponse.arrayBuffer();
          res.send(Buffer.from(buffer));
          return;
        }
      } catch {
        // If fetching from storage fails, fall through to fetch from Yupoo
      }
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

    // 4. Cache in Supabase Storage (fire-and-forget)
    const uploadPromise = supabase.storage
      .from(BUCKET)
      .upload(storageKey, Buffer.from(buffer), {
        contentType,
        upsert: true,
      })
      .then(({ error: uploadError }) => {
        if (!uploadError) {
          supabase
            .from('image_cache')
            .upsert({ url_hash: storageKey, storage_key: storageKey, content_type: contentType }, { onConflict: 'url_hash' })
            .then(() => {}, () => {});
        }
      })
      .catch(() => {});

    // Return image with aggressive CDN caching — Vercel CDN caches for 30 days
    res.setHeader('Content-Type', contentType);
    for (const [key, value] of Object.entries(CDN_HEADERS)) {
      res.setHeader(key, value);
    }
    res.send(Buffer.from(buffer));

    await uploadPromise;
  } catch {
    // Proxy error — don't cache, let browser retry on next load
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.status(504).json({ error: 'Image proxy timeout' });
  }
}