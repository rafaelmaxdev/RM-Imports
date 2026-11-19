import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCE, decodeHtml, fetchSource, parseIndex } from './lib/yupoo-nba.mjs';

const home = await fetchSource('/albums');
const categories = [...home.matchAll(/<a[^>]+href=["'](\/categories\/\d+)["'][^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => ({ path: m[1], name: decodeHtml(m[2].replace(/<[^>]*>/g, '').trim()) }))
  .filter((c) => /Pacers|Pelicans|Magic|Wizards|Pistons|Kings|Thunder|Timberwolves|Cavaliers|Knicks|Raptors|Hawks|Spurs|Blazers|Jazz|Hornets|Suns|Mavericks|Bucks|76ers|Clippers|Warriors|Bulls|Nets|Heat|Nuggets|Rockets|Grizzlies|Celtics|Lakers|Swingman Jerseys/.test(c.name));
const results = [];
for (const category of categories) {
  for (let page = 1; page <= 20; page++) {
    const html = await fetchSource(`${category.path}?page=${page}`);
    const albums = parseIndex(html);
    results.push(...albums.map((a) => ({ ...a, category: category.name, url: `${SOURCE}/albums/${a.id}?uid=1` })));
    const pages = [...html.matchAll(/page(?:=|&#x3[Dd];)(\d+)/g)].map((m) => Number(m[1]));
    if (!albums.length || page >= Math.max(1, ...pages)) break;
  }
  console.log(`${category.name}: ${results.filter((a) => a.category === category.name).length}`);
}
await mkdir('node_modules/.cache/nba', { recursive: true });
await writeFile('node_modules/.cache/nba/discovery.json', JSON.stringify(results, null, 2));
console.log(`${new Set(results.map((a) => a.id)).size} álbuns únicos encontrados; lista em node_modules/.cache/nba/discovery.json`);
