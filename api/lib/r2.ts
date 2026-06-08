/**
 * Cloudflare R2 client — S3-compatible storage with ZERO egress fees.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID      – Cloudflare account ID
 *   R2_ACCESS_KEY_ID   – R2 API token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY – R2 API token (Secret Access Key)
 *   R2_BUCKET_NAME     – R2 bucket name (e.g. "rm-imports-images")
 *   R2_PUBLIC_URL      – Public URL for the bucket (e.g. "https://images.rmimports.com" or "https://pub-xxx.r2.dev")
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "rm-imports-images";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

let _r2Client: S3Client | null = null;

/** Lazy-initialised R2/S3 client. Returns null if env vars are missing. */
export function getR2Client(): S3Client | null {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2Client;
}

/** Whether R2 is fully configured (all required env vars present). */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

/** Build the public URL for an object in R2. */
export function getR2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

/** Upload a buffer to R2. Returns the public URL. Throws on failure. */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const client = getR2Client();
  if (!client) throw new Error("R2 not configured");

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );

  return getR2PublicUrl(key);
}

/** Check if an object exists in R2. Returns the public URL or null. */
export async function checkR2Exists(key: string): Promise<string | null> {
  const client = getR2Client();
  if (!client) return null;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return getR2PublicUrl(key);
  } catch {
    return null;
  }
}