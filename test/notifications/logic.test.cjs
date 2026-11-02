// Native transport is mocked by the existing harness; these are not device tests.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { row, settle, deferred } = require('../messaging/harness.cjs');
const { MessageBannerQueue, messageBanner, messagePreview } = require('../../src/services/notifications/MessageBannerQueue.ts');
const { MessageNotificationCoordinator } = require('../../src/services/notifications/MessageNotificationCoordinator.ts');
const author = { id: 'other', username: 'sender', displayName: 'Sender Name', avatarUrl: '/uploads/images/sender.png' };
const room = (id='room', extra={}) => ({ id, conversationId: id, name:'Room', isGroup:false, muted:false, avatarUrl:'',
  receiverId:'other', participantsData:JSON.stringify([author,{id:'me',username:'me'}]), ...extra });
class Source {
  listeners = new Map();
  on(event, callback) { const set=this.listeners.get(event)||new Set();set.add(callback);this.listeners.set(event,set);return()=>{set.delete(callback);if(!set.size)this.listeners.delete(event);}; }
  emit(event, data) { for(const cb of this.listeners.get(event)||[])cb(data); }
}
let controller;
afterEach(()=>controller?.stop());
function setup(overrides={}) {
  const socket = new Source(), navigations=[], errors=[], accounts=[];
  const deps={ socket, getRoom:async id=>room(id), navigate:target=>navigations.push(target), unavailable:(message,retry)=>errors.push({message,retry}), setAccount:id=>accounts.push(id), ...overrides };
  controller=new MessageNotificationCoordinator(deps);controller.start();
  const scope={accountId:'me',enabled:true,active:true,conversationId:null,ready:true};controller.update(scope);
  return{socket,navigations,errors,accounts,scope,deps};
}
for(const [type,label] of Object.entries({IMAGE:'Photo',VIDEO:'Video',AUDIO:'Voice message',DOCUMENT:'Document',SHARED_POST:'Shared a post',SHARED_STORY:'Shared a story'}))
  test(`${type} has the actual backend media preview`,()=>assert.equal(messagePreview({type,content:'http://private-file'}),label));
test('text previews normalize whitespace, remain bounded and have meaningful empty fallback',()=>{
  assert.equal(messagePreview({type:'TEXT',content:' Hello\n\tworld '}),'Hello world');
  assert.equal(messagePreview({type:'TEXT',content:'x'.repeat(900)}).length,180);
  assert.equal(messagePreview({type:'TEXT',content:''}),'New message');
});
test('real sender identity and real group metadata are used, including bounded long display names',()=>{
  const banner=messageBanner(row(1,{senderData:JSON.stringify({...author,displayName:'a'.repeat(150)})}),room('room',{isGroup:true,name:'The group'}));
  assert.equal(banner.senderName.length,100);assert.equal(banner.groupName,'The group');assert.equal(banner.avatarUrl,author.avatarUrl);
});
test('malformed or wrong-account sender data falls back to actual participant metadata',()=>{
  assert.equal(messageBanner(row(1,{senderData:'{bad'}),room()).senderName,'Sender Name');
  assert.equal(messageBanner(row(1,{senderData:JSON.stringify({id:'forged',displayName:'Fake'})}),room()).senderName,'Sender Name');
});
test('rapid arrivals coalesce by conversation without overlap or loss of represented count',()=>{
  const queue=new MessageBannerQueue();const first=messageBanner(row(1),room());queue.enqueue(first);
  for(let i=2;i<=1000;i++)queue.enqueue(messageBanner(row(i),room()));
  queue.enqueue(messageBanner(row(1001,{conversationId:'group'}),room('group',{isGroup:true})));
  assert.equal(queue.getSnapshot().count,1000);assert.equal(queue.getSnapshot().key,first.key);
  queue.dismiss(first.key);assert.equal(queue.getSnapshot().conversationId,'group');queue.dismiss(queue.getSnapshot().key);assert.equal(queue.getSnapshot(),null);
});
test('a stale dismissal cannot remove the next visible banner',()=>{
  const q=new MessageBannerQueue();q.enqueue(messageBanner(row(1),room()));q.enqueue(messageBanner(row(2,{conversationId:'next'}),room('next')));q.dismiss(row(1).id);q.dismiss(row(1).id);assert.equal(q.getSnapshot().messageId,row(2).id);
});
for(const screen of ['Home','Profile','Activity','Settings','another chat'])test(`incoming private message appears on ${screen}`,async()=>{
  const {socket}=setup();if(screen==='another chat')controller.update({accountId:'me',enabled:true,active:true,conversationId:'different',ready:true});
  socket.emit('message:incoming',row(1));await settle();assert.equal(controller.banners.getSnapshot().senderName,'Sender Name');
});
test('own messages, read/deleted rows and duplicate IDs do not create extra banners',async()=>{
  const {socket}=setup();socket.emit('message:incoming',row(1,{senderId:'me'}));socket.emit('message:incoming',row(2,{isRead:true}));socket.emit('message:incoming',row(3,{deletedAt:new Date().toISOString()}));
  socket.emit('message:incoming',row(4));socket.emit('message:incoming',row(4));await settle();assert.equal(controller.banners.getSnapshot().count,1);
});
test('exact active conversation is suppressed; a navigation change dismisses matching visible and queued banners',async()=>{
  const {socket,scope}=setup();socket.emit('message:incoming',row(1));socket.emit('message:incoming',row(2,{conversationId:'next'}));await settle();
  controller.update({...scope,conversationId:'room'});assert.equal(controller.banners.getSnapshot().conversationId,'next');
  socket.emit('message:incoming',row(3));await settle();controller.banners.dismiss(controller.banners.getSnapshot().key);assert.equal(controller.banners.getSnapshot(),null);
});
test('disabled preferences, muted rooms, background and logged-out scopes suppress banners',async()=>{
  const {socket,scope}=setup({getRoom:async id=>room(id,{muted:true})});socket.emit('message:incoming',row(1));await settle();assert.equal(controller.banners.getSnapshot(),null);
  for(const change of [{enabled:false},{active:false},{accountId:''}]){controller.update({...scope,...change});socket.emit('message:incoming',row(Math.random()));await settle();assert.equal(controller.banners.getSnapshot(),null);}
});
test('metadata resolving after entering and leaving a conversation cannot show a stale banner',async()=>{
  const gate=deferred();const {socket,scope}=setup({getRoom:()=>gate.promise});socket.emit('message:incoming',row(1));await settle();
  controller.update({...scope,conversationId:'room'});controller.update(scope);gate.resolve(room());await settle();assert.equal(controller.banners.getSnapshot(),null);
});
test('background/foreground transition invalidates in-flight presentation, not persisted messages',async()=>{
  const gate=deferred();const {socket,scope}=setup({getRoom:()=>gate.promise});socket.emit('message:incoming',row(1));await settle();controller.update({...scope,active:false});controller.update(scope);gate.resolve(room());await settle();assert.equal(controller.banners.getSnapshot(),null);
});
test('account ABA changes invalidate old async work and reset banner identities',async()=>{
  const gate=deferred();const {socket,scope}=setup({getRoom:()=>gate.promise});socket.emit('message:incoming',row(1));await settle();controller.update({...scope,accountId:'another'});controller.update(scope);gate.resolve(room());await settle();assert.equal(controller.banners.getSnapshot(),null);
});
test('listener start/stop is idempotent and never connects or disconnects a socket',async()=>{
  const {socket}=setup();controller.start();assert.equal(socket.listeners.get('message:incoming').size,1);controller.stop();assert.equal(socket.listeners.size,0);controller.start();socket.emit('message:incoming',row(1));await settle();assert.ok(controller.banners.getSnapshot());
});
test('cold-start destination waits for both auth and navigation readiness without a delay timer',async()=>{
  const {scope,navigations}=setup();controller.update({...scope,accountId:'',ready:false});let consumed=0;controller.openConversation('target','me',()=>consumed++);await settle();assert.equal(navigations.length,0);
  controller.update({...scope,ready:false});await settle();assert.equal(navigations.length,0);controller.update(scope);await settle();assert.equal(navigations[0].conversationId,'target');assert.equal(consumed,1);
});
test('tap already viewing that exact conversation does not push a duplicate screen or fetch',async()=>{
  let reads=0;const {scope,navigations}=setup({getRoom:async id=>{reads++;return room(id);}});controller.update({...scope,conversationId:'room'});controller.openConversation('room','me');await settle();assert.equal(navigations.length,0);assert.equal(reads,0);
});
test('another-account push cannot navigate or expose conversation metadata',async()=>{
  let reads=0;const {navigations}=setup({getRoom:async()=>{reads++;return room();}});let consumed=0;controller.openConversation('room','other-account',()=>consumed++);await settle();assert.equal(reads,0);assert.equal(navigations.length,0);assert.equal(consumed,1);
});
test('deleted or removed-membership conversation is graceful, never a guessed private/group screen',async()=>{
  const {errors,navigations}=setup({getRoom:async()=>null});controller.openConversation('gone','me');await settle();assert.equal(navigations.length,0);assert.match(errors[0].message,/no longer available/);
});
test('tap failure retains the target for deliberate retry and does not spin requests',async()=>{
  let calls=0;const {errors,navigations}=setup({getRoom:async id=>{calls++;if(calls===1)throw Error('offline');return room(id);}});controller.openConversation('room','me');await settle();assert.equal(calls,1);assert.equal(navigations.length,0);errors[0].retry();await settle();assert.equal(navigations.length,1);
});
test('navigation changes during membership fetch avoid a duplicate exact-conversation screen',async()=>{
  const gate=deferred();const {scope,navigations}=setup({getRoom:()=>gate.promise});controller.openConversation('room','me');controller.update({...scope,conversationId:'room'});gate.resolve(room());await settle();assert.equal(navigations.length,0);
});
test('a newer tap wins while a prior membership lookup is in flight',async()=>{
  const gate=deferred();const {navigations}=setup({getRoom:async id=>id==='first'?gate.promise:room(id)});controller.openConversation('first','me');controller.openConversation('second','me');gate.resolve(room('first'));await settle();assert.deepEqual(navigations.map(x=>x.conversationId),['second']);
});
test('foreground resume after a tap lookup was paused safely retries pending navigation',async()=>{
  const gate=deferred();let calls=0;const {scope,navigations}=setup({getRoom:async id=>++calls===1?gate.promise:room(id)});controller.openConversation('room','me');controller.update({...scope,active:false});gate.resolve(room());await settle();assert.equal(navigations.length,0);controller.update(scope);await settle();assert.equal(navigations.length,1);
});
test('unmount during a membership lookup cannot navigate',async()=>{
  const gate=deferred();const {navigations}=setup({getRoom:()=>gate.promise});controller.openConversation('room','me');controller.stop();gate.resolve(room());await settle();assert.equal(navigations.length,0);
});
test('logout immediately clears presentation and prevents an old route/auth effect or tap reopening it',async()=>{
 const{socket,scope,navigations}=setup();socket.emit('message:incoming',row(1));await settle();controller.prepareLogout();controller.update(scope);socket.emit('message:incoming',row(2));controller.openConversation('room','me');await settle();assert.equal(controller.banners.getSnapshot(),null);assert.equal(navigations.length,0);
 controller.update({...scope,accountId:'',ready:false});controller.update(scope);socket.emit('message:incoming',row(3));await settle();assert.ok(controller.banners.getSnapshot());
});
test('ambiguous-account notification notice waits for authentication/navigation and contains no foreign content',async()=>{
 const{scope,errors}=setup();controller.update({...scope,accountId:'',ready:false});let consumed=0;controller.noticeWhenReady('Open Messages to view your current conversations.',()=>consumed++);await settle();assert.equal(errors.length,0);controller.update(scope);assert.equal(errors.length,1);assert.equal(consumed,1);assert.match(errors[0].message,/current conversations/);
});
