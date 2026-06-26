import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { isR2Configured, uploadToR2, getR2PublicUrl } from './lib/r2.js';

const ALLOWED_DOMAINS = [
  "photo.yupoo.com",
  "img.yupoo.com",
  "yupoo.com",
];

const BUCKET = 'images';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("[api/precache-batch] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey!
);

function urlToKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 24);
  const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] || 'jpg';
  return `${hash}.${ext}`;
}

function toSizeVariant(url: string, size: 'small' | 'medium' | 'large'): string {
  return url.replace(/\/(small|medium|large)\.jpg$/i, `/${size}.jpg`);
}

async function cacheImage(url: string): Promise<{ storageKey: string; publicUrl: string } | null> {
  const storageKey = urlToKey(url);

  // Check if already cached in image_cache table
  try {
    const { data, error } = await supabase
      .from('image_cache')
      .select('storage_key, r2_url')
      .eq('url_hash', storageKey)
      .single();

    if (data && !error) {
      // Prefer R2 URL (zero egress)
      if (data.r2_url) {
        return { storageKey: data.storage_key, publicUrl: data.r2_url };
      }
      // Fall back to Supabase Storage URL
      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_key);
      return { storageKey: data.storage_key, publicUrl: publicUrlData.publicUrl };
    }
  } catch {
    // Cache miss
  }

  // Fetch from Yupoo and cache
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://minkang.x.yupoo.com/',
      },
    });

    if (!response.ok) {
      console.error(`[api/precache-batch] Yupoo fetch failed for ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const bufferData = Buffer.from(buffer);

    let r2Url: string | null = null;

    // Upload to R2 (zero egress) or fall back to Supabase Storage
    if (isR2Configured()) {
      try {
        r2Url = await uploadToR2(storageKey, bufferData, contentType);
      } catch (err) {
        console.warn('[api/precache-batch] R2 upload failed, falling back to Supabase Storage:', err);
      }
    }

    if (!r2Url) {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storageKey, bufferData, { contentType, upsert: true, cacheControl: 'public, max-age=31536000' });

      if (uploadError) {
        console.error('[api/precache-batch] Upload error:', uploadError.message);
        return null;
      }
    }

    // Record in image_cache table
    await supabase
      .from('image_cache')
      .upsert(
        { url_hash: storageKey, storage_key: storageKey, content_type: contentType, r2_url: r2Url },
        { onConflict: 'url_hash' }
      );

    const publicUrl = r2Url || supabase.storage.from(BUCKET).getPublicUrl(storageKey).data.publicUrl;
    return { storageKey, publicUrl };
  } catch (err) {
    console.error('[api/precache-batch] Fetch error:', err);
    return null;
  }
}

export const config = {
  maxDuration: 300, // 5 minutes for batch processing
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Process a limited number of products per call to avoid timeouts.
  const limit = typeof req.body?.limit === 'number' ? Math.min(req.body.limit, 20) : 10;
  const offset = typeof req.body?.offset === 'number' ? req.body.offset : 0;

  // Fetch products that need caching (paginated)
  const { data: produtos, error: fetchError } = await supabase
    .from('produtos')
    .select('id, imagem_urls, imagem_urls_feminina, cached_image_urls')
    .range(offset, offset + limit - 1);

  if (fetchError || !produtos || produtos.length === 0) {
    if (fetchError) {
      res.status(500).json({ error: 'Failed to fetch products', details: fetchError?.message });
      return;
    }
    res.json({ totalProducts: 0, processed: 0, totalCached: 0, totalImages: 0, nextOffset: null, done: true });
    return;
  }

  const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
  let totalCached = 0;
  let totalSkipped = 0;
  let totalImages = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  for (const produto of produtos) {
    const imagemUrls: string[] = Array.isArray(produto.imagem_urls)
      ? produto.imagem_urls.filter(Boolean)
      : [];
    const femininaUrls: string[] = Array.isArray(produto.imagem_urls_feminina)
      ? produto.imagem_urls_feminina.filter(Boolean)
      : [];

    // Combine both masculine and feminine image URLs for caching
    const allUrls = [...imagemUrls, ...femininaUrls];

    if (allUrls.length === 0) {
      continue;
    }

    // Skip products that already have complete cached URLs for all images
    const existing = produto.cached_image_urls as { small?: string; medium?: string; large?: string }[] | null;
    if (existing && existing.length === allUrls.length && existing.every(e => e.small && e.medium && e.large)) {
      totalSkipped++;
      continue;
    }

    const cachedImageUrls: { small?: string; medium?: string; large?: string }[] = [];

    for (let i = 0; i < allUrls.length; i++) {
      const originalUrl = allUrls[i];
      const entry: { small?: string; medium?: string; large?: string } = {};

      for (const size of sizes) {
        const variantUrl = toSizeVariant(originalUrl, size);

        try {
          const urlObj = new URL(variantUrl);
          const isAllowed = ALLOWED_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d));
          if (!isAllowed) continue;
        } catch {
          continue;
        }

        const result = await cacheImage(variantUrl);
        if (result) {
          entry[size] = result.publicUrl;
          totalCached++;
        } else {
          totalFailed++;
          if (errors.length < 5) errors.push(`Failed: ${variantUrl}`);
        }
      }

      cachedImageUrls.push(entry);
      totalImages++;
    }

    // Update product with cached URLs
    const { error: updateError } = await supabase
      .from('produtos')
      .update({ cached_image_urls: cachedImageUrls })
      .eq('id', produto.id);

    if (updateError) {
      console.error('[api/precache-batch] Update error for', produto.id, ':', updateError.message);
    }
  }

  res.json({
    totalProducts: produtos.length,
    processed: produtos.length - totalSkipped,
    skipped: totalSkipped,
    totalCached,
    totalFailed,
    totalImages,
    errors: errors.length > 0 ? errors : undefined,
    nextOffset: offset + limit,
    done: produtos.length < limit,
  });
}