import test from 'node:test';
import assert from 'node:assert/strict';
import {findEntity,entityTransform,transformChanged,metadataSelection,constraintFromKey,playbackChanged} from '../public/planner/transform-state.mjs';
test('object kinds resolve to their own project collection, including shared ids',()=>{
  const project={cameras:[{id:'a',name:'camera'}],actors:[{id:'a',name:'actor'}],scene:{objects:[{id:'a',name:'object'}],lights:[{id:'a',name:'light'}],modifiers:[{id:'a',name:'modifier'}]},path:[{id:'a',name:'path'}]};
  for(const type of ['camera','actor','object','light','modifier','path'])assert.equal(findEntity(project,{type,id:'a'}).name,type);
  assert.equal(findEntity(project,{type:'unknown',id:'a'}),null);
});
test('transform snapshots are independent and detect rotations and scales',()=>{
  const original={position:{x:3,y:2,z:1},rotation:{yaw:45,pitch:0,roll:0}},a=entityTransform(original),b=entityTransform(original);
  assert.equal(transformChanged(a,b),false);b.position.x+=1e-9;assert.equal(transformChanged(a,b),false);
  b.rotation.roll=1;assert.equal(transformChanged(a,b),true);assert.equal(original.rotation.roll,0);
  b.rotation.roll=0;b.scale.z=1.2;assert.equal(transformChanged(a,b),true);
});
test('nested mesh picking climbs to ownership and ignores unowned helpers',()=>{
  const group={userData:{actorId:'actor-1'},parent:null};
  assert.deepEqual(metadataSelection({userData:{},parent:group}),{type:'actor',id:'actor-1'});
  assert.equal(metadataSelection({userData:{isTransformControls:true},parent:null}),null);
});
test('Blender axis and complementary-plane constraints remain distinct',()=>{
  assert.equal(constraintFromKey('x'),'X');assert.equal(constraintFromKey('x',true),'YZ');assert.equal(constraintFromKey('y',true),'XZ');assert.equal(constraintFromKey('z',true),'XY');assert.equal(constraintFromKey('q'),null);
});
test('same-time path, actor keys, and duration changes request animation resampling',()=>{
  const p={timeline:{duration:10,currentTime:3},path:[{id:'k',t:0,position:{x:0,y:0,z:0}}],actors:[{id:'actor',position:{x:0,y:0,z:0},keyframes:[]}]};
  assert.equal(playbackChanged(p,structuredClone(p)),false);
  const path=structuredClone(p);path.path[0].position.x=2;assert.equal(playbackChanged(p,path),true);
  const duration=structuredClone(p);duration.timeline.duration=20;assert.equal(playbackChanged(p,duration),true);
  const actor=structuredClone(p);actor.actors[0].keyframes.push({time:3,position:{x:2,y:0,z:0}});assert.equal(playbackChanged(p,actor),true);
  const base=structuredClone(p);base.actors[0].position.x=4;assert.equal(playbackChanged(p,base),false);
});
