import { createHash } from 'node:crypto';

export const SOURCE = 'https://xingkong-sports.x.yupoo.com';

export function decodeHtml(value) {
  return value.replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi, (entity, code, name) => {
    if (code) return String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[name.toLowerCase()] ?? entity;
  });
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map((m) => [m[1], decodeHtml(m[3])]));
}

export function parseIndex(html) {
  const albums = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const attrs = attributes(match[0].slice(0, match[0].indexOf('>') + 1));
    if (!attrs.class?.split(/\s+/).includes('album__main')) continue;
    const id = attrs.href?.match(/^\/albums\/(\d+)(?:\?|$)/)?.[1];
    if (id && attrs.title) albums.push({ id, title: attrs.title });
  }
  return albums;
}

export function parseAlbum(html, id) {
  const title = decodeHtml(html.match(/data-name="([^"]+)"/)?.[1] ?? '');
  const photos = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs['data-album-id'] !== id || attrs['data-type'] !== 'photo') continue;
    const url = new URL(attrs['data-origin-src']);
    if (url.protocol !== 'https:' || url.hostname !== 'photo.yupoo.com' || !url.pathname.startsWith('/xingkong-sports/')) {
      throw new Error(`Imagem fora da fonte permitida: álbum ${id}`);
    }
    photos.push({ url: url.href, title: attrs.alt ?? '', width: Number(attrs['data-width']), height: Number(attrs['data-height']) });
  }
  if (!title || photos.length < 2) throw new Error(`Álbum ${id} incompleto, bloqueado ou sem fotos suficientes`);
  const coverUrl = html.match(/showalbumheader__gallerycover[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
  const cover = coverUrl ? photos.findIndex((p) => new URL(p.url).pathname.split('/').slice(0, -1).join('/') === new URL(coverUrl).pathname.split('/').slice(0, -1).join('/')) : -1;
  return { id, title, photos, cover };
}

export async function fetchSource(path) {
  const url = new URL(path, SOURCE);
  if (url.origin !== SOURCE || !/^\/(?:albums|categories)(?:\/\d+)?\/?$/.test(url.pathname)) throw new Error('Fonte inválida');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${SOURCE}/` },
    signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error(`Yupoo indisponível (${response.status})`);
  const html = await response.text();
  if (html.length > 3_000_000 || !html.includes('yupoo')) throw new Error('Resposta Yupoo inválida');
  return html;
}

export function productId(albumId) {
  const hex = createHash('sha256').update(`${SOURCE}/albums/${albumId}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function buildProduct(selection, album) {
  if (!/^\d+$/.test(selection.albumId) || album.id !== selection.albumId || album.title !== selection.sourceTitle) throw new Error('Álbum alterado: revise a seleção');
  if (!/^\d{4}\/\d{4}$/.test(selection.season) || Number(selection.season.slice(5)) !== Number(selection.season.slice(0, 4)) + 1) throw new Error('Temporada inválida');
  if (!selection.team?.trim() || !selection.edition?.trim() || !selection.player?.trim() || !/^\d{1,2}$/.test(selection.number)) throw new Error('Identificação do modelo incompleta');
  const images = selection.photos;
  if (!Array.isArray(images) || images.length < 2 || new Set(images).size !== images.length || images.some((url) => !album.photos.some((photo) => photo.url === url))) throw new Error('Selecione capa, costas e detalhes válidos do mesmo álbum');
  return {
    id: productId(selection.albumId),
    nome: `Regata ${selection.team} ${selection.season} ${selection.edition} — ${selection.player} #${selection.number}`,
    liga: 'NBA', time: selection.team, tipo: 'NBA', temporada: selection.season,
    imagem_urls: images, imagem_urls_feminina: [], yupoo_url: `${SOURCE}/albums/${selection.albumId}?uid=1`,
    destaque: false, ordem_destaque: null, preco_customizado: null, promocao: false,
    promocao_tipo: null, promocao_valor: null, feminino: false, peca: 'regata',
  };
}
