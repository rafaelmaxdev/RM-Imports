/**
 * Shared utility functions and constants.
 * Single source of truth — import from here instead of duplicating.
 */

/** Combined rename map for product/team names */
export const RENOMEAR: Record<string, string> = {
  "Inter Milan": "Inter de Milão",
  "Ceara Sporting": "Ceará",
  "Ceará Sporting": "Ceará",
  "LFC": "Liverpool",
  "M-U": "Manchester United",
  "Juv": "Juventus",
  "Atlético Juventus": "Atlético Juventus",
};

/** Normalize product/team names using the rename map */
export function normalizeNome(nome: string): string {
  let result = nome;
  Object.entries(RENOMEAR).forEach(([de, para]) => {
    result = result.replace(de, para);
  });
  return result;
}

/** Remove accents/diacritics, symbols, collapse whitespace, lowercase — for search matching */
export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert a value into a URL-friendly slug. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert a season label such as "2025/2026", "25/26", or "2026" to its first year. */
export function parseAnoTemporada(value: string): number {
  const first = value.split("/", 1)[0];
  const year = parseInt(first, 10);
  if (Number.isNaN(year)) return 0;
  return first.length <= 2 ? (year >= 50 ? 1900 + year : 2000 + year) : year;
}

/** Check if ALL words in the query appear in the text (order-independent).
 *  e.g. buscaPorPalavras("cruzeiro manga longa", "manga longa cruzeiro 2026") → true
 */
export function buscaPorPalavras(query: string, text: string): boolean {
  const words = normalizarBusca(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const normalized = normalizarBusca(text);
  return words.every((word) => normalized.includes(word));
}

export function formatarTelefoneBrasileiro(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function normalizarTelefonesWhitelist(value: string): { telefones: string[]; invalido: string | null } {
  const telefones = new Set<string>();
  for (const parte of value.split(/[\n,;]+/)) {
    const entrada = parte.trim();
    if (!entrada) continue;

    let telefone = entrada.replace(/\D/g, "");
    if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`;
    if (!/^55\d{10,11}$/.test(telefone)) return { telefones: [], invalido: entrada };
    telefones.add(telefone);
  }
  return { telefones: [...telefones], invalido: null };
}
