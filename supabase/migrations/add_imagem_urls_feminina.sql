-- Migration: Add imagem_urls_feminina column to produtos table
-- This column stores image URLs for the feminine version of a product.
-- When a product has feminino=true, these images are shown when the customer
-- selects "Feminino" in the cart modal. If empty, the masculine images are used.
--
-- Structure: JSONB array of URL strings, same format as imagem_urls:
-- ["https://...", "https://..."]

ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS imagem_urls_feminina JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN produtos.imagem_urls_feminina IS 'Image URLs for the feminine version of this product. Shown when customer selects Feminino. Falls back to imagem_urls if empty.';