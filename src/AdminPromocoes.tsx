import { useState, useEffect, useMemo } from "react";
import { updateProduto, parseImageUrls, setPromocaoTime, removePromocaoTime, setDescontoGlobal, removeDescontoGlobal, updateLojaConfig } from "./lib/db";
import type { DbProduto } from "./lib/db";
import type { LojaConfig, PromocaoTipo } from "./types";
import { TIPOS_CATEGORIA, DEFAULT_CONFIG, formatarMoeda, getCachedImageUrl } from "./types";
import { normalizarBusca } from "./lib/utils";
import { isPromotionActive, promotionEndFromDate } from "../server/lib/promotions";

const RECIFE_TIME_ZONE = "America/Recife";

function dateInputFromEndsAt(endsAt?: string | null): string {
  if (!endsAt) return "";
  const timestamp = Date.parse(endsAt);
  if (!Number.isFinite(timestamp)) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RECIFE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp - 1));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year && values.month && values.day
    ? `${values.year.padStart(4, "0")}-${values.month.padStart(2, "0")}-${values.day.padStart(2, "0")}`
    : "";
}

function formatPromoDeadline(endsAt?: string | null): string {
  if (!endsAt) return "Sem prazo";
  const timestamp = Date.parse(endsAt);
  if (!Number.isFinite(timestamp)) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: RECIFE_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp - 1));
}

function getPromotionEnd(date: string): string | null {
  const endsAt = promotionEndFromDate(date);
  if (endsAt !== null) {
    const timestamp = Date.parse(endsAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw new RangeError("A data de validade já passou.");
    }
  }
  return endsAt;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro ao converter a data de validade.";
}

interface AdminPromocoesProps {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
  config: LojaConfig;
  setConfig: React.Dispatch<React.SetStateAction<LojaConfig>>;
}

export default function AdminPromocoes({ produtos, setProdutos, config, setConfig }: AdminPromocoesProps) {
  const [precosBase, setPrecosBase] = useState<Record<string, string>>({});
  const [precosPromo, setPrecosPromo] = useState<Record<string, string>>({});
  const [anoTemporadaLancamento, setAnoTemporadaLancamento] = useState("");
  const [descontosTemporadaAnterior, setDescontosTemporadaAnterior] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Product-specific promo state
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [savingProduto, setSavingProduto] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editNovoPreco, setEditNovoPreco] = useState("");

  // Filter state
  const [promoFilter, setPromoFilter] = useState<"ativas" | "todas" | "inativas">("ativas");

  // Team promo state
  const [teamSearch, setTeamSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teamPromoTipo, setTeamPromoTipo] = useState("");
  const [teamPromoValor, setTeamPromoValor] = useState("");
  const [teamPromoPreco, setTeamPromoPreco] = useState("");
  const [teamPromoEndsAt, setTeamPromoEndsAt] = useState("");
  const [teamPromoName, setTeamPromoName] = useState("");
  const [teamSubstituirNome, setTeamSubstituirNome] = useState(true);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamError, setTeamError] = useState("");
  const [teamListSearch, setTeamListSearch] = useState("");
  const [teamListLimit, setTeamListLimit] = useState(6);

  // Site-wide promo state
  const [sitewidePct, setSitewidePct] = useState("");
  const [sitewideEndDate, setSitewideEndDate] = useState(() => dateInputFromEndsAt(config.desconto_global_ends_at));
  const [sitewideName, setSitewideName] = useState(config.desconto_global_nome ?? "");
  const [savingSitewide, setSavingSitewide] = useState(false);
  const [globalMessage, setGlobalMessage] = useState("");
  const [globalError, setGlobalError] = useState("");

  // PE markup state
  const [peMarkupValue, setPeMarkupValue] = useState("");
  const [savingPe, setSavingPe] = useState(false);

  // Custo base state
  const [custoBase, setCustoBase] = useState<Record<string, string>>({});
  const [personalizacaoCusto, setPersonalizacaoCusto] = useState<Record<string, string>>({});
  const [savingCusto, setSavingCusto] = useState(false);

  useEffect(() => {
    const pb: Record<string, string> = {};
    const pp: Record<string, string> = {};
    for (const tipo of TIPOS_CATEGORIA) {
      pb[tipo] = String(config.precos_base[tipo] ?? DEFAULT_CONFIG.precos_base[tipo]);
      pp[tipo] = String(config.precos_promocao[tipo] ?? DEFAULT_CONFIG.precos_promocao[tipo]);
    }
    setPrecosBase(pb);
    setPrecosPromo(pp);
    setAnoTemporadaLancamento(String(config.ano_temporada_lancamento ?? DEFAULT_CONFIG.ano_temporada_lancamento));
    const da: Record<string, string> = {};
    for (const tipo of TIPOS_CATEGORIA) {
      da[tipo] = String(config.desconto_temporada_anterior?.[tipo] ?? DEFAULT_CONFIG.desconto_temporada_anterior[tipo] ?? 0);
    }
    setDescontosTemporadaAnterior(da);
    setPeMarkupValue(String(config.pronta_entrega_markup));
    const cb: Record<string, string> = {};
    for (const tipo of TIPOS_CATEGORIA) {
      cb[tipo] = String(config.custo_base[tipo] ?? 0);
    }
    setCustoBase(cb);
    const pc: Record<string, string> = {};
    for (const tipo of Object.keys(config.personalizacao_custo)) {
      pc[tipo] = String(config.personalizacao_custo[tipo]);
    }
    setPersonalizacaoCusto(pc);
    setSitewideEndDate(dateInputFromEndsAt(config.desconto_global_ends_at));
    setSitewideName(config.desconto_global_nome ?? "");
  }, [config]);

  function selectTeam(time: string) {
    const promo = config.promocoes_time?.[time];
    setSelectedTeam(time);
    setTeamSearch(time);
    setTeamPromoTipo(promo?.tipo ?? "");
    setTeamPromoValor(promo?.valor != null ? String(promo.valor) : "");
    setTeamPromoPreco(promo?.preco != null ? String(promo.preco) : "");
    setTeamPromoEndsAt(dateInputFromEndsAt(promo?.ends_at));
    setTeamPromoName(promo?.nome ?? "");
    setTeamSubstituirNome(promo?.substituir_nome_time !== false);
    setTeamError("");
  }

  async function handleApplyTeamPromo() {
    let endsAt: string | null;
    let valor: number | null = null;
    let preco: number | null = null;
    try {
      endsAt = getPromotionEnd(teamPromoEndsAt);
      if (!teamPromoTipo) throw new RangeError("Selecione o tipo de promoção.");
      if (teamPromoTipo === "porcentagem") {
        valor = parseFloat(teamPromoValor);
        if (!Number.isFinite(valor) || valor < 1 || valor > 99) {
          throw new RangeError("O desconto deve ser entre 1% e 99%.");
        }
      } else if (teamPromoTipo === "novo_preco") {
        preco = parseFloat(teamPromoPreco);
        if (!Number.isFinite(preco) || preco <= 0) {
          throw new RangeError("O novo preço deve ser maior que zero.");
        }
      } else {
        throw new RangeError("Tipo de promoção inválido.");
      }
    } catch (err) {
      setTeamError(getErrorMessage(err));
      return;
    }

    setTeamError("");
    setSavingTeam(true);
    try {
      const nome = teamPromoName.trim() || null;
      await setPromocaoTime(selectedTeam, teamPromoTipo, valor, preco, endsAt, teamPromoName, teamSubstituirNome);
      setConfig((prev) => ({
        ...prev,
        promocoes_time: {
          ...(prev.promocoes_time ?? {}),
          [selectedTeam]: { tipo: teamPromoTipo, valor, preco, ends_at: endsAt, nome, substituir_nome_time: teamSubstituirNome },
        },
      }));
      setTeamPromoName(nome ?? "");
      setTeamMessage(`Promoção aplicada a ${selectedTeam}!`);
      setTimeout(() => setTeamMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao aplicar promoção por time:", err);
      setTeamError("Erro ao aplicar promoção.");
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleSaveTeamValidity() {
    const promo = config.promocoes_time?.[selectedTeam];
    if (!promo) return;

    let endsAt: string | null;
    try {
      endsAt = getPromotionEnd(teamPromoEndsAt);
    } catch (err) {
      setTeamError(getErrorMessage(err));
      return;
    }

    setTeamError("");
    setSavingTeam(true);
    try {
      const nome = teamPromoName.trim() || null;
      await setPromocaoTime(selectedTeam, promo.tipo, promo.valor, promo.preco, endsAt, teamPromoName, teamSubstituirNome);
      setConfig((prev) => ({
        ...prev,
        promocoes_time: {
          ...(prev.promocoes_time ?? {}),
          [selectedTeam]: { ...promo, ends_at: endsAt, nome, substituir_nome_time: teamSubstituirNome },
        },
      }));
      setTeamPromoTipo(promo.tipo);
      setTeamPromoValor(promo.valor != null ? String(promo.valor) : "");
      setTeamPromoPreco(promo.preco != null ? String(promo.preco) : "");
      setTeamPromoEndsAt(dateInputFromEndsAt(endsAt));
      setTeamPromoName(nome ?? "");
      setTeamMessage(`Nome e validade da promoção de ${selectedTeam} salvos.`);
      setTimeout(() => setTeamMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao salvar validade da promoção por time:", err);
      setTeamError("Erro ao salvar validade da promoção.");
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleRemoveTeamPromo(time: string) {
    setTeamError("");
    setSavingTeam(true);
    try {
      await removePromocaoTime(time);
      setConfig((prev) => {
        const promocoes = { ...(prev.promocoes_time ?? {}) };
        delete promocoes[time];
        return { ...prev, promocoes_time: promocoes };
      });
      if (time === selectedTeam) {
        setTeamPromoTipo("");
        setTeamPromoValor("");
        setTeamPromoPreco("");
        setTeamPromoEndsAt("");
        setTeamPromoName("");
        setTeamSubstituirNome(true);
      }
      setTeamMessage(`Promoção removida de ${time}.`);
      setTimeout(() => setTeamMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao remover promoção por time:", err);
      setTeamError("Erro ao remover promoção.");
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleApplySitewide() {
    let pct: number;
    let endsAt: string | null;
    try {
      pct = parseFloat(sitewidePct);
      if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
        throw new RangeError("Desconto deve ser entre 1% e 99%.");
      }
      endsAt = getPromotionEnd(sitewideEndDate);
    } catch (err) {
      setGlobalError(getErrorMessage(err));
      return;
    }

    setGlobalError("");
    setSavingSitewide(true);
    try {
      const nome = sitewideName.trim() || null;
      await setDescontoGlobal(pct, endsAt, sitewideName);
      setConfig((prev) => ({ ...prev, desconto_global: pct, desconto_global_ends_at: endsAt, desconto_global_nome: nome }));
      setSitewideName(nome ?? "");
      setGlobalMessage(`Desconto de ${pct}% aplicado a todos os produtos!`);
      setSitewidePct("");
      setTimeout(() => setGlobalMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao aplicar desconto site-wide:", err);
      setGlobalError("Erro ao aplicar desconto.");
    } finally {
      setSavingSitewide(false);
    }
  }

  async function handleSaveGlobalValidity() {
    const pct = config.desconto_global;
    if (pct == null) return;

    let endsAt: string | null;
    try {
      if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
        throw new RangeError("O desconto salvo deve ser entre 1% e 99%.");
      }
      endsAt = getPromotionEnd(sitewideEndDate);
    } catch (err) {
      setGlobalError(getErrorMessage(err));
      return;
    }

    setGlobalError("");
    setSavingSitewide(true);
    try {
      const nome = sitewideName.trim() || null;
      await setDescontoGlobal(pct, endsAt, sitewideName);
      setConfig((prev) => ({ ...prev, desconto_global_ends_at: endsAt, desconto_global_nome: nome }));
      setSitewideName(nome ?? "");
      setGlobalMessage("Nome e validade do desconto site-wide salvos.");
      setTimeout(() => setGlobalMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao salvar validade do desconto site-wide:", err);
      setGlobalError("Erro ao salvar validade do desconto.");
    } finally {
      setSavingSitewide(false);
    }
  }

  async function handleRemoveSitewide() {
    setGlobalError("");
    setSavingSitewide(true);
    try {
      await removeDescontoGlobal();
      setConfig((prev) => ({ ...prev, desconto_global: null, desconto_global_ends_at: null, desconto_global_nome: null }));
      setSitewideEndDate("");
      setSitewideName("");
      setGlobalMessage("Desconto site-wide removido.");
      setTimeout(() => setGlobalMessage(""), 4000);
    } catch (err) {
      console.error("Erro ao remover desconto site-wide:", err);
      setGlobalError("Erro ao remover desconto.");
    } finally {
      setSavingSitewide(false);
    }
  }

  async function handleTogglePromo(tipo: string, ativa: boolean) {
    try {
      const newAtiva = { ...config.promocao_ativa, [tipo]: ativa };
      await updateLojaConfig("promocao_ativa", newAtiva);
      setConfig((prev) => ({ ...prev, promocao_ativa: newAtiva }));
      setMessage(`${ativa ? "Promoção ativada" : "Promoção desativada"} para ${tipo}`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle promoção:", err);
    }
  }

  async function handleToggleAll(ativa: boolean) {
    try {
      const newAtiva: Record<string, boolean> = {};
      for (const tipo of TIPOS_CATEGORIA) {
        newAtiva[tipo] = ativa;
      }
      await updateLojaConfig("promocao_ativa", newAtiva);
      setConfig((prev) => ({ ...prev, promocao_ativa: newAtiva }));
      setMessage(ativa ? "Todas as promoções ativadas" : "Todas as promoções desativadas");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle todas:", err);
      setMessage("Erro ao atualizar promoções. Tente uma por uma.");
      setTimeout(() => setMessage(""), 4000);
    }
  }

  async function handleSavePrecos() {
    setSaving(true);
    try {
      const ano = Number(anoTemporadaLancamento);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        setMessage("Erro: o ano inicial da temporada de lançamento deve ser um inteiro entre 2000 e 2100.");
        return;
      }

      const newBase: Record<string, number> = {
        ...DEFAULT_CONFIG.precos_base,
        ...config.precos_base,
      };
      const newPromo: Record<string, number> = {
        ...DEFAULT_CONFIG.precos_promocao,
        ...config.precos_promocao,
      };
      for (const tipo of TIPOS_CATEGORIA) {
        newBase[tipo] = parseFloat(precosBase[tipo]) || DEFAULT_CONFIG.precos_base[tipo];
        newPromo[tipo] = parseFloat(precosPromo[tipo]) || DEFAULT_CONFIG.precos_promocao[tipo];
      }

      const newDescontos = {
        ...DEFAULT_CONFIG.desconto_temporada_anterior,
        ...(config.desconto_temporada_anterior ?? {}),
      };
      for (const tipo of TIPOS_CATEGORIA) {
        if (tipo.includes("Retrô")) continue;
        const valor = descontosTemporadaAnterior[tipo]?.trim() ?? "";
        const desconto = Number(valor);
        if (valor === "" || !Number.isFinite(desconto) || desconto < 0 || desconto >= 100) {
          setMessage(`Erro: o desconto da categoria ${tipo} deve ser um número entre 0 e menor que 100.`);
          return;
        }
        newDescontos[tipo] = desconto;
      }

      await Promise.all([
        updateLojaConfig("precos_base", newBase),
        updateLojaConfig("precos_promocao", newPromo),
        updateLojaConfig("ano_temporada_lancamento", ano),
        updateLojaConfig("desconto_temporada_anterior", newDescontos),
      ]);
      setConfig((prev) => ({
        ...prev,
        precos_base: newBase,
        precos_promocao: newPromo,
        ano_temporada_lancamento: ano,
        desconto_temporada_anterior: newDescontos,
      }));
      setMessage("Preços salvos com sucesso!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao salvar preços:", err);
      setMessage("Erro ao salvar preços.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetProductPromo(
    id: string,
    promocao: boolean,
    promocao_tipo: string | null,
    promocao_valor: number | null,
    preco_customizado: number | null
  ) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, {
        promocao,
        promocao_tipo,
        promocao_valor,
        preco_customizado: preco_customizado,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage("Promoção do produto atualizada!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao atualizar promoção do produto:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  async function handleRemoveProductPromo(id: string) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, {
        promocao: false,
        promocao_tipo: null,
        promocao_valor: null,
        preco_customizado: null,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage("Promoção removida do produto.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao remover promoção:", err);
    } finally {
      setSavingProduto(null);
    }
  }

  async function handleToggleProductPromo(id: string, ativa: boolean) {
    setSavingProduto(id);
    try {
      const updated = await updateProduto(id, { promocao: ativa });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setMessage(ativa ? "Promoção ativada!" : "Promoção desativada");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao toggle promoção do produto:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  function handleStartEdit(p: DbProduto) {
    setEditingId(p.id);
    setEditTipo(p.promocao_tipo ?? "");
    setEditValor(p.promocao_valor != null ? String(p.promocao_valor) : "");
    setEditNovoPreco(p.preco_customizado != null ? String(p.preco_customizado) : "");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditTipo("");
    setEditValor("");
    setEditNovoPreco("");
  }

  async function handleEditProductPromo(id: string) {
    setSavingProduto(id);
    try {
      const promocaoTipo = (editTipo || null) as PromocaoTipo;
      let promocaoValor: number | null = null;
      let precoCustomizado: number | null = null;

      if (editTipo === "porcentagem") {
        promocaoValor = parseFloat(editValor) || null;
      } else if (editTipo === "novo_preco") {
        precoCustomizado = parseFloat(editNovoPreco) || null;
      }

      const updated = await updateProduto(id, {
        promocao_tipo: promocaoTipo,
        promocao_valor: promocaoValor,
        preco_customizado: precoCustomizado,
      });
      setProdutos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
      setMessage("Promoção atualizada!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Erro ao editar promoção:", err);
      setMessage("Erro ao atualizar promoção.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingProduto(null);
    }
  }

  const allActive = TIPOS_CATEGORIA.every((t) => config.promocao_ativa[t]);

  // Products with individual promo config (promocao_tipo !== null)
  const produtosComPromocao = useMemo(
    () => produtos.filter((p) => p.promocao_tipo !== null),
    [produtos]
  );

  // Filtered view
  const produtosFiltrados = useMemo(() => {
    switch (promoFilter) {
      case "ativas":
        return produtosComPromocao.filter((p) => p.promocao);
      case "inativas":
        return produtosComPromocao.filter((p) => !p.promocao);
      case "todas":
        return produtosComPromocao;
    }
  }, [produtosComPromocao, promoFilter]);

  // Stats
  const promosAtivasCategoria = TIPOS_CATEGORIA.filter((t) => config.promocao_ativa[t]).length;
  const promosAtivasProduto = produtosComPromocao.filter((p) => p.promocao).length;

  const resultadosBusca = useMemo(() => {
    const words = normalizarBusca(busca).split(" ").filter(Boolean);
    return produtos.filter((p) => {
      if (p.promocao_tipo) return false;
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (words.length > 0) {
        const campos = normalizarBusca([p.nome, p.time, p.tipo, p.temporada].join(" "));
        if (!words.every((w) => campos.includes(w))) return false;
      }
      return true;
    }).slice(0, 20);
  }, [produtos, busca, filtroTipo]);

  function getPromoLabel(p: DbProduto): string {
    if (p.promocao_tipo === "porcentagem") return `${p.promocao_valor}% OFF`;
    if (p.promocao_tipo === "novo_preco") return `Por ${formatarMoeda(p.preco_customizado ?? 0)}`;
    if (p.promocao_tipo === "leve_pague") return "Leve 1 Pague 2";
    if (p.promocao_tipo === "leve_3_pague_2") return "Leve 3 Pague 2";
    return p.promocao_tipo ?? "";
  }

  return (
    <div className="pb-16">
      <h3 className="text-xl mb-4 text-primary">Promoções & Preços</h3>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
          {message}
        </div>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-center">
          <div className="text-2xl font-bold text-accent">{promosAtivasCategoria}</div>
          <div className="text-xs text-text-muted mt-0.5">Categorias em promoção</div>
        </div>
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-center">
          <div className="text-2xl font-bold text-accent">{promosAtivasProduto}</div>
          <div className="text-xs text-text-muted mt-0.5">Produtos em promoção</div>
        </div>
      </div>

      {/* Toggle all */}
      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors ${
            allActive
              ? "bg-accent text-white"
              : "bg-green-500 text-white hover:opacity-90"
          }`}
          onClick={() => handleToggleAll(true)}
          disabled={allActive}
        >
          Ativar Todas
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors ${
            !TIPOS_CATEGORIA.some((t) => config.promocao_ativa[t])
              ? "bg-accent text-white"
              : "bg-red-500 text-white hover:opacity-90"
          }`}
          onClick={() => handleToggleAll(false)}
          disabled={!TIPOS_CATEGORIA.some((t) => config.promocao_ativa[t])}
        >
          Desativar Todas
        </button>
      </div>

      {/* Category cards */}
      <div className="flex flex-col gap-4 mb-8">
        {TIPOS_CATEGORIA.map((tipo) => {
          const ativa = config.promocao_ativa[tipo] ?? false;
          const basePrice = config.precos_base[tipo] ?? DEFAULT_CONFIG.precos_base[tipo];
          const promoPrice = config.precos_promocao[tipo] ?? DEFAULT_CONFIG.precos_promocao[tipo];
          const count = produtos.filter((p) => p.tipo === tipo).length;

          return (
            <div
              key={tipo}
              className={`p-4 rounded-lg border-2 transition-colors ${
                ativa ? "border-accent bg-accent/5" : "border-border bg-card-bg"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-bold text-base text-primary">{tipo}</h4>
                  <span className="text-xs text-text-muted">{count} produtos</span>
                </div>
                <button
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                    ativa ? "bg-accent" : "bg-gray-300"
                  }`}
                  onClick={() => handleTogglePromo(tipo, !ativa)}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      ativa ? "left-[26px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Preço Base
                  </label>
                  <div className="px-3 py-2 bg-bg-base rounded-md text-sm font-medium">
                    {formatarMoeda(basePrice)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Preço Promoção
                  </label>
                  <div className="px-3 py-2 bg-bg-base rounded-md text-sm font-medium">
                    {formatarMoeda(promoPrice)}
                  </div>
                </div>
              </div>

              {ativa && (
                <div className="mt-2 text-xs text-accent font-semibold">
                  Economia de {formatarMoeda(basePrice - promoPrice)} por unidade
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit prices */}
      <div className="border-t border-border pt-6 mb-10">
        <h4 className="text-lg font-bold text-primary mb-4">Editar Preços</h4>
        <p className="text-sm text-text-muted mb-4">
          O preço base é o preço de lançamento; temporadas com primeiro ano menor recebem desconto. Retrô não participa.
        </p>
        <div className="mb-4 max-w-full sm:max-w-xs">
          <label className="block text-xs font-semibold text-text-muted mb-1">Ano inicial da temporada de lançamento</label>
          <input
            type="number"
            min="2000"
            max="2100"
            step="1"
            value={anoTemporadaLancamento}
            onChange={(e) => setAnoTemporadaLancamento(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          />
        </div>
        <div className="flex flex-col gap-4">
          {TIPOS_CATEGORIA.map((tipo) => (
            <div key={tipo} className="grid grid-cols-1 gap-3 items-center sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))]">
              <span className="font-semibold text-sm">{tipo}</span>
              <div>
                <label className="block text-[10px] text-text-muted mb-0.5">Preço Base (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precosBase[tipo] ?? ""}
                  onChange={(e) => setPrecosBase((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-0.5">Preço Promoção (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precosPromo[tipo] ?? ""}
                  onChange={(e) => setPrecosPromo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-0.5">Desconto temporadas anteriores (%)</label>
                {tipo.includes("Retrô") ? (
                  <div className="px-3 py-2 bg-bg-base rounded-md text-sm font-medium text-text-muted">Não se aplica</div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    max="99.999"
                    step="0.001"
                    value={descontosTemporadaAnterior[tipo] ?? ""}
                    onChange={(e) => setDescontosTemporadaAnterior((prev) => ({ ...prev, [tipo]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          className="mt-4 w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSavePrecos}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar Preços"}
        </button>
      </div>

      {/* ── Site-wide promotion ── */}
      <div className="border-t border-border pt-6 mb-8">
        <h4 className="text-lg font-bold text-primary mb-2">🌐 Promoção Site-wide</h4>
        <p className="text-sm text-text-muted mb-4">
          Aplica um desconto percentual em <strong>todos</strong> os produtos. Não sobrescreve promoções individuais ou por time.
          {config.desconto_global != null && (
            <span className={`block mt-1 font-semibold ${isPromotionActive(config.desconto_global_ends_at) ? "text-accent" : "text-text-muted"}`}>
              Cadastrado: {config.desconto_global_nome ? `${config.desconto_global_nome} — ` : ""}{config.desconto_global}% OFF ({isPromotionActive(config.desconto_global_ends_at) ? "ativa" : "Encerrada"})
            </span>
          )}
        </p>
        {globalMessage && (
          <div className="mb-3 px-3 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
            {globalMessage}
          </div>
        )}
        {globalError && (
          <div role="alert" className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded-md text-sm font-medium">
            {globalError}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Nome da campanha (opcional)</label>
            <input
              type="text"
              maxLength={100}
              value={sitewideName}
              onChange={(e) => { setSitewideName(e.target.value); setGlobalError(""); }}
              placeholder="Ex.: Santa subiu, preço caiu"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-text-muted mb-1">Desconto (%)</label>
              <input
                type="number"
                min="1"
                max="99"
                value={sitewidePct}
                onChange={(e) => setSitewidePct(e.target.value)}
                placeholder="Ex: 15"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
              />
            </div>
            <button
              className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={savingSitewide || !sitewidePct}
              onClick={handleApplySitewide}
            >
              {savingSitewide ? "Aplicando..." : "Aplicar a Todos"}
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={savingSitewide}
              onClick={handleRemoveSitewide}
            >
              Remover Todas
            </button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Válida até (inclusive)</label>
            <input
              type="date"
              value={sitewideEndDate}
              onChange={(e) => { setSitewideEndDate(e.target.value); setGlobalError(""); }}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
            />
            <p className="mt-1 text-xs text-text-muted">Opcional. Até 23:59 no horário de Pernambuco.</p>
          </div>
          {config.desconto_global != null && (
            <button
              className="w-full py-2 text-sm font-semibold bg-blue-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={savingSitewide}
              onClick={handleSaveGlobalValidity}
            >
              {savingSitewide ? "Salvando..." : "Salvar nome e validade"}
            </button>
          )}
        </div>
      </div>

      {/* ── Pronta Entrega markup ── */}
      <div className="border-t border-border pt-6 mb-8">
        <h4 className="text-lg font-bold text-primary mb-2">📦 Taxa Pronta Entrega</h4>
        <p className="text-sm text-text-muted mb-4">
          Valor fixo adicionado ao preço de produtos de Pronta Entrega. Atualmente: <strong className="text-green-600">R$ {config.pronta_entrega_markup.toFixed(2)}</strong>
        </p>
        <div className="flex gap-2 items-end">
          <div className="w-32">
            <label className="block text-xs font-semibold text-text-muted mb-1">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={peMarkupValue}
              onChange={(e) => setPeMarkupValue(e.target.value)}
              placeholder="20"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
            />
          </div>
          <button
            className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
            disabled={savingPe || !peMarkupValue}
            onClick={async () => {
              setSavingPe(true);
              try {
                const val = parseFloat(peMarkupValue);
                if (isNaN(val) || val < 0) return;
                await updateLojaConfig("pronta_entrega_markup", val);
                setConfig(prev => ({ ...prev, pronta_entrega_markup: val }));
                setMessage(`Taxa de Pronta Entrega alterada para R$ ${val.toFixed(2)}`);
              } catch (err) {
                console.error("Erro ao salvar taxa PE:", err);
                setMessage("Erro ao salvar taxa.");
              } finally {
                setSavingPe(false);
                setTimeout(() => setMessage(""), 4000);
              }
            }}
          >
            {savingPe ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {/* ── Custo base por categoria ── */}
      <div className="border-t border-border pt-6 mb-8">
        <h4 className="text-lg font-bold text-primary mb-2">💰 Custo Base por Categoria (USD)</h4>
        <p className="text-sm text-text-muted mb-4">
          Custo de cada camisa em dólar. Usado para calcular automaticamente o custo total nos pacotes.
        </p>
        <div className="flex flex-col gap-3 mb-4">
          {TIPOS_CATEGORIA.map((tipo) => (
            <div key={tipo} className="grid grid-cols-[1fr_120px] gap-3 items-center">
              <span className="text-sm font-medium">{tipo}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={custoBase[tipo] ?? ""}
                  onChange={(e) => setCustoBase((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-4 mb-4">
          <h5 className="text-sm font-semibold text-text-muted mb-3">Custo de Personalização (USD)</h5>
          <div className="flex flex-col gap-3">
            {Object.entries(personalizacaoCusto).map(([tipo, val]) => (
              <div key={tipo} className="grid grid-cols-[1fr_120px] gap-3 items-center">
                <span className="text-sm font-medium">{tipo}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={val}
                    onChange={(e) => setPersonalizacaoCusto((prev) => ({ ...prev, [tipo]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={savingCusto}
          onClick={async () => {
            setSavingCusto(true);
            try {
              const newBase: Record<string, number> = {};
              for (const tipo of TIPOS_CATEGORIA) {
                newBase[tipo] = parseFloat(custoBase[tipo]) || 0;
              }
              await updateLojaConfig("custo_base", newBase);
              setConfig((prev) => ({ ...prev, custo_base: newBase }));
              const newPers: Record<string, number> = {};
              for (const [tipo, val] of Object.entries(personalizacaoCusto)) {
                newPers[tipo] = parseFloat(val) || 0;
              }
              await updateLojaConfig("personalizacao_custo", newPers);
              setConfig((prev) => ({ ...prev, personalizacao_custo: newPers }));
            } catch (err) {
              console.error("Erro ao salvar custo base:", err);
            } finally {
              setSavingCusto(false);
            }
          }}
        >
          {savingCusto ? "Salvando..." : "Salvar Custos Base"}
        </button>
      </div>

      {/* ── Team promotion ── */}
      <div className="border-t border-border pt-6 mb-8">
        <h4 className="text-lg font-bold text-primary mb-2">⚽ Promoção por Time</h4>
        <p className="text-sm text-text-muted mb-4">
          Aplica ou remove promoção de todos os produtos de um time. Não sobrescreve promoções individuais de produtos.
        </p>

        {teamMessage && (
          <div className="mb-3 px-3 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
            {teamMessage}
          </div>
        )}
        {teamError && (
          <div role="alert" className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded-md text-sm font-medium">
            {teamError}
          </div>
        )}

        {/* Team promos list — from config */}
        {(() => {
          const teamPromos = config.promocoes_time ?? {};
          let entries = Object.entries(teamPromos).sort((a, b) => a[0].localeCompare(b[0]));
          const totalTeams = entries.length;

          if (teamListSearch) {
            const words = normalizarBusca(teamListSearch).split(" ").filter(Boolean);
            entries = entries.filter(([time]) => {
              const normalized = normalizarBusca(time);
              return words.every(w => normalized.includes(w));
            });
          }

          const filteredCount = entries.length;
          const visible = entries.slice(0, teamListLimit);
          const hasMore = filteredCount > teamListLimit;

          return totalTeams > 0 ? (
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wide">Promoções por time (ativas e encerradas) ({totalTeams})</h5>
              {totalTeams > 6 && (
                <input
                  type="text"
                  value={teamListSearch}
                  onChange={(e) => { setTeamListSearch(e.target.value); setTeamListLimit(6); }}
                  placeholder="Filtrar times..."
                  className="w-full px-3 py-1.5 mb-2 text-sm border border-border rounded-md bg-card-bg"
                />
              )}
              <div className="flex flex-col gap-1">
                {visible.map(([time, info]) => {
                  const label = info.tipo === "porcentagem" ? `${info.valor}% OFF`
                    : info.tipo === "novo_preco" ? `R$ ${info.preco}`
                    : info.tipo;
                  const ativa = isPromotionActive(info.ends_at);
                  const count = produtos.filter(p => p.time === time).length;
                  return (
                    <div key={time} className={`flex items-center justify-between px-3 py-2 border rounded-md ${ativa ? "bg-accent/5 border-accent/20" : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          className="text-sm font-medium truncate text-left hover:text-accent cursor-pointer"
                           onClick={() => selectTeam(time)}
                         >
                           {time}
                         </button>
                         {typeof info.nome === "string" && info.nome.trim() && (
                           <div className="text-xs font-bold text-primary mt-0.5">{info.nome.trim()}</div>
                         )}
                         <span className={`text-xs ml-2 font-semibold ${ativa ? "text-accent" : "text-text-muted"}`}>{label}</span>
                        <span className="text-xs text-text-muted ml-1">({count})</span>
                        <div className="text-xs text-text-muted mt-0.5">
                          <span className={ativa ? "text-accent font-semibold" : "font-semibold"}>{ativa ? "Ativa" : "Encerrada"}</span>
                          <span className="ml-2">{info.ends_at ? `Até ${formatPromoDeadline(info.ends_at)}` : "Sem prazo"}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1 text-xs font-semibold bg-red-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
                        disabled={savingTeam}
                        onClick={() => handleRemoveTeamPromo(time)}
                      >
                        Remover
                      </button>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <button
                  className="w-full mt-2 py-2 text-xs font-semibold text-accent bg-accent/5 border border-accent/20 rounded-md cursor-pointer hover:bg-accent/10 transition-colors"
                  onClick={() => setTeamListLimit(prev => prev + 12)}
                >
                  Mostrar mais ({filteredCount - teamListLimit} restantes)
                </button>
              )}
            </div>
          ) : null;
        })()}

        {/* Apply new team promo */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Buscar time para aplicar/remover promoção</label>
            <input
              type="text"
              value={teamSearch}
              onChange={(e) => {
                setTeamSearch(e.target.value);
                setSelectedTeam("");
                setTeamPromoTipo("");
                 setTeamPromoValor("");
                 setTeamPromoPreco("");
                 setTeamPromoEndsAt("");
                 setTeamPromoName("");
                 setTeamSubstituirNome(true);
                 setTeamError("");
              }}
              placeholder="Buscar time..."
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
            />
            {teamSearch && !selectedTeam && (() => {
              const words = normalizarBusca(teamSearch).split(" ").filter(Boolean);
              const teams = [...new Set(produtos.map(p => p.time))]
                .filter(t => {
                  const normalized = normalizarBusca(t);
                  return words.every(w => normalized.includes(w));
                })
                .sort()
                .slice(0, 10);
              return teams.length > 0 ? (
                <div className="mt-1 border border-border rounded-md bg-card-bg max-h-40 overflow-y-auto">
                  {teams.map(t => {
                    const teamProducts = produtos.filter(p => p.time === t);
                    const promoCount = teamProducts.filter(p => p.promocao).length;
                    return (
                      <button
                        type="button"
                        key={t}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10 cursor-pointer transition-colors border-none bg-transparent"
                        onClick={() => selectTeam(t)}
                      >
                        {t} <span className="text-text-muted">({teamProducts.length} produtos{promoCount > 0 ? `, ${promoCount} em promo` : ""})</span>
                      </button>
                    );
                  })}
                </div>
              ) : null;
            })()}
          </div>

          {selectedTeam && (() => {
            const teamProducts = produtos.filter(p => p.time === selectedTeam);
            const teamPromo = config.promocoes_time?.[selectedTeam];
            const teamPromoAtiva = teamPromo ? isPromotionActive(teamPromo.ends_at) : false;
            return (
              <>
                <div className="p-3 bg-bg-base rounded-md border border-border">
                  <div className="text-sm font-medium text-primary">
                    {selectedTeam} — {teamProducts.length} produtos
                    {teamPromo && (
                      <span className={`ml-2 ${teamPromoAtiva ? "text-accent" : "text-text-muted"}`}>
                        ({teamPromoAtiva ? "promoção ativa" : "promoção encerrada"})
                      </span>
                    )}
                  </div>
                </div>

                {/* Remove button — visible while the record exists, including expired promos */}
                {teamPromo && (
                  <button
                    type="button"
                    className="w-full py-2.5 text-sm font-semibold bg-red-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                    disabled={savingTeam}
                    onClick={() => handleRemoveTeamPromo(selectedTeam)}
                  >
                    {savingTeam ? "Removendo..." : `Remover promoção de ${selectedTeam}`}
                  </button>
                )}

                 {/* Apply section */}
                 <div className="border-t border-border pt-3">
                   <div className="text-xs font-semibold text-text-muted mb-2">Aplicar nova promoção</div>
                   <div className="mb-2">
                     <label className="block text-xs font-semibold text-text-muted mb-1">Nome da campanha (opcional)</label>
                      <input
                        type="text"
                        maxLength={100}
                       value={teamPromoName}
                       onChange={(e) => { setTeamPromoName(e.target.value); setTeamError(""); }}
                        placeholder="Ex.: Santa subiu, preço caiu"
                        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                      />
                      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-text-muted">
                        <input
                          type="checkbox"
                          checked={teamSubstituirNome}
                          onChange={(e) => setTeamSubstituirNome(e.target.checked)}
                        />
                        Substituir nome do time pelo nome da campanha
                      </label>
                      <p className="mt-1 text-xs text-text-muted">Se não houver nome de campanha, o nome do time será exibido.</p>
                    </div>
                   <div className="mb-2">
                    <label className="block text-xs font-semibold text-text-muted mb-1">Válida até (inclusive)</label>
                    <input
                      type="date"
                      value={teamPromoEndsAt}
                      onChange={(e) => { setTeamPromoEndsAt(e.target.value); setTeamError(""); }}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                    <p className="mt-1 text-xs text-text-muted">Opcional. Até 23:59 no horário de Pernambuco.</p>
                  </div>
                  {teamPromo && (
                    <button
                      type="button"
                      className="w-full mb-2 py-2 text-sm font-semibold bg-blue-500 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                      disabled={savingTeam}
                      onClick={handleSaveTeamValidity}
                    >
                       {savingTeam ? "Salvando..." : "Salvar nome e validade"}
                    </button>
                  )}
                  <select
                    value={teamPromoTipo}
                    onChange={(e) => { setTeamPromoTipo(e.target.value); setTeamPromoValor(""); setTeamPromoPreco(""); setTeamError(""); }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                  >
                    <option value="">Tipo de promoção</option>
                    <option value="porcentagem">Desconto por %</option>
                    <option value="novo_preco">Novo preço fixo</option>
                  </select>

                  {teamPromoTipo === "porcentagem" && (
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={teamPromoValor}
                      onChange={(e) => { setTeamPromoValor(e.target.value); setTeamError(""); }}
                      placeholder="Desconto em % (ex: 20)"
                      className="w-full mt-2 px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  )}

                  {teamPromoTipo === "novo_preco" && (
                    <input
                      type="number"
                      step="0.01"
                      value={teamPromoPreco}
                      onChange={(e) => { setTeamPromoPreco(e.target.value); setTeamError(""); }}
                      placeholder="Novo preço (ex: 99.90)"
                      className="w-full mt-2 px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  )}

                  {teamPromoTipo && (
                    <button
                      type="button"
                      className="w-full mt-2 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                      disabled={savingTeam || (teamPromoTipo === "porcentagem" && !teamPromoValor) || (teamPromoTipo === "novo_preco" && !teamPromoPreco)}
                      onClick={handleApplyTeamPromo}
                    >
                      {savingTeam ? "Aplicando..." : "Aplicar ao Time"}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Product-specific promotions ── */}
      <div className="border-t border-border pt-6">
        <h4 className="text-lg font-bold text-primary mb-2">Promoção por Produto</h4>
        <p className="text-sm text-text-muted mb-4">
          Gerencie promoções individuais: ative, desative, edite ou remova. Tem prioridade sobre promoções de time, categoria e site-wide.
        </p>

        {/* Current product promos */}
        {produtosComPromocao.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-semibold text-text-muted">
                Promoções individuais ({produtosComPromocao.length})
              </h5>
              <div className="flex gap-1 bg-bg-base rounded-md p-0.5">
                {(["ativas", "todas", "inativas"] as const).map((f) => (
                  <button
                    key={f}
                    className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                      promoFilter === f
                        ? "bg-accent text-white"
                        : "text-text-muted hover:text-primary"
                    }`}
                    onClick={() => setPromoFilter(f)}
                  >
                    {f === "ativas" ? "Ativas" : f === "todas" ? "Todas" : "Inativas"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {produtosFiltrados.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">
                  {promoFilter === "ativas" ? "Nenhuma promoção ativa." : promoFilter === "inativas" ? "Nenhuma promoção inativa." : "Nenhuma promoção cadastrada."}
                </p>
              ) : (
                produtosFiltrados.map((p) => {
                  const imgs = parseImageUrls(p.imagem_urls);
const img = imgs.length > 0 ? getCachedImageUrl(imgs[0], p.cached_image_urls, 0, "small") : "";
                  const isEditing = editingId === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        p.promocao
                          ? "border-accent/40 bg-accent/5"
                          : "border-border bg-card-bg opacity-70"
                      }`}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-3">
                        {img ? (
                          <img src={img} alt={p.nome} width={40} height={40} className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">—</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.nome}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${p.promocao ? "text-accent" : "text-text-muted"}`}>
                              {getPromoLabel(p)}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              p.promocao
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {p.promocao ? "ATIVA" : "INATIVA"}
                            </span>
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <button
                          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                            p.promocao ? "bg-accent" : "bg-gray-300"
                          }`}
                          onClick={() => handleToggleProductPromo(p.id, !p.promocao)}
                          disabled={savingProduto === p.id}
                          title={p.promocao ? "Desativar promoção" : "Ativar promoção"}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              p.promocao ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>

                        {/* Edit button */}
                        <button
                          className="px-2 py-1 text-xs font-semibold bg-blue-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                          onClick={() => isEditing ? handleCancelEdit() : handleStartEdit(p)}
                          disabled={savingProduto === p.id}
                          title="Editar promoção"
                        >
                          {isEditing ? "✕" : "✎"}
                        </button>

                        {/* Remove button */}
                        <button
                          className="px-2 py-1 text-xs font-semibold bg-red-500 text-white rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                          onClick={() => handleRemoveProductPromo(p.id)}
                          disabled={savingProduto === p.id}
                          title="Remover promoção"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Edit form */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex flex-col gap-2">
                            <select
                              value={editTipo}
                              onChange={(e) => { setEditTipo(e.target.value); setEditValor(""); setEditNovoPreco(""); }}
                              className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                            >
                              <option value="">Tipo de promoção</option>
                              <option value="porcentagem">Desconto por %</option>
                              <option value="novo_preco">Novo preço fixo</option>
                              <option value="leve_pague">Leve 1 Pague 2</option>
                              <option value="leve_3_pague_2">Leve 3 Pague 2</option>
                            </select>

                            {editTipo === "porcentagem" && (
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={editValor}
                                onChange={(e) => setEditValor(e.target.value)}
                                placeholder="Desconto em % (ex: 20)"
                                className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                              />
                            )}

                            {editTipo === "novo_preco" && (
                              <input
                                type="number"
                                step="0.01"
                                value={editNovoPreco}
                                onChange={(e) => setEditNovoPreco(e.target.value)}
                                placeholder="Novo preço (ex: 99.90)"
                                className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                              />
                            )}

                            {editTipo === "leve_pague" && (
                              <div className="text-xs text-accent font-medium px-1">
                                O cliente leva 2 unidades pelo preço de 1
                              </div>
                            )}

                            {editTipo === "leve_3_pague_2" && (
                              <div className="text-xs text-accent font-medium px-1">
                                O cliente leva 3 unidades e paga apenas 2
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                className="flex-1 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                                onClick={() => handleEditProductPromo(p.id)}
                                disabled={savingProduto === p.id || !editTipo}
                              >
                                {savingProduto === p.id ? "Salvando..." : "Salvar"}
                              </button>
                              <button
                                className="px-4 py-2 text-sm font-semibold bg-gray-200 text-gray-700 rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={handleCancelEdit}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Search to add */}
        <div className="border-t border-border pt-4">
          <h5 className="text-sm font-semibold text-text-muted mb-2">Adicionar promoção a um produto</h5>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, time, liga..."
              className="flex-1 px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
            />
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
            >
              <option value="">Todos os tipos</option>
              {["Torcedor", "Jogador", "Manga Longa Torcedor", "Manga Longa Jogador", "Manga Longa Retrô", "Retrô", "Goleiro", "Treinamento", "Polo", "NBA"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {(busca || filtroTipo) && (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {resultadosBusca.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">Nenhum produto encontrado.</p>
              ) : (
                resultadosBusca.map((p) => (
                  <ProductPromoRow
                    key={p.id}
                    produto={p}
                    config={config}
                    saving={savingProduto}
                    onApply={handleSetProductPromo}
                  />
                ))
              )}
            </div>
          )}

          {(!busca && !filtroTipo) && (
            <p className="text-text-muted text-sm text-center py-4">Digite algo para buscar produtos.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductPromoRow({
  produto,
  config,
  saving,
  onApply,
}: {
  produto: DbProduto;
  config: LojaConfig;
  saving: string | null;
  onApply: (id: string, promocao: boolean, promocao_tipo: string | null, promocao_valor: number | null, preco_customizado: number | null) => void;
}) {
  const [tipo, setTipo] = useState<string>("");
  const [valor, setValor] = useState("");
  const [novoPreco, setNovoPreco] = useState("");

  const basePrice = config.precos_base[produto.tipo] ?? 89.90;
  const imgs = parseImageUrls(produto.imagem_urls);
  const img = imgs.length > 0 ? getCachedImageUrl(imgs[0], produto.cached_image_urls, 0, "small") : "";

  function handleApply() {
    const promocaoTipo = (tipo || null) as PromocaoTipo;
    let promocaoValor: number | null = null;
    let precoCustomizado: number | null = null;

    if (tipo === "porcentagem") {
      promocaoValor = parseFloat(valor) || null;
    } else if (tipo === "novo_preco") {
      precoCustomizado = parseFloat(novoPreco) || null;
    }

    onApply(produto.id, true, promocaoTipo, promocaoValor, precoCustomizado);
  }

  return (
    <div className="p-3 bg-card-bg rounded-md border border-border">
      <div className="flex items-center gap-3 mb-3">
        {img ? (
          <img src={img} alt={produto.nome} width={40} height={40} className="w-10 h-10 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-text-muted text-xs">—</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{produto.nome}</div>
          <div className="text-xs text-text-muted">{produto.tipo} • {produto.temporada} • {formatarMoeda(basePrice)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <select
          value={tipo}
          onChange={(e) => { setTipo(e.target.value); setValor(""); setNovoPreco(""); }}
          className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
        >
          <option value="">Tipo de promoção</option>
          <option value="porcentagem">Desconto por %</option>
          <option value="novo_preco">Novo preço fixo</option>
          <option value="leve_pague">Leve 1 Pague 2</option>
          <option value="leve_3_pague_2">Leve 3 Pague 2</option>
        </select>

        {tipo === "porcentagem" && (
          <input
            type="number"
            min="1"
            max="99"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Desconto em % (ex: 20)"
            className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          />
        )}

        {tipo === "novo_preco" && (
          <input
            type="number"
            step="0.01"
            value={novoPreco}
            onChange={(e) => setNovoPreco(e.target.value)}
            placeholder="Novo preço (ex: 99.90)"
            className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          />
        )}

        {tipo === "leve_pague" && (
          <div className="text-xs text-accent font-medium px-1">
            O cliente leva 2 unidades pelo preço de 1
          </div>
        )}

        {tipo === "leve_3_pague_2" && (
          <div className="text-xs text-accent font-medium px-1">
            O cliente leva 3 unidades e paga apenas 2
          </div>
        )}

        {tipo && (
          <button
            className="w-full py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={handleApply}
            disabled={saving === produto.id}
          >
            {saving === produto.id ? "Salvando..." : "Aplicar Promoção"}
          </button>
        )}
      </div>
    </div>
  );
}
