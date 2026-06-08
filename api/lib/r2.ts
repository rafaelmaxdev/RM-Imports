/**
 * Cloudflare R2 client — S3-compatible storage with ZERO egress fees.
 *
 * Uses dynamic imports for @aws-sdk/client-s3 to reduce cold start impact.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID      – Cloudflare account ID
 *   R2_ACCESS_KEY_ID   – R2 API token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY – R2 API token (Secret Access Key)
 *   R2_BUCKET_NAME     – R2 bucket name (e.g. "rm-imports-images")
 *   R2_PUBLIC_URL      – Public URL for the bucket (e.g. "https://pub-xxx.r2.dev")
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

// Lazy-loaded S3 client
let _s3Client: InstanceType<typeof import("@aws-sdk/client-s3").S3Client> | null = null;
let _s3ClientPromise: Promise<InstanceType<typeof import("@aws-sdk/client-s3").S3Client>> | null = null;

async function getS3Client() {
  if (_s3Client) return _s3Client;
  if (_s3ClientPromise) return _s3ClientPromise;

  _s3ClientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
    return _s3Client;
  })();

  return _s3ClientPromise;
}

/** Upload a buffer to R2. Returns the public URL. Throws on failure. */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

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
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

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