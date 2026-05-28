import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const ALLOWED_DOMAINS = [
  "photo.yupoo.com",
  "img.yupoo.com",
  "yupoo.com",
];

const BUCKET = 'images';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

function urlToKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 24);
  const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] || 'jpg';
  return `${hash}.${ext}`;
}

function isAllowedUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

export const config = {
  maxDuration: 25,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!isAllowedUrl(url)) {
    return res.status(403).json({ error: "Domain not allowed" });
  }

  const storageKey = urlToKey(url);

  // 1. Check if image is already cached in Supabase Storage
  try {
    const { data, error } = await supabase
      .from('image_cache')
      .select('storage_key')
      .eq('url_hash', storageKey)
      .single();

    if (data && !error) {
      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_key);
      // Redirect to cached image in Supabase Storage CDN
      // This response is tiny (~500 bytes) and gets cached at Vercel's edge
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.setHeader('CDN-Cache-Control', 'public, max-age=86400');
      res.redirect(302, publicUrlData.publicUrl);
      return;
    }
  } catch {
    // Cache miss or DB error — fall through to fetch
  }

  // 2. Fetch from Yupoo
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

    // 3. Cache in Supabase Storage (fire-and-forget, don't block response)
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

    // Return image directly this time (first request only)
    // Shorter CDN cache since next request should hit the 302 redirect
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('CDN-Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));

    // Ensure upload completes before Lambda terminates
    await uploadPromise;
  } catch {
    res.status(500).json({ error: 'Proxy error' });
  }
}