import { useState, useEffect } from "react";
import { getPedidos, getPacotes, getEstoque } from "./lib/db";
import type { Pacote } from "./lib/db";
import type { Order, EstoqueItem } from "./types";
import { formatarMoeda } from "./types";
import { supabase } from "./lib/supabase";

interface ExtraCusto {
  id: number;
  nome: string;
  quantidade: number;
  preco: number;
  data: string;
  cor: string;
}

const EXTRA_KEY = "rm_custos_extras";

function loadExtras(): ExtraCusto[] {
  try { return JSON.parse(localStorage.getItem(EXTRA_KEY) || "[]"); }
  catch { return []; }
}

function saveExtras(extras: ExtraCusto[]) {
  localStorage.setItem(EXTRA_KEY, JSON.stringify(extras));
}

export default function AdminFinanceiro() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<ExtraCusto[]>([]);
  useEffect(() => {
    loadExtrasFromSupabase().then((data) => {
      if (data.length > 0) { setExtras(data); saveExtras(data); }
      else { setExtras(loadExtras()); }
    }).catch(() => setExtras(loadExtras()));
  }, []);
  const [extraNome, setExtraNome] = useState("");
  const [extraQtd, setExtraQtd] = useState("");
  const [extraPreco, setExtraPreco] = useState("");
  const [extraData, setExtraData] = useState(new Date().toISOString().slice(0, 10));
  const CORES_PALETA = ["#F4A261", "#E76F51", "#D4A373", "#B5838D", "#6D597A", "#B56576", "#E5989B", "#FFB4A2", "#A8D5BA", "#7EC8E3", "#95D5B2", "#74C69D"];
  const [extraCor, setExtraCor] = useState(CORES_PALETA[extras.length % CORES_PALETA.length]);


  useEffect(() => {
    let cancelled = false;
    Promise.all([getPedidos(), getPacotes(), getEstoque()]).then(([o, p, e]) => {
      if (cancelled) return;
      setOrders(o);
      setPacotes(p);
      setEstoque(e);
    }).catch((err) => {
      if (!cancelled) console.error("[Financeiro]", err);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function syncExtraToSupabase(extra: ExtraCusto) {
    try {
      await supabase.from("custos_extras").upsert({ id: extra.id, nome: extra.nome, quantidade: extra.quantidade, preco: extra.preco, data: extra.data, cor: extra.cor }, { onConflict: "id" });
    } catch (err) {
      console.warn("[Financeiro] Erro ao sincronizar custo extra com Supabase:", err);
    }
  }

  async function deleteExtraFromSupabase(id: number) {
    try {
      await supabase.from("custos_extras").delete().eq("id", id);
    } catch (err) {
      console.warn("[Financeiro] Erro ao deletar custo extra do Supabase:", err);
    }
  }

  async function loadExtrasFromSupabase(): Promise<ExtraCusto[]> {
    try {
      const { data } = await supabase.from("custos_extras").select("*");
      if (data) return data as ExtraCusto[];
    } catch {}
    return [];
  }

  function addExtra() {
    if (!extraNome.trim() || !extraQtd || !extraPreco) return;
    const novo: ExtraCusto = { id: Date.now(), nome: extraNome.trim(), quantidade: parseInt(extraQtd) || 1, preco: parseFloat(extraPreco) || 0, data: extraData, cor: extraCor };
    const updated = [...extras, novo];
    setExtras(updated); saveExtras(updated);
    syncExtraToSupabase(novo);
    setExtraNome(""); setExtraQtd(""); setExtraPreco(""); setExtraData(new Date().toISOString().slice(0, 10));
    setExtraCor(CORES_PALETA[(extras.length + 1) % CORES_PALETA.length]);
  }

  function removeExtra(id: number) {
    const updated = extras.filter((e) => e.id !== id);
    setExtras(updated); saveExtras(updated);
    deleteExtraFromSupabase(id);
  }

  function exportCSV() {
    const rows = [["Mês", "Pedidos", "Receita", "Custos", "Lucro"]];
    for (const [mes, { qtde, total }] of porMes) {
      const custoM = custoPorMes.get(mes) || 0;
      rows.push([mes, String(qtde), formatarMoeda(total), formatarMoeda(custoM), formatarMoeda(total - custoM)]);
    }
    rows.push([]);
    rows.push(["Total", String(porMes.reduce((s, [, v]) => s + v.qtde, 0)), formatarMoeda(receitaBruta + receitaPE), formatarMoeda(custosTotais), formatarMoeda(lucro)]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div className="text-center py-8 text-text-muted">Carregando...</div>;

  const ativos = orders.filter((o) => o.status !== "cancelado" && o.status !== "reembolsado" && !o.admin_order && !o.pronta_entrega);
  const peVendas = orders.filter((o) => o.pronta_entrega && !o.admin_order && o.status !== "cancelado" && o.status !== "reembolsado");
  const cancelados = orders.filter((o) => o.status === "cancelado" || o.status === "reembolsado");

  const pedidosEmPacotes = new Set<string>();
  const custoPacote = pacotes.reduce((s, p) => s + (p.custo || 0), 0);
  const freteTotal = pacotes.reduce((s, p) => s + (p.frete || 0), 0);
  const taxaTotal = pacotes.reduce((s, p) => s + (p.taxa_importacao || 0), 0);

  for (const p of pacotes) {
    for (const id of p.pedido_ids) pedidosEmPacotes.add(id);
  }

  const custoPorFora = estoque.reduce((s, e) => s + (e.custo || 0), 0);
  const extraTotal = extras.reduce((s, e) => s + e.quantidade * e.preco, 0);
  const receitaBruta = ativos.reduce((s, o) => s + o.total, 0);
  const receitaPE = peVendas.reduce((s, o) => s + o.total, 0);
  const receitaCancelados = cancelados.reduce((s, o) => s + o.total, 0);
  const receitaEmPacotes = [...ativos, ...peVendas].filter((o) => pedidosEmPacotes.has(o.id)).reduce((s, o) => s + o.total, 0);
  const custosTotais = custoPacote + freteTotal + taxaTotal + custoPorFora + extraTotal;
  const lucro = receitaEmPacotes - custoPacote - freteTotal - taxaTotal - custoPorFora - extraTotal;

  const pieData = [
    { label: "Produtos", value: custoPacote, color: "#E63946" },
    { label: "Frete", value: freteTotal, color: "#457B9D" },
    { label: "Taxa", value: taxaTotal, color: "#2A9D8F" },
    { label: "Estoque", value: custoPorFora, color: "#E9C46A" },
    ...extras.map((e) => ({
      label: e.nome + (e.quantidade > 1 ? ` (${e.quantidade}x)` : ""),
      value: e.quantidade * e.preco,
      color: e.cor || "#F4A261",
    })),
  ].filter((d) => d.value > 0);

  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // Collect all months from orders AND extras
  const mesesSet = new Set<string>();
  const meses = new Map<string, { qtde: number; total: number }>();
  for (const o of [...ativos, ...peVendas]) {
    const mes = o.data.slice(3);
    mesesSet.add(mes);
    const curr = meses.get(mes) || { qtde: 0, total: 0 };
    curr.qtde++;
    curr.total += o.total;
    meses.set(mes, curr);
  }
  for (const e of extras) {
    const mes = e.data.slice(5, 7) + "/" + e.data.slice(0, 4);
    mesesSet.add(mes);
    if (!meses.has(mes)) {
      meses.set(mes, { qtde: 0, total: 0 });
    }
  }

  const porMes = [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxTotal = Math.max(...porMes.map(([, v]) => v.total), 1);

  // Costs per month from extras
  const custoPorMes = new Map<string, number>();
  for (const e of extras) {
    const mes = e.data.slice(5, 7) + "/" + e.data.slice(0, 4);
    custoPorMes.set(mes, (custoPorMes.get(mes) || 0) + e.quantidade * e.preco);
  }
  // Distribute package costs across months with revenue
  const mesesComReceita = porMes.filter(([, v]) => v.total > 0);
  const totalRevenue = mesesComReceita.reduce((s, [, v]) => s + v.total, 0) || 1;
  for (const [mes, { total }] of mesesComReceita) {
    const share = total / totalRevenue;
    const pkgCost = (custoPacote + freteTotal + taxaTotal + custoPorFora) * share;
    custoPorMes.set(mes, (custoPorMes.get(mes) || 0) + pkgCost);
  }

  return (
    <div className="pb-16">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xl text-primary">Financeiro</h3>
        <button className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity" onClick={exportCSV}>📥 Exportar CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center" title="Pedidos de clientes (exclui admin e pronta entrega)">
          <div className="text-2xl font-bold text-green-700">{ativos.length + peVendas.length}</div>
          <div className="text-xs text-green-600 mt-0.5">Vendas</div>
        </div>
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg text-center" title="Soma total de todos os pedidos pagos">
          <div className="text-xl sm:text-2xl font-bold text-accent whitespace-nowrap">{formatarMoeda(receitaBruta + receitaPE)}</div>
          <div className="text-xs text-text-muted mt-0.5">Receita total</div>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center" title="Pedidos cancelados ou reembolsados">
          <div className="text-2xl font-bold text-red-600">{cancelados.length}</div>
          <div className="text-xs text-red-600 mt-0.5">Cancelados</div>
          <div className="text-xs text-red-500 mt-0.5">{formatarMoeda(receitaCancelados)}</div>
        </div>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center" title="Custos totais: produtos + frete + taxa + estoque + extras">
          <div className="text-xl sm:text-2xl font-bold text-yellow-700 whitespace-nowrap">{formatarMoeda(custosTotais)}</div>
          <div className="text-xs text-yellow-600 mt-0.5">Custos</div>
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center" title="Receita em pacotes - custos totais">
          <div className="text-xl sm:text-2xl font-bold text-blue-700 whitespace-nowrap">{formatarMoeda(lucro)}</div>
          <div className="text-xs text-blue-600 mt-0.5">Lucro</div>
        </div>
      </div>

      {custosTotais > 0 && (
        <div className="p-3 bg-bg-base rounded-md border border-border text-xs text-text-muted mb-6 space-y-1">
          <p>Produtos: {formatarMoeda(custoPacote)} | Frete: {formatarMoeda(freteTotal)} | Taxa: {formatarMoeda(taxaTotal)} | Estoque: {formatarMoeda(custoPorFora)} | Extras: {formatarMoeda(extraTotal)}</p>
        </div>
      )}

      {/* Pie chart - horizontal stacked bar (simpler, reliable) */}
      <div className="mb-6 p-4 bg-card-bg rounded-lg border border-border">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Custos</h4>
        {pieTotal > 0 ? (
          <>
            <div className="flex h-6 rounded-full overflow-hidden mb-3">
              {pieData.map((d) => (
                <div
                  key={d.label}
                  className="relative group cursor-default transition-all hover:brightness-110"
                  style={{ width: `${(d.value / pieTotal) * 100}%`, backgroundColor: d.color }}
                  title={`${d.label}: ${formatarMoeda(d.value)} (${Math.round((d.value / pieTotal) * 100)}%)`}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-sm">
              {pieData.map((d) => (
                <div key={d.label} className="flex items-center gap-2 group cursor-default hover:opacity-80 transition-opacity">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-text-muted">{d.label}</span>
                  <span className="font-medium">{formatarMoeda(d.value)}</span>
                  <span className="text-text-muted text-xs">({Math.round((d.value / pieTotal) * 100)}%)</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-6 rounded-full overflow-hidden mb-2 bg-gray-200" />
        )}
        <p className="text-xs text-text-muted mt-2">Total: {formatarMoeda(custosTotais)}</p>
      </div>

      {/* Extra costs */}
      <div className="mb-6 p-4 bg-card-bg rounded-lg border border-border">
        <h4 className="text-sm font-semibold text-text-muted mb-3">Custos extras</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="text" value={extraNome} onChange={(e) => setExtraNome(e.target.value)} placeholder="Nome (ex: Bolsa)" className="flex-1 min-w-[100px] px-3 py-2 text-sm border border-border rounded-md bg-bg-base" />
          <input type="number" min="1" value={extraQtd} onChange={(e) => setExtraQtd(e.target.value)} placeholder="Qtd" className="w-20 px-3 py-2 text-sm border border-border rounded-md bg-bg-base" />
          <input type="number" step="0.01" min="0" value={extraPreco} onChange={(e) => setExtraPreco(e.target.value)} placeholder="R$ unid" className="w-24 px-3 py-2 text-sm border border-border rounded-md bg-bg-base" />
          <input type="date" value={extraData} onChange={(e) => setExtraData(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-md bg-bg-base w-36" />
          <input type="color" value={extraCor} onChange={(e) => setExtraCor(e.target.value)} className="w-9 h-9 p-0.5 border border-border rounded cursor-pointer bg-transparent" />
          <button className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50" onClick={addExtra} disabled={!extraNome.trim() || !extraQtd || !extraPreco}>Adicionar</button>
        </div>
        {extras.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2 font-semibold text-text-muted text-xs">Item</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-text-muted text-xs">Data</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-text-muted text-xs">Qtd</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-text-muted text-xs">R$ unid</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-text-muted text-xs">Total</th>
                  <th className="py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {extras.map((e) => (
                  <tr key={e.id} className="border-b border-border hover:bg-bg-base">
                    <td className="py-1.5 px-2 font-medium flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: e.cor || "#F4A261" }} />
                      {e.nome}
                    </td>
                    <td className="py-1.5 px-2 text-text-muted text-xs">{e.data}</td>
                    <td className="py-1.5 px-2 text-right">{e.quantidade}</td>
                    <td className="py-1.5 px-2 text-right">{formatarMoeda(e.preco)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{formatarMoeda(e.quantidade * e.preco)}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <button className="text-blue-500 text-xs cursor-pointer bg-transparent border-none hover:text-blue-700 px-1" onClick={() => { setExtraNome(e.nome); setExtraQtd(String(e.quantidade)); setExtraPreco(String(e.preco)); setExtraData(e.data); setExtraCor(e.cor || "#F4A261"); removeExtra(e.id); }}>✎</button>
                      <button className="text-red-500 text-xs cursor-pointer bg-transparent border-none hover:text-red-700 px-1" onClick={() => removeExtra(e.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Nenhum custo extra registrado.</p>
        )}
      </div>

      {/* Monthly bar chart with balance */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-text-muted mb-3">Balanço mensal</h4>
        {porMes.length > 0 ? (
          <div className="flex items-end gap-3 h-48 mb-4 border-b border-border">
            {porMes.map(([mes, { total, qtde }]) => {
              const [m, a] = mes.split("/");
              const nomeMes = MESES_NOME[parseInt(m) - 1] || mes;
              const custoMes = custoPorMes.get(mes) || 0;
              const receitaMes = total;
              const balanco = receitaMes - custoMes;
              const maxVal = Math.max(receitaMes, custoMes, maxTotal, 1);
              return (
                <div key={mes} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                    Receita: {formatarMoeda(receitaMes)} | Custos: {formatarMoeda(custoMes)} | Saldo: {formatarMoeda(balanco)}
                  </div>
                  <span className={`text-[10px] font-semibold ${balanco >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatarMoeda(balanco)}
                  </span>
                  <div className="relative w-full flex justify-center" style={{ height: `${Math.max((receitaMes / maxVal) * 80, 4)}px` }}>
                    <div className="w-3/4 bg-blue-500 rounded-t hover:brightness-110 transition-all cursor-default" style={{ height: "100%" }} />
                  </div>
                  <div className="relative w-full flex justify-center" style={{ height: `${Math.max((custoMes / maxVal) * 80, custoMes > 0 ? 4 : 0)}px` }}>
                    <div className="w-3/4 bg-red-400 rounded-t hover:brightness-110 transition-all cursor-default" style={{ height: "100%" }} />
                  </div>
                  <span className="text-[10px] text-text-muted font-medium">{nomeMes}/{a}</span>
                  <span className="text-[9px] text-text-muted">{qtde} pedido{qtde !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-muted mb-4">Nenhuma venda ainda.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 font-semibold text-text-muted text-xs">Mês</th>
              <th className="text-right py-2 px-3 font-semibold text-text-muted text-xs">Pedidos</th>
              <th className="text-right py-2 px-3 font-semibold text-text-muted text-xs">Total</th>
            </tr>
          </thead>
          <tbody>
            {porMes.map(([mes, { qtde, total }]) => (
              <tr key={mes} className="border-b border-border hover:bg-bg-base">
                <td className="py-2 px-3">{mes}</td>
                <td className="py-2 px-3 text-right">{qtde}</td>
                <td className="py-2 px-3 text-right font-medium">{formatarMoeda(total)}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
