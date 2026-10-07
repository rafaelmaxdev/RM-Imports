const LAST_TRACKED_ORDER_KEY = "rm_last_tracked_order";
const ORDER_ID_PATTERN = /^UL-[A-Z2-9]{8}$/;

type StorageArea = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getLocalStorage(): StorageArea | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function isValidTrackedOrderId(orderId: unknown): orderId is string {
  return typeof orderId === "string" && ORDER_ID_PATTERN.test(orderId);
}

export function buildOrderTrackingLink(origin: string, orderId: string): string {
  if (!isValidTrackedOrderId(orderId)) throw new Error("ID do pedido inválido.");

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("Origem inválida.");
  }

  if (!/^https?:$/.test(parsedOrigin.protocol) || parsedOrigin.username || parsedOrigin.password) {
    throw new Error("Origem inválida.");
  }

  const url = new URL("/meu-pedido", parsedOrigin.origin);
  url.searchParams.set("pedido", orderId);
  return url.toString();
}

export function parseOrderTrackingId(search: string | URLSearchParams | null | undefined): string | null {
  if (!search) return null;
  const value = typeof search === "string" ? new URLSearchParams(search).get("pedido") : search.get("pedido");
  return isValidTrackedOrderId(value) ? value : null;
}

export function rememberLastTrackedOrder(orderId: string): void {
  if (!isValidTrackedOrderId(orderId)) return;

  try {
    getLocalStorage()?.setItem(LAST_TRACKED_ORDER_KEY, JSON.stringify({ orderId }));
  } catch {
    // Storage can be unavailable or blocked; tracking still works for this visit.
  }
}

export function getLastTrackedOrderId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const parsed: unknown = JSON.parse(storage.getItem(LAST_TRACKED_ORDER_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const orderId = (parsed as { orderId?: unknown }).orderId;
    return isValidTrackedOrderId(orderId) ? orderId : null;
  } catch {
    return null;
  }
}

export function clearLastTrackedOrder(): void {
  try {
    getLocalStorage()?.removeItem(LAST_TRACKED_ORDER_KEY);
  } catch {
    // Storage can be unavailable or blocked.
  }
}
