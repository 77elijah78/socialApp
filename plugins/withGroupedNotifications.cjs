/* global __dirname */
const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// This replaces Expo's dispatcher with a subclass, not the FCM service. The
// subclass delegates all normal Expo behavior and only groups our v2 children.
module.exports = function withGroupedNotifications(config) {
  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.receiver ||= [];
    const name = 'com.elijah77.social.notifications.GroupedNotificationsService';
    const dismissName = 'com.elijah77.social.notifications.GroupedNotificationDismissReceiver';
    app.receiver = app.receiver.filter(receiver => ![name, dismissName, 'expo.modules.notifications.service.NotificationsService'].includes(receiver.$['android:name']));
    app.receiver.push({ $: { 'android:name': dismissName, 'android:exported': 'false' } });
    app.receiver.push({ $: { 'android:name': 'expo.modules.notifications.service.NotificationsService', 'tools:node': 'remove' } });
    app.receiver.push({ $: { 'android:name': name, 'android:enabled': 'true', 'android:exported': 'false' },
      'intent-filter': [{ $: { 'android:priority': '-1' }, action: [
        'expo.modules.notifications.NOTIFICATION_EVENT', 'android.intent.action.BOOT_COMPLETED',
        'android.intent.action.REBOOT', 'android.intent.action.QUICKBOOT_POWERON',
        'com.htc.intent.action.QUICKBOOT_POWERON', 'android.intent.action.MY_PACKAGE_REPLACED',
      ].map(value => ({ $: { 'android:name': value } })) }] });
    return config;
  });
  config = withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') throw new Error('Grouped notifications require the Groovy Android app build file');
    const dependency = 'implementation("androidx.core:core:1.17.0") // grouped notification renderer';
    if (!config.modResults.contents.includes(dependency)) {
      if (!config.modResults.contents.includes('dependencies {')) throw new Error('Android app dependency block not found');
      config.modResults.contents = config.modResults.contents.replace('dependencies {', `dependencies {\n    ${dependency}`);
    }
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const destination = path.join(config.modRequest.platformProjectRoot, 'app/src/main/java/com/elijah77/social/notifications/GroupedNotificationsService.kt');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(path.join(__dirname, 'native/GroupedNotificationsService.kt'), destination);
    return config;
  }]);
};
