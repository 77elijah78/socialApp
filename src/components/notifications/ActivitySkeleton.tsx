import { StyleSheet, View } from "react-native";
import { SkeletonBox } from "@/components/ui/Skeleton";
import { COLORS } from "@/constants/theme";

/** Uses the existing shared native shimmer/reduced-motion driver. */
export default function ActivitySkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading activity" style={styles.content}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBox width={46} height={46} borderRadius={17} />
          <View style={styles.copy}>
            <SkeletonBox width="88%" height={14} />
            <SkeletonBox width="100%" height={12} />
            <SkeletonBox width="65%" height={12} />
            <SkeletonBox width={74} height={10} />
          </View>
          <SkeletonBox width={44} height={44} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: 8 },
  row: { flexDirection: "row", gap: 12, padding: 14, minHeight: 108, backgroundColor: COLORS.bgWhite, borderRadius: 20 },
  copy: { flex: 1, minWidth: 0, gap: 8 },
});
