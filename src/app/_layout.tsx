import { Stack, useRouter } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { runMigrations } from "../db/migrations";
import { useEffect, useState } from "react";
import React from "react";
import { Provider } from "react-redux";
import { store, persistor } from "@/store/index";
import { ActivityIndicator, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import theme from "@/constants/theme";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { mediaService } from "@/services/MediaService";
import api, { setTokens as setApiTokens, setTokenRefreshCallback } from "@/services/api";
import { setTokens as setReduxTokens } from "@/store/slices/authSlice";
import { addNotification as addNotificationToStore, incrementUnreadCount } from "@/store/slices/notificationsSlice";
import ActionMenu, { registerActionMenu } from "@/components/ui/ActionMenu";
import AppAlert, { registerAppAlert } from "@/components/ui/AppAlert";
import ShareSheet, { registerShareSheet } from "@/components/ui/ShareSheet";
import ShareToUserSheet, { registerShareToUserSheet } from "@/components/ui/ShareToUserSheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";

  function PersistGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initTokens = async () => {
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

      setApiTokens(state.auth.token, refreshToken);
      setReady(true);
    };

    const unsub = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        initTokens();
        unsub();
      }
    });

    if (persistor.getState().bootstrapped) {
      initTokens();
    } else {
      setTimeout(() => setReady(true), 2000);
    }

    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <>{children}</>;
}

function SocketProvider() {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (isAuthenticated && userId && token) {
      mediaService.setAuthToken(token);
      mediaService.connectSocket(userId, token);
    } else if (!isAuthenticated) {
      mediaService.disconnectSocket();
    }
  }, [isAuthenticated, token, userId]);

  useEffect(() => {
    const unsub = mediaService.socket.on("notification:new", (payload: any) => {
      if (payload) {
        dispatch(addNotificationToStore(payload));
        dispatch(incrementUnreadCount());
      }
    });
    return unsub;
  }, [dispatch]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    runMigrations();

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
        console.warn("[layout] onTokenRefresh callback error:", err?.message ?? err);
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
  }, []);

  const actionMenuRef = React.useRef<{ present: (items: any[]) => void }>(null);

  return (
    <KeyboardProvider>
      <Provider store={store}>
        <PersistGate>
          <PaperProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <BottomSheetModalProvider>
                <SocketProvider />
                <ActionMenu />
                <AppAlert />
                <ShareSheet />
                <ShareToUserSheet />
                <Stack
                  screenOptions={{
                    contentStyle: {
                      backgroundColor: theme.COLORS.bgLight,
                      borderColor: theme.COLORS.bgLight,
                    },
                  }}
                >
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="(chatRoom)"
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
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </PaperProvider>
        </PersistGate>
      </Provider>
    </KeyboardProvider>
  );
}
