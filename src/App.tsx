import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
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
const ProntaEntrega = lazy(() => import("./ProntaEntrega"));
const NotFound = lazy(() => import("./NotFound"));
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

  useBodyScrollLock(showMenu || showCart);

  useEffect(() => {
    Promise.all([
      getProdutos().then(setProdutos).catch(console.error),
      getLojaConfig().then(setConfig).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleCheckout(endereco: OrderAddress, paymentMethod: PaymentMethod) {
    const order = await createOrder(endereco, paymentMethod);
    if (order) {
      setShowCart(false);
      navigate(`/pedido/${order.id}`);
    }
  }

  return (
    <>
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
          </div>
        </div>
      )}

      <main>
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
    </>
  );
}

type AdminTab = "produtos" | "destaques" | "promocoes" | "pedidos" | "pacotes" | "estoque" | "historico";

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
  const [tab, setTab] = useState<AdminTab>("produtos");
  const [precacheStatus, setPrecacheStatus] = useState<string | null>(null);
  const [precacheLoading, setPrecacheLoading] = useState(false);

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
        const res = await fetch("/api/precache-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10, offset }),
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
    { key: "produtos", label: "Produtos" },
    { key: "destaques", label: "Destaques" },
    { key: "promocoes", label: "Promoções" },
    { key: "pedidos", label: "Pedidos" },
    { key: "pacotes", label: "Pacotes" },
    { key: "estoque", label: "Estoque" },
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

      <div className="mb-4">
        <button
          onClick={handlePrecacheAll}
          disabled={precacheLoading}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {precacheLoading ? "⏳ Cacheando..." : "🖼️ Pre-cache Todas as Imagens"}
        </button>
      </div>

      <Suspense fallback={<div className="max-w-3xl mx-auto px-4 pt-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3" /><div className="h-64 bg-gray-200 rounded" /></div></div>}>
        {tab === "produtos" ? (
          <ProdutoForm produtos={produtos} setProdutos={setProdutos} />
        ) : tab === "destaques" ? (
          <AdminDestaques produtos={produtos} setProdutos={setProdutos} />
        ) : tab === "promocoes" ? (
          <AdminPromocoes produtos={produtos} setProdutos={setProdutos} config={config} setConfig={setConfig} />
        ) : tab === "pedidos" ? (
          <AdminOrders />
        ) : tab === "pacotes" ? (
          <AdminPacotes />
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
        <AppContent />
      </CartProvider>
    </BrowserRouter>
  );
}