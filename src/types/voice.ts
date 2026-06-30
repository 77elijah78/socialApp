import { Animated } from "react-native";

export interface WaveformBar {
  height: Animated.Value;
}

export interface RecordingResult {
  uri: string;
  durationFormatted: string;
  durationMs: number;
}

export type RecorderState = "idle" | "holding" | "locked" | "cancelled";
