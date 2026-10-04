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
