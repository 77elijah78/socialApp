const {test}=require('node:test');const assert=require('node:assert/strict');const {mock,root}=require('../messaging/harness.cjs');const {id}=require('../activity/fixtures.cjs');const path=require('node:path');
process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS='1';let enabled=[];
mock(path.join(root,'src/services/notifications/AndroidMessageActions'),{enableAndroidNotificationActions:async id=>enabled.push(id)});
const {setTokens}=require('../../src/services/api.ts');const {PushInstallation}=require('../../src/services/notifications/PushInstallation.ts');const {PushBackendService,PushSetupError}=require('../../src/services/notifications/PushBackendService.ts');
const A=id(1),D=id(2),P=id(3),owner={accountId:A,authToken:'jwt-A'};const original=global.fetch;
test('opt-in registration selects v2 on every refresh and requires server acknowledgement',async()=>{
 const data=new Map(),install=new PushInstallation({getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,v)},()=>D),client=new PushBackendService(install,()=>P,()=>owner,'https://api.test');
 const requests=[];let mode='android-data-v2';setTokens('jwt-A',null);global.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,status:200,headers:new Headers(),json:async()=>({success:true,data:{deviceId:D,platform:'android',enabled:true,deliveryMode:mode}})}};
 try{await client.register('ExponentPushToken[one]',owner);await client.register('ExponentPushToken[two]',owner);assert.deepEqual(requests.map(r=>r.deliveryMode),['android-data-v2','android-data-v2']);assert.deepEqual(enabled,[A,A]);
 mode=undefined;await assert.rejects(client.register('ExponentPushToken[three]',owner),error=>error instanceof PushSetupError&&/updated push backend/.test(error.message));}
 finally{global.fetch=original;setTokens(null,null);}
});
