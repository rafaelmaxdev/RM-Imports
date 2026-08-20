const STORAGE_KEY = "rm_order_access";

function readTokens(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function saveOrderAccessToken(orderId: string, token: string): void {
  if (!/^UL-[A-Z2-9]{8}$/.test(orderId) || !/^[a-f0-9]{64}$/i.test(token)) return;
  const tokens = readTokens();
  tokens[orderId] = token;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(tokens).slice(-20))));
}

export function getOrderAccessToken(orderId: string): string | null {
  return readTokens()[orderId] || null;
}
