import React from 'react';
import { View, Text, Button } from 'react-native';
import { useRouter } from 'expo-router';
import theme from "@/constants/theme";

export default function VerifyOTPScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>This is Verify OTP Screen</Text>
      <Button title="Verify (Success)" onPress={() => router.replace('/(tabs)')} />
      <Button title="Show Error" onPress={() => alert('Invalid OTP')} />
    </View>
  );
}