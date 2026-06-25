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
      // Handle /api/order/:id locally in dev — avoids proxying to Vercel
      // which has a broken catch-all route that can't extract the order ID
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/order\/([^/?#]+)$/);
        if (!match) return next();

        const id = decodeURIComponent(match[1]);

        // Load env vars via Vite's loadEnv (respects .env files)
        const env = loadEnv(server.config.mode, process.cwd(), "");
        const supabaseUrl = env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !serviceKey) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Missing Supabase env vars" }));
          return;
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, serviceKey);

        try {
          const { data: order, error } = await supabase
            .from("pedidos")
            .select("*")
            .eq("id", id)
            .single();

          if (error || !order) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Order not found" }));
            return;
          }

          const parsed = {
            ...order,
            itens: typeof order.itens === "string" ? JSON.parse(order.itens) : order.itens,
            endereco: order.endereco
              ? (typeof order.endereco === "string" ? JSON.parse(order.endereco) : order.endereco)
              : null,
          };

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify(parsed));
        } catch (err) {
          console.error("Error fetching order in dev middleware:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
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
