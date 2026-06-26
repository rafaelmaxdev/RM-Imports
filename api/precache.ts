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
  console.error("[api/precache] SUPABASE_SERVICE_ROLE_KEY not configured");
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

/** Convert a Yupoo URL to a specific size variant */
function toSizeVariant(url: string, size: 'small' | 'medium' | 'large'): string {
  return url.replace(/\/(small|medium|large)\.jpg$/i, `/${size}.jpg`);
}

/** Cache a single image URL and return the best available URL */
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
        console.warn('[api/precache] R2 upload failed, falling back to Supabase Storage:', err);
      }
    }

    if (!r2Url) {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storageKey, bufferData, {
          contentType,
          upsert: true,
          cacheControl: 'public, max-age=31536000',
        });

      if (uploadError) {
        console.error('[api/precache] Upload error:', uploadError.message);
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
    console.error('[api/precache] Fetch error:', err);
    return null;
  }
}

export const config = {
  maxDuration: 60,
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

  const { produtoId } = req.body;

  if (!produtoId || typeof produtoId !== 'string') {
    res.status(400).json({ error: 'Missing produtoId' });
    return;
  }

  // Fetch product image URLs
  const { data: produto, error: fetchError } = await supabase
    .from('produtos')
    .select('id, imagem_urls, imagem_urls_feminina, cached_image_urls')
    .eq('id', produtoId)
    .single();

  if (fetchError || !produto) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const imagemUrls: string[] = Array.isArray(produto.imagem_urls)
    ? produto.imagem_urls.filter(Boolean)
    : [];
  const femininaUrls: string[] = Array.isArray(produto.imagem_urls_feminina)
    ? produto.imagem_urls_feminina.filter(Boolean)
    : [];

  // Combine both masculine and feminine image URLs for caching
  const allUrls = [...imagemUrls, ...femininaUrls];

  if (allUrls.length === 0) {
    res.json({ cached_image_urls: [] });
    return;
  }

  // Build cached_image_urls for each image, for each size variant
  const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
  const cachedImageUrls: { small?: string; medium?: string; large?: string }[] = [];

  // Process images sequentially to avoid overwhelming Yupoo
  for (let i = 0; i < allUrls.length; i++) {
    const originalUrl = allUrls[i];
    const entry: { small?: string; medium?: string; large?: string } = {};

    for (const size of sizes) {
      const variantUrl = toSizeVariant(originalUrl, size);

      // Validate domain
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
      }
    }

    cachedImageUrls.push(entry);
  }

  // Update product with cached URLs
  const { error: updateError } = await supabase
    .from('produtos')
    .update({ cached_image_urls: cachedImageUrls })
    .eq('id', produtoId);

  if (updateError) {
    console.error('[api/precache] Update error:', updateError.message);
  }

  res.json({ cached_image_urls: cachedImageUrls });
}