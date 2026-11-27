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

export function getPackageHistoryCosts(
  lines: readonly { orderId: string; index: number; admin: boolean; estimatedUsd: number }[],
  stored: unknown,
  exchangeRate: number,
  subtotal: number | null,
  shipping: number,
  tax: number,
) {
  const saved = getSavedPackageItemCosts(stored, lines);
  const costs = saved ?? lines.map((line) => line.estimatedUsd);
  const totalUsd = costs.reduce((sum, cost) => sum + Math.round(cost * 100), 0) / 100;
  const subtotalCents = Math.round((subtotal ?? totalUsd * exchangeRate) * 100);
  const shares = allocatePackageCostShares(costs, subtotalCents, Math.round(shipping * 100), Math.round(tax * 100));
  const customer = { product: 0, shipping: 0, importation: 0 };

  for (const [index, share] of shares.entries()) {
    if (lines[index].admin) continue;
    customer.product += share.product;
    customer.shipping += share.shipping;
    customer.importation += share.importation;
  }

  return { totalUsd, subtotal: subtotalCents / 100, shares, customer, estimated: saved === null };
}
