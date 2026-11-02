const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');
const {mock}=require('../messaging/harness.cjs');const {id}=require('../activity/fixtures.cjs');
const sql=new DatabaseSync(':memory:'),secure=new Map();let writeFail=false,chain=Promise.resolve();
const db={execAsync:async q=>sql.exec(q),runAsync:async(q,...args)=>({changes:Number(sql.prepare(q).run(...args).changes)}),
 getFirstAsync:async(q,...args)=>sql.prepare(q).get(...args)??null,getAllAsync:async(q,...args)=>sql.prepare(q).all(...args),
 withExclusiveTransactionAsync:async work=>{const op=chain.then(async()=>{sql.exec('BEGIN');try{await work(db);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}});chain=op.catch(()=>{});return op;}};
mock('expo-sqlite',{openDatabaseAsync:async()=>db});mock('expo-secure-store',{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{if(writeFail)throw Error('secure storage failed');secure.set(k,v);},deleteItemAsync:async k=>{secure.delete(k);}});
const actions=require('../../src/services/notifications/ReplyActionStore.ts');
const A=id(1),B=id(2),D=id(3),O='https://api.test';
const record=(action=id(4),account=A)=>({actionId:action,recipientUserId:account,deviceId:D,notificationId:id(5),conversationId:id(6),messageId:id(7),content:'private text'});
test('persists encrypted payload before transport; concurrent identical callbacks share one pending record',async()=>{
 const r=record();await Promise.all([actions.persistReply(r,O),actions.persistReply(r,O)]);assert.deepEqual(await actions.pendingReplies(A,D,O),[r]);
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM reply_actions').all()).includes(r.content),false);
 assert.equal(secure.size,1);await assert.rejects(actions.persistReply({...r,content:'different'},O),/Conflicting/);
 await actions.finishReply(r,'sent');assert.deepEqual(await actions.pendingReplies(A,D,O),[]);assert.equal(secure.size,0);
 await actions.persistReply(r,O);assert.deepEqual(await actions.pendingReplies(A,D,O),[]);
});
test('secure storage failure rolls back the SQLite action and no pending request can be sent',async()=>{
 writeFail=true;await assert.rejects(actions.persistReply(record(id(11)),O));writeFail=false;assert.deepEqual(await actions.pendingReplies(A,D,O),[]);
});
test('account scoping, logout barrier and re-registration',async()=>{
 const r=record(id(12),B);await actions.persistReply(r,O);assert.deepEqual(await actions.pendingReplies(A,D,O),[]);assert.deepEqual(await actions.pendingReplies(B,id(99),O),[]);
 await actions.clearReplyAccount(B);assert.equal(await actions.replyAccountBlocked(B),true);await assert.rejects(actions.persistReply(r,O),/closed/);assert.deepEqual(await actions.pendingReplies(B,D,O),[]);
 await actions.unblockReplyAccount(B);await actions.persistReply(r,O);assert.deepEqual(await actions.pendingReplies(B,D,O),[r]);await actions.clearReplyAccount(B);
});
test('notification dedup is per account and cleared at logout',async()=>{
 const n=id(60);assert.equal(await actions.alreadyDisplayed(A,n),false);await actions.markDisplayed(A,n);assert.equal(await actions.alreadyDisplayed(A,n),true);assert.equal(await actions.alreadyDisplayed(B,n),false);
 await actions.clearReplyAccount(A);assert.equal(await actions.alreadyDisplayed(A,n),false);
});
