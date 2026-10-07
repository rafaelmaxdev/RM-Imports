type OrderItemPriceInput = {
  preco: number;
  precoBase?: number;
};

type PriceAllocation = {
  cents: number;
  remainder: number;
  index: number;
};

function toCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function allocateDiscount(prices: readonly number[], discountCents: number, subtotalCents: number): number[] {
  const allocations: PriceAllocation[] = prices.map((price, index) => {
    const share = discountCents * price;
    return {
      cents: Math.floor(share / subtotalCents),
      remainder: share % subtotalCents,
      index,
    };
  });

  const remaining = discountCents - allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining; i++) allocations[i].cents++;

  return allocations
    .sort((a, b) => a.index - b.index)
    .map((allocation) => allocation.cents);
}

export function getOrderItemPrices(order: {
  itens: readonly OrderItemPriceInput[];
  total: number;
  cupom_desconto?: number;
}): { original: number; final: number }[] {
  const items = Array.isArray(order.itens) ? order.itens : [];
  const prices = items.map((item) => toCents(item.preco) ?? 0);
  const subtotalCents = prices.reduce((sum, price) => sum + price, 0);
  const totalCents = toCents(order.total);
  const discountCents = totalCents !== null && totalCents < subtotalCents
    ? subtotalCents - totalCents
    : 0;
  const itemDiscounts = discountCents > 0 && subtotalCents > 0
    ? allocateDiscount(prices, discountCents, subtotalCents)
    : prices.map(() => 0);

  return items.map((item, index) => {
    const baseCents = toCents(item.precoBase);
    const originalCents = Math.max(prices[index], baseCents ?? prices[index]);
    return {
      original: originalCents / 100,
      final: (prices[index] - itemDiscounts[index]) / 100,
    };
  });
}
