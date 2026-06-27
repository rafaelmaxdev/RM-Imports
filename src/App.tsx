import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import Loja from "./Loja";
import Footer from "./Footer";
import WhatsAppButton from "./WhatsAppButton";
import { CartProvider, useCart } from "./CartContext";
import useBodyScrollLock from "./hooks/useBodyScrollLock";
import { getProdutos, getLojaConfig } from "./lib/db";
import type { DbProduto } from "./lib/db";
import type { OrderAddress, LojaConfig, PaymentMethod } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { clearCache } from "./lib/cache";
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

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  useEffect(() => {
    Promise.all([
      getProdutos().then(setProdutos).catch(console.error),
      getLojaConfig().then(setConfig).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleCheckout(endereco: OrderAddress, paymentMethod: PaymentMethod, cupom?: { codigo: string; desconto: number }) {
    const order = await createOrder(endereco, paymentMethod, cupom);
    if (order) {
      setShowCart(false);
      navigate(`/pedido/${order.id}`);
    }
  }

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-3 bg-primary text-white shadow-md relative" aria-label="Navegação principal">
        <button
          className={`hamburger-btn bg-transparent border-none cursor-pointer p-2 flex flex-col items-center justify-center gap-[5px] w-10 h-10 ${showMenu ? 'open' : ''}`}
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Menu"
          aria-expanded={showMenu}
        >
          <span className="block w-5 h-[2px] bg-white rounded transition-all duration-300 origin-center" style={showMenu ? { transform: 'translateY(7px) rotate(45deg)' } : {}} />
          <span className="block w-5 h-[2px] bg-white rounded transition-all duration-300" style={showMenu ? { opacity: 0 } : {}} />
          <span className="block w-5 h-[2px] bg-white rounded transition-all duration-300 origin-center" style={showMenu ? { transform: 'translateY(-7px) rotate(-45deg)' } : {}} />
        </button>

        <Link to="/" className="absolute left-1/2 -translate-x-1/2 flex items-center text-white no-underline hover:text-white/90 transition-colors">
          <img src="/logo.png" alt="RM Imports" width={48} height={48} className="h-12 w-12 object-contain" />
        </Link>

        <button
          className="relative bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg cursor-pointer text-lg hover:bg-white/20 hover:border-white/30 transition-all duration-200"
          onClick={() => setShowCart(true)}
          aria-label={`Carrinho${cart.length > 0 ? `, ${cart.length} ${cart.length === 1 ? 'item' : 'itens'}` : ''}`}
        >
          🛒
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
              {cart.length}
            </span>
          )}
        </button>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
      </nav>

      {/* Mobile menu overlay */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/60 z-[1001] animate-menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-primary text-white flex flex-col shadow-lg animate-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/10">
              <span className="text-lg font-bold">Menu</span>
              <button className="bg-transparent border-none text-white text-xl cursor-pointer hover:text-white/80" onClick={() => setShowMenu(false)}>✕</button>
            </div>
            <Link to="/" className="px-5 py-3 text-white no-underline hover:bg-white/10 transition-colors animate-menu-item" onClick={() => setShowMenu(false)}>
              🏠 Loja
            </Link>
            <Link to="/tamanhos" className="px-5 py-3 text-white no-underline hover:bg-white/10 transition-colors animate-menu-item" onClick={() => setShowMenu(false)}>
              📏 Guia de Tamanhos
            </Link>
            <Link
              to="/pronta-entrega"
              className="px-5 py-3 text-white no-underline hover:bg-white/10 transition-colors animate-menu-item"
              onClick={() => setShowMenu(false)}
            >
              📦 Pronta Entrega
            </Link>
            <Link to="/meu-pedido" className="px-5 py-3 text-white no-underline hover:bg-white/10 transition-colors animate-menu-item" onClick={() => setShowMenu(false)}>
              🔍 Meu Pedido
            </Link>
          </div>
        </div>
      )}
      <main className="flex-1">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <Suspense fallback={<LoadingSkeleton />}>
            <Routes>
            <Route path="/" element={<Loja produtos={produtos} config={config} />} />
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

  async function handleExportCSV() {
    setExportingCSV(true);
    try {
      const { getPedidos } = await import("./lib/db");
      const orders = await getPedidos();
      const ativos = orders.filter((o) => o.status !== "cancelado" && o.status !== "reembolsado");
      const rows = [["ID", "Data", "Hora", "Status", "Total", "Pagamento", "Cliente", "Telefone", "Itens"]];
      for (const o of ativos) {
        const nome = o.endereco && typeof o.endereco === "object" ? (o.endereco as any).nome || "" : "";
        const tel = o.endereco && typeof o.endereco === "object" ? (o.endereco as any).telefone || "" : "";
        const itens = o.itens.map((i: any) => `${i.nome} (${i.tamanho})`).join("; ");
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
      let totalCached = 0;
      let totalSkipped = 0;
      let totalProducts = 0;
      let offset = 0;
      let done = false;

      while (!done) {
        setPrecacheStatus(`Cacheando imagens... ${totalCached} processadas, ${totalSkipped} já cacheadas.`);
        const res = await fetch("/api/precache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: true }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        totalCached += data.totalCached || 0;
        totalSkipped += data.skipped || 0;
        totalProducts += data.processed || 0;
        offset = data.nextOffset;
        done = data.done;
      }

      setPrecacheStatus(`✅ ${totalCached} imagens processadas em ${totalProducts} produtos.${totalSkipped > 0 ? ` (${totalSkipped} já estavam cacheados)` : ""}`);

      // Refresh products to get updated cached_image_urls
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
    { key: "dashboard", label: "📊 Dashboard" },
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
    <div className="max-w-3xl mx-auto px-4 pt-8">
      <div className="flex gap-2 mb-6 pb-4 border-b border-border flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 border border-border bg-card-bg rounded-md cursor-pointer text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-primary text-white border-primary"
                : "text-text-main hover:bg-gray-100"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <Link
          to="/"
          className="ml-auto px-4 py-2 text-text-muted hover:text-accent bg-card-bg rounded-md text-sm no-underline transition-colors"
        >
          ← Voltar à Loja
        </Link>
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
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {precacheLoading ? "⏳ Cacheando..." : "🖼️ Pre-cache Todas as Imagens"}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {exportingCSV ? "⏳ Exportando..." : "📥 Exportar Pedidos (CSV)"}
          </button>
        </div>
      )}

      <Suspense fallback={<div className="max-w-3xl mx-auto px-4 pt-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3" /><div className="h-64 bg-gray-200 rounded" /></div></div>}>
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