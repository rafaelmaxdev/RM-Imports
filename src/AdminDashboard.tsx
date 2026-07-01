import { useState, useEffect, useMemo } from "react";
import { getPedidos } from "./lib/db";
import { clearCache } from "./lib/cache";
import type { Order, PaymentMethod } from "./types";
import { formatarMoeda } from "./types";
import { PAYMENT_LABELS } from "./lib/status";

interface AdminDashboardProps {
  onNavigate?: (tab: "pedidos" | "financeiro" | "estoque") => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearCache("pedidos");
    async function load() {
      try {
        const all = await getPedidos();
        setOrders(all);
      } catch (err) {
        console.error("Erro ao carregar pedidos:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const now = new Date();
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    anos.add(now.getFullYear());
    for (const o of orders) {
      if (o.created_at) anos.add(new Date(o.created_at).getFullYear());
      if (o.data) {
        const p = o.data.split("/");
        if (p.length === 3) anos.add(parseInt(p[2]));
      }
    }
    return [...anos].filter((a) => !isNaN(a)).sort((a, b) => b - a);
  }, [orders]);
  const [anoFiltro, setAnoFiltro] = useState(now.getFullYear());
  const [mesFiltro, setMesFiltro] = useState<number | null>(null);
  const MESES = ["Todos", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  function filtrarPorData(o: Order): boolean {
    let data: Date | null = null;
    if (o.created_at) data = new Date(o.created_at);
    else if (o.data) {
      const p = o.data.split("/");
      if (p.length === 3) data = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    }
    if (!data) return true;
    if (data.getFullYear() !== anoFiltro) return false;
    if (mesFiltro !== null && data.getMonth() + 1 !== mesFiltro) return false;
    return true;
  }

  const {
    totalOrders,
    totalRevenue,
    totalPending,
    totalPE,
    totalAdmin,
    monthlyData,
    topProducts,
    paymentCount,
    statusCount,
  } = useMemo(() => {
    const ativos = orders.filter((o) => o.status !== "cancelado" && o.status !== "reembolsado" && !o.admin_order && !o.pronta_entrega && o.status !== "pendente" && filtrarPorData(o));
    const peVendas = orders.filter((o) => o.pronta_entrega && o.status === "entregue" && filtrarPorData(o));
    const adminOrders = orders.filter((o) => o.admin_order && !o.pronta_entrega && o.status !== "cancelado" && o.status !== "reembolsado" && o.status !== "pendente" && filtrarPorData(o));
    const revenue = ativos.reduce((s, o) => s + o.total, 0) + peVendas.reduce((s, o) => s + o.total, 0);
    const pending = orders.filter((o) => o.status === "pendente").length;

    // Monthly revenue for filtered year
    const monthMap: Record<string, { revenue: number; count: number; itens: number }> = {};
    const ateMes = anoFiltro === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = 1; m <= ateMes; m++) {
      const key = `${anoFiltro}-${String(m).padStart(2, "0")}`;
      monthMap[key] = { revenue: 0, count: 0, itens: 0 };
    }
    for (const o of [...ativos, ...peVendas]) {
      if (!filtrarPorData(o)) continue;
      const d = o.created_at ? new Date(o.created_at) : null;
      if (!d && o.data) {
        const p = o.data.split("/");
        if (p.length === 3) {
          const dd = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
          const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
          if (monthMap[key]) {
            monthMap[key].revenue += o.total;
            monthMap[key].count += 1;
            monthMap[key].itens += o.itens.length;
          }
        }
      } else if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap[key]) {
          monthMap[key].revenue += o.total;
          monthMap[key].count += 1;
          monthMap[key].itens += o.itens.length;
        }
      }
    }

    // Top 10 products
    const productCount: Record<string, { count: number; revenue: number }> = {};
    for (const o of [...ativos, ...peVendas]) {
      for (const item of o.itens) {
        if (!productCount[item.nome]) productCount[item.nome] = { count: 0, revenue: 0 };
        productCount[item.nome].count += 1;
        productCount[item.nome].revenue += item.preco;
      }
    }
    const top = Object.entries(productCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([nome, data]) => ({ nome, ...data }));

    // Payment method distribution
    const payCount: Record<string, number> = {};
    for (const o of [...ativos, ...peVendas]) {
      const method = o.payment_method || "unknown";
      payCount[method] = (payCount[method] || 0) + 1;
    }

    // Status distribution (separate regular vs PE vs admin)
    const statCount: Record<string, { regular: number; pe: number; admin: number; itens_regular: number; itens_pe: number; itens_admin: number; pe_entregue: number; itens_pe_entregue: number }> = {};
    for (const o of orders) {
      if (!statCount[o.status]) statCount[o.status] = { regular: 0, pe: 0, admin: 0, itens_regular: 0, itens_pe: 0, itens_admin: 0, pe_entregue: 0, itens_pe_entregue: 0 };
      const qtd = o.itens.length;
      if (o.admin_order) {
        statCount[o.status].admin += 1;
        statCount[o.status].itens_admin += qtd;
      } else if (o.pronta_entrega && o.status === "entregue") {
        statCount[o.status].pe_entregue += 1;
        statCount[o.status].itens_pe_entregue += qtd;
      } else if (o.pronta_entrega) {
        statCount[o.status].pe += 1;
        statCount[o.status].itens_pe += qtd;
      } else {
        statCount[o.status].regular += 1;
        statCount[o.status].itens_regular += qtd;
      }
    }

    return {
      totalOrders: orders.length,
      totalRevenue: revenue,
      totalPending: pending,
      totalPE: orders.filter((o) => o.reposicao).length,
      totalAdmin: adminOrders.length,
      monthlyData: Object.entries(monthMap).map(([mes, data]) => ({ mes, ...data })),
      topProducts: top,
      paymentCount: payCount,
      statusCount: statCount,
    };
  }, [orders]);

  const chartData = mesFiltro ? monthlyData.filter((m) => parseInt(m.mes.split("-")[1]) === mesFiltro) : monthlyData;
  const maxRevenue = Math.max(...chartData.map((m) => m.revenue), 1);

  if (loading) {
    return (
      <div className="text-center py-16 text-text-muted text-lg">
        Carregando dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {[
          { value: totalOrders, label: "Total de Pedidos", tab: "pedidos" as const },
          { value: formatarMoeda(totalRevenue), label: "Receita", tab: "financeiro" as const },
          { value: totalPending, label: "Pendentes", tab: "pedidos" as const },
          { value: totalPE, label: "Para estoque", tab: "estoque" as const },
          { value: totalAdmin, label: "Admin", tab: "pedidos" as const },
        ].map((card) => {
          const colors: Record<string, string> = {
            "Total de Pedidos": "text-primary",
            "Receita": "text-accent",
            "Pendentes": "text-yellow-600",
            "Estoque": "text-teal-600",
            "Admin": "text-purple-600",
          };
          return (
            <button
              key={card.label}
              onClick={() => onNavigate?.(card.tab)}
              className="p-3 bg-card-bg rounded-lg border border-border text-center cursor-pointer hover:shadow-md hover:border-accent/40 transition-all"
            >
              <div className={`text-xl sm:text-2xl font-bold leading-tight ${colors[card.label]}`}>{card.value}</div>
              <div className="text-[10px] sm:text-xs text-text-muted mt-1 leading-tight">{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          value={anoFiltro}
          onChange={(e) => { setAnoFiltro(parseInt(e.target.value)); setMesFiltro(null); }}
        >
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
          value={mesFiltro ?? 0}
          onChange={(e) => setMesFiltro(parseInt(e.target.value) || null)}
        >
          {MESES.map((label, i) => <option key={i} value={i}>{label}</option>)}
        </select>
      </div>

      {/* Monthly Revenue Chart */}
      <div className="bg-card-bg rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-primary mb-4">Receita {mesFiltro ? `${MESES[mesFiltro]}/${anoFiltro}` : `Mensal ${anoFiltro}`}</h3>
        <div className="overflow-x-auto pt-6 pb-2">
        <div className="flex items-end gap-3 h-48 min-w-[400px]">
          {chartData.map((m) => {
            const pct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
            const [ano, mesNum] = m.mes.split("-");
            const label = `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][parseInt(mesNum) - 1]}/${ano}`;
            return (
              <div key={m.mes} className="flex-1 flex flex-col items-center h-full justify-end group">
                <div className="w-full bg-accent/20 rounded-t relative" style={{ height: `${Math.max(pct, 3)}%` }}>
                  <div className="w-full h-full bg-accent rounded-t opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[10px] text-text-muted font-semibold mt-0.5">{formatarMoeda(m.revenue)}</span>
                <span className="text-[9px] text-text-muted">{label}</span>
                <span className="text-[8px] text-text-muted">{m.count} {m.count === 1 ? 'pedido' : 'pedidos'} ({m.itens} camisas)</span>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-card-bg rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-primary mb-4">Produtos Mais Vendidos</h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Nenhuma venda ainda.</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.nome} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-text-muted w-5 flex-shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0" title={p.nome}>
                    <div className="text-sm truncate font-medium">{p.nome}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold">{p.count}x</div>
                    <div className="text-[10px] text-text-muted">{formatarMoeda(p.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribution */}
        <div className="space-y-4">
          {/* Payment Methods */}
          <div className="bg-card-bg rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-primary mb-3">Formas de Pagamento</h3>
            {Object.keys(paymentCount).length === 0 ? (
              <p className="text-sm text-text-muted text-center py-2">Nenhum dado.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(paymentCount).map(([method, count]) => {
                  const total = Object.values(paymentCount).reduce((s, c) => s + c, 0);
                  const pct = Math.round((count / total) * 100);
                  const label = PAYMENT_LABELS[method as PaymentMethod] || method;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{label}</span>
                        <span className="font-semibold">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status Breakdown */}
          <div className="bg-card-bg rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-primary mb-3">Status dos Pedidos</h3>
            {Object.keys(statusCount).length === 0 ? (
              <p className="text-sm text-text-muted text-center py-2">Nenhum dado.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {Object.entries(statusCount).map(([status, data]) => {
                  const labels: Record<string, string> = {
                    pendente: "Pendente",
                    pago: "Pago",
                    enviado_fornecedor: "Enviado forn.",
                    em_producao: "Em produção",
                    a_caminho: "A caminho",
                    em_estoque: "Em estoque",
                    em_entrega: "Em entrega",
                    entregue: "Entregue",
                    cancelado: "Cancelado",
                    reembolsado: "Reembolsado",
                  };
                  return (
                    <div key={status} className="text-sm px-2 py-1.5 bg-bg-base rounded">
                      <div className="flex justify-between">
                        <span>{labels[status] || status}</span>
                        <span className="font-semibold">{data.regular + data.pe + data.admin} ({data.itens_regular + data.itens_pe + data.itens_admin} camisas)</span>
                      </div>
                      {data.regular > 0 && (
                        <div className="flex justify-between text-[11px] text-text-muted mt-0.5">
                          <span>  └ Cliente</span>
                          <span className="font-semibold">{data.regular} ({data.itens_regular} camisas)</span>
                        </div>
                      )}
                      {data.pe > 0 && (
                        <div className="flex justify-between text-[11px] text-teal-600 mt-0.5">
                          <span>  └ Estoque</span>
                          <span className="font-semibold">{data.pe} ({data.itens_pe} camisas)</span>
                        </div>
                      )}
                      {data.pe_entregue > 0 && (
                        <div className="flex justify-between text-[11px] text-teal-600 mt-0.5">
                          <span>  └ Venda Direta</span>
                          <span className="font-semibold">{data.pe_entregue} ({data.itens_pe_entregue} camisas)</span>
                        </div>
                      )}
                      {data.admin > 0 && (
                        <div className="flex justify-between text-[11px] text-purple-600 mt-0.5">
                          <span>  └ Admin</span>
                          <span className="font-semibold">{data.admin} ({data.itens_admin} camisas)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
