import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { runMigrations } from "../db/migrations";
import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { store, persistor } from '@/store/index'
import { ActivityIndicator, View } from 'react-native';

function PersistGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        setReady(true);
        unsub();
      }
    });
    if (persistor.getState().bootstrapped) setReady(true);
    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <>{children}</>;
}


export default function RootLayout() {
  useEffect(() => {
    runMigrations();
  }, []);

  return (
<Provider store={store}>
  <PersistGate>
        <PaperProvider>
          <Stack
            screenOptions={{
              contentStyle: {
                backgroundColor: "#f5f5f5",
                borderColor: "#f5f5f5",
              },
            }}
          >
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(chatRoom)" options={{ headerShown: false }} />
          </Stack>
        </PaperProvider>
        </PersistGate>
        </Provider>

  );
}
