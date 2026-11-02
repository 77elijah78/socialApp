// Actual singleton/runtime, shared SocketReceiver, Redux, SQLite, HTTP client,
// native bridge and mounted settings. HTTP/FCM/native navigation are doubles.
const{test}=require('node:test');const assert=require('node:assert/strict');const React=require('react');
const{act,create}=require('react-test-renderer');const{Provider,useSelector,useDispatch}=require('react-redux');const{configureStore}=require('@reduxjs/toolkit');
const{mock,native,settle,sockets}=require('../messaging/harness.cjs');const{id}=require('../activity/fixtures.cjs');
const{default:auth,setCredentials,logout}=require('../../src/store/slices/authSlice.ts');const{default:app}=require('../../src/store/slices/appSlice.ts');
const store=configureStore({reducer:{auth,app}});mock('@/store',{store});mock('@/store/hooks',{useAppSelector:useSelector,useAppDispatch:useDispatch});
const A=id(901),B=id(902),SENDER=id(903),PRIVATE=id(904),GROUP=id(905),DEVICE=id(906),PROJECT=id(907);
const encrypted=new Map([['message-push-installation-v1',JSON.stringify({deviceId:DEVICE,firstOwnerId:A,lastOwnerId:A,registeredOwnerId:A,pendingOwnerId:null,origin:'https://api.test',ambiguous:false})]]);
const nativeCalls=[],responseListeners=new Set(),receivedListeners=new Set();let last=null,dialogs=[],routes=[];
mock('expo-constants',{executionEnvironment:'bare',easConfig:{projectId:PROJECT},expoConfig:{}});mock('expo-device',{isDevice:true});
mock('expo-secure-store',{getItemAsync:async key=>encrypted.get(key)??null,setItemAsync:async(key,value)=>{encrypted.set(key,value);}});
const sdk={DEFAULT_ACTION_IDENTIFIER:'native-default',AndroidImportance:{HIGH:4},AndroidNotificationVisibility:{PRIVATE:0},setNotificationHandler(){},
 setNotificationChannelAsync:async(channel,options)=>{nativeCalls.push(['channel',channel,options]);},getPermissionsAsync:async()=>({granted:true,canAskAgain:true}),
 getDevicePushTokenAsync:async()=>({type:'android',data:'native-fcm-token'}),getExpoPushTokenAsync:async()=>({data:'ExpoPushToken[device_token]'}),setAutoServerRegistrationEnabledAsync:async value=>{nativeCalls.push(['auto-register',value]);},unregisterForNotificationsAsync:async()=>{nativeCalls.push(['unregister']);},
 addNotificationResponseReceivedListener:fn=>{responseListeners.add(fn);return{remove:()=>responseListeners.delete(fn)};},
 addNotificationReceivedListener:fn=>{receivedListeners.add(fn);return{remove:()=>receivedListeners.delete(fn)};},getLastNotificationResponse:()=>last,
 clearLastNotificationResponse:()=>{last=null;},dismissNotificationAsync:async()=>{},dismissAllNotificationsAsync:async()=>{},};
mock('expo-notifications',sdk);mock('expo-router',{router:{push:target=>routes.push(target)}});mock('@/services/AppDialogService',{showAppDialog:dialog=>dialogs.push(dialog)});native.Platform.OS='android';native.Switch='Switch';
const{runMigrations}=require('../../src/db/migrations.ts');const{messageStore}=require('../../src/db/MessageStore.ts');const{roomStore}=require('../../src/db/RoomStore.ts');
const{setTokens}=require('../../src/services/api.ts');const{socketReceiver}=require('../../src/services/SocketReceiver.ts');const{mediaService}=require('../../src/services/MediaService.ts');
const service=require('../../src/services/notifications/MessageNotifications.ts');const Settings=require('../../src/components/notifications/PushNotificationSettings.tsx').default;
const{revokePushBeforeLogout}=require('../../src/services/notifications/PushLogout.ts');
const message=(conversationId=PRIVATE,notificationId=id(950))=>({messageId:id(949),conversationId,senderId:SENDER,conversationType:conversationId===GROUP?'group':'private',notificationType:'MESSAGE',notificationId});
function tap(data,identifier){last={notification:{request:{identifier,content:{data}}},actionIdentifier:'native-default'};for(const listener of responseListeners)listener(last);}
const scope=(accountId='',patch={})=>({accountId,enabled:true,active:true,conversationId:null,visibleConversationId:null,ready:false,...patch});
const response=data=>({ok:true,status:200,headers:new Headers(),json:async()=>({success:true,data})});
test('actual runtime registers, restores a cold tap, scopes visibility, syncs, manages preferences and safely rejects account-ambiguous links',async()=>{
 await runMigrations();await messageStore.deleteAll();await roomStore.deleteAll();const originalFetch=global.fetch,oldSet=global.setInterval,oldClear=global.clearInterval;
 const intervals=new Map(),http=[],devices=new Map([[DEVICE,{owner:A}]]),preferences=new Map();let removed=false,release,root;
 global.setInterval=(fn,ms)=>{const key=Symbol();intervals.set(key,{fn,ms});return key;};global.clearInterval=key=>intervals.delete(key);
 global.fetch=async(url,options={})=>{
  const path=new URL(url).pathname.replace('/api/v1',''),body=options.body?JSON.parse(options.body):null;http.push({path,body,method:options.method,authorization:options.headers?.Authorization});
  const caller=options.headers?.Authorization==='Bearer jwt-B'?B:A;
  if(path==='/push/devices'&&options.method==='POST'){devices.set(body.deviceId,{owner:caller});return response({deviceId:body.deviceId,platform:'android',enabled:true});}
  if(path.startsWith('/push/devices/')&&options.method==='DELETE'){if(devices.get(DEVICE)?.owner===caller)devices.delete(DEVICE);return response({unregistered:true});}
  if(path==='/push/preferences'){let data=preferences.get(caller)??{messagePushEnabled:true,pushPreviewsEnabled:false};if(options.method==='PATCH'){data={...data,...body};preferences.set(caller,data);}return response(data);}
  if(path==='/messages/conversations')return response([PRIVATE,...removed?[]:[GROUP]].map(conversationId=>({id:conversationId,isGroup:conversationId===GROUP,groupName:conversationId===GROUP?'Real group':null,groupAvatar:null,updatedAt:new Date().toISOString(),unreadCount:1,messages:[],participants:[{user:{id:caller,username:'current'}},{user:{id:SENDER,username:'sender',displayName:'Sender',avatarUrl:null}}]})));
  if(path.includes('/messages'))return response([]);
  throw Error('Unexpected route '+path);
 };
 try{
  last={notification:{request:{identifier:'cold',content:{data:message()}}},actionIdentifier:'native-default'};
  release=service.startMessageNotifications();service.updateMessageNotificationScope(scope());await settle();assert.equal(routes.length,0);
  setTokens('jwt-A','refresh-A');store.dispatch(setCredentials({user:{id:A,username:'a'},token:'jwt-A'}));mediaService.setAuthToken('jwt-A');socketReceiver.connect(A,'jwt-A');const socket=sockets.at(-1);socket.receive('connect');
  service.updateMessageNotificationScope(scope(A));await settle();assert.equal(routes.length,0);assert.equal(service.messagePush.getSnapshot().state,'ready');assert.equal(devices.get(DEVICE).owner,A);
  const registration=http.find(x=>x.path==='/push/devices'&&x.method==='POST');assert.equal(registration.body.deviceId,DEVICE);assert.equal(registration.body.projectId,PROJECT);assert.equal(registration.authorization,'Bearer jwt-A');assert.ok(nativeCalls.some(x=>x[0]==='channel'&&x[1]==='messages'));
  service.updateMessageNotificationScope(scope(A,{ready:true}));await settle();assert.equal(routes.length,1);assert.equal(routes[0].pathname,'/(chatRoom)/privateRoom');assert.equal(routes[0].params.conversationId,PRIVATE);assert.equal(last,null);
  service.updateMessageNotificationScope(scope(A,{ready:true,conversationId:PRIVATE,visibleConversationId:PRIVATE}));assert.equal(intervals.size,1);assert.equal([...intervals.values()][0].ms,15000);assert.ok(socket.emitted.some(x=>x.event==='conversation:visibility'&&x.data.conversationId===PRIVATE&&x.data.state==='foreground'));
  socket.receive('messages:sync',{reason:'adapter-reconnected'});await settle();assert.ok(http.some(x=>x.path===`/messages/conversations/${PRIVATE}/messages`));assert.equal(socket.emitted.some(x=>x.event==='message:read'),false);
  service.updateMessageNotificationScope(scope(A,{ready:true,active:false,conversationId:PRIVATE,visibleConversationId:null}));assert.equal(intervals.size,0);assert.equal(socket.emitted.filter(x=>x.event==='conversation:visibility').at(-1).data.state,'background');
  tap(message(GROUP,id(951)),'warm');await settle();assert.equal(routes.length,1);service.updateMessageNotificationScope(scope(A,{ready:true,conversationId:PRIVATE,visibleConversationId:PRIVATE}));await settle();assert.equal(routes.length,2);assert.equal(routes[1].params.isGroup,'true');assert.equal(routes[1].params.receiverName,'Real group');assert.equal(routes[1].params.receiverId,'');
  tap(message(GROUP,id(951)),'provider-duplicate');await settle();assert.equal(routes.length,2);
  removed=true;tap(message(GROUP,id(952)),'removed-group');await settle();assert.equal(routes.length,2);assert.match(dialogs.at(-1).message,/no longer available/);
  await act(async()=>{root=create(React.createElement(Provider,{store},React.createElement(Settings)));await settle();});
  const globalSwitch=root.root.findByProps({accessibilityLabel:'Message push on all devices'});await act(async()=>{globalSwitch.props.onValueChange(false);await settle();});assert.equal(preferences.get(A).messagePushEnabled,false);assert.ok(root.root.findAllByType('Text').some(x=>typeof x.props.children==='string'&&x.props.children.includes('turned off for your account')));
  await act(async()=>{root.root.findByProps({accessibilityLabel:'Show message previews'}).props.onValueChange(true);await settle();});assert.equal(preferences.get(A).pushPreviewsEnabled,true);
  const originalExchange=sdk.getExpoPushTokenAsync;const rejectedBody=JSON.stringify({errors:[{code:'VALIDATION_ERROR',message:'deviceId invalid secret'}]});
  sdk.getExpoPushTokenAsync=async()=>{throw Object.assign(new Error(`received: Bad Request (body: "${rejectedBody}").`),{code:'ERR_NOTIFICATIONS_SERVER_ERROR'});};
  await act(async()=>{await service.messagePush.refresh();await settle();});assert.match(service.messagePush.getSnapshot().detail,/HTTP 400/);assert.match(service.messagePush.getSnapshot().detail,/VALIDATION_ERROR/);
  const projectLabel=root.root.findByProps({testID:'push-runtime-project'}).props.children;assert.ok(projectLabel.includes(PROJECT));assert.ok(root.root.findAllByType('Text').some(node=>node.props.selectable===true&&typeof node.props.children==='string'&&node.props.children.includes('HTTP 400')));sdk.getExpoPushTokenAsync=originalExchange;
  await act(async()=>{await revokePushBeforeLogout();store.dispatch(logout());setTokens(null,null);service.updateMessageNotificationScope(scope());await settle();});assert.equal(devices.size,0);assert.equal(intervals.size,0);assert.ok(http.some(x=>x.method==='DELETE'&&x.authorization==='Bearer jwt-A'));
  await act(async()=>{setTokens('jwt-B','refresh-B');store.dispatch(setCredentials({user:{id:B,username:'b'},token:'jwt-B'}));mediaService.setAuthToken('jwt-B');socketReceiver.connect(B,'jwt-B');sockets.at(-1).receive('connect');service.updateMessageNotificationScope(scope(B,{ready:true}));await settle();});assert.equal(service.messagePush.getSnapshot().state,'ready');assert.equal(devices.get(DEVICE).owner,B);assert.equal(service.pushInstallation.peek().ambiguous,true);assert.equal(root.root.findByProps({accessibilityLabel:'Show message previews'}).props.value,false);
  const before=routes.length;tap(message(GROUP,id(953)),'old-account-link');await settle();assert.equal(routes.length,before);assert.match(dialogs.at(-1).message,/cannot safely identify/);assert.equal(last,null);
  assert.equal(socketReceiver.listeners.get('message:incoming').size,1);assert.equal(responseListeners.size,1);assert.equal(receivedListeners.size,1);
 }finally{
  if(root)await act(async()=>{root.unmount();await settle();});release?.();socketReceiver.disconnect();setTokens(null,null);global.fetch=originalFetch;global.setInterval=oldSet;global.clearInterval=oldClear;
 }
 assert.equal(intervals.size,0);assert.equal(responseListeners.size,0);assert.equal(receivedListeners.size,0);assert.equal(socketReceiver.listeners.has('message:incoming'),false);
});
