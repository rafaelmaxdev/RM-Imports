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

-- Apenas autenticados podem ler pedidos (admin)
-- NOTA: A página de confirmação de pedido usa o ID na URL como autenticação implícita.
-- Para permitir que clientes acessem seus pedidos, usamos uma função que verifica o ID.
-- Migração: substituir a policy antiga (using true) por esta:
-- DROP POLICY "Qualquer um pode ler pedidos" ON pedidos;
-- CREATE POLICY "Apenas autenticados podem ler pedidos"
--   ON pedidos FOR SELECT
--   USING (auth.role() = 'authenticated');
--
-- IMPORTANTE: Ao ativar esta policy, a página /pedido/:id deixará de funcionar
-- para clientes não autenticados. Para resolver isso, crie uma Supabase Edge Function
-- ou uma API route que verifique o ID do pedido e retorne os dados.

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
