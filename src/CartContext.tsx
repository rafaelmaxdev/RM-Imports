import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { CartItem, Order, OrderAddress, PaymentMethod } from "./types";
import { gerarId } from "./types";
import { createPedido } from "./lib/db";

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  total: number;
  createOrder: (endereco: OrderAddress, paymentMethod: PaymentMethod) => Promise<Order | null>;
  createMPPreference: (orderId: string) => Promise<{ preferenceId: string; initPoint: string } | null>;
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

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.preco, 0), [cart]);

  const createMPPreference = useCallback(
    async (orderId: string): Promise<{ preferenceId: string; initPoint: string } | null> => {
      try {
        const res = await fetch("/api/create-preference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((item) => ({
              title: `${item.nome} (${item.tipo} - ${item.tamanho})`,
              quantity: 1,
              unit_price: item.preco,
            })),
            orderId,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          console.error("MP preference error:", err);
          return null;
        }

        return await res.json();
      } catch (err) {
        console.error("Error creating MP preference:", err);
        return null;
      }
    },
    [cart]
  );

  const createOrder = useCallback(
    async (endereco: OrderAddress, paymentMethod: PaymentMethod): Promise<Order | null> => {
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
          feminino: item.feminino,
        })),
        total,
        status: "pendente",
        endereco,
        payment_method: paymentMethod,
      };

      try {
        // Create Mercado Pago preference for all payment methods
        const mpResult = await createMPPreference(order.id);
        if (mpResult) {
          order.mp_preference_id = mpResult.preferenceId;
        }

        const saved = await createPedido(order);
        setCart([]);
        return saved;
      } catch (err) {
        console.error("Erro ao criar pedido:", err);
        return null;
      }
    },
    [cart, total, createMPPreference]
  );

  const contextValue = useMemo(
    () => ({ cart, addToCart, removeFromCart, clearCart, total, createOrder, createMPPreference }),
    [cart, addToCart, removeFromCart, clearCart, total, createOrder, createMPPreference]
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}