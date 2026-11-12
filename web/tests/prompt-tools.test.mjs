import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../public/planner/optics.mjs';
import { planMotion, replaceShotWords } from '../public/planner/prompt-tools.mjs';
const base={focal:50,distance:3,height:1.7,sensorW:36,aspect:16/9};
const r=solve(base);
test('dolly holds focal length while changing distance; invalid direction is rejected',()=>{
  const m=planMotion(r,{type:'push',duration:5,endDistance:1.5});
  assert.equal(m.samples[1].focalMm,50);assert.equal(m.samples[1].subjectDistanceM,1.5);
  assert.throws(()=>planMotion(r,{type:'push',endDistance:5}),/小于/);
});
test('zoom holds distance and dolly zoom preserves the focal-to-distance ratio',()=>{
  const z=planMotion(r,{type:'zoom',endFocal:85});assert.equal(z.samples[1].subjectDistanceM,3);
  const d=planMotion(r,{type:'dollyzoom',endDistance:6});assert.equal(d.samples[1].focalMm,100);
  assert.equal(d.samples[1].focalMm/d.samples[1].subjectDistanceM,50/3);
});
test('shot replacement removes every recognised label without damaging motion or ordinary words',()=>{
  const source='中景，人物走向窗边；镜头缓慢推进至特写。MS / ECU / music';
  const v=replaceShotWords(source,base);
  assert.equal(v.matches.length,4);assert.match(v.text,/人物走向窗边；镜头缓慢推进至/);
  assert.match(v.text,/music/);assert.doesNotMatch(v.text,/中景|特写|\bMS\b|\bECU\b/);
  assert.equal(v.matches[0].focalMm,50);assert.ok(v.matches[0].distanceM>v.matches[1].distanceM);
});
test('locking distance produces distinct focal lengths with identical subject distance',()=>{
  const v=replaceShotWords('全景 → 近景',base,{anchor:'distance'});
  assert.equal(v.matches.length,2);assert.equal(v.matches[0].distanceM,3);assert.equal(v.matches[1].distanceM,3);
  assert.ok(v.matches[0].focalMm<v.matches[1].focalMm);
});
test('projection terms are preserved while shot labels are converted',()=>{
  const v=replaceShotWords('180度全景视频。全景模型，中景；全景，人物站立。',base);
  assert.equal(v.matches.length,2);assert.match(v.text,/180度全景视频。全景模型/);
  assert.doesNotMatch(v.text,/中景|全景，人物/);
});
