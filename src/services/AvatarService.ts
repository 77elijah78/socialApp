import { api } from "./api";
import {
  getAssetFilename,
  getAssetMimeType,
  type PickedAsset,
} from "@/hooks/useImagePicker";

export interface UploadedAvatar {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

/** Uploads through the existing authenticated media endpoint. Group and
 * channel avatars share the same image constraints as profile avatars. */
export async function uploadAvatarAsset(
  asset: PickedAsset,
  onProgress?: (percent: number) => void,
): Promise<UploadedAvatar> {
  const response = await api.uploadFile(
    "/media/upload/avatar",
    asset.uri,
    getAssetMimeType(asset),
    "avatar",
    getAssetFilename(asset, "avatar"),
    undefined,
    onProgress,
  );
  if (!response.data?.url) throw new Error("Avatar upload was not confirmed.");
  return response.data;
}
