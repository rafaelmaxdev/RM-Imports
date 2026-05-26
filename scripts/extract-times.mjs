import axios from "axios";
import { JSDOM } from "jsdom";

const ligas = [
  { nome: "Brasileirão", url: "https://minkang.x.yupoo.com/categories/680738" },
  { nome: "Bundesliga", url: "https://minkang.x.yupoo.com/categories/680725" },
  { nome: "Eredivisie", url: "https://minkang.x.yupoo.com/categories/3302916" },
  { nome: "La Liga", url: "https://minkang.x.yupoo.com/categories/680717" },
  { nome: "Ligue 1", url: "https://minkang.x.yupoo.com/categories/2897018" },
  { nome: "MLS", url: "https://minkang.x.yupoo.com/categories/3247384" },
  { nome: "Premier League", url: "https://minkang.x.yupoo.com/categories/680719" },
  { nome: "Serie A", url: "https://minkang.x.yupoo.com/categories/708736" },
];

async function fetchTimes(nome, url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const dom = new JSDOM(data);
    const doc = dom.window.document;

    let elementos = [];

    // Novo layout
    elementos = Array.from(doc.querySelectorAll(".categories__box-right-category-item"));

    // Fallback layouts antigos
    if (elementos.length === 0) {
      const categoryId = url.split("/categories/").pop()?.split("?")[0];
      if (categoryId) {
        const list = doc.querySelector(`#child_category_${categoryId}`);
        if (list) {
          elementos = Array.from(list.querySelectorAll(".showheader__child_link"));
        }
      }
    }
    if (elementos.length === 0) {
      elementos = Array.from(doc.querySelectorAll(".showheader__child_link"));
    }
    if (elementos.length === 0) {
      elementos = Array.from(doc.querySelectorAll(".category__list a, .showheader__categories a"));
    }
    if (elementos.length === 0) {
      const allLinks = doc.querySelectorAll("a[href*='/categories/']");
      elementos = Array.from(allLinks).filter((el) => {
        const text = el.textContent?.trim() || "";
        return text.length > 0 && text.length < 100;
      });
    }

    const times = elementos
      .map((el) => el.textContent?.trim() || "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return { nome, times };
  } catch (err) {
    return { nome, times: [], error: err.message };
  }
}

async function main() {
  const resultados = await Promise.all(ligas.map((l) => fetchTimes(l.nome, l.url)));

  for (const r of resultados) {
    console.log(`\n${r.nome} (${r.times.length} times):`);
    if (r.error) {
      console.log(`  ERRO: ${r.error}`);
    } else {
      for (const t of r.times) {
        console.log(`  "${t}",`);
      }
    }
  }
}

main();
