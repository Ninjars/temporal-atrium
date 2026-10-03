import test from 'node:test';
import assert from 'node:assert/strict';
import {createEncounter,applyCommand,nextEvents} from '../src/encounter.js';
const cmd=(s,type,payload={})=>applyCommand(s,{type,...payload});
function ready(type='pc') {
 let s=createEncounter(); s=cmd(s,'addActor',{name:'Mira',playerName:'Sam',actorType:type,initiative:20,zone:0});
 return cmd(s,'beginEncounter');
}
test('registration requires placement and removing accidental registrations unblocks setup',()=>{
 let s=cmd(createEncounter(),'register',{name:'Mira',playerName:'Sam',initiative:20});
 assert.throws(()=>cmd(s,'beginEncounter'),/place/i);
 const id=s.actors[0].id;
 s=cmd(s,'placeActor',{id,zone:6});
 s=cmd(s,'register',{name:'Mistake',playerName:'Sam',initiative:1});
 s=cmd(s,'removeActor',{id:s.actors[1].id});
 s=cmd(s,'beginEncounter'); assert.equal(s.actors[0].nextActivation,0);
 assert.equal(s.phase,'running');
});
test('late registration does not reseed existing actors and awaits placement',()=>{
 let s=ready(); const next=s.actors[0].nextActivation;
 s=cmd(s,'register',{name:'Late',playerName:'Lee',initiative:30});
 assert.equal(s.actors[0].nextActivation,next); assert.equal(s.actors[1].nextActivation,null);
 s=cmd(s,'placeActor',{id:s.actors[1].id,zone:6}); assert.equal(s.actors[1].nextActivation,3);
});
test('active movement uses final zone on completion and counts one PC turn',()=>{
 let s=ready(); s=cmd(s,'configureGreyMan',{enabled:true,partySize:4}); s=cmd(s,'beginNext');
 s=cmd(s,'moveActor',{id:s.actors[0].id,zone:6}); s=cmd(s,'finishTurn');
 assert.equal(s.actors[0].nextActivation,3); assert.equal(s.grey.count,1);
 assert.throws(()=>cmd(s,'finishTurn'));
});
test('removing an active character clears its turn without counting completion',()=>{
 let s=ready(); s=cmd(s,'configureGreyMan',{enabled:true,partySize:4}); s=cmd(s,'beginNext');
 s=cmd(s,'removeActor',{id:s.actors[0].id}); assert.equal(s.active,null); assert.equal(s.grey.count,0); assert.equal(s.grey.partySize,4);
 assert.deepEqual(nextEvents(s),[]);
});
test('movement and pillar slowing preserve equivalent progress',()=>{
 let s=ready(); s=cmd(s,'beginNext'); s=cmd(s,'finishTurn'); s.now=6;
 const moved=cmd(s,'moveActor',{id:s.actors[0].id,zone:-1});
 const slowed=cmd(s,'slowPillar',{zone:0});
 assert.equal(moved.actors[0].nextActivation,13); assert.equal(slowed.actors[0].nextActivation,13);
 assert.equal(s.actors[0].nextActivation,12);
});
test('ritual clock starts idle, delays from due time and resumes from now',()=>{
 let s=ready(); s.now=5; assert.equal(s.ritual.next,null);
 s=cmd(s,'ritualStart'); assert.equal(s.ritual.next,17);
 s=cmd(cmd(s,'ritualDelay'),'ritualDelay'); assert.equal(s.ritual.next,29);
 s=cmd(s,'ritualInterrupt'); assert.equal(s.ritual.next,null); assert.equal(s.ritual.status,'suspended');
 s.now=20; s=cmd(s,'ritualResume'); assert.equal(s.ritual.next,32);
 assert.throws(()=>cmd(s,'ritualStart')); assert.throws(()=>cmd(createEncounter(),'ritualStart'));
});
test('due unresolved ritual phase can be delayed or interrupted',()=>{
 let s=ready(); s=cmd(s,'removeActor',{id:s.actors[0].id}); s=cmd(s,'ritualStart'); s=cmd(s,'beginNext');
 assert.equal(s.active.kind,'ritual');
 const delayed=cmd(s,'ritualDelay'); assert.equal(delayed.active,null); assert.equal(delayed.ritual.next,18); assert.equal(delayed.ritual.progress,0);
 const interrupted=cmd(s,'ritualInterrupt'); assert.equal(interrupted.active,null); assert.equal(interrupted.ritual.next,null);
});
test('six ritual phases collapse outer pairs and complete',()=>{
 let s=ready(); s=cmd(s,'removeActor',{id:s.actors[0].id}); s=cmd(s,'ritualStart');
 for(let i=1;i<=6;i++) { s=cmd(s,'beginNext'); s=cmd(s,'resolvePhase'); assert.equal(s.ritual.progress,i); assert.equal(s.zones.filter(z=>z.collapsed).length,i*2); }
 assert.equal(s.ritual.status,'complete'); assert.equal(s.ritual.next,null); assert.equal(s.now,72);
 assert.throws(()=>cmd(s,'ritualResume'));
});
test('collapse blocks advancement until stranded characters are moved or removed',()=>{
 let s=ready(); s.actors[0].zone=6; s.actors[0].nextActivation=20; s=cmd(s,'ritualStart'); s=cmd(s,'beginNext'); s=cmd(s,'resolvePhase');
 assert.throws(()=>cmd(s,'beginNext'),/collapsed/i); assert.throws(()=>cmd(s,'addActor',{name:'Bad',actorType:'enemy',initiative:1,zone:6}));
 s=cmd(s,'moveActor',{id:s.actors[0].id,zone:0}); assert.doesNotThrow(()=>cmd(s,'beginNext'));
 s=cmd(s,'ritualInterrupt'); assert.equal(s.ritual.progress,1);
});
test('Grey Man triggers on repeated PC completions, ignores other actors and stays off-clock',()=>{
 let s=ready(); s=cmd(s,'configureGreyMan',{enabled:true,partySize:4});
 for(let i=0;i<4;i++){s=cmd(s,'beginNext'); s=cmd(s,'finishTurn');}
 assert.equal(s.grey.pending,true); s=cmd(s,'beginNext'); assert.equal(s.active.kind,'grey');
 const now=s.now; s=cmd(s,'finishTurn'); assert.equal(s.now,now); assert.equal(s.grey.count,0);
 let enemy=cmd(ready('enemy'),'configureGreyMan',{enabled:true,partySize:1}); enemy=cmd(cmd(enemy,'beginNext'),'finishTurn'); assert.equal(enemy.grey.pending,false);
});
test('equal-tick ritual precedes Grey Man and normal actors',()=>{
 let s=ready(); s.now=12; s.actors[0].nextActivation=12; s.ritual={status:'running',progress:0,next:12}; s.grey={enabled:true,partySize:1,count:0,pending:true};
 assert.deepEqual(nextEvents(s).map(e=>e.kind),['ritual','grey','actor']);
});
test('invalid actor fields and commands cannot mutate state',()=>{
 const s=createEncounter();
 for(const payload of [{name:'',initiative:1},{name:'A',initiative:Infinity},{name:'A',initiative:'2'},{name:'A'.repeat(81),initiative:2}]) assert.throws(()=>cmd(s,'register',{playerName:'B',...payload}));
 assert.throws(()=>cmd(s,'unknown')); assert.deepEqual(s,createEncounter());
});
