/**
 * Cloudflare R2 client — S3-compatible storage with ZERO egress fees.
 *
 * Uses dynamic imports to avoid bundling the entire AWS SDK on cold start,
 * which can exceed Vercel serverless function size limits.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID      – Cloudflare account ID
 *   R2_ACCESS_KEY_ID   – R2 API token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY – R2 API token (Secret Access Key)
 *   R2_BUCKET_NAME     – R2 bucket name (e.g. "rm-imports-images")
 *   R2_PUBLIC_URL      – Public URL for the bucket (e.g. "https://images.rmimports.com" or "https://pub-xxx.r2.dev")
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "rm-imports-images";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

/** Whether R2 is fully configured (all required env vars present). */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

/** Build the public URL for an object in R2. */
export function getR2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

// Lazy-loaded S3 client — avoids importing the entire AWS SDK at module level
import type { S3Client } from "@aws-sdk/client-s3";

let _r2Client: S3Client | null = null;
let _r2ClientPromise: Promise<S3Client | null> | null = null;

async function getR2Client(): Promise<S3Client | null> {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  if (_r2Client) return _r2Client;

  if (_r2ClientPromise) return _r2ClientPromise;

  _r2ClientPromise = (async () => {
    const { S3Client: S3ClientClass } = await import("@aws-sdk/client-s3");
    _r2Client = new S3ClientClass({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    return _r2Client;
  })();

  return _r2ClientPromise;
}

/** Upload a buffer to R2. Returns the public URL. Throws on failure. */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const client = await getR2Client();
  if (!client) throw new Error("R2 not configured");

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
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
  const client = await getR2Client();
  if (!client) return null;

  try {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
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