# Seleção NBA

O cadastro manual usa o mesmo padrão dos produtos importados:

`Regata TIME TEMPORADA EDIÇÃO — JOGADOR #NÚMERO`

O jogador e o número já vêm na peça das fotos; não são uma personalização adicional. Cada jogador tem seu próprio produto e álbum. A página oferece links entre jogadores apenas quando time, temporada, edição e cor são iguais. O nome livre continua disponível.

No catálogo, traduza Statement como **Alternativa**.

## Padrão de fotos aprovado

- **Capas preferidas (tipos 1, 3 e 4):** cabide com fundo neutro, peça deitada sozinha ou peça vestida em manequim. Os três estilos estão aprovados, sem prioridade definida entre eles.
- **Capa alternativa (tipo 2):** cabide com ambiente ao fundo, com prioridade menor que os tipos 1, 3 e 4.
- **Ordem da galeria:** frente da regata, costas e, só depois, detalhes úteis de tecido, estampa e acabamento (tipo 5).
- **Reprovado em qualquer posição (tipo 6):** várias peças juntas na mesma foto. Também excluir bonequinhos, acessórios sobre a peça, montagens e imagens de outros jogadores.
- Não importar o álbum inteiro. Frente e costas bastam quando os detalhes não acrescentam informação. Usar fotos originais do mesmo modelo, cor, jogador e número.

Esses critérios são aplicados na revisão visual da seleção; o importador preserva somente as fotos aprovadas e a sua ordem.

O link da loja Yupoo saiu do formulário. A origem dos importados continua no banco para identificar o álbum e evitar duplicações; editar um produto preserva essa origem.

## Atualizar a seleção

1. `node scripts/discover-nba.mjs`: lê as categorias das 30 franquias e a coleção retrô. Salva a descoberta em `node_modules/.cache/nba/discovery.json`.
2. Revise os modelos em `scripts/nba-selection.json`. Cada entrada fixa o título da fonte, temporada, edição, jogador, número e as URLs das fotos escolhidas; a primeira é a capa. Confira frente e costas antes de aprovar uma entrada. A ordem se mantém mesmo se o fornecedor reorganizar o álbum; imagens removidas interrompem a importação para revisão.
3. `node --env-file=.env scripts/import-nba.mjs`: confere os álbuns ao vivo e gera uma prévia em `node_modules/.cache/nba/products.json`, sem gravar no catálogo.
4. `node --experimental-strip-types --env-file=.env scripts/import-nba.mjs --apply`: guarda as fotos no R2 configurado (ou Supabase Storage) e só então publica os novos produtos. Requer Node 22 e a conexão administrativa local. Produtos existentes não são sobrescritos, mesmo se o nome ou preço tiver sido editado manualmente.

Não agendamos publicação automática: a fonte mistura peças de épocas distintas, combinações de jogadores que não usaram aquele uniforme, camisetas e shorts. A descoberta e a importação são automatizadas; a seleção é revisada. Não use data de publicação como temporada. A categoria “26赛季 NBA 2025-26” representa 2025/2026, não 2026/2027.

2026/2027: a intenção é cobrir Association e Icon dos 30 times. A seleção verificada inclui os especiais Heat × GTA VI e o City Edition Moments Mixtape dos Pacers, que retorna de 2025/2026. Os demais atuais ainda precisam de confirmação visual e de temporada antes de entrar no manifesto.

Referências de identificação: [desenho Moments Mixtape dos Pacers](https://www.nba.com/pacers/city), [uso dos uniformes dos Pacers em 2026/2027](https://www.colorwaysports.com/stories/pacers-uniform-schedule-2026-27) e [camuflada dos Spurs de 2013/2014](https://www.nba.com/spurs/news/131024_jersey).

Os preços vêm da configuração NBA da loja. Não estimamos custo do fornecedor nem margem de lucro a partir das imagens. Os tamanhos S–XXL da fonte correspondem a P, M, G, GG e G1.

Os nomes das edições não são traduções cegas do título do fornecedor. Por exemplo, The Town com acabamento amarelo pertence à fase Statement de 2017–2019; o lançamento City preto de 2019/2020 é outro modelo. Referência: [uniformes Warriors 2019/2020](https://cdn-uat.nba.com/news/warriors-unveil-new-jersey-designs-2019-20).

Verificação: `node --test scripts/lib/yupoo-nba.test.mjs` e `npm test -- src/__tests__/nba-jerseys.test.ts src/__tests__/server-checkout.test.ts src/__tests__/types.test.ts`.
