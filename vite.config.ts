/// <reference types="vitest/config" />
import { defineConfig, type Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const OWNER_FINANCE_BODY_LIMIT = 8 * 1024;
const OWNER_FINANCE_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MP_ACCESS_TOKEN",
] as const;

type OwnerFinanceBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; message: string };

function loadOwnerFinanceEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of OWNER_FINANCE_ENV_KEYS) {
    if (process.env[key] === undefined && env[key] !== undefined) {
      process.env[key] = env[key];
    }
  }
}

async function readOwnerFinanceBody(req: NodeJS.ReadableStream & { headers: Record<string, string | string[] | undefined> }): Promise<OwnerFinanceBodyResult> {
  const header = req.headers["content-length"];
  const contentLength = Array.isArray(header) ? header[0] : header;
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0 || !Number.isInteger(length)) {
      return { ok: false, status: 400, message: "Invalid request body" };
    }
    if (length > OWNER_FINANCE_BODY_LIMIT) {
      return { ok: false, status: 413, message: "Request body too large" };
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array);
      totalBytes += buffer.length;
      if (totalBytes > OWNER_FINANCE_BODY_LIMIT) {
        return { ok: false, status: 413, message: "Request body too large" };
      }
      chunks.push(buffer);
    }
  } catch {
    return { ok: false, status: 400, message: "Invalid request body" };
  }

  try {
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, message: "Invalid request body" };
  }
}

function ownerFinanceQuery(url: URL): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    query[key] = current === undefined
      ? value
      : Array.isArray(current)
        ? [...current, value]
        : [current, value];
  }
  return query;
}

function ownerFinanceApiPlugin(): Plugin {
  return {
    name: "owner-finance-api",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (url.pathname !== "/api/owner-finance") return next();

        const query = ownerFinanceQuery(url);
        let body: unknown;
        if (req.method === "POST") {
          const result = await readOwnerFinanceBody(req);
          if (!result.ok) {
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: result.message }));
            return;
          }
          body = result.body;
        }

        try {
          loadOwnerFinanceEnv(server.config.mode);

          const request = Object.assign(req, { query, body }) as VercelRequest;
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

          const { default: handler } = await server.ssrLoadModule("/api/owner-finance.ts");
          await handler(request, adapter);
        } catch {
          if (!res.writableEnded) {
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        }
      });
      const middleware = server.middlewares.stack.pop();
      if (middleware) server.middlewares.stack.unshift(middleware);
    },
  };
}

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
  plugins: [ownerFinanceApiPlugin(), react(), tailwindcss(), ignoreApiDir(), orderApiPlugin(), imageProxyPlugin(), devApiPlugin()],
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
