const APP_URL = process.env.VITE_APP_URL || "https://rm-imports.vercel.app";

export function getCorsOrigin(
  reqHeaders: Record<string, string | string[] | undefined>
): string {
  const origin = reqHeaders.origin;
  const originStr = Array.isArray(origin) ? origin[0] : origin || "";

  if (!originStr) return APP_URL;

  // Allow production URL, Vercel preview deployments, and localhost dev servers
  if (
    originStr === APP_URL ||
    originStr.endsWith(".vercel.app") ||
    originStr.startsWith("http://localhost:")
  ) {
    return originStr;
  }
  return APP_URL;
}

export function setCorsHeaders(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader: (key: string, value: string) => void },
  methods = "GET, OPTIONS"
) {
  res.setHeader("Access-Control-Allow-Origin", getCorsOrigin(req.headers));
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}