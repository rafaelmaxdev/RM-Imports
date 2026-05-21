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

-- Qualquer um pode ler pedidos (IDs são aleatórios, confirmação por URL)
create policy "Qualquer um pode ler pedidos"
  on pedidos for select
  using (true);

-- Apenas autenticados podem atualizar status (admin)
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
