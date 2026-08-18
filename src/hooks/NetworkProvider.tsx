import React from "react";
import { View } from "react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { OfflineBanner } from "@/components/ui/OfflineBanner";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { isOffline, markOnline } = useNetworkStatus();

  return (
    <View style={{ flex: 1 }}>
      {children}
      <OfflineBanner
        isOffline={isOffline}
        visible={isOffline}
        onRetry={markOnline}
      />
    </View>
  );
}
