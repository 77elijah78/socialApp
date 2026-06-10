import React from 'react';
import { View, Text, Button } from 'react-native';
import { useRouter } from 'expo-router';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>This is Forgot Password Screen</Text>
      <Button title="Send Reset Link (Success)" onPress={() => alert('Success: Check your email')} />
      <Button title="Show Error" onPress={() => alert('Error: Email not found')} />
    </View>
  );
}
