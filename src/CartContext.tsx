import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CartItem, Order, OrderAddress } from "./types";
import { gerarId } from "./types";

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  total: number;
  orders: Order[];
  history: Order[];
  createOrder: (endereco: OrderAddress) => Order | null;
  deleteOrder: (id: string) => void;
  updateOrderStatus: (id: string, status: "pendente" | "confirmado") => void;
  confirmDelivery: (id: string) => void;
  deleteHistoryOrder: (id: string) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("ul_cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem("ul_orders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem("ul_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("ul_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("ul_orders", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem("ul_history", JSON.stringify(history));
  }, [history]);

  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => [...prev, item]);
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const total = cart.reduce((sum, item) => sum + item.preco, 0);

  const createOrder = useCallback((endereco: OrderAddress): Order | null => {
    if (cart.length === 0) return null;

    const now = new Date();
    const data = now.toLocaleDateString("pt-BR");
    const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const order: Order = {
      id: gerarId(),
      data,
      hora,
      itens: cart.map((item) => ({
        nome: item.nome,
        tipo: item.tipo,
        temporada: item.temporada,
        tamanho: item.tamanho,
        genero: item.genero,
        personalizado: item.personalizado,
        nomePersonalizado: item.nomePersonalizado,
        numeroPersonalizado: item.numeroPersonalizado,
        preco: item.preco,
        yupooUrl: item.yupooUrl,
      })),
      total,
      status: "pendente",
      endereco,
    };

    setOrders((prev) => [order, ...prev]);
    setCart([]);
    return order;
  }, [cart, total]);

  const deleteOrder = useCallback((id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: "pendente" | "confirmado") => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status } : o))
    );
  }, []);

  const confirmDelivery = useCallback((id: string) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === id);
      if (order) {
        const updated = { ...order, status: "entregue" as const };
        setHistory((h) => [updated, ...h]);
        return prev.filter((o) => o.id !== id);
      }
      return prev;
    });
  }, []);

  const deleteHistoryOrder = useCallback((id: string) => {
    setHistory((prev) => prev.filter((o) => o.id !== id));
  }, []);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, total, orders, history, createOrder, deleteOrder, updateOrderStatus, confirmDelivery, deleteHistoryOrder }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
