import { api } from "./api";
import type { PickedAsset } from "@/hooks/useImagePicker";
import { avatarFileForUpload } from "@/utils/avatarUpload";

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
  const file = avatarFileForUpload(asset);
  const response = await api.uploadFile(
    "/media/upload/avatar",
    file.uri,
    file.type,
    "avatar",
    file.name,
    undefined,
    onProgress,
  );
  if (!response.data?.url) throw new Error("Avatar upload was not confirmed.");
  return response.data;
}
