import { Image, type ImageContentFit } from "expo-image";
import { StyleSheet, View } from "react-native";

import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import type { Sticker } from "@/constants/stickers";

interface Props {
  sticker: Sticker;
  size: number;
  contentFit?: ImageContentFit;
  onLoad?: () => void;
  onError?: () => void;
}

/** Bundled assets never hit the network. Remote WebP/GIF/APNG artwork is
 * rendered by expo-image with disk caching and transparency preserved. */
export default function StickerImage({
  sticker,
  size,
  contentFit = "contain",
  onLoad,
  onError,
}: Props) {
  if (sticker.asset) {
    return (
      <Image
        source={sticker.asset}
        style={{ width: size, height: size, backgroundColor: "transparent" }}
        contentFit={contentFit}
        cachePolicy="memory"
        onLoad={onLoad}
        onError={onError}
        accessibilityLabel={`${sticker.name} sticker`}
      />
    );
  }
  if (!sticker.url) {
    return <View style={[styles.missing, { width: size, height: size }]} />;
  }
  return (
    <AuthenticatedImage
      uri={sticker.url}
      style={{ width: size, height: size, backgroundColor: "transparent" }}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={`${sticker.packId}:${sticker.id}:${sticker.url}`}
      onLoad={onLoad}
      onError={onError}
      accessibilityLabel={`${sticker.name} sticker`}
    />
  );
}

const styles = StyleSheet.create({
  missing: { backgroundColor: "rgba(108,92,231,0.06)", borderRadius: 12 },
});
