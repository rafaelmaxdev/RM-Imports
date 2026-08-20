const APP_URL = process.env.VITE_APP_URL || "https://rm-imports.vercel.app";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
]);

export function getCorsOrigin(
  reqHeaders: Record<string, string | string[] | undefined>
): string {
  const origin = reqHeaders.origin;
  const originStr = Array.isArray(origin) ? origin[0] : origin || "";

  if (!originStr) return APP_URL;

  if (ALLOWED_ORIGINS.has(originStr)) {
    return originStr;
  }
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(originStr)) return originStr;
  return APP_URL;
}

export function setCorsHeaders(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader: (key: string, value: string) => void },
  methods = "GET, OPTIONS"
) {
  res.setHeader("Access-Control-Allow-Origin", getCorsOrigin(req.headers));
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Order-Token");
  res.setHeader("Access-Control-Max-Age", "86400");
}
