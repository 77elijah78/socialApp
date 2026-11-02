/* global __dirname */
// Static regression checks only. They do not compile Kotlin or exercise Android.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../plugins/native/GroupedNotificationsService.kt'),'utf8');
test('grouped renderer uses Android framework recovery with its API 24 guard',()=>{
 assert.match(source,/Build\.VERSION\.SDK_INT\s*<\s*Build\.VERSION_CODES\.N\)\s*return original/);
 assert.match(source,/android\.app\.Notification\.Builder\.recoverBuilder\(context, original\)\.setGroup\(group\)\.setDeleteIntent\(dismiss\)\.build\(\)/);
 assert.doesNotMatch(source,/NotificationCompat\.Builder\.recoverBuilder/);
});
test('dismiss intent assigns its own data rather than the outer JSON payload',()=>{
 assert.match(source,/Intent\(context, GroupedNotificationDismissReceiver::class\.java\)\.apply\s*\{\s*this\.data\s*=\s*Uri\.Builder\(\)/);
});
