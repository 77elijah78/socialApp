import * as ImagePicker from "expo-image-picker";
import { showAppDialog } from "@/services/AppDialogService";
import { inferAssetMimeType } from "@/utils/imageMime";

export type MediaType = "image" | "video";

export interface PickedAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  fileSize?: number;
  type?: string | null;
  mimeType?: string;
}

export function createUploadFormData(
  uri: string,
  mimeType: string,
  fieldName: string = "file",
): FormData {
  const filename = uri.split("/").pop() || "upload";
  const form = new FormData();
  form.append(fieldName, {
    uri: uri,
    name: filename,
    type: mimeType,
  } as any);
  return form;
}

export function getAssetMimeType(asset: PickedAsset): string {
  return inferAssetMimeType(asset);
}

export function getAssetFilename(asset: PickedAsset, fallback: string = "upload"): string {
  if (asset.fileName) return asset.fileName;
  const match = /\.(\w+)$/.exec(asset.uri);
  const ext = match ? match[1] : "jpg";
  return `${fallback}.${ext}`;
}

async function ensurePermission(
  requestFn: () => Promise<ImagePicker.PermissionResponse>,
  title: string,
  message: string,
): Promise<boolean> {
  const { status } = await requestFn();
  if (status !== "granted") {
    showAppDialog({
      title,
      message,
      tone: "warning",
      buttons: [{ key: "dismiss", label: "Got it", bold: true }],
    });
    return false;
  }
  return true;
}

export async function pickFromLibrary(
  options?: {
    mediaTypes?: "images" | "videos" | "all";
    allowsMultiple?: boolean;
    allowsEditing?: boolean;
    aspect?: [number, number];
    /** iOS 14+: "compatible" converts HEIC/HEIF to JPEG when possible. */
    preferredRepresentation?: "automatic" | "compatible" | "current";
  },
): Promise<PickedAsset | PickedAsset[] | null> {
  const granted = await ensurePermission(
    () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    "Permission Required",
    "Please grant permission to access your photo library.",
  );
  if (!granted) return null;

  const mediaTypeMap: Record<string, ImagePicker.MediaTypeOptions> = {
    images: ImagePicker.MediaTypeOptions.Images,
    videos: ImagePicker.MediaTypeOptions.Videos,
    all: ImagePicker.MediaTypeOptions.All,
  };

  const representation =
    options?.preferredRepresentation ?? "compatible";
  const representationMode =
    representation === "current"
      ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
      : representation === "automatic"
        ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic
        : ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: mediaTypeMap[options?.mediaTypes ?? "images"],
    allowsEditing: options?.allowsEditing ?? true,
    aspect: options?.aspect ?? [1, 1],
    allowsMultipleSelection: options?.allowsMultiple ?? false,
    preferredAssetRepresentationMode: representationMode,
    base64: false,
    quality: 0.9,
  });

  if (result.canceled) return null;

  const assets = result.assets.map(toPickedAsset);

  if (options?.allowsMultiple) {
    return assets;
  }

  return assets[0];
}

export async function takePhoto(): Promise<PickedAsset | null> {
  const cameraGranted = await ensurePermission(
    () => ImagePicker.requestCameraPermissionsAsync(),
    "Permission Required",
    "Please grant camera permission to take photos.",
  );
  if (!cameraGranted) return null;

  const result = await ImagePicker.launchCameraAsync({
     mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
    base64: false,
  });

  if (result.canceled) return null;

  return toPickedAsset(result.assets[0]);
}

function toPickedAsset(asset: ImagePicker.ImagePickerAsset): PickedAsset {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    type: asset.type,
    mimeType: asset.mimeType,
  };
}

export function showImageSourceActionSheet(
  onPick: (action: "library" | "camera") => void,
  copy: { title?: string; message?: string } = {},
) {
  showAppDialog({
    title: copy.title ?? "Choose a photo",
    message: copy.message ?? "Select a source to continue.",
    presentation: "sheet",
    tone: "action",
    icon: "images-outline",
    buttons: [
      {
        key: "library",
        label: "Choose from library",
        icon: "images-outline",
        onPress: () => onPick("library"),
      },
      {
        key: "camera",
        label: "Take a photo",
        icon: "camera-outline",
        onPress: () => onPick("camera"),
      },
      { key: "cancel", label: "Cancel", cancel: true },
    ],
  });
}

/** Camera capture for stories: a single photo or a short video. */
export async function captureMedia(): Promise<PickedAsset | null> {
  const cameraGranted = await ensurePermission(
    () => ImagePicker.requestCameraPermissionsAsync(),
    "Permission Required",
    "Please grant camera permission to capture media.",
  );
  if (!cameraGranted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.9,
    videoMaxDuration: 60,
    base64: false,
  });

  if (result.canceled) return null;

  return toPickedAsset(result.assets[0]);
}
