export function getSavedPackageItemCosts(
  stored: unknown,
  lines: readonly { orderId: string; index: number }[],
): number[] | null {
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || !lines.length) return null;
  const values = lines.map(({ orderId, index }) => (stored as Record<string, unknown>)[`${orderId}-${index}`]);
  return values.every((cost): cost is number => typeof cost === "number" && cost >= 0 && Number.isSafeInteger(Math.round(cost * 100)))
    ? values : null;
}

export function allocatePackageCostShares(costsUsd: readonly number[], subtotalCents: number, shippingCents: number, taxCents: number) {
  const costs = costsUsd.map((cost) => Math.round(cost * 100));
  const totalUsd = costs.reduce((sum, cost) => sum + cost, 0);
  let runningCost = 0;
  let previousShare = 0;
  return costs.map((cost, index) => {
    runningCost += cost;
    const share = totalUsd ? runningCost / totalUsd : (index + 1) / costs.length;
    // Differences between rounded cumulative amounts preserve every cent of the total.
    const allocate = (amount: number) => Math.round(amount * share) - Math.round(amount * previousShare);
    const result = { product: allocate(subtotalCents), shipping: allocate(shippingCents), importation: allocate(taxCents) };
    previousShare = share;
    return result;
  });
}

export function calculatePackageCosts(costsUsd: number[], exchangeRate: number | null, shipping: number | null, tax: number | null) {
  const totalUsd = costsUsd.reduce((sum, cost) => sum + Math.round(cost * 100), 0);
  const subtotal = exchangeRate && costsUsd.length ? Math.round(totalUsd * exchangeRate) : null;
  const shippingCents = Math.round((shipping ?? 0) * 100);
  const taxCents = Math.round((tax ?? 0) * 100);
  const items = allocatePackageCostShares(costsUsd, subtotal ?? 0, shippingCents, taxCents).map((share) => ({
    shipping: share.shipping / 100, tax: share.importation / 100,
    final: subtotal === null ? null : (share.product + share.shipping + share.importation) / 100,
  }));
  return {
    totalUsd: totalUsd / 100,
    subtotal: subtotal === null ? null : subtotal / 100,
    final: subtotal === null ? null : (subtotal + shippingCents + taxCents) / 100,
    items,
  };
}
