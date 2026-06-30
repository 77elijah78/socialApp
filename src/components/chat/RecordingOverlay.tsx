// components/chat/RecordingOverlay.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";

interface Props {
  recording: boolean;
  locked: boolean;
  seconds: number;
  fmt: (s: number) => string;
  slide: Animated.Value;
  lockY: Animated.Value;
  onCancel: () => void;
  onSend: () => void;
  marginBottom?: number;
}

const RecordingOverlay: React.FC<Props> = ({
  recording,
  locked,
  seconds,
  fmt,
  slide,
  lockY,
  onCancel,
  onSend,
  marginBottom = 0,
}) => {
  if (!recording) return null;

  return (
    <Animated.View
      style={[
        styles.root,
        {
          marginBottom,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Lock hint (only while holding, not locked yet) */}
      {!locked && (
        <Animated.View
          style={[
            styles.lockPill,
            {
              opacity: lockY.interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0.5, 0.8, 1],
              }),
              transform: [
                {
                  translateY: lockY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -12],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.lockIcon}>🔒</Text>
        </Animated.View>
      )}

      <View style={styles.bar}>
        {/* Red dot + timer */}
        <View style={styles.timerRow}>
          <View style={styles.dot} />
          <Text style={styles.time}>{fmt(seconds)}</Text>
        </View>

        {/* Center: slide hint or locked label */}
        <View style={styles.center}>
          {locked ? (
            <Text style={styles.lockedText}>Recording locked</Text>
          ) : (
            <Text style={styles.slideText}>{"‹  Slide to cancel"}</Text>
          )}
        </View>

        {/* Right: actions when locked */}
        {locked && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.deleteBtn}
              activeOpacity={0.6}
            >
              <Text style={styles.deleteTxt}>🗑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSend}
              style={styles.sendBtn}
              activeOpacity={0.6}
            >
              <Text style={styles.sendTxt}>➤</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  lockPill: {
    position: "absolute",
    top: -55,
    right: 16,
    width: 36,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lockIcon: { fontSize: 16 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EA0038",
    marginRight: 6,
  },
  time: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    fontVariant: ["tabular-nums"],
    minWidth: 34,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  slideText: {
    fontSize: 13,
    color: "#999",
  },
  lockedText: {
    fontSize: 13,
    color: "#00A884",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(234,0,56,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteTxt: { fontSize: 16 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(0,168,132,0.3)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  sendTxt: {
    fontSize: 18,
    color: "#fff",
  },
});

export default React.memo(RecordingOverlay);
