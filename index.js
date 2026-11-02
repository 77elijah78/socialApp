// Task definitions must be loaded before Expo Router starts the UI, including
// when Android starts the bundle headlessly for a notification action.
if (process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS === '1') {
  require('./src/services/notifications/AndroidMessageActions');
}
require('expo-router/entry');
