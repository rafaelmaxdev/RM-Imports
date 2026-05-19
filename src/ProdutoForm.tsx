import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { supabase } from "./lib/supabase";
import { addProduto, updateProduto, deleteProduto, parseImageUrls } from "./lib/db";
import type { DbProduto } from "./lib/db";
import { FABRICANTES, proxyImageUrl } from "./types";

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

const ligas: Liga[] = [
  { nome: "Brasileirão", url: "/api/yupoo/categories/680738" },
  { nome: "Bundesliga", url: "/api/yupoo/categories/680725" },
  { nome: "Eredivisie", url: "/api/yupoo/categories/3302916" },
  { nome: "La Liga", url: "/api/yupoo/categories/680717" },
  { nome: "Ligue 1", url: "/api/yupoo/categories/2897018" },
  { nome: "MLS", url: "/api/yupoo/categories/3247384" },
  { nome: "Premier League", url: "/api/yupoo/categories/680719" },
  { nome: "Serie A", url: "/api/yupoo/categories/708736" },
  { nome: "Seleções", url: "" },
].sort((a, b) => a.nome.localeCompare(b.nome));

const renomear: Record<string, string> = {
  "LFC": "Liverpool",
  "M-U": "Manchester United",
  "Juv": "Juventus",
  "Ceara Sporting": "Ceará",
  "Ceará Sporting": "Ceará",
};

function normalizeNome(nome: string): string {
  let result = nome;
  Object.entries(renomear).forEach(([de, para]) => {
    result = result.replace(de, para);
  });
  return result;
}

const RETRO_ANO_TEMPORADA = 21;
const RETRO_ANO_SELECAO = 2022;

function getValorAtual(isAno: boolean): string {
  if (isAno) {
    return String(new Date().getFullYear());
  }
  const ano = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;
  const curto = ano % 100;
  if (mes >= 7) {
    return `${curto}/${curto + 1}`;
  }
  return `${curto - 1}/${curto}`;
}

function isRetro(valor: string, isAno: boolean): boolean {
  if (isAno) {
    return parseInt(valor) <= RETRO_ANO_SELECAO;
  }
  const [inicio] = valor.split("/").map(Number);
  return inicio <= RETRO_ANO_TEMPORADA;
}

function montarNome(
  time: string,
  tipo: string,
  periodo: string,
  nomeCustom: string,
  localizacao: string
): string {
  if (!time || !tipo || !periodo) return "";
  if (nomeCustom) return nomeCustom;
  const loc = localizacao ? ` (${localizacao})` : "";
  if (tipo === "Retrô") return `${time} ${periodo} Retrô${loc}`;
  return `${time} ${periodo} Versão ${tipo}${loc}`;
}

async function fetchTimes(url: string): Promise<Time[]> {
  const { data } = await axios.get(url);
  const parser = new DOMParser();
  const doc = parser.parseFromString(data, "text/html");
  const elementos = doc.querySelectorAll(".categories__box-right-category-item");

  const times = Array.from(elementos).map((el, i) => {
    const nomeOriginal = el.textContent?.trim() || "";
    const nome = normalizeNome(renomear[nomeOriginal] || nomeOriginal);
    return {
      id: `${url}-${i}`,
      nome,
      href: (el as HTMLAnchorElement).getAttribute("href") || "",
    };
  });

  return times.sort((a, b) => a.nome.localeCompare(b.nome));
}

function formatarValor(value: string, isAno: boolean): string {
  if (isAno) {
    return value.replace(/[^0-9]/g, "");
  }
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
}): Omit<DbProduto, "id" | "created_at"> {
  return {
    nome: p.nome,
    liga: p.liga,
    time: p.time,
    tipo: p.tipo,
    temporada: p.temporada,
    imagem_urls: p.imagemUrls.filter(Boolean),
    yupoo_url: p.yupooUrl,
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

  const activeImg = imgs.length > 0 ? proxyImageUrl(imgs[activeIdx]) : PLACEHOLDER_IMG;

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
                  src={proxyImageUrl(url)}
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

        <div className="p-3 flex flex-col flex-1">
          <div className="font-semibold text-sm line-clamp-2 mb-1">{p.nome}</div>
          <div className="text-xs text-text-muted mb-2">
            {p.liga} • {p.tipo} • {p.temporada}
          </div>
          <div className="mt-auto flex gap-2">
            <button
              className="flex-1 bg-yellow-400 text-text-main px-2 py-1.5 text-xs font-semibold rounded-md cursor-pointer hover:opacity-90"
              onClick={() => onEdit(p)}
            >
              Editar
            </button>
            <button
              className="flex-1 bg-red-500 text-white px-2 py-1.5 text-xs font-semibold rounded-md cursor-pointer hover:opacity-90"
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
                src={proxyImageUrl(imgs[activeIdx])}
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
                          src={proxyImageUrl(url)}
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
  const [timesPorLiga, setTimesPorLiga] = useState<Record<string, Time[]>>({});
  const [loadingTimes, setLoadingTimes] = useState(true);

  const [liga, setLiga] = useState("");
  const [time, setTime] = useState("");
  const [periodo, setPeriodo] = useState(getValorAtual(false));
  const [tipo, setTipo] = useState("Torcedor");
  const [localizacao, setLocalizacao] = useState("");
  const [nomeCustom, setNomeCustom] = useState("");
  const [imagemUrls, setImagemUrls] = useState<string[]>([""]);
  const [yupooUrl, setYupooUrl] = useState("");
  const [fabricante, setFabricante] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filtroTime, setFiltroTime] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroBusca, setFiltroBusca] = useState("");

  const isAno = liga === "Seleções";

  useEffect(() => {
    setPeriodo(getValorAtual(isAno));
  }, [isAno]);

  useEffect(() => {
    async function buscarTodos() {
      try {
        const resultados = await Promise.all(
          ligas
            .filter((l) => l.url)
            .map(async (l) => ({
              nome: l.nome,
              times: await fetchTimes(l.url),
            }))
        );

        const mapa: Record<string, Time[]> = {};
        resultados.forEach((r) => {
          mapa[r.nome] = r.times;
        });
        setTimesPorLiga(mapa);
      } catch {
        console.error("Erro ao buscar categorias");
      } finally {
        setLoadingTimes(false);
      }
    }

    buscarTodos();
  }, []);

  const timesDaLiga = useMemo(() => {
    if (liga === "Seleções") {
      return SELECOES.map((t, i) => ({ id: `sel-${i}`, nome: t, href: "" }));
    }
    return timesPorLiga[liga] || [];
  }, [liga, timesPorLiga]);

  const retro = isRetro(periodo, isAno);
  const tiposDisponiveis = retro ? ["Retrô"] : ["Torcedor", "Jogador", "Manga Longa"];

  useEffect(() => {
    if (retro && tipo !== "Retrô") {
      setTipo("Retrô");
    }
    if (!retro && tipo === "Retrô") {
      setTipo("Torcedor");
    }
  }, [retro]);

  const nomeFinal = montarNome(time, tipo, periodo, nomeCustom, localizacao);

  function limparForm() {
    setLiga("");
    setTime("");
    setPeriodo(getValorAtual(false));
    setTipo("Torcedor");
    setLocalizacao("");
    setFabricante("");
    setNomeCustom("");
    setImagemUrls([""]);
    setYupooUrl("");
    setEditandoId(null);
  }

  async function handleAdd() {
    const nome = nomeCustom || montarNome(time, tipo, periodo, "", localizacao);
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
        })
      );

      setProdutos((prev) => [novo, ...prev]);
      limparForm();
    } catch (err) {
      console.error("Erro ao adicionar:", err);
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
    setEditandoId(fp.id);

    const locMatch = fp.nome.match(/\((Casa|Fora)\)/);
    const loc = locMatch ? locMatch[1] : "";
    setLocalizacao(loc);

    const nomeGerado = montarNome(normalizedTime, fp.tipo, fp.temporada, "", loc);
    setNomeCustom(fp.nome !== nomeGerado ? fp.nome : "");
    setFabricante("");
  }

  async function handleSave() {
    const nome = nomeCustom || montarNome(time, tipo, periodo, "", localizacao);
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
        })
      );

      setProdutos((prev) => prev.map((p) => (p.id === editandoId ? atualizado : p)));
      limparForm();
    } catch (err) {
      console.error("Erro ao salvar:", err);
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
    const busca = filtroBusca.toLowerCase().trim();
    return produtos.filter((p) => {
      if (filtroTime && p.time !== filtroTime) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (busca) {
        const campos = [p.nome, p.time, p.liga, p.tipo, p.temporada].join(" ").toLowerCase();
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

  if (loadingTimes) return <div className="text-center py-16 text-text-muted text-lg">Carregando times...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl text-primary m-0">{editandoId ? "Editar Produto" : "Adicionar Produto"}</h2>
        <button
          className="bg-transparent text-text-muted border border-border px-4 py-1.5 text-sm rounded-md hover:bg-border hover:text-text-main transition-colors"
          onClick={handleLogout}
        >
          Sair
        </button>
      </div>

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
            onChange={(e) => setPeriodo(formatarValor(e.target.value, isAno))}
            placeholder={isAno ? "ex: 2026" : "ex: 25/26"}
            className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-text-muted">
            Tipo{" "}
            {retro &&
              (isAno
                ? "(apenas Retrô para 2022 ou anterior)"
                : "(apenas Retrô para 21/22 ou anterior)")}
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

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-text-muted">Fabricante (visível apenas no admin)</label>
          <select
            value={fabricante}
            onChange={(e) => setFabricante(e.target.value)}
            className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
          >
            <option value="">Selecione</option>
            {FABRICANTES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
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

      {produtos.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl mb-4 text-primary">Produtos ({produtos.length})</h3>

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
              {["Torcedor", "Jogador", "Manga Longa", "Retrô"].map((t) => (
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {produtosFiltrados.map((p) => (
                <AdminProductCard key={p.id} p={p} onEdit={handleEdit} onRemove={handleRemove} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
