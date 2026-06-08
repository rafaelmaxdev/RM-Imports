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
  console.warn("[api/precache-batch] SUPABASE_SERVICE_ROLE_KEY not set — precache will not work");
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

    if (!response.ok) return null;

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

  // Fetch all products that need caching
  const { data: produtos, error: fetchError } = await supabase
    .from('produtos')
    .select('id, imagem_urls, imagem_urls_feminina, cached_image_urls')
    .limit(500);

  if (fetchError || !produtos) {
    res.status(500).json({ error: 'Failed to fetch products', details: fetchError?.message });
    return;
  }

  const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
  const results: { id: string; status: string; cached?: number; total?: number }[] = [];
  let totalCached = 0;
  let totalImages = 0;

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
      results.push({ id: produto.id, status: 'skipped', cached: 0, total: 0 });
      continue;
    }

    // Skip products that already have complete cached URLs for all images
    const existing = produto.cached_image_urls as { small?: string; medium?: string; large?: string }[] | null;
    if (existing && existing.length === allUrls.length && existing.every(e => e.small && e.medium && e.large)) {
      results.push({ id: produto.id, status: 'already_cached', cached: existing.length, total: existing.length });
      continue;
    }

    const cachedImageUrls: { small?: string; medium?: string; large?: string }[] = [];
    let productCached = 0;

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
          productCached++;
          totalCached++;
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
      results.push({ id: produto.id, status: 'partial', cached: productCached, total: allUrls.length * 3 });
    } else {
      results.push({ id: produto.id, status: 'cached', cached: productCached, total: allUrls.length * 3 });
    }
  }

  res.json({
    totalProducts: produtos.length,
    totalImages,
    totalCached,
    results,
  });
}