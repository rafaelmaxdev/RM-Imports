import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { supabase } from "./lib/supabase";
import { addProduto, updateProduto, deleteProduto } from "./lib/db";
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
  imagemUrl: string;
  yupooUrl: string;
}): Omit<DbProduto, "id" | "created_at"> {
  return {
    nome: p.nome,
    liga: p.liga,
    time: p.time,
    tipo: p.tipo,
    temporada: p.temporada,
    imagem_url: p.imagemUrl,
    yupoo_url: p.yupooUrl,
  };
}

function fromDbProduto(p: DbProduto) {
  return {
    ...p,
    imagemUrl: p.imagem_url,
    yupooUrl: p.yupoo_url,
  };
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
  const [imagemUrl, setImagemUrl] = useState("");
  const [yupooUrl, setYupooUrl] = useState("");
  const [fabricante, setFabricante] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filtroTime, setFiltroTime] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

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
    setImagemUrl("");
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
          imagemUrl,
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
    setImagemUrl(fp.imagemUrl);
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
          imagemUrl,
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
    return produtos.filter((p) => {
      if (filtroTime && p.time !== filtroTime) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      return true;
    });
  }, [produtos, filtroTime, filtroTipo]);

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

        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-text-muted">Link da imagem</label>
          <input
            type="text"
            value={imagemUrl}
            onChange={(e) => setImagemUrl(e.target.value)}
            placeholder="https://..."
            className="px-3 py-2.5 text-base border border-border rounded-md bg-card-bg"
          />
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

          <div className="flex gap-2 mb-4 flex-wrap">
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

            {(filtroTime || filtroTipo) && (
              <button
                className="px-3 py-2 text-sm bg-text-muted text-white rounded-md cursor-pointer hover:opacity-90"
                onClick={() => {
                  setFiltroTime("");
                  setFiltroTipo("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {produtosFiltrados.map((p) => (
              <div key={p.id} className="flex gap-4 p-3 bg-card-bg rounded-md shadow-card items-start">
                <img
                  className="w-20 h-20 object-cover rounded-md bg-gray-100 flex-shrink-0"
                  src={
                    proxyImageUrl(p.imagem_url) ||
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='10'%3ESem imagem%3C/text%3E%3C/svg%3E"
                  }
                  alt={p.nome}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='10'%3EErro%3C/text%3E%3C/svg%3E";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[0.95rem]">{p.nome}</div>
                  <div className="text-sm text-text-muted mt-1">
                    {p.liga} • {p.time} • {p.tipo} • {p.temporada}
                  </div>
                  {p.yupoo_url && (
                    <a
                      href={p.yupoo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent no-underline inline-block mt-1 hover:underline"
                    >
                      Link Yupoo
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    className="bg-yellow-400 text-text-main px-3 py-1.5 text-sm rounded-md cursor-pointer hover:opacity-90"
                    onClick={() => handleEdit(p)}
                  >
                    Editar
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1.5 text-sm rounded-md cursor-pointer hover:opacity-90"
                    onClick={() => handleRemove(p.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
            {produtosFiltrados.length === 0 && (
              <p className="text-center text-text-muted py-8">
                Nenhum produto encontrado com os filtros selecionados.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
