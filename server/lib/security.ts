/// <reference types="node" />
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function isAdminToken(supabase: SupabaseClient, token: string | null): Promise<boolean> {
  if (!token) return false;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !error && user?.app_metadata?.role === "admin";
}

export function createOrderAccessToken(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(`order-access:${orderId}`).digest("hex");
}

export function verifyOrderAccessToken(orderId: string, token: unknown, secret: string): boolean {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = createOrderAccessToken(orderId, secret);
  const receivedBuffer = Buffer.from(token, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function clientIp(headers: Record<string, string | string[] | undefined>, fallback = "unknown"): string {
  const forwarded = headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || fallback;
}

export async function consumeRateLimit(
  supabase: SupabaseClient,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `${scope}:${createHash("sha256").update(identifier).digest("hex")}`;
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[security] rate limit unavailable for ${scope}`);
    return false;
  }
  return data === true;
}
