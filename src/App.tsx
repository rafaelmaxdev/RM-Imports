import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import ProdutoForm from "./ProdutoForm";
import Loja from "./Loja";
import AdminGate from "./AdminGate";
import AdminOrders from "./AdminOrders";
import AdminHistory from "./AdminHistory";
import OrderConfirmation from "./OrderConfirmation";
import CartSidebar from "./CartSidebar";
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
      <nav className="navbar">
        <Link to="/" className="navbar-brand">RM Imports</Link>
        <button className="cart-btn" onClick={() => setShowCart(true)}>
          🛒 {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
        </button>
      </nav>
      {loading ? (
        <div className="loading-page">Carregando...</div>
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
    <div className="admin-panel">
      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "produtos" ? "active" : ""}`}
          onClick={() => setTab("produtos")}
        >
          Produtos
        </button>
        <button
          className={`admin-tab ${tab === "pedidos" ? "active" : ""}`}
          onClick={() => setTab("pedidos")}
        >
          Pedidos
        </button>
        <button
          className={`admin-tab ${tab === "historico" ? "active" : ""}`}
          onClick={() => setTab("historico")}
        >
          Histórico
        </button>
        <Link to="/" className="admin-tab admin-tab-exit">
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
