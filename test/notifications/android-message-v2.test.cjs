const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../messaging/harness.cjs');
const {id}=require('../activity/fixtures.cjs');
const {decodeAndroidMessagePushV2,decodeAndroidMessageTask}=require('../../src/services/notifications/AndroidMessagePushV2.ts');
const recipient=id(1),conversation=id(2);
const valid={contractVersion:2,notificationType:'MESSAGE',deliveryMode:'android-data-v2',notificationId:id(3),recipientUserId:recipient,deviceId:id(4),messageId:id(5),conversationId:conversation,conversationType:'private',senderId:id(6),groupKey:`socialapp:v2:${recipient}:${conversation}`,categoryIdentifier:'MESSAGE_REPLY_V2',display:{title:'New message',body:'You have a new message',channelId:'messages'}};
test('decodes only the data-only v2 contract and uses server-provided private display',()=>{
 assert.deepEqual(decodeAndroidMessagePushV2({...valid,untrusted:'ignored'}),valid);
 assert.equal(decodeAndroidMessagePushV2({...valid,conversationType:'group'}).conversationType,'group');
});
test('never renders legacy alert or invalid account/group/category/display as a data push',()=>{
 for(const patch of [{deliveryMode:'expo-alert'},{contractVersion:3},{recipientUserId:'bad'},{deviceId:'bad'},{senderId:recipient},{groupKey:`socialapp:v2:${id(9)}:${conversation}`},{categoryIdentifier:'other'},{display:{title:'secret',body:'text',channelId:'other'}},{display:{title:'x'.repeat(129),body:'text',channelId:'messages'}}])
  assert.equal(decodeAndroidMessagePushV2({...valid,...patch}),null);
});
test('SDK task envelope accepts only a null notification and valid body JSON',()=>{
 const task={notification:null,data:{dataString:JSON.stringify(valid)}};assert.deepEqual(decodeAndroidMessageTask(task),valid);
 for(const bad of [{...task,notification:{}},{data:task.data},{notification:null,data:{dataString:'{' }},{notification:null,data:{dataString:'x'.repeat(32769)}},{notification:null,data:{dataString:JSON.stringify({...valid,deliveryMode:'expo-alert'})}}])assert.equal(decodeAndroidMessageTask(bad),null);
});
