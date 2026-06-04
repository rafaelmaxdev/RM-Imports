-- Criar tabela de produtos
create table produtos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  liga text not null,
  time text not null,
  tipo text not null,
  temporada text not null,
  imagem_urls jsonb default '[]'::jsonb,
  yupoo_url text default '',
  created_at timestamptz default now()
);

-- ============================================================
-- MIGRAÇÃO: Se você já tem a coluna imagem_url (text), execute
-- CADA COMANDO SEPARADAMENTE no SQL Editor do Supabase:
--
-- Passo 1: Adicionar a nova coluna
-- ALTER TABLE produtos ADD COLUMN imagem_urls jsonb DEFAULT '[]'::jsonb;
--
-- Passo 2: Migrar os dados da coluna antiga para a nova
-- UPDATE produtos SET imagem_urls = CASE
--   WHEN imagem_url = '' OR imagem_url IS NULL THEN '[]'::jsonb
--   ELSE jsonb_build_array(imagem_url)
-- END
-- WHERE imagem_urls = '[]'::jsonb;
--
-- Passo 3: Verifique se os dados foram migrados corretamente
-- SELECT id, imagem_url, imagem_urls FROM produtos LIMIT 10;
--
-- Passo 4: Somente após confirmar, remover a coluna antiga
-- ALTER TABLE produtos DROP COLUMN imagem_url;
-- ============================================================

-- Habilitar RLS (Row Level Security)
alter table produtos enable row level security;

-- Política: qualquer um pode ler produtos (público)
create policy "Produtos são visíveis publicamente"
  on produtos for select
  using (true);

-- Política: apenas usuários autenticados podem inserir
create policy "Apenas autenticados podem inserir"
  on produtos for insert
  with check (auth.role() = 'authenticated');

-- Política: apenas autenticados podem atualizar
create policy "Apenas autenticados podem atualizar"
  on produtos for update
  using (auth.role() = 'authenticated');

-- Política: apenas autenticados podem deletar
create policy "Apenas autenticados podem deletar"
  on produtos for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- Tabela de pedidos
-- ============================================================
create table pedidos (
  id text primary key,
  data text not null,
  hora text not null,
  itens jsonb not null default '[]'::jsonb,
  total numeric not null,
  status text not null default 'pendente',
  endereco jsonb,
  created_at timestamptz default now()
);

-- Habilitar RLS
alter table pedidos enable row level security;

-- Qualquer um pode criar pedidos (cliente finaliza compra)
create policy "Qualquer um pode criar pedidos"
  on pedidos for insert
  with check (true);

-- ⚠️ SEGURANÇA: A policy atual permite que QUALQUER UM leia todos os pedidos,
-- incluindo dados pessoais (nome, endereço, telefone).
-- Para restringir, execute a migração abaixo E crie a API route /api/order.
--
-- PASSO 1: Criar a API route /api/order (já implementada em api/order.ts)
-- PASSO 2: Executar os comandos abaixo no SQL Editor do Supabase:
--
-- DROP POLICY "Qualquer um pode criar pedidos" ON pedidos;
-- DROP POLICY IF EXISTS "Qualquer um pode ler pedidos" ON pedidos;
--
-- CREATE POLICY "Apenas autenticados podem ler pedidos"
--   ON pedidos FOR SELECT
--   USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Qualquer um pode criar pedidos via API"
--   ON pedidos FOR INSERT
--   WITH CHECK (true);
--
-- IMPORTANTE: Ao ativar a policy de SELECT restritiva, a página /pedido/:id
-- deixará de funcionar para clientes não autenticados. A API route /api/order/:id
-- deve ser usada no lugar para buscar dados do pedido.

create policy "Apenas autenticados podem atualizar pedidos"
  on pedidos for update
  using (auth.role() = 'authenticated');

-- Apenas autenticados podem deletar pedidos (admin)
create policy "Apenas autenticados podem deletar pedidos"
  on pedidos for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- MIGRAÇÃO: Adicionar colunas de pagamento Mercado Pago
-- Execute CADA COMANDO SEPARADAMENTE no SQL Editor do Supabase:
-- ============================================================

-- ALTER TABLE pedidos ADD COLUMN payment_method text;
-- ALTER TABLE pedidos ADD COLUMN mp_preference_id text;
-- ALTER TABLE pedidos ADD COLUMN mp_payment_id text;

-- ============================================================
-- NOTA: O status do pedido agora segue o fluxo:
--   pendente → pago → entregue
--   pendente → cancelado
-- O status "confirmado" foi substituído por "pago".
-- Se você tinha pedidos com status "confirmado", execute:
-- UPDATE pedidos SET status = 'pago' WHERE status = 'confirmado';
-- ============================================================

-- ============================================================
-- NOTA: O fluxo de status do pedido agora é:
--   pendente → em_analise → pago → enviado_fornecedor → em_producao → a_caminho → em_estoque → em_entrega → entregue
--   pendente → cancelado
--   pago → reembolsado
-- Se você tinha pedidos com status "confirmado", execute:
-- UPDATE pedidos SET status = 'pago' WHERE status = 'confirmado';
-- ============================================================

-- ============================================================
-- MIGRAÇÃO: Adicionar coluna admin_order para pedidos do admin
-- Execute no SQL Editor do Supabase:
-- ============================================================

-- ALTER TABLE pedidos ADD COLUMN admin_order boolean DEFAULT false;

-- ============================================================
-- NOTA: Pedidos marcados como admin_order = true são pedidos
-- pessoais do admin e não contam como lucro nos cálculos
-- financeiros dos pacotes.
-- ============================================================

-- ============================================================
-- MIGRAÇÃO: Adicionar coluna peca na tabela produtos
-- Execute no SQL Editor do Supabase:
-- ============================================================

-- ALTER TABLE produtos ADD COLUMN peca text DEFAULT 'camisa';
-- UPDATE produtos SET peca = 'camisa' WHERE peca IS NULL;

-- ============================================================
-- NOTA: peca pode ser 'camisa' ou 'regata'. O default é 'camisa'.
-- O comando UPDATE acima marca todos os produtos existentes como camisa.
-- ============================================================

-- ============================================================
-- Tabela de configuração da loja
-- ============================================================
create table if not exists loja_config (
  key text primary key,
  value jsonb not null
);

-- Habilitar RLS
alter table loja_config enable row level security;

-- Qualquer um pode ler a configuração (preços, promoções)
create policy "Qualquer um pode ler config"
  on loja_config for select
  using (true);

-- Apenas autenticados podem alterar a configuração
create policy "Apenas autenticados podem alterar config"
  on loja_config for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Tabela de pacotes
-- ============================================================
create table if not exists pacotes (
  id uuid default gen_random_uuid() primary key,
  status text not null default 'pago',
  custo numeric,
  frete numeric,
  taxa_importacao numeric,
  pedido_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Habilitar RLS
alter table pacotes enable row level security;

-- Apenas autenticados podem gerenciar pacotes (admin)
create policy "Apenas autenticados podem ler pacotes"
  on pacotes for select
  using (auth.role() = 'authenticated');

create policy "Apenas autenticados podem inserir pacotes"
  on pacotes for insert
  with check (auth.role() = 'authenticated');

create policy "Apenas autenticados podem atualizar pacotes"
  on pacotes for update
  using (auth.role() = 'authenticated');

create policy "Apenas autenticados podem deletar pacotes"
  on pacotes for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- SEGURANÇA: Correções e triggers
-- Execute CADA COMANDO SEPARADAMENTE no SQL Editor do Supabase.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. FIX PEDIDOS RLS — PII leak
-- Atualmente QUALQUER UM pode ler todos os pedidos (incluindo PII).
-- Substituir por: apenas autenticados podem ler.
-- A API route /api/order/:id já existe para acesso não autenticado.
-- ────────────────────────────────────────────────────────────

-- Remover a policy antiga (se existir) que permite leitura pública
DROP POLICY IF EXISTS "Qualquer um pode ler pedidos" ON pedidos;

-- Criar policy restritiva: apenas autenticados podem ler pedidos
CREATE POLICY "Apenas autenticados podem ler pedidos"
  ON pedidos FOR SELECT
  USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 2. PEDIDO STATUS TRANSITION TRIGGER
-- Garante que transições de status sigam o fluxo permitido.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_pedido_status_transition()
RETURNS trigger AS $$
DECLARE
  allowed_transitions text[];
BEGIN
  allowed_transitions := ARRAY[
    'pendente→pago',
    'pendente→cancelado',
    'pago→reembolsado',
    'pago→cancelado',
    'pago→enviado_fornecedor',
    'enviado_fornecedor→em_producao',
    'em_producao→a_caminho',
    'a_caminho→em_estoque',
    'em_estoque→em_entrega',
    'em_entrega→entregue'
  ];

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pendente', 'pago') THEN
      RAISE EXCEPTION 'Invalid initial status: %. Must be "pendente" or "pago".', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    IF NOT (OLD.status || '→' || NEW.status = ANY(allowed_transitions)) THEN
      RAISE EXCEPTION 'Invalid status transition: % → %. Allowed transitions: %',
        OLD.status, NEW.status, array_to_string(allowed_transitions, ', ');
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_status_transition ON pedidos;
CREATE TRIGGER trg_pedido_status_transition
  BEFORE INSERT OR UPDATE OF status ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION check_pedido_status_transition();

-- ────────────────────────────────────────────────────────────
-- 3. PACOTE SHIRT LIMIT TRIGGER
-- Limita cada pacote a no máximo 8 camisas (soma de itens dos pedidos).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_pacote_shirt_limit()
RETURNS trigger AS $$
DECLARE
  total_shirts int;
  pedido_id text;
  pedido_itens jsonb;
BEGIN
  -- On INSERT, check total shirts in the new pacote
  IF TG_OP = 'INSERT' THEN
    total_shirts := 0;
    FOR pedido_id IN SELECT jsonb_array_elements_text(NEW.pedido_ids)
    LOOP
      SELECT itens INTO pedido_itens FROM pedidos WHERE id = pedido_id;
      IF pedido_itens IS NOT NULL THEN
        total_shirts := total_shirts + jsonb_array_length(pedido_itens);
      END IF;
    END LOOP;
    IF total_shirts > 8 THEN
      RAISE EXCEPTION 'Pacote excede o limite de 8 camisas (total: %).', total_shirts;
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE, check total shirts if pedido_ids changed
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pedido_ids IS DISTINCT FROM OLD.pedido_ids THEN
      total_shirts := 0;
      FOR pedido_id IN SELECT jsonb_array_elements_text(NEW.pedido_ids)
      LOOP
        SELECT itens INTO pedido_itens FROM pedidos WHERE id = pedido_id;
        IF pedido_itens IS NOT NULL THEN
          total_shirts := total_shirts + jsonb_array_length(pedido_itens);
        END IF;
      END LOOP;
      IF total_shirts > 8 THEN
        RAISE EXCEPTION 'Pacote excede o limite de 8 camisas (total: %).', total_shirts;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pacote_shirt_limit ON pacotes;
CREATE TRIGGER trg_pacote_shirt_limit
  BEFORE INSERT OR UPDATE OF pedido_ids ON pacotes
  FOR EACH ROW
  EXECUTE FUNCTION check_pacote_shirt_limit();

-- ────────────────────────────────────────────────────────────
-- 4. CHECK CONSTRAINTS FOR FINANCEIRO
-- Valida que custo, frete e taxa_importacao são >= 0 quando definidos.
-- ────────────────────────────────────────────────────────────

ALTER TABLE pacotes ADD CONSTRAINT chk_custo_non_negative
  CHECK (custo IS NULL OR custo >= 0);

ALTER TABLE pacotes ADD CONSTRAINT chk_frete_non_negative
  CHECK (frete IS NULL OR frete >= 0);

ALTER TABLE pacotes ADD CONSTRAINT chk_taxa_importacao_non_negative
  CHECK (taxa_importacao IS NULL OR taxa_importacao >= 0);

-- ────────────────────────────────────────────────────────────
-- 5. DELETE PEDIDO STATUS GUARD RLS
-- Impede exclusão de pedidos que não estejam em status "cancelado".
-- Apenas pedidos cancelados podem ser excluídos.
-- ────────────────────────────────────────────────────────────

-- Remover a policy antiga que permite qualquer autenticado deletar
DROP POLICY IF EXISTS "Apenas autenticados podem deletar pedidos" ON pedidos;

-- Criar policy que só permite deletar pedidos cancelados
CREATE POLICY "Apenas autenticados podem deletar pedidos cancelados"
  ON pedidos FOR DELETE
  USING (auth.role() = 'authenticated' AND status = 'cancelado');

-- ────────────────────────────────────────────────────────────
-- 6. PACOTE REMOVE-FROM-DELIVERED TRIGGER
-- Impede remover pedidos de pacotes já entregues.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_pacote_not_delivered()
RETURNS trigger AS $$
BEGIN
  -- On UPDATE, if status is 'entregue', prevent changes to pedido_ids
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'entregue' AND NEW.pedido_ids IS DISTINCT FROM OLD.pedido_ids THEN
      RAISE EXCEPTION 'Não é possível modificar pedidos de um pacote já entregue.';
    END IF;
  END IF;

  -- On DELETE, prevent deleting a delivered pacote
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'entregue' THEN
      RAISE EXCEPTION 'Não é possível excluir um pacote já entregue.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pacote_not_delivered ON pacotes;
CREATE TRIGGER trg_pacote_not_delivered
  BEFORE UPDATE OF pedido_ids ON pacotes
  FOR EACH ROW
  EXECUTE FUNCTION check_pacote_not_delivered();

-- ────────────────────────────────────────────────────────────
-- 7. PEDIDOS VALID STATUS CHECK CONSTRAINT
-- Garante que o status do pedido seja um valor válido.
-- ────────────────────────────────────────────────────────────

ALTER TABLE pedidos ADD CONSTRAINT chk_pedido_status_valid
  CHECK (status IN (
    'pendente',
    'pago',
    'enviado_fornecedor',
    'em_producao',
    'a_caminho',
    'em_estoque',
    'em_entrega',
    'entregue',
    'cancelado',
    'reembolsado'
  ));

-- ────────────────────────────────────────────────────────────
-- 8. PACOTES VALID STATUS CHECK CONSTRAINT
-- Garante que o status do pacote seja um valor válido.
-- ────────────────────────────────────────────────────────────

ALTER TABLE pacotes ADD CONSTRAINT chk_pacote_status_valid
  CHECK (status IN (
    'pago',
    'enviado_fornecedor',
    'em_producao',
    'a_caminho',
    'em_estoque',
    'em_entrega',
    'entregue'
  ));

-- ────────────────────────────────────────────────────────────
-- 9. PEDIDOS TOTAL NON-NEGATIVE CHECK CONSTRAINT
-- Garante que o total do pedido seja >= 0.
-- ────────────────────────────────────────────────────────────

ALTER TABLE pedidos ADD CONSTRAINT chk_pedido_total_non_negative
  CHECK (total >= 0);

-- ────────────────────────────────────────────────────────────
-- 10. MIGRAÇÃO: Adicionar coluna pronta_entrega na tabela pedidos
-- Marca pedidos que, ao serem entregues, terão seus itens adicionados
-- ao estoque de pronta entrega.
-- ────────────────────────────────────────────────────────────

-- ALTER TABLE pedidos ADD COLUMN pronta_entrega boolean DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- 11. Tabela de estoque de pronta entrega
-- Registra camisas disponíveis para entrega imediata.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estoque_pronta_entrega (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tamanho text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(produto_id, tamanho)
);

ALTER TABLE estoque_pronta_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ler estoque"
  ON estoque_pronta_entrega FOR SELECT
  USING (true);

CREATE POLICY "Apenas autenticados podem gerenciar estoque"
  ON estoque_pronta_entrega FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 12. MIGRAÇÃO: Adicionar coluna ordem_destaque na tabela produtos
-- Execute no SQL Editor do Supabase:
-- ────────────────────────────────────────────────────────────

-- ALTER TABLE produtos ADD COLUMN ordem_destaque integer DEFAULT NULL;
-- COMMENT ON COLUMN produtos.ordem_destaque IS 'Ordem manual dos produtos em destaque. NULL para não-destaques.';

-- ────────────────────────────────────────────────────────────
-- 11. IMAGE CACHE + STORAGE BUCKET
-- Cache de imagens no Supabase Storage para reduzir Origin Transfer
-- da Vercel. Execute CADA COMANDO SEPARADAMENTE no SQL Editor.
-- ────────────────────────────────────────────────────────────

-- Tabela de metadados do cache de imagens
CREATE TABLE IF NOT EXISTS image_cache (
  url_hash TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE image_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full acesso image_cache"
  ON image_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Bucket público para imagens (criar via Dashboard → Storage → New Bucket)
-- Nome: images
-- Public: YES
--
-- OU execute via SQL (pode falhar se já existir):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT DO NOTHING;

-- Policy: leitura pública (qualquer um pode ler imagens do bucket)
CREATE POLICY "Public read images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- Policy: service role pode inserir/atualizar
CREATE POLICY "Service role upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images' AND auth.role() = 'service_role');

CREATE POLICY "Service role update images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'images' AND auth.role() = 'service_role');
