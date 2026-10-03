import test from 'node:test';
import assert from 'node:assert/strict';
import {createEncounter,applyCommand} from '../src/encounter.js';
import {forecast,publicRoster,playerView,dmView} from '../src/projection.js';
function fixture(){let s=createEncounter();for(const [name,initiative,zone] of [['Mira',20,6],['Torren',10,0]])s=applyCommand(s,{type:'addActor',name,initiative,zone,actorType:'pc',playerName:'Private player'});return applyCommand(s,{type:'beginEncounter'});}
test('chooser roster exposes only character names and IDs and omits removed PCs',()=>{
 let s=fixture();assert.deepEqual(Object.keys(publicRoster(s)[0]).sort(),['id','name']);
 s=applyCommand(s,{type:'removeActor',id:s.actors[0].id});assert.equal(publicRoster(s).length,1);
});
test('player boundary stops at personal activation even when actors share a tick',()=>{
 const s=fixture();s.actors[1].nextActivation=0;
 const p=playerView(s,s.actors[0].id);assert.equal(p.events.length,1);assert.equal(p.events[0].name,'Mira');
 const json=JSON.stringify(p);for(const secret of ['Private player','nextActivation','initiative','history','"at"','"now"'])assert.equal(json.includes(secret),false);
});
test('forecast repeats fast actors without changing state and stops at unresolved ritual',()=>{
 let s=fixture();s=applyCommand(s,{type:'ritualStart'});const before=structuredClone(s);
 const f=forecast(s,{horizon:48,maxEvents:100});assert.equal(f.events.at(-1).kind,'ritual');assert.equal(f.events.at(-1).at,12);
 assert.ok(f.events.filter(e=>e.name==='Mira').length>=4);assert.deepEqual(s,before);
});
test('no ritual still produces bounded forecasts and player horizon',()=>{
 const s=fixture();s.actors[1].nextActivation=48;
 const p=playerView(s,s.actors[1].id);assert.equal(p.events.length,5);assert.equal(p.events.at(-1).name,'Mira');
 assert.equal(forecast(s,{horizon:100,maxEvents:2}).truncated,true);
});
test('setup and removed player views cannot masquerade as a live character',()=>{
 const s=createEncounter();assert.equal(playerView(s,'missing').removed,true);
 const registered=applyCommand(s,{type:'register',name:'Mira',playerName:'Sam',initiative:20});
 const p=playerView(registered,registered.actors[0].id);assert.equal(p.waiting,true);assert.deepEqual(p.events,[]);
});
test('DM view includes history, ticks and placement details',()=>{
 const s=fixture(), p=dmView(s);assert.equal(p.now,0);assert.ok(p.history.length);assert.equal(p.actors[0].playerName,'Private player');assert.equal(p.events[0].at,0);
});
test('forecast completes active turn once and can project Grey Man',()=>{
 let s=fixture();s=applyCommand(s,{type:'configureGreyMan',enabled:true,partySize:1});s=applyCommand(s,{type:'beginNext'});
 const f=forecast(s,{horizon:12,maxEvents:30});assert.equal(f.events[0].kind,'grey');assert.equal(f.events[0].at,0);
});
