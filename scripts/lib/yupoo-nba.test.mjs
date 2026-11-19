import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIndex, parseAlbum, buildProduct, productId } from './yupoo-nba.mjs';

test('reads real Yupoo card structure, escaped entities and album images without noscript duplicates', () => {
  assert.deepEqual(parseIndex('<a class="album__main" title="Bulls &amp; Jordan" href="/albums/123?uid=1&amp;x=2">photo</a><a href="/albums/456">skip</a>'), [{ id: '123', title: 'Bulls & Jordan' }]);
  const album = parseAlbum('<span data-name="Bulls &amp; Jordan"></span>' + [1, 2].map((id) => `<img data-album-id="123" data-type="photo" data-origin-src="https://photo.yupoo.com/xingkong-sports/${id}/x.jpg" data-width="1000" data-height="1000"><noscript><img src="preview.jpg"></noscript>`).join(''), '123');
  assert.equal(album.photos.length, 2);
  const entry = { albumId: '123', sourceTitle: album.title, team: 'Chicago Bulls', season: '1997/1998', edition: 'Classic Edition Vermelha', player: 'Jordan', number: '23', photos: [album.photos[1].url, album.photos[0].url] };
  const product = buildProduct(entry, album);
  assert.match(product.nome, / — Jordan #23$/);
  assert.equal(product.imagem_urls[0], album.photos[1].url);
  assert.equal(product.id, productId('123'));
  assert.equal(buildProduct(entry, { ...album, photos: [...album.photos].reverse() }).imagem_urls[0], product.imagem_urls[0]);
  assert.notEqual(product.id, productId('456'));
  assert.throws(() => buildProduct({ ...entry, sourceTitle: 'changed' }, album));
  assert.throws(() => buildProduct({ ...entry, photos: ['https://photo.yupoo.com/outro/album.jpg', album.photos[0].url] }, album));
  assert.throws(() => buildProduct({ ...entry, season: '2026/2026' }, album));
  assert.throws(() => parseAlbum('<span data-name="X"></span><img data-album-id="123" data-type="photo" data-origin-src="https://evil.example/image.jpg">', '123'));
});
