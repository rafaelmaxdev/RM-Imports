/// <reference types="vitest/config" />
import { defineConfig, type Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function ignoreApiDir(): Plugin {
  return {
    name: "ignore-api-dir",
    enforce: "pre",
    resolveId(id) {
      if (id.startsWith("/api/") || id.startsWith("api/")) {
        return { id, external: true };
      }
    },
  };
}

function devApiPlugin(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const env = loadEnv(server.config.mode, process.cwd(), "");
        const supabaseUrl = env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !serviceKey) return next();

        // /api/check-admin
        if (req.url === "/api/check-admin" && req.method === "GET") {
          const authHeader = req.headers.authorization;
          const token = authHeader?.replace("Bearer ", "");
          if (!token) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ isAdmin: false }));
            return;
          }

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, serviceKey);

          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (authError || !user) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ isAdmin: false }));
            return;
          }

          if (user.app_metadata?.role === "admin") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ isAdmin: true }));
            return;
          }

          let meta: { role?: string } | null = null;
          try {
            const { data } = await supabase.rpc("get_user_role", { uid: user.id });
            meta = data as { role?: string } | null;
          } catch {}
          const isAdmin = meta?.role === "admin";

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ isAdmin }));
          return;
        }

        next();
      });
    },
  };
}

function orderApiPlugin(): Plugin {
  return {
    name: "order-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const isOrderId = req.url?.match(/^\/api\/order\/([^/?#]+)$/);
        const isOrderQuery = req.url?.startsWith("/api/order?");
        if (!isOrderId && !isOrderQuery) return next();

        const env = loadEnv(server.config.mode, process.cwd(), "");
        const supabaseUrl = env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no .env" }));
          return;
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, serviceKey);

        // Handle /api/order?phone=... or /api/order?payment=...
        if (isOrderQuery) {
          const url = new URL(req.url || "/", "http://localhost");
          let phone = url.searchParams.get("phone");
          let payment = url.searchParams.get("payment");
          if (Array.isArray(phone)) phone = phone[0];
          if (Array.isArray(payment)) payment = payment[0];

          if (payment) {
            const pid = payment.trim();
            const { data: order } = await supabase
              .from("pedidos")
              .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
              .eq("mp_payment_id", pid)
              .maybeSingle();
            if (order) {
              const parsed = { ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify([parsed]));
              return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Nenhum pedido encontrado." }));
            return;
          }

          if (phone) {
            const digits = phone.replace(/\D/g, "");
            const last8 = digits.slice(-8);
            const { data: orders } = await supabase
              .from("pedidos")
              .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
              .order("created_at", { ascending: false });
            const filtered = (orders || []).filter((o: any) => {
              if (!o.endereco) return false;
              const addr = typeof o.endereco === "string" ? JSON.parse(o.endereco) : o.endereco;
              const raw = addr.telefone || "";
              const clean = raw.replace(/\D/g, "");
              return clean.includes(digits) || digits.includes(clean) || clean.endsWith(last8) || last8.endsWith(clean);
            });
            const parsed = filtered.map((o: any) => ({ ...o, itens: typeof o.itens === "string" ? JSON.parse(o.itens) : o.itens }));
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(parsed));
            return;
          }

          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Informe telefone ou ID do pagamento." }));
          return;
        }

        // Handle /api/order/:id
        if (!isOrderId) return next();
        const id = decodeURIComponent(isOrderId[1]);
        const { data: order } = await supabase
          .from("pedidos")
          .select("id, data, hora, itens, total, status, payment_method, mp_preference_id, mp_payment_id, pronta_entrega, created_at, endereco")
          .eq("id", id)
          .maybeSingle();

        if (!order) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Pedido não encontrado" }));
          return;
        }

        const parsed = { ...order, itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens };
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify([parsed]));
      });
    },
  };
}

function imageProxyPlugin(): Plugin {
  return {
    name: "image-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/image")) {
          const urlParam = new URL(req.url, "http://localhost").searchParams.get("url");
          if (!urlParam) {
            res.statusCode = 400;
            res.end("Missing url parameter");
            return;
          }
          try {
            const response = await fetch(urlParam, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Referer: "https://minkang.x.yupoo.com/",
              },
            });
            if (!response.ok) {
              res.statusCode = response.status;
              res.end("Failed to fetch image");
              return;
            }
            const buffer = await response.arrayBuffer();
            const contentType =
              response.headers.get("content-type") || "image/jpeg";
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=2592000, stale-while-revalidate=86400");
            res.end(Buffer.from(buffer));
          } catch {
            res.statusCode = 500;
            res.end("Proxy error");
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ignoreApiDir(), orderApiPlugin(), imageProxyPlugin(), devApiPlugin()],
  build: {
    rollupOptions: {
      external: ['mercadopago'],
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  server: {
    proxy: {
      "/api/yupoo": {
        target: "https://minkang.x.yupoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yupoo/, ""),
      },
      "/api/create-preference": {
        target: "https://rm-imports.vercel.app",
        changeOrigin: true,
      },
      "/api/mp-webhook": {
        target: "https://rm-imports.vercel.app",
        changeOrigin: true,
      },
      "/api/refund": {
        target: "https://rm-imports.vercel.app",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/api/**"],
    },
  },
});
