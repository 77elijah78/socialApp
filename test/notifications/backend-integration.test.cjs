// Source-verified 54d68df HTTP contracts. HTTP/native transport are doubles, not
// a deployed PostgreSQL/Expo/FCM test. No runtime mock implementation is shipped.
const{test,beforeEach,afterEach}=require('node:test');const assert=require('node:assert/strict');
const{settle,deferred}=require('../messaging/harness.cjs');const{id}=require('../activity/fixtures.cjs');
const{setTokens}=require('../../src/services/api.ts');const{PushInstallation}=require('../../src/services/notifications/PushInstallation.ts');
const{PushBackendService,PushSetupError,PushAccountAmbiguous,parseMessagePushPayload}=require('../../src/services/notifications/PushBackendService.ts');
const{PushTokenCoordinator}=require('../../src/services/notifications/PushTokenCoordinator.ts');
const A={accountId:id(1),authToken:'jwt-A'},B={accountId:id(2),authToken:'jwt-B'},DEVICE=id(3),PROJECT=id(4);
const TOKEN='ExponentPushToken[real_device_shape]';let owner,storage,registry,backend,calls,devices,prefs,enabled,intercept;
const originalFetch=global.fetch;
const payload=(patch={})=>({messageId:id(10),conversationId:id(11),senderId:id(12),conversationType:'private',notificationType:'MESSAGE',notificationId:id(13),...patch});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),json:async()=>status<300?{success:true,data}:{message:'secret provider token must not be exposed'}});
function makeRegistry(){return new PushInstallation({getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>{storage.set(key,value);}},()=>DEVICE);}
function client(registry=makeRegistry(),project=()=>PROJECT,origin='https://api.test'){return new PushBackendService(registry,project,()=>owner,origin);}
beforeEach(()=>{owner={...A};storage=new Map();devices=new Map();prefs={messagePushEnabled:true,pushPreviewsEnabled:false};enabled=true;intercept=null;calls=[];registry=makeRegistry();backend=client(registry);setTokens(A.authToken,'refresh-A');global.fetch=async(url,options={})=>{
 const path=new URL(url).pathname.replace('/api/v1','');const body=options.body?JSON.parse(options.body):null;const caller=options.headers?.Authorization==='Bearer jwt-B'?B:A;const call={path,body,method:options.method,authorization:options.headers?.Authorization};calls.push(call);if(intercept){const value=await intercept(call);if(value)return value;}
 if(path==='/push/devices'&&options.method==='POST'){
  if(!enabled)return response(null,503);if(body.projectId!==PROJECT)return response(null,409);const old=devices.get(body.deviceId);if(old&&old.owner!==caller.accountId)return response(null,409);devices.set(body.deviceId,{...body,owner:caller.accountId});return response({deviceId:body.deviceId,platform:'android',enabled:true,updatedAt:new Date().toISOString()});
 }
 if(path.startsWith('/push/devices/')&&options.method==='DELETE'){const key=path.split('/').at(-1);if(devices.get(key)?.owner===caller.accountId)devices.delete(key);return response({unregistered:true});}
 if(path==='/push/preferences'){if(options.method==='PATCH')prefs={...prefs,...body};return response(prefs);}
 return response(null,404);
};});
afterEach(()=>{global.fetch=originalFetch;setTokens(null,null);});
test('real registration sends exactly deviceId/platform/projectId/Expo token with existing JWT auth',async()=>{
 await backend.register(TOKEN,A);assert.deepEqual(calls[0],{path:'/push/devices',method:'POST',authorization:'Bearer jwt-A',body:{deviceId:DEVICE,platform:'android',projectId:PROJECT,token:TOKEN}});assert.deepEqual(backend.registration(),{accountId:A.accountId,deviceId:DEVICE});assert.equal(registry.peek().firstOwnerId,A.accountId);
});
test('installation UUID is single-flight, persisted across app restarts and not reset on logout',async()=>{
 const [x,y]=await Promise.all([registry.load(),registry.load()]);assert.equal(x.deviceId,y.deviceId);await backend.register(TOKEN,A);await backend.revoke(TOKEN,A);const next=makeRegistry();assert.equal((await next.load()).deviceId,DEVICE);assert.equal(next.peek().firstOwnerId,A.accountId);assert.equal(next.peek().registeredOwnerId,null);
});
test('encrypted installation metadata never persists raw Expo tokens or JWTs',async()=>{
 await backend.register(TOKEN,A);const raw=[...storage.values()][0];assert.equal(raw.includes(TOKEN),false);assert.equal(raw.includes(A.authToken),false);assert.ok(raw.includes(DEVICE));
});
test('corrupt installation metadata fails closed rather than inventing a second conflicting device ID',async()=>{
 await registry.load();storage.set([...storage.keys()][0],'{corrupt');const fresh=makeRegistry();await assert.rejects(fresh.load());assert.equal(calls.length,0);
});
test('a persisted registration can be revoked after restart even without an in-memory token',async()=>{
 await backend.register(TOKEN,A);const fresh=client();await fresh.revokeCurrent(A);assert.equal(devices.size,0);assert.equal(calls.at(-1).method,'DELETE');assert.equal(calls.at(-1).path,`/push/devices/${DEVICE}`);
});
test('rotation updates the same installation instead of creating another device',async()=>{
 await backend.register(TOKEN,A);await backend.register('ExpoPushToken[rotated]',A);assert.equal(devices.size,1);assert.equal(calls[1].body.deviceId,DEVICE);assert.equal(devices.get(DEVICE).token,'ExpoPushToken[rotated]');
});
test('disabled backend surfaces actionable PUSH_ENABLED/migration status without exposing backend error data',async()=>{
 enabled=false;await assert.rejects(backend.register(TOKEN,A),error=>error instanceof PushSetupError&&/PUSH_ENABLED/.test(error.message)&&!error.message.includes('secret'));assert.equal(backend.registration(),null);
});
test('missing/invalid EAS project configuration makes no registration request',async()=>{
 backend=client(registry,()=>null);await assert.rejects(backend.register(TOKEN,A),/project ID/);assert.equal(calls.length,0);
});
test('server project/device conflicts are not fake registration success',async()=>{
 backend=client(registry,()=>id(99));await assert.rejects(backend.register(TOKEN,A),/conflict/);assert.equal(backend.registration(),null);
});
test('malformed success acknowledgements do not enable push',async()=>{
 intercept=async call=>call.method==='POST'?response({deviceId:id(999),platform:'android',enabled:true}):null;await assert.rejects(backend.register(TOKEN,A));assert.equal(backend.registration(),null);
});
test('old-account cleanup may not borrow a new account JWT',async()=>{
 await backend.register(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');const count=calls.length;await assert.rejects(backend.revoke(TOKEN,A),/account changed/);assert.equal(calls.length,count);assert.equal(devices.get(DEVICE).owner,A.accountId);
});
test('cross-account registration requires the old account to unregister online',async()=>{
 await backend.register(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');const count=calls.length;await assert.rejects(backend.register(TOKEN,B),/previous account/);assert.equal(calls.length,count);
 owner={...A};setTokens(A.authToken,'refresh-A');await backend.revoke(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');await backend.register(TOKEN,B);assert.equal(devices.get(DEVICE).owner,B.accountId);assert.equal(registry.peek().ambiguous,true);
});
test('auth change while installation storage is loading prevents a stale POST',async()=>{
 const gate=deferred();registry=new PushInstallation({getItem:()=>gate.promise,setItem:async()=>{}},()=>DEVICE);backend=client(registry);const work=backend.register(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');gate.resolve(null);await assert.rejects(work,/account changed/);assert.equal(calls.length,0);
});
test('same-account access-token refresh uses the current JWT without changing installation identity',async()=>{
 owner={...A,authToken:'jwt-A-fresh'};setTokens(owner.authToken,'refresh-A');await backend.register(TOKEN,A);assert.equal(calls[0].authorization,'Bearer jwt-A-fresh');assert.equal(calls[0].body.deviceId,DEVICE);
});
test('cold-start legacy payload resolves from persisted server-confirmed owner, never current login',async()=>{
 await backend.register(TOKEN,A);backend=client();owner=null;setTokens(null,null);const target=await backend.parseMessage(payload());assert.equal(target.accountId,A.accountId);assert.equal(target.notificationId,id(13));assert.equal(calls.length,1);
});
test('both group and private payloads use the actual backend discriminator/IDs and ignore pushed URLs',async()=>{
 await backend.register(TOKEN,A);for(const conversationType of ['private','group']){const target=await backend.parseMessage(payload({conversationType,url:'yoursocialapp://forged'}));assert.equal(target.conversationId,id(11));assert.equal(target.messageId,id(10));assert.equal('url'in target,false);}
});
test('unregistered/unproven legacy push cannot be assigned to an arbitrary currently logged-in user',async()=>{
 await assert.rejects(backend.parseMessage(payload()),PushAccountAmbiguous);assert.equal(calls.length,0);
});
test('legacy payload after account changes fails closed even if both accounts can access the same group',async()=>{
 await backend.register(TOKEN,A);await backend.revoke(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');await backend.register(TOKEN,B);await assert.rejects(backend.parseMessage(payload({conversationType:'group'})),PushAccountAmbiguous);
});
test('payload from another API origin is not rebound to the new server',async()=>{
 await backend.register(TOKEN,A);const other=client(registry,()=>PROJECT,'https://another-api.test');await assert.rejects(other.parseMessage(payload()),PushAccountAmbiguous);
});
test('a self-sender push is ignored and malformed/unknown payloads are not navigation',async()=>{
 await backend.register(TOKEN,A);assert.equal(await backend.parseMessage(payload({senderId:A.accountId})),null);for(const bad of [null,[],{url:'https://attacker.test'},payload({notificationType:'COMMENT'}),payload({conversationType:'admin'}),payload({messageId:'../../settings'}),payload({notificationId:undefined})])assert.equal(parseMessagePushPayload(bad),null);
});
test('real preference GET/PATCH uses authoritative booleans and no fabricated user ownership fields',async()=>{
 assert.deepEqual(await backend.preferences(A),{messagePushEnabled:true,pushPreviewsEnabled:false});assert.deepEqual(await backend.updatePreferences(A,{pushPreviewsEnabled:true}),{messagePushEnabled:true,pushPreviewsEnabled:true});assert.deepEqual(calls.at(-1).body,{pushPreviewsEnabled:true});assert.equal(calls.at(-1).path,'/push/preferences');
});
test('permission-granted native lifecycle reaches ready only after a real HTTP acknowledgement',async()=>{
 const coordinator=new PushTokenCoordinator({capability:()=>({available:true}),permission:async()=>({granted:true,canAskAgain:true}),token:async()=>TOKEN,unregister:async()=>{}},backend);coordinator.update(A,true);await settle();assert.equal(coordinator.getSnapshot().state,'ready');assert.equal(devices.size,1);coordinator.update(A,false);await settle();assert.equal(devices.size,0);coordinator.stop();
});
test('unavailable server is visible through the actual native coordinator, not a silent generic success',async()=>{
 enabled=false;const coordinator=new PushTokenCoordinator({capability:()=>({available:true}),permission:async()=>({granted:true,canAskAgain:true}),token:async()=>TOKEN,unregister:async()=>{}},backend);coordinator.update(A,true);await settle();assert.equal(coordinator.getSnapshot().state,'error');assert.match(coordinator.getSnapshot().detail,/PUSH_ENABLED/);coordinator.stop();
});
test('permission loss cleans a durable previous-process binding without reacquiring a push token',async()=>{
 await backend.register(TOKEN,A);backend=client();let acquired=0;const coordinator=new PushTokenCoordinator({capability:()=>({available:true}),permission:async()=>({granted:false,canAskAgain:false}),token:async()=>{acquired++;return TOKEN;},unregister:async()=>{}},backend);coordinator.update(A,true);await settle();assert.equal(acquired,0);assert.equal(devices.size,0);assert.equal(coordinator.getSnapshot().state,'denied');coordinator.stop();
});
test('a failed previous-account cleanup blocks Expo token reacquisition before it can reactivate the old provider binding',async()=>{
 await backend.register(TOKEN,A);owner={...B};setTokens(B.authToken,'refresh-B');let acquisitions=0;const coordinator=new PushTokenCoordinator({capability:()=>({available:true}),permission:async()=>({granted:true,canAskAgain:true}),token:async()=>{acquisitions++;return TOKEN;},unregister:async()=>{}},backend);coordinator.update(B,true);await settle();assert.equal(acquisitions,0);assert.equal(coordinator.getSnapshot().state,'error');assert.match(coordinator.getSnapshot().detail,/previous account/);coordinator.stop();
});
