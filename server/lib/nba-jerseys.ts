interface JerseyProduct {
  id?: string;
  nome?: string;
  liga?: string;
  time?: string;
  temporada?: string;
  tipo: string;
}

/** Imported player jerseys use a fixed suffix; the model includes edition and color. */
export function nbaPlayer(product: JerseyProduct): { model: string; label: string } | null {
  if (product.tipo !== "NBA") return null;
  const match = product.nome?.match(/^(.+) — ([^#\n]+) #(\d{1,2})$/u);
  return match ? { model: match[1], label: `${match[2]} #${match[3]}` } : null;
}

export function nbaPlayerOptions<T extends JerseyProduct>(product: T, products: readonly T[]): T[] {
  const player = nbaPlayer(product);
  if (!player) return [];
  return products.filter((candidate) =>
    candidate.liga === product.liga && candidate.time === product.time
    && candidate.temporada === product.temporada && nbaPlayer(candidate)?.model === player.model,
  ).sort((a, b) => nbaPlayer(a)!.label.localeCompare(nbaPlayer(b)!.label, "pt-BR"));
}
