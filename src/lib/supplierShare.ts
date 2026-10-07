const IMAGE_ERROR = "Não foi possível preparar a imagem para compartilhamento.";
const SHARE_ERROR = "Não foi possível compartilhar o item.";

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function mimeType(value: string | null | undefined): string {
  return value?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

export async function prepareSupplierImage(url: string, signal?: AbortSignal): Promise<File> {
  const imageUrl = url.trim();
  if (!imageUrl) throw new Error(IMAGE_ERROR);

  try {
    const response = signal ? await fetch(imageUrl, { signal }) : await fetch(imageUrl);
    if (!response.ok) throw new Error(IMAGE_ERROR);

    const responseType = mimeType(response.headers.get("content-type"));
    const blob = await response.blob();
    if (blob.size === 0) throw new Error(IMAGE_ERROR);

    const blobType = mimeType(blob.type);
    if (responseType && blobType && responseType !== blobType) throw new Error(IMAGE_ERROR);

    const type = responseType || blobType;
    if (!type.startsWith("image/") || !IMAGE_TYPES.has(type)) throw new Error(IMAGE_ERROR);

    const extension = IMAGE_TYPES.get(type);
    if (!extension) throw new Error(IMAGE_ERROR);
    return new File([blob], `camisa.${extension}`, { type });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return Promise.reject(new Error(IMAGE_ERROR));
  }
}

export type SupplierShareResult = "image-text" | "text" | "clipboard" | "cancelled";

export async function shareSupplierItem(text: string, file?: File): Promise<SupplierShareResult> {
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  const share = browserNavigator && typeof browserNavigator.share === "function"
    ? browserNavigator.share.bind(browserNavigator)
    : undefined;

  let fileSupported = false;
  if (share && file && browserNavigator && typeof browserNavigator.canShare === "function") {
    try {
      fileSupported = browserNavigator.canShare({ files: [file], text });
    } catch {
      fileSupported = false;
    }
  }

  if (share && file && fileSupported) {
    try {
      const sharePromise = share({ files: [file], text });
      await sharePromise;
      return "image-text";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      return Promise.reject(new Error(SHARE_ERROR));
    }
  }

  if (share) {
    try {
      const sharePromise = share({ text });
      await sharePromise;
      return "text";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      return Promise.reject(new Error(SHARE_ERROR));
    }
  }

  try {
    if (!browserNavigator?.clipboard || typeof browserNavigator.clipboard.writeText !== "function") {
      throw new Error(SHARE_ERROR);
    }
    await browserNavigator.clipboard.writeText(text);
    return "clipboard";
  } catch {
    throw new Error(SHARE_ERROR);
  }
}
