import { PACKAGE_NEXT_STATUS, PACKAGE_STATUS_PIPELINE } from "./status";

export function getPackageStatusAfterOrderAdvance(
  pacote: { status: string; pedido_ids: string[] },
  orders: readonly { id: string; status: string }[],
  advancedOrderId: string,
  nextStatus: string,
): string | null {
  if (PACKAGE_NEXT_STATUS[pacote.status] !== nextStatus) return null;
  if (pacote.pedido_ids.length === 0 || !pacote.pedido_ids.includes(advancedOrderId)) return null;

  const ordersById = new Map(orders.map((order) => [order.id, order]));
  if (!pacote.pedido_ids.every((id) => ordersById.has(id))) return null;

  const nextIndex = PACKAGE_STATUS_PIPELINE.indexOf(nextStatus as typeof PACKAGE_STATUS_PIPELINE[number]);
  if (nextIndex < 0) return null;

  const allAdvanced = pacote.pedido_ids.every((id) => {
    const order = ordersById.get(id);
    if (!order) return false;
    const status = id === advancedOrderId ? nextStatus : order.status;
    const statusIndex = PACKAGE_STATUS_PIPELINE.indexOf(status as typeof PACKAGE_STATUS_PIPELINE[number]);
    return statusIndex >= nextIndex;
  });

  return allAdvanced ? nextStatus : null;
}
