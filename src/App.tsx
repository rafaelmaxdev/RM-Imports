import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import Loja from "./Loja";
import Footer from "./Footer";
import WhatsAppButton from "./WhatsAppButton";
import { CartProvider, useCart } from "./CartContext";
import useBodyScrollLock from "./hooks/useBodyScrollLock";
import { getProdutos, getLojaConfig, getAdminLojaConfig } from "./lib/db";
import type { DbProduto } from "./lib/db";
import type { OrderAddress, LojaConfig, PaymentMethod } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { clearCache } from "./lib/cache";
import { supabase } from "./lib/supabase";
import "./index.css";

const OrderConfirmation = lazy(() => import("./OrderConfirmation"));
const CartSidebar = lazy(() => import("./CartSidebar"));
const AdminGate = lazy(() => import("./AdminGate"));
const ProdutoForm = lazy(() => import("./ProdutoForm"));
const AdminOrders = lazy(() => import("./AdminOrders"));
const AdminHistory = lazy(() => import("./AdminHistory"));
const AdminPacotes = lazy(() => import("./AdminPacotes"));
const AdminDestaques = lazy(() => import("./AdminDestaques"));
const AdminPromocoes = lazy(() => import("./AdminPromocoes"));
const AdminEstoque = lazy(() => import("./AdminEstoque"));
const AdminCupons = lazy(() => import("./AdminCupons"));
const AdminFinanceiro = lazy(() => import("./AdminFinanceiro"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const ProntaEntrega = lazy(() => import("./ProntaEntrega"));
const MeusPedidos = lazy(() => import("./MeusPedidos"));
const NotFound = lazy(() => import("./NotFound"));
const ProductPage = lazy(() => import("./ProductPage"));
import ErrorBoundary from "./ErrorBoundary";
const SizeChart = lazy(() => import("./SizeChart"));

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-8">
      {/* Carousel placeholder */}
      <div className="w-full h-48 sm:h-64 bg-gray-200 animate-pulse rounded-lg mb-4" />
      {/* Category buttons */}
      <div className="flex justify-center gap-1.5 sm:gap-2 flex-wrap mb-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-gray-200 animate-pulse rounded-full" />
        ))}
      </div>
      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex gap-1 sm:gap-2 my-4">
        <div className="h-10 bg-gray-200 animate-pulse rounded-md" />
        <div className="h-10 bg-gray-200 animate-pulse rounded-md" />
        <div className="h-10 flex-1 min-w-[140px] bg-gray-200 animate-pulse rounded-md" />
        <div className="h-10 bg-gray-200 animate-pulse rounded-md" />
      </div>
      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card-bg rounded-lg overflow-hidden border border-border">
            <div className="aspect-square bg-gray-200 animate-pulse" />
            <div className="p-2.5 sm:p-4">
              <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4 mb-2" />
              <div className="flex gap-1 mb-1.5">
                <div className="h-4 w-12 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 w-12 bg-gray-200 animate-pulse rounded" />
              </div>
              <div className="h-5 bg-gray-200 animate-pulse rounded w-1/3 mb-3" />
              <div className="h-9 sm:h-11 bg-gray-200 animate-pulse rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const [produtos, setProdutos] = useState<DbProduto[]>([]);
  const [config, setConfig] = useState<LojaConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const { cart, createOrder } = useCart();
  const location = useLocation();

  useBodyScrollLock(showMenu || showCart);

  useEffect(() => {
    if (loading) return;

    const frame = window.requestAnimationFrame(() => {
      if (location.hash) {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.hash, loading]);

  useEffect(() => {
    Promise.all([
      getProdutos().then(setProdutos).catch(console.error),
      getLojaConfig().then(setConfig).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleCheckout(endereco: OrderAddress, paymentMethod: PaymentMethod, cupom?: { codigo: string; desconto: number }): Promise<void> {
    const order = await createOrder(endereco, paymentMethod, cupom);
    if (!order) throw new Error("Não foi possível criar o pedido.");
    setShowCart(false);
    navigate(`/pedido/${order.id}`);
  }

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-primary/95 text-white shadow-[0_8px_30px_rgba(5,7,20,.18)] backdrop-blur-xl" aria-label="Navegação principal">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <button
            className={`hamburger-btn flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-[5px] border-none bg-transparent p-2 lg:hidden ${showMenu ? 'open' : ''}`}
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Menu"
            aria-expanded={showMenu}
          >
            <span className="block h-[2px] w-5 origin-center rounded bg-white transition-all duration-300" style={showMenu ? { transform: 'translateY(7px) rotate(45deg)' } : {}} />
            <span className="block h-[2px] w-5 rounded bg-white transition-all duration-300" style={showMenu ? { opacity: 0 } : {}} />
            <span className="block h-[2px] w-5 origin-center rounded bg-white transition-all duration-300" style={showMenu ? { transform: 'translateY(-7px) rotate(-45deg)' } : {}} />
          </button>

          <Link to="/" className="absolute left-1/2 flex -translate-x-1/2 items-center text-white no-underline transition-opacity hover:opacity-80 lg:static lg:translate-x-0" aria-label="RM Imports — início">
            <img src="/logo.png" alt="RM Imports" width={84} height={48} className="h-10 w-[70px] object-contain lg:h-11 lg:w-[78px]" />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            <Link to="/#catalogo" className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">Catálogo</Link>
            <Link to="/pronta-entrega" className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">Pronta entrega</Link>
            <Link to="/tamanhos" className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">Tamanhos</Link>
            <Link to="/meu-pedido" className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">Meu pedido</Link>
          </div>

          <button
            className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15"
            onClick={() => setShowCart(true)}
            aria-label={`Carrinho${cart.length > 0 ? `, ${cart.length} ${cart.length === 1 ? 'item' : 'itens'}` : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.6L21 7H6" />
            </svg>
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white shadow-sm">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/60 z-[1001] animate-menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="absolute bottom-0 left-0 top-0 flex w-[min(86vw,340px)] flex-col bg-primary text-white shadow-2xl animate-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <img src="/logo.png" alt="RM Imports" className="h-11 w-[78px] object-contain" />
              <button className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-xl text-white hover:bg-white/10" onClick={() => setShowMenu(false)} aria-label="Fechar menu">×</button>
            </div>
            <Link to="/" className="mx-3 mt-4 rounded-xl px-4 py-3.5 text-white no-underline transition-colors hover:bg-white/10 animate-menu-item" onClick={() => setShowMenu(false)}>
              Loja
            </Link>
            <Link to="/tamanhos" className="mx-3 rounded-xl px-4 py-3.5 text-white no-underline transition-colors hover:bg-white/10 animate-menu-item" onClick={() => setShowMenu(false)}>
              Guia de tamanhos
            </Link>
            <Link
              to="/pronta-entrega"
              className="mx-3 rounded-xl px-4 py-3.5 text-white no-underline transition-colors hover:bg-white/10 animate-menu-item"
              onClick={() => setShowMenu(false)}
            >
              Pronta entrega
            </Link>
            <Link to="/meu-pedido" className="mx-3 rounded-xl px-4 py-3.5 text-white no-underline transition-colors hover:bg-white/10 animate-menu-item" onClick={() => setShowMenu(false)}>
              Meu pedido
            </Link>
          </div>
        </div>
      )}
      <main id="main-content" className="flex-1">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <Suspense fallback={<LoadingSkeleton />}>
            <div key={location.pathname} className="animate-page-enter">
              <Routes location={location}>
                <Route path="/" element={<Loja produtos={produtos} config={config} />} />
                <Route path="/produto/:id/:slug?" element={<ProductPage produtos={produtos} config={config} />} />
                <Route
                  path="/admin"
                  element={
                    <AdminGate>
                      <AdminPanel produtos={produtos} setProdutos={setProdutos} config={config} setConfig={setConfig} />
                    </AdminGate>
                  }
                />
                <Route path="/pedido/:id" element={<OrderConfirmation />} />
                <Route path="/tamanhos" element={<SizeChart />} />
                <Route path="/pronta-entrega" element={<ProntaEntrega />} />
                <Route path="/meu-pedido" element={<MeusPedidos />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </Suspense>
        )}
      </main>

      {showCart && (
        <Suspense fallback={null}>
          <CartSidebar onClose={() => setShowCart(false)} onCheckout={handleCheckout} />
        </Suspense>
      )}
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

type AdminTab = "produtos" | "destaques" | "promocoes" | "cupons" | "pedidos" | "pacotes" | "estoque" | "historico" | "financeiro" | "dashboard";

function AdminPanel({
  produtos,
  setProdutos,
  config,
  setConfig,
}: {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
  config: LojaConfig;
  setConfig: React.Dispatch<React.SetStateAction<LojaConfig>>;
}) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [precacheStatus, setPrecacheStatus] = useState<string | null>(null);
  const [precacheLoading, setPrecacheLoading] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  useEffect(() => {
    getAdminLojaConfig().then(setConfig).catch((error) => console.error("Erro ao carregar configuração administrativa:", error));
  }, [setConfig]);

  async function handleExportCSV() {
    setExportingCSV(true);
    try {
      const { getPedidos } = await import("./lib/db");
      const orders = await getPedidos();
      const ativos = orders.filter((o) => o.status !== "cancelado" && o.status !== "reembolsado");
      const rows = [["ID", "Data", "Hora", "Status", "Total", "Pagamento", "Cliente", "Telefone", "Itens"]];
      for (const o of ativos) {
        const nome = o.endereco && typeof o.endereco === "object" ? (o.endereco as { nome?: string }).nome || "" : "";
        const tel = o.endereco && typeof o.endereco === "object" ? (o.endereco as { telefone?: string }).telefone || "" : "";
        const itens = o.itens.map((i) => `${i.nome} (${i.tamanho})`).join("; ");
        rows.push([o.id, o.data, o.hora, o.status, String(o.total), o.payment_method || "", nome, tel, itens]);
      }
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao exportar CSV:", err);
    } finally {
      setExportingCSV(false);
    }
  }

  async function handlePrecacheAll() {
    if (precacheLoading) return;
    setPrecacheLoading(true);
    setPrecacheStatus("Cacheando imagens... Isso pode levar alguns minutos.");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");
      const res = await fetch("/api/precache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ batch: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setPrecacheStatus(`✅ ${data.totalCached || 0} produtos processados.${data.totalSkipped > 0 ? ` (${data.totalSkipped} já estavam cacheados)` : ""}`);

      clearCache("produtos");
      const updated = await getProdutos();
      setProdutos(updated);
    } catch (err) {
      console.error("Pre-cache error:", err);
      setPrecacheStatus("❌ Erro ao cachear imagens. Tente novamente.");
    } finally {
      setPrecacheLoading(false);
    }
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "pedidos", label: "Pedidos" },
    { key: "estoque", label: "Estoque" },
    { key: "pacotes", label: "Pacotes" },
    { key: "produtos", label: "Produtos" },
    { key: "promocoes", label: "Promoções" },
    { key: "destaques", label: "Destaques" },
    { key: "cupons", label: "Cupons" },
    { key: "financeiro", label: "Financeiro" },
    { key: "historico", label: "Histórico" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Operação</p><h1 className="mt-1 text-3xl font-black tracking-tight text-primary">Painel RM Imports</h1></div>
        <Link to="/" className="rounded-full border border-border bg-card-bg px-4 py-2 text-sm font-bold text-text-muted no-underline shadow-card transition-colors hover:text-accent">← Voltar à loja</Link>
      </div>
      <div className="carousel-scroll -mx-4 mb-6 flex gap-2 overflow-x-auto border-b border-border px-4 pb-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`min-h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-bold transition-colors ${
              tab === t.key
                ? "bg-primary text-white border-primary"
                : "text-text-main hover:bg-gray-100"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {precacheStatus && (
        <div className="mb-4 p-3 bg-card-bg rounded-md border border-border text-sm text-text-main">
          {precacheStatus}
        </div>
      )}

      {tab === "dashboard" && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handlePrecacheAll}
            disabled={precacheLoading}
            className="min-h-11 cursor-pointer rounded-xl bg-accent px-4 text-sm font-bold text-white transition-colors hover:bg-[#d93648] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {precacheLoading ? "Cacheando..." : "Preparar imagens"}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="min-h-11 cursor-pointer rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {exportingCSV ? "Exportando..." : "Exportar pedidos (CSV)"}
          </button>
        </div>
      )}

      <Suspense fallback={<div className="mx-auto max-w-7xl pt-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3" /><div className="h-64 bg-gray-200 rounded" /></div></div>}>
        {tab === "dashboard" ? (
          <AdminDashboard onNavigate={setTab} />
        ) : tab === "produtos" ? (
          <ProdutoForm produtos={produtos} setProdutos={setProdutos} />
        ) : tab === "destaques" ? (
          <AdminDestaques produtos={produtos} setProdutos={setProdutos} />
        ) : tab === "promocoes" ? (
          <AdminPromocoes produtos={produtos} setProdutos={setProdutos} config={config} setConfig={setConfig} />
        ) : tab === "pedidos" ? (
          <AdminOrders />
        ) : tab === "pacotes" ? (
          <AdminPacotes config={config} />
        ) : tab === "cupons" ? (
          <AdminCupons />
        ) : tab === "financeiro" ? (
          <AdminFinanceiro />
        ) : tab === "estoque" ? (
          <AdminEstoque produtos={produtos} config={config} />
        ) : (
          <AdminHistory />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </CartProvider>
    </BrowserRouter>
  );
}
