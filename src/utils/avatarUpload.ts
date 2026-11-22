import type { PickedAsset } from "@/hooks/useImagePicker";
import {
  extensionOf,
  isUsableMimeType,
  MIME_BY_EXTENSION,
} from "@/utils/imageMime";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Preferred file extension per image MIME. Any `image/*` value not listed is
 * still accepted; its extension is reused from the picked filename. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/apng": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heic-sequence": "heic",
  "image/heif": "heif",
  "image/heif-sequence": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-tiff": "tiff",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/jp2": "jp2",
  "image/jxl": "jxl",
  "image/x-adobe-dng": "dng",
  "image/x-canon-cr2": "cr2",
  "image/x-nikon-nef": "nef",
  "image/x-sony-arw": "arw",
  "image/x-portable-pixmap": "ppm",
  "image/x-portable-pixmap-text": "ppm",
  "image/x-portable-graymap": "pgm",
  "image/x-portable-bitmap": "pbm",
};

function clean(value?: string | null): string {
  return value?.split(/[?#]/)[0].split("/").pop() ?? "";
}

function baseNameOf(value?: string | null): string {
  return clean(value).replace(/\.[\w]+$/, "");
}

/**
 * Normalises any picked image into the multipart shape the avatar endpoint
 * expects. The frontend deliberately does not keep an image-format allowlist:
 * a phone can return HEIC, AVIF, BMP, TIFF, SVG, RAW, or a provider URI with no
 * extension. The server remains the authority on what it can decode.
 */
export function avatarFileForUpload(asset: PickedAsset): {
  uri: string;
  name: string;
  type: string;
} {
  if (!asset.uri) throw new Error("Choose an image to use as your photo.");
  if (asset.type === "video")
    throw new Error("Choose an image file to use as your photo.");

  let type: string;
  if (isUsableMimeType(asset.mimeType)) {
    type = asset.mimeType.split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/"))
      throw new Error("Choose an image file to use as your photo.");
  } else {
    const inferred = MIME_BY_EXTENSION[
      extensionOf(asset.fileName) || extensionOf(asset.uri)
    ];
    if (inferred) {
      if (!inferred.startsWith("image/"))
        throw new Error("Choose an image file to use as your photo.");
      type = inferred;
    } else {
      if (asset.type === "video")
        throw new Error("Choose an image file to use as your photo.");
      // A content-provider URI can be opaque, but ImagePicker was launched with
      // `mediaTypes: images`; JPEG is the safest container for that fallback.
      type = "image/jpeg";
    }
  }
  if (type === "image/jpg") type = "image/jpeg";

  if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES)
    throw new Error("That image is larger than the 5 MB avatar limit.");

  const sourceExtension = extensionOf(asset.fileName) || extensionOf(asset.uri);
  const extension =
    EXTENSION_BY_MIME[type] ||
    (sourceExtension && !MIME_BY_EXTENSION[sourceExtension]
      ? sourceExtension
      : "jpg");
  const base =
    baseNameOf(asset.fileName)
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "avatar";

  return { uri: asset.uri, name: `${base}.${extension}`, type };
}
