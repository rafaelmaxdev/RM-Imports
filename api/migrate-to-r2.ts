import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { isR2Configured, uploadToR2, getR2PublicUrl } from './lib/r2.js';

/**
 * Migrate existing images from Supabase Storage to Cloudflare R2.
 *
 * This endpoint:
 * 1. Lists all entries in the `image_cache` table that don't have an `r2_url` yet
 * 2. Downloads each image from Supabase Storage
 * 3. Uploads it to R2
 * 4. Updates the `image_cache` row with the R2 URL
 *
 * Call this ONCE after setting up R2 to migrate existing images.
 * After migration, all new uploads go directly to R2.
 *
 * POST /api/migrate-to-r2
 * Optional body: { "limit": 50 } — max images to migrate per call (default: 100)
 */
const BUCKET = 'images';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("[api/migrate-to-r2] SUPABASE_SERVICE_ROLE_KEY not configured");
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey!
);

export const config = {
  maxDuration: 300, // 5 minutes for migration
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
    if (authError || !user || user.app_metadata?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  } else {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isR2Configured()) {
    res.status(400).json({ error: 'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PUBLIC_URL env vars.' });
    return;
  }

  const limit = typeof req.body?.limit === 'number' ? Math.min(req.body.limit, 500) : 100;

  // Fetch image_cache entries that don't have an R2 URL yet
  const { data: entries, error: fetchError } = await supabase
    .from('image_cache')
    .select('url_hash, storage_key, content_type')
    .is('r2_url', null)
    .limit(limit);

  if (fetchError || !entries) {
    res.status(500).json({ error: 'Failed to fetch image_cache entries', details: fetchError?.message });
    return;
  }

  if (entries.length === 0) {
    res.json({ migrated: 0, failed: 0, total: 0, message: 'No images to migrate — all entries already have R2 URLs.' });
    return;
  }

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(entry.storage_key);

      if (downloadError || !fileData) {
        errors.push(`Download failed for ${entry.storage_key}: ${downloadError?.message}`);
        failed++;
        continue;
      }

      // Convert Blob to Buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to R2
      const r2Url = await uploadToR2(entry.storage_key, buffer, entry.content_type || 'image/jpeg');

      // Update image_cache with R2 URL
      const { error: updateError } = await supabase
        .from('image_cache')
        .update({ r2_url: r2Url })
        .eq('url_hash', entry.url_hash);

      if (updateError) {
        errors.push(`DB update failed for ${entry.url_hash}: ${updateError.message}`);
        failed++;
        continue;
      }

      migrated++;
    } catch (err) {
      errors.push(`Migration failed for ${entry.storage_key}: ${err}`);
      failed++;
    }
  }

  // Count remaining entries without R2 URL
  const { count: remaining } = await supabase
    .from('image_cache')
    .select('*', { count: 'exact', head: true })
    .is('r2_url', null);

  res.json({
    migrated,
    failed,
    total: entries.length,
    remaining: remaining ?? 0,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}