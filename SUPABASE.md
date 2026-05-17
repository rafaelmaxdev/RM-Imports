# Configuração do Supabase

## 1. Criar projeto no Supabase

1. Acesse https://supabase.com e crie uma conta
2. Clique em **New Project**
3. Escolha um nome, senha de banco e região próxima

## 2. Pegar as credenciais

No painel do projeto, vá em **Project Settings > API** e copie:
- **Project URL** → cole no `VITE_SUPABASE_URL`
- **anon public key** → cole no `VITE_SUPABASE_ANON_KEY`

## 3. Criar o arquivo .env

Copie `.env.example` para `.env` e preencha:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

## 4. Configurar o banco de dados

1. No painel Supabase, vá em **SQL Editor**
2. Cole o conteúdo de `supabase-setup.sql` e execute
3. Isso cria a tabela `produtos` com as políticas de segurança

## 5. Habilitar Email Auth

1. Vá em **Authentication > Providers**
2. Certifique-se que **Email** está habilitado
3. (Opcional) Desabilite **Confirm email** em **Authentication > Providers > Email** se não quiser verificação

## 6. Criar sua conta admin

1. Rode `npm run dev`
2. Acesse `/admin`
3. Clique em **Criar nova conta** e registre seu email/senha

## 7. Pronto!

- A loja em `/` mostra os produtos publicamente
- `/admin` exige login para gerenciar produtos
- Os dados persistem no banco do Supabase
