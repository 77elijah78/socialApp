import { DETAIL_STACK_OPTIONS } from "@/constants/navigation";
import { Stack, useRouter } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { runMigrations } from "../db/migrations";
import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { store, persistor } from "@/store/index";
import { ActivityIndicator, View, Text, Linking } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import * as theme from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";
import { messageStore } from "@/db/MessageStore";
import { mediaService } from "@/services/MediaService";
import {
  setTokens as setApiTokens,
  setTokenRefreshCallback,
} from "@/services/api";
import { setTokens as setReduxTokens } from "@/store/slices/authSlice";
import { useNotificationSync } from "@/hooks/useNotifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OverlayProvider } from "@/providers/OverlayProvider";

import { prepareMessagingAccount } from "@/services/MessagingCache";

function PersistGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let initializing = false;
    const initTokens = async () => {
      if (initializing) return;
      initializing = true;
      try {
        await runMigrations();
        const state = store.getState();
        let refreshToken = state.auth.refreshToken;

        if (!refreshToken) {
          try {
            const stored = await AsyncStorage.getItem("refreshToken");
            if (stored) {
              refreshToken = stored;
              store.dispatch(
                setReduxTokens({
                  token: state.auth.token ?? "",
                  refreshToken: stored,
                }),
              );
            }
          } catch {
            // ignore
          }
        }

        await prepareMessagingAccount(
          state.auth.isAuthenticated ? (state.auth.user?.id ?? null) : null,
        );
        await messageStore.recoverUnfinishedSends();
        setApiTokens(state.auth.token, refreshToken);
        if (!cancelled) setReady(true);
      } catch (error) {
        if (!cancelled)
          setStorageError(
            error instanceof Error
              ? error.message
              : "Local storage initialization failed",
          );
      }
    };

    const unsub = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        initTokens();
        unsub();
      }
    });

    if (persistor.getState().bootstrapped) {
      initTokens();
    }

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {storageError ? (
          <Text accessibilityRole="alert">
            Couldn’t open local messaging storage. Restart the app to retry.{" "}
            {storageError}
          </Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return <>{children}</>;
}

function SocketProvider() {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id);
  useNotificationSync();

  useEffect(() => {
    if (isAuthenticated && userId && token) {
      mediaService.setAuthToken(token);
      mediaService.connectSocket(userId, token);
    } else if (!isAuthenticated) {
      mediaService.disconnectSocket();
    }
    return () => mediaService.disconnectSocket();
  }, [isAuthenticated, token, userId]);


  return null;
}

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    setTokenRefreshCallback((token, refreshToken) => {
      try {
        const state = store.getState().auth;
        store.dispatch(
          setReduxTokens({
            token: token,
            refreshToken: refreshToken ?? state.refreshToken ?? "",
          }),
        );
        setApiTokens(token, refreshToken ?? null);
      } catch (err: any) {
        console.warn(
          "[layout] onTokenRefresh callback error:",
          err?.message ?? err,
        );
      }
    });

    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url.startsWith("yoursocialapp://post/")) {
        const postId = url.replace("yoursocialapp://post/", "");
        if (postId) {
          router.navigate(`/posts/${postId}/comments`);
        }
      } else if (url.startsWith("yoursocialapp://story/")) {
        const storyId = url.replace("yoursocialapp://story/", "");
        if (storyId) {
          router.navigate(`/stories/${storyId}`);
        }
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <Provider store={store}>
          <PersistGate>
            <PaperProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <BottomSheetModalProvider>
                  <OverlayProvider>
                    <SocketProvider />
                    <Stack
                      screenOptions={{
                        ...DETAIL_STACK_OPTIONS,
                        contentStyle: {
                          backgroundColor: theme.COLORS.bgLight,
                          borderColor: theme.COLORS.bgLight,
                        },
                      }}
                    >
                      <Stack.Screen
                        name="(auth)"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="(tabs)"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="(chatRoom)"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="editProfile"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="settings"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="stories/viewer"
                        options={{
                          headerShown: false,
                          presentation: "modal",
                          animation: "fade",
                        }}
                      />
                    </Stack>
                  </OverlayProvider>
                </BottomSheetModalProvider>
              </GestureHandlerRootView>
            </PaperProvider>
          </PersistGate>
        </Provider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
