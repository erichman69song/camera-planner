import assert from 'node:assert/strict';
import test from 'node:test';
import { createSceneToolInterface } from '../public/planner/scene-tool-interface.mjs';
function fixture() {
  let snapshots=0;
  let state={project:{version:'4.1',cameras:[],actors:[],scene:{objects:[],lights:[],modifiers:[],lighting:{}},path:[],storyboard:{grid:'3x3',cells:[]},timeline:{duration:30,currentTime:0,playing:false,keyframes:[]}},snapshot(){snapshots++;}};
  return {bridge:{getState:()=>state,setState:update=>{state={...state,...(typeof update==='function'?update(state):update)};}},getState:()=>state,snapshots:()=>snapshots};
}
const box={name:'测试桌子',primitive:'box',position:{x:0,y:.4,z:0},size:{x:1.6,y:.8,z:.8}};
test('in-page tool interface and WebMCP execute the actual scene actions', async () => {
  const store=fixture(),host={},registered=[];let aborted=false;
  const tools=createSceneToolInterface({bridge:store.bridge,host,registry:{registerTool(tool,{signal}){registered.push(tool);signal.addEventListener('abort',()=>{aborted=true;});}}});
  assert.equal(host.cameraPlannerScene,tools.api);
  assert.equal(registered.length,6);
  assert.match(registered.find(t=>t.name==='scene_add_object').description,/applies immediately/);
  const add=registered.find(t=>t.name==='scene_add_object');
  const result=add.execute(box);
  assert.equal(result.changes.applied,true);
  const read=registered.find(t=>t.name==='scene_get_state').execute({});
  assert.equal(read.entities.length,1);assert.equal(read.entities[0].name,'测试桌子');
  assert.equal(store.snapshots(),1);
  assert.deepEqual(tools.api.execute('scene_finish',{summary:'已完成'}),{acknowledged:true,applied:false,summary:'已完成',assumptions:[]});
  assert.equal(store.snapshots(),1);
  assert.throws(()=>add.execute({...box,size:{x:-1,y:1,z:1}}),/有效/);
  assert.equal(store.getState().project.scene.objects.length,1);
  tools.dispose();assert.equal(host.cameraPlannerScene,undefined);assert.equal(aborted,true);
});
test('batch interface is atomic and rejects unknown actions without live mutation',()=>{
  const store=fixture(),tools=createSceneToolInterface({bridge:store.bridge,host:{}});
  assert.throws(()=>tools.api.batch([{name:'scene_add_object',arguments:box},{name:'run_code',arguments:{}}]),/未知/);
  assert.equal(store.getState().project.scene.objects.length,0);assert.equal(store.snapshots(),0);
  const result=tools.api.batch([{name:'scene_add_object',arguments:box},{name:'scene_add_object',arguments:{...box,name:'椅子'}}]);
  assert.equal(result.added.length,2);assert.equal(store.snapshots(),1);
});
test('unavailable or rejecting WebMCP leaves ordinary tool access usable',async()=>{
  const store=fixture(),tools=createSceneToolInterface({bridge:store.bridge,host:{},registry:{registerTool(){return Promise.reject(new Error('unsupported'));}}});
  await Promise.resolve();await Promise.resolve();assert.equal(tools.registrationErrors,6);
  assert.equal(tools.api.read({}).total,0);tools.dispose();
});
test('external tools cannot cancel an active manual transform even when the tool is invalid',()=>{
  const store=fixture();let cancelled=0;
  const tools=createSceneToolInterface({bridge:store.bridge,host:{},controller:{getTransformState:()=>({dragging:true}),cancelTransform:()=>cancelled++}});
  assert.throws(()=>tools.api.execute('scene_add_object',{}),/先完成当前三轴/);
  assert.throws(()=>tools.api.batch([{name:'scene_add_object',arguments:box}]),/先完成当前三轴/);
  assert.equal(cancelled,0);assert.equal(store.snapshots(),0);assert.equal(store.getState().project.scene.objects.length,0);
});
