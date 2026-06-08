import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isR2Configured, uploadToR2 } from './lib/r2.js';
import { createClient } from '@supabase/supabase-js';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  serviceRoleKey || process.env.VITE_SUPABASE_ANON_KEY!
);

export const config = { maxDuration: 25 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const diagnostics: Record<string, unknown> = {};

  // 1. Check env vars
  diagnostics.env = {
    R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '(not set)',
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '(not set)',
    SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  diagnostics.r2Configured = isR2Configured();

  // 2. Test R2 upload
  if (isR2Configured()) {
    try {
      const testKey = `_diagnostic_test_${Date.now()}.txt`;
      const testContent = Buffer.from('R2 diagnostic test - ' + new Date().toISOString());
      const r2Url = await uploadToR2(testKey, testContent, 'text/plain');
      diagnostics.r2Upload = { ok: true, url: r2Url };
    } catch (err) {
      diagnostics.r2Upload = { ok: false, error: String(err) };
    }
  } else {
    diagnostics.r2Upload = { ok: false, error: 'R2 not configured' };
  }

  // 3. Test Yupoo fetch
  try {
    const testUrl = 'https://photo.yupoo.com/1/small.jpg';
    const response = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://minkang.x.yupoo.com/',
      },
    });
    diagnostics.yupooFetch = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    };
  } catch (err) {
    diagnostics.yupooFetch = { ok: false, error: String(err) };
  }

  // 4. Test Supabase Storage upload
  try {
    const testKey = `_diagnostic_test_${Date.now()}.txt`;
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(testKey, Buffer.from('supabase diagnostic test'), {
        contentType: 'text/plain',
        upsert: true,
        cacheControl: 'public, max-age=31536000',
      });
    diagnostics.supabaseUpload = uploadError ? { ok: false, error: uploadError.message } : { ok: true };

    // Clean up test file
    if (!uploadError) {
      await supabase.storage.from('images').remove([testKey]);
    }
  } catch (err) {
    diagnostics.supabaseUpload = { ok: false, error: String(err) };
  }

  // 5. Test image_cache table
  try {
    const { data, error } = await supabase
      .from('image_cache')
      .select('url_hash, storage_key, r2_url')
      .limit(3);
    diagnostics.imageCache = error ? { ok: false, error: error.message } : { ok: true, count: data?.length || 0, sample: data?.[0] || null };
  } catch (err) {
    diagnostics.imageCache = { ok: false, error: String(err) };
  }

  // 6. Test products table
  try {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, imagem_urls')
      .limit(1);
    if (error) {
      diagnostics.products = { ok: false, error: error.message };
    } else {
      const produto = data?.[0];
      const urls: string[] = Array.isArray(produto?.imagem_urls) ? produto.imagem_urls : [];
      diagnostics.products = { ok: true, sampleId: produto?.id, imageCount: urls.length, sampleUrl: urls[0] || null };
    }
  } catch (err) {
    diagnostics.products = { ok: false, error: String(err) };
  }

  res.json(diagnostics);
}