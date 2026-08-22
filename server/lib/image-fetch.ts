const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class ImageFetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ImageFetchError";
  }
}

function validateUrl(url: string, allowedDomains: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid image URL");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowed = allowedDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  });

  if (parsed.protocol !== "https:" || !allowed) {
    throw new Error("Image URL is not allowed");
  }

  return parsed;
}

export async function fetchImage(
  url: string,
  allowedDomains: readonly string[],
  headers: HeadersInit = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = validateUrl(url, allowedDomains).toString();

    for (let redirects = 0; ; redirects++) {
      currentUrl = validateUrl(currentUrl, allowedDomains).toString();
      const response = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects >= MAX_REDIRECTS) {
          throw new ImageFetchError("Too many image redirects", response.status);
        }
        currentUrl = validateUrl(new URL(location, currentUrl).toString(), allowedDomains).toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new ImageFetchError(`Image fetch failed with status ${response.status}`, response.status);
      }

      const contentType = response.headers.get("content-type")?.trim();
      if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
        throw new Error("Upstream response is not an image");
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength !== null) {
        const length = Number(contentLength);
        if (!Number.isFinite(length) || length < 0 || length > MAX_IMAGE_BYTES) {
          controller.abort();
          throw new Error("Image is too large");
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Upstream image has no body");

      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          total += value.byteLength;
          if (total > MAX_IMAGE_BYTES) {
            controller.abort();
            try {
              await reader.cancel();
            } catch {
              // The abort may already have closed the stream.
            }
            throw new Error("Image is too large");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }

      return { buffer: Buffer.concat(chunks, total), contentType };
    }
  } finally {
    clearTimeout(timeout);
  }
}
