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

/** Remove accents/diacritics, /, (), collapse whitespace, lowercase — for search matching */
export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}