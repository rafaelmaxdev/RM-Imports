import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { addProduto, updateProduto, deleteProduto, parseImageUrls } from "./lib/db";
import type { DbProduto } from "./lib/db";
import { getCachedImageUrl } from "./types";
import { normalizarBusca } from "./lib/utils";
import { normalizeNome } from "./lib/utils";

/** Pre-cache product images via the /api/precache endpoint */
async function precacheProduto(produtoId: string): Promise<void> {
  try {
    await fetch("/api/precache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produtoId }),
    });
  } catch (err) {
    console.warn("[precache] Failed for", produtoId, err);
  }
}

interface Time {
  id: string;
  nome: string;
  href: string;
}

interface Liga {
  nome: string;
  url: string;
}

const SELECOES = [
  "Alemanha", "Arábia Saudita", "Argentina", "Austrália", "Áustria", "Bélgica", "Brasil",
  "Camarões", "Canadá", "Colômbia", "Coreia do Sul", "Croácia", "Dinamarca", "Espanha",
  "EUA", "França", "Gana", "Holanda", "Inglaterra", "Irã", "Itália", "Japão",
  "Marrocos", "México", "Nigéria", "Polônia", "Portugal", "Qatar", "Senegal",
  "Sérvia", "Suécia", "Suíça", "Tunísia", "Uruguai",
].sort((a, b) => a.localeCompare(b));

const NBA_FRANQUIAS = [
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
  "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
  "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
  "LA Clippers", "LA Lakers", "Memphis Grizzlies", "Miami Heat",
  "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
  "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
  "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
  "Utah Jazz", "Washington Wizards",
].sort((a, b) => a.localeCompare(b));

// Times hardcoded com nomes conhecidos no Brasil
const TIMES_POR_LIGA: Record<string, string[]> = {
  Brasileirão: [
    "Athletico Paranaense", "Atlético Mineiro", "Atlético Juventus", "Bahia", "Botafogo",
    "Ceará", "Chapecoense", "Confiança", "Corinthians", "Coritiba", "Cruzeiro",
    "Cuiabá", "Flamengo", "Fluminense", "Fortaleza", "Grêmio", "Internacional",
    "Náutico", "Palmeiras", "Paysandu", "Red Bull Bragantino", "Remo", "São Paulo",
    "Santa Cruz", "Santos", "Sport Recife", "Vasco da Gama", "Vitória",
  ],
  Bundesliga: [
    "Augsburg", "Bayer Leverkusen", "Bayern de Munique", "Borussia Dortmund",
    "Borussia Mönchengladbach", "Eintracht Frankfurt", "Freiburg", "Hamburgo", "Colônia",
    "MSV Duisburg", "Nürnberg", "RB Leipzig", "Rot-Weiss Essen", "Schalke 04",
    "St. Pauli", "Werder Bremen", "Wolfsburg",
  ],
  Eredivisie: [
    "Ajax", "Feyenoord", "PSV Eindhoven",
  ],
  "La Liga": [
    "Albacete", "Athletic Bilbao", "Atlético de Madrid", "Barcelona", "País Basco",
    "Burgos", "Cádiz", "Cartagena", "Celta de Vigo", "Compostela", "Córdoba",
    "Deportivo Alavés", "Deportivo La Coruña", "Elche", "Espanyol", "Getafe", "Girona",
    "Granada", "Hércules", "Las Palmas", "Leganés", "Levante", "Málaga", "Mallorca",
    "Osasuna", "Racing de Santander", "Rayo Vallecano", "Real Betis", "Real Madrid",
    "Real Murcia", "Real Oviedo", "Real Sociedad", "Real Valladolid", "Sevilla",
    "Sporting Gijón", "Tenerife", "Almería", "Valencia", "Villarreal", "Real Zaragoza",
  ],
  "Ligue 1": [
    "Cannes", "Bordeaux", "Monaco", "Nice", "Marseille",
    "Lyon", "Paris FC", "PSG", "Rennes",
  ],
  MLS: [
    "Atlanta United", "Austin FC", "Charlotte FC", "D.C. United", "Inter Miami",
    "LA Galaxy", "Los Angeles FC", "New York City FC", "New York Red Bulls",
    "Orlando City", "San Diego FC",
  ],
  "Premier League": [
    "Arsenal", "Aston Villa", "Birmingham City", "Blackburn Rovers", "Brighton",
    "Chelsea", "Coventry City", "Crystal Palace", "Derby County", "Everton", "Fulham",
    "Hull City", "Leeds United", "Leicester City", "Liverpool", "Lincoln City",
    "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest", "Sheffield Wednesday",
    "Southampton", "Sunderland", "Tottenham", "West Ham", "Wolverhampton",
  ],
  "Serie A": [
    "Milan", "Atalanta", "Bologna", "Brescia", "Cremonese", "Fiorentina",
    "Genoa", "Inter de Milão", "Juventus", "Lazio", "Napoli", "Parma", "Pisa", "Roma",
    "Sampdoria", "Sassuolo", "Bari", "Torino", "Venezia",
  ],
};

const ligas: Liga[] = [
  { nome: "Brasileirão", url: "/api/yupoo/categories/680738" },
  { nome: "Bundesliga", url: "/api/yupoo/categories/680725" },
  { nome: "Eredivisie", url: "/api/yupoo/categories/3302916" },
  { nome: "La Liga", url: "/api/yupoo/categories/680717" },
  { nome: "Ligue 1", url: "/api/yupoo/categories/2897018" },
  { nome: "MLS", url: "/api/yupoo/categories/3247384" },
  { nome: "NBA", url: "" },
  { nome: "Premier League", url: "/api/yupoo/categories/680719" },
  { nome: "Serie A", url: "/api/yupoo/categories/708736" },
  { nome: "Seleções", url: "" },
].sort((a, b) => a.nome.localeCompare(b.nome));

const RETRO_ANO_SELECAO = 2022;

function getValorAtual(isAno: boolean): string {
  if (isAno) {
    return String(new Date().getFullYear());
  }
  const ano = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;
  if (mes >= 7) {
    return `${ano}/${ano + 1}`;
  }
  return `${ano - 1}/${ano}`;
}

export function isRetro(valor: string, isAno: boolean): boolean {
  // Sempre usa o primeiro ano para determinar se é retrô
  // Suporta: "2026", "1992/1994", "2025/2026", "25/26"
  const first = valor.split("/")[0].trim();
  const ano = parseInt(first, 10);
  const anoCompleto = first.length <= 2
    ? (ano >= 50 ? ano + 1900 : ano + 2000)
    : ano;
  const limite = isAno ? RETRO_ANO_SELECAO : 2021;
  return anoCompleto <= limite;
}

export function montarNome(
  time: string,
  tipo: string,
  periodo: string,
  nomeCustom: string,
  localizacao: string,
  peca: string
): string {
  if (!time || !tipo || !periodo) return "";
  if (nomeCustom) return nomeCustom;
  const loc = localizacao ? ` (${localizacao})` : "";
  const pecaLabel = peca === "regata" ? "Regata" : "Camisa";
  if (tipo === "Retrô") return `${pecaLabel} ${time} ${periodo} Retrô${loc}`;
  return `${pecaLabel} ${time} ${periodo} Versão ${tipo}${loc}`;
}

function getTimesPorLiga(ligaNome: string): Time[] {
  const nomes = TIMES_POR_LIGA[ligaNome];
  if (!nomes) return [];
  return nomes.map((nome, i) => ({
    id: `${ligaNome}-${i}`,
    nome: normalizeNome(nome),
    href: "",
  }));
}

export function formatarValor(value: string): string {
  // Permite dígitos e barra (Seleções aceita gap tipo 1992/1994 ou ano simples 2026)
  return value.replace(/[^0-9/]/g, "");
}

function toDbProduto(p: {
  nome: string;
  liga: string;
  time: string;
  tipo: string;
  temporada: string;
  imagemUrls: string[];
  yupooUrl: string;
  destaque?: boolean;
  feminino?: boolean;
  preco_customizado?: number | null;
  promocao?: boolean;
  promocao_tipo?: string | null;
  promocao_valor?: number | null;
  peca?: string;
}): Omit<DbProduto, "id" | "created_at"> {
  return {
    nome: p.nome,
    liga: p.liga,
    time: p.time,
    tipo: p.tipo,
    temporada: p.temporada,
    imagem_urls: p.imagemUrls.filter(Boolean),
    yupoo_url: p.yupooUrl,
    destaque: p.destaque ?? false,
    feminino: p.feminino ?? false,
    preco_customizado: p.preco_customizado ?? null,
    promocao: p.promocao ?? false,
    promocao_tipo: p.promocao_tipo ?? null,
    promocao_valor: p.promocao_valor ?? null,
    peca: p.peca ?? "camisa",
    ordem_destaque: null,
  };
}

function fromDbProduto(p: DbProduto) {
  return {
    ...p,
    imagemUrls: parseImageUrls(p.imagem_urls),
    yupooUrl: p.yupoo_url,
  };
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ESem imagem%3C/text%3E%3C/svg%3E";

const ERROR_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EErro%3C/text%3E%3C/svg%3E";

function AdminProductCard({
  p,
  onEdit,
  onRemove,
}: {
  p: DbProduto;
  onEdit: (p: DbProduto) => void;
  onRemove: (id: string) => void;
}) {
  const imgs = parseImageUrls(p.imagem_urls);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const activeImg = imgs.length > 0 ? getCachedImageUrl(imgs[activeIdx], p.cached_image_urls, activeIdx, "medium") : PLACEHOLDER_IMG;

  const goNext = useCallback(() => {
    if (imgs.length > 1) setActiveIdx((i) => (i < imgs.length - 1 ? i + 1 : 0));
  }, [imgs.length]);

  const goPrev = useCallback(() => {
    if (imgs.length > 1) setActiveIdx((i) => (i > 0 ? i - 1 : imgs.length - 1));
  }, [imgs.length]);

  return (
    <>
      <div className="bg-card-bg rounded-md overflow-hidden shadow-card flex flex-col">
        {/* Main image — clickable to open lightbox */}
        <div
          className="aspect-square bg-gray-100 overflow-hidden relative group cursor-pointer"
          onClick={() => imgs.length > 0 && setLightbox(true)}
        >
          <img
            className="w-full h-full object-cover"
            src={activeImg}
            alt={p.nome}
            onError={(e) => {
              (e.target as HTMLImageElement).src = ERROR_IMG;
            }}
          />
          {imgs.length > 1 && (
            <>
              {/* Nav arrows */}
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                aria-label="Anterior"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                aria-label="Próxima"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              {/* Dot indicators */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {imgs.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }}
                    className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-all ${
                      i === activeIdx ? "bg-white scale-125" : "bg-white/60 hover:bg-white/80"
                    }`}
                    aria-label={`Imagem ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
          {imgs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-text-muted text-xs">Sem imagem</span>
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {imgs.length > 1 && (
          <div className="flex gap-1 px-2 pt-2 overflow-x-auto">
            {imgs.map((url, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`flex-shrink-0 rounded border-2 transition-all cursor-pointer p-0 overflow-hidden ${
                  i === activeIdx ? "border-accent" : "border-border hover:border-primary/40"
                }`}
              >
                <img
                  className="w-10 h-10 object-cover"
                  src={getCachedImageUrl(url, p.cached_image_urls, i, "small")}
                  alt={`${p.nome} ${i + 1}`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23eee'/%3E%3C/svg%3E";
                  }}
                />
              </button>
            ))}
          </div>
        )}

        <div className="p-2 sm:p-3 flex flex-col flex-1">
          <div className="font-semibold text-xs sm:text-sm line-clamp-2 mb-1">{p.nome}</div>
          <div className="text-[10px] sm:text-xs text-text-muted mb-2">
            {p.liga} • {p.tipo} • {p.temporada}
          </div>
          <div className="mt-auto flex gap-1 sm:gap-2">
            <button
              className="flex-1 bg-yellow-400 text-text-main px-1 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md cursor-pointer hover:opacity-90"
              onClick={() => onEdit(p)}
            >
              Editar
            </button>
            <button
              className="flex-1 bg-red-500 text-white px-1 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md cursor-pointer hover:opacity-90"
              onClick={() => onRemove(p.id)}
            >
              Remover
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && imgs.length > 0 && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000]"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-10 right-0 text-white text-2xl cursor-pointer bg-none border-none hover:opacity-80"
            >
              ✕
            </button>

            <div className="relative">
              <img
                className="w-full rounded-md"
                src={getCachedImageUrl(imgs[activeIdx], p.cached_image_urls, activeIdx, "medium")}
                alt={p.nome}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = ERROR_IMG;
                }}
              />

              {imgs.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/85 hover:bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer"
                    aria-label="Anterior"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/85 hover:bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer"
                    aria-label="Próxima"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>

                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                    {imgs.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={`w-14 h-14 rounded border-2 overflow-hidden cursor-pointer transition-all ${
                          i === activeIdx ? "border-white scale-110 shadow-lg" : "border-white/40 hover:border-white/70 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img
                          className="w-full h-full object-cover"
                          src={getCachedImageUrl(url, p.cached_image_urls, i, "small")}
                          alt={`${p.nome} ${i + 1}`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' fill='%23eee'/%3E%3C/svg%3E";
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="text-white text-center text-sm mt-2">
              {activeIdx + 1} / {imgs.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ProdutoForm({
  produtos,
  setProdutos,
}: {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
}) {
  const timesPorLiga: Record<string, Time[]> = useMemo(() => {
    const mapa: Record<string, Time[]> = {};
    ligas.forEach((l) => {
      if (l.url) {
        const times = getTimesPorLiga(l.nome);
        if (times.length > 0) mapa[l.nome] = times;
      }
    });
    return mapa;
  }, []);


  const [liga, setLiga] = useState("");
  const [time, setTime] = useState("");
  const [periodo, setPeriodo] = useState(getValorAtual(false));
  const [tipo, setTipo] = useState("Torcedor");
  const [localizacao, setLocalizacao] = useState("");
  const [nomeCustom, setNomeCustom] = useState("");
  const [imagemUrls, setImagemUrls] = useState<string[]>([""]);
  const [yupooUrl, setYupooUrl] = useState("");
  const [destaque, setDestaque] = useState(false);
  const [promocao, setPromocao] = useState(false);
  const [promocaoTipo, setPromocaoTipo] = useState<string>("");
  const [promocaoValor, setPromocaoValor] = useState("");
  const [precoCustomizado, setPrecoCustomizado] = useState("");
  const [feminino, setFeminino] = useState(false);
  const [peca, setPeca] = useState("camisa");

  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Lock body scroll when edit modal is open
  useEffect(() => {
    if (editandoId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [editandoId]);
  const [saving, setSaving] = useState(false);

  const [filtroTime, setFiltroTime] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroBusca, setFiltroBusca] = useState("");

  const isAno = liga === "Seleções";

  useEffect(() => {
    if (!editandoId) {
      setPeriodo(getValorAtual(isAno));
    }
  }, [isAno]);

  const timesDaLiga = useMemo(() => {
    if (liga === "Seleções") {
      return SELECOES.map((t, i) => ({ id: `sel-${i}`, nome: t, href: "" }));
    }
    if (liga === "NBA") {
      return NBA_FRANQUIAS.map((t, i) => ({ id: `nba-${i}`, nome: t, href: "" }));
    }
    return timesPorLiga[liga] || [];
  }, [liga, timesPorLiga]);

  const retro = isRetro(periodo, isAno);
  const isNBA = liga === "NBA";
  const tiposDisponiveis = isNBA
    ? ["NBA"]
    : retro
      ? ["Retrô", "Manga Longa Retrô"]
      : ["Torcedor", "Jogador", "Manga Longa Torcedor", "Manga Longa Jogador", "Goleiro", "Treinamento", "Polo"];

  useEffect(() => {
    if (isNBA && tipo !== "NBA") {
      setTipo("NBA");
    } else if (retro && tipo !== "Retrô" && tipo !== "Manga Longa Retrô") {
      setTipo("Retrô");
    } else if (!retro && !isNBA && (tipo === "Retrô" || tipo === "Manga Longa Retrô")) {
      setTipo("Torcedor");
    } else if (!retro && !isNBA && tipo === "NBA") {
      setTipo("Torcedor");
    }
  }, [retro, isNBA]);

  useEffect(() => {
    if (tipo !== "Torcedor" && tipo !== "Manga Longa Torcedor") setFeminino(false);
  }, [tipo]);

  const nomeFinal = montarNome(time, tipo, periodo, nomeCustom, localizacao, peca);

  function limparForm() {
    setLiga("");
    setTime("");
    setPeriodo(getValorAtual(false));
    setTipo("Torcedor");
    setLocalizacao("");
    setNomeCustom("");
    setImagemUrls([""]);
    setYupooUrl("");
    setDestaque(false);
    setFeminino(false);
    setPeca("camisa");
    setPromocao(false);
    setPromocaoTipo("");
    setPromocaoValor("");
    setPrecoCustomizado("");
    setEditandoId(null);
  }

  async function handleAdd() {
    const nome = nomeCustom || montarNome(time, tipo, periodo, "", localizacao, peca);
    if (!nome || saving) return;
    setSaving(true);

    try {
      const novo = await addProduto(
        toDbProduto({
          nome,
          liga,
          time,
          tipo,
          temporada: periodo,
          imagemUrls,
          yupooUrl,
          destaque,
          feminino,
          peca,
          promocao,
          promocao_tipo: promocao ? promocaoTipo || null : null,
          promocao_valor: promocao && promocaoTipo === "porcentagem" ? parseFloat(promocaoValor) || null : null,
          preco_customizado: precoCustomizado ? parseFloat(precoCustomizado) : null,
        })
      );

      setProdutos((prev) => [novo, ...prev]);
      // Pre-cache images in the background (don't block UI)
      precacheProduto(novo.id);
      limparForm();
    } catch (err) {
      console.error("Erro ao adicionar:", err);
      alert("Erro ao adicionar produto. Verifique o console para detalhes.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(p: DbProduto) {
    const fp = fromDbProduto(p);
    const normalizedLiga = normalizeNome(fp.liga);
    const normalizedTime = normalizeNome(fp.time);
    setLiga(normalizedLiga);
    setTime(normalizedTime);
    setPeriodo(fp.temporada);
    setTipo(fp.tipo);
    setImagemUrls(fp.imagemUrls.length > 0 ? [...fp.imagemUrls] : [""]);
    setYupooUrl(fp.yupooUrl);
    setDestaque(p.destaque);
    setFeminino(p.feminino);
    setPeca(p.peca ?? "camisa");
    setPromocao(p.promocao);
    setPromocaoTipo(p.promocao_tipo ?? "");
    setPromocaoValor(p.promocao_valor != null ? String(p.promocao_valor) : "");
    setPrecoCustomizado(p.preco_customizado != null ? String(p.preco_customizado) : "");
    setEditandoId(fp.id);

    const locMatch = fp.nome.match(/\((Casa|Fora|Terceira)\)/);
    const loc = locMatch ? locMatch[1] : "";
    setLocalizacao(loc);

    const nomeGerado = montarNome(normalizedTime, fp.tipo, fp.temporada, "", loc, p.peca ?? "camisa");
    setNomeCustom(fp.nome !== nomeGerado ? fp.nome : "");
  }

  async function handleSave() {
    const nome = nomeCustom || montarNome(time, tipo, periodo, "", localizacao, peca);
    if (!nome || !editandoId || saving) return;
    setSaving(true);

    try {
      const atualizado = await updateProduto(
        editandoId,
        toDbProduto({
          nome,
          liga,
          time,
          tipo,
          temporada: periodo,
          imagemUrls,
          yupooUrl,
          destaque,
          feminino,
          peca,
          promocao,
          promocao_tipo: promocao ? promocaoTipo || null : null,
          promocao_valor: promocao && promocaoTipo === "porcentagem" ? parseFloat(promocaoValor) || null : null,
          preco_customizado: precoCustomizado ? parseFloat(precoCustomizado) : null,
        })
      );

      setProdutos((prev) => prev.map((p) => (p.id === editandoId ? atualizado : p)));
      // Pre-cache images in the background (don't block UI)
      precacheProduto(editandoId);
      limparForm();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar produto. Verifique o console para detalhes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteProduto(id);
      setProdutos((prev) => prev.filter((p) => p.id !== id));
      if (editandoId === id) limparForm();
    } catch (err) {
      console.error("Erro ao remover:", err);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const produtosFiltrados = useMemo(() => {
    const busca = normalizarBusca(filtroBusca);
    return produtos.filter((p) => {
      if (filtroTime && p.time !== filtroTime) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (busca) {
        const campos = normalizarBusca([p.nome, p.time, p.tipo, p.temporada].join(" "));
        if (!campos.includes(busca)) return false;
      }
      return true;
    });
  }, [produtos, filtroTime, filtroTipo, filtroBusca]);

  const todosTimes = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach((p) => set.add(p.time.trim()));
    return Array.from(set).sort();
  }, [produtos]);



  const formFields = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Liga</label>
        <select
          value={liga}
          onChange={(e) => {
            setLiga(e.target.value);
            setTime("");
          }}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        >
          <option value="">Selecione a liga</option>
          {ligas.map((l) => (
            <option key={l.nome} value={l.nome}>
              {l.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Time</label>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!liga}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg disabled:opacity-50"
        >
          <option value="">Selecione o time</option>
          {timesDaLiga.map((t) => (
            <option key={t.id} value={t.nome}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">{isAno ? "Ano" : "Temporada"}</label>
        <input
          type="text"
          value={periodo}
          onChange={(e) => setPeriodo(formatarValor(e.target.value))}
          placeholder={isAno ? "ex: 2026 ou 1992/1994" : "ex: 2025/2026"}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">
          Tipo{" "}
          {retro &&
            (isAno
              ? "(apenas Retrô para 2022 ou anterior)"
              : "(apenas Retrô para 2021/2022 ou anterior)")}
        </label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        >
          {tiposDisponiveis.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Localização (opcional)</label>
        <select
          value={localizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        >
          <option value="">Padrão</option>
          <option value="Casa">Casa</option>
          <option value="Fora">Fora</option>
          <option value="Terceira">Terceira</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Nome personalizado (opcional)</label>
        <input
          type="text"
          value={nomeCustom}
          onChange={(e) => setNomeCustom(e.target.value)}
          placeholder="Sobrescreve o nome gerado"
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-text-muted">Links das imagens</label>
        {imagemUrls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                const newUrls = [...imagemUrls];
                newUrls[i] = e.target.value;
                setImagemUrls(newUrls);
              }}
              placeholder="https://..."
              className="flex-1 px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
            />
            {imagemUrls.length > 1 && (
              <button
                type="button"
                onClick={() => setImagemUrls(imagemUrls.filter((_, j) => j !== i))}
                className="px-2.5 text-red-500 hover:bg-red-50 rounded-md border border-red-200 text-sm cursor-pointer transition-colors"
                aria-label="Remover imagem"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setImagemUrls([...imagemUrls, ""])}
          className="text-sm text-accent hover:underline cursor-pointer self-start"
        >
          + Adicionar imagem
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Link da loja Yupoo</label>
        <input
          type="text"
          value={yupooUrl}
          onChange={(e) => setYupooUrl(e.target.value)}
          placeholder="https://..."
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="feminino-check"
          type="checkbox"
          checked={feminino}
          onChange={(e) => setFeminino(e.target.checked)}
          disabled={tipo !== "Torcedor"}
          className="w-4 h-4 accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <label htmlFor="feminino-check" className={`text-sm select-none ${tipo !== "Torcedor" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
          Tem versão feminina
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Peça</label>
        <select
          value={peca}
          onChange={(e) => setPeca(e.target.value)}
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        >
          <option value="camisa">Camisa</option>
          <option value="regata">Regata / Jersey</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-text-muted">Preço customizado (opcional — sobrescreve o preço da categoria)</label>
        <input
          type="number"
          step="0.01"
          value={precoCustomizado}
          onChange={(e) => setPrecoCustomizado(e.target.value)}
          placeholder="Deixe vazio para usar o preço padrão"
          className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
        />
      </div>

      <div className="px-3 py-3 bg-blue-50 rounded-md font-medium text-primary">
        {nomeFinal || "Preencha os campos acima"}
      </div>

      <div className="flex gap-3">
        {editandoId ? (
          <>
            <button
              className="flex-1 py-3 text-base font-semibold bg-green-500 text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSave}
              disabled={!nomeFinal || saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              className="px-6 py-3 text-base font-semibold bg-border text-text-main rounded-md cursor-pointer transition-colors hover:bg-gray-300"
              onClick={limparForm}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            className="flex-1 py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAdd}
            disabled={!nomeFinal || saving}
          >
            {saving ? "Adicionando..." : "Adicionar Produto"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Add form — only shown when NOT editing */}
        {!editandoId && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl text-primary m-0">Adicionar Produto</h2>
              <button
                className="bg-transparent text-text-muted border border-border px-4 py-1.5 text-sm rounded-md hover:bg-border hover:text-text-main transition-colors"
                onClick={handleLogout}
              >
                Sair
              </button>
            </div>
            {formFields}
          </>
        )}

        {/* Product list — always visible */}
        {produtos.length > 0 && (
          <div className={!editandoId ? "mt-8" : ""}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl text-primary m-0">Produtos ({produtos.length})</h3>
              {editandoId && (
                <button
                  className="bg-transparent text-text-muted border border-border px-4 py-1.5 text-sm rounded-md hover:bg-border hover:text-text-main transition-colors"
                  onClick={handleLogout}
                >
                  Sair
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <input
                type="text"
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                placeholder="Buscar por nome, time, liga..."
                className="flex-1 min-w-48 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
              />

              <select
                value={filtroTime}
                onChange={(e) => setFiltroTime(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
              >
                <option value="">Todos os times</option>
                {todosTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
              >
                <option value="">Todos os tipos</option>
                {["Torcedor", "Jogador", "Manga Longa Torcedor", "Manga Longa Jogador", "Manga Longa Retrô", "Retrô", "Goleiro", "Treinamento", "Polo", "NBA"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {(filtroTime || filtroTipo || filtroBusca) && (
                <button
                  className="px-3 py-2 text-sm bg-text-muted text-white rounded-md cursor-pointer hover:opacity-90"
                  onClick={() => {
                    setFiltroTime("");
                    setFiltroTipo("");
                    setFiltroBusca("");
                  }}
                >
                  Limpar
                </button>
              )}
            </div>

            {produtosFiltrados.length === 0 ? (
              <p className="text-center text-text-muted py-8">
                Nenhum produto encontrado com os filtros selecionados.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-4">
                {produtosFiltrados.map((p) => (
                  <AdminProductCard key={p.id} p={p} onEdit={handleEdit} onRemove={handleRemove} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal — floating overlay */}
      {editandoId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) limparForm(); }}
        >
          <div className="bg-card-bg rounded-lg shadow-xl max-w-3xl w-full my-4 sm:my-8 mx-4">
            <div className="sticky top-0 bg-card-bg p-4 border-b border-border flex justify-between items-center z-10 rounded-t-lg">
              <h2 className="text-xl text-primary m-0">Editar Produto</h2>
              <button
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-main text-xl bg-transparent border-none cursor-pointer rounded-full hover:bg-gray-100 transition-colors"
                onClick={limparForm}
                title="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="p-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {formFields}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
