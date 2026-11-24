export function fixedPrint(productId: string | undefined): { label: string; price: number } | null {
  if (productId === "f9f2a258-ee87-56f3-af71-670f7d7d9c92") {
    return { label: "Messi #10", price: 20 };
  }
  return null;
}
