import { fixedPrint } from "../../server/lib/fixed-print";
import { nbaPlayer } from "../../server/lib/nba-jerseys";
import { TIPOS_SEM_PERSONALIZACAO } from "../types";

export function blackFridayPrintLabel(product: { id: string; nome: string; tipo: string }): string | null {
  const print = fixedPrint(product.id);
  if (print) return print.price > 0 ? "Estampa grátis" : null;
  if (TIPOS_SEM_PERSONALIZACAO.includes(product.tipo) || nbaPlayer(product)) return null;
  return "Personalização grátis";
}

export function promotionLabels(
  team: string,
  campaignName?: string | null,
  replaceTeam = true,
): { title: string; subtitle: string | null } {
  const name = campaignName?.trim() ?? "";
  return {
    title: name || team,
    subtitle: name && !replaceTeam ? team : null,
  };
}
