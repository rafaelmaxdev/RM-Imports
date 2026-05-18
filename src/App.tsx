import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import ProdutoForm from "./ProdutoForm";
import Loja from "./Loja";
import AdminGate from "./AdminGate";
import AdminOrders from "./AdminOrders";
import AdminHistory from "./AdminHistory";
import OrderConfirmation from "./OrderConfirmation";
import CartSidebar from "./CartSidebar";
import NotFound from "./NotFound";
import { CartProvider, useCart } from "./CartContext";
import { getProdutos } from "./lib/db";
import type { DbProduto } from "./lib/db";
import type { OrderAddress } from "./types";
import "./index.css";

function AppContent() {
  const [produtos, setProdutos] = useState<DbProduto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const navigate = useNavigate();
  const { cart, createOrder } = useCart();

  useEffect(() => {
    getProdutos()
      .then(setProdutos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleCheckout(endereco: OrderAddress) {
    const order = createOrder(endereco);
    if (order) {
      setShowCart(false);
      navigate(`/pedido/${order.id}`);
    }
  }

  return (
    <>
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 bg-primary text-white">
        <Link to="/" className="text-lg font-bold tracking-tight text-white no-underline">
          RM Imports
        </Link>
        <button
          className="relative bg-transparent border border-white/30 text-white px-3 py-2 rounded-md cursor-pointer text-lg hover:bg-white/10 transition-colors"
          onClick={() => setShowCart(true)}
        >
          🛒
          {cart.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-accent text-white text-xs font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </button>
      </nav>

      {loading ? (
        <div className="text-center py-16 text-text-muted text-lg">Carregando...</div>
      ) : (
        <Routes>
          <Route path="/" element={<Loja produtos={produtos} />} />
          <Route
            path="/admin"
            element={
              <AdminGate>
                <AdminPanel produtos={produtos} setProdutos={setProdutos} />
              </AdminGate>
            }
          />
          <Route path="/pedido/:id" element={<OrderConfirmation />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}

      {showCart && (
        <CartSidebar onClose={() => setShowCart(false)} onCheckout={handleCheckout} />
      )}
    </>
  );
}

function AdminPanel({
  produtos,
  setProdutos,
}: {
  produtos: DbProduto[];
  setProdutos: React.Dispatch<React.SetStateAction<DbProduto[]>>;
}) {
  const [tab, setTab] = useState<"produtos" | "pedidos" | "historico">("produtos");

  return (
    <div className="max-w-3xl mx-auto px-4 pt-8">
      <div className="flex gap-2 mb-6 pb-4 border-b border-border">
        {(["produtos", "pedidos", "historico"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 border border-border bg-card-bg rounded-md cursor-pointer text-sm font-semibold transition-colors ${
              tab === t
                ? "bg-primary text-white border-primary"
                : "text-text-main hover:bg-gray-100"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "produtos" ? "Produtos" : t === "pedidos" ? "Pedidos" : "Histórico"}
          </button>
        ))}
        <Link
          to="/"
          className="ml-auto px-4 py-2 text-text-muted hover:text-accent bg-card-bg rounded-md text-sm no-underline transition-colors"
        >
          ← Voltar à Loja
        </Link>
      </div>

      {tab === "produtos" ? (
        <ProdutoForm produtos={produtos} setProdutos={setProdutos} />
      ) : tab === "pedidos" ? (
        <AdminOrders />
      ) : (
        <AdminHistory />
      )}
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
