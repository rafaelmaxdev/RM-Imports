-- Criar tabela de produtos
create table produtos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  liga text not null,
  time text not null,
  tipo text not null,
  temporada text not null,
  imagem_url text default '',
  yupoo_url text default '',
  created_at timestamptz default now()
);

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
