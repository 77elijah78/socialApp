import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type MediaType = "image" | "video";

export interface PickedAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  type?: string | null;
}

async function ensurePermission(
  requestFn: () => Promise<ImagePicker.PermissionResponse>,
  title: string,
  message: string,
): Promise<boolean> {
  const { status } = await requestFn();
  if (status !== "granted") {
    Alert.alert(title, message);
    return false;
  }
  return true;
}

async function createFormData(uri: string, fieldName: string = "file"): Promise<FormData> {
  const filename = uri.split("/").pop() || "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1] : "jpg";

  const form = new FormData();
  form.append(fieldName, {
    uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
    name: filename,
    type: `image/${ext === "png" ? "png" : "jpeg"}`,
  } as any);

  return form;
}

export async function pickFromLibrary(
  options?: {
    mediaTypes?: "images" | "videos" | "all";
    allowsMultiple?: boolean;
    allowsEditing?: boolean;
    aspect?: [number, number];
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

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: mediaTypeMap[options?.mediaTypes ?? "images"],
    allowsEditing: options?.allowsEditing ?? true,
    aspect: options?.aspect ?? [1, 1],
    allowsMultipleSelection: options?.allowsMultiple ?? false,
    base64: false,
    quality: 0.9,
  });

  if (result.canceled) return null;

  const assets = result.assets.map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
    fileName: a.fileName,
    type: a.type,
  }));

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

  const a = result.assets[0];
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    fileName: a.fileName,
    type: a.type,
  };
}

export function showImageSourceActionSheet(
  onPick: (action: "library" | "camera") => void,
) {
  Alert.alert("Select Media", "Choose a source", [
    { text: "Photo Library", onPress: () => onPick("library") },
    { text: "Camera", onPress: () => onPick("camera") },
    { text: "Cancel", style: "cancel" },
  ]);
}

export { createFormData };
