// components/chat/WaveformBars.tsx
import React from "react";
import { View, StyleSheet, Animated } from "react-native";
import { COLORS } from "@/constants/theme";

const BAR_WIDTH = 2.5;
const BAR_GAP = 1.2;
const MAX_BAR_HEIGHT = 30;
const MIN_BAR_HEIGHT = 2;

interface WaveformBarsProps {
  bars: WaveformBar[];
  barCount: number;
}

interface WaveformBar {
  height: Animated.Value;
}

const getBarColor = (index: number, total: number): string => {
  const ratio = index / total;
  if (ratio < 0.2) return COLORS.wave1;
  if (ratio < 0.4) return COLORS.wave2;
  if (ratio < 0.6) return COLORS.wave3;
  if (ratio < 0.8) return COLORS.wave4;
  return COLORS.wave5;
};

const WaveformBars: React.FC<WaveformBarsProps> = ({ bars, barCount }) => {
  return (
    <View style={styles.container}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height: bar.height,
              backgroundColor: getBarColor(index, barCount),
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR_HEIGHT + 4,
    gap: BAR_GAP,
    overflow: "hidden",
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    minHeight: MIN_BAR_HEIGHT,
  },
});

export default React.memo(WaveformBars);
