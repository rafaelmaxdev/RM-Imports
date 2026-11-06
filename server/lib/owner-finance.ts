import { allocatePackageCostShares, getSavedPackageItemCosts } from "../../src/lib/packageCosts.js";

export const OWNER_FINANCE_INPUT_ERROR = "Dados financeiros inválidos.";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const IN_PROGRESS = new Set(["pago", "enviado_fornecedor", "em_producao", "a_caminho", "em_estoque", "em_entrega"]);
const SOURCE_KEYS = ["orders", "packages", "stock", "products", "config", "extras"] as const;

export interface OwnerProfitSummary {
  profitCents: number;
  revenueCents: number;
  productCostCents: number;
  shippingCostCents: number;
  importCostCents: number;
  mpFeeCents: number;
  commissionCents: number;
  extraCostCents: number;
  eligibleOrderCount: number;
  awaitingCostCount: number;
  awaitingFeeCount: number;
  pendingOrderCount: number;
  pendingRevenueCents: number;
}

export interface PaymentOrderForVerification {
  id: string;
  mp_payment_id: string;
}

export interface OwnerBalance {
  entitlementCents: number;
  withdrawnCents: number;
  balanceCents: number;
}

export interface OwnerBalances {
  retainedStoreCents: number;
  owners: { rafael: OwnerBalance; renan: OwnerBalance };
}

interface Row { [key: string]: unknown }
interface SourceRows { [key: string]: Row[] }
interface OrderInfo { id: string; status: string; row: Row; items: Row[] | null }
interface CostShare { product: number; shipping: number; importation: number }
interface PackageInfo { ids: string[]; valid: boolean; shares: Map<string, CostShare> }
interface StockInfo {
  productId: string;
  size: string;
  personalized: boolean;
  female: boolean;
  name: string;
  number: string;
  costCents: number | null;
}
interface ConfigWeights { base: Map<string, number>; personalization: Map<string, number> }

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidFinanceData(): never {
  throw new Error(OWNER_FINANCE_INPUT_ERROR);
}

function readSources(value: unknown): SourceRows {
  if (!isRecord(value)) invalidFinanceData();
  const result: SourceRows = {};
  for (const key of SOURCE_KEYS) {
    const raw = value[key];
    if (!Array.isArray(raw)) invalidFinanceData();
    const rows: Row[] = [];
    for (const row of raw) {
      if (!isRecord(row)) invalidFinanceData();
      rows.push(row);
    }
    result[key] = rows;
  }
  return result;
}

function add(left: number, right: number): number {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : invalidFinanceData();
}

function multiply(left: number, right: number): number {
  const result = left * right;
  return Number.isSafeInteger(result) ? result : invalidFinanceData();
}

function subtract(start: number, values: readonly number[]): number {
  let result = start;
  for (const value of values) {
    result -= value;
    if (!Number.isSafeInteger(result)) invalidFinanceData();
  }
  return result;
}

function moneyToCents(value: unknown): number | null {
  if (value === null || value === undefined || typeof value !== "number") return null;
  if (!Number.isFinite(value)) invalidFinanceData();
  if (value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : invalidFinanceData();
}

function id(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 ? result : null;
}

function arrayValue(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function itemsForOrder(row: Row): Row[] | null {
  const parsed = arrayValue(row.itens);
  if (parsed === null) return null;
  const items: Row[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) return null;
    items.push(item);
  }
  return items;
}

function normalizedText(value: unknown): string | null {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return null;
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizedSize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").trim().toLocaleUpperCase();
  return result || null;
}

function parseOrders(rows: readonly Row[]): OrderInfo[] {
  const result: OrderInfo[] = [];
  for (const row of rows) {
    const orderId = id(row.id);
    if (orderId === null || typeof row.status !== "string") continue;
    result.push({ id: orderId, status: row.status, row, items: itemsForOrder(row) });
  }
  return result;
}

function packageMemberIds(value: unknown): { ids: string[]; valid: boolean } {
  const parsed = arrayValue(value);
  if (parsed === null || parsed.length === 0) return { ids: [], valid: false };
  const ids: string[] = [];
  let valid = true;
  for (const member of parsed) {
    const memberId = id(member);
    if (memberId === null) valid = false;
    else ids.push(memberId);
  }
  if (new Set(ids).size !== ids.length) valid = false;
  return { ids, valid };
}

function numericConfig(value: unknown): Map<string, number> {
  const result = new Map<string, number>();
  if (!isRecord(value)) return result;
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= MAX_SAFE) result.set(key, raw);
  }
  return result;
}

function parseConfig(rows: readonly Row[]): ConfigWeights {
  const result: ConfigWeights = { base: new Map(), personalization: new Map() };
  for (const row of rows) {
    if (typeof row.key !== "string") invalidFinanceData();
    const values = numericConfig(row.value);
    const target = row.key === "custo_base" ? result.base : row.key === "personalizacao_custo" ? result.personalization : null;
    if (target) for (const [key, value] of values) target.set(key, value);
  }
  return result;
}

function itemWeight(item: Row, config: ConfigWeights): number | null {
  if (typeof item.tipo !== "string") return null;
  const base = config.base.get(item.tipo);
  if (base === undefined) return null;
  if (item.personalizado === false) return base > 0 ? base : null;
  if (item.personalizado !== true) return null;
  const personalization = config.personalization.get(item.tipo);
  if (personalization === undefined) return null;
  const total = base + personalization;
  return Number.isFinite(total) && total > 0 && total <= MAX_SAFE ? total : null;
}

function allocate(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const integerWeights = weights.map((weight) => {
    const cents = moneyToCents(weight);
    if (cents === null || cents <= 0) invalidFinanceData();
    return BigInt(cents);
  });
  const weightTotal = integerWeights.reduce((sum, weight) => sum + weight, 0n);
  const parts = integerWeights.map((weight, index) => {
    const numerator = BigInt(total) * weight;
    return { cents: Number(numerator / weightTotal), remainder: numerator % weightTotal, index };
  });
  const remaining = total - parts.reduce((sum, part) => add(sum, part.cents), 0);
  if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > parts.length) invalidFinanceData();
  parts.sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index
    : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < remaining; index++) parts[index].cents++;
  parts.sort((a, b) => a.index - b.index);
  return parts.map((part) => part.cents);
}

function packageShares(
  ids: readonly string[],
  orders: ReadonlyMap<string, OrderInfo>,
  product: number,
  shipping: number,
  importation: number,
  config: ConfigWeights,
  storedItemCosts: unknown,
): Map<string, CostShare> {
  const flat: { orderId: string; index: number; item: Row }[] = [];
  for (const orderId of ids) {
    const order = orders.get(orderId);
    if (!order?.items) return new Map();
    order.items.forEach((item, index) => flat.push({ orderId, index, item }));
  }
  const saved = getSavedPackageItemCosts(storedItemCosts, flat);
  let allocations: CostShare[];
  if (saved) {
    allocations = allocatePackageCostShares(saved, product, shipping, importation);
  } else {
    const configured = flat.map(({ item }) => itemWeight(item, config));
    const weights = configured.every((weight): weight is number => weight !== null && weight > 0)
      ? configured : flat.map(() => 1);
    const products = allocate(product, weights), freight = allocate(shipping, weights), taxes = allocate(importation, weights);
    allocations = flat.map((_, index) => ({ product: products[index], shipping: freight[index], importation: taxes[index] }));
  }
  const shares = new Map<string, CostShare>();
  for (let index = 0; index < flat.length; index++) {
    const orderId = flat[index].orderId;
    const share = shares.get(orderId) ?? { product: 0, shipping: 0, importation: 0 };
    share.product = add(share.product, allocations[index].product);
    share.shipping = add(share.shipping, allocations[index].shipping);
    share.importation = add(share.importation, allocations[index].importation);
    shares.set(orderId, share);
  }
  return shares;
}

function packageMemberships(rows: readonly Row[], orders: readonly OrderInfo[], config: ConfigWeights): Map<string, PackageInfo[]> {
  const byId = new Map<string, OrderInfo>();
  const duplicateIds = new Set<string>();
  for (const order of orders) {
    if (byId.has(order.id)) duplicateIds.add(order.id);
    else byId.set(order.id, order);
  }
  const memberships = new Map<string, PackageInfo[]>();
  for (const row of rows) {
    const members = packageMemberIds(row.pedido_ids);
    const packageInfo: PackageInfo = { ids: members.ids, valid: members.valid, shares: new Map() };
    const memberOrders = members.ids.map((orderId) => byId.get(orderId));
    if (memberOrders.some((order) => order === undefined) || members.ids.some((orderId) => duplicateIds.has(orderId))) packageInfo.valid = false;
    const product = moneyToCents(row.custo);
    const shipping = moneyToCents(row.frete);
    const importation = moneyToCents(row.taxa_importacao);
    if (typeof row.custo !== "number" || row.custo <= 0 || product === null || shipping === null || importation === null) packageInfo.valid = false;
    if (memberOrders.some((order) => !order?.items || order.items.length === 0)) packageInfo.valid = false;
    if (packageInfo.valid) {
      packageInfo.shares = packageShares(members.ids, byId, product!, shipping!, importation!, config, row.custos_itens_usd);
      if (packageInfo.shares.size !== members.ids.length) packageInfo.valid = false;
    }
    for (const orderId of new Set(members.ids)) {
      const list = memberships.get(orderId) ?? [];
      list.push(packageInfo);
      memberships.set(orderId, list);
    }
  }
  return memberships;
}

function products(rows: readonly Row[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const productId = id(row.id);
    const name = normalizedText(row.nome);
    if (productId === null || name === null || name === "") continue;
    const ids = result.get(name) ?? new Set<string>();
    ids.add(productId);
    result.set(name, ids);
  }
  return result;
}

function stock(rows: readonly Row[]): StockInfo[] {
  const result: StockInfo[] = [];
  for (const row of rows) {
    const productId = id(row.produto_id);
    const size = normalizedSize(row.tamanho);
    const name = normalizedText(row.nome_personalizado);
    const number = normalizedText(row.numero_personalizado);
    const costCents = moneyToCents(row.custo);
    if (productId === null || size === null || typeof row.personalizado !== "boolean" || typeof row.feminino !== "boolean" || name === null || number === null) continue;
    result.push({ productId, size, personalized: row.personalizado, female: row.feminino, name, number, costCents });
  }
  return result;
}

function itemProductId(item: Row, productNames: ReadonlyMap<string, Set<string>>): string | null {
  const direct = id(item.productId);
  if (direct !== null) return direct;
  const name = normalizedText(item.nome);
  if (name === null || name === "") return null;
  const ids = productNames.get(name);
  return ids?.size === 1 ? [...ids][0] : null;
}

function itemIsFemale(item: Row): boolean | null {
  if (typeof item.feminino === "boolean") return item.feminino;
  const gender = normalizedText(item.genero);
  if (gender === "f" || gender === "feminino") return true;
  if (gender === "m" || gender === "masculino") return false;
  return null;
}

function stockCost(order: OrderInfo, rows: readonly StockInfo[], productNames: ReadonlyMap<string, Set<string>>): number | null {
  if (!order.items || order.items.length === 0) return null;
  let total = 0;
  for (const item of order.items) {
    const productId = itemProductId(item, productNames);
    const size = normalizedSize(item.tamanho);
    const female = itemIsFemale(item);
    const name = normalizedText(item.nomePersonalizado ?? item.nome_personalizado);
    const number = normalizedText(item.numeroPersonalizado ?? item.numero_personalizado);
    if (productId === null || size === null || female === null || typeof item.personalizado !== "boolean" || name === null || number === null) return null;
    const matches = rows.filter((entry) => entry.productId === productId && entry.size === size && entry.female === female && entry.personalized === item.personalizado && entry.name === name && entry.number === number);
    if (matches.length === 0 || matches.some((entry) => entry.costCents === null)) return null;
    const costs = new Set(matches.map((entry) => entry.costCents!));
    if (costs.size !== 1) return null;
    total = add(total, matches[0].costCents!);
  }
  return total;
}

function extras(rows: readonly Row[]): number {
  let total = 0;
  for (const row of rows) {
    if (typeof row.quantidade !== "number" || !Number.isSafeInteger(row.quantidade) || !Number.isFinite(row.quantidade) || row.quantidade < 0) invalidFinanceData();
    const price = moneyToCents(row.preco);
    if (price === null) invalidFinanceData();
    total = add(total, multiply(price, row.quantidade));
  }
  return total;
}

function validateFees(value: unknown): ReadonlyMap<string, number> {
  if (typeof value !== "object" || value === null || typeof (value as { entries?: unknown }).entries !== "function") invalidFinanceData();
  const result = new Map<string, number>();
  try {
    for (const entry of (value as ReadonlyMap<unknown, unknown>).entries()) {
      if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== "string") invalidFinanceData();
      const fee = entry[1];
      if (typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0) invalidFinanceData();
      result.set(entry[0], fee);
    }
  } catch (error) {
    if (error instanceof Error && error.message === OWNER_FINANCE_INPUT_ERROR) throw error;
    invalidFinanceData();
  }
  return result;
}

function commission(row: Row): number | null {
  const revShare = row.rev_share_percentual;
  if (revShare !== null && revShare !== undefined) {
    if (typeof revShare !== "number" || !Number.isFinite(revShare)) {
      if (typeof revShare === "number" && !Number.isFinite(revShare)) invalidFinanceData();
      return null;
    }
    if (revShare < 0) return null;
  }
  if (row.comissao_calculada === null || row.comissao_calculada === undefined) {
    return typeof revShare === "number" && revShare > 0 ? null : 0;
  }
  return moneyToCents(row.comissao_calculada);
}

function fee(row: Row, orderId: string, fees: ReadonlyMap<string, number>): number | null {
  if (id(row.mp_payment_id) !== null) return fees.has(orderId) ? fees.get(orderId)! : null;
  return row.payment_method === "pix" ? 0 : null;
}

function costsForOrder(order: OrderInfo, memberships: ReadonlyMap<string, PackageInfo[]>, stockRows: readonly StockInfo[], productNames: ReadonlyMap<string, Set<string>>): CostShare | null {
  const packages = memberships.get(order.id);
  if (packages) {
    if (packages.length !== 1 || !packages[0].valid) return null;
    return packages[0].shares.get(order.id) ?? null;
  }
  if (order.row.pronta_entrega !== true) return null;
  const product = stockCost(order, stockRows, productNames);
  return product === null ? null : { product, shipping: 0, importation: 0 };
}

function excluded(row: Row): boolean {
  return row.admin_order === true || row.reposicao === true;
}

export function parseBRLToCents(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  try {
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
    return cents > 0n && cents <= BigInt(MAX_SAFE) ? Number(cents) : null;
  } catch {
    return null;
  }
}

export function getPaymentOrdersForVerification(sources: unknown): PaymentOrderForVerification[] {
  const rows = readSources(sources);
  return parseOrders(rows.orders)
    .filter((order) => order.status === "entregue" && !excluded(order.row) && id(order.row.mp_payment_id) !== null)
    .map((order) => ({ id: order.id, mp_payment_id: id(order.row.mp_payment_id)! }));
}

export function calculateOwnerProfit(sources: unknown, verifiedFees: ReadonlyMap<string, number>): OwnerProfitSummary {
  const rows = readSources(sources);
  const extraCostCents = extras(rows.extras);
  const checkedFees = validateFees(verifiedFees);
  const orders = parseOrders(rows.orders);
  const memberships = packageMemberships(rows.packages, orders, parseConfig(rows.config));
  const stockRows = stock(rows.stock);
  const productNames = products(rows.products);
  let revenueCents = 0, productCostCents = 0, shippingCostCents = 0, importCostCents = 0, mpFeeCents = 0, commissionCents = 0;
  let eligibleOrderCount = 0, awaitingCostCount = 0, awaitingFeeCount = 0, pendingOrderCount = 0, pendingRevenueCents = 0;

  for (const order of orders) {
    if (excluded(order.row)) continue;
    if (IN_PROGRESS.has(order.status)) {
      const total = moneyToCents(order.row.total);
      if (total !== null) { pendingOrderCount++; pendingRevenueCents = add(pendingRevenueCents, total); }
      continue;
    }
    if (order.status !== "entregue") continue;
    const total = moneyToCents(order.row.total);
    const costs = total === null ? null : costsForOrder(order, memberships, stockRows, productNames);
    if (costs === null) { awaitingCostCount++; continue; }
    const commissionCentsForOrder = commission(order.row);
    if (commissionCentsForOrder === null) { awaitingCostCount++; continue; }
    const feeCents = fee(order.row, order.id, checkedFees);
    if (feeCents === null) { awaitingFeeCount++; continue; }
    eligibleOrderCount++;
    revenueCents = add(revenueCents, total!);
    productCostCents = add(productCostCents, costs.product);
    shippingCostCents = add(shippingCostCents, costs.shipping);
    importCostCents = add(importCostCents, costs.importation);
    mpFeeCents = add(mpFeeCents, feeCents);
    commissionCents = add(commissionCents, commissionCentsForOrder);
  }
  const profitCents = subtract(revenueCents, [productCostCents, shippingCostCents, importCostCents, mpFeeCents, commissionCents, extraCostCents]);
  return { profitCents, revenueCents, productCostCents, shippingCostCents, importCostCents, mpFeeCents, commissionCents, extraCostCents, eligibleOrderCount, awaitingCostCount, awaitingFeeCount, pendingOrderCount, pendingRevenueCents };
}

export function calculateOwnerBalances(profitCents: number, withdrawals: unknown): OwnerBalances {
  if (!Number.isSafeInteger(profitCents) || !Array.isArray(withdrawals)) invalidFinanceData();
  const withdrawn = { rafael: 0, renan: 0 };
  for (const value of withdrawals) {
    if (!isRecord(value)) invalidFinanceData();
    if (value.voided_at !== null && value.voided_at !== undefined) continue;
    if (value.owner !== "rafael" && value.owner !== "renan") invalidFinanceData();
    if (typeof value.amount_cents !== "number" || !Number.isSafeInteger(value.amount_cents) || value.amount_cents <= 0) invalidFinanceData();
    withdrawn[value.owner] = add(withdrawn[value.owner], value.amount_cents);
  }
  const positiveProfit = Math.max(profitCents, 0);
  const entitlementCents = Number(BigInt(positiveProfit) * 30n / 100n);
  const retainedStoreCents = subtract(positiveProfit, [entitlementCents, entitlementCents]);
  return {
    retainedStoreCents,
    owners: {
      rafael: { entitlementCents, withdrawnCents: withdrawn.rafael, balanceCents: subtract(entitlementCents, [withdrawn.rafael]) },
      renan: { entitlementCents, withdrawnCents: withdrawn.renan, balanceCents: subtract(entitlementCents, [withdrawn.renan]) },
    },
  };
}
