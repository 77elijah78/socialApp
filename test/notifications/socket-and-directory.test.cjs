const { test,before,beforeEach,afterEach }=require('node:test');const assert=require('node:assert/strict');
const {row,remote,installServer,sockets,settle,deferred}=require('../messaging/harness.cjs');
const {runMigrations}=require('../../src/db/migrations.ts');const{messageStore}=require('../../src/db/MessageStore.ts');const{roomStore}=require('../../src/db/RoomStore.ts');
const {SocketReceiver}=require('../../src/services/SocketReceiver.ts');const{MessageNotificationCoordinator}=require('../../src/services/notifications/MessageNotificationCoordinator.ts');
const {ConversationDirectory}=require('../../src/services/notifications/ConversationDirectory.ts');const{setTokens}=require('../../src/services/api.ts');
const participants=[{user:{id:'me',username:'me'}},{user:{id:'other',username:'sender',displayName:'The Sender',avatarUrl:'/uploads/images/avatar.jpg'}}];
const conversation=(id='room',patch={})=>({id,isGroup:false,groupName:null,groupAvatar:null,unreadCount:0,updatedAt:new Date().toISOString(),participants,messages:[],...patch});
const cached=(id='room',patch={})=>({id,conversationId:id,name:'Sender',isGroup:false,participantsData:JSON.stringify(participants.map(x=>x.user)),avatarUrl:'',receiverId:'other',lastMessage:'',lastMessageType:'TEXT',lastMessageTimestamp:0,unreadCount:0,cachedAt:Date.now(),updatedAt:Date.now(),muted:false,...patch});
let receiver,controller,server;const originalFetch=global.fetch;
before(async()=>runMigrations());beforeEach(async()=>{await messageStore.deleteAll();await roomStore.deleteAll();setTokens('auth','refresh');server=installServer();});
afterEach(()=>{controller?.stop();receiver?.disconnect();setTokens(null,null);global.fetch=originalFetch;controller=null;receiver=null;});
test('actual SocketReceiver emits persisted arrivals once to global presentation despite concurrent wire event duplicates',async()=>{
 receiver=new SocketReceiver('https://api.test');await roomStore.upsertRoom(cached());
 controller=new MessageNotificationCoordinator({socket:receiver,getRoom:async()=>cached(),navigate(){},unavailable(){},setAccount(){}});controller.start();controller.update({accountId:'me',enabled:true,active:true,conversationId:null,ready:true});
 const socketCount=sockets.length;receiver.connect('me','auth');let socket=sockets.at(-1);socket.receive('connect');socket.receive('message:new',remote(1));socket.receive('message:notification',remote(1));await settle();
 assert.equal((await messageStore.getRecent('room')).length,1);assert.equal((await roomStore.findRoom('room'))[0].unreadCount,1);assert.equal(controller.banners.getSnapshot().count,1);
 controller.banners.dismiss(controller.banners.getSnapshot().key);receiver.connect('me','fresh-auth');socket=sockets.at(-1);socket.receive('connect');socket.receive('message:new',remote(1));socket.receive('message:notification',remote(1));await settle();
 assert.equal(controller.banners.getSnapshot(),null);assert.equal(sockets.length,socketCount+2,'only the existing owner reconnects');assert.equal(socket.handlers.get('message:new').length,1);assert.equal(receiver.listeners.get('message:incoming').size,1);
 controller.stop();assert.equal(socket.connected,true);assert.equal(receiver.listeners.has('message:incoming'),false);
});
test('persisted history and old messages after application restart are not new message banners',async()=>{
 await messageStore.save(row(1));receiver=new SocketReceiver('https://api.test');const arrivals=[];receiver.on('message:incoming',row=>arrivals.push(row));receiver.connect('me','auth');sockets.at(-1).receive('message:new',remote(1));await settle();assert.equal(arrivals.length,0);
});
test('group arrival uses actual group metadata; presentation does not mark anything READ',async()=>{
 await roomStore.upsertRoom(cached('room',{isGroup:true,name:'Actual group'}));receiver=new SocketReceiver('https://api.test');
 controller=new MessageNotificationCoordinator({socket:receiver,getRoom:async()=>(await roomStore.findRoom('room'))[0],navigate(){},unavailable(){},setAccount(){}});controller.start();controller.update({accountId:'me',enabled:true,active:true,conversationId:null,ready:true});receiver.connect('me','auth');sockets.at(-1).receive('message:new',remote(1,{isGroup:true,type:'AUDIO',sender:{id:'other',username:'sender'}}));await settle();assert.equal(controller.banners.getSnapshot().groupName,'Actual group');assert.equal(controller.banners.getSnapshot().preview,'Voice message');assert.equal((await messageStore.getByServerId(row(1).id)).isRead,false);
});
test('conversation directory reuses local complete metadata and local mute state without a startup request',async()=>{
 await roomStore.upsertRoom(cached('room',{muted:true}));const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');const room=await directory.get('room');assert.equal(room.muted,true);assert.equal(server.calls.length,0);
});
test('sparse socket-created group metadata resolves via the actual active-membership list, not a nonexistent endpoint',async()=>{
 await roomStore.upsertRoom(cached('room',{participantsData:null}));server.response=async url=>{assert.equal(new URL(url).pathname,'/api/v1/messages/conversations');return{ok:true,status:200,json:async()=>({data:[conversation('room',{isGroup:true,groupName:'Actual group'})]})};};const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');assert.equal((await directory.get('room')).name,'Actual group');assert.equal(server.calls.length,1);
});
test('fresh conversation tap checks current membership, even when a cached room exists',async()=>{
 await roomStore.upsertRoom(cached());server.response=async()=>({ok:true,status:200,json:async()=>({data:[]})});const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');assert.equal((await directory.get('room')).name,'Sender');assert.equal(await directory.get('room',true),null);
});
test('another account in the server response is not accepted as active membership',async()=>{
 server.response=async()=>({ok:true,status:200,json:async()=>({data:[conversation('room',{participants:[{user:{id:'someone-else'}}]})]})});const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');assert.equal(await directory.get('room',true),null);
});
test('directory does not publish stale account ABA results or write stale room rows',async()=>{
 const gate=deferred();server.response=()=>gate.promise;const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');const pending=directory.get('room',true);await settle();directory.setAccount('other');directory.setAccount('me');gate.resolve({ok:true,status:200,json:async()=>({data:[conversation()]})});assert.equal(await pending,null);assert.equal((await roomStore.getAllRooms()).length,0);
});
test('local mute preferences publish once after persistence and preserve unread counts',async()=>{
 await roomStore.upsertRoom(cached('room',{unreadCount:17}));let changed=[];const release=roomStore.subscribePreferences(id=>changed.push(id));await roomStore.setMuted('room',true);assert.equal((await roomStore.findRoom('room'))[0].muted,true);assert.equal((await roomStore.findRoom('room'))[0].unreadCount,17);assert.deepEqual(changed,['room']);release();await roomStore.setMuted('room',false);assert.equal(changed.length,1);
});
test('metadata REST failure retains real local sender/mute information but never bypasses fresh tap verification',async()=>{
 await roomStore.upsertRoom(cached('room',{participantsData:null,muted:true}));server.response=async()=>{throw Error('offline');};const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');assert.equal((await directory.get('room')).muted,true);await assert.rejects(directory.get('room',true),/offline/);
});
test('cached participant metadata from another account cannot bypass membership verification',async()=>{
 await roomStore.upsertRoom(cached('room',{participantsData:JSON.stringify([{id:'someone-else',username:'Other'}])}));server.response=async()=>({ok:true,status:200,json:async()=>({data:[]})});const directory=new ConversationDirectory(()=> 'auth');directory.setAccount('me');assert.equal(await directory.get('room'),null);assert.equal(server.calls.length,1);
});
