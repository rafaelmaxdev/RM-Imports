/**
 * Cloudflare R2 client — S3-compatible storage with ZERO egress fees.
 *
 * Uses plain fetch() instead of the heavy @aws-sdk/client-s3 package
 * to stay within Vercel serverless function size limits.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID      – Cloudflare account ID
 *   R2_ACCESS_KEY_ID   – R2 API token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY – R2 API token (Secret Access Key)
 *   R2_BUCKET_NAME     – R2 bucket name (e.g. "rm-imports-images")
 *   R2_PUBLIC_URL      – Public URL for the bucket (e.g. "https://pub-xxx.r2.dev")
 */

import { createHmac, createHash } from 'crypto';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "rm-imports-images";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/** Whether R2 is fully configured (all required env vars present). */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

/** Build the public URL for an object in R2. */
export function getR2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

// ── AWS Signature V4 signing (minimal implementation for R2) ──

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function hmacSha256Hex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function getAmzDate(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function getDateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer | Uint8Array;
}

function signRequest(
  method: string,
  path: string,
  queryString: Record<string, string> = {},
  headers: Record<string, string> = {},
  body?: string | Buffer | Uint8Array,
): SignedRequest {
  const amzDate = getAmzDate();
  const dateStamp = getDateStamp();
  const region = 'auto';
  const service = 's3';

  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  // Build canonical query string
  const sortedParams = Object.entries(queryString).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  // Build canonical headers
  const allHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': body ? sha256Hex(typeof body === 'string' ? body : Buffer.from(body)) : 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
    ...headers,
  };

  const signedHeaderKeys = Object.keys(allHeaders).map(k => k.toLowerCase()).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${allHeaders[k.toLowerCase()] || allHeaders[k]}\n`).join('');

  // Hash payload
  const payloadHash = body ? sha256Hex(typeof body === 'string' ? body : Buffer.from(body)) : 'UNSIGNED-PAYLOAD';

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = hmacSha256(`AWS4${R2_SECRET_ACCESS_KEY!}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');

  // Signature
  const signature = hmacSha256Hex(kSigning, stringToSign);

  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalHeaders: Record<string, string> = {
    ...allHeaders,
    Authorization: authorization,
  };

  const url = `https://${host}${path}${canonicalQueryString ? '?' + canonicalQueryString : ''}`;

  return { url, method, headers: finalHeaders, body };
}

/** Upload a buffer to R2. Returns the public URL. Throws on failure. */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  if (!isR2Configured()) throw new Error("R2 not configured");

  const path = `/${R2_BUCKET_NAME}/${key}`;
  const req = signRequest('PUT', path, {}, { 'Content-Type': contentType }, body);

  // Convert Buffer to Uint8Array for fetch() compatibility
  let bodyData: ArrayBuffer | null = null;
  if (req.body instanceof Uint8Array) {
    bodyData = req.body.buffer as ArrayBuffer;
  } else if (Buffer.isBuffer(req.body)) {
    bodyData = req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength) as ArrayBuffer;
  }
  const response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: bodyData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed: ${response.status} ${text}`);
  }

  return getR2PublicUrl(key);
}

/** Check if an object exists in R2. Returns the public URL or null. */
export async function checkR2Exists(key: string): Promise<string | null> {
  if (!isR2Configured()) return null;

  const path = `/${R2_BUCKET_NAME}/${key}`;
  const req = signRequest('HEAD', path);

  try {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
    });
    if (response.ok) {
      return getR2PublicUrl(key);
    }
    return null;
  } catch {
    return null;
  }
}