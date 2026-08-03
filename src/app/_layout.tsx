import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { runMigrations } from "../db/migrations";
import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { store, persistor } from "@/store/index";
import { ActivityIndicator, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import theme from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";
import { mediaService } from "@/services/MediaService";
import api, { setTokens } from "@/services/api";

  function PersistGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        const state = store.getState();
        setTokens(state.auth.token, state.auth.refreshToken);
        setReady(true);
        unsub();
      }
    });
    if (persistor.getState().bootstrapped) {
      const state = store.getState();
      setTokens(state.auth.token, state.auth.refreshToken);
      setTimeout(() => setReady(true), 0);
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

  useEffect(() => {
    if (isAuthenticated && userId && token) {
      mediaService.setAuthToken(token);
      mediaService.connectSocket(userId, token);
    } else if (!isAuthenticated) {
      mediaService.disconnectSocket();
    }
  }, [isAuthenticated, token, userId]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    runMigrations();
  }, []);

  return (
    <KeyboardProvider>
      <Provider store={store}>
        <PersistGate>
          <PaperProvider>
            <SocketProvider />
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
            </Stack>
          </PaperProvider>
        </PersistGate>
      </Provider>
    </KeyboardProvider>
  );
}
