/** Image/video containers a phone's library or file provider can hand us.
 * This is not an upload allowlist: avatars pass any `image/*` value through so
 * the server can decide whether it can decode the container. */
export const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  apng: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  dib: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  jp2: "image/jp2",
  jxl: "image/jxl",
  dng: "image/x-adobe-dng",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
};

export function extensionOf(value?: string | null): string {
  const name = value?.split(/[?#]/)[0].split("/").pop() ?? "";
  return /\.([\w]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
}

export function isUsableMimeType(value?: string | null): value is string {
  if (!value) return false;
  const normalized = value.split(";")[0].trim().toLowerCase();
  return normalized.includes("/") && normalized !== "application/octet-stream";
}

export function mimeTypeForUri(uri: string, fallback: string = "image/jpeg"): string {
  return MIME_BY_EXTENSION[extensionOf(uri)] ?? fallback;
}

export function inferAssetMimeType(asset: {
  uri: string;
  fileName?: string | null;
  type?: string | null;
  mimeType?: string;
}): string {
  if (isUsableMimeType(asset.mimeType))
    return asset.mimeType.split(";")[0].trim().toLowerCase();
  const fromName = asset.fileName
    ? MIME_BY_EXTENSION[extensionOf(asset.fileName)]
    : undefined;
  if (fromName) return fromName;
  if (asset.type === "video") return mimeTypeForUri(asset.uri, "video/mp4");
  return mimeTypeForUri(asset.uri);
}
