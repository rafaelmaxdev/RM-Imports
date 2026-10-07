/// <reference types="vitest/config" />
import { defineConfig, type Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function ignoreApiDir(): Plugin {
  return {
    name: "ignore-api-dir",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options.ssr) return null;
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
          } catch {
            // A failed role lookup keeps the default non-admin fallback.
          }
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
        const url = new URL(req.url || "/", "http://localhost");
        const match = url.pathname.match(/^\/api\/order(?:\/[^/]+)?$/);
        if (!match) return next();

        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const env = loadEnv(server.config.mode, process.cwd(), "");
          if (process.env.VITE_SUPABASE_URL === undefined && env.VITE_SUPABASE_URL !== undefined) {
            process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
          }
          if (process.env.SUPABASE_SERVICE_ROLE_KEY === undefined && env.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
            process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
          }

          const query: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of url.searchParams) {
            const current = query[key];
            query[key] = current === undefined
              ? value
              : Array.isArray(current)
                ? [...current, value]
                : [current, value];
          }
          if (match[0] !== "/api/order") {
            const segment = match[0].slice("/api/order/".length);
            try {
              query.path = [decodeURIComponent(segment)];
            } catch {
              query.path = [segment];
            }
          }

          const request = Object.assign(req, { query, body: undefined }) as VercelRequest;
          const adapter = res as unknown as VercelResponse;
          Object.assign(adapter, {
            status(code: number) {
              res.statusCode = code;
              return adapter;
            },
            json(payload: unknown) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
              return adapter;
            },
          });

          const { default: handler } = await server.ssrLoadModule("/api/order/[[...path]].ts");
          await handler(request, adapter);
        } catch {
          console.error("[order-api] handler failed");
          if (!res.writableEnded) {
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
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
      "/api/precache": {
        target: "https://rm-imports.vercel.app",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/api/**"],
    },
  },
});
