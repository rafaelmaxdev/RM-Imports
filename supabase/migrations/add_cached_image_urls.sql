-- Migration: Add cached_image_urls column to produtos table
-- This column stores pre-cached Supabase Storage URLs for product images,
-- eliminating the need for the /api/image proxy for cached images.
--
-- Structure: JSONB array of objects, one per image in imagem_urls:
-- [
--   { "small": "https://...supabase.co/.../abc.jpg", "medium": "https://...def.jpg", "large": "https://...ghi.jpg" },
--   { "small": "...", "medium": "...", "large": "..." }
-- ]
--
-- To populate existing products, use the admin "Pre-cache" button or call:
--   POST /api/precache { "produtoId": "<uuid>" }
--   POST /api/precache-batch  (caches all products at once)

ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS cached_image_urls JSONB;

COMMENT ON COLUMN produtos.cached_image_urls IS 'Pre-cached Supabase Storage URLs per image per size variant. Array of {small?, medium?, large?} objects, same order as imagem_urls.';