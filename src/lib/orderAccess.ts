const STORAGE_KEY = "rm_order_access";
const ORDER_ID_PATTERN = /^UL-[A-Z2-9]{8}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_ENTRIES = 20;

type StorageArea = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(kind: "localStorage" | "sessionStorage"): StorageArea | null {
  try {
    return globalThis[kind];
  } catch {
    return null;
  }
}

export function isValidOrderId(orderId: unknown): orderId is string {
  return typeof orderId === "string" && ORDER_ID_PATTERN.test(orderId);
}

export function isValidOrderAccessToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function readTokens(storage: StorageArea | null): Record<string, string> {
  if (!storage) return {};

  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([orderId, token]) => isValidOrderId(orderId) && isValidOrderAccessToken(token))
        .slice(-MAX_ENTRIES),
    );
  } catch {
    return {};
  }
}

function writeTokens(storage: StorageArea | null, tokens: Record<string, string>): boolean {
  if (!storage) return false;

  try {
    const validTokens = Object.fromEntries(
      Object.entries(tokens)
        .filter(([orderId, token]) => isValidOrderId(orderId) && isValidOrderAccessToken(token))
        .slice(-MAX_ENTRIES),
    );
    storage.setItem(STORAGE_KEY, JSON.stringify(validTokens));
    return true;
  } catch {
    return false;
  }
}

function writeToken(storage: StorageArea | null, orderId: string, token: string): boolean {
  const tokens = readTokens(storage);
  tokens[orderId] = token;
  return writeTokens(storage, tokens);
}

function removeToken(storage: StorageArea | null, orderId: string): boolean {
  if (!storage) return false;

  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return true;
    delete (parsed as Record<string, unknown>)[orderId];
    return writeTokens(storage, parsed as Record<string, string>);
  } catch {
    return false;
  }
}

export function saveOrderAccessToken(orderId: string, token: string, persist = true): void {
  if (!isValidOrderId(orderId) || !isValidOrderAccessToken(token)) return;

  const local = getStorage("localStorage");
  const session = getStorage("sessionStorage");

  if (persist) {
    if (writeToken(local, orderId, token)) removeToken(session, orderId);
    else writeToken(session, orderId, token);
    return;
  }

  writeToken(session, orderId, token);
  removeToken(local, orderId);
}

export function getPersistentOrderAccessToken(orderId: string): string | null {
  if (!isValidOrderId(orderId)) return null;
  return readTokens(getStorage("localStorage"))[orderId] ?? null;
}

export function getOrderAccessToken(orderId: string): string | null {
  if (!isValidOrderId(orderId)) return null;
  return readTokens(getStorage("sessionStorage"))[orderId]
    ?? getPersistentOrderAccessToken(orderId);
}

export function removeOrderAccessToken(orderId: string): void {
  if (!isValidOrderId(orderId)) return;
  removeToken(getStorage("sessionStorage"), orderId);
  removeToken(getStorage("localStorage"), orderId);
}
