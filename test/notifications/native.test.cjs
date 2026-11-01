// SDK calls are native doubles. This does not prove FCM/EAS/device delivery.
const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');
const{mock,native}=require('../messaging/harness.cjs');
const constants={executionEnvironment:'bare',easConfig:{projectId:'real-eas-id'},expoConfig:{}};
const device={isDevice:true};let calls=[],handler,permission={granted:false,canAskAgain:true};
const notifications={AndroidImportance:{HIGH:4},AndroidNotificationVisibility:{PRIVATE:0},
 setNotificationHandler(value){handler=value;},setNotificationChannelAsync:async(id,config)=>{calls.push(['channel',id,config]);},
 getPermissionsAsync:async()=>{calls.push(['permission']);return permission;},requestPermissionsAsync:async()=>{calls.push(['request']);return{granted:true,canAskAgain:true};},
 getExpoPushTokenAsync:async options=>{calls.push(['token',options]);return{data:'ExponentPushToken[test]'};}};
mock('expo-constants',constants);mock('expo-device',device);mock('expo-notifications',notifications);native.Linking.openSettings=async()=>calls.push(['settings']);
function load(){delete require.cache[require.resolve('../../src/services/notifications/NativeMessageNotifications.ts')];return require('../../src/services/notifications/NativeMessageNotifications.ts');}
beforeEach(()=>{calls=[];handler=null;permission={granted:false,canAskAgain:true};constants.executionEnvironment='bare';constants.easConfig={projectId:'real-eas-id'};device.isDevice=true;native.Platform.OS='android';});
test('foreground handler suppresses duplicate OS banner/list/sound/badge synchronously before auth startup',async()=>{const n=load();n.installForegroundHandler();assert.ok(handler);assert.deepEqual(await handler.handleNotification({}),{shouldShowBanner:false,shouldShowList:false,shouldPlaySound:false,shouldSetBadge:false});assert.equal(calls.length,0);});
test('Android high-importance private-lockscreen Messages channel exists before POST_NOTIFICATIONS prompt',async()=>{const n=load();await n.readPushPermission(true);assert.deepEqual(calls.map(x=>x[0]),['channel','permission','request']);assert.equal(calls[0][1],'messages');assert.equal(calls[0][2].importance,4);assert.equal(calls[0][2].lockscreenVisibility,0);assert.equal(calls[0][2].sound,'default');});
test('permission status read does not unexpectedly prompt',async()=>{await load().readPushPermission();assert.equal(calls.some(x=>x[0]==='request'),false);});
test('already granted permissions never trigger a redundant prompt',async()=>{permission={granted:true,canAskAgain:true};await load().readPushPermission(true);assert.equal(calls.some(x=>x[0]==='request'),false);});
test('Expo token acquisition uses the actual EAS project ID rather than an FCM token',async()=>{const n=load();n.notificationModule();assert.equal(await n.getMessagePushToken(),'ExponentPushToken[test]');assert.deepEqual(calls[0],['token',{projectId:'real-eas-id'}]);});
test('Expo Go is rejected before loading or invoking the remote push native module',()=>{constants.executionEnvironment='storeClient';const n=load();assert.equal(n.notificationModule(),null);assert.equal(n.pushCapability().available,false);assert.match(n.pushCapability().explanation,/EAS/);});
test('physical device and EAS project configuration are checked independently',()=>{const n=load();device.isDevice=false;assert.match(n.pushCapability().explanation,/physical/);device.isDevice=true;constants.easConfig={};assert.match(n.pushCapability().explanation,/project ID/);});
test('notification settings route opens the OS settings, not an invented internal settings screen',async()=>{await load().openNotificationSettings();assert.deepEqual(calls,[['settings']]);});
test('Android-only backend is not sent iOS registrations',()=>{native.Platform.OS='ios';assert.equal(load().pushCapability().available,false);assert.equal(calls.length,0);});
test('native installation UUID uses existing Expo Modules Core without another native dependency',()=>{const previous=globalThis.expo;try{globalThis.expo={uuidv4:()=> '00000000-0000-4000-8000-000000000001'};assert.equal(load().nativePushDeviceId(),'00000000-0000-4000-8000-000000000001');}finally{globalThis.expo=previous;}});
