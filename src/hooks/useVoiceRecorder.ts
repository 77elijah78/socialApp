// hooks/useVoiceRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, PanResponder } from "react-native";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";

const LOCK_Y = -80;
const CANCEL_X = -100;

export interface RecordingResult {
  uri: string;
  duration: string;
  durationMs: number;
}

export function useVoiceRecorder(onSend?: (result: RecordingResult) => void) {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recordingRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startRef = useRef(0);

  const slide = useRef(new Animated.Value(0)).current;
  const micSize = useRef(new Animated.Value(1)).current;
  const lockY = useRef(new Animated.Value(0)).current;

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recRef = useRef(recorder);
  recRef.current = recorder;

  // ── Format ──
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  // ── Reset UI instantly ──
  const reset = useCallback(() => {
    slide.setValue(0);
    micSize.setValue(1);
    lockY.setValue(0);
  }, []);

  // ── Start ──
  const start = useCallback(async () => {
    const p = await AudioModule.requestRecordingPermissionsAsync();
    if (!p.granted) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    cancelledRef.current = false;
    lockedRef.current = false;
    startRef.current = Date.now();
    recordingRef.current = true;

    setRecording(true);
    setLocked(false);
    setSeconds(0);

    await recRef.current.prepareToRecordAsync();
    recRef.current.record();

    Animated.parallel([
      Animated.spring(slide, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.spring(micSize, {
        toValue: 1.6,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    timer.current = setInterval(() => {
      if (!recordingRef.current) return;
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);
  }, []);

  // ── Stop & send ──
  const send = useCallback(async () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    recordingRef.current = false;
    lockedRef.current = false;
    const ms = Date.now() - startRef.current;

    Animated.timing(slide, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => reset());
    setRecording(false);
    setLocked(false);

    try {
      if (recRef.current.isRecording) {
        await recRef.current.stop();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const result: RecordingResult = {
          uri: recRef.current.uri ?? "",
          durationMs: ms,
          duration: fmt(Math.floor(ms / 1000)),
        };
        onSend?.(result);
        return result;
      }
    } catch {}
    return null;
  }, [onSend, reset]);

  // ── Cancel ──
  const cancel = useCallback(() => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }

    recordingRef.current = false;
    lockedRef.current = false;
    reset();
    setRecording(false);
    setLocked(false);

    try {
      if (recRef.current.isRecording) recRef.current.stop();
    } catch {}
  }, [reset]);

  // ── Stable refs for pan ──
  const fn = useRef({ start, send, cancel });
  useEffect(() => {
    fn.current = { start, send, cancel };
  }, [start, send, cancel]);

  // ── Pan ──
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => fn.current.start(),
      onPanResponderMove: (_, g) => {
        if (lockedRef.current || !recordingRef.current) return;

        // swipe left → cancel
        if (g.dx < -20) {
          lockY.setValue(0);
          if (g.dx < CANCEL_X) {
            fn.current.cancel();
            return;
          }
        }
        // swipe up → lock
        if (g.dy < -15) {
          if (g.dy < LOCK_Y && !lockedRef.current) {
            lockedRef.current = true;
            setLocked(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Animated.spring(micSize, {
              toValue: 1,
              friction: 6,
              useNativeDriver: true,
            }).start();
            lockY.setValue(0);
            return;
          }
          lockY.setValue(Math.min(1, Math.abs(g.dy) / Math.abs(LOCK_Y)));
        }
      },
      onPanResponderRelease: () => {
        if (lockedRef.current || !recordingRef.current) return;
        fn.current.send();
      },
      onPanResponderTerminate: () => {
        if (!lockedRef.current) fn.current.cancel();
      },
    }),
  ).current;

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  return {
    recording,
    locked,
    seconds,
    fmt,
    slide,
    micSize,
    lockY,
    panHandlers: pan.panHandlers,
    send,
    cancel,
  };
}
