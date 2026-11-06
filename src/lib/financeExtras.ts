import { supabase } from "./supabase";

export interface ExtraCusto {
  id: number;
  nome: string;
  quantidade: number;
  preco: number;
  data: string;
  cor: string;
}

export const DEFAULT_EXTRA_COLOR = "#F4A261";
export const FINANCE_EXTRAS_GENERIC_ERROR = "Não foi possível processar a operação financeira.";

const EXTRA_FIELDS = "id,nome,quantidade,preco,data,cor";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(): never {
  throw new Error(FINANCE_EXTRAS_GENERIC_ERROR);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function normalizeColor(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return DEFAULT_EXTRA_COLOR;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return value;
}

function validateExtra(value: unknown, allowZeroQuantity: boolean): ExtraCusto {
  if (!isRecord(value)
    || !isSafeInteger(value.id)
    || value.id <= 0
    || typeof value.nome !== "string"
    || !value.nome.trim()
    || value.nome.trim().length > 200
    || !isSafeInteger(value.quantidade)
    || (allowZeroQuantity ? value.quantidade < 0 : value.quantidade <= 0)
    || typeof value.preco !== "number"
    || !Number.isFinite(value.preco)
    || value.preco < 0
    || !isRealDate(value.data)) {
    return fail();
  }

  const cents = Math.round(value.preco * 100);
  if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(cents * value.quantidade)) return fail();

  const cor = normalizeColor(value.cor);
  if (!cor) return fail();

  return {
    id: value.id,
    nome: value.nome.trim(),
    quantidade: value.quantidade,
    preco: value.preco,
    data: value.data,
    cor,
  };
}

function validateId(value: unknown): number {
  if (!isSafeInteger(value) || value <= 0) return fail();
  return value;
}

function payload(extra: ExtraCusto): Omit<ExtraCusto, "id"> & { id: number } {
  return {
    id: extra.id,
    nome: extra.nome,
    quantidade: extra.quantidade,
    preco: extra.preco,
    data: extra.data,
    cor: extra.cor,
  };
}

function updatePayload(extra: ExtraCusto): Omit<ExtraCusto, "id"> {
  return {
    nome: extra.nome,
    quantidade: extra.quantidade,
    preco: extra.preco,
    data: extra.data,
    cor: extra.cor,
  };
}

function parseResponseExtra(value: unknown): ExtraCusto {
  return validateExtra(value, true);
}

export function parseFinanceExtras(value: unknown): ExtraCusto[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const extras = value.map((item) => parseResponseExtra(item));
    return new Set(extras.map((extra) => extra.id)).size === extras.length ? extras : null;
  } catch {
    return null;
  }
}

export function getUnsyncedExtras(remote: readonly ExtraCusto[], cached: readonly ExtraCusto[]): ExtraCusto[] {
  const remoteIds = new Set(remote.map((extra) => extra.id));
  return cached.filter((extra) => !remoteIds.has(extra.id));
}

export async function getFinanceExtras(): Promise<ExtraCusto[]> {
  try {
    const { data, error } = await supabase.from("custos_extras").select(EXTRA_FIELDS);
    if (error || !Array.isArray(data)) return fail();
    const extras = parseFinanceExtras(data);
    return extras ?? fail();
  } catch {
    return fail();
  }
}

export async function createFinanceExtra(extra: ExtraCusto): Promise<ExtraCusto> {
  const valid = validateExtra(extra, false);
  try {
    const { data, error } = await supabase
      .from("custos_extras")
      .insert(payload(valid))
      .select(EXTRA_FIELDS)
      .single();
    if (error || !data) return fail();
    return parseResponseExtra(data);
  } catch {
    return fail();
  }
}

export async function updateFinanceExtra(extra: ExtraCusto): Promise<ExtraCusto> {
  const valid = validateExtra(extra, false);
  try {
    const { data, error } = await supabase
      .from("custos_extras")
      .update(updatePayload(valid))
      .eq("id", valid.id)
      .select(EXTRA_FIELDS)
      .single();
    if (error || !data) return fail();
    return parseResponseExtra(data);
  } catch {
    return fail();
  }
}

export async function deleteFinanceExtra(id: number): Promise<void> {
  const validId = validateId(id);
  try {
    const { data, error } = await supabase
      .from("custos_extras")
      .delete()
      .eq("id", validId)
      .select("id");
    if (error || !Array.isArray(data) || data.length === 0 || !data.every((item) => isRecord(item) && item.id === validId)) return fail();
  } catch {
    return fail();
  }
}

export async function importFinanceExtras(extras: ExtraCusto[]): Promise<ExtraCusto[]> {
  if (!Array.isArray(extras)) return fail();

  const valid = extras.map((extra) => validateExtra(extra, false));
  if (new Set(valid.map((extra) => extra.id)).size !== valid.length) return fail();
  if (valid.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("custos_extras")
      .insert(valid.map(payload))
      .select(EXTRA_FIELDS);
    if (error || !Array.isArray(data) || data.length !== valid.length) return fail();
    const imported = parseFinanceExtras(data);
    return imported ?? fail();
  } catch {
    return fail();
  }
}
