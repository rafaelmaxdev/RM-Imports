import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { CartItem, Order, OrderAddress, PaymentMethod } from "./types";
import { gerarId } from "./types";
import { saveOrderAccessToken } from "./lib/orderAccess";
import { track } from "@vercel/analytics";

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  total: number;
  createOrder: (endereco: OrderAddress, paymentMethod: PaymentMethod, cupom?: { codigo: string; desconto: number }) => Promise<Order | null>;
  createMPPreference: (orderId: string, orderAccessToken: string) => Promise<{ preferenceId: string; initPoint: string } | null>;
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
  const [cartNotification, setCartNotification] = useState<{ nome: string; id: number } | null>(null);
  const notificationId = useRef(0);

  useEffect(() => {
    localStorage.setItem("ul_cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => [...prev, item]);
    setCartNotification({ nome: item.nome, id: ++notificationId.current });
  }, []);

  useEffect(() => {
    if (!cartNotification) return;
    const timer = window.setTimeout(() => setCartNotification(null), 2500);
    return () => window.clearTimeout(timer);
  }, [cartNotification]);

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.preco, 0), [cart]);

  const createMPPreference = useCallback(
    async (orderId: string, orderAccessToken: string): Promise<{ preferenceId: string; initPoint: string } | null> => {
      try {
        const res = await fetch("/api/create-preference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, orderAccessToken }),
        });

        if (!res.ok) {
          const err = await res.json();
          console.error("MP preference error:", res.status, err);
          return null;
        }

        return await res.json();
      } catch (err) {
        console.error("Error creating MP preference:", err);
        return null;
      }
    },
    []
  );

  const createOrder = useCallback(
    async (endereco: OrderAddress, paymentMethod: PaymentMethod, cupom?: { codigo: string; desconto: number }): Promise<Order | null> => {
      if (cart.length === 0) return null;

      const orderId = gerarId();
      const items = cart.map((item) => ({
        productId: item.productId,
        tamanho: item.tamanho,
        genero: item.genero,
        personalizado: item.personalizado,
        ...(item.personalizado
          ? {
              nomePersonalizado: item.nomePersonalizado,
              numeroPersonalizado: item.numeroPersonalizado,
            }
          : {}),
        prontaEntrega: item.prontaEntrega ?? false,
      }));

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          address: endereco,
          paymentMethod,
          couponCode: cupom?.codigo,
          items,
        }),
      });
      const data = (await res.json()) as { order?: Order; orderAccessToken?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Não foi possível criar o pedido.");
      }

      const order = data.order;
      if (!order) throw new Error("Não foi possível criar o pedido.");
      const orderAccessToken = data.orderAccessToken;
      if (!orderAccessToken) throw new Error("Não foi possível proteger o acesso ao pedido.");
      saveOrderAccessToken(order.id, orderAccessToken);
      track("checkout_created", {
        order_id: order.id,
        value: order.total,
        item_count: order.itens.length,
        payment_method: paymentMethod,
      });

      let mpResult: { preferenceId: string; initPoint: string } | null = null;
      try {
        mpResult = await createMPPreference(order.id, orderAccessToken);
      } catch (mpErr) {
        console.error("Erro ao gerar preferência de pagamento:", mpErr);
      }

      const securedOrder = { ...order, orderAccessToken };
      const saved = mpResult ? { ...securedOrder, mp_preference_id: mpResult.preferenceId } : securedOrder;
      setCart([]);
      return saved;
    },
    [cart, createMPPreference]
  );

  const contextValue = useMemo(
    () => ({ cart, addToCart, removeFromCart, clearCart, total, createOrder, createMPPreference }),
    [cart, addToCart, removeFromCart, clearCart, total, createOrder, createMPPreference]
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
      {cartNotification && (
        <div
          className="fixed left-0 w-screen bottom-20 z-[2100] flex justify-center px-4 pointer-events-none sm:bottom-6"
        >
          <div
            key={cartNotification.id}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="w-full max-w-sm animate-cart-toast rounded-md bg-primary px-4 py-3 text-white shadow-lg"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-lg leading-5">✓</span>
              <div className="min-w-0">
                <p className="font-semibold">Adicionado ao carrinho</p>
                <p className="line-clamp-2 text-sm">{cartNotification.nome}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </CartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
