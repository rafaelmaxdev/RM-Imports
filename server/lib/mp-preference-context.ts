import { normalizeBrazilPhone } from "./checkout.js";

const FASHION_CATEGORY_ID = "fashion";
const MAX_ITEMS = 20;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MP_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_MP_DEVICE_ID_LENGTH = 256;

type JsonObject = Record<string, unknown>;

export function normalizeMPDeviceId(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length < 1 || input.length > MAX_MP_DEVICE_ID_LENGTH) {
    return undefined;
  }

  const match = input.match(MP_DEVICE_ID_PATTERN);
  return match?.[0] === input ? input : undefined;
}

export interface MercadoPagoPreferenceItemMetadata {
  title: string;
  description: string;
  category_id?: string;
}

export interface MercadoPagoPreferencePayer {
  name?: string;
  surname?: string;
  phone?: {
    area_code: string;
    number: string;
  };
  address?: {
    zip_code: string;
    street_name: string;
    street_number: number;
  };
}

export interface MercadoPagoPreferenceContext {
  item: MercadoPagoPreferenceItemMetadata;
  payer?: MercadoPagoPreferencePayer;
}

export interface MercadoPagoPreferenceContextInput {
  orderId: string;
  itens: unknown;
  endereco?: unknown;
  nome?: unknown;
}

interface UsableItem {
  nome: string;
  tipo: string;
  tamanho: string;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function getUsableItems(value: unknown): UsableItem[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(0, MAX_ITEMS).flatMap((rawItem) => {
    if (!isObject(rawItem)) return [];
    const nome = cleanText(rawItem.nome, 100);
    const tipo = cleanText(rawItem.tipo, 50);
    const tamanho = cleanText(rawItem.tamanho, 20);
    return nome && tipo && tamanho ? [{ nome, tipo, tamanho }] : [];
  });
}

function limitText(value: string, maxLength: number): string {
  return cleanText(value, maxLength) ?? "";
}

function fallbackTitle(orderId: string): string {
  return `Pedido ${limitText(orderId, MAX_TITLE_LENGTH - "Pedido ".length)}`;
}

function buildItemMetadata(orderId: string, rawItems: unknown): MercadoPagoPreferenceItemMetadata {
  const items = getUsableItems(rawItems);
  if (items.length === 0) {
    const fallback = fallbackTitle(orderId);
    return { title: fallback, description: fallback };
  }

  const itemNames = items.map((item) => /^camisa\b/i.test(item.nome) ? item.nome : `Camisa ${item.nome}`);
  const title = items.length === 1
    ? `RM Imports — ${itemNames[0]}`
    : `RM Imports — ${items.length} camisas`;
  const description = items
    .map((item, index) => `${itemNames[index]}, tipo ${item.tipo}, tamanho ${item.tamanho}`)
    .join("; ");

  return {
    title: limitText(title, MAX_TITLE_LENGTH),
    description: limitText(description, MAX_DESCRIPTION_LENGTH),
    category_id: FASHION_CATEGORY_ID,
  };
}

function splitName(value: unknown): Pick<MercadoPagoPreferencePayer, "name" | "surname"> {
  const fullName = cleanText(value, 100);
  if (!fullName) return {};

  const [name, ...surnameParts] = fullName.split(" ");
  const surname = surnameParts.join(" ");
  return surname ? { name, surname } : { name };
}

function buildPhone(value: unknown): MercadoPagoPreferencePayer["phone"] {
  if (typeof value !== "string") return undefined;
  try {
    const normalized = normalizeBrazilPhone(value);
    return {
      area_code: normalized.slice(2, 4),
      number: normalized.slice(4),
    };
  } catch {
    return undefined;
  }
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildAddress(value: JsonObject): MercadoPagoPreferencePayer["address"] {
  if (value.deliveryMethod !== "entrega") return undefined;

  const streetName = cleanText(value.rua, 150);
  const zipCode = typeof value.cep === "string" ? value.cep.replace(/\D/g, "") : "";
  const streetNumber = positiveInteger(value.numero);
  if (!streetName || zipCode.length !== 8 || streetNumber === null) return undefined;

  return {
    zip_code: zipCode,
    street_name: streetName,
    street_number: streetNumber,
  };
}

function buildPayer(endereco: unknown, orderName: unknown): MercadoPagoPreferencePayer | undefined {
  const parsedAddress = parseJson(endereco);
  if (!isObject(parsedAddress)) return undefined;

  const identity = splitName(parsedAddress.nome ?? orderName);
  const phone = buildPhone(parsedAddress.telefone);
  const address = buildAddress(parsedAddress);
  const payer: MercadoPagoPreferencePayer = {
    ...identity,
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  };

  return Object.keys(payer).length > 0 ? payer : undefined;
}

export function buildMercadoPagoPreferenceContext(
  input: MercadoPagoPreferenceContextInput,
): MercadoPagoPreferenceContext {
  return {
    item: buildItemMetadata(input.orderId, input.itens),
    payer: buildPayer(input.endereco, input.nome),
  };
}
