import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import Loja from "./Loja";
import Footer from "./Footer";
import WhatsAppButton from "./WhatsAppButton";
import { CartProvider, useCart } from "./CartContext";
import { getProdutos, getLojaConfig } from "./lib/db";
import type { DbProduto } from "./lib/db";
import type { OrderAddress, LojaConfig, PaymentMethod } from "./types";
import { DEFAULT_CONFIG } from "./types";
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
const NotFound = lazy(() => import("./NotFound"));

function AppContent() {
  const [produtos, setProdutos] = useState<DbProduto[]>([]);
  const [config, setConfig] = useState<LojaConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const { cart, createOrder } = useCart();

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
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-3 bg-primary text-white shadow-md relative">
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
          <img src="/logo.png" alt="RM Imports" className="h-12 w-12 object-contain" />
        </Link>

        <button
          className="relative bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg cursor-pointer text-lg hover:bg-white/20 hover:border-white/30 transition-all duration-200"
          onClick={() => setShowCart(true)}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1001] animate-menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-primary text-white flex flex-col shadow-lg animate-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/10">
              <span className="text-lg font-bold animate-menu-item">Menu</span>
              <button className="bg-transparent border-none text-white text-xl cursor-pointer hover:text-white/80 animate-menu-item" onClick={() => setShowMenu(false)}>✕</button>
            </div>
            <Link to="/" className="px-5 py-3 text-white no-underline hover:bg-white/10 transition-colors animate-menu-item" onClick={() => setShowMenu(false)}>
              🏠 Loja
            </Link>
            <button
              className="px-5 py-3 text-left text-white hover:bg-white/10 transition-colors cursor-pointer border-none bg-transparent w-full text-base animate-menu-item"
              onClick={() => { setShowMenu(false); }}
            >
              📦 Pronta Entrega <span className="text-xs bg-accent/80 text-white px-1.5 py-0.5 rounded ml-1">Em breve</span>
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-text-muted text-lg">Carregando...</div>
      ) : (
        <Suspense fallback={<div className="text-center py-16 text-text-muted text-lg">Carregando...</div>}>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      )}

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

type AdminTab = "produtos" | "destaques" | "promocoes" | "pedidos" | "pacotes" | "historico";

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

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "produtos", label: "Produtos" },
    { key: "destaques", label: "Destaques" },
    { key: "promocoes", label: "Promoções" },
    { key: "pedidos", label: "Pedidos" },
    { key: "pacotes", label: "Pacotes" },
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

      <Suspense fallback={<div className="text-center py-8 text-text-muted">Carregando...</div>}>
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