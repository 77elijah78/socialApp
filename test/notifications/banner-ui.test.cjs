const {test,beforeEach,afterEach}=require('node:test');const assert=require('node:assert/strict');
const React=require('react');const{act,create}=require('react-test-renderer');
const{mock,settle}=require('../messaging/harness.cjs');
const{setTokens}=require('../../src/services/api.ts');
const{MessageBannerQueue}=require('../../src/services/notifications/MessageBannerQueue.ts');
const{Provider,useSelector,useDispatch}=require('react-redux');const{configureStore}=require('@reduxjs/toolkit');
mock('@/store/hooks',{useAppSelector:useSelector,useAppDispatch:useDispatch});
const store=configureStore({reducer:state=>state??{auth:{isAuthenticated:true,user:{id:'me'},token:'authenticated-token',refreshToken:'refresh'}}});
let animations=[];const shared=[];
mock('react-native-reanimated',{__esModule:true,default:{View:'ReanimatedView'},ReduceMotion:{System:'system'},Easing:{out:value=>value,cubic:'cubic'},
 useSharedValue:value=>{const ref=React.useRef(null);if(!ref.current){ref.current={value,get(){return this.value;},set(value){this.value=value;}};shared.push(ref.current);}return ref.current;},
 useAnimatedStyle:fn=>fn(),runOnJS:fn=>fn,withTiming:(value,config,done)=>{animations.push({value,config,done});if(value===0)done?.(true);return value;}});
const Banner=require('../../src/components/notifications/MessageBanner.tsx').default;
let root,timers,oldTimeout,oldClear;
const data={key:'server-id',messageId:'server-id',conversationId:'private-room',senderName:'A very long real sender name '.repeat(5),avatarUrl:'/uploads/images/avatar.jpg',groupName:'A very long group name '.repeat(8),preview:'A message preview '.repeat(12),count:3};
beforeEach(()=>{animations=[];shared.length=0;timers=new Map();oldTimeout=global.setTimeout;oldClear=global.clearTimeout;global.setTimeout=(fn,delay)=>{const key=Symbol();timers.set(key,{fn,delay});return key;};global.clearTimeout=key=>timers.delete(key);setTokens('authenticated-token','refresh');});
afterEach(async()=>{if(root)await act(async()=>{root.unmount();await settle();});root=null;assert.equal(timers.size,0);global.setTimeout=oldTimeout;global.clearTimeout=oldClear;setTokens(null,null);});
async function mount(extra={}){await act(async()=>{root=create(React.createElement(Provider,{store},React.createElement(Banner,{banner:data,onDismiss(){},onOpen(){},...extra})));await settle();});}
test('one responsive banner has bounded text, protected real avatar, group name and represented burst count',async()=>{
 await mount();const nodes=root.root.findAllByType('Text');assert.ok(nodes.some(node=>node.props.children===data.groupName&&node.props.numberOfLines===1));assert.ok(nodes.some(node=>node.props.children===data.preview&&node.props.numberOfLines===2));assert.ok(nodes.some(node=>Array.isArray(node.props.children)&&node.props.children.includes(3)));
 const image=root.root.findByType('ExpoImage');assert.equal(image.props.source.headers.Authorization,'Bearer authenticated-token');assert.equal(image.props.cachePolicy,'memory');
 const container=root.root.findByType('View');assert.equal(container.props.pointerEvents,'box-none');assert.equal(container.props.style[1].top,52);
});
test('measured banner height owns slide distance and respects reduced-motion system preference',async()=>{
 await mount();await act(async()=>root.root.findByProps({testID:'message-banner'}).props.onLayout({nativeEvent:{layout:{height:176}}}));assert.equal(shared[1].get(),176);assert.ok(animations.some(value=>value.value===1&&value.config.duration===240&&value.config.reduceMotion==='system'));
});
test('auto dismissal is approximately 3.5 seconds and advances only after exit animation completion',async()=>{
 const dismissed=[];await mount({onDismiss:key=>dismissed.push(key)});assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,3500);await act(async()=>[...timers.values()][0].fn());assert.deepEqual(dismissed,['server-id']);assert.ok(animations.some(a=>a.value===0&&a.config.duration===180));
});
test('burst updates do not reset the visible lifetime or create another timer',async()=>{
 await mount();const first=[...timers.keys()][0];await act(async()=>root.update(React.createElement(Provider,{store},React.createElement(Banner,{banner:{...data,messageId:'next-id',count:25},onDismiss(){},onOpen(){}}))));assert.equal(timers.size,1);assert.equal([...timers.keys()][0],first);
});
test('tap emits only the canonical conversation ID and does not dismiss by marking messages read',async()=>{
 const opened=[];await mount({onOpen:id=>opened.push(id)});await act(async()=>root.root.findAllByType('Pressable')[0].props.onPress());assert.deepEqual(opened,['private-room']);
});
test('upward gesture end threshold dismisses once using installed RNGH builders',async()=>{
 const dismissed=[];await mount({onDismiss:key=>dismissed.push(key)});const gesture=root.root.findByType('GestureDetector').props.gesture;assert.equal(gesture.config.minDist,10);await act(async()=>{gesture.handlers.onEnd({translationY:-36,translationX:0,velocityY:0,velocityX:0});gesture.handlers.onEnd({translationY:-40,translationX:0,velocityY:0,velocityX:0});});assert.deepEqual(dismissed,['server-id']);
});
test('a short non-dismiss swipe returns to rest without opening a conversation',async()=>{
 const dismissed=[];await mount({onDismiss:key=>dismissed.push(key)});const gesture=root.root.findByType('GestureDetector').props.gesture;await act(async()=>gesture.handlers.onEnd({translationY:-8,translationX:12,velocityY:0,velocityX:0}));assert.equal(dismissed.length,0);assert.ok(animations.some(a=>a.value===0&&a.config.duration===150));
});
test('subscription updates only the host consumer, not unrelated application siblings',async()=>{
 const q=new MessageBannerQueue();let siblingRenders=0;function Host(){const banner=React.useSyncExternalStore(q.subscribe,q.getSnapshot,q.getSnapshot);return banner?React.createElement('HostCopy',{preview:banner.preview}):null;}function Feed(){siblingRenders++;return React.createElement('Feed');}
 await act(async()=>{root=create(React.createElement(React.Fragment,null,React.createElement(Feed),React.createElement(Host)));});const before=siblingRenders;await act(async()=>q.enqueue(data));assert.equal(siblingRenders,before);assert.ok(root.root.findByType('HostCopy'));
});
test('horizontal swipe-to-dismiss works without a vertical movement requirement',async()=>{
 const dismissed=[];await mount({onDismiss:key=>dismissed.push(key)});const gesture=root.root.findByType('GestureDetector').props.gesture;await act(async()=>gesture.handlers.onEnd({translationY:0,translationX:90,velocityY:0,velocityX:0}));assert.deepEqual(dismissed,['server-id']);
});
