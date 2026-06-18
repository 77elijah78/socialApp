import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { runMigrations } from "../db/migrations";
import { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => {
    runMigrations();
  }, []);
  
  return (
    <PaperProvider>
      <Stack screenOptions={{contentStyle: { backgroundColor: '#f5f5f5',borderColor: '#f5f5f5', }}}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(chatRoom)" options={{ headerShown: false }} />
      </Stack>
    </PaperProvider>
  );
}
