const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
require('../messaging/harness.cjs');
const {id}=require('../activity/fixtures.cjs');
const {setTokens,ApiError}=require('../../src/services/api.ts');
const {NotificationReplyTransport}=require('../../src/services/notifications/NotificationReplyTransport.ts');
const original=global.fetch;
const record={actionId:id(1),recipientUserId:id(2),deviceId:id(3),notificationId:id(4),conversationId:id(5),messageId:id(6),content:'message'};
const dto={id:id(7),senderId:record.recipientUserId,conversationId:record.conversationId,repliedToId:record.messageId};
const response=(status,data)=>({ok:status>=200&&status<300,status,headers:new Headers(),json:async()=>data});
afterEach(()=>{global.fetch=original;setTokens(null,null);});
test('notification reply uses existing authenticated REST reply endpoint and checks acknowledgement',async()=>{
 setTokens('jwt',null);let captured;global.fetch=async(url,options)=>{captured={url,options};return response(201,{success:true,data:dto});};
 await new NotificationReplyTransport().send(record,'jwt');assert.equal(new URL(captured.url).pathname,`/api/v1/messages/conversations/${record.conversationId}/reply`);assert.equal(captured.options.headers.Authorization,'Bearer jwt');
 const body=JSON.parse(captured.options.body);assert.equal(body.notificationAction.actionId,record.actionId);assert.equal(body.repliedToId,record.messageId);assert.ok(!('receiverId' in body));
});
test('malformed success or wrong message identity is ambiguous and must not be acknowledged',async()=>{
 setTokens('jwt',null);for(const data of [null,{success:true,data:{...dto,id:'invalid'}},{success:true,data:{...dto,senderId:id(99)}},{success:true,data:{...dto,repliedToId:id(99)}}]){
 global.fetch=async()=>response(201,data);await assert.rejects(new NotificationReplyTransport().send(record,'jwt'),/acknowledgement/);}
});
test('server conflict remains an error and is never retried as an ordinary reply',async()=>{
 setTokens('jwt',null);let calls=0;global.fetch=async()=>{calls++;return response(409,{message:'Conflict'});};
 await assert.rejects(new NotificationReplyTransport().send(record,'jwt'),error=>error instanceof ApiError&&error.status===409);assert.equal(calls,1);
});
