import test from 'node:test';
import assert from 'node:assert/strict';
import { delayFor, reschedule, seedActors, compareEvents } from '../src/timing.js';

test('preserves remaining progress across repeated rate changes', () => {
  assert.equal(reschedule({now:23,next:26,oldDelay:6,newDelay:8}),27);
  assert.equal(reschedule({now:23,next:27,oldDelay:8,newDelay:12}),29);
  assert.equal(reschedule({now:24,next:27,oldDelay:8,newDelay:12}),28.5);
  assert.equal(reschedule({now:23,next:27,oldDelay:8,newDelay:6}),26);
});
test('clamps waits, never schedules retroactively, and leaves unchanged rates alone', () => {
  assert.equal(reschedule({now:10,next:9,oldDelay:6,newDelay:12}),10.01);
  assert.equal(reschedule({now:10,next:100,oldDelay:6,newDelay:12}),22);
  assert.equal(reschedule({now:10,next:10,oldDelay:6,newDelay:6}),10);
  for (const value of [0,-1,Infinity,NaN]) assert.throws(()=>reschedule({now:0,next:2,oldDelay:value,newDelay:12}));
});
test('zone delays produce the full approved speed range', () => {
  assert.deepEqual(Array.from({length:13},(_,i)=>delayFor(i-6)),[48,36,24,18,16,14,12,10,8,6,5,4,3]);
  assert.throws(()=>delayFor(7));
});
test('seeds initiative using initial zone and stable ties without mutating input', () => {
  const actors=[{id:'a',initiative:20,order:0,zone:0},{id:'b',initiative:10,order:1,zone:6}];
  const zones=Array.from({length:13},(_,i)=>({id:i-6,step:i-6}));
  assert.deepEqual(seedActors(actors,zones).map(a=>a.nextActivation),[0,1.5]);
  actors[1].zone=0;
  assert.deepEqual(seedActors(actors,zones).map(a=>a.nextActivation),[0,6]);
  assert.equal(actors[0].nextActivation,undefined);
  actors[1].initiative=20;
  assert.deepEqual(seedActors(actors.reverse(),zones).sort((a,b)=>a.order-b.order).map(a=>a.nextActivation),[0,6]);
});
test('event ties favour ritual then Grey Man then initiative and insertion order', () => {
  const events=[{kind:'actor',at:12,initiative:10,order:1},{kind:'grey',at:12},{kind:'ritual',at:12},{kind:'actor',at:12,initiative:20,order:0}];
  assert.deepEqual(events.sort(compareEvents).map(e=>e.kind),['ritual','grey','actor','actor']);
  assert.equal(events[2].initiative,20);
});
