const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');
const {mock,native,root}=require('../messaging/harness.cjs');const {id}=require('../activity/fixtures.cjs');const path=require('node:path');
process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS='1';native.Platform.OS='android';
const sql=new DatabaseSync(':memory:'),secure=new Map();let chain=Promise.resolve();
const db={execAsync:async q=>sql.exec(q),runAsync:async(q,...args)=>({changes:Number(sql.prepare(q).run(...args).changes)}),getFirstAsync:async(q,...args)=>sql.prepare(q).get(...args)??null,getAllAsync:async(q,...args)=>sql.prepare(q).all(...args),withExclusiveTransactionAsync:async fn=>{const p=chain.then(async()=>{sql.exec('BEGIN');try{await fn(db);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}});chain=p.catch(()=>{});return p;}};
mock('expo-sqlite',{openDatabaseAsync:async()=>db});mock('expo-secure-store',{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{secure.set(k,v);},deleteItemAsync:async k=>{secure.delete(k);}});
let executor,registered=[],scheduled=[],dismissed=[],categories=[];
mock('expo-task-manager',{isTaskDefined:()=>!!executor,defineTask:(_name,fn)=>{executor=fn;}});
mock('expo-notifications',{setNotificationCategoryAsync:async(...args)=>categories.push(args),registerTaskAsync:async name=>registered.push(name),scheduleNotificationAsync:async value=>{scheduled.push(value);return value.identifier??'notice';},dismissNotificationAsync:async id=>dismissed.push(id)});
const A=id(1),B=id(2),D=id(3),C=id(4),M=id(5),N=id(6),S=id(7),ACTION=id(8),ORIGIN='https://api.test';
let owner=A,auth={isAuthenticated:true,user:{id:A},token:'jwt-A'};
mock(path.join(root,'src/store'),{store:{getState:()=>({auth})},persistor:{getState:()=>({bootstrapped:true}),subscribe:()=>()=>{}}});
mock(path.join(root,'src/services/notifications/NativeMessageNotifications'),{nativePushStorage:{getItem:async()=>JSON.stringify({deviceId:D,firstOwnerId:owner,lastOwnerId:owner,registeredOwnerId:owner,pendingOwnerId:null,origin:ORIGIN,ambiguous:false}),setItem:async()=>{}},nativePushDeviceId:()=>D});
const v2={contractVersion:2,notificationType:'MESSAGE',deliveryMode:'android-data-v2',notificationId:N,recipientUserId:A,deviceId:D,messageId:M,conversationId:C,conversationType:'private',senderId:S,groupKey:`socialapp:v2:${A}:${C}`,categoryIdentifier:'MESSAGE_REPLY_V2',display:{title:'New message',body:'You have a new message',channelId:'messages'}};
const actions=require('../../src/services/notifications/AndroidMessageActions.ts');let calls=[];const oldFetch=global.fetch;
global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:201,json:async()=>({success:true,data:{id:id(9),conversationId:C,senderId:A,repliedToId:M}})}};
const event=payload=>executor({data:payload,error:null});
test('defines task, registers category and renders separate stable grouped child only once',async()=>{
 await actions.prepareAndroidMessageActions();assert.deepEqual(registered,['SOCIAL_MESSAGE_ACTIONS_V2']);assert.equal(categories[0][1][0].options.opensAppToForeground,false);
 await event({notification:null,data:{dataString:JSON.stringify(v2)}});await event({notification:null,data:{dataString:JSON.stringify(v2)}});
 assert.equal(scheduled.length,1);assert.equal(scheduled[0].identifier,N);assert.equal(scheduled[0].content.data.groupKey,v2.groupKey);assert.equal(scheduled[0].content.categoryIdentifier,'MESSAGE_REPLY_V2');
});
test('native task response dataString persists and sends once through the idempotent backend contract',async()=>{
 const payload={actionIdentifier:'REPLY_MESSAGE_V2',userText:'hello',notification:{request:{content:{dataString:JSON.stringify({...v2,replyActionId:ACTION})}}}};
 await event(payload);await event(payload);assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.equal(body.notificationAction.actionId,ACTION);assert.equal(body.content,'hello');assert.deepEqual(dismissed,[N]);
});
test('timeout retains action for a safe identical retry on app resume',async()=>{
 calls=[];const payload={actionIdentifier:'REPLY_MESSAGE_V2',userText:'offline',notification:{request:{content:{dataString:JSON.stringify({...v2,replyActionId:id(10)})}}}};
 global.fetch=async(url,options)=>{calls.push({url,options});throw Error('timeout');};await event(payload);assert.equal(calls.length,1);
 global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:201,json:async()=>({success:true,data:{id:id(9),conversationId:C,senderId:A,repliedToId:M}})}};
 await actions.retryAndroidNotificationReplies();assert.equal(calls.length,2);assert.equal(calls[0].options.body,calls[1].options.body);
});
test('another account or disabled owner cannot send old action',async()=>{
 calls=[];owner=B;auth={isAuthenticated:true,user:{id:B},token:'jwt-B'};
 await event({actionIdentifier:'REPLY_MESSAGE_V2',userText:'no',notification:{request:{content:{dataString:JSON.stringify({...v2,replyActionId:id(11)})}}}});assert.equal(calls.length,0);
 owner=A;await actions.clearAndroidNotificationActions(A);await event({notification:null,data:{dataString:JSON.stringify({...v2,notificationId:id(99)})}});assert.equal(scheduled.some(x=>x.identifier===id(99)),false);
 global.fetch=oldFetch;
});
test('different conversations render distinct groups and multiple messages retain child identities',async()=>{
 await actions.enableAndroidNotificationActions(A);owner=A;auth={isAuthenticated:true,user:{id:A},token:'jwt-A'};
 const conversation=id(55);const second={...v2,notificationId:id(44)};const third={...v2,notificationId:id(45),conversationId:conversation,groupKey:`socialapp:v2:${A}:${conversation}`};
 await event({notification:null,data:{dataString:JSON.stringify(second)}});await event({notification:null,data:{dataString:JSON.stringify(third)}});
 const two=scheduled.find(v=>v.identifier===id(44)),three=scheduled.find(v=>v.identifier===id(45));assert.equal(two.content.data.groupKey,v2.groupKey);assert.notEqual(two.content.data.groupKey,three.content.data.groupKey);
});
