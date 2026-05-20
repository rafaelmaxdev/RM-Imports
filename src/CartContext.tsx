import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CartItem, Order, OrderAddress } from "./types";
import { gerarId } from "./types";
import { createPedido } from "./lib/db";

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  total: number;
  createOrder: (endereco: OrderAddress) => Promise<Order | null>;
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

  useEffect(() => {
    localStorage.setItem("ul_cart", JSON.stringify(cart));
  }, [cart]);

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

  const createOrder = useCallback(async (endereco: OrderAddress): Promise<Order | null> => {
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

    try {
      const saved = await createPedido(order);
      setCart([]);
      return saved;
    } catch (err) {
      console.error("Erro ao criar pedido:", err);
      return null;
    }
  }, [cart, total]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, total, createOrder }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}