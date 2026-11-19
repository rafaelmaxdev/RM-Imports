import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { buildProduct, fetchSource, parseAlbum, SOURCE } from './lib/yupoo-nba.mjs';

const selection = JSON.parse(await readFile(new URL('./nba-selection.json', import.meta.url), 'utf8'));
const rows = [];
const ids = new Set();
await mkdir('node_modules/.cache/nba', { recursive: true });
for (const entry of selection) {
  if (ids.has(entry.albumId)) throw new Error(`Álbum repetido: ${entry.albumId}`);
  ids.add(entry.albumId);
  const path = `node_modules/.cache/nba/album-${entry.albumId}.json`;
  const album = parseAlbum(await fetchSource(`/albums/${entry.albumId}?uid=1`), entry.albumId);
  await writeFile(path, JSON.stringify(album, null, 2));
  rows.push(buildProduct(entry, album));
  console.log(`${entry.albumId}: ${rows.at(-1).nome}`);
}
await writeFile('node_modules/.cache/nba/products.json', JSON.stringify(rows, null, 2));
if (!process.argv.includes('--apply')) {
  console.log(`Prévia: ${rows.length} produtos. Nenhuma gravação. Use --apply para importar a seleção revisada.`);
  process.exit(0);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configure a conexão administrativa no ambiente local.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { isR2Configured, uploadToR2 } = await import('../server/lib/r2.ts');
const { data: existing, error: readError } = await db.from('produtos').select('id,yupoo_url').eq('liga', 'NBA');
if (readError) throw new Error(`Não foi possível conferir o catálogo: ${readError.message}`);
const existingAlbums = new Set((existing ?? []).map((p) => {
  try {
    const source = new URL(p.yupoo_url);
    return source.origin === SOURCE ? source.pathname.match(/^\/albums\/(\d+)/)?.[1] : undefined;
  } catch { return undefined; }
}));
const pending = rows.filter((p) => !existingAlbums.has(p.yupoo_url.match(/\/albums\/(\d+)/)[1]) && !existing?.some((e) => e.id === p.id));
if (!pending.length) {
  console.log('Seleção já importada. Nenhum produto alterado.');
  process.exit(0);
}
// Finish caching before publishing: a blocked supplier image must not create a broken product.
for (const product of pending) {
  product.cached_image_urls = [];
  for (const image of product.imagem_urls) {
    const sizes = {};
    for (const size of ['small', 'medium', 'large']) {
      const source = new URL(size === 'large' ? 'big.jpg' : `${size}.jpg`, image).href;
      const storageKey = `nba/${createHash('sha256').update(source).digest('hex').slice(0, 24)}.jpg`;
      const response = await fetch(source, { headers: { Referer: `${SOURCE}/`, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
      const contentType = response.headers.get('content-type')?.split(';')[0];
      if (!response.ok || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(contentType)) throw new Error(`Imagem indisponível no álbum ${product.yupoo_url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 10_000_000) throw new Error('Imagem acima do limite de 10 MB');
      if (isR2Configured()) {
        sizes[size] = await uploadToR2(storageKey, bytes, contentType);
      } else {
        const { error: uploadError } = await db.storage.from('images').upload(storageKey, bytes, { upsert: true, contentType, cacheControl: '31536000' });
        if (uploadError) throw new Error(`Não foi possível guardar as fotos: ${uploadError.message}`);
        sizes[size] = db.storage.from('images').getPublicUrl(storageKey).data.publicUrl;
      }
    }
    product.cached_image_urls.push(sizes);
  }
  console.log(`Fotos guardadas: ${product.nome}`);
}
const { data, error } = await db.from('produtos').upsert(pending, { onConflict: 'id', ignoreDuplicates: true }).select('id,nome');
if (error) throw new Error(`Não foi possível importar: ${error.message}`);
console.log(`Importados: ${data.length}. Já existentes: ${rows.length - pending.length}. Preços seguem a configuração NBA da loja.`);
